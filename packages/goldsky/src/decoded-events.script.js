function invoke(data) {
  try {
    if (!data) return null;

    function toCanonical(name) {
      return name.charAt(0).toUpperCase() + name.slice(1).replace(/_([a-z])/g, function (_, c) { return c.toUpperCase(); });
    }

    function native(value) {
      if (value === null || value === undefined || value === 'void') return null;
      if (typeof value !== 'object') return value;
      if (value.symbol !== undefined) return String(value.symbol);
      if (value.address !== undefined) return String(value.address);
      var scalar = ['u32', 'i32', 'u64', 'i64', 'u128', 'i128', 'u256', 'i256', 'bytes', 'string', 'bool'];
      for (var i = 0; i < scalar.length; i += 1) {
        if (value[scalar[i]] !== undefined) return scalar[i].match(/^[ui](64|128|256)$/) ? String(value[scalar[i]]) : value[scalar[i]];
      }
      if (Array.isArray(value.vec)) return value.vec.map(native);
      if (Array.isArray(value.map)) {
        var out = {};
        value.map.forEach(function (entry) { if (entry && entry.key !== undefined) out[String(native(entry.key))] = native(entry.val); });
        return out;
      }
      return value;
    }

    function json(value) {
      if (typeof value !== 'string') return value;
      try { return JSON.parse(value); } catch (e) {
        console.error('JSON parse error:', e.message, 'value:', String(value).substring(0, 100));
        return null;
      }
    }

    var rawTopics = json(data.topics);
    var rawData = json(data.data);
    if (!Array.isArray(rawTopics) || rawTopics.length === 0) {
      console.error('Invalid topics for event:', data.event_id);
      return null;
    }

  var values = rawTopics.map(native);
  var eventName = String(values[0]);
  var topicValues = values.slice(1);
  // Topic names mirror the on-chain topic order after the event-name symbol.
  // They are generated from contracts/*/src/events.rs plus the OpenZeppelin
  // library events our contracts emit; test/contract-alignment.test.mjs fails
  // if this map drifts. Minter token_id is the DAO token contract Address, not
  // an NFT number.
  var topicNames = {
    // Manager
    ManagerInitialized: ['admin'], ImplementationRegistered: ['wasm_hash'], UpgradeApproved: ['from_hash', 'to_hash'],
    ImplementationRevoked: ['wasm_hash'], DaoCreated: ['token_address', 'deployer', 'launch_admin'], FactoryPaused: [], FactoryUnpaused: [],
    DaoLaunched: ['token_address'], CurrentImplementationsUpdated: [], ManagerUpgraded: ['from_hash', 'to_hash'],
    // AdminChanged is emitted by the Manager (its own admin handover) and, with the same shape,
    // by every DAO module at launch (contracts/common/src/admin.rs: launch admin -> Treasury).
    AdminProposed: ['current_admin', 'proposed_admin'], AdminProposalCancelled: ['current_admin', 'cancelled_admin'], AdminChanged: ['old_admin', 'new_admin'], PlatformMinterSet: ['minter'],
    LatestImplementationSet: ['name', 'wasm_hash'], PendingSlugUpdated: ['token_address'], SlugClaimed: ['token_address', 'slug'],
    // Each module's launch handoff (topic `treasury`).
    TokenLaunched: ['treasury'], GovernorLaunched: ['treasury'], TreasuryLaunched: ['treasury'],
    AuctionLaunched: ['treasury'], MarketplaceLaunched: ['treasury'], MetadataLaunched: ['treasury'],
    // contracts/common/src/upgrade.rs: emitted by EVERY module (token, governor, treasury, auction,
    // marketplace, metadata); the emitting module is identified by contract_id/contract_role.
    Upgraded: ['from_hash', 'to_hash'], VersionSynced: [], Migrated: [],
    // Token (custom + OpenZeppelin non-fungible/votes/pausable)
    TokenInitialized: ['admin'], MintAuthorityChanged: ['authority'], MintWithMinter: ['minter', 'to'], MintBatchWithMinter: ['minter'],
    Mint: ['to'], Transfer: ['from', 'to'], Approve: ['approver', 'token_id'], ApproveForAll: ['owner'],
    DelegateChanged: ['delegator'], DelegateVotesChanged: ['delegate'],
    Paused: [], Unpaused: [],
    // Governor (custom + OpenZeppelin governor)
    GovernorInitialized: ['admin'], ProposalCreated: ['proposal_id', 'proposer'], ProposalScheduled: ['proposal_id'],
    VoteCast: ['voter', 'proposal_id'],
    ProposalQueued: ['proposal_id'], ProposalExecuted: ['proposal_id'], ProposalCancelled: ['proposal_id'],
    QueueDelayChanged: ['changed_by'], VotingDelayChanged: ['changed_by'], VotingPeriodChanged: ['changed_by'],
    ProposalThresholdChanged: ['changed_by'], QuorumBpsChanged: ['changed_by'],
    // Treasury
    TreasuryInitialized: ['admin'], Execute: ['governor', 'target', 'proposal_id'],
    // Auction
    AuctionInitialized: ['admin'], AuctionCreated: ['token_id'], BidPlaced: ['token_id', 'bidder'], AuctionSettled: ['token_id'],
    BidRefunded: ['token_id', 'bidder'], AuctionCancelled: ['token_id'], DurationUpdated: [], ReservePriceUpdated: [],
    MinBidIncrementUpdated: [], TimeBufferUpdated: [], PaymentTokenUpdated: [],
    RefundDeferred: ['token_id', 'bidder'], RefundWithdrawn: ['bidder'],
    // Metadata
    MetadataInitialized: ['token'], PropertyAdded: ['property_id'], SeedGenerated: ['token_id'], SeedsGenerated: ['first_token_id'], PropertiesReset: [],
    ProjectURIUpdated: [], DescriptionUpdated: [], RendererBaseUpdated: [], ContractImageUpdated: [],
    // Minter
    MerkleClaimEvent: ['token_id', 'recipient'], AllowlistClaimEvent: ['token_id', 'recipient'], MintBatchEvent: ['token_id'],
    MerkleRootSetEvent: ['token_id'], AllowlistSetEvent: ['token_id'],
    // Marketplace
    MarketplaceInitialized: ['token', 'admin'], PrimaryListingCreated: ['listing_id'], PrimaryListingPurchased: ['listing_id', 'buyer'],
    PrimaryListingCancelled: ['listing_id'], PrimaryListingExpired: ['listing_id'], SecondaryListingCreated: ['token_id'],
    ListingPurchased: ['token_id', 'buyer'], ListingCancelled: ['token_id'], ListingExpired: ['token_id'],
    PaymentAssetUpdated: ['changed_by'], SecondaryFeeUpdated: ['changed_by'],
    MarketplacePaused: ['changed_by'], MarketplaceUnpaused: ['changed_by']
  };
  var names = topicNames[eventName] || topicNames[toCanonical(eventName)] || [];
  var topics = {};
  names.forEach(function (name, index) { if (topicValues[index] !== undefined) topics[name] = topicValues[index]; });
  var args = native(rawData);
  if (!args || typeof args !== 'object' || Array.isArray(args)) args = { value: args };

  // Type-safe helpers to ensure consistent Arrow table types
  // CRITICAL: For Arrow serialization, all rows must have same type in each column
  // Never mix null with values - use empty string for missing strings, null for missing numbers
  function toStringOrEmpty(value) {
    if (value === null || value === undefined) return '';
    return String(value);
  }
  function normalizeTimestamp(value) {
    var timestamp = toStringOrEmpty(value).trim();
    if (!timestamp || /^[-+]?\d+(\.\d+)?$/.test(timestamp) || /(?:Z|[+-]\d\d:?\d\d|\sUTC)$/i.test(timestamp)) return timestamp;
    return timestamp + ' UTC';
  }
  function toNumber(value) {
    if (value === null || value === undefined) return null;
    var n = Number(value);
    return isFinite(n) ? n : null;
  }
  function toBoolean(value) {
    if (value === null || value === undefined) return null;
    return Boolean(value);
  }

  var result = {
    event_id: toStringOrEmpty(data.event_id || data.id),
    deployment_id: toStringOrEmpty(data.deployment_id),
    contract_id: toStringOrEmpty(data.contract_id),
    contract_role: String(
      data.contract_role && data.contract_role !== 'unknown'
        ? data.contract_role
        : roleForEvent(eventName)
    ),
    event_name: toStringOrEmpty(eventName),
    topic_0: toStringOrEmpty(topicValues[0]),
    topic_1: toStringOrEmpty(topicValues[1]),
    topic_2: toStringOrEmpty(topicValues[2]),
    topic_3: toStringOrEmpty(topicValues[3]),
    topics: JSON.stringify(topics),
    args: JSON.stringify(args),
    payload: JSON.stringify(Object.assign({}, topics, args)),
    transaction_hash: toStringOrEmpty(data.transaction_hash),
    transaction_successful: toBoolean(data.transaction_successful),
    ledger_sequence: toNumber(data.ledger_sequence),
    ledger_hash: toStringOrEmpty(data.ledger_hash),
    ledger_closed_at: normalizeTimestamp(data.ledger_closed_at),
    transaction_index: toNumber(data.transaction_index),
    operation_index: toNumber(data.operation_index),
    event_index: toNumber(data.event_index),
    operation_type: toStringOrEmpty(data.operation_type),
    _gs_op: toStringOrEmpty(data._gs_op),
    decoder_version: 'v2'
  };
  // These aliases are intentionally not declared in the Goldsky schema. They keep
  // local transform fixtures useful while consumers migrate to topics/args.
  // Note: Schema fields (args, topics, payload) must stay as JSON strings for JSONB columns.
  // Only convert non-schema field aliases to strings for type safety.
  Object.keys(topics).forEach(function (key) { result[key] = toStringOrEmpty(topics[key]); });
  Object.keys(args).forEach(function (key) {
    if (key !== 'args' && key !== 'topics' && key !== 'payload') result[key] = toStringOrEmpty(args[key]);
  });
    return result;

    // Fallback only: the pipeline normally assigns contract_role from the DAO
    // module allowlists before decoding. Names mirror the topicNames groups.
    function roleForEvent(name) {
      var canonical = toCanonical(name);
      if (canonical === 'MintBatchWithMinter') return 'token';
      if (/^(Manager|Implementation|CurrentImplementations|LatestImplementation|UpgradeApproved|Dao|Factory|Admin|PlatformMinter|PendingSlug|SlugClaimed)/.test(canonical)) return 'manager';
      if (/^(MerkleClaim|AllowlistClaim|MintBatch|MerkleRoot|AllowlistSet)/.test(canonical)) return 'minter';
      if (/^(Marketplace|Listing|Primary|Secondary|PaymentAsset)/.test(canonical)) return 'marketplace';
      if (/^(Proposal|Vote|Governor|Quorum|Voting|Queue)/.test(canonical)) return 'governor';
      if (/^(Auction|Bid|ReservePrice|MinBid|TimeBuffer|DurationUpdated|PaymentToken|Refund)/.test(canonical)) return 'auction';
      if (/^(Execute|Treasury)/.test(canonical)) return 'treasury';
      if (/^(Metadata|Property|Properties|Seed|ProjectURI|Description|RendererBase|ContractImage)/.test(canonical)) return 'metadata';
      if (/^(Transfer|Mint|Delegate|Approve|Token)/.test(canonical)) return 'token';
      return 'unknown';
    }
  } catch (e) {
    console.error('Decoder error:', e.message, 'event_id:', data?.event_id);
    return null;
  }
}
