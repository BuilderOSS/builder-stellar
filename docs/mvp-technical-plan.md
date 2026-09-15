# Nouns Builder on Stellar MVP Technical Plan

## 1. Objective and implementation boundaries

Deliver a Soroban-native Nounish DAO application on Stellar testnet. A creator uploads artwork to IPFS, configures and deploys a DAO, mints a founder allocation, and launches initially paused auctions. Members acquire transferable governance NFTs, create proposals, vote with historical voting power, execute Treasury actions, and upgrade DAO modules through governance. Goldsky supplies discovery and history; Stellar RPC supplies authoritative state and transaction execution.

Build on the existing Rust contracts, generated TypeScript bindings, Next.js app, Goldsky pipeline, and PostgreSQL views. This document specifies implementation work and acceptance evidence; source presence is not proof of passing deployed behavior.

### Selected implementation policies

- Auctions accept a configurable SAC asset, defaulting to native XLM's testnet Stellar Asset Contract (SAC).
- Preserve the existing Governor-authorized Treasury execution capability. Do not introduce an asset allowlist or token-interface management system. Typed application actions support transfers, governance minting, configuration, and upgrades; their friendly forms do not imply that Treasury rejects all other contract calls.
- Use typed internal dispatch for module/self-actions to avoid Soroban reentrancy. Reuse the Governor queue delay rather than introduce a second Treasury timelock.
- Mint a bounded founder allocation once at creation. Explicit governance-approved minting remains available in addition to auction minting.
- Default the one-shot launch admin to the creator, with an optional alternate address. Governance can launch first and consume the same permission.
- Require expiry for settlement, accept valid bids without extending after the extension cap, and transfer canceled NFTs to Treasury.
- Preserve current voting-supply semantics: Auction- and Treasury-held NFTs count toward supply and self-delegate.
- Store immutable token art seeds. Governance can update versioned IPFS manifest and renderer configuration subject to trait compatibility rules.
- Use atomic factory creation, subject to measured Soroban resource limits, and bounded governance durations with permissionless maintenance.
- Use an automated Goldsky onboarding controller with creation-ledger backfill.
- Populate the directory with fresh factory-created DAOs. Use generated deployment artifacts for platform configuration and recovery, not runtime DAO discovery.
- Use DAO-qualified URLs, separate drafts per deployment, and a minimal owner-authorized transfer control on token detail. Delegation is displayed informationally.

## 2. Source baseline and implementation map

| Area | Source evidence | Implementation work |
| --- | --- | --- |
| Token | `contracts/token/src/contract.rs`: ownership, transfers, approvals, delegation, checkpointed votes, authorized mint/batch mint | Founder bootstrap, explicit NFT metadata/read surface, immutable seeds, factory authorities, upgrades, retention |
| Governor | `contracts/governor/src/contract.rs`: proposal/vote/queue/execute, timestamp windows, historical snapshots | Non-reentrant internal dispatch, upgrade validation, bounded settings, authorization and retention verification |
| Treasury | `contracts/treasury/src/contract.rs`: Governor-authorized arbitrary calls; owner can replace Governor | Final governance ownership, internal self-actions, upgrades and proposal/action event linkage; preserve ordinary execution |
| Auction | `contracts/auction/src/{contract,helpers,storage}.rs`: paused launch, SAC bidding, extensions, settlement and Treasury proceeds | One-shot launch capability, pull refunds, expiry checks, cap behavior, cancellation disposition, upgrades |
| Deployment | `scripts/deploy-dao.mjs`: address prediction and constructor wiring for four contracts | Manager, Factory, Registry, MetadataRegistry, atomic initialization and final authority setup |
| Frontend | `apps/web/src/app`, `components`, `lib`, `stores`: proposal, auction, treasury, members, token and admin screens | Multi-DAO routing/state, creation/IPFS, pre-launch UX, precision, transaction recovery and accessibility |
| Indexing | `packages/goldsky/src`, `templates`, `test`: generated fixed-address ingestion and decoders | Factory discovery, automatic child onboarding/backfill, envelope validation and replay tooling |
| Database/API | `db/migrations`, `apps/web/src/lib/goldsky.ts`, API routes | Immutable deployment identity, complete query scoping, projection corrections, fail-fast migrations and readiness |
| Verification | `contracts/*/src/test.rs`, `contracts/e2e/src/test.rs`, Goldsky tests | Actual-WASM factory/upgrade tests, real auth-chain coverage, database/API fixtures and testnet acceptance |

