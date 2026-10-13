# How to create, configure, and launch a DAO

Creation deploys the four core contracts (Token, Metadata, Governor, Treasury) and the modules the config asks for (Auction, Marketplace, ClaimMinter) in **Setup**. Launch is a separate transaction that hands every contract's admin to the Treasury. This guide describes repository tooling; it is not a record of a live rehearsal.

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
| Identity | `deployer`, `launchAdmin`, nonnegative `nonce`; `token.name` (no quotes, backslashes or control characters: the token JSON copies it, `InvalidName` 7207), `token.symbol`. There is no token URI: `token_uri` is built on-chain |
| Slug | top-level `slug`: unique DAO identifier (4-63 chars `[a-z0-9-]`, no leading/trailing/double hyphen). `create_dao` only **requests** it (rejecting a slug a launched DAO holds; several pending DAOs may request the same one); `launch_dao` **claims** it, first launch wins (`SlugTaken`, 7123; rename with `manager.update_pending_slug(token, slug)` and retry). After launch it changes only by vote: `manager.change_slug(token, new_slug)` from the Treasury (Manager 0.2.0+), which frees the old slug at once. Its two storage entries renew with the DAO's storage sweep (`scripts/renew-dao.mjs` or Manage → Storage renewal). **Before production:** decide on slug pricing (ENS-style length-tiered rent / brand reserve); see `TODO(pricing)` in `validate_slug` |
| Metadata | `profile`: `{ description, links: [{ label, url }], image }`, serialized to JSON of at most 4,096 bytes (markdown description, up to 8 links); it is emitted in a `ProfileUpdated` event and only its hash is stored. `rendererBase` (at most 256 characters, `StringTooLong` 7312) is the image compositor `token_uri` points at, normally `<web origin>/api/render`. Artwork `properties` and `ipfs.baseUri`/`extension` |
| Auction (optional section) | `duration` (300–2,592,000 seconds), `reservePrice` (integer base units, at least 1,000), `timeBuffer` (1–86,400 seconds), `paymentAsset` (contract address). Violations: `InvalidConfig` (7408) / Manager `InvalidConfig`. Omit the section (or set `enabled: false`) for a DAO without an auction |
| Marketplace (optional section) | `paymentAsset` (defaults to the auction's asset in the CLI), `secondaryFeeBps` (0–2,500 = at most 25%, `InvalidFee` 7125; CLI default 250). Quick-buy pools open later, by proposal |
| Claims (optional section) | `paymentAsset` (defaults to the auction's, then the marketplace's): the asset Setup claim lists and a launch drive are priced in. Lists open after creation |
| Membership | `tokenSettings`: `transfersLocked`, `membersOnlyDelegation`, `daoRecovery` (all `false` by default: an open DAO; see [locked tokens](designs/locked-tokens.md)). `transferAgents`: module kinds this config creates that may move memberships with the member's signature |
| Governance | `votingDelay`, `votingPeriod`, `queueDelay` (each 300–2,592,000 seconds), `quorumBps` (1–10,000), `proposalThreshold` (absolute votes, not basis points; at most the voting supply) |
| Founders | Array of `{ "address": "<funded account>", "amount": 1 }`; CLI requires positive supply and threshold no greater than founder total |
| Launch | `launchAuction`, `launchMarketplace`: whether a deployed Auction starts and a deployed Marketplace opens at launch |

Prefer decimal strings for large base-unit amounts. For the native SAC, `10000000` base units is 1 XLM; `1000000000` is 100 XLM. The CLI requires a SAC contract address, not the literal string `native`. The repository's [e2e template](../configs/e2e-testnet-dao.json) documents native-SAC resolution.

Each `batch_mint` call must fit the token's event budget (`common::batch_mint_fits`: `300 × tokens + 450 × recipients ≤ 13,500`, i.e. up to 43 tokens to one founder or 18 founders with one token each; `BatchTooLarge` 7205). The CLI packs founders into calls that fit; total founder supply is not capped by the contracts. Artwork calls contain at most 30 items and up to 16 properties overall. Configuration validation is not proof of funded accounts or usable assets; the contract remains authoritative.

### Phase 1: create

Manager validates current implementation hashes and initial bounds, predicts deterministic addresses from creator/nonce, deploys Token, Metadata, Treasury and Governor, then each module in `modules: Vec<ModuleSpec>` and registers it on the Token, and applies `token_settings` and `transfer_agents`. Core wiring is constructor-only; modules are found through the Token's registry. The launch admin is already every contract's `admin()`; there is no acceptance step. `create_module` adds a module later (the Token admin authorizes it: the launch admin in Setup, a proposal once Live).

Manager writes `PendingDao` containing addresses, launch admin, and each module's payment asset. `DaoCreated` records the creation WASM hashes for review (null for a module kind the DAO didn't create). Changing Manager defaults later does not rewrite those deployed contracts.

### Phase 2: setup

