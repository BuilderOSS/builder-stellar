# TTL maintenance and rent

Time-to-live (TTL) is measured in ledgers, independently for shared WASM code, contract instances, and persistent per-key entries. This reference records source policies, not current network settings or live rent quotes.

## Source policies

The repository estimates 17,280 ledgers/day (5 seconds/ledger). Source comments assume a roughly 180-day network maximum; effective TTL depends on the target network's settings. A requested duration is not a verified effective lifetime.

Persistent entries share one policy in [common TTL](../contracts/common/src/ttl.rs) (`ttl::extend_persistent`): extend only when the remaining TTL is below a threshold well under the target, so ordinary reads do not re-pay rent on every touch.

| State | Requested target (when below) | Source |
| --- | --- | --- |
| Instances (config, admin, Live flag, storage version), every state-changing entry point; the Minter on every entry point | 170 days (60 days) | [common TTL](../contracts/common/src/ttl.rs) |
| Manager registry, slugs, pending DAO/admin, platform Minter (`Implementation`, `UpgradeApproval`, `LatestImplementation`, `PendingDao`, `SlugToDao`, `DaoSlug`, `PendingAdmin`, `PlatformMinter`) | 365 days (30 days) | `ttl::extend_persistent` |
| Token delegations, mint authorities, ownership written by `batch_mint` | 365 days (30 days) | `ttl::extend_persistent` |
| Auction pending refunds | 365 days (30 days) | `ttl::extend_persistent` |
| Metadata artwork and attributes | 365 days (30 days) | `ttl::extend_persistent` |
| Minter allocations/claim markers | 365 days (30 days) | `ttl::extend_persistent` |
| Governor proposals | 120 days (30 days); covers the longest lifecycle (3 × 30 days of delays + 14 days to execute) from one touch | [Governor storage](../contracts/governor/src/storage.rs) |
| Marketplace listings | 30 days (7 days); expired listings can be cleared by anyone | [Marketplace storage](../contracts/marketplace/src/storage.rs) |

365-day requests are clamped to the network maximum (about 180 days).

Auction storage also requests 30-day instance extensions on some reads/writes. Inherited token/voting storage has its own library behavior (OpenZeppelin extends ownership on read). Do not infer that every mutation or every read renews every related key to the common helper's target. A simulated getter is not a submitted maintenance transaction.

## Shared code renewal

Code entries are shared by all instances using a hash. The operator can prepay rent instead of leaving extension cost to the caller that triggers it.

```bash
# Submits extension transactions for artifact-listed hashes.
node scripts/renew-code-ttl.mjs deploys/builder-testnet-manager.json --days 30
```

The script accepts 1–170 days. Default is `EXTEND_CODE_TTL_DAYS` or 30; identity is `--identity`, `DEPLOY_IDENTITY`, or `<network>-admin`. It extends Manager and implementation hashes in the artifact and exits nonzero on failures. It **does not restore archived entries**, install a scheduler, discover later DAO upgrade hashes, or shorten an already-longer TTL. Include relevant current upgrade hashes in the operator's renewal inventory rather than assuming the initial artifact covers them.

`deploy-manager.mjs` optionally extends code when `EXTEND_CODE_TTL_DAYS` is set; otherwise it skips prepayment. No automatic monthly scheduler is installed by these scripts. Choose renewal cadence with margin before expiry, not a once-per-30-days promise for a 30-day target.

Earlier testnet notes reported about 213 XLM for a 34 KB/170-day code extension and about 12.4 XLM for an eight-contract top-up on October 8, 2026. These are historical measurements, not reproduced quotes or mainnet pricing. Simulation/current network fees are the cost authority.

## Slug registry renewal

`launch_dao` writes two persistent Manager entries per DAO when it claims the slug (`SlugToDao`, `DaoSlug`); the launch transaction's source pays the initial rent (`create_dao` only stores the request in `PendingDao`). They are never removed, and nothing renews them automatically. `manager.bump_slug_ttl(slug)` is permissionless: DAO operators or the platform operator run `pnpm deploy:dao bump_slug_ttl <dao-config> <network-config>` before expiry (extensions are capped at roughly 180 days). `get_dao_by_slug` and `get_slug` do not extend TTL.

## Artwork renewal in the web app

The DAO admin panel reads code/artwork TTLs through RPC and shows healthy, soon (<45 days), critical (<14 days), expired/missing, or unavailable states. Missing RPC entries mean absent or archived; the UI cannot always distinguish them. Date estimates use the 5-second assumption. The code report covers configured DAO module hashes, not a platform-wide Manager/Minter renewal inventory.

Renewal is an **explicit button action**, not an automatic write triggered by rendering artwork. The UI permits its admin role to submit; `metadata.bump_artwork_ttl` itself is permissionless.

Each window covers up to 50 items/IPFS groups, also touching property headers and Metadata instance, and returns the next start. The browser submits one signed transaction per window, validates the expected next start, confirms it, and refreshes the report. Partial confirmed progress survives a later failed window. The SDK call uses `{ restore: true }` on this path and may request an additional restoration signature.

Sources: [TTL math](../apps/web/src/lib/ttl-expiry.ts), [RPC report](../apps/web/src/lib/ttl-expiry-rpc.ts), [renewal calls](../apps/web/src/lib/ttl-expiry-queries.ts), [panel](../apps/web/src/components/admin/ttl-expiry-panel.tsx).

## Archival boundary

Extension and restoration are different operations. Archived code/state requires target-network/SDK restoration handling; the extension script alone is not a restore runbook. Persistent rights such as refund credit and escrowed listing recovery must not be treated as safely deleted merely because a read is missing. Exact restoration commands and automatic restoration behavior need verification against the deployed protocol and CLI before an operator runbook claims them.

The app's artwork restoration option is implemented; complete recovery of an archived instance/header is not established by that option alone. The report may be unable to enumerate children of a missing header. Keep [security](SECURITY_MODEL.md) and [monitoring](MONITORING.md) aligned with these limits.