Important baseline details:

- Testnet configuration already uses native XLM's SAC. A separate native-XLM payment implementation is unnecessary.
- Refund transfers currently invoke the asset directly. Persistent claim accounting and a claim entrypoint are missing.
- None of the four protocol contracts currently exposes WASM replacement. New deployments must include upgrade entrypoints from initialization; Manager cannot retrofit the existing contracts through an absent interface.
- Deployment currently uses an admin owner for all modules. Final governance authority and Auction mint permission must be explicitly established.
- `dao-session-store.ts` persists wallet state, not DAO identity. `dao-config.ts` resolves an environment-selected deployment; this is not runtime multi-DAO selection.
- The app already has SAC transfer forms, bidding, combined settlement/next-auction creation, and owner-unpause controls. Adapt those flows.
- Token metadata is currently an app-generated SVG keyed by token ID and deployment-wide branding. IPFS artwork ingestion, on-chain seeds, and DAO-scoped metadata resolution are new work.
- Indexed tables already contain `deployment_id`, currently derived from deployment label/network. The work is durable identity and complete isolation, not simply adding a column.

## 3. Contracts, deployment, and authorization

### 3.1 Platform and DAO components

**Manager:** register immutable module version/hash identities, approved upgrade transitions, publication activation times, revocation state, and events. Publication/revocation uses a configured account-level multisig authority. Allow an emergency factory-deployment pause without granting Manager the ability to upgrade a DAO directly.

**DaoFactory:** authenticate creators, validate bounded configuration, predict and atomically deploy DAO modules from active Manager implementations, perform bounded bootstrap operations, and register complete DAOs.

**DaoRegistry:** register token-address DAO identity, module roles/addresses, creator, creation ledger, factory version and implementation references. Restrict canonical registration to the configured Factory. Expose lookup for reconciliation; provide bounded enumeration/indexing support.

**Per-DAO modules:** Token, Governor, Treasury, Auction, and MetadataRegistry. Each has explicit peer references, final governance authority, version information, and a module-local upgrade entrypoint.

### 3.2 Deterministic creation

1. Authenticate the creator and validate a canonical creation payload and nonce.
2. Derive domain-separated salts for each module from the creator/creation identity. Avoid cross-creator collisions and unauthorized salt consumption.
3. Predict every child address using the Factory deployer identity before deployment. Circular Governor/Treasury references are constructor data, not a reason for staged deployment.
4. Deploy all children with final peer addresses and governance authorities. Constructors must not require undeployed peers to execute.
5. Grant Auction mint authority and perform the bounded founder mint through a narrowly scoped, one-use bootstrap operation.
6. Finalize bootstrap state, record registry mappings, and emit the creation event only after successful initialization.

The event contains the canonical token DAO ID, all module addresses, creator, Factory/version references and creation ledger. The indexer attaches transaction hash and ordering provenance from the chain event envelope; do not require the contract to obtain transaction hash itself.

Test duplicate creation, failed constructors, allocation limits, unauthorized bootstrap reuse, and full rollback. Measure compiled-WASM deployment plus founder minting before committing maximum input sizes. If atomic execution does not fit, revisit the creation design explicitly rather than silently allowing partially usable DAOs.

### 3.3 Authority and execution matrix

The target is contract-owned governance authority, with no creator-wide admin privilege after creation. A proposed wiring consistent with the existing call path is:

| Operation | Authority / execution path |
| --- | --- |
| Publish/revoke Manager implementation | Manager multisig policy |
| Create DAO | Authenticated creator through Factory |
| Founder bootstrap | One-use Factory capability with immutable configured recipients/counts |
| Auction mint | Explicit Auction mint authority |
| Governance mint/configure Token | Governor-approved Treasury call; Treasury is Token governance owner/minter |
| Configure Auction/Metadata | Governor-approved Treasury call; Treasury is their governance owner |
| Governor-local settings/upgrade | Approved proposal dispatched inside Governor; no call back through Treasury |
| Treasury execution | Configured Governor authorization |
| Treasury-local settings/upgrade | Governor-authorized internal Treasury dispatch; no external call back into Treasury |
| Initial launch | One-shot launch admin or governance; either permanently consumes the capability |
| Refund claim / holder transfer | Claimant / current token owner authorization |
| Storage maintenance | Permissionless, bounded, no configuration or ownership mutation |

