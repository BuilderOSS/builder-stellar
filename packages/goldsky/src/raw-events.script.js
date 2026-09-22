function invoke(data) {
  if (!data) return null;

  function stringify(value) {
    if (value === undefined || value === null) {
      return '{}';  // Default to empty JSON object string
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
  // CRITICAL: For Arrow serialization, all rows must have same type in each column
  // Never mix null with values for string columns - use empty string for missing values
  function toStringOrEmpty(value) {
    if (value === null || value === undefined || value === '') return '';
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
    event_id: toStringOrEmpty(data.event_id || data.id),
    deployment_id: toStringOrEmpty(data.deployment_id),
    contract_id: toStringOrEmpty(data.contract_id),
    contract_role: toStringOrEmpty(data.contract_role) || 'unknown',
    topics: stringify(data.topics),
    data: stringify(data.data ?? data.payload ?? data),
    transaction_hash: toStringOrEmpty(data.transaction_hash),
    transaction_successful: toBoolean(data.transaction_successful),
    ledger_sequence: toNumber(data.ledger_sequence),
    ledger_hash: toStringOrEmpty(data.ledger_hash),
    ledger_closed_at: toStringOrEmpty(data.ledger_closed_at),
    transaction_index: toNumber(data.transaction_index),
    operation_index: toNumber(data.operation_index),
    event_index: toNumber(data.event_index),
    operation_type: toStringOrEmpty(data.operation_type),
    _gs_op: toStringOrEmpty(data._gs_op)
  };
}
