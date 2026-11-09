'use client';

import { Client as ManagerClient, type CurrentImplementations } from '@builder-stellar/manager-bindings';
import { xdr } from '@stellar/stellar-sdk';
import { Server } from '@stellar/stellar-sdk/rpc';
import { Buffer } from 'buffer';

import { LEDGERS_PER_DAY } from '@/lib/chain-reads/renewal';
import { sendAndConfirm, walletClientOptions } from '@/lib/minter/direct';
import { CURRENT_SLOTS, type CurrentSlot, IMPLEMENTATION_NAMES, type PlatformConfig } from '@/lib/platform/config';
import type { RegistryImplementation } from '@/lib/platform/registry';

const HASH_RE = /^[0-9a-f]{64}$/;

export function normalizeHash(value: string) {
  return value.trim().toLowerCase().replace(/^0x/, '');
}

/** The contract's limits for registry text (`common::MAX_STRING_LENGTH` is 256; names are short). */
const MAX_VERSION_LENGTH = 32;

export function validateRegistration(
  input: { name: string; version: string; hash: string },
  registered: RegistryImplementation[]
) {
  const errors: Partial<Record<'name' | 'version' | 'hash', string>> = {};
  if (!(IMPLEMENTATION_NAMES as readonly string[]).includes(input.name)) errors.name = 'Choose a module name.';
  const version = input.version.trim();
  if (!version) errors.version = 'Enter the version, for example 0.4.1.';
  else if (version.length > MAX_VERSION_LENGTH) errors.version = `At most ${MAX_VERSION_LENGTH} characters.`;
  const hash = normalizeHash(input.hash);
  if (!HASH_RE.test(hash)) errors.hash = 'A code hash is 64 hexadecimal characters.';
  else if (registered.some((row) => row.hash === hash)) errors.hash = 'This hash is already registered.';
  return errors;
}

/** An upgrade path the contract accepts: same name, both registered, the target not revoked, a real change. */
export function validateUpgradePath(from: RegistryImplementation | undefined, to: RegistryImplementation | undefined) {
  if (!from || !to) return 'Choose both versions.';
  if (from.hash === to.hash) return 'Choose two different versions.';
  if (from.name !== to.name) return 'Both versions must be the same module.';
  if (to.revoked) return 'The target version is revoked.';
  return null;
}

/** Every slot needs an active implementation registered under that slot's name. */
export function validateCurrent(choice: Partial<Record<CurrentSlot, string>>, registered: RegistryImplementation[]) {
  const errors: Partial<Record<CurrentSlot, string>> = {};
  for (const [slot, name] of Object.entries(CURRENT_SLOTS) as Array<[CurrentSlot, string]>) {
    const row = registered.find((r) => r.hash === choice[slot]);
    if (!row) errors[slot] = 'Choose a version.';
    else if (row.name !== name) errors[slot] = `Must be a ${name} version.`;
    else if (row.revoked) errors[slot] = 'This version is revoked.';
  }
  return errors;
}

/** Changes between what new tribes get now and the choice, for the review line. */
export function currentChanges(
  before: Partial<Record<CurrentSlot, string>> | null,
  after: Partial<Record<CurrentSlot, string>>,
  registered: RegistryImplementation[]
) {
  const version = (hash: string | undefined) =>
    registered.find((r) => r.hash === hash)?.version ?? (hash ? `${hash.slice(0, 8)}…` : 'none');
  return (Object.entries(CURRENT_SLOTS) as Array<[CurrentSlot, string]>)
    .filter(([slot]) => before?.[slot] !== after[slot])
    .map(([slot, name]) => `${name} ${version(before?.[slot])} → ${version(after[slot])}`);
}

/** The notice must be at least one ledger; more than a year is almost certainly a typo. */
export const MAX_UPGRADE_DELAY_LEDGERS = 365 * LEDGERS_PER_DAY;
export function validateUpgradeDelay(ledgers: number) {
  if (!Number.isInteger(ledgers) || ledgers < 1) return 'Enter a notice of at least a few seconds.';
  if (ledgers > MAX_UPGRADE_DELAY_LEDGERS) return 'At most a year.';
  return null;
}

/** Whether uploaded code exists for `hash`, and its size in bytes. */
export async function readUploadedCode(config: PlatformConfig, hash: string): Promise<{ bytes: number } | null> {
  const rpc = new Server(config.rpcUrl, { allowHttp: config.rpcUrl.startsWith('http://') });
  const key = xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash: Buffer.from(hash, 'hex') }));
  const response = await rpc.getLedgerEntries(key);
  const entry = response.entries[0];
  if (!entry) return null;
  return { bytes: entry.val.toXDR().length };
}

function manager(config: PlatformConfig, admin: string) {
  return new ManagerClient(walletClientOptions(config, admin, config.managerAddress));
}

const bytes = (hash: string) => Buffer.from(hash, 'hex');

/** Each call is simulated first (a contract error stops it before the wallet opens), then signed and confirmed. */
export const platformActions = {
  register: async (config: PlatformConfig, admin: string, input: { name: string; version: string; hash: string }) =>
    sendAndConfirm(
      await manager(config, admin).register_implementation({
        name: input.name,
        version: input.version.trim(),
        wasm_hash: bytes(normalizeHash(input.hash))
      }),
      config.rpcUrl
    ),
  setLatest: async (config: PlatformConfig, admin: string, row: RegistryImplementation) =>
    sendAndConfirm(
      await manager(config, admin).set_latest_implementation({ name: row.name, wasm_hash: bytes(row.hash) }),
      config.rpcUrl
    ),
  setCurrent: async (config: PlatformConfig, admin: string, choice: Record<CurrentSlot, string>) => {
    const current = Object.fromEntries(
      (Object.keys(CURRENT_SLOTS) as CurrentSlot[]).map((slot) => [slot, bytes(choice[slot])])
    ) as unknown as CurrentImplementations;
    return sendAndConfirm(await manager(config, admin).set_current_implementations({ current }), config.rpcUrl);
  },
  approveUpgrade: async (config: PlatformConfig, admin: string, from: string, to: string) =>
    sendAndConfirm(
      await manager(config, admin).approve_upgrade({ from_hash: bytes(from), to_hash: bytes(to) }),
      config.rpcUrl
    ),
  revoke: async (config: PlatformConfig, admin: string, row: RegistryImplementation) =>
    sendAndConfirm(await manager(config, admin).revoke_implementation({ wasm_hash: bytes(row.hash) }), config.rpcUrl),
  pauseFactory: async (config: PlatformConfig, admin: string) =>
    sendAndConfirm(await manager(config, admin).pause_factory(), config.rpcUrl),
  unpauseFactory: async (config: PlatformConfig, admin: string) =>
    sendAndConfirm(await manager(config, admin).unpause_factory(), config.rpcUrl),
  setUpgradeDelay: async (config: PlatformConfig, admin: string, ledgers: number) =>
    sendAndConfirm(await manager(config, admin).set_upgrade_delay({ ledgers }), config.rpcUrl)
};

/** Whether `approve_upgrade(from, to)` was already recorded. */
export async function isUpgradeApproved(config: PlatformConfig, from: string, to: string) {
  const client = new ManagerClient({
    contractId: config.managerAddress,
    rpcUrl: config.rpcUrl,
    networkPassphrase: config.passphrase,
    allowHttp: config.rpcUrl.startsWith('http://')
  });
  return (await client.is_upgrade_approved({ from_hash: bytes(from), to_hash: bytes(to) })).result;
}
