function invoke(data) {
  try {
    if (!data) return null;

    function toCanonical(name) {
      return name.charAt(0).toUpperCase() + name.slice(1).replace(/_([a-z])/g, function (_, c) { return c.toUpperCase(); });
    }

    // PostgreSQL jsonb refuses U+0000, and a profile, comment or description is
    // free text no contract filters, so one NUL would make every view that reads
    // the row raise. Replace it with U+FFFD before the text reaches the sink.
    function text(value) {
      return String(value).replace(/\u0000/g, '\uFFFD');
    }

    function native(value) {
      if (value === null || value === undefined || value === 'void') return null;
      if (typeof value === 'string') return text(value);
      if (typeof value !== 'object') return value;
      if (value.symbol !== undefined) return text(value.symbol);
      if (value.address !== undefined) return String(value.address);
      if (value.string !== undefined) return text(value.string);
      var scalar = ['u32', 'i32', 'u64', 'i64', 'u128', 'i128', 'u256', 'i256', 'bytes', 'bool'];
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
  // if this map drifts. An event this map does not name (an external module's
  // own events) is decoded positionally: topic_0.., and arg_0.. for vec data.
  var topicNames = {
    // Manager
    ManagerInitialized: ['admin'], ImplementationRegistered: ['wasm_hash'], UpgradeApproved: ['from_hash', 'to_hash'],
    ImplementationRevoked: ['wasm_hash'], DaoCreated: ['token_address', 'deployer', 'launch_admin'], FactoryPaused: [], FactoryUnpaused: [],
    DaoLaunched: ['token_address'], CurrentImplementationsUpdated: [], ManagerUpgraded: ['from_hash', 'to_hash'],
    // Membership models: a module deployed into a pending DAO, an assurance drive opened (its
    // slug reserved) and a failed drive's slug released.
    ModuleCreated: ['token_address', 'kind'], AssuranceOpened: ['token_address'], SlugReleased: ['token_address', 'slug'],
    // AdminChanged is emitted by the Manager (its own admin handover) and, with the same shape,
    // by every DAO module at launch (contracts/common/src/admin.rs: launch admin -> Treasury).
    AdminProposed: ['current_admin', 'proposed_admin'], AdminProposalCancelled: ['current_admin', 'cancelled_admin'], AdminChanged: ['old_admin', 'new_admin'],
    LatestImplementationSet: ['name', 'wasm_hash'], PendingSlugUpdated: ['token_address'], SlugClaimed: ['token_address', 'slug'],
    // Manager 0.2.0+: a launched DAO moved to new_slug by vote; old_slug (data) is released.
    SlugChanged: ['token_address', 'new_slug'],
    // contracts/common/src/upgrade.rs: the platform upgrade notice changed (the Manager emits it).
    UpgradeDelayChanged: [],
    // Each module's launch handoff (topic `treasury`).
    TokenLaunched: ['treasury'], GovernorLaunched: ['treasury'], TreasuryLaunched: ['treasury'],
    AuctionLaunched: ['treasury'], MarketplaceLaunched: ['treasury'], MetadataLaunched: ['treasury'],
    ClaimMinterLaunched: ['treasury'],
    // contracts/common/src/upgrade.rs: emitted by every DAO module, the ClaimMinter included;
    // the emitting contract is identified by contract_id/contract_role.
    // version() is read from the Manager registry since 0.3.0 (no sync event).
    Upgraded: ['from_hash', 'to_hash'], Migrated: [],
    // Token (custom + OpenZeppelin non-fungible/votes)
    // MetadataUpdated (token 0.2.0+): rename; all data, no topics.
    TokenInitialized: ['admin'], MetadataUpdated: [], MintAllowanceChanged: ['module'], ModuleRegistered: ['kind'], ModuleUnregistered: ['kind'], MintWithMinter: ['minter', 'to'], MintBatchWithMinter: ['minter'],
    Mint: ['to'], Transfer: ['from', 'to'], Approve: ['approver', 'token_id'], ApproveForAll: ['owner'],
    DelegateChanged: ['delegator'], DelegateVotesChanged: ['delegate'],
    // Membership switches (docs/designs/locked-tokens.md): all data, no topics.
    TransfersLockChanged: [], MembersOnlyDelegationChanged: [], DaoRecoveryChanged: [],
    TransferAgentChanged: ['module'], AgentTransfer: ['agent'], DaoTransfer: ['from', 'to'],
    // OpenZeppelin pausable: only the Auction uses it (paused at construction, unpaused at launch).
    Paused: [], Unpaused: [],
    // Governor (custom + OpenZeppelin governor)
    GovernorInitialized: ['admin'], ProposalCreated: ['proposal_id', 'proposer'], ProposalScheduled: ['proposal_id'],
    VoteCast: ['voter', 'proposal_id'],
    // Governor 0.2.0+: event-only proposal comment (body in data).
    ProposalCommented: ['proposal_id', 'author'],
    ProposalQueued: ['proposal_id'], ProposalExecuted: ['proposal_id'], ProposalCancelled: ['proposal_id'],
    QueueDelayChanged: ['changed_by'], VotingDelayChanged: ['changed_by'], VotingPeriodChanged: ['changed_by'],
    ProposalThresholdChanged: ['changed_by'], QuorumBpsChanged: ['changed_by'], QuorumChanged: [],
    // Treasury
    TreasuryInitialized: ['admin'], Execute: ['governor', 'target', 'proposal_id'],
    // Auction
    AuctionInitialized: ['admin'], AuctionCreated: ['token_id'], BidPlaced: ['token_id', 'bidder'], AuctionSettled: ['token_id'],
    BidRefunded: ['token_id', 'bidder'], AuctionCancelled: ['token_id'], DurationUpdated: [], ReservePriceUpdated: [],
    MinBidIncrementUpdated: [], TimeBufferUpdated: [], PaymentTokenUpdated: [],
    RefundDeferred: ['token_id', 'bidder'], RefundWithdrawn: ['bidder'],
    // Metadata
    MetadataInitialized: ['token'], PropertyAdded: ['property_id'], SeedGenerated: ['token_id'], SeedsGenerated: ['first_token_id'], PropertiesReset: [],
    // ProfileUpdated (0.3.0+): the profile JSON is event-only; Metadata stores its hash and seq.
    ProfileUpdated: ['seq'], RendererBaseUpdated: [],
    // ClaimMinter (role claims): merkle claim lists, paid or free, with an optional assurance escrow.
    ListOpened: ['list_id'], Claimed: ['list_id', 'claimer'], EscrowReleased: ['list_id'], Refunded: ['list_id', 'claimer'],
    // Marketplace
    MarketplaceInitialized: ['token', 'admin'], SecondaryListingCreated: ['token_id'],
    ListingPurchased: ['token_id', 'buyer'], ListingCancelled: ['token_id'], ListingExpired: ['token_id'],
    // Quick-buy pools: stock minted into Marketplace custody, sold at a fixed price.
    PoolOpened: ['pool_id'], PoolRestocked: ['pool_id'], PoolPurchased: ['pool_id', 'buyer'], PoolClosed: ['pool_id'], PoolSwept: ['pool_id'],
    // Marketplace 0.2.0+: event-only comments (body in data).
    ListingCommented: ['token_id', 'author'],
    PaymentAssetUpdated: ['changed_by'], SecondaryFeeUpdated: ['changed_by'],
    MarketplacePaused: ['changed_by'], MarketplaceUnpaused: ['changed_by']
  };
  var names = topicNames[eventName] || topicNames[toCanonical(eventName)];
  var known = Boolean(names);
  var topics = {};
  if (known) names.forEach(function (name, index) { if (topicValues[index] !== undefined) topics[name] = topicValues[index]; });
  else topicValues.forEach(function (value, index) { topics['topic_' + index] = value; });
  var args = native(rawData);
  if (Array.isArray(args) && !known) {
    var positional = {};
    args.forEach(function (value, index) { positional['arg_' + index] = value; });
    args = positional;
  } else if (!args || typeof args !== 'object' || Array.isArray(args)) args = { value: args };

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
    // Not in the sink schema (chain.decoded_events has topics and args); kept for local
    // fixtures and the activity script's pick(), which reads it when present.
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
    return result;

    // Fallback only: the pipeline assigns contract_role from the DAO module
    // allowlists before decoding, and the common events (Upgraded, Migrated,
    // AdminChanged, UpgradeDelayChanged) cannot be resolved by name at all.
    function roleForEvent(name) {
      var canonical = toCanonical(name);
      if (/^(MintBatchWithMinter|MetadataUpdated|DaoRecoveryChanged|DaoTransfer|TransfersLockChanged|MembersOnlyDelegationChanged|TransferAgentChanged|AgentTransfer)$/.test(canonical)) return 'token';
      if (/^(Manager|Implementation|CurrentImplementations|LatestImplementation|UpgradeApproved|Dao|Factory|Admin|PendingSlug|Slug|ModuleCreated|AssuranceOpened)/.test(canonical)) return 'manager';
      if (/^(ListOpened|Claimed|EscrowReleased|Refunded|ClaimMinter)/.test(canonical)) return 'claims';
      if (/^(Marketplace|Listing|Secondary|PaymentAsset|Pool)/.test(canonical)) return 'marketplace';
      if (/^(Proposal|Vote|Governor|Quorum|Voting|Queue)/.test(canonical)) return 'governor';
      if (/^(Auction|Bid|ReservePrice|MinBid|TimeBuffer|DurationUpdated|PaymentToken|Refund)/.test(canonical)) return 'auction';
      if (/^(Execute|Treasury)/.test(canonical)) return 'treasury';
      if (/^(Metadata|Property|Properties|Seed|Profile|RendererBase)/.test(canonical)) return 'metadata';
      if (/^(Transfer|Mint|Delegate|Approve|Token|Module)/.test(canonical)) return 'token';
      return 'unknown';
    }
  } catch (e) {
    console.error('Decoder error:', e.message, 'event_id:', data?.event_id);
    return null;
  }
}
