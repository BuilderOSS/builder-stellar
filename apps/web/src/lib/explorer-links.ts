import type { DaoNetworkName } from '@/lib/dao-config';

function getExplorerBaseUrl(network: DaoNetworkName) {
  return `https://stellar.expert/explorer/${network === 'testnet' || network === 'local' ? 'testnet' : 'public'}`;
}

export function getExplorerLedgerUrl(network: DaoNetworkName, ledger: number) {
  return `${getExplorerBaseUrl(network)}/ledger/${ledger}`;
}

export function getExplorerTxUrl(network: DaoNetworkName, txHash: string) {
  return `${getExplorerBaseUrl(network)}/tx/${txHash}`;
}

export function getExplorerAccountUrl(network: DaoNetworkName, account: string) {
  return `${getExplorerBaseUrl(network)}/account/${account}`;
}

export function getExplorerContractUrl(network: DaoNetworkName, contractId: string) {
  return `${getExplorerBaseUrl(network)}/contract/${contractId}`;
}
