import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => [] as Array<{ fn: string; args: Record<string, unknown> }>);

vi.mock('@builder-stellar/manager-bindings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@builder-stellar/manager-bindings')>();
  // Record each call the actions make; the real spec below checks it encodes.
  class Client {
    constructor(_options: unknown) {
      return new Proxy(this, {
        get:
          (_target, fn: string) =>
          async (args: Record<string, unknown> = {}) => {
            calls.push({ fn, args });
            return { result: null };
          }
      });
    }
  }
  return { ...actual, Client };
});
vi.mock('@/lib/minter/direct', () => ({
  sendAndConfirm: vi.fn(async () => 'hash'),
  walletClientOptions: vi.fn(() => ({}))
}));

import {
  currentChanges,
  normalizeHash,
  platformActions,
  validateCurrent,
  validateRegistration,
  validateUpgradeDelay,
  validateUpgradePath
} from '@/lib/platform/actions';
import type { PlatformConfig } from '@/lib/platform/config';
import type { RegistryImplementation } from '@/lib/platform/registry';

const MANAGER = 'CCLBJAC5DM66J3TFQVZOZ3F4Q3TV4CZKBT5ZADRTE7BZPF3QAIEK72ZD';
const ADMIN = `G${'A'.repeat(55)}`;
const config: PlatformConfig = {
  name: 'testnet',
  rpcUrl: 'https://soroban-testnet.stellar.org',
  passphrase: 'Test SDF Network ; September 2015',
  managerAddress: MANAGER,
  launchAdmin: ''
};
const h = (c: string) => c.repeat(64);
const row = (name: string, version: string, hash: string, revoked = false): RegistryImplementation => ({
  name,
  version,
  hash,
  publishedLedger: 1,
  revoked,
  usedBy: 0,
  latest: false,
  current: null,
  running: false
});
const registered = [
  row('Token', '0.4.0', h('a')),
  row('Token', '0.5.0', h('b')),
  row('Token', '0.3.0', h('c'), true),
  row('Governor', '0.4.0', h('d')),
  row('Metadata', '0.4.0', h('e')),
  row('Treasury', '0.4.0', h('f')),
  row('Auction', '0.4.0', h('1')),
  row('Marketplace', '0.4.0', h('2')),
  row('ClaimMinter', '0.4.0', h('3'))
];

describe('validation', () => {
  it('registers a known name, a version and a well-formed new hash', () => {
    expect(
      validateRegistration({ name: 'Token', version: '0.6.0', hash: `0x${h('9').toUpperCase()}` }, registered)
    ).toEqual({});
    expect(validateRegistration({ name: 'Nope', version: '', hash: 'xyz' }, registered)).toEqual({
      name: 'Choose a module name.',
      version: 'Enter the version, for example 0.4.1.',
      hash: 'A code hash is 64 hexadecimal characters.'
    });
    expect(validateRegistration({ name: 'Token', version: '1', hash: h('a') }, registered).hash).toBe(
      'This hash is already registered.'
    );
    expect(normalizeHash(` 0x${h('A')} `)).toBe(h('a'));
  });

  it('approves only a change within one module to an active target', () => {
    expect(validateUpgradePath(registered[0], registered[1])).toBeNull();
    // A revoked source is allowed, so tribes can move off it.
    expect(validateUpgradePath(registered[2], registered[1])).toBeNull();
    expect(validateUpgradePath(registered[1], registered[2])).toBe('The target version is revoked.');
    expect(validateUpgradePath(registered[0], registered[3])).toBe('Both versions must be the same module.');
    expect(validateUpgradePath(registered[0], registered[0])).toBe('Choose two different versions.');
    expect(validateUpgradePath(undefined, registered[0])).toBe('Choose both versions.');
  });

  it('needs an active version of the right module for every slot', () => {
    const choice = {
      token: h('a'),
      metadata: h('e'),
      governor: h('d'),
      treasury: h('f'),
      auction: h('1'),
      marketplace: h('2'),
      claims: h('3')
    };
    expect(validateCurrent(choice, registered)).toEqual({});
    expect(validateCurrent({ ...choice, token: h('c'), governor: h('a'), claims: undefined }, registered)).toEqual({
      token: 'This version is revoked.',
      governor: 'Must be a Governor version.',
      claims: 'Choose a version.'
    });
    expect(currentChanges({ ...choice }, { ...choice, token: h('b') }, registered)).toEqual(['Token 0.4.0 → 0.5.0']);
  });

  it('bounds the upgrade notice', () => {
    expect(validateUpgradeDelay(120_960)).toBeNull();
    expect(validateUpgradeDelay(0)).not.toBeNull();
    expect(validateUpgradeDelay(1.5)).not.toBeNull();
    expect(validateUpgradeDelay(10_000_000)).toBe('At most a year.');
  });
});

describe('each Manager call encodes against the contract spec', () => {
  let spec: InstanceType<typeof import('@builder-stellar/manager-bindings').Client>['spec'];
  beforeEach(async () => {
    const { Client } = await vi.importActual<typeof import('@builder-stellar/manager-bindings')>(
      '@builder-stellar/manager-bindings'
    );
    spec = new Client({ contractId: MANAGER, rpcUrl: config.rpcUrl, networkPassphrase: config.passphrase }).spec;
    calls.length = 0;
  });

  it.each([
    [
      'register_implementation',
      () => platformActions.register(config, ADMIN, { name: 'Token', version: ' 0.6.0 ', hash: h('9') })
    ],
    ['set_latest_implementation', () => platformActions.setLatest(config, ADMIN, registered[1]!)],
    [
      'set_current_implementations',
      () =>
        platformActions.setCurrent(config, ADMIN, {
          token: h('a'),
          metadata: h('e'),
          governor: h('d'),
          treasury: h('f'),
          auction: h('1'),
          marketplace: h('2'),
          claims: h('3')
        })
    ],
    ['approve_upgrade', () => platformActions.approveUpgrade(config, ADMIN, h('a'), h('b'))],
    ['revoke_implementation', () => platformActions.revoke(config, ADMIN, registered[0]!)],
    ['pause_factory', () => platformActions.pauseFactory(config, ADMIN)],
    ['unpause_factory', () => platformActions.unpauseFactory(config, ADMIN)],
    ['set_upgrade_delay', () => platformActions.setUpgradeDelay(config, ADMIN, 120_960)]
  ])('%s', async (fn, act) => {
    await act();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.fn).toBe(fn);
    expect(spec.funcArgsToScVals(fn, calls[0]!.args)).toHaveLength(spec.getFunc(fn).inputs.length);
  });

  it('trims the version and decodes the hash to 32 bytes', async () => {
    await platformActions.register(config, ADMIN, { name: 'Token', version: ' 0.6.0 ', hash: `0x${h('9')}` });
    expect(calls[0]!.args).toMatchObject({ name: 'Token', version: '0.6.0' });
    expect((calls[0]!.args.wasm_hash as Uint8Array).length).toBe(32);
  });
});
