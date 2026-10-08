function invoke(data) {
  try {
    if (!data) return null;

    // Normalize all incoming fields to ensure consistent types across all rows
    // This is critical for Arrow table serialization - all rows must have identical types
    function ensureString(val, def) {
      return (typeof val === 'string' && val) ? val : def;
    }
    function ensureNumber(val, def) {
      var n = Number(val);
      return isFinite(n) ? n : def;
    }
    function normalizeTimestamp(val) {
      var timestamp = typeof val === 'string' ? val.trim() : '';
      if (!timestamp || /^[-+]?\d+(\.\d+)?$/.test(timestamp) || /(?:Z|[+-]\d\d:?\d\d|\sUTC)$/i.test(timestamp)) return timestamp;
      return timestamp + ' UTC';
    }

    var topics = ensureString(data.topics, '{}');
    var args = ensureString(data.args, '{}');
    var ledger_sequence = ensureNumber(data.ledger_sequence, 0);
    var transaction_index = ensureNumber(data.transaction_index, 0);
    var operation_index = ensureNumber(data.operation_index, 0);
    var event_index = ensureNumber(data.event_index, 0);

    function parsePayload(value) {
      try {
        if (typeof value === 'string') {
          var trimmed = value.trim();
          if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
            return parsePayload(JSON.parse(trimmed));
          }
        }

        if (value && typeof value === 'object') {
          return value;
        }

        return null;
      } catch (e) {
        console.error('Payload parse error:', e.message, 'value:', String(value).substring(0, 100));
        return null;
      }
    }

  function pick(row, keys) {
    var payloads = [
      parsePayload(args),
      parsePayload(topics),
      parsePayload(row.payload),
      parsePayload(row.data)
    ];
    for (var i = 0; i < keys.length; i += 1) {
      var key = keys[i];
      if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
        return String(row[key]);
      }
      for (var j = 0; j < payloads.length; j += 1) {
        var payload = payloads[j];
        if (payload && payload[key] !== undefined && payload[key] !== null && payload[key] !== '') {
          return String(payload[key]);
        }
      }
    }
    return '';
  }

  function unique(values) {
    var seen = {};
    var out = [];
    for (var i = 0; i < values.length; i += 1) {
      var value = values[i];
      if (!value || seen[value]) {
        continue;
      }
      seen[value] = true;
      out.push(value);
    }
    return out;
  }

  var eventName = data.event_name || data.event_type;
  if (!eventName) {
    return null;
  }

  function normalizeEventName(name) {
    var str = String(name);
    return str.charAt(0).toUpperCase() + str.slice(1).replace(/_([a-z])/g, function (match, letter) {
      return letter.toUpperCase();
    });
  }

  var normalizedEventName = normalizeEventName(eventName);

  var userFacing = {
    TokenInitialized: true, Mint: true, MintWithMinter: true,
    Transfer: true, DelegateChanged: true, DelegateVotesChanged: true,
    ProposalCreated: true, ProposalQueued: true, VoteCast: true,
    ProposalCancelled: true, ProposalExecuted: true,
    AuctionCreated: true, BidPlaced: true,
    AuctionSettled: true, BidRefunded: true, AuctionCancelled: true,
    DaoCreated: true, DaoLaunched: true,
    MerkleClaimEvent: true, AllowlistClaimEvent: true, MintBatchEvent: true,
    PrimaryListingCreated: true, PrimaryListingPurchased: true, PrimaryListingCancelled: true,
    SecondaryListingCreated: true, ListingPurchased: true, ListingCancelled: true,
    RefundDeferred: true, RefundWithdrawn: true,
    // Contract upgrades are the most security-relevant DAO action: public.
    Upgraded: true
  };

  var kindMap = {
    TokenInitialized: 'token.initialized',
    Mint: 'token.mint',
    MintWithMinter: 'token.mint',
    MintAuthorityChanged: 'token.mint_authority_changed',
    Approve: 'token.approve',
    Transfer: 'token.transfer',
    DelegateChanged: 'token.delegate_changed',
    DelegateVotesChanged: 'token.delegate_votes_changed',
    GovernorInitialized: 'governance.initialized',
    ProposalCreated: 'governance.proposal_created',
    ProposalQueued: 'governance.proposal_queued',
    VoteCast: 'governance.vote_cast',
    ProposalCancelled: 'governance.proposal_cancelled',
    ProposalExecuted: 'governance.proposal_executed',
    QueueDelayChanged: 'governance.queue_delay_changed',
    VotingDelayChanged: 'governance.voting_delay_changed',
    VotingPeriodChanged: 'governance.voting_period_changed',
    ProposalThresholdChanged: 'governance.proposal_threshold_changed',
    QuorumBpsChanged: 'governance.quorum_bps_changed',
    TreasuryInitialized: 'treasury.initialized',
    Execute: 'treasury.execute',
    AuctionInitialized: 'auction.initialized',
    AuctionCreated: 'auction.created',
    BidPlaced: 'auction.bid_placed',
    AuctionSettled: 'auction.settled',
    DurationUpdated: 'auction.duration_updated',
    ReservePriceUpdated: 'auction.reserve_price_updated',
    MinBidIncrementUpdated: 'auction.min_bid_increment_updated',
    TimeBufferUpdated: 'auction.time_buffer_updated',
    PaymentTokenUpdated: 'auction.payment_token_updated',
    BidRefunded: 'auction.bid_refunded',
    RefundDeferred: 'auction.refund_deferred',
    RefundWithdrawn: 'auction.refund_withdrawn',
    AuctionCancelled: 'auction.cancelled',
    DaoCreated: 'manager.dao_created',
    DaoLaunched: 'manager.dao_launched',
    FactoryPaused: 'manager.factory_paused',
    FactoryUnpaused: 'manager.factory_unpaused',
    AdminProposed: 'manager.admin_proposed',
    AdminChanged: 'manager.admin_changed',
    PlatformMinterSet: 'manager.platform_minter_set',
    UpgradeApproved: 'manager.upgrade_approved',
    ImplementationRevoked: 'manager.implementation_revoked',
    ImplementationRegistered: 'manager.implementation_registered',
    CurrentImplementationsUpdated: 'manager.implementations_updated',
    MetadataInitialized: 'metadata.initialized',
    PropertyAdded: 'metadata.property_added',
    SeedGenerated: 'metadata.seed_generated',
    PropertiesReset: 'metadata.properties_reset',
    ProjectURIUpdated: 'metadata.project_uri_updated',
    DescriptionUpdated: 'metadata.description_updated',
    RendererBaseUpdated: 'metadata.renderer_base_updated',
    ContractImageUpdated: 'metadata.contract_image_updated',
    MerkleClaimEvent: 'minter.merkle_claim',
    AllowlistClaimEvent: 'minter.allowlist_claim',
    MintBatchEvent: 'minter.batch_mint',
    MerkleRootSetEvent: 'minter.merkle_root_set',
    AllowlistSetEvent: 'minter.allowlist_set',
    Paused: 'contract.paused',
    Unpaused: 'contract.unpaused',
    ManagerInitialized: 'manager.initialized',
    ManagerUpgraded: 'manager.upgraded',
    AdminProposalCancelled: 'manager.admin_proposal_cancelled',
    MarketplaceInitialized: 'marketplace.initialized',
    PrimaryListingCreated: 'marketplace.primary_listing_created',
    PrimaryListingPurchased: 'marketplace.primary_listing_purchased',
    PrimaryListingCancelled: 'marketplace.primary_listing_cancelled',
    PrimaryListingExpired: 'marketplace.primary_listing_expired',
    SecondaryListingCreated: 'marketplace.secondary_listing_created',
    ListingPurchased: 'marketplace.listing_purchased',
    ListingCancelled: 'marketplace.listing_cancelled',
    ListingExpired: 'marketplace.listing_expired',
    PaymentAssetUpdated: 'marketplace.payment_asset_updated',
    SecondaryFeeUpdated: 'marketplace.secondary_fee_updated',
    MarketplacePaused: 'marketplace.paused',
    MarketplaceUnpaused: 'marketplace.unpaused'
  };

  var titleMap = {
    TokenInitialized: 'Token initialized',
    Mint: 'Token minted',
    MintWithMinter: 'Token minted',
    MintAuthorityChanged: 'Mint authority changed',
    Approve: 'Token approval granted',
    Transfer: 'Token transferred',
    DelegateChanged: 'Delegation changed',
    DelegateVotesChanged: 'Voting power changed',
    GovernorInitialized: 'Governor initialized',
    ProposalCreated: 'Proposal created',
    ProposalQueued: 'Proposal queued',
    VoteCast: 'Vote cast',
    ProposalCancelled: 'Proposal cancelled',
    ProposalExecuted: 'Proposal executed',
    QueueDelayChanged: 'Queue delay updated',
    VotingDelayChanged: 'Voting delay updated',
    VotingPeriodChanged: 'Voting period updated',
    ProposalThresholdChanged: 'Proposal threshold updated',
    QuorumBpsChanged: 'Quorum updated',
    TreasuryInitialized: 'Treasury initialized',
    Execute: 'Treasury executed call',
    AuctionInitialized: 'Auction initialized',
    AuctionCreated: 'Auction created',
    BidPlaced: 'Bid placed',
    AuctionSettled: 'Auction settled',
    DurationUpdated: 'Auction duration updated',
    ReservePriceUpdated: 'Reserve price updated',
    MinBidIncrementUpdated: 'Minimum bid increment updated',
    TimeBufferUpdated: 'Time buffer updated',
    PaymentTokenUpdated: 'Payment token updated',
    BidRefunded: 'Bid refunded',
    RefundDeferred: 'Bid refund deferred',
    RefundWithdrawn: 'Bid refund withdrawn',
    AuctionCancelled: 'Auction cancelled',
    DaoCreated: 'DAO created',
    DaoLaunched: 'DAO launched',
    FactoryPaused: 'Factory paused',
    FactoryUnpaused: 'Factory unpaused',
    AdminProposed: 'Manager admin proposed',
    AdminChanged: 'Manager admin changed',
    PlatformMinterSet: 'Platform minter set',
    UpgradeApproved: 'Upgrade approved',
    ImplementationRevoked: 'Implementation revoked',
    ImplementationRegistered: 'Implementation registered',
    CurrentImplementationsUpdated: 'Implementations updated',
    MetadataInitialized: 'Metadata initialized',
    PropertyAdded: 'Property added',
    SeedGenerated: 'Seed generated',
    PropertiesReset: 'Properties reset',
    ProjectURIUpdated: 'Project URI updated',
    DescriptionUpdated: 'Description updated',
    RendererBaseUpdated: 'Renderer base updated',
    ContractImageUpdated: 'Contract image updated',
    MerkleClaimEvent: 'Merkle claim completed',
    AllowlistClaimEvent: 'Allowlist claim completed',
    MintBatchEvent: 'Batch mint completed',
    MerkleRootSetEvent: 'Merkle root configured',
    AllowlistSetEvent: 'Allowlist configured',
    Paused: 'Contract paused',
    Unpaused: 'Contract unpaused',
    ManagerInitialized: 'Manager initialized',
    ManagerUpgraded: 'Manager upgraded',
    AdminProposalCancelled: 'Manager admin proposal cancelled',
    MarketplaceInitialized: 'Marketplace initialized',
    PrimaryListingCreated: 'Primary listing created',
    PrimaryListingPurchased: 'Primary sale completed',
    PrimaryListingCancelled: 'Primary listing cancelled',
    PrimaryListingExpired: 'Primary listing expired',
    SecondaryListingCreated: 'Secondary listing created',
    ListingPurchased: 'Listing purchased',
    ListingCancelled: 'Listing cancelled',
    ListingExpired: 'Listing expired',
    PaymentAssetUpdated: 'Marketplace payment asset updated',
    SecondaryFeeUpdated: 'Secondary sale fee updated',
    MarketplacePaused: 'Marketplace paused',
    MarketplaceUnpaused: 'Marketplace unpaused'
  };

  // Every module emits its own `Launched` event (same name, different data), so the
  // kind/title depend on the emitting module's contract_role.
  var launchRole = ensureString(data.contract_role, '');
  if (normalizedEventName === 'Launched') {
    var launchLabels = { token: 'Token', governor: 'Governor', treasury: 'Treasury', auction: 'Auction', marketplace: 'Marketplace', metadata: 'Metadata' };
    kindMap.Launched = (launchLabels[launchRole] ? launchRole : 'module') + '.launched';
    titleMap.Launched = (launchLabels[launchRole] || 'Module') + ' launched';
  }
  // `Upgraded` / `VersionSynced` come from contracts/common and are emitted by every module.
  if (normalizedEventName === 'Upgraded' || normalizedEventName === 'VersionSynced') {
    var upgradeLabels = { token: 'Token', governor: 'Governor', treasury: 'Treasury', auction: 'Auction', marketplace: 'Marketplace', metadata: 'Metadata' };
    var upgradeRole = upgradeLabels[launchRole] ? launchRole : 'module';
    var upgradeLabel = upgradeLabels[launchRole] || 'Module';
    if (normalizedEventName === 'Upgraded') {
      kindMap.Upgraded = upgradeRole + '.upgraded';
      titleMap.Upgraded = upgradeLabel + ' upgraded';
    } else {
      kindMap.VersionSynced = upgradeRole + '.version_synced';
      titleMap.VersionSynced = upgradeLabel + ' version synced';
    }
  }

  var addresses = unique([
    pick(data, ['actor']),
    pick(data, ['proposer']),
    pick(data, ['bidder']),
    pick(data, ['minter']),
    pick(data, ['current_admin']),
    pick(data, ['proposed_admin']),
    pick(data, ['cancelled_admin']),
    pick(data, ['old_admin']),
    pick(data, ['new_admin']),
    pick(data, ['owner']),
    pick(data, ['changed_by']),
    pick(data, ['cancelled_by']),
    pick(data, ['executor']),
    pick(data, ['governor']),
    pick(data, ['treasury']),
    pick(data, ['new_treasury']),
    pick(data, ['new_governor']),
    pick(data, ['token_contract']),
    pick(data, ['token_contract_id']),
    pick(data, ['contract_id']),
    pick(data, ['creator']),
    pick(data, ['token_address']),
    pick(data, ['recipient']),
    pick(data, ['buyer']),
    pick(data, ['seller'])
  ]);

  var proposalId = pick(data, ['proposal_id']);
  var amount = pick(data, ['amount', 'total_amount', 'price']);
  var listingId = pick(data, ['listing_id']);
  var callIndex = pick(data, ['index']);
  var tokenId = pick(data, ['token_id']);
  var func = pick(data, ['function']);
  var target = pick(data, ['target']);
  var owner = pick(data, ['to', 'owner', 'recipient']);
  var creator = pick(data, ['creator']);
  var tokenAddress = pick(data, ['token_address']);
  var name = pick(data, ['name']);

  var summaryFunctions = {
    ProposalQueued: function() { return 'Proposal ' + (proposalId || '') + ' queued'; },
    ProposalCreated: function() { return 'Proposal created'; },
    VoteCast: function() { return 'Vote cast on proposal'; },
    BidPlaced: function() { return 'Bid of ' + (amount || 'unknown') + ' placed on token ' + (tokenId || 'unknown'); },
    AuctionSettled: function() { return 'Auction settled for token ' + (tokenId || 'unknown'); },
    AuctionCreated: function() { return 'Auction created for token ' + (tokenId || 'unknown'); },
    // One Execute event per call: topics governor/target/proposal_id, data function + index.
    Execute: function() {
      return 'Executed ' + (func || 'call') + ' on ' + (target || 'target') +
        (callIndex !== '' ? ' (call ' + (Number(callIndex) + 1) + (proposalId ? ' of proposal ' + proposalId : '') + ')' : '');
    },
    ProposalExecuted: function() { return 'Proposal ' + (proposalId || '') + ' executed'; },
    BidRefunded: function() { return 'Bid of ' + (amount || 'unknown') + ' refunded for token ' + (tokenId || 'unknown'); },
    RefundDeferred: function() { return 'Refund of ' + (amount || 'unknown') + ' deferred for token ' + (tokenId || 'unknown') + '; claim it with withdraw_refund'; },
    RefundWithdrawn: function() { return 'Refund of ' + (amount || 'unknown') + ' withdrawn'; },
    Launched: function() {
      var started = pick(data, ['started']);
      var opened = pick(data, ['opened']);
      if (launchRole === 'auction') return 'Auction launched' + (started === 'true' ? ' and started' : ' paused');
      if (launchRole === 'marketplace') return 'Marketplace launched' + (opened === 'true' ? ' and opened' : ' paused');
      return (titleMap.Launched || 'Module launched');
    },
    // Topics from_hash/to_hash, data version. Hashes are shortened to 8 hex chars.
    Upgraded: function() {
      function shortHash(h) { return h ? String(h).slice(0, 8) : 'unknown'; }
      var v = pick(data, ['version']);
      return 'Contract upgraded to version ' + (v || 'unknown') + ' (' + shortHash(pick(data, ['from_hash'])) + ' -> ' + shortHash(pick(data, ['to_hash'])) + ')';
    },
    VersionSynced: function() { return 'Contract version synced to ' + (pick(data, ['version']) || 'unknown'); },
    AdminProposalCancelled: function() { return 'Admin proposal for ' + (pick(data, ['cancelled_admin']) || 'unknown') + ' cancelled'; },
    Mint: function() { return 'Minted token ' + (tokenId || '') + ' to ' + (owner || 'recipient'); },
    MintWithMinter: function() { return 'Minted token ' + (tokenId || '') + ' to ' + (owner || 'recipient'); },
    MintBatchEvent: function() { var count = pick(data, ['recipient_count']); return 'Minted ' + (amount || 'tokens') + ' to ' + (count || 'multiple') + ' recipients'; },
    PrimaryListingCreated: function() { return 'Primary listing ' + (listingId || 'unknown') + ' created at ' + (amount || 'unknown price'); },
    PrimaryListingPurchased: function() { return 'Primary sale: token ' + (tokenId || 'unknown') + ' bought for ' + (amount || 'unknown price') + ' (listing ' + (listingId || 'unknown') + ')'; },
    PrimaryListingCancelled: function() { return 'Primary listing ' + (listingId || 'unknown') + ' cancelled'; },
    PrimaryListingExpired: function() { return 'Primary listing ' + (listingId || 'unknown') + ' expired'; },
    SecondaryListingCreated: function() { return 'Secondary listing created for token ' + (tokenId || 'unknown') + ' at ' + (amount || 'unknown price'); },
    ListingPurchased: function() { return 'Token ' + (tokenId || 'unknown') + ' purchased for ' + (amount || 'unknown price'); },
    MerkleClaimEvent: function() { return 'Claimed ' + (amount || 'tokens') + ' via merkle proof for ' + (owner || 'recipient'); },
    AllowlistClaimEvent: function() { return 'Claimed ' + (amount || 'tokens') + ' via allowlist for ' + (owner || 'recipient'); },
    DelegateChanged: function() { return 'Delegation changed'; },
    DaoCreated: function() { return 'DAO created by ' + (creator || 'unknown'); },
    DaoLaunched: function() { return 'DAO launched for token ' + (tokenAddress || 'unknown'); },
    ImplementationRegistered: function() { return 'Implementation "' + (name || 'unknown') + '" registered'; },
    SeedGenerated: function() { return 'Seed generated for token ' + (tokenId || 'unknown'); },
    PropertyAdded: function() { return 'Property "' + (name || 'unknown') + '" added'; }
  };

  var summary = summaryFunctions[normalizedEventName] ? summaryFunctions[normalizedEventName]() : (titleMap[normalizedEventName] || String(eventName).replace(/_/g, ' '));

  // Ensure consistent string representation for JSON fields to avoid Arrow type inference issues
  var topicsValue = topics;
  if (typeof topicsValue === 'string') {
    // Validate it's valid JSON
    try {
      JSON.parse(topicsValue);
    } catch (e) {
      topicsValue = '{}';
    }
  } else {
    topicsValue = JSON.stringify(topicsValue || {});
  }

  var argsValue = args;
  if (typeof argsValue === 'string') {
    // Validate it's valid JSON
    try {
      JSON.parse(argsValue);
    } catch (e) {
      argsValue = '{}';
    }
  } else {
    argsValue = JSON.stringify(argsValue || {});
  }

  // Strictly type all fields to ensure no mixed types in Arrow table
  var visibility = userFacing[normalizedEventName] ? (normalizedEventName.indexOf('Proposal') === 0 || normalizedEventName === 'VoteCast' ? 'governance' : 'public') : (kindMap[normalizedEventName] ? 'admin' : 'system');

  // Helper to safely convert to number
  function toNumber(val) {
    if (typeof val === 'number') return isFinite(val) ? val : 0;
    var n = Number(val);
    return isFinite(n) ? n : 0;
  }

  // Helper to safely convert to string
  function toString(val) {
    if (val === null || val === undefined || val === '') return '';
    return String(val);
  }

  return {
    activity_id: toString(data.event_id || data.id),  // Primary key - derived from source event_id
    deployment_id: toString(data.deployment_id),
    contract_id: toString(data.contract_id),
    contract_role: toString(data.contract_role),
    kind: toString(kindMap[normalizedEventName] || ('contract.' + String(eventName).toLowerCase())),
    title: toString(titleMap[normalizedEventName] || normalizedEventName),
    summary: toString(summary),
    event_name: toString(eventName),
    topics: toString(topicsValue),
    args: toString(argsValue),
    visibility: toString(visibility),
    proposal_id: toString(proposalId),
    token_id: toString(tokenId),
    amount: toString(amount),
    actor: toString(pick(data, ['actor', 'proposer', 'voter', 'bidder', 'minter', 'recipient', 'owner', 'changed_by', 'cancelled_by', 'executor', 'governor', 'treasury', 'new_treasury', 'new_governor', 'delegator', 'delegate', 'creator', 'buyer', 'seller', 'current_admin', 'old_admin'])),
    addresses: JSON.stringify(addresses || []),
    ledger_sequence: ledger_sequence,
    transaction_index: transaction_index,
    operation_index: operation_index,
    event_index: event_index,
    ledger_closed_at: normalizeTimestamp(data.ledger_closed_at),
    transaction_hash: toString(data.transaction_hash)
  };
  } catch (e) {
    console.error('Activity feed transform error:', e.message, 'event_id:', data?.event_id);
    return null;
  }
}