Construct Governor with its own final governance identity and Treasury with its governance-controlled owner identity; adapt internal ownable/setter helpers as necessary rather than relying on recursive entrypoint calls. Validate this matrix with explicit Soroban authorization tests before interface freeze.

Do not use ownership renunciation as handoff: current Token mint checks and Governor authority checks require an owner. OpenZeppelin ownership transfer is two-step if used; a contract-address acceptance path must be specified and tested. Prefer final-authority construction with one-use bootstrap permissions.

### 3.4 Non-reentrant execution and upgrades

The current `Governor.execute → Treasury.execute → target` loop cannot safely handle a call back into Governor or Treasury. Dispatch Governor-local actions internally and Treasury-local actions inside Treasury; external modules remain scoped calls. Retain ordinary Governor-authorized Treasury calls for existing execution behavior.

Each upgrade-enabled module invokes Soroban `update_current_contract_wasm` on itself after authorization. At execution, bind and validate:

- canonical DAO and module address/role;
- current implementation version and state-schema version;
- target version/WASM hash and approved transition;
- Manager activation time and revocation state.

Manager publication does not execute upgrades. Version/hash identities are immutable, but revocation can make an already-approved proposal unexecutable; expose that state in the app.

Specify state-schema compatibility, migration entrypoints/guards, and multi-action ordering before implementing upgrades. Do not assume updated WASM executes immediately within the same call frame. Rehearse a state-preserving version change on testnet, including failed authorization and migration recovery. Emit module, prior/new version/hash and proposal/action provenance.

## 4. Token, artwork, and governance semantics

### 4.1 Token interface and founder allocation

Preserve ownership, delegation and checkpoint behavior. Explicitly expose and test the chosen SEP-0050-facing ownership, transfer, approval/read and metadata surface. Calling OpenZeppelin metadata helpers does not export their contract methods automatically: collection name/symbol, token URI, approval getters and operator approval support need an interface inventory and compatibility tests.

Founder allocation is one-time creation data: recipients, per-recipient count, total cap and deterministic token-ID ordering. The existing batch-mint limit of 100 is a per-call bound, not an allocation cap. Founder bootstrap cannot be repeated. Subsequent minting remains available through Auction and explicit governance-approved mint proposals; describe this separately from the founder limit.

Keep Auction/Treasury-held tokens in voting supply. Test attainable quorum with escrowed and unsold tokens. A zero-founder configuration needs a usable launch-admin path; a governance-only launch cannot assume voting power exists before minting.

### 4.2 IPFS artwork and renderer

Store artwork on IPFS following the Nouns Builder artwork-folder pattern. Before implementing upload/seed interfaces, capture the exact compatible folder structure and manifest schema as a repository fixture and specification: layer ordering, trait names/indexes, image formats/dimensions, manifest version, and path resolution. Do not invent an incompatible structure from the current generated SVG demo.

Implement upload validation, previews, pinning/durable reference finalization, progress, retries, and reuse of the same CID after failed DAO creation. Keep service credentials server-side. Preserve uploaded references in the creation draft; define cleanup of unreferenced uploads without removing artwork used by deployed DAOs.

Token stores immutable seed inputs; MetadataRegistry stores versioned IPFS manifest references and renderer base URL/configuration. Define deterministic generation, encoding and token-ID ordering, and a reproducible seed-to-art fixture. Determinism is not a claim of unbiased rarity.

Governance may update manifest/renderer configuration. Validate compatibility with existing seeds: stable trait indexes or an explicit version mapping must prevent existing tokens from referencing missing traits. Emit configuration revisions and preview their effect before submission.

Metadata/image routes carry DAO identity and preserve token IDs losslessly. Resolve registry configuration and stored seeds, verify token existence, return ownership where appropriate, and distinguish nonexistent token from unavailable artwork. Cache by DAO, token ID and metadata revision rather than a global token ID alone.

