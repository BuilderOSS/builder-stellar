import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// Components compile with the classic JSX runtime under vitest.
vi.stubGlobal('React', React);
vi.mock('@/lib/transaction-feedback', () => ({
  useTransactionFeedback: () => ({ start: vi.fn(), success: vi.fn(), fail: vi.fn() })
}));

import type { PlatformConfig } from '@/lib/platform/config';
import type { PlatformState } from '@/lib/platform/registry';

import { PlatformFactory } from './platform-factory';
import { PlatformRegistry } from './platform-registry';
import { PlatformRegistryAdmin } from './platform-registry-admin';

const ADMIN = `G${'A'.repeat(55)}`;
const config: PlatformConfig = {
  name: 'testnet',
  rpcUrl: 'https://soroban-testnet.stellar.org',
  passphrase: 'Test SDF Network ; September 2015',
  managerAddress: `C${'M'.repeat(55)}`,
  launchAdmin: ''
};
const state: PlatformState = {
  latestLedger: 1000,
  managerAddress: config.managerAddress,
  admin: ADMIN,
  pendingAdmin: null,
  managerHash: 'a'.repeat(64),
  managerVersion: '0.4.0',
  factoryPaused: false,
  upgradeDelay: 720,
  pendingDelay: null,
  current: null,
  latest: {},
  implementations: [
    {
      name: 'Token',
      version: '0.4.0',
      hash: 'b'.repeat(64),
      publishedLedger: 1,
      revoked: false,
      usedBy: 2,
      latest: true,
      current: 'token',
      running: false
    }
  ],
  runningHashes: [],
  errors: []
};
const noop = async () => undefined;

describe('platform page access', () => {
  it('shows data and no actions to anyone who is not the admin', () => {
    const html = renderToStaticMarkup(
      <>
        <PlatformRegistry state={state} />
        <PlatformFactory config={config} state={state} admin={null} networkReady onChanged={noop} />
      </>
    );
    expect(html).toContain('0.4.0');
    expect(html).toContain('New tribes get this');
    expect(html).toContain('1h');
    expect(html).not.toContain('Pause new tribes');
    expect(html).not.toContain('Set notice');
    expect(html).not.toContain('Register');
    expect(html).not.toContain('Actions for');
  });

  it('gives the admin the registry and factory actions', () => {
    const html = renderToStaticMarkup(
      <>
        <PlatformRegistryAdmin config={config} state={state} admin={ADMIN} networkReady onChanged={noop} />
        <PlatformFactory config={config} state={state} admin={ADMIN} networkReady onChanged={noop} />
      </>
    );
    expect(html).toContain('Register');
    expect(html).toContain('New tribes get…');
    expect(html).toContain('Actions for Token 0.4.0');
    expect(html).toContain('Pause new tribes');
    expect(html).toContain('Change the upgrade notice');
  });

  it('offers Resume, not Pause, while the factory is paused', () => {
    const html = renderToStaticMarkup(
      <PlatformFactory
        config={config}
        state={{ ...state, factoryPaused: true }}
        admin={ADMIN}
        networkReady
        onChanged={noop}
      />
    );
    expect(html).toContain('Resume new tribes');
    expect(html).not.toContain('Pause new tribes');
  });
});
