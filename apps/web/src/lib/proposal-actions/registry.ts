// src/lib/proposal-actions/registry.ts

import { batchMintGovernanceTokenHandler } from './actions/batch-mint-governance-token';
import { mintGovernanceTokenHandler } from './actions/mint-governance-token';
import { transferSacTokenHandler } from './actions/transfer-sac-token';
import type { ActionHandler, ProposalActionType } from './types';

/**
 * Explicit registry - all actions registered in one place
 * NO side effects, NO implicit registration
 */
const REGISTERED_HANDLERS: ActionHandler[] = [
  mintGovernanceTokenHandler,
  batchMintGovernanceTokenHandler,
  transferSacTokenHandler
];

const ACTION_REGISTRY = new Map<ProposalActionType, ActionHandler>(
  REGISTERED_HANDLERS.map((handler) => [handler.type, handler])
);

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