### 4.3 Governance timing and voting

Preserve and document these implemented semantics:

- Voting snapshot is proposal creation ledger minus one, not voting start.
- Voting windows and queue delays use timestamps. Pending includes `vote_start`; Active includes `vote_end`.
- Quorum uses historical supply and For + Abstain weight, rounded up; passage also requires For > Against.
- Queue uses the configured queue delay at queue time; current supplied ETA/operator parameters do not determine that delay.
- Queued proposals expire at ETA plus 14 days.

Define tested maximum voting delay, voting period and queue delay so proposal state, checkpoints, tallies and replay markers remain live throughout the supported lifecycle. Keep the existing minimum constraints unless explicitly changed. Use the same units/defaults/ranges in constructors, forms and summaries. Document setting changes that affect already-created proposals.

## 5. Auction and Treasury behavior

### 5.1 Auction lifecycle

- Default payment to canonical testnet XLM SAC; retain configurable SAC assets and display selected asset identity explicitly.
- Start paused with no current auction. Represent this as a valid not-launched state.
- Launch once through the configured launch admin or governance, consuming launch permission in either case. Subsequent pause/resume/configuration is governance-controlled.
- Preserve reserve, minimum increment, duration and time buffer. After the extension cap, accept otherwise-valid bids without further extending the deadline.
- Require expiry for both settlement-only and settle-and-create-next paths. Pausing does not permit early settlement.
- Transfer proceeds to the DAO Treasury; preserve no-bid settlement semantics. Cancellation refunds the bidder and transfers the canceled NFT to Treasury instead of leaving it stranded in Auction.

Capture the payment asset in auction/refund records so changing configuration cannot reinterpret an outstanding obligation. Test issuer authorization/freeze behavior for configurable SACs and show blocked transfer/settlement state accurately.

### 5.2 Refund accounting

Implement recoverable push-first transfer attempts with persistent asset-scoped claim balances on recoverable failure. Not every host/resource failure is catchable; test the supported failure boundary.

Claims require claimant authorization, rollback-safe balance clearing, and no double withdrawal. Settlement/configuration changes must preserve outstanding liabilities. Emit claim-created, push-refunded and claim-paid events with sufficient auction/asset/claimant provenance, and maintain claim storage TTL.

SAC transfers do not imply a receiver callback. Use a deliberately failing asset implementation to exercise fallback behavior and separately verify real SAC operations. Any explicit receiver-hook provision must define its ABI, authorization and failure policy; it is not required for the SAC transfer acceptance path.

### 5.3 Treasury actions and exact encoding

Preserve existing execution behavior and tested SAC transfer integration. Extend the existing transfer and mint action forms rather than duplicate native-XLM handling. Native XLM and issued SAC transfers share the SAC call shape.

Consolidate action validation, persistence, preview and encoding. Today the action registry and `buildProposalCallVectors` duplicate logic, and unknown branches can fall through to mint. Reject unsupported composer action types explicitly; keep raw proposal calls inspectable without mislabeling them as supported friendly actions.

Use exact decimal-string parsing and bigint amounts. Enforce seven fractional digits and i128 bounds for SAC actions, positive amounts, explicit recipients and Treasury sender. Do not convert wide integers through JavaScript `Number`, including during indexed argument reconstruction or previews.

Queue and execute must reconstruct identical typed action vectors, ordering and description bytes used to create the proposal. Specify and test a lossless encoding contract, including upgrade hash/identifier types, and verify proposal identity before signing. JSON/persistence must preserve wide integers as strings with their types; generated `any` arguments do not provide ABI validation.

## 6. Goldsky, PostgreSQL, and API implementation

### 6.1 Identity and runtime discovery

The token contract address is canonical on-chain DAO identity. Database deployment identity must also include network/reset epoch so deployments and event keys remain unambiguous. Replace mutable label/network-derived identity with immutable registry-derived keys. In-place WASM upgrades preserve DAO/deployment identity and append implementation history.

Add registry DAO/deployment/contract-role mappings and retain Factory provenance. Directory registration requires a verified Factory event; preserve reference deployment artifacts separately. Runtime discovery must not require rebuilding the web app.

