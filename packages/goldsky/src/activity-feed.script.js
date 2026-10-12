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
    // The SQL transform leaves the positions NULL on purpose; the chain.fill_event_positions
    // trigger parses them from the event id, and only fires on NULL. A 0 here would freeze
    // every feed row at position 0 and lose the order inside a transaction.
    function position(val) {
      return val === null || val === undefined ? null : ensureNumber(val, null);
    }
    var ledger_sequence = ensureNumber(data.ledger_sequence, 0);
    var transaction_index = position(data.transaction_index);
    var operation_index = position(data.operation_index);
    var event_index = position(data.event_index);

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

  // Public feed: what a member would act on or care about. Per-token mints,
  // seeds, transfers, vote-weight bookkeeping, setup/launch internals and refunds
  // stay out (admin/system rows): they are side effects of the events below, which
  // already tell the story. A listing that closes is news like a listing that opens.
  var userFacing = {
    DaoLaunched: true,
    ProposalCreated: true, ProposalQueued: true, ProposalExecuted: true, ProposalCancelled: true, VoteCast: true,
    // Event-only comments (governor/marketplace 0.2.0+).
    ProposalCommented: true, PrimaryListingCommented: true, ListingCommented: true,
    DelegateChanged: true,
    // A rename changes how members find the community: public.
    MetadataUpdated: true,
    // So does a new link.
    SlugChanged: true,
    AuctionCreated: true, BidPlaced: true, AuctionSettled: true, AuctionCancelled: true,
    PrimaryListingCreated: true, PrimaryListingPurchased: true, PrimaryListingCancelled: true, PrimaryListingExpired: true,
    SecondaryListingCreated: true, ListingPurchased: true, ListingCancelled: true, ListingExpired: true,
    // The Minter's own row (MintBatchEvent / MerkleClaimEvent) tells the story of a batch;
    // the token's MintBatchWithMinter in the same call stays admin so a mint is not announced twice.
    MerkleClaimEvent: true, MintBatchEvent: true,
    // A new claim round and a profile change are things members act on.
    MerkleRootSetEvent: true, ProfileUpdated: true,
    // Contract upgrades are the most security-relevant DAO action: public.
    Upgraded: true,
    // A shorter platform notice narrows the window members have to react: public.
    UpgradeDelayChanged: true
  };

  var kindMap = {
    TokenInitialized: 'token.initialized',
    Mint: 'token.mint',
    MintWithMinter: 'token.mint',
    MintBatchWithMinter: 'token.batch_mint',
    MintAuthorityChanged: 'token.mint_authority_changed',
    MetadataUpdated: 'token.metadata_updated',
    Approve: 'token.approve',
    ApproveForAll: 'token.approve_for_all',
    Transfer: 'token.transfer',
    DelegateChanged: 'token.delegate_changed',
    DelegateVotesChanged: 'token.delegate_votes_changed',
    GovernorInitialized: 'governance.initialized',
    ProposalCreated: 'governance.proposal_created',
    ProposalScheduled: 'governance.proposal_scheduled',
    ProposalQueued: 'governance.proposal_queued',
    VoteCast: 'governance.vote_cast',
    ProposalCommented: 'governance.proposal_commented',
    ProposalCancelled: 'governance.proposal_cancelled',
    ProposalExecuted: 'governance.proposal_executed',
    QueueDelayChanged: 'governance.queue_delay_changed',
    VotingDelayChanged: 'governance.voting_delay_changed',
    VotingPeriodChanged: 'governance.voting_period_changed',
    ProposalThresholdChanged: 'governance.proposal_threshold_changed',
    QuorumBpsChanged: 'governance.quorum_bps_changed',
    QuorumChanged: 'governance.quorum_changed',
    TreasuryInitialized: 'treasury.initialized',
    TokenLaunched: 'token.launched',
    GovernorLaunched: 'governance.launched',
    TreasuryLaunched: 'treasury.launched',
    AuctionLaunched: 'auction.launched',
    MarketplaceLaunched: 'marketplace.launched',
    MetadataLaunched: 'metadata.launched',
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
    LatestImplementationSet: 'manager.latest_implementation_set',
    PendingSlugUpdated: 'manager.pending_slug_updated',
    SlugClaimed: 'manager.slug_claimed',
    SlugChanged: 'manager.slug_changed',
    MetadataInitialized: 'metadata.initialized',
    PropertyAdded: 'metadata.property_added',
    SeedGenerated: 'metadata.seed_generated',
    SeedsGenerated: 'metadata.seeds_generated',
    PropertiesReset: 'metadata.properties_reset',
    ProfileUpdated: 'metadata.profile_updated',
    RendererBaseUpdated: 'metadata.renderer_base_updated',
    MerkleClaimEvent: 'minter.merkle_claim',
    MintBatchEvent: 'minter.batch_mint',
    MerkleRootSetEvent: 'minter.merkle_root_set',
    Paused: 'contract.paused',
    Unpaused: 'contract.unpaused',
    ManagerInitialized: 'manager.initialized',
    ManagerUpgraded: 'manager.upgraded',
    UpgradeDelayChanged: 'manager.upgrade_delay_changed',
    AdminProposalCancelled: 'manager.admin_proposal_cancelled',
    MarketplaceInitialized: 'marketplace.initialized',
    PrimaryListingCreated: 'marketplace.primary_listing_created',
    PrimaryListingCommented: 'marketplace.primary_listing_commented',
    ListingCommented: 'marketplace.listing_commented',
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
    MintBatchWithMinter: 'Tokens batch minted',
    MintAuthorityChanged: 'Mint authority changed',
    MetadataUpdated: 'Community renamed',
    Approve: 'Token approval granted',
    ApproveForAll: 'Operator approval changed',
    Transfer: 'Token transferred',
    DelegateChanged: 'Delegation changed',
    DelegateVotesChanged: 'Voting power changed',
    GovernorInitialized: 'Governor initialized',
    ProposalCreated: 'Proposal created',
    ProposalScheduled: 'Proposal voting scheduled',
    ProposalQueued: 'Proposal queued',
    VoteCast: 'Vote cast',
    ProposalCommented: 'Proposal comment',
    ProposalCancelled: 'Proposal cancelled',
    ProposalExecuted: 'Proposal executed',
    QueueDelayChanged: 'Queue delay updated',
    VotingDelayChanged: 'Voting delay updated',
    VotingPeriodChanged: 'Voting period updated',
    ProposalThresholdChanged: 'Proposal threshold updated',
    QuorumBpsChanged: 'Quorum updated',
    QuorumChanged: 'Quorum set',
    TreasuryInitialized: 'Treasury initialized',
    TokenLaunched: 'Token launched',
    GovernorLaunched: 'Governor launched',
    TreasuryLaunched: 'Treasury launched',
    AuctionLaunched: 'Auction launched',
    MarketplaceLaunched: 'Marketplace launched',
    MetadataLaunched: 'Metadata launched',
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
    LatestImplementationSet: 'Latest implementation set',
    PendingSlugUpdated: 'Requested slug changed',
    SlugClaimed: 'Slug claimed',
    SlugChanged: 'Community link changed',
    MetadataInitialized: 'Metadata initialized',
    PropertyAdded: 'Property added',
    SeedGenerated: 'Seed generated',
    SeedsGenerated: 'Seeds generated',
    PropertiesReset: 'Properties reset',
    ProfileUpdated: 'Community profile updated',
    RendererBaseUpdated: 'Renderer base updated',
    MerkleClaimEvent: 'Merkle claim completed',
    MintBatchEvent: 'Batch mint completed',
    MerkleRootSetEvent: 'Claim round opened',
    Paused: 'Contract paused',
    Unpaused: 'Contract unpaused',
    ManagerInitialized: 'Manager initialized',
    ManagerUpgraded: 'Manager upgraded',
    UpgradeDelayChanged: 'Manager upgrade notice changed',
    AdminProposalCancelled: 'Manager admin proposal cancelled',
    MarketplaceInitialized: 'Marketplace initialized',
    PrimaryListingCreated: 'Primary listing created',
    PrimaryListingCommented: 'Primary listing comment',
    ListingCommented: 'Listing comment',
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

  // `Upgraded` and `Migrated` come from contracts/common and are emitted by
  // every module; `AdminChanged` is emitted by the Manager (admin handover) and by every module
  // at launch (launch admin -> Treasury). Kind and title depend on the emitting contract_role.
  var emitterRole = ensureString(data.contract_role, '');
  // The shared Minter emits Upgraded/Migrated too (contracts/minter/src/contract.rs upgrade/migrate).
  var moduleLabels = { token: 'Token', governor: 'Governor', treasury: 'Treasury', auction: 'Auction', marketplace: 'Marketplace', metadata: 'Metadata', minter: 'Minter' };
  // Kind prefixes: the governor's kinds are `governance.*` everywhere (proposal_created, vote_cast, ...).
  var kindPrefixes = { governor: 'governance' };
  var moduleRole = moduleLabels[emitterRole] ? (kindPrefixes[emitterRole] || emitterRole) : 'module';
  var moduleLabel = moduleLabels[emitterRole] || 'Module';
  // OpenZeppelin Paused/Unpaused (auction) are keyed by the emitting module too.
  var commonEvents = { Upgraded: ['upgraded', 'upgraded'], Migrated: ['migrated', 'storage migrated'], Paused: ['paused', 'paused'], Unpaused: ['unpaused', 'unpaused'] };
  if (commonEvents[normalizedEventName]) {
    kindMap[normalizedEventName] = moduleRole + '.' + commonEvents[normalizedEventName][0];
    titleMap[normalizedEventName] = moduleLabel + ' ' + commonEvents[normalizedEventName][1];
  }
  // The shared Minter has its own notice (contracts/common/src/upgrade.rs `set_delay`).
  if (normalizedEventName === 'UpgradeDelayChanged' && emitterRole === 'minter') {
    kindMap.UpgradeDelayChanged = 'minter.upgrade_delay_changed';
    titleMap.UpgradeDelayChanged = 'Minter upgrade notice changed';
  }
  if (normalizedEventName === 'AdminChanged' && emitterRole !== 'manager') {
    kindMap.AdminChanged = moduleRole + '.admin_changed';
    titleMap.AdminChanged = moduleLabel + ' admin handed to the Treasury';
  }

  // Every address field any event carries (contracts/*/src/events.rs and the OpenZeppelin
  // library events), accounts first, then module, token and payment-asset contracts, the
  // emitting contract last. Order is the order inside `addresses`.
  var addresses = unique([
    pick(data, ['actor']),
    pick(data, ['proposer']),
    pick(data, ['voter']),
    pick(data, ['bidder']),
    pick(data, ['winner']),
    pick(data, ['minter']),
    pick(data, ['authority']),
    pick(data, ['current_admin']),
    pick(data, ['proposed_admin']),
    pick(data, ['cancelled_admin']),
    pick(data, ['old_admin']),
    pick(data, ['new_admin']),
    pick(data, ['admin']),
    pick(data, ['owner']),
    pick(data, ['from']),
    pick(data, ['to']),
    pick(data, ['approver']),
    pick(data, ['operator']),
    pick(data, ['delegator']),
    pick(data, ['from_delegate']),
    pick(data, ['to_delegate']),
    pick(data, ['delegate']),
    pick(data, ['changed_by']),
    pick(data, ['cancelled_by']),
    pick(data, ['governor']),
    pick(data, ['treasury']),
    pick(data, ['target']),
    pick(data, ['token_contract']),
    pick(data, ['treasury_contract']),
    pick(data, ['token']),
    pick(data, ['payment_token']),
    pick(data, ['payment_asset']),
    pick(data, ['token_address']),
    pick(data, ['deployer']),
    pick(data, ['launch_admin']),
    pick(data, ['recipient']),
    pick(data, ['buyer']),
    pick(data, ['seller']),
    pick(data, ['author']),
    pick(data, ['contract_id'])
  ]);

  var proposalId = pick(data, ['proposal_id']);
  // A money amount only (vote weights and token counts have their own fields in args).
  var amount = pick(data, ['amount', 'total_amount', 'price', 'reserve_price']);
  var listingId = pick(data, ['listing_id']);
  var callIndex = pick(data, ['index']);
  // Batch events (SeedsGenerated, MintBatchWithMinter) carry the first id of their range.
  var tokenId = pick(data, ['token_id', 'first_token_id']);
  var func = pick(data, ['function']);
  var target = pick(data, ['target']);
  var owner = pick(data, ['to', 'owner', 'recipient']);
  var deployer = pick(data, ['deployer']);
  var tokenAddress = pick(data, ['token_address']);
  var name = pick(data, ['name']);
  // Comment text (bid comment or comment body), shortened for the summary line.
  var commentText = pick(data, ['comment', 'body']);
  function quoted() {
    if (!commentText) return '';
    var text = String(commentText).replace(/\s+/g, ' ').trim();
    return text.length > 120 ? text.slice(0, 117) + '...' : text;
  }

  function describeRange() {
    var firstRaw = pick(data, ['first_token_id']);
    var countRaw = pick(data, ['count']);
    var first = Number(firstRaw);
    var count = Number(countRaw);
    if (!firstRaw || !countRaw || !isFinite(first) || !isFinite(count) || count < 1) return 'tokens';
    if (count === 1) return '1 token (' + first + ')';
    return count + ' tokens (' + first + '-' + (first + count - 1) + ')';
  }

  var summaryFunctions = {
    ProposalQueued: function() { return 'Proposal ' + (proposalId || '') + ' queued'; },
    ProposalCreated: function() { return 'Proposal created'; },
    VoteCast: function() { return 'Vote cast on proposal'; },
    BidPlaced: function() { return 'Bid of ' + (amount || 'unknown') + ' placed on token ' + (tokenId || 'unknown') + (quoted() ? ': "' + quoted() + '"' : ''); },
    ProposalCommented: function() { return 'Comment on proposal: "' + quoted() + '"'; },
    PrimaryListingCommented: function() { return 'Comment on primary listing ' + (listingId || 'unknown') + ': "' + quoted() + '"'; },
    ListingCommented: function() { return 'Comment on token ' + (tokenId || 'unknown') + ': "' + quoted() + '"'; },
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
    AuctionLaunched: function() { return 'Auction launched' + (pick(data, ['started']) === 'true' ? ' and started' : ' paused'); },
    MarketplaceLaunched: function() { return 'Marketplace launched' + (pick(data, ['opened']) === 'true' ? ' and opened' : ' paused'); },
    SlugClaimed: function() { return 'Slug "' + (pick(data, ['slug']) || 'unknown') + '" claimed by ' + (tokenAddress || 'unknown'); },
    SlugChanged: function() { return 'Link changed to /dao/' + (pick(data, ['new_slug']) || 'unknown') + ' (was /dao/' + (pick(data, ['old_slug']) || 'unknown') + ')'; },
    PendingSlugUpdated: function() { return 'Requested slug changed to "' + (pick(data, ['slug']) || 'unknown') + '"'; },
    MetadataUpdated: function() { return 'Renamed to ' + (pick(data, ['name']) || 'unknown') + ' (' + (pick(data, ['symbol']) || '?') + ')'; },
    Migrated: function() { return 'Storage migrated from version ' + (pick(data, ['from_storage_version']) || '?') + ' to ' + (pick(data, ['to_storage_version']) || '?'); },
    // A reduction is in force from effective_ledger; a raise at once.
    UpgradeDelayChanged: function() {
      var from = pick(data, ['from_ledgers']);
      var to = pick(data, ['to_ledgers']);
      var shorter = Number(to) < Number(from);
      return 'Upgrade notice ' + (shorter ? 'shortened' : 'lengthened') + ' from ' + (from || '?') + ' to ' + (to || '?') + ' ledgers' +
        (shorter ? ', in force from ledger ' + (pick(data, ['effective_ledger']) || '?') : '');
    },
    // Topics from_hash/to_hash, data version. Hashes are shortened to 8 hex chars.
    Upgraded: function() {
      function shortHash(h) { return h ? String(h).slice(0, 8) : 'unknown'; }
      var v = pick(data, ['version']);
      return 'Contract upgraded to version ' + (v || 'unknown') + ' (' + shortHash(pick(data, ['from_hash'])) + ' -> ' + shortHash(pick(data, ['to_hash'])) + ')';
    },
    ProfileUpdated: function() { return 'Community profile updated (revision ' + (pick(data, ['seq']) || '?') + ')'; },
    MerkleRootSetEvent: function() { return 'Claim round ' + (pick(data, ['round']) || '?') + ' opened'; },
    AdminProposalCancelled: function() { return 'Admin proposal for ' + (pick(data, ['cancelled_admin']) || 'unknown') + ' cancelled'; },
    Mint: function() { return 'Minted token ' + (tokenId || '') + ' to ' + (owner || 'recipient'); },
    MintWithMinter: function() { return 'Minted token ' + (tokenId || '') + ' to ' + (owner || 'recipient'); },
    // One event per batch_mint: the range [first_token_id, first_token_id + count).
    MintBatchWithMinter: function() { return 'Minted ' + describeRange() + ' by ' + (pick(data, ['minter']) || 'minter'); },
    MintBatchEvent: function() { var count = pick(data, ['recipient_count']); return 'Minted ' + (amount || 'tokens') + ' to ' + (count || 'multiple') + ' recipients'; },
    PrimaryListingCreated: function() { return 'Primary listing ' + (listingId || 'unknown') + ' created at ' + (amount || 'unknown price'); },
    PrimaryListingPurchased: function() { return 'Primary sale: token ' + (tokenId || 'unknown') + ' bought for ' + (amount || 'unknown price') + ' (listing ' + (listingId || 'unknown') + ')'; },
    PrimaryListingCancelled: function() { return 'Primary listing ' + (listingId || 'unknown') + ' cancelled'; },
    PrimaryListingExpired: function() { return 'Primary listing ' + (listingId || 'unknown') + ' expired'; },
    SecondaryListingCreated: function() { return 'Secondary listing created for token ' + (tokenId || 'unknown') + ' at ' + (amount || 'unknown price'); },
    ListingPurchased: function() { return 'Token ' + (tokenId || 'unknown') + ' purchased for ' + (amount || 'unknown price'); },
    MerkleClaimEvent: function() { return 'Claimed ' + (amount || 'tokens') + ' via merkle proof for ' + (owner || 'recipient'); },
    DelegateChanged: function() { return (pick(data, ['delegator']) || 'A holder') + ' delegated votes to ' + (pick(data, ['to_delegate']) || 'a delegate'); },
    DaoCreated: function() { return 'DAO created by ' + (deployer || 'unknown') + (pick(data, ['launch_admin']) ? ', launch admin ' + pick(data, ['launch_admin']) : ''); },
    DaoLaunched: function() { return 'DAO launched for token ' + (tokenAddress || 'unknown'); },
    ImplementationRegistered: function() { return 'Implementation "' + (name || 'unknown') + '" registered'; },
    SeedGenerated: function() { return 'Seed generated for token ' + (tokenId || 'unknown'); },
    QuorumChanged: function() { return 'Quorum set to ' + (pick(data, ['new_quorum']) || '?') + ' bps'; },
    SeedsGenerated: function() { return 'Seeds generated for ' + describeRange(); },
    PropertyAdded: function() { return 'Property "' + (name || 'unknown') + '" added'; }
  };

  var summary = summaryFunctions[normalizedEventName] ? summaryFunctions[normalizedEventName]() : (titleMap[normalizedEventName] || String(eventName).replace(/_/g, ' '));

  // The account that acted, first match wins: a person before a contract, a sender before a
  // receiver, the caller (changed_by, admin) before the subject (authority) or a module
  // (governor, treasury). DaoLaunched names only contracts (token_address, the shared Minter).
  var actor = normalizedEventName === 'DaoLaunched' ? '' : pick(data, ['actor', 'proposer', 'voter', 'author', 'bidder', 'buyer', 'seller', 'deployer', 'winner', 'minter', 'recipient', 'from', 'approver', 'owner', 'to', 'operator', 'changed_by', 'cancelled_by', 'authority', 'admin', 'governor', 'treasury', 'delegator', 'delegate', 'current_admin', 'old_admin']);

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
  var visibility = userFacing[normalizedEventName] ? (normalizedEventName.indexOf('Proposal') === 0 || normalizedEventName === 'VoteCast' || normalizedEventName === 'DelegateChanged' ? 'governance' : 'public') : (kindMap[normalizedEventName] ? 'admin' : 'system');
  // The token self-delegates a holder on their first token: automatic, not a
  // choice anyone made. Only real delegation changes reach the public feed.
  if (normalizedEventName === 'DelegateChanged') {
    var delegator = pick(data, ['delegator']);
    var toDelegate = pick(data, ['to_delegate']);
    var fromDelegate = pick(data, ['from_delegate']);
    if (!fromDelegate && delegator && toDelegate === delegator) visibility = 'system';
  }
  // The profile written at DAO creation (seq 0) is part of setup, not news.
  if (normalizedEventName === 'ProfileUpdated' && String(pick(data, ['seq'])) === '0') visibility = 'admin';

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
    actor: toString(actor),
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
