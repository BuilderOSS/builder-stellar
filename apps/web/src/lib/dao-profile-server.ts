import { Client as MetadataClient } from '@builder-stellar/metadata-bindings';
import { Buffer } from 'buffer';

import { getNetworkConfig, type NetworkName } from '@/config/networks';
import { type DaoProfile, EMPTY_PROFILE, parseProfile, profileMatchesHash } from '@/lib/dao-profile';
import { cached } from '@/lib/server-cache';

/**
 * A profile as the app may show it (docs/STORAGE_DIET.md § 6).
 * - `verified`: the indexed string hashes to the chain's `profile_hash()`.
 * - `unavailable`: no indexed string yet, a mismatch, or the chain could not be
 *   read. Show "Profile unavailable right now", never the unverified text.
 */
export type ProfileView = {
  status: 'verified' | 'unavailable';
  profile: DaoProfile;
  /** The chain sequence number of the indexed profile, when indexed. */
  seq: number | null;
};

export type IndexedProfile = {
  metadataContract: string | null;
  profile: string | null;
  profileSeq: bigint | number | null;
};

const UNAVAILABLE = (seq: number | null): ProfileView => ({
  status: 'unavailable',
  profile: { ...EMPTY_PROFILE },
  seq
});

/** The chain's profile hash for a Metadata contract, cached 60 s per (contract, seq). */
async function chainProfileHash(network: NetworkName, metadataContract: string, seq: number): Promise<string> {
  return cached(`profile-hash:${metadataContract}:${seq}`, 60_000, async () => {
    const config = getNetworkConfig(network);
    const client = new MetadataClient({
      contractId: metadataContract,
      rpcUrl: config.rpcUrl,
      networkPassphrase: config.networkPassphrase,
      allowHttp: config.rpcUrl.startsWith('http://')
    });
    const response = await client.profile_hash();
    const result = response.result;
    if (!result || typeof result !== 'object' || !('value' in result) || !(result.value instanceof Uint8Array)) {
      throw new Error('profile_hash() returned no hash');
    }
    return Buffer.from(result.value).toString('hex');
  });
}

/** Verify one indexed profile against the chain. Never throws. */
export async function verifyProfile(network: NetworkName, indexed: IndexedProfile): Promise<ProfileView> {
  const seq = indexed.profileSeq === null || indexed.profileSeq === undefined ? null : Number(indexed.profileSeq);
  if (!indexed.metadataContract || indexed.profile === null || indexed.profile === undefined || seq === null) {
    return UNAVAILABLE(seq);
  }
  try {
    const hash = await chainProfileHash(network, indexed.metadataContract, seq);
    if (!(await profileMatchesHash(indexed.profile, hash))) return UNAVAILABLE(seq);
    return { status: 'verified', profile: parseProfile(indexed.profile), seq };
  } catch {
    return UNAVAILABLE(seq);
  }
}

/** Verify many profiles in parallel (each read is cached). */
export async function verifyProfiles<K>(
  network: NetworkName,
  entries: Array<{ key: K } & IndexedProfile>
): Promise<Map<K, ProfileView>> {
  const views = await Promise.all(entries.map((entry) => verifyProfile(network, entry)));
  return new Map(entries.map((entry, index) => [entry.key, views[index]!]));
}
