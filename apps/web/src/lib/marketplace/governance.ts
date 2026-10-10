import type { DaoNetworkConfig } from '@/lib/dao-config';
import { getAllActionHandlers } from '@/lib/proposal-actions/registry';
import type { ActionHandler } from '@/lib/proposal-actions/types';

export function marketplaceGovernanceContext(config: DaoNetworkConfig) {
  return {
    config,
    governorContractId: config.governorContractId,
    tokenContractId: config.tokenContractId,
    treasuryAddress: config.treasuryContractId,
    targetRole: 'marketplace' as const
  };
}

export function marketplaceSettingHandlers(config: DaoNetworkConfig) {
  const context = marketplaceGovernanceContext(config);
  return getAllActionHandlers().filter((handler) => {
    if (handler.type === 'create-primary-listing' || handler.type === 'cancel-primary-listing') return false;
    try {
      return (
        Boolean(config.marketplaceContractId) &&
        handler.buildCallVector(handler.getDefaultValues(), context).target === config.marketplaceContractId
      );
    } catch {
      return false;
    }
  });
}

export function marketplaceGovernanceAction(
  config: DaoNetworkConfig,
  address: string,
  handler: ActionHandler,
  draft: unknown
) {
  const context = { config, targetRole: 'marketplace' as const, session: { address, kit: null } };
  const validation = handler.validate(draft, context);
  if (!validation.valid) throw new Error(validation.message);
  const call = handler.buildCallVector(draft, marketplaceGovernanceContext(config));
  if (!config.marketplaceContractId || call.target !== config.marketplaceContractId) {
    throw new Error('This governance action does not target this marketplace.');
  }
  return { call, action: { ...handler.serialize(draft, context), targetRole: 'marketplace' as const } };
}
