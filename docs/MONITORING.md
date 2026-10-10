# Production Monitoring Guide

This document outlines the monitoring strategy for the Stellar DAO Builder production deployment.

## Overview

The monitoring system has 3 tiers:

1. **Goldsky Pipeline Monitoring** - Event ingestion health
2. **Database Monitoring** - Query performance and data freshness
3. **Application Health Checks** - API and derived view health

## Tier 1: Goldsky Pipeline Monitoring

### Dashboard
- **URL**: [Goldsky Dashboard](https://app.goldsky.com/)
- **Metric**: Event processing lag
- **Check**: Pipeline running status

### What to Monitor
- **Pipeline Status**: Should always be `running`
- **Processing Lag**: Should be < 100 blocks behind chain tip
- **Error Rate**: Should be 0% (no transform failures)
- **Throughput**: Should match network event rate

### Alerts to Set Up
```
1. Pipeline stopped
   - Trigger: Status != 'running' for > 1 minute
   - Action: Check Goldsky logs, restart if needed

2. High processing lag
   - Trigger: Lag > 100 blocks
   - Action: Monitor for network congestion or pipeline slowdown

3. Transform errors
   - Trigger: Error count > 0
   - Action: Check error logs for malformed events
```

### Manual Check
```bash
# View pipeline status in Goldsky dashboard
# Or via API if configured
goldsky pipeline get dao-stellar-events-testnet
goldsky pipeline logs dao-stellar-events-testnet --tail -n 100
```

---

## Tier 2: Database Monitoring (Neon)

### Dashboard
- **URL**: Neon Console → Projects → stellar-builder → Monitoring
- **Metrics**: Connection pool, query performance, storage

### What to Monitor

#### A. Event Processing Freshness
```sql
-- Check latest event (should update every ~5 seconds)
SELECT
  deployment_id,
  MAX(ledger_sequence) as latest_ledger,
  MAX(to_timestamp(NULLIF(ledger_closed_at, '')::numeric / 1000)) as latest_timestamp,
  NOW() - MAX(to_timestamp(NULLIF(ledger_closed_at, '')::numeric / 1000)) as lag
FROM chain.decoded_events
GROUP BY deployment_id;

-- Alert: Lag > 5 minutes = event processing issue
-- Alert: No new events in 10 minutes = pipeline stopped
```

#### B. Event Processing Rate
```sql
-- Check events per minute (for last hour)
SELECT
  date_trunc('minute', to_timestamp(NULLIF(ledger_closed_at, '')::numeric / 1000)) as minute,
  COUNT(*) as events_count
FROM chain.decoded_events
WHERE to_timestamp(NULLIF(ledger_closed_at, '')::numeric / 1000) > NOW() - INTERVAL '1 hour'
GROUP BY 1
ORDER BY 1 DESC
LIMIT 60;

-- Alert: Rate drop > 50% = potential Goldsky issue
```

#### C. Slow Query Detection
```sql
-- Enable slow query logging in Neon
-- Find slow queries (> 1000ms)
SELECT
  query,
  calls,
  mean_exec_time,
  max_exec_time,
  (max_exec_time * calls)::int as total_time
FROM pg_stat_statements
WHERE mean_exec_time > 1000
ORDER BY total_time DESC
LIMIT 10;

-- Alert: View queries > 5s = needs optimization
```

#### D. Connection Pool Health
```sql
-- Check active connections
SELECT
  datname,
  usename,
  count(*) as connection_count
FROM pg_stat_activity
GROUP BY datname, usename;

-- Alert: Connection count > 80% of max = pool exhaustion risk
```

### Neon Console Alerts

Set up in Neon Console:
1. **Storage usage** - Alert at 80% capacity
2. **Connection count** - Alert if > 50 concurrent
3. **Database size** - Alert if growing too fast

### Manual Checks (SQL)

Run these queries every 4 hours:

```sql
-- 1. Event freshness
SELECT MAX(ledger_sequence) as latest_event FROM chain.decoded_events;

-- 2. DAO count
SELECT COUNT(*) as dao_count FROM manager.daos;

-- 3. Activity feed
SELECT COUNT(*) as recent_events FROM app.activity_feed_events
WHERE ledger_closed_at > (EXTRACT(epoch FROM NOW() - INTERVAL '1 hour') * 1000)::text;

-- 4. View health (test manager.daos query)
SELECT COUNT(*) FROM manager.daos WHERE status = 'operational';

-- 5. Check for NULL admin_addresses (creator tracking)
SELECT COUNT(*) as finalized_daos_no_creator
FROM manager.daos
WHERE status = 'operational' AND creator IS NULL;
```

---

## Tier 3: Application Health Endpoint

### Endpoint
- **URL**: `GET /api/health`
- **Response**: JSON with system metrics
- **Frequency**: Check every 5 minutes

### Response Format
```json
{
  "status": "healthy",  // or "degraded" / "error"
  "timestamp": "2024-01-15T10:30:45.123Z",
  "metrics": {
    "latest_ledger": 12345678,
    "dao_count": 42,
    "recent_activity_1h": 156
  },
  "performance_ms": {
    "event_check": 45,
    "dao_check": 230,
    "activity_check": 150,
    "total": 425
  },
  "alerts": {
    "high_event_lag": false,
    "no_recent_activity": false,
    "db_slow": false
  }
}
```

### What to Monitor
- **status**: Should be `healthy` (503 if degraded)
- **latest_ledger**: Should always increase
- **dao_count**: Should be stable or growing
- **recent_activity_1h**: Should have consistent activity
- **performance_ms.total**: Should be < 5000ms

### Set Up Monitoring

**Option 1: Manual Health Checks**
```bash
# Terminal monitoring
watch -n 30 'curl -s http://localhost:4242/api/health | jq .'

# Or via cron for alerts (email if fails)
*/5 * * * * curl -sf http://localhost:4242/api/health || echo "Health check failed" | mail
```

**Option 2: Uptime Monitoring Service**
- **Recommended**: UptimeRobot, Healthchecks.io, or similar
- **Config**: Check `/api/health` every 5 minutes
- **Alert**: Slack/email if returns 503 or 500
- **Cost**: Free tier usually sufficient

**Option 3: Application Monitoring (Vercel/Next.js)**
- Built-in monitoring in Vercel dashboard
- Set up alerts for API errors
- Track response times

---

## Contract Events and Maintenance

Behavior of the contracts that monitoring should account for. Key events by (contract address, event name): `admin_changed` is emitted by the Manager and by every module.

### Events to watch

| Event (contract) | Meaning | Action |
| --- | --- | --- |
| `<Module>Launched` (each module) | One-shot Setup to Live handoff, emitted by `launch_dao` (`token_launched` carries `minters`; `auction_launched` `started`; `marketplace_launched` `opened`). Each module also emits `AdminChanged` (launch admin -> Treasury). | Expect exactly one launch event and one `admin_changed` per module per DAO; a DAO with `DaoLaunched` but a missing module event indicates an indexing gap. Any later module `admin_changed` is impossible by design and should alert. |
| `SlugClaimed` (Manager) | Emitted by `launch_dao`; the slug is now permanent. | A `DaoLaunched` without `SlugClaimed` in the same transaction indicates an indexing gap. |
| `Migrated` (each module) | Storage layout migrated after an upgrade. | Expect it right after an `Upgraded` for releases that change storage. |
| `DaoLaunched` (Manager) | Includes `launch_auction`, `launch_marketplace`, `enable_minter`. | Alert on a DAO stuck in setup (no `DaoLaunched`) beyond your expected window. |
| `RefundDeferred { #token_id, #bidder, amount }` (Auction) | A refund push to the outbid bidder failed and was credited. `amount` is the increment, not the running total. | Informational per event. Outstanding balance per bidder is the sum of `RefundDeferred` minus the sum of `RefundWithdrawn`; alert on balances that stay non-zero for days. |
| `RefundWithdrawn { #bidder, amount }` (Auction) | Bidder pulled the credit with `withdraw_refund`. | Clears the outstanding balance. |
| `BidRefunded` (Auction) | Emitted only when the push succeeded. | None. |
| `Execute { #governor, #target, #proposal_id, function, index }` (Treasury) | Emitted once per call in a proposal; group by `proposal_id`. Old shape was `(governor, target)` with `{function}`. | A `ProposalExecuted` (Governor) without matching `Execute` rows in the same transaction indicates a decoder problem. |
| `ProposalExecuted` (Governor) | Emitted inside `governor.consume` during `treasury.execute`, same transaction as the `Execute` events. | None. |
| `PrimaryListingCreated/Purchased/Cancelled/Expired` (Marketplace) | Lazy primary sale lifecycle, keyed by `listing_id`. | Primary and secondary ids are separate keyspaces. |
| `AdminProposed` / `AdminChanged` / `PlatformMinterSet` / `LatestImplementationSet` (Manager) | Admin handover, platform minter registration and latest-implementation selection. | Alert on any occurrence; these are rare, high-privilege changes. |

A failing action in a proposal reverts the whole `treasury.execute` transaction, so a failed execution produces no events; the proposal stays Queued and is retried until it expires (14 days after its ETA). `governor.execute` always fails with `UseTreasuryExecute` (7507) and should never appear as a successful call.

### Ops task: bump artwork TTL

The network caps entry TTL at about 180 days (about 3,110,400 ledgers). Metadata artwork entries (properties, items, IPFS groups) are extended only when touched, so unread artwork can expire. Someone must periodically call the permissionless `metadata.bump_artwork_ttl(start, limit)` for every DAO:

- Use windows of at most 50 (`limit` above 50 fails with `LimitTooHigh`, 7309).
- The entries are indexed as all items of all properties in order, then the IPFS groups. Start at 0, call with `limit` 50, and set the next `start` to the returned value (`min(start + limit, total)`); stop when the returned value stops advancing, which is the total. Repeat the full sweep well inside the 180-day cap, for example monthly.
- Module instance TTL (170 days when under 60 days remain) renews on any state-changing call; a DAO with no activity for months needs a touch as well.

Prefer paginated getters (`get_items`, `get_ipfs_group`) over `get_properties`/`get_ipfs_data` in monitoring queries; the latter are O(total).

### Ops task: registry TTL and Manager caveats

- Manager registry entries (`Implementation`, `UpgradeApproval`, `LatestImplementation`, `PendingAdmin`, slugs) are persistent and extended only when touched (when fewer than 30 days remain); the network caps TTL at about 180 days. `bump_slug_ttl(slug)` renews a claimed slug permissionlessly. Periodically touch them (a read of `get_implementation` / `is_upgrade_approved` extends them) and run `stellar contract restore` for any that were archived. Keep every module able to `sync_version` / `upgrade`, which depends on those entries being live.
- TOCTOU: `set_current_implementations` can change between a creator signing `create_dao` and its execution. After creation, verify `DaoCreated.wasm_hashes` matches what was intended.
- Revoking a hash does not affect already-deployed DAOs' operation; it blocks new upgrades to it and `launch_dao` of pending DAOs whose modules still run it (`PendingDaoUsesRevokedImplementation`, 7121).
- `get_latest_implementation(name)` returns the hash the admin last selected with `set_latest_implementation` (registration does not move it) and `None` after that hash is revoked. Monitoring and tooling must use `get_implementation(hash)` and the `Current*` hashes for security decisions.

Error codes are unique across contracts: each crate owns a block of 100 codes in 7000-7899 (see [SECURITY_MODEL.md](./SECURITY_MODEL.md#error-codes)), so a code alone identifies its contract.

---

## Alert Thresholds & Actions

| Alert | Threshold | Action |
|-------|-----------|--------|
| **Pipeline Stopped** | 5+ min no new events | Check Goldsky logs, restart if needed |
| **High Event Lag** | > 5 minutes | Check network/pipeline performance |
| **No Recent Activity** | 0 events in 1 hour | Verify contracts deployed, check Stellar network |
| **Slow DB Queries** | View query > 5s | Check indexes, consider materialized views |
| **Health Check Failed** | 2+ consecutive fails | Check API service, database connection |
| **Connection Pool** | > 80% capacity | Investigate connection leaks, optimize queries |
| **Storage Growth** | > 20% per day | Analyze event volume, consider partitioning |
| **NULL Creator** | > 0 launched DAOs without creator | Verify DaoLaunched event includes creator field |

---

## Week 1 Monitoring Checklist

### Daily (first 3 days)
- [ ] Check Goldsky pipeline status in dashboard
- [ ] Run freshness queries on database
- [ ] Test `/api/health` endpoint
- [ ] Verify event ingestion rate

### Every 4 hours
- [ ] Query event count and DAO count
- [ ] Check for errors in Goldsky logs
- [ ] Monitor latest ledger sequence
- [ ] Verify no NULL creators in finalized DAOs

### Daily (days 4-7)
- [ ] Review slow query logs
- [ ] Check connection pool usage
- [ ] Analyze event processing rate trends
- [ ] Test database failover readiness

### End of Week
- [ ] Document any issues encountered
- [ ] Update alert thresholds based on observed patterns
- [ ] Set up automated monitoring if not done yet
- [ ] Schedule weekly monitoring review

---

## Troubleshooting

### No new events in database

**Symptoms**: `latest_ledger` not increasing, health check lag = high

**Checks**:
1. Is Goldsky pipeline running?
   - Check Goldsky dashboard
   - Verify pipeline status: `goldsky pipeline get dao-stellar-events-testnet`

2. Is Stellar network responding?
   - Check Stellar status page
   - Verify network has new blocks: `curl https://horizon.stellar.org/ledgers?limit=1 | jq .`

3. Is database accepting events?
   - Check connection errors in Neon logs
   - Verify Goldsky secret_name is correct

**Fix**:
- Restart pipeline: `goldsky pipeline update dao-stellar-events-testnet --restart`
- Verify pipeline configuration
- Check database credentials

### Slow queries on manager.daos

**Symptoms**: `/api/health` returns slowly, view queries timeout

**Checks**:
```sql
EXPLAIN ANALYZE
SELECT COUNT(*) FROM manager.daos WHERE deployment_id = 'testnet';

-- Should use indexes, not full table scan
```

**Fix**:
- Add missing indexes (see migration 0001)
- Consider materialized view if volume > 100k events
- Increase work_mem in Neon config

### High connection count

**Symptoms**: Connection pool exhausted, new requests fail

**Checks**:
```sql
SELECT * FROM pg_stat_activity WHERE state != 'idle';
```

**Fix**:
- Identify long-running queries, terminate if safe
- Check application for connection leaks
- Increase max_connections in Neon if available

### NULL creators in finalized DAOs

**Symptoms**: DAO admin tracking broken

**Check**:
```sql
SELECT COUNT(*) FROM manager.daos WHERE status = 'operational' AND creator IS NULL;
```

**Fix**:
- Verify DaoLaunched event includes creator field
- If not, add to event struct and redeploy contract
- Backfill from DaoCreated event via join

---

## Escalation Process

### Level 1: Automated Alerts
- Goldsky pipeline alerts
- Health check failures
- Database performance alerts

**Action**: Check dashboard, review logs, try basic restart

### Level 2: Manual Investigation
- Slow queries requiring analysis
- Connection pool issues
- Missing data patterns

**Action**: Run diagnostic queries, check Neon console, review recent deploys

### Level 3: Critical Issues
- No events for > 30 minutes
- Database corruption indicators
- Complete service outage

**Action**: Page on-call engineer, consider rollback, notify users

---

## Week 1→2 Transition

After week 1 of manual monitoring:
- Set up automated alerting (PagerDuty/Slack)
- Enable Sentry error tracking
- Configure Datadog or similar APM
- Create runbooks for common issues
- Train team on escalation procedures
