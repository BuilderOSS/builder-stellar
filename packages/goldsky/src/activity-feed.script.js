function invoke(data) {
  try {
    if (!data) return null;

    // Normalize all incoming fields to ensure consistent types across all rows
    // This is critical for Arrow table serialization - all rows must have identical types
    if (!data.topics || data.topics === null || data.topics === undefined || typeof data.topics !== 'string') {
      data.topics = '{}';
    }
    if (!data.args || data.args === null || data.args === undefined || typeof data.args !== 'string') {
      data.args = '{}';
    }
    if (data.ledger_sequence === null || data.ledger_sequence === undefined || typeof data.ledger_sequence !== 'number') {
      data.ledger_sequence = 0;
    }
    if (data.transaction_index === null || data.transaction_index === undefined || typeof data.transaction_index !== 'number') {
      data.transaction_index = 0;
    }
    if (data.operation_index === null || data.operation_index === undefined || typeof data.operation_index !== 'number') {
      data.operation_index = 0;
    }
    if (data.event_index === null || data.event_index === undefined || typeof data.event_index !== 'number') {
      data.event_index = 0;
    }

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
    var payload = parsePayload(row.args) || parsePayload(row.topics) || parsePayload(row.payload) || parsePayload(row.data);
    for (var i = 0; i < keys.length; i += 1) {
      var key = keys[i];
      if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
        return String(row[key]);
      }
      if (payload && payload[key] !== undefined && payload[key] !== null && payload[key] !== '') {
        return String(payload[key]);
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
    TokenInitialized: true, Mint: true, MintWithMinter: true, BatchMint: true,
    Transfer: true, DelegateChanged: true, DelegateVotesChanged: true,
    ProposalCreated: true, ProposalQueued: true, VoteCast: true,
    ProposalCancelled: true, ProposalCanceled: true, ProposalExecuted: true,
    AuctionCreated: true, BidPlaced: true,
    AuctionSettled: true, BidRefunded: true, AuctionCancelled: true,
    DaoCreated: true, DaoRegistered: true, DaoFinalized: true
  };

  var kindMap = {
    TokenInitialized: 'token.initialized',
    Mint: 'token.mint',
    MintWithMinter: 'token.mint',
    BatchMint: 'token.batch_mint',
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
    TreasuryChanged: 'governance.treasury_changed',
    TokenContractChanged: 'governance.token_contract_changed',
    QueueDelayChanged: 'governance.queue_delay_changed',
    VotingDelayChanged: 'governance.voting_delay_changed',
    VotingPeriodChanged: 'governance.voting_period_changed',
    ProposalThresholdChanged: 'governance.proposal_threshold_changed',
    QuorumBpsChanged: 'governance.quorum_bps_changed',
    GovernorAuthorityChanged: 'governance.authority_changed',
    TreasuryInitialized: 'treasury.initialized',
    GovernorChanged: 'treasury.governor_changed',
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
    TreasuryUpdated: 'auction.treasury_updated',
    BidRefunded: 'auction.bid_refunded',
    AuctionCancelled: 'auction.cancelled',
    DaoCreated: 'manager.dao_created',
    DaoRegistered: 'manager.dao_registered',
    DaoFinalized: 'manager.dao_finalized',
    FactoryPaused: 'manager.factory_paused',
    FactoryUnpaused: 'manager.factory_unpaused',
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
    ContractImageUpdated: 'metadata.contract_image_updated'
  };

  var titleMap = {
    TokenInitialized: 'Token initialized',
    Mint: 'Token minted',
    MintWithMinter: 'Token minted',
    BatchMint: 'Batch mint completed',
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
    TreasuryChanged: 'Treasury changed',
    TokenContractChanged: 'Token contract changed',
    QueueDelayChanged: 'Queue delay updated',
    VotingDelayChanged: 'Voting delay updated',
    VotingPeriodChanged: 'Voting period updated',
    ProposalThresholdChanged: 'Proposal threshold updated',
    QuorumBpsChanged: 'Quorum updated',
    GovernorAuthorityChanged: 'Governor authority changed',
    TreasuryInitialized: 'Treasury initialized',
    GovernorChanged: 'Governor changed',
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
    TreasuryUpdated: 'Treasury updated',
    BidRefunded: 'Bid refunded',
    AuctionCancelled: 'Auction cancelled',
    DaoCreated: 'DAO created',
    DaoRegistered: 'DAO registered',
    DaoFinalized: 'DAO finalized',
    FactoryPaused: 'Factory paused',
    FactoryUnpaused: 'Factory unpaused',
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
    ContractImageUpdated: 'Contract image updated'
  };

  var addresses = unique([
    pick(data, ['actor']),
    pick(data, ['proposer']),
    pick(data, ['bidder']),
    pick(data, ['minter']),
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
    pick(data, ['token_address'])
  ]);

  var proposalId = pick(data, ['proposal_id']);
  var amount = pick(data, ['amount']);
  var tokenId = pick(data, ['token_id']);
  var func = pick(data, ['function']);
  var target = pick(data, ['target']);
  var owner = pick(data, ['to', 'owner']);
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
    Execute: function() { return 'Executed ' + (func || 'call') + ' on ' + (target || 'target'); },
    Mint: function() { return 'Minted token ' + (tokenId || '') + ' to ' + (owner || 'recipient'); },
    MintWithMinter: function() { return 'Minted token ' + (tokenId || '') + ' to ' + (owner || 'recipient'); },
    BatchMint: function() { return 'Minted ' + (amount || 'batch') + ' tokens'; },
    DelegateChanged: function() { return 'Delegation changed'; },
    DaoCreated: function() { return 'DAO created by ' + (creator || 'unknown'); },
    DaoRegistered: function() { return 'DAO registered for token ' + (tokenAddress || 'unknown'); },
    DaoFinalized: function() { return 'DAO finalized for token ' + (tokenAddress || 'unknown'); },
    ImplementationRegistered: function() { return 'Implementation "' + (name || 'unknown') + '" registered'; },
    SeedGenerated: function() { return 'Seed generated for token ' + (tokenId || 'unknown'); },
    PropertyAdded: function() { return 'Property "' + (name || 'unknown') + '" added'; }
  };

  var summary = summaryFunctions[normalizedEventName] ? summaryFunctions[normalizedEventName]() : (titleMap[normalizedEventName] || String(eventName).replace(/_/g, ' '));

  // Ensure consistent string representation for JSON fields to avoid Arrow type inference issues
  var topicsValue = data.topics;
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

  var argsValue = data.args;
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
    actor: toString(pick(data, ['actor', 'proposer', 'voter', 'bidder', 'minter', 'owner', 'changed_by', 'cancelled_by', 'executor', 'governor', 'treasury', 'new_treasury', 'new_governor', 'delegator', 'delegate', 'creator'])),
    addresses: toString(JSON.stringify(addresses || [])),
    ledger_sequence: toNumber(data.ledger_sequence),
    transaction_index: toNumber(data.transaction_index),
    operation_index: toNumber(data.operation_index),
    event_index: toNumber(data.event_index),
    ledger_closed_at: toString(data.ledger_closed_at),
    transaction_hash: toString(data.transaction_hash)
  };
  } catch (e) {
    console.error('Activity feed transform error:', e.message, 'event_id:', data?.event_id);
    return null;
  }
}
