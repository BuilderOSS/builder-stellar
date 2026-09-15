function invoke(data) {
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
    } catch {
      return String(value);
    }
  }

  return {
    event_id: data.event_id || data.id,
    deployment_id: data.deployment_id || null,
    contract_id: data.contract_id || null,
    contract_role: data.contract_role || 'unknown',
    topics: stringify(data.topics),
    data: stringify(data.data ?? data.payload ?? data),
    transaction_hash: data.transaction_hash || null,
    transaction_successful: data.transaction_successful ?? null,
    ledger_sequence: data.ledger_sequence ?? null,
    ledger_hash: data.ledger_hash ?? null,
    ledger_closed_at: data.ledger_closed_at ?? null,
    transaction_index: data.transaction_index ?? null,
    operation_index: data.operation_index ?? null,
    event_index: data.event_index ?? null,
    operation_type: data.operation_type ?? null,
    _gs_op: data._gs_op ?? null
  };
}
