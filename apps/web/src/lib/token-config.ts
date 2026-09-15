import { getDeployment } from '@/config/deployments.generated';

function getTokenConfig() {
  const network = process.env.NEXT_PUBLIC_DAO_NETWORK || 'local';
  const label = process.env.NEXT_PUBLIC_DAO_LABEL || 'local';
  const deployment = getDeployment(network, label);

  return {
    name: deployment.config.token.name,
    symbol: deployment.config.token.symbol,
    description: deployment.config.token.description
  };
}

const config = getTokenConfig();

export const TOKEN_NAME = config.name;
export const TOKEN_SYMBOL = config.symbol;
export const TOKEN_DESCRIPTION = config.description;

export function getTokenDisplayName(tokenId: number) {
  return `${TOKEN_NAME} #${tokenId}`;
}
