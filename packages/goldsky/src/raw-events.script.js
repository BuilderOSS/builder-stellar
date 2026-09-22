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

  // Type-safe helpers for Arrow table serialization
  function toStringOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
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

  return {
    event_id: toStringOrNull(data.event_id || data.id),
    deployment_id: toStringOrNull(data.deployment_id),
    contract_id: toStringOrNull(data.contract_id),
    contract_role: String(data.contract_role || 'unknown'),
    topics: stringify(data.topics),
    data: stringify(data.data ?? data.payload ?? data),
    transaction_hash: toStringOrNull(data.transaction_hash),
    transaction_successful: toBoolean(data.transaction_successful),
    ledger_sequence: toNumber(data.ledger_sequence),
    ledger_hash: toStringOrNull(data.ledger_hash),
    ledger_closed_at: toStringOrNull(data.ledger_closed_at),
    transaction_index: toNumber(data.transaction_index),
    operation_index: toNumber(data.operation_index),
    event_index: toNumber(data.event_index),
    operation_type: toStringOrNull(data.operation_type),
    _gs_op: toStringOrNull(data._gs_op)
  };
}
