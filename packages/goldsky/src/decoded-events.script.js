function invoke(data) {
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
    try { return JSON.parse(value); } catch (_) { return null; }
  }

  var rawTopics = json(data.topics);
  var rawData = json(data.data);
  if (!Array.isArray(rawTopics) || rawTopics.length === 0) return null;

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
    TreasuryInitialized: ['owner'], GovernorChanged: ['old_governor', 'new_governor'], DaoCreated: ['token_address', 'creator'], DaoRegistered: ['token_address', 'creator'],
     SeedGenerated: ['token_id'], MetadataInitialized: ['token'], ProposalExpired: [],
    ProposalThresholdChanged: ['caller'], QuorumBpsChanged: ['caller'], QueueDelayChanged: ['caller'], VotingDelayChanged: ['caller'], VotingPeriodChanged: ['caller'], DurationUpdated: [], ReservePriceUpdated: [], MinBidIncrementUpdated: [],
    TimeBufferUpdated: [], PaymentTokenUpdated: [], TreasuryUpdated: [], FactoryPaused: [], FactoryUnpaused: [], UpgradeApproved: [],
    ImplementationRevoked: [], ImplementationRegistered: [], CurrentImplementationsUpdated: [], PropertyAdded: [],
    PropertiesReset: [], ProjectURIUpdated: [], DescriptionUpdated: [], RendererBaseUpdated: [], ContractImageUpdated: []
  };
  var names = topicNames[eventName] || topicNames[eventName.charAt(0).toUpperCase() + eventName.slice(1).replace(/_([a-z])/g, function (_, c) { return c.toUpperCase(); })] || [];
  var topics = {};
  names.forEach(function (name, index) { if (topicValues[index] !== undefined) topics[name] = topicValues[index]; });
  var args = native(rawData);
  if (!args || typeof args !== 'object' || Array.isArray(args)) args = { value: args };

  function stringify(value) { return value === null || value === undefined ? null : String(value); }
  var result = {
    event_id: data.event_id || data.id || null, deployment_id: data.deployment_id || null, contract_id: data.contract_id || null,
    contract_role: data.contract_role === 'manager' ? 'manager' : roleForEvent(eventName), event_name: eventName,
    topic_0: stringify(topicValues[0]), topic_1: stringify(topicValues[1]), topic_2: stringify(topicValues[2]), topic_3: stringify(topicValues[3]),
    topics: JSON.stringify(topics), args: JSON.stringify(args), payload: JSON.stringify(Object.assign({}, topics, args)),
    transaction_hash: data.transaction_hash || null, transaction_successful: data.transaction_successful ?? null,
    ledger_sequence: data.ledger_sequence ?? null, ledger_hash: data.ledger_hash || null, ledger_closed_at: data.ledger_closed_at || null,
    transaction_index: data.transaction_index ?? null, operation_index: data.operation_index ?? null, event_index: data.event_index ?? null,
    operation_type: data.operation_type || null, _gs_op: data._gs_op || null, decoder_version: 'v2'
  };
  // These aliases are intentionally not declared in the Goldsky schema. They keep
  // local transform fixtures useful while consumers migrate to topics/args.
  Object.keys(topics).forEach(function (key) { result[key] = topics[key]; });
  Object.keys(args).forEach(function (key) {
    if (key !== 'args' && key !== 'topics' && key !== 'payload') result[key] = args[key];
  });
  return result;

  function roleForEvent(name) {
    var canonical = name.charAt(0).toUpperCase() + name.slice(1).replace(/_([a-z])/g, function (_, c) { return c.toUpperCase(); });
    if (/^(Dao|Factory|Upgrade|Implementation|CurrentImplementations)/.test(canonical)) return 'manager';
    if (/^(Proposal|Vote|Governor|Quorum|Voting|Queue|Veto)/.test(canonical)) return 'governor';
    if (/^(Auction|Bid|ReservePrice|MinBid|TimeBuffer|DurationUpdated|PaymentToken)/.test(canonical)) return 'auction';
    if (/^(Execute|Treasury|GovernorChanged)/.test(canonical)) return 'treasury';
    if (/^(Metadata|Property|Properties|Seed|ProjectURI|Description|RendererBase|ContractImage)/.test(canonical)) return 'metadata';
    if (/^(Transfer|Mint|BatchMint|Delegate|Approve|MintAuthority|Token|Burn)/.test(canonical)) return 'token';
    return 'unknown';
  }
}
