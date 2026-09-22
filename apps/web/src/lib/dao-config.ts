import { DEPLOYMENTS, type DeploymentNetwork, getDeployment } from '@/config/deployments.generated';

export type DaoNetworkName = DeploymentNetwork;

export type DaoNetworkConfig = {
  name: DaoNetworkName;
  label: string;
  rpcUrl: string;
  passphrase: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDescription: string;
  adminAddress: string;
  tokenContractId: string;
  metadataContractId: string;
  governorContractId: string;
  treasuryContractId: string;
  auctionContractId: string;
};

export function getDefaultDaoNetwork(): DaoNetworkName {
  const network = process.env.NEXT_PUBLIC_DAO_NETWORK || 'local';
  const label = process.env.NEXT_PUBLIC_DAO_LABEL || 'local';

  // This will throw if deployment not found - fail fast
  const deployment = getDeployment(network, label);
  return deployment.network as DaoNetworkName;
}

export function getDaoNetworkConfig(_name: DaoNetworkName): DaoNetworkConfig {
  const network = process.env.NEXT_PUBLIC_DAO_NETWORK || 'local';
  const label = process.env.NEXT_PUBLIC_DAO_LABEL || 'local';
  const deployment = getDeployment(network, label);

  return {
    name: deployment.network as DaoNetworkName,
    label: deployment.label,
    rpcUrl: deployment.config.rpcUrl,
    passphrase: deployment.config.networkPassphrase,
    tokenName: deployment.config.token.name,
    tokenSymbol: deployment.config.token.symbol,
    tokenDescription: deployment.config.token.description,
    adminAddress: deployment.config.adminAddress,
    tokenContractId: deployment.contracts.token,
    metadataContractId: deployment.contracts.metadata ?? '',
    governorContractId: deployment.contracts.governor,
    treasuryContractId: deployment.contracts.treasury,
    auctionContractId: deployment.contracts.auction
  };
}

export function getDaoNetworkConfigById(daoId: string): DaoNetworkConfig {
  const [network, label] = daoId.includes('/') ? daoId.split('/', 2) : [undefined, daoId];
  const deployment = DEPLOYMENTS.find(
    (candidate) => candidate.label === label && (!network || candidate.network === network)
  );
  if (!deployment) {
    throw new Error(`No deployment found for daoId="${daoId}"`);
  }

  return {
    name: deployment.network as DaoNetworkName,
    label: deployment.label,
    rpcUrl: deployment.config.rpcUrl,
    passphrase: deployment.config.networkPassphrase,
    tokenName: deployment.config.token.name,
    tokenSymbol: deployment.config.token.symbol,
    tokenDescription: deployment.config.token.description,
    adminAddress: deployment.config.adminAddress,
    tokenContractId: deployment.contracts.token,
    metadataContractId: deployment.contracts.metadata ?? '',
    governorContractId: deployment.contracts.governor,
    treasuryContractId: deployment.contracts.treasury,
    auctionContractId: deployment.contracts.auction
  };
}