The script first appends the artwork in bounded batches, then mints founders with Token `batch_mint(minter, recipients, amounts)`, then verifies every founder token has traits and calls `metadata.regenerate(token_id)` for any that do not. **Artwork must exist before minting:** the Metadata hook seeds traits at mint time and seeds nothing while no properties exist; the contracts cannot block such a mint. Resume progress comes from the IPFS-group count and token ownership (`owner_of`); the script stops for manual reconciliation when state does not match the planned batches. Keep configuration stable while resuming.

During Setup, admin setters, the membership switches, module allowances (`increase_mint_allowance`), free claim lists (`open_list` on the ClaimMinter, after the allowance) and approved upgrades are available. Proposals/votes/queue/execution, Auction unpause, quick-buy pools, marketplace sales/listings, `dao_transfer` and `agent_transfer` require Live state (`NotLive`). The web setup flow also adds artwork before founder minting and warns before minting without it.

Instead of launching directly, the launch admin can open a **launch drive**: `manager.open_assurance(token, list, launch_config)` opens an assurance claim list on the ClaimMinter (price, distinct claimers needed, a deadline at most 90 days out), reserves the slug and hands every admin to the Treasury at once, freezing Setup. Once enough people have claimed, anyone calls `launch_when_ready(token)`; if the deadline passes first, claimers take their payments back with `refund` and `release_slug` frees the slug. The web does this from Manage → Claim lists; see the [security model](SECURITY_MODEL.md#assurance-launch).

### Phase 3: launch

`launch_dao(token_address, LaunchConfig)` requires:

- Pending launch-admin authorization; the factory not paused (`FactoryPaused`, 7111); the requested slug still free (`SlugTaken`, 7123); the launch admin still the Token admin (`LaunchAdminNotOwner`, 7126).
- Nonzero **voting** supply (`LaunchSupplyZero`, 7120): founders minted only to the Treasury or a non-voting module do not count.
- Every core contract's and registered module's current hash registered and not revoked.
- Each module's payment asset matching creation (`PaymentAssetMismatch`).

Manager launches Token → Governor → Treasury → each registered module → Metadata. Every contract becomes Live with the Treasury as admin (`AdminChanged`). A started Auction gets an unlimited mint allowance; the Marketplace mints only pool stock, granted by the proposal that opens each pool; the ClaimMinter keeps what the launch admin granted; the Treasury mints as admin without one. The slug is claimed (`SlugClaimed`), `DaoLaunched` records the module registry, and `PendingDao` is deleted.

A failed launch reverts that transaction and leaves the DAO pending. It does not undo earlier setup transactions. A second Manager launch has no pending record to consume.

## Web workflow

At `/create`, save Identity (image/name/symbol), Membership (how people join: auction, market, claims, and the membership rules: open or a members-only club, with the three switches under Advanced), Governance, and Review. There is no separate purpose step. Guest drafts can be prepared locally; creation requires an authenticated wallet matching the draft's deployment/network scope.

Creation freezes a normalized reviewed configuration/fingerprint with nonce and
predicted addresses. The signed envelope/hash/expiry are saved as `signed`, not
`submitted`; RPC PENDING/DUPLICATE acceptance changes that state. Unknown acceptance
or confirmation requires checking saved transaction and actual Manager state.
Explicit rebroadcast reuses exact signed bytes while valid, not another signature,
nonce, fee, or sequence. Chain failure/expiry is reconciled before a rebuild, which
keeps the frozen creation nonce/configuration. Launch also freezes reviewed choices.
Creation ends in Setup, not launch. The checklist supports artwork,
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

Launch errors include `LaunchSupplyZero` (7120), `SlugTaken` (7123), `LaunchAdminNotOwner` (7126), `FactoryPaused` (7111), `PendingDaoUsesRevokedImplementation` (7121), `PlatformMinterNotSet` (7108), `PlatformMinterMismatch` (7110), and module payment-asset mismatch errors. A revoked pending module can be upgraded along an approved transition before retrying launch. Error codes are unique across contracts (one 100-code block per contract, 7000-7899).

## Storage renewal

A DAO's state lives for a paid stretch of time. Anyone can renew everything the DAO owns in one transaction:

```bash
node scripts/renew-dao.mjs --network testnet --token <Token contract address> --days 90 --source <identity> [--dry-run]
```

The web app offers the same under Manage → Storage renewal, with expiry dates and a simulated price. Shared contract code is the platform's to renew. Costs and the full key list are in [TTL_ECONOMICS](TTL_ECONOMICS.md).

## Tests and testnet rehearsal

`pnpm contracts:test` runs the in-memory suites. `node --test scripts/e2e-testnet.test.mjs` tests rehearsal helpers offline.

`node scripts/e2e-testnet.mjs all` is a **network-mutating, testnet-only** rehearsal. It uses existing funded identities and saves resumable `.e2e` state/reports. Read [the driver](../scripts/e2e-testnet.mjs) before running it; do not confuse it with Cargo integration tests. No live rehearsal is implied by this guide.
