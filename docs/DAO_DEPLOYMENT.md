# How to create, configure, and launch a DAO

Creation deploys all six modules in **Setup**. Launch is a separate transaction that transfers control to Treasury. This guide describes repository tooling; it is not a record of a live rehearsal.

## Prerequisites

- A deployed Manager and its `deploys/<label>-<network>-manager.json` artifact; see [Manager deployment](MANAGER_DEPLOYMENT.md).
- Node.js, pnpm, a compatible Stellar CLI, and a funded CLI identity on the target network.
- A DAO config matching the target network and identity. The CLI wrapper supports `deployer == launchAdmin`; the contract supports distinct addresses only when both authorize creation.

## CLI workflow

Run from the repository root. Use [testnet-builder-dao.json](../configs/testnet-builder-dao.json) as the configuration shape, not as an anonymized account template. Set your own deployer, launch admin, founders, unique nonce, URLs, and payment SAC addresses.

```bash
# Validation only: no network calls or artifact writes.
pnpm deploy:dao --validate-only configs/testnet-builder-dao.json

# The following phases submit transactions and update deployment artifacts.
pnpm deploy:dao create_dao configs/testnet-builder-dao.json configs/testnet-manager.json
pnpm deploy:dao admin_checklist configs/testnet-builder-dao.json configs/testnet-manager.json
pnpm deploy:dao launch_dao configs/testnet-builder-dao.json configs/testnet-manager.json
```

The default signing identity is `<network>-admin`; `DEPLOY_IDENTITY` overrides it. The source account must match the configured deployer/launch admin. DAO artifacts use `deploys/<network-config.label>-<network>-dao-<nonce>.json`.

### Configuration reference

| Section | Fields and meaning |
| --- | --- |
| Identity | `deployer`, `launchAdmin`, nonnegative `nonce`; `token.name`, `symbol`, `uri` |
| Slug | top-level `slug`: unique, permanent DAO identifier (4-63 chars `[a-z0-9-]`, no leading/trailing/double hyphen; first come, first served). Claimed in `create_dao` (`SlugTaken`); renew its storage with the permissionless `bump_slug_ttl(slug)`. **Before production:** decide on slug pricing (ENS-style length-tiered rent / brand reserve); see `TODO(pricing)` in `validate_slug` |
| Metadata | `projectUri`, `description`, `contractImage`, `rendererBase`; artwork `properties` and `ipfs.baseUri`/`extension` |
| Auction | `duration` (300–2,592,000 seconds), `reservePrice` (integer base units, at least 1,000), `timeBuffer` (1–86,400 seconds), `paymentAsset` (contract address) |
| Marketplace | `paymentAsset` (defaults to auction asset in CLI), `secondaryFeeBps` (0–10,000; CLI default 250) |
| Governance | `votingDelay`, `votingPeriod`, `queueDelay` (each 300–2,592,000 seconds), `quorumBps` (1–10,000), `proposalThreshold` (absolute votes, not basis points) |
| Founders | Array of `{ "address": "<funded account>", "amount": 1 }`; CLI requires positive supply and threshold no greater than founder total |
| Launch | `launchAuction`, `launchMarketplace`, `enableMinter`; enablement is applied at launch, not module deployment |

Prefer decimal strings for large base-unit amounts. For the native SAC, `10000000` base units is 1 XLM; `1000000000` is 100 XLM. The CLI requires a SAC contract address, not the literal string `native`. The repository's [e2e template](../configs/e2e-testnet-dao.json) documents native-SAC resolution.

The CLI batches founders into at most 100 tokens / 16 recipient entries per transaction. That is a tooling budget, **not a 100-token contract cap or a 10,000-token founder cap**. Artwork calls contain at most 30 items and up to 16 properties overall. Configuration validation is not proof of funded accounts or usable assets; the contract remains authoritative.

### Phase 1: create

Manager validates current implementation hashes and initial bounds, predicts deterministic addresses from creator/nonce, and deploys Token, Metadata, Treasury, Governor, Auction, and Marketplace. Wiring is constructor-only. The launch admin already owns the modules; there is no required ownership-acceptance step.