### 6.2 Automated child onboarding

The running pipeline currently filters a fixed set of addresses. Add a controller that:

1. Observes Factory creation events and idempotently registers child addresses.
2. Creates or updates generated ingestion coverage through a serialized, retryable job.
3. Backfills all children from the creation ledger inclusive, including initialization and founder-mint events.
4. Tracks desired/applied pipeline revision, backfill progress, failure and readiness.
5. Resolves events arriving before registry records without dropping them.

Verify Goldsky filter-update/backfill behavior using observed source fixtures and a testnet deployment. Independent streams need not deliver factory events before child events. Interrupted onboarding resumes safely and does not lose same-transaction events.

### 6.3 Event envelope, replay and projections

Preserve source event identity, contract, network/deployment scope, transaction and contract-call success, event type, ledger, transaction position, operation/event position or a verified equivalent total-order key, and source operation semantics. Current transforms omit some selected success fields and ordering positions; correct that before adding new events.

Project only successful contract events. Use namespaced stable keys for duplicate delivery and the same deterministic chain order for latest-state projections. Retain raw data, structured decode errors, decoder/projection versions, and an executable replay/rebuild/cutover procedure. Define upsert/delete behavior explicitly rather than assuming raw retention is sufficient.

Correct existing read models with new migrations:

- Auction end time reflects extensions; cancellation is projected; settlement is based on an event, not non-null winner. Add launch and claim state/history.
- Align lifecycle API fields with SQL view columns.
- Separate voter counts from voting-power totals; use weighted totals consistently for governance outcomes.
- Populate executed actions using proposal/action-index linkage rather than permanent null fields.
- Keep canonical proposal IDs in links and execution. Proposal numbers are deployment-scoped display values; current replay-derived numbering can change during backfill.
- Filter Treasury activity before pagination, and retain linkage to proposals/transactions.

### 6.4 Query contracts, migrations and readiness

Require validated deployment scope on every list, count, aggregate, authority lookup, vote query and detail/number lookup. Resolve module addresses from the registry, not global environment selection. Add database-backed API contract fixtures, including two DAOs with proposal number 1 and token ID 1.

Make the migration runner fail on SQL errors and use one transaction owner for schema changes and migration bookkeeping. Existing nested transaction wrappers and lack of `ON_ERROR_STOP` need correction. Use new versioned migrations and explicit writer/reader grants.

Expose database connectivity, source progress, per-deployment onboarding/projection readiness, and response generation time separately. An idle DAO is not necessarily a stalled pipeline. Track confirmed transactions until expected indexed events appear.

RPC is authoritative for current state, voting power, balances, eligibility and preflight. Indexed histories have independent failure boundaries. Use each deployment's RPC URL/passphrase consistently; unavailable balances are unknown/error, not zero. Mark degraded/indexed fallback responses and show confirmed-but-not-indexed resources with retry rather than treating them as nonexistent.

## 7. React application and UX

### 7.1 Routes, context, caches and drafts

Use DAO-qualified routes such as `/dao/[daoId]/proposals/[proposalId]` on the testnet application, with network/deployment identity carried in resolved context and API requests. URL identity controls the viewed DAO; persisted last selection is a convenience only. First-time visitors land in the directory.

Context contains DAO/deployment identity, network/passphrase/RPC, module addresses and versions. Thread it through page/server reads, generated clients, navigation, metadata and transaction preparation. Bind pending transactions to their originating DAO/account and never retarget them on selection changes.

Partition SWR keys and persisted drafts by deployment/resource/account as applicable. Migrate or explicitly discard unscoped drafts. Suppress previous-DAO actionable data while loading. All consumers of a shared key must store the same response shape: public auction and auction-admin currently disagree on the shape cached under `/api/auctions`. Define invalidation after writes and isolation during in-flight navigation.

### 7.2 Creation and launch

Build creation steps for IPFS artwork validation/preview, collection metadata, configurable auction asset/settings, governance timing/thresholds, founder recipients/counts and launch-admin selection. Define required fields, defaults, units, bounds and post-deployment mutability in a shared schema.

