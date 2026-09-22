-- Each contract can emit many decoded events, but event_identity is joined as
-- contract metadata. Keep one identity row per deployment and contract so
-- activity and domain views do not multiply event rows.
CREATE OR REPLACE VIEW manager.event_identity AS
SELECT DISTINCT e.deployment_id, e.contract_id,
  CASE WHEN e.contract_role = 'manager' THEN NULL ELSE m.dao_id END AS dao_id,
  m.module_role, m.module_contract
FROM chain.decoded_events e
LEFT JOIN manager.dao_modules m ON m.deployment_id = e.deployment_id AND m.module_contract = e.contract_id;
