import { ShortId, Text } from '@/components/ui';
import type { DaoNetworkConfig } from '@/lib/dao-config';

const contractFields = [
  ['Token', 'tokenContractId'],
  ['Governor', 'governorContractId'],
  ['Treasury', 'treasuryContractId'],
  ['Auction', 'auctionContractId'],
  ['Metadata', 'metadataContractId']
] as const satisfies ReadonlyArray<[string, keyof DaoNetworkConfig]>;

export function DaoContractList({
  config,
  className = 'dao-contract-list',
  compact = false
}: {
  config: DaoNetworkConfig;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={`${className}${compact ? ' dao-contract-list--compact' : ''}`}>
      {contractFields.map(([label, field]) => {
        const contractId = config[field];

        return contractId ? (
          <div className="dao-contract-list__row" key={field}>
            <ShortId label={label} value={contractId} compact={compact} />
          </div>
        ) : (
          <div className="dao-contract-list__row" key={field}>
            <Text className="dao-contract-list__missing">{label}: Missing</Text>
          </div>
        );
      })}
    </div>
  );
}
