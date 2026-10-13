import type { Client as TokenClient } from '@builder-stellar/token-bindings';
import { StrKey } from '@stellar/stellar-sdk';

type HolderRead = { readonly simulationData: unknown; readonly result: unknown };

/** result alone can return SDK Err despite a fulfilled invocation promise. */
export function readHolderValue<T>(tx: HolderRead, decode: (value: unknown) => T): T {
  // Access the SDK success/restore/error gate BEFORE its error-normalizing result getter.
  if (!tx.simulationData) throw new Error('No successful token read simulation is available.');
  return decode(tx.result);
}

export function validHolderAddress(value: unknown): string | null {
  return typeof value === 'string' && (StrKey.isValidEd25519PublicKey(value) || StrKey.isValidContract(value))
    ? value
    : null;
}

export function requireHolderAddress(value: unknown): string {
  const address = validHolderAddress(value);
  if (!address) throw new Error('The token contract did not return a valid Stellar address.');
  return address;
}

export async function currentTokenHolder(client: Pick<TokenClient, 'owner_of'>, tokenId: number): Promise<string> {
  return readHolderValue(await client.owner_of({ token_id: tokenId }), requireHolderAddress);
}

export function holderBalance(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 0xffffffff)
    throw new Error('The token contract did not return a valid token balance.');
  return value;
}

export type HolderSettings = { transfers_locked: boolean; members_only_delegation: boolean; dao_recovery: boolean };

/** The Token's membership switches (`settings()`); every field must be a boolean. */
export function holderSettings(value: unknown): HolderSettings {
  const item = value as Partial<HolderSettings> | null;
  if (
    !item ||
    typeof item.transfers_locked !== 'boolean' ||
    typeof item.members_only_delegation !== 'boolean' ||
    typeof item.dao_recovery !== 'boolean'
  )
    throw new Error('The token contract did not return valid membership settings.');
  return item as HolderSettings;
}

export function holderVotes(value: unknown): bigint {
  if (typeof value !== 'bigint' || value < 0n || value >= 1n << 128n)
    throw new Error('The token contract did not return valid voting power.');
  return value;
}

export function holderDelegate(value: unknown): string | null {
  return value === null ? null : requireHolderAddress(value);
}
