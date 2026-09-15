function invoke(data) {
  function scValToNative(scVal) {
    if (scVal === null || scVal === undefined) {
      return null;
    }

    if (scVal === 'void') {
      return null;
    }

    if (typeof scVal === 'string') {
      return scVal;
    }

    if (typeof scVal === 'number') {
      return scVal;
    }

    if (typeof scVal !== 'object') {
      return scVal;
    }

    if (scVal.symbol !== undefined) {
      return String(scVal.symbol);
    }

    if (scVal.address !== undefined) {
      return String(scVal.address);
    }

    if (scVal.u32 !== undefined) {
      return scVal.u32;
    }

    if (scVal.i32 !== undefined) {
      return scVal.i32;
    }

    if (scVal.u64 !== undefined) {
      return String(scVal.u64);
    }

    if (scVal.i64 !== undefined) {
      return String(scVal.i64);
    }

    if (scVal.u128 !== undefined) {
      return String(scVal.u128);
    }

    if (scVal.i128 !== undefined) {
      return String(scVal.i128);
    }

    if (scVal.u256 !== undefined) {
      return String(scVal.u256);
    }

    if (scVal.i256 !== undefined) {
      return String(scVal.i256);
    }

    if (scVal.bytes !== undefined) {
      return String(scVal.bytes);
    }

    if (scVal.string !== undefined) {
      return String(scVal.string);
    }

    if (scVal.bool !== undefined) {
      return Boolean(scVal.bool);
    }

    if (scVal.vec !== undefined) {
      if (!Array.isArray(scVal.vec)) {
        return [];
      }
      return scVal.vec.map(function (item) {
        return scValToNative(item);
      });
    }

    if (scVal.map !== undefined) {
      if (!Array.isArray(scVal.map)) {
        return {};
      }
      var result = {};
      for (var i = 0; i < scVal.map.length; i += 1) {
        var entry = scVal.map[i];
        if (entry && entry.key !== undefined && entry.val !== undefined) {
          var key = scValToNative(entry.key);
          result[String(key)] = scValToNative(entry.val);
        }
      }
      return result;
    }

    return null;
  }

  function parseJSON(str) {
    if (typeof str !== 'string') {
      return null;
    }
    try {
      return JSON.parse(str);
    } catch (e) {
      return null;
    }
  }

  function decodeGoldskyEvent(topicsStr, dataStr) {
    var topics = parseJSON(topicsStr);
    var dataObj = parseJSON(dataStr);

    if (!topics || !Array.isArray(topics) || topics.length === 0) {
      return null;
    }

    var eventName = scValToNative(topics[0]);
    if (!eventName) {
      return null;
    }

    var topicArgs = [];
    for (var i = 1; i < topics.length; i += 1) {
      topicArgs.push(scValToNative(topics[i]));
    }

    var dataArgs = {};
    if (dataObj) {
      dataArgs = scValToNative(dataObj) || {};
    }

    var result = {
      event_name: eventName
    };

    for (var key in dataArgs) {
      if (dataArgs.hasOwnProperty(key)) {
        result[key] = dataArgs[key];
      }
    }

    if (eventName === 'proposal_created' || eventName === 'ProposalCreated') {
      result.proposal_id = topicArgs[0] || null;
      result.proposer = topicArgs[1] || null;
    } else if (eventName === 'vote_cast' || eventName === 'VoteCast') {
      result.voter = topicArgs[0] || null;
      result.proposal_id = topicArgs[1] || null;
    } else if (eventName === 'proposal_queued' || eventName === 'ProposalQueued') {
      result.proposal_id = topicArgs[0] || null;
    } else if (eventName === 'proposal_canceled' || eventName === 'ProposalCanceled' || eventName === 'proposal_cancelled' || eventName === 'ProposalCancelled') {
      result.proposal_id = topicArgs[0] || null;
    } else if (eventName === 'proposal_executed' || eventName === 'ProposalExecuted') {
      result.proposal_id = topicArgs[0] || null;
    } else if (eventName === 'proposal_expired' || eventName === 'ProposalExpired') {
      result.proposal_id = topicArgs[0] || null;
    } else if (eventName === 'mint_with_minter' || eventName === 'MintWithMinter') {
      result.minter = topicArgs[0] || null;
      result.to = topicArgs[1] || null;
      result.owner = topicArgs[1] || null;
    } else if (eventName === 'mint' || eventName === 'Mint') {
      result.to = topicArgs[0] || null;
      result.owner = topicArgs[0] || null;
    } else if (eventName === 'transfer' || eventName === 'Transfer') {
      result.from = topicArgs[0] || null;
      result.to = topicArgs[1] || null;
    } else if (eventName === 'delegate_changed' || eventName === 'DelegateChanged') {
      result.delegator = topicArgs[0] || null;
    } else if (eventName === 'delegate_votes_changed' || eventName === 'DelegateVotesChanged') {
      result.delegate = topicArgs[0] || null;
    } else if (eventName === 'auction_created' || eventName === 'AuctionCreated') {
      result.token_id = topicArgs[0] || null;
    } else if (eventName === 'bid_placed' || eventName === 'BidPlaced') {
      result.token_id = topicArgs[0] || null;
      result.bidder = topicArgs[1] || null;
    } else if (eventName === 'auction_settled' || eventName === 'AuctionSettled') {
      result.token_id = topicArgs[0] || null;
    } else if (eventName === 'bid_refunded' || eventName === 'BidRefunded') {
      result.bidder = topicArgs[0] || null;
    } else if (eventName === 'auction_cancelled' || eventName === 'AuctionCancelled') {
      result.token_id = topicArgs[0] || null;
    } else if (eventName === 'execute' || eventName === 'Execute') {
      result.governor = topicArgs[0] || null;
      result.target = topicArgs[1] || null;
    } else if (eventName === 'token_initialized' || eventName === 'TokenInitialized') {
      result.owner = topicArgs[0] || null;
    } else if (eventName === 'mint_authority_changed' || eventName === 'MintAuthorityChanged') {
      result.authority = topicArgs[0] || null;
    } else if (eventName === 'batch_mint' || eventName === 'BatchMint') {
      result.minter = topicArgs[0] || null;
      result.to = topicArgs[1] || null;
      result.owner = topicArgs[1] || null;
    } else if (eventName === 'approve' || eventName === 'Approve') {
      result.owner = topicArgs[0] || null;
      result.spender = topicArgs[1] || null;
    } else if (eventName === 'governor_initialized' || eventName === 'GovernorInitialized') {
      result.owner = topicArgs[0] || null;
    } else if (eventName === 'treasury_changed' || eventName === 'TreasuryChanged') {
      result.old_treasury = topicArgs[0] || null;
      result.new_treasury = topicArgs[1] || null;
    } else if (eventName === 'token_contract_changed' || eventName === 'TokenContractChanged') {
      result.old_token_contract = topicArgs[0] || null;
      result.new_token_contract = topicArgs[1] || null;
    } else if (eventName === 'queue_delay_changed' || eventName === 'QueueDelayChanged' ||
               eventName === 'voting_delay_changed' || eventName === 'VotingDelayChanged' ||
               eventName === 'voting_period_changed' || eventName === 'VotingPeriodChanged' ||
               eventName === 'proposal_threshold_changed' || eventName === 'ProposalThresholdChanged' ||
               eventName === 'quorum_bps_changed' || eventName === 'QuorumBpsChanged') {
      result.caller = topicArgs[0] || null;
    } else if (eventName === 'governor_authority_changed' || eventName === 'GovernorAuthorityChanged') {
      result.authority = topicArgs[0] || null;
    } else if (eventName === 'auction_initialized' || eventName === 'AuctionInitialized') {
      result.owner = topicArgs[0] || null;
    } else if (eventName === 'duration_updated' || eventName === 'DurationUpdated' ||
               eventName === 'reserve_price_updated' || eventName === 'ReservePriceUpdated' ||
               eventName === 'min_bid_increment_updated' || eventName === 'MinBidIncrementUpdated' ||
               eventName === 'time_buffer_updated' || eventName === 'TimeBufferUpdated' ||
               eventName === 'payment_token_updated' || eventName === 'PaymentTokenUpdated' ||
               eventName === 'treasury_updated' || eventName === 'TreasuryUpdated') {
      // No topics for these auction parameter update events, all fields in data
    } else if (eventName === 'treasury_initialized' || eventName === 'TreasuryInitialized') {
      result.owner = topicArgs[0] || null;
    } else if (eventName === 'governor_changed' || eventName === 'GovernorChanged') {
      result.old_governor = topicArgs[0] || null;
      result.new_governor = topicArgs[1] || null;
    }

    return result;
  }

  function stringify(value) {
    if (value === undefined || value === null) {
      return null;
    }

    if (typeof value === 'string') {
      var trimmed = value.trim();
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        return value;
      }
    }

    try {
      return JSON.stringify(value);
    } catch (e) {
      return String(value);
    }
  }

  function pick(obj, keys) {
    for (var i = 0; i < keys.length; i += 1) {
      var key = keys[i];
      if (obj && obj[key] !== undefined && obj[key] !== null) {
        var val = obj[key];
        // Convert empty strings to null for consistency
        if (val === '') {
          return null;
        }
        return val;
      }
    }
    return null;
  }

  var decoded = decodeGoldskyEvent(data.topics, data.data);
  if (!decoded) {
    return null;
  }

  var eventName = decoded.event_name;
  var proposalId = pick(decoded, ['proposal_id', 'proposalId']);
  var actor = pick(decoded, ['actor', 'proposer', 'voter', 'bidder', 'minter', 'owner', 'changed_by', 'cancelled_by', 'executor', 'governor', 'treasury', 'new_treasury', 'new_governor', 'delegator', 'delegate', 'to', 'from']);
  var tokenId = pick(decoded, ['token_id', 'tokenId']);
  var amount = pick(decoded, ['amount', 'weight']);

  return {
    event_id: data.event_id || data.id || null,
    deployment_id: data.deployment_id || null,
    contract_id: data.contract_id || null,
    contract_role: data.contract_role || 'unknown',
    event_name: String(eventName),
    event_type: data.event_type || null,
    payload: stringify(decoded),
    proposal_id: proposalId || null,
    proposal_number: pick(decoded, ['proposal_number']) || null,
    actor: actor || null,
    amount: amount !== null ? String(amount) : null,
    token_id: tokenId !== null ? String(tokenId) : null,
    bidder: pick(decoded, ['bidder']) || null,
    minter: pick(decoded, ['minter']) || null,
    owner: pick(decoded, ['owner', 'to']) || null,
    from_address: pick(decoded, ['from', 'from_delegate']) || null,
    to_address: pick(decoded, ['to', 'to_delegate']) || null,
    changed_by: pick(decoded, ['changed_by']) || null,
    cancelled_by: pick(decoded, ['cancelled_by']) || null,
    executor: pick(decoded, ['executor']) || null,
    governor: pick(decoded, ['governor']) || null,
    treasury: pick(decoded, ['treasury']) || null,
    new_treasury: pick(decoded, ['new_treasury']) || null,
    new_governor: pick(decoded, ['new_governor']) || null,
    old_treasury: pick(decoded, ['old_treasury']) || null,
    old_governor: pick(decoded, ['old_governor']) || null,
    token_contract: pick(decoded, ['token_contract']) || null,
    token_contract_id: pick(decoded, ['token_contract_id']) || null,
    old_token_contract: pick(decoded, ['old_token_contract']) || null,
    new_token_contract: pick(decoded, ['new_token_contract']) || null,
    authority: pick(decoded, ['authority']) || null,
    caller: pick(decoded, ['caller']) || null,
    spender: pick(decoded, ['spender']) || null,
    target: pick(decoded, ['target']) || null,
    function: pick(decoded, ['function']) || null,
    support: pick(decoded, ['support', 'vote_type']) || null,
    reason: pick(decoded, ['reason']) || null,
    state: pick(decoded, ['state']) || null,
    eta: pick(decoded, ['eta']) || null,
    description: pick(decoded, ['description']) || null,
    snapshot_ledger: pick(decoded, ['snapshot', 'vote_snapshot']) || null,
    vote_start_timestamp: pick(decoded, ['vote_start']) || null,
    deadline_ledger: pick(decoded, ['deadline', 'vote_end']) || null,
    action_count: pick(decoded, ['action_count']) || null,
    transaction_hash: data.transaction_hash || null,
    transaction_successful: data.transaction_successful !== null && data.transaction_successful !== undefined ? data.transaction_successful : null,
    ledger_sequence: data.ledger_sequence !== null && data.ledger_sequence !== undefined ? data.ledger_sequence : null,
    ledger_hash: data.ledger_hash || null,
    ledger_closed_at: data.ledger_closed_at || null,
    transaction_index: data.transaction_index !== null && data.transaction_index !== undefined ? data.transaction_index : null,
    operation_index: data.operation_index !== null && data.operation_index !== undefined ? data.operation_index : null,
    event_index: data.event_index !== null && data.event_index !== undefined ? data.event_index : null,
    operation_type: data.operation_type || null,
    _gs_op: data._gs_op || null
  };
}
