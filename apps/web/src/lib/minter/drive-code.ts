'use client';

/**
 * The code that holds a launch drive's payments: the hash the tribe's ClaimMinter runs, as the network
 * reports it, and what the platform registry says about it. `manager.open_assurance` opens a drive only
 * on the ClaimMinter code `create_dao` deploys now, or on the hash announced as the latest ClaimMinter a
 * notice ago, and the drive then freezes it until launch (docs/SECURITY_MODEL.md, "Assurance launch").
 * Members see it before they pay.
 */
import { Client as ManagerClient } from '@builder-stellar/manager-bindings';
import { Server } from '@stellar/stellar-sdk/rpc';
import { Buffer } from 'buffer';
import useSWR from 'swr';

import { adminReadOptions } from '@/lib/admin-surfaces';
import { instanceKey, instanceWasmHash, rpcLedgerRead } from '@/lib/chain-reads/renewal';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { getDeploymentConfig } from '@/lib/deployment-config';

/** The ClaimMinter's registry name (`register_implementation`). */
export const CLAIM_MINTER_NAME = 'ClaimMinter';

export type DriveCodeStanding =
  /** The ClaimMinter code `create_dao` deploys now. */
  | 'current'
  /** The hash announced as the latest ClaimMinter. */
  | 'latest'
  /** Registered, but neither of those. */
  | 'other'
  /** Revoked in the registry. */
  | 'revoked'
  /** Not in the registry at all. */
  | 'unregistered';

export type DriveCode = {
  /** Hex of the code hash the network says the ClaimMinter runs. */
  hash: string;
  /** Release version the registry records for it; null when it is not registered. */
  version: string | null;
  standing: DriveCodeStanding;
};

export type DriveCodeRead = {
  hash: string | null;
  record: { name: string; version: string; revoked: boolean } | null;
  currentClaims: string | null;
  latestClaims: string | null;
};

/** What the reads say about the drive's code; null when the running hash could not be read. */
export function describeDriveCode(read: DriveCodeRead): DriveCode | null {
  if (!read.hash) return null;
  const record = read.record?.name === CLAIM_MINTER_NAME ? read.record : null;
  const standing: DriveCodeStanding = !read.record
    ? 'unregistered'
    : read.record.revoked
      ? 'revoked'
      : record && read.currentClaims === read.hash
        ? 'current'
        : record && read.latestClaims === read.hash
          ? 'latest'
          : 'other';
  return { hash: read.hash, version: read.record?.version ?? null, standing };
}

/** One sentence on the code holding the payments, for the drive panel and the payment review. */
export function driveCodeText(code: DriveCode | null | undefined, failed: boolean): string {
  if (!code) {
    return failed
      ? "The app couldn't read which code holds the payments. Check the claims module's code hash before you pay."
      : 'Checking which code holds the payments.';
  }
  const release = code.version ? `ClaimMinter ${code.version}` : 'The claims module';
  switch (code.standing) {
    case 'current':
      return `Payments are held by ${release}, the claims code the platform deploys now.`;
    case 'latest':
      return `Payments are held by ${release}, the claims code the platform announced as its latest release.`;
    case 'other':
      return `Payments are held by ${release}, which is not the claims code the platform deploys now.`;
    case 'revoked':
      return `Payments are held by ${release}, which the platform has since revoked.`;
    case 'unregistered':
      return 'Payments are held by code that is not in the platform registry.';
  }
}

export async function loadDriveCode(
  config: Pick<DaoNetworkConfig, 'rpcUrl' | 'passphrase' | 'launchAdmin'>,
  claimsContractId: string
): Promise<DriveCode | null> {
  const managerAddress = getDeploymentConfig().managerAddress;
  const manager = new ManagerClient(adminReadOptions(config, managerAddress));
  const server = new Server(config.rpcUrl, { allowHttp: config.rpcUrl.startsWith('http://') });
  // The host's record of the instance, not the contract's own `wasm_hash()`, which other code could fake.
  const entries = await rpcLedgerRead(server)([instanceKey(claimsContractId)]);
  const entry = entries.entries.get(instanceKey(claimsContractId).toXDR('base64'));
  const hash = entry && entry.val.type === 'contractData' ? instanceWasmHash(entry.val.contractData.val) : null;
  if (!hash) return null;
  const [record, current, latest] = await Promise.all([
    manager.get_implementation({ wasm_hash: Buffer.from(hash, 'hex') }),
    manager.current_implementations(),
    manager.latest_pointer({ name: CLAIM_MINTER_NAME })
  ]);
  const hex = (bytes: Uint8Array | Buffer | undefined) => (bytes ? Buffer.from(bytes).toString('hex') : null);
  return describeDriveCode({
    hash,
    record: record.result ?? null,
    currentClaims: hex(current.result?.claims),
    latestClaims: hex(latest.result?.wasm_hash)
  });
}

/** The code a drive's ClaimMinter runs; disabled when there is no ClaimMinter or no open drive. */
export function useDriveCode(
  config: Pick<DaoNetworkConfig, 'rpcUrl' | 'passphrase' | 'launchAdmin'>,
  claimsContractId: string | null | undefined,
  enabled = true
) {
  return useSWR(
    enabled && claimsContractId ? (['drive-code', claimsContractId, config.rpcUrl] as const) : null,
    ([, contractId]) => loadDriveCode(config, contractId),
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  );
}
