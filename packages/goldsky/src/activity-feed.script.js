function invoke(data) {
  function parsePayload(value) {
    if (typeof value === 'string') {
      var trimmed = value.trim();
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try {
          return parsePayload(JSON.parse(trimmed));
        } catch {
          return null;
        }
      }
    }

    if (value && typeof value === 'object') {
      return value;
    }

    return null;
  }

  function pick(row, keys) {
    var payload = parsePayload(row.payload) || parsePayload(row.data);
    for (var i = 0; i < keys.length; i += 1) {
      var key = keys[i];
      if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
        return row[key];
      }
      if (payload && payload[key] !== undefined && payload[key] !== null && payload[key] !== '') {
        return payload[key];
      }
    }
    return undefined;
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
    ProposalCanceled: 'governance.proposal_canceled',
    ProposalCancelled: 'governance.proposal_cancelled',
    ProposalExecuted: 'governance.proposal_executed',
    ProposalExpired: 'governance.proposal_expired',
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
    AuctionCancelled: 'auction.cancelled'
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
    ProposalCanceled: 'Proposal canceled',
    ProposalCancelled: 'Proposal cancelled',
    ProposalExecuted: 'Proposal executed',
    ProposalExpired: 'Proposal expired',
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
    AuctionCancelled: 'Auction cancelled'
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
    pick(data, ['contract_id'])
  ]);

  var summary;
  if (normalizedEventName === 'ProposalQueued') {
    summary = 'Proposal ' + (pick(data, ['proposal_id']) || '') + ' queued';
  } else if (normalizedEventName === 'ProposalCreated') {
    summary = 'Proposal created';
  } else if (normalizedEventName === 'VoteCast') {
    summary = 'Vote cast on proposal';
  } else if (normalizedEventName === 'BidPlaced') {
    summary = 'Bid of ' + (pick(data, ['amount']) || 'unknown') + ' placed on token ' + (pick(data, ['token_id']) || 'unknown');
  } else if (normalizedEventName === 'AuctionSettled') {
    summary = 'Auction settled for token ' + (pick(data, ['token_id']) || 'unknown');
  } else if (normalizedEventName === 'AuctionCreated') {
    summary = 'Auction created for token ' + (pick(data, ['token_id']) || 'unknown');
  } else if (normalizedEventName === 'Execute') {
    summary = 'Executed ' + (pick(data, ['function']) || 'call') + ' on ' + (pick(data, ['target']) || 'target');
  } else if (normalizedEventName === 'Mint' || normalizedEventName === 'MintWithMinter') {
    summary = 'Minted token ' + (pick(data, ['token_id']) || '') + ' to ' + (pick(data, ['to', 'owner']) || 'recipient');
  } else if (normalizedEventName === 'BatchMint') {
    summary = 'Minted ' + (pick(data, ['amount']) || 'batch') + ' tokens';
  } else if (normalizedEventName === 'DelegateChanged') {
    summary = 'Delegation changed';
  } else if (titleMap[normalizedEventName]) {
    summary = titleMap[normalizedEventName];
  } else {
    summary = String(eventName).replace(/_/g, ' ');
  }

  return {
    activity_id: data.event_id || data.id,
    deployment_id: data.deployment_id,
    contract_id: data.contract_id,
    contract_role: data.contract_role,
    kind: kindMap[normalizedEventName] || ('contract.' + String(eventName).toLowerCase()),
    title: titleMap[normalizedEventName] || normalizedEventName,
    summary: summary,
    proposal_id: pick(data, ['proposal_id']) || null,
    proposal_number: pick(data, ['proposal_number']) || null,
    actor: pick(data, ['actor', 'proposer', 'voter', 'bidder', 'minter', 'owner', 'changed_by', 'cancelled_by', 'executor', 'governor', 'treasury', 'new_treasury', 'new_governor', 'delegator', 'delegate']) || null,
    addresses: JSON.stringify(addresses),
    ledger_sequence: data.ledger_sequence,
    timestamp: data.timestamp || data.ledger_closed_at || null,
    transaction_hash: data.transaction_hash
  };
}
