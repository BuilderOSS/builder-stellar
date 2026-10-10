import { css } from 'styled-system/css';

import { Address } from '@/components/ui';
import type { DaoNetworkConfig } from '@/lib/dao-config';

const contractFields = [
  ['Token', 'tokenContractId'],
  ['Governor', 'governorContractId'],
  ['Treasury', 'treasuryContractId'],
  ['Auction', 'auctionContractId'],
  ['Marketplace', 'marketplaceContractId'],
  ['Metadata', 'metadataContractId'],
  ['Minter', 'minterContractId']
] as const satisfies ReadonlyArray<[string, keyof DaoNetworkConfig]>;

const list = css({ display: 'grid', gap: '3' });

/** The community's contracts, for the curious and for verification. */
export function DaoContractList({ config, compact = false }: { config: DaoNetworkConfig; compact?: boolean }) {
  return (
    <div className={list}>
      {contractFields.map(([label, field]) => {
        const contractId = config[field];
        return typeof contractId === 'string' && contractId ? (
          <Address key={field} label={label} value={contractId} compact={compact} />
        ) : null;
      })}
    </div>
  );
}
