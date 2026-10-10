import type { NetworkName } from '@/config/networks';
import type { MarketplaceAccountReadiness } from '@/lib/marketplace/types';

export type TreasuryScope = {
  deploymentId: string;
  daoId: string;
  treasuryContractId: string;
  governorContractId: string;
};
export type TreasuryHistory = TreasuryScope & {
  page: number;
  hasMore: boolean;
  calls: Array<{
    eventId: string;
    proposalId: string;
    index: number;
    target: string;
    function: string;
    ledger: string;
    at: string | null;
    transactionHash: string;
  }>;
};
export type TreasuryReadiness = TreasuryScope & {
  address: string;
  network: NetworkName;
  assetCode: 'XLM' | 'USDC';
  assetContractId: string;
  account: MarketplaceAccountReadiness;
};
export type TreasuryPrepared = TreasuryReadiness & {
  amount: string;
  fee: string;
  xdr: string;
  networkPassphrase: string;
  rpcUrl: string;
};