Manager writes `PendingDao` containing addresses, launch admin, and pinned Auction/Marketplace assets. `DaoCreated` records six creation WASM hashes for review. Changing Manager defaults later does not rewrite those deployed modules.

### Phase 2: setup

The script mints founders directly with Token `batch_mint(minter, recipients, amounts)` and appends artwork in bounded batches. It derives resume progress from token supply and IPFS-group count and stops for manual reconciliation when state does not match the planned batches. Keep configuration stable while resuming.

During Setup, owner setters and approved module upgrades are available. Minter operations, mint-authority setters, proposals/votes/queue/execution, Auction unpause, and marketplace sales/listings require Live state. The launch admin can configure artwork before founder minting when using the web setup flow; the CLI checklist currently mints first, then adds artwork. Do not assume the two sequences produce identical founder artwork.

### Phase 3: launch

`launch_dao(token_address, LaunchConfig)` requires:

- Pending launch-admin authorization and continued Token ownership.
- Nonzero Token supply.
- Every module's current hash registered and not revoked.
- Auction/Marketplace assets matching creation.
- If Minter is enabled, `expected_minter` matching the Manager-registered platform Minter. The CLI reads and pins it automatically.

Manager launches Token → Governor → Treasury → Marketplace → Auction → Metadata. Every module becomes Live and Treasury-owned. Treasury/Marketplace are Token minters; Auction is included when started; the optional platform Minter is included when enabled. Pending ownership transfers are cleared and `PendingDao` is deleted.

A failed launch reverts that transaction and leaves the DAO pending. It does not undo earlier setup transactions. A second Manager launch has no pending record to consume.

## Web workflow

At `/create`, save Identity (image/name/symbol), Membership (description and Auction/Marketplace economics), Governance, and Review. There is no separate purpose step. Guest drafts can be prepared locally; creation requires an authenticated wallet matching the draft's deployment/network scope.

Creation freezes a normalized reviewed configuration/fingerprint with nonce and
predicted addresses. The signed envelope/hash/expiry are saved as `signed`, not
`submitted`; RPC PENDING/DUPLICATE acceptance changes that state. Unknown acceptance
or confirmation requires checking saved transaction and actual Manager state.
Explicit rebroadcast reuses exact signed bytes while valid, not another signature,
nonce, fee, or sequence. Chain failure/expiry is reconciled before a rebuild, which
keeps the frozen creation nonce/configuration. Launch also freezes reviewed choices
and Minter. Creation ends in Setup, not launch. The checklist supports artwork,
founder minting, live readiness, and explicit module choices. See [web recovery](../apps/web/README.md).

## Verify and troubleshoot

Use the saved transaction hash and artifact first. Indexed visibility is separate from confirmation; there is no guaranteed indexing latency.

```sql
SELECT dao_id, token_name, status, marketplace_contract, launched_at
FROM manager.daos
WHERE deployment_id = 'manager:<Manager contract address>'
  AND dao_id = '<Token contract address>';
```

SQL names are `launched_*`; frontend DTO aliases may be `finalized_*`. `GET /api/dao/<Token contract address>` returns lookup status. For missing rows, inspect the selected artifact/start ledger and pipeline status from `packages/goldsky`; see [indexer setup](GOLDSKY_SETUP.md). Do not manually change the view's lifecycle status.

Launch errors include `LaunchSupplyZero` (1121), `PendingDaoUsesRevokedImplementation` (1122), `PlatformMinterNotSet` (1008), `PlatformMinterMismatch` (1010), and module payment-asset mismatch errors. A revoked pending module can be upgraded along an approved transition before retrying launch. Error codes must be interpreted with the emitting contract.

## Tests and testnet rehearsal

`pnpm contracts:test` runs the in-memory suites. `node --test scripts/e2e-testnet.test.mjs` tests rehearsal helpers offline.

`node scripts/e2e-testnet.mjs all` is a **network-mutating, testnet-only** rehearsal. It uses existing funded identities and saves resumable `.e2e` state/reports. Read [the driver](../scripts/e2e-testnet.mjs) before running it; do not confuse it with Cargo integration tests. No live rehearsal is implied by this guide.