The review step shows the complete configuration and authority handoff. Check testnet account/network readiness and provide actionable funding instructions. Preserve drafts and uploaded CIDs across wallet rejection and failed submission.

After confirmed creation, show a receipt and direct DAO link with indexing progress and the next launch action. A fresh DAO must return paused/configuration/eligibility without requiring `get_auction` to succeed. Distinguish not launched, live, ended/unsettled, paused existing auction and settled states; unknown is never shown as active.

Default launch authority to creator with an explicit override. Explain governance-first launch and consumed permission. Read eligibility through RPC; creator, launch admin, token holder and governance-owned contract are distinct roles.

### 7.3 Transaction lifecycle and recovery

Share these states across creation, proposals, votes, launch, bid, claims, settlement and transfers:

`preparing → awaiting signature → submitted → confirmed → awaiting indexing → synchronized`

Also distinguish wallet rejection, terminal on-chain failure, and confirmation unknown. Fix `transaction-confirmation.ts` so RPC `FAILED` is not caught and retried as a transport error. Timeouts preserve hashes and offer status checks rather than implying resubmission is safe.

Persist pending operation context/hash and resume confirmation after reload. Revalidate wallet account/network and DAO before signing. Reconcile uncertain submissions before enabling duplicate creation or another irreversible operation. Show exact effects and explorer links; keep user inputs after errors.

### 7.4 Auctions, proposals, members and administration

- Before bidding, refresh token ID, minimum bid, payment asset and deadline. Preserve entered amount when stale-state rejection requires review. Explain extensions and fixed deadlines after the cap.
- Distinguish settlement-only from settlement-and-next-auction actions. Show wallet-specific claim balances independently of current auction so refunds remain discoverable after rollover.
- Reuse typed action summaries in compose/review/detail/execute/activity: transfers show exact asset/amount/source/recipient; upgrades show module, current/target version/hash, activation/revocation and execution result. Governance mint actions remain explicit.
- Display ownership count, delegated power and proposal-snapshot power separately. Explain that post-snapshot acquisition does not grant voting power for that proposal; do not require an unnecessary self-delegation step.
- Token detail verifies existence and ownership, resolves DAO artwork, and provides a minimal owner-authorized transfer action with confirmation and refresh.
- Admin views follow the authority matrix. Governance-owned settings link to proposals instead of asking a user to connect a contract address. Checking, unauthorized, stale and failed permission reads are distinct states.
- Lists distinguish loading, verified empty, unavailable, stale-with-data and awaiting-indexing states. Provide retry/contextual next actions and pagination or explicit result limits.

### 7.5 Accessibility and responsive acceptance

Use semantic navigation with `aria-current`, persistent input labels, grouped duration controls and linked error messages. Confirmation dialogs need dialog semantics, initial/trapped/restored focus and Escape behavior. Announce transaction/status changes.

Wallet mismatch must disable transaction controls semantically while allowing read-only browsing; a pointer overlay alone is insufficient. Test keyboard navigation and narrow-screen layouts for auction columns, addresses, action summaries and creation steps.

## 8. Storage liveness and resource bounds

Inventory actual storage keys, including pinned OpenZeppelin internals, before implementing maintenance. Current Auction state/configuration is instance storage, NFT approvals are intentionally temporary, Treasury executions are event records, and voting/quorum checkpoints are individual persistent entries. Do not classify all of these as persistent application records.

The inventory must cover ownership/balances, seeds, voting units, delegate/supply/quorum checkpoints and counters, proposals, tallies, `HasVoted` replay markers, claims, registry mappings, module versions, instance data and contract code TTL.

- Extend required TTL on writes and submitted maintenance operations. Current dependency writes do not uniformly renew every relevant entry.
- Keep snapshot dependencies and replay markers alive for the full bounded proposal lifecycle, including queue/expiry. Renewing proposal core alone is insufficient.
- Provide bounded, paginated permissionless renewal and a restore path for archived persistent state and code. Never interpret archived vote data as zero or absent logical state.
- Simulation-only RPC reads do not persist TTL changes. Document maintenance transactions, cadence, thresholds and restore procedures.
- Do not prune history needed by an active/queued proposal; define safe retention and query behavior before implementing pruning.
- Measure factory deployment, founder batches, proposal action count/size, checkpoint queries and refund/settlement operations against Soroban limits.

