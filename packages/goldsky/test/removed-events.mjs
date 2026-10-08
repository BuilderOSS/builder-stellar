// Events deleted by the contract hardening (no backwards compatibility: redeploy, do not migrate).
export const REMOVED_EVENTS = [
  'TreasuryChanged',            // governor set_treasury removed
  'TokenContractChanged',       // governor set_token_contract removed
  'GovernorAuthorityChanged',   // GovernorAuthority role removed
  'GovernorChanged',            // treasury set_governor removed
  'TreasuryUpdated',            // auction set_treasury removed
  'MarketplaceUpgraded'         // replaced by the common Upgraded event (role marketplace)
];
