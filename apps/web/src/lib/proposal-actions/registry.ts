// src/lib/proposal-actions/registry.ts

import { batchMintGovernanceTokenHandler } from './actions/batch-mint-governance-token';
import { mintGovernanceTokenHandler } from './actions/mint-governance-token';
import { transferSacTokenHandler } from './actions/transfer-sac-token';
import {
  cancelAuctionHandler,
  cancelPrimaryListingHandler,
  createPrimaryListingHandler,
  pauseAuctionHandler,
  pauseMarketplaceHandler,
  setAuctionDurationHandler,
  setAuctionMinBidIncrementHandler,
  setAuctionPaymentTokenHandler,
  setAuctionReservePriceHandler,
  setAuctionTimeBufferHandler,
  setMarketplacePaymentTokenHandler,
  setMarketplaceSecondaryFeeHandler,
  setMintAuthorityHandler,
  setProposalThresholdHandler,
  setQueueDelayHandler,
  setQuorumBpsHandler,
  setVotingDelayHandler,
  setVotingPeriodHandler,
  unpauseAuctionHandler,
  unpauseMarketplaceHandler
} from './admin-actions';
import {
  addArtworkPropertiesHandler,
  type ArtworkPropertiesDraft,
  artworkSettingHandlers
} from './artwork-admin-actions';
import { minterAllocationHandlers } from './minter-actions';
import { moduleUpgradeHandler } from './module-upgrade-actions';
import { reviewFixHandlers } from './review-fix-actions';
import type { ActionHandler, ProposalActionType } from './types';

// The shared artwork helper can build destructive resets too. Only append is
// registered, with an exact literal type so resets never enter composer options.
const registeredArtworkPropertiesHandler: ActionHandler<ArtworkPropertiesDraft> = {
  ...addArtworkPropertiesHandler,
  type: 'add-artwork-properties',
  serialize: (data) => ({ ...addArtworkPropertiesHandler.serialize(data), type: 'add-artwork-properties' })
};

// Every module, Metadata included, exposes admin(); upgrades share one handler.
const registeredModuleUpgradeHandler: ActionHandler = moduleUpgradeHandler;

/**
 * Explicit registry - all actions registered in one place
 * NO side effects, NO implicit registration
 */
const REGISTERED_HANDLERS: ActionHandler[] = [
  mintGovernanceTokenHandler,
  batchMintGovernanceTokenHandler,
  transferSacTokenHandler,
  setMintAuthorityHandler,
  setVotingDelayHandler,
  setVotingPeriodHandler,
  setProposalThresholdHandler,
  setQuorumBpsHandler,
  setQueueDelayHandler,
  pauseAuctionHandler,
  unpauseAuctionHandler,
  setAuctionReservePriceHandler,
  setAuctionPaymentTokenHandler,
  setAuctionDurationHandler,
  setAuctionTimeBufferHandler,
  setAuctionMinBidIncrementHandler,
  cancelAuctionHandler,
  setMarketplacePaymentTokenHandler,
  setMarketplaceSecondaryFeeHandler,
  pauseMarketplaceHandler,
  unpauseMarketplaceHandler,
  createPrimaryListingHandler,
  cancelPrimaryListingHandler,
  registeredArtworkPropertiesHandler,
  ...artworkSettingHandlers,
  ...minterAllocationHandlers,
  registeredModuleUpgradeHandler,
  ...reviewFixHandlers
];

const ACTION_REGISTRY = new Map<ProposalActionType, ActionHandler>(
  REGISTERED_HANDLERS.map((handler) => [handler.type, handler])
);

/** True if the action type has a registered handler. */
export function isRegisteredActionType(type: string): boolean {
  return ACTION_REGISTRY.has(type as ProposalActionType);
}

/**
 * Get handler for a specific action type
 * @throws Error if action type not registered
 */
export function getActionHandler(type: ProposalActionType): ActionHandler {
  const handler = ACTION_REGISTRY.get(type);
  if (!handler) {
    throw new Error(`Unknown action type: ${type}. Did you forget to register it?`);
  }
  return handler;
}

/**
 * Get all registered action types, sorted by order and label
 */
export function getAllActionHandlers(): ActionHandler[] {
  return Array.from(ACTION_REGISTRY.values()).sort((a, b) => {
    // Sort by order first, then by label
    const orderDiff = (a.order || 0) - (b.order || 0);
    if (orderDiff !== 0) return orderDiff;
    return a.label.localeCompare(b.label);
  });
}

/**
 * Get action types grouped by category
 */
export function getActionHandlersByGroup(): Record<string, ActionHandler[]> {
  const grouped: Record<string, ActionHandler[]> = {};

  for (const handler of ACTION_REGISTRY.values()) {
    const group = handler.group || 'Other';
    if (!grouped[group]) {
      grouped[group] = [];
    }
    grouped[group].push(handler);
  }

  return grouped;
}
