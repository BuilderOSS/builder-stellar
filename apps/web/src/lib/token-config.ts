/**
 * Token Configuration
 *
 * Note: In multi-tenant architecture, token metadata comes from the DAO context.
 * These defaults are used only as fallbacks during initial page load.
 * Always use daoConfig from DaoContext for actual token information.
 */

export const TOKEN_NAME = 'Token';
export const TOKEN_SYMBOL = 'TKN';
export const TOKEN_DESCRIPTION = 'Decentralized Autonomous Organization Token';

export function getTokenDisplayName(tokenId: number) {
  return `Token #${tokenId}`;
}
