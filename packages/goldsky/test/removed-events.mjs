// Events deleted by the contract hardening (no backwards compatibility: redeploy, do not migrate).
export const REMOVED_EVENTS = [
  'TreasuryChanged',            // governor set_treasury removed
  'TokenContractChanged',       // governor set_token_contract removed
  'GovernorAuthorityChanged',   // GovernorAuthority role removed
  'GovernorChanged',            // treasury set_governor removed
  'TreasuryUpdated',            // auction set_treasury removed
  'MarketplaceUpgraded',        // replaced by the common Upgraded event (role marketplace)
  'Launched',                   // replaced by per-module TokenLaunched, GovernorLaunched, ...
  'OwnershipTransfer',          // OpenZeppelin Ownable replaced by common::admin (no transfer)
  'OwnershipTransferCompleted', // ditto
  'OwnershipRenounced',         // ditto: no renounce
  // Storage diet (0.3.0, docs/STORAGE_DIET.md): fresh redeploy, no migration.
  'VersionSynced',              // version() is read from the Manager registry
  'ProjectURIUpdated',          // replaced by the event-only ProfileUpdated
  'DescriptionUpdated',         // ditto
  'ContractImageUpdated',       // ditto
  'AllowlistClaimEvent',        // Minter is merkle-only
  'AllowlistSetEvent',          // ditto
  // Membership models (docs/designs/membership-models.md): mint allowances replace mint authority.
  'MintAuthorityChanged',       // replaced by MintAllowanceChanged
  'PlatformMinterSet',          // the shared Minter is retired: each DAO has its own ClaimMinter
  'MerkleClaimEvent',           // ClaimMinter Claimed
  'MintBatchEvent',             // ClaimMinter has no admin batch mint (founders mint in Setup)
  'MerkleRootSetEvent',         // ClaimMinter ListOpened
  'PrimaryListingCreated',      // quick-buy pools replace primary listings (PoolOpened)
  'PrimaryListingPurchased',    // PoolPurchased
  'PrimaryListingCancelled',    // PoolClosed
  'PrimaryListingExpired',      // ditto
  'PrimaryListingCommented'     // pools carry no comments
];
