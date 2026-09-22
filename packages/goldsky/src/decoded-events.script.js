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
  var topicNames = {
    ProposalCreated: ['proposal_id', 'proposer'], VoteCast: ['voter', 'proposal_id'],
    ProposalQueued: ['proposal_id'], ProposalCancelled: ['proposal_id'], ProposalCanceled: ['proposal_id'], ProposalExecuted: ['proposal_id'],
    MintWithMinter: ['minter', 'to'], Mint: ['to'], BatchMint: ['minter', 'to'], Transfer: ['from', 'to'], Approve: ['owner', 'spender'],
    DelegateChanged: ['delegator'], DelegateVotesChanged: ['delegate'], AuctionCreated: ['token_id'], BidPlaced: ['token_id', 'bidder'],
    AuctionSettled: ['token_id'], BidRefunded: ['token_id', 'bidder'], AuctionCancelled: ['token_id'], Execute: ['governor', 'target'],
    TokenInitialized: ['owner'], MintAuthorityChanged: ['authority'], GovernorInitialized: ['owner'], TreasuryChanged: ['old_treasury', 'new_treasury'],
    TokenContractChanged: ['old_token_contract', 'new_token_contract'], GovernorAuthorityChanged: ['authority'], AuctionInitialized: ['owner'],
    TreasuryInitialized: ['owner'], GovernorChanged: ['old_governor', 'new_governor'], DaoCreated: ['token_address', 'creator'], DaoRegistered: ['token_address', 'creator'], DaoFinalized: ['token_address'],
     SeedGenerated: ['token_id'], MetadataInitialized: ['token'], ProposalExpired: [],
    ProposalThresholdChanged: ['caller'], QuorumBpsChanged: ['caller'], QueueDelayChanged: ['caller'], VotingDelayChanged: ['caller'], VotingPeriodChanged: ['caller'], DurationUpdated: [], ReservePriceUpdated: [], MinBidIncrementUpdated: [],
    TimeBufferUpdated: [], PaymentTokenUpdated: [], TreasuryUpdated: [], FactoryPaused: [], FactoryUnpaused: [], UpgradeApproved: [],
    ImplementationRevoked: [], ImplementationRegistered: [], CurrentImplementationsUpdated: [], PropertyAdded: [],
    PropertiesReset: [], ProjectURIUpdated: [], DescriptionUpdated: [], RendererBaseUpdated: [], ContractImageUpdated: []
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
    contract_role: String(data.contract_role === 'manager' ? 'manager' : roleForEvent(eventName)),
    event_name: String(eventName.toLowerCase()),
    topic_0: toStringOrEmpty(topicValues[0]),
    topic_1: toStringOrEmpty(topicValues[1]),
    topic_2: toStringOrEmpty(topicValues[2]),
    topic_3: toStringOrEmpty(topicValues[3]),
    topics: String(JSON.stringify(topics)),
    args: String(JSON.stringify(args)),
    payload: String(JSON.stringify(Object.assign({}, topics, args))),
    transaction_hash: toStringOrEmpty(data.transaction_hash),
    transaction_successful: toBoolean(data.transaction_successful),
    ledger_sequence: toNumber(data.ledger_sequence),
    ledger_hash: toStringOrEmpty(data.ledger_hash),
    ledger_closed_at: toStringOrEmpty(data.ledger_closed_at),
    transaction_index: toNumber(data.transaction_index),
    operation_index: toNumber(data.operation_index),
    event_index: toNumber(data.event_index),
    operation_type: toStringOrEmpty(data.operation_type),
    _gs_op: toStringOrEmpty(data._gs_op),
    decoder_version: 'v2'
  };
  // These aliases are intentionally not declared in the Goldsky schema. They keep
  // local transform fixtures useful while consumers migrate to topics/args.
  // Note: These dynamic fields are not in the official schema, but must maintain
  // type consistency for Arrow serialization - convert all to strings or empty.
  Object.keys(topics).forEach(function (key) { result[key] = toStringOrEmpty(topics[key]); });
  Object.keys(args).forEach(function (key) {
    if (key !== 'args' && key !== 'topics' && key !== 'payload') result[key] = toStringOrEmpty(args[key]);
  });
    return result;

    function roleForEvent(name) {
      var canonical = toCanonical(name);
      if (/^(Dao|Factory|Upgrade|Implementation|CurrentImplementations)/.test(canonical)) return 'manager';
      if (/^(Proposal|Vote|Governor|Quorum|Voting|Queue|Veto)/.test(canonical)) return 'governor';
      if (/^(Auction|Bid|ReservePrice|MinBid|TimeBuffer|DurationUpdated|PaymentToken)/.test(canonical)) return 'auction';
      if (/^(Execute|Treasury|GovernorChanged)/.test(canonical)) return 'treasury';
      if (/^(Metadata|Property|Properties|Seed|ProjectURI|Description|RendererBase|ContractImage)/.test(canonical)) return 'metadata';
      if (/^(Transfer|Mint|BatchMint|Delegate|Approve|MintAuthority|Token|Burn)/.test(canonical)) return 'token';
      return 'unknown';
    }
  } catch (e) {
    console.error('Decoder error:', e.message, 'event_id:', data?.event_id);
    return null;
  }
}
