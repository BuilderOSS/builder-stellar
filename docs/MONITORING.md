# Application and indexer monitoring

Monitor database access, matching event freshness, RPC access, and contract TTL separately. This page describes implemented endpoints/manual checks; it does not claim deployed alerting or a production on-call system.

## Health endpoints

| Endpoint | Meaning and status |
| --- | --- |
| `GET /api/health` | RPC latest ledger, most recent deployment activity ledger, DAO count, recent activity, timings, alerts. `healthy` or `degraded` returns 200; `unhealthy` returns 503; outer error returns 500. |
| `GET /api/goldsky/health` | Read-only `app.indexer_status` query. `healthy` returns 200, `unhealthy` 503; no-store. A missing row can still return healthy with null latest ledger/zero events. |

The first endpoint emits `rpc_latest_ledger`, `db_latest_ledger`, `pipeline_lag_ledgers`, `dao_count`, `recent_activity_1h`; timings include `rpc_check`, `event_check`, `dao_check`, `activity_check`, `total`. Alerts include `high_event_lag`, `no_recent_activity`, `db_slow`, `rpc_unreachable`. High lag is >100 ledgers; DB slow is total >5 seconds. RPC uses `NEXT_PUBLIC_STELLAR_RPC_URL` if set, otherwise the testnet URL; verify that separately for non-testnet operation.

```bash
# Use your configured app origin; these are HTTP reads, not performed by this guide.
curl -s http://localhost:4242/api/health
curl -s http://localhost:4242/api/goldsky/health
```

An inactive DAO deployment can have no recent matching events while the pipeline is processing normally. Event age is not source processing lag. A 200 response is not proof that the last mutation is indexed or that every contract is usable.

Sources: [health route](../apps/web/src/app/api/health/route.ts), [Goldsky route](../apps/web/src/app/api/goldsky/health/route.ts), [health helper](../apps/web/src/lib/goldsky.ts).

## Database/event checks

Use the read-only role for views; raw-event checks require operator access. Always bind the actual `manager:<address>` deployment ID, not `testnet`.

```sql
SELECT * FROM app.indexer_status
WHERE deployment_id = 'manager:<Manager contract address>';

SELECT dao_id, status, created_at, launched_at
FROM manager.daos
WHERE deployment_id = 'manager:<Manager contract address>';

-- Operator-only raw-event check:
SELECT max(ledger_sequence), max(chain.ledger_closed_at_ts(ledger_closed_at))
FROM chain.decoded_events
WHERE deployment_id = 'manager:<Manager contract address>';
```

The timestamp helper accepts epoch milliseconds, epoch seconds, ISO timestamps, and empty values. Do not compare timestamp text lexicographically. DAO creator is projected from `DaoCreated.deployer`; a missing creator is a decoding/projection investigation, not a reason to add a creator field to `DaoLaunched`.

## Protocol signals

- A launched DAO has one `DaoLaunched`, one `SlugClaimed` and, per module, one `<Module>Launched` (`TokenLaunched`, `GovernorLaunched`, …) and one `AdminChanged` (launch admin -> Treasury), all in the launch transaction. `admin_changed` is also the Manager's own admin event: key events by (emitter, name). A missing module event is an indexing gap; a later module `admin_changed` is impossible by design and should alert.
- `Migrated` should follow `Upgraded` for releases that change storage. Manager `AdminProposed` / `AdminChanged` / `PlatformMinterSet` / `LatestImplementationSet` are rare, high-privilege changes worth alerting on.
- `governor.execute` always fails with `UseTreasuryExecute` (7507). Error codes are unique across contracts (one block of 100 per crate, 7000-7899), so a code alone identifies its contract.
- Successful execution has Governor `ProposalExecuted` and one Treasury `Execute` per action in one transaction. Failure emits no surviving execution events. The app validates complete ordered receipts; confirmed execution and unavailable receipt are separate states.
- Deferred refunds: sum `RefundDeferred` minus `RefundWithdrawn` per bidder. `BidRefunded` records a successful push.
- Primary/secondary sale identifiers differ. An open listing past sale expiry may await permissionless cleanup; it is not purchasable merely because the index still says open.
- Watch registry/admin changes and deployed hash transitions using their actual event identities. Revocation blocks pending launch (`PendingDaoUsesRevokedImplementation`, 7121) and target upgrades, not normal operation of an already-Launched DAO. `get_latest_implementation` returns the admin-selected hash and `None` once it is revoked; use `get_implementation(hash)` for security decisions.

## Maintenance and investigation

Use [TTL maintenance](TTL_ECONOMICS.md) for shared-code renewal and explicit artwork windows. Manager registry entries (implementations, approvals, latest selection, pending admin, slugs) are persistent and renewed only when touched; `bump_slug_ttl(slug)` renews a claimed slug permissionlessly. Artwork reads page at most 50 entries (`LimitTooHigh`, 7309). The admin report is code/artwork-specific and not an automatic sweep of all persistent rights. No renewal scheduler is installed.

For missing indexed data, first compare artifact/network/start ledger and scoped contract IDs; then inspect pipeline processing/transform errors with the configured Goldsky CLI. The wrapper and CLI prerequisite caveat are in [the package README](../packages/goldsky/README.md). Do not print secrets to diagnose configuration.

Schema/permission/reset procedures belong in [db/README.md](../db/README.md). A reset deletes data and is not a routine health fix. There is no guaranteed ingestion latency or deployed alert threshold beyond the endpoint calculations above.
