import { Client as MetadataClient } from '@builder-stellar/metadata-bindings';
import useSWR from 'swr';

import type { DaoNetworkConfig } from '@/lib/dao-config';
import { waitForConfirmation } from '@/lib/transaction-confirmation';
import { type ArtworkBumpWindow, expectedNextStart } from '@/lib/ttl-expiry';
import { DAO_MODULES, type DaoModuleAddresses, readDaoTtlReport } from '@/lib/ttl-expiry-rpc';
import { signWithWallet } from '@/lib/wallet-sign';

export function moduleAddressesFromConfig(config: DaoNetworkConfig): DaoModuleAddresses {
  return {
    token: config.tokenContractId,
    metadata: config.metadataContractId,
    auction: config.auctionContractId,
    governor: config.governorContractId,
    treasury: config.treasuryContractId,
    marketplace: config.marketplaceContractId
  };
}

type DaoTtlKey = readonly ['dao-ttl-expiry', string, string];

async function fetchDaoTtlReport([, rpcUrl, addressesJson]: DaoTtlKey) {
  return readDaoTtlReport(rpcUrl, JSON.parse(addressesJson) as DaoModuleAddresses);
}

/**
 * Live TTL state of the DAO's shared code and artwork. Read-only; the report is not
 * refreshed on an interval, so call `mutate()` after a renewal.
 */
export function useDaoTtlReport(config: DaoNetworkConfig) {
  const addresses = moduleAddressesFromConfig(config);
  const hasAnyAddress = DAO_MODULES.some((name) => Boolean(addresses[name]));
  const key: DaoTtlKey | null = hasAnyAddress ? ['dao-ttl-expiry', config.rpcUrl, JSON.stringify(addresses)] : null;

  return useSWR(key, fetchDaoTtlReport, { keepPreviousData: true, revalidateOnFocus: false });
}

/**
 * Send one `bump_artwork_ttl` window signed by the connected wallet and wait for it to confirm.
 *
 * The simulated return value is checked against the expected next start before anything is
 * signed, so a change to the artwork size since the last read aborts instead of renewing the
 * wrong range. `restore: true` lets the SDK restore archived artwork entries first (one more
 * wallet signature), which covers the "expired" case.
 */
export async function sendArtworkBumpWindow(
  config: DaoNetworkConfig,
  publicKey: string,
  window: ArtworkBumpWindow,
  totalEntries: number,
  onSubmitted?: (hash: string) => void
): Promise<string> {
  if (!config.metadataContractId) {
    throw new Error('Missing metadata contract id in the active network config.');
  }

  const expectedNext = expectedNextStart(window, totalEntries);
  const client = new MetadataClient({
    contractId: config.metadataContractId,
    rpcUrl: config.rpcUrl,
    networkPassphrase: config.passphrase,
    publicKey,
    signTransaction: async (xdr: string, opts?: { networkPassphrase?: string; address?: string }) =>
      signWithWallet(xdr, {
        networkPassphrase: opts?.networkPassphrase ?? config.passphrase,
        address: opts?.address ?? publicKey
      })
  });

  const assembled = await client.bump_artwork_ttl({ start: window.start, limit: window.limit }, { restore: true });
  const nextStart = assembled.result.unwrap();
  if (nextStart !== expectedNext) {
    throw new Error(
      `Artwork renewal stopped: the contract would return next start ${nextStart}, expected ${expectedNext}. Reload and try again.`
    );
  }

  const sent = await assembled.signAndSend();
  const hash = sent.sendTransactionResponse?.hash;
  if (!hash) {
    throw new Error('No transaction hash returned from bump_artwork_ttl');
  }

  onSubmitted?.(hash);
  await waitForConfirmation(hash, config.rpcUrl);
  return hash;
}