## 9. Implementation order and verification

### Step 1 — Establish baseline and interface fixtures

Run the existing checks and record outcomes. Capture contract/pipeline configuration, source event envelopes and DB schema. Finalize the IPFS folder fixture, authority/dispatch interfaces, configuration bounds, action encoding and resource measurements. Preserve reference artifacts separately from factory directory data.

### Step 2 — Contract platform and lifecycle completion

Implement Manager/Factory/Registry/MetadataRegistry and upgrade-enabled module versions. Add founder bootstrap, final authorities, non-reentrant dispatch, claim accounting, auction edge rules and TTL maintenance. Regenerate bindings; extend deployment/build/test scripts to include every module.

### Step 3 — Data correctness and automatic discovery

Repair migration execution, projections and API scoping; add registry migrations and event envelope retention. Implement controller onboarding/backfill, replay and readiness. Coordinate DB migrations/grants, platform deployment, decoder/pipeline revisions and app bootstrap configuration.

### Step 4 — App-only journey

Introduce DAO routes/context, exact encoding, isolated caches/drafts and transaction recovery. Add IPFS creation, directory, pre-launch state, refund claims, upgrade summaries and token transfer. Adapt existing screens with accessible state handling.

### Step 5 — Acceptance evidence

Run repository checks:

```sh
pnpm lint
pnpm typecheck
pnpm build
pnpm dao:test:all
pnpm goldsky:test
pnpm --dir packages/goldsky validate
```

Extend verification beyond source-level decoder coverage:

- Actual compiled-WASM deterministic factory deployment and module upgrades, including constructor failure and resource limits.
- Explicit Soroban auth-chain tests rather than relying only on `mock_all_auths`; unauthorized Treasury asset movement, bootstrap reuse and cross-DAO upgrade rejection.
- Failed-later-action rollback, not just two successful actions in an atomicity-named test.
- Native XLM SAC acceptance plus configurable-SAC cases, controlled refund failure, repeated claims, expiry/extension/cancellation rules and Treasury balance assertions.
- Snapshot and timestamp boundaries, protocol-held supply, governance minting and dormant state restoration including replay markers.
- Database/API fixtures, failing migration rollback, duplicate/shuffled/unsuccessful event replay, same-ledger ordering and interrupted onboarding.
- Two-DAO cache/draft/link isolation, wide-integer action round trips, wallet rejection, confirmation timeout followed by success, reload recovery, delayed indexing and keyboard/mobile use.

## 10. MVP completion checklist

- [ ] Create two distinct factory DAOs through the UI with IPFS artwork, bounded founder allocations and final governance authority.
- [ ] A DAO created after ingestion starts appears automatically with all constructor/founder events, without manual pipeline edits or a web rebuild.
- [ ] DAO-qualified links, API queries, caches, drafts, metadata and pending transactions remain isolated across both DAOs.
- [ ] Fresh DAOs display a valid paused pre-launch state; either launch-admin or governance launch consumes the one-shot capability.
- [ ] Native XLM and configurable SAC auction scenarios cover bids, capped extensions, refunds/claims, expired settlement, cancellation and Treasury proceeds.
- [ ] Token ownership, transfer UI, immutable seed rendering and governance-controlled compatible metadata revisions work.
- [ ] Proposal creation, snapshot voting, quorum, queue delay and execution preserve exact action encoding and amounts.
- [ ] Treasury transfers and governance minting work through the retained execution model without an added token allowlist.
- [ ] A governance proposal upgrades a DAO-local module to an active, non-revoked Manager version without data loss; internal module actions avoid reentrancy.
- [ ] Directory, proposals/votes, auctions/refunds, members, Treasury actions and module upgrades have correct indexed history and explicit readiness.
- [ ] Unknown confirmation, on-chain failure, confirmed/indexing and synchronized states are distinguishable and recoverable.
- [ ] Persistent records, instance/code TTL and snapshot/replay dependencies have tested renewal and archive-restore procedures.
- [ ] Contract, database/API, Goldsky and frontend checks pass, with testnet evidence for the complete create-to-upgrade journey.
