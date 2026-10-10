# Security Model

Scope: the Soroban contracts under `contracts/` after the contract review fixes (see [CONTRACT_REVIEW_FIX_PLAN.md](./CONTRACT_REVIEW_FIX_PLAN.md)). The Rust sources under `contracts/*/src` are authoritative; this document describes behavior, not intent. It is not an audit.

## Roles

| Role | Holder | Authority |
| --- | --- | --- |
| Manager admin | Address set in the Manager constructor; two-step handover via `propose_admin` / `accept_admin` | Registers/revokes implementation WASM hashes, selects the latest hash per name (`set_latest_implementation`) and the factory's current hashes, approves upgrade transitions, pauses the factory (`create_dao` and `launch_dao`), upgrades the Manager, registers the platform minter |
| Deployer | `params.deployer` of `create_dao` | Authorizes `create_dao` (together with the launch admin); no standing authority afterward |
| Launch admin | `params.launch_admin` of `create_dao` | Admin of every module (Token, Governor, Treasury, Auction, Marketplace, Metadata) during the setup window. Must also authorize `create_dao`; authorizes `launch_dao` and `update_pending_slug` |
| Treasury | The DAO Treasury contract | Admin of every module (including itself) from launch onward; acts only through passed proposals |
| Anyone | Any account | `treasury.execute` for a Queued proposal, auction bid/settle, `marketplace.expire` / `expire_primary`, `metadata.bump_artwork_ttl`, `manager.bump_slug_ttl`, token holders' own actions |

## One admin model

Every module stores its admin with `common::admin`. The admin is the launch admin during setup and the Treasury after `launch`; `common::admin::handoff` is the only change and emits `AdminChanged { old_admin, new_admin }`. There is no `transfer_ownership`, two-step handover, `set_admin` or `renounce_ownership` on any module, so:

- a transfer started during setup cannot survive launch (there is none to start);
- governance cannot hand a module to a non-Treasury address, and cannot renounce the admin and brick minting, upgrades or settings.

Each module exposes `admin()` for reads. Admin-gated functions call `common::admin::require_admin`.

## Lifecycle: setup window and launch

Every module starts in Setup. `launch` is one-shot, callable only by the Manager (`manager.require_auth()`), and panics `AlreadyLive` (7002) on a second call. `launch_dao` calls them in this order: Token, Governor, Treasury, Marketplace, Auction, Metadata. It fails atomically, so a failed launch leaves every module in Setup and `PendingDao` intact.

All cross-module wiring (token, treasury, auction, marketplace, governor, manager addresses) is passed to constructors and is immutable. `launch` checks that the Treasury argument equals the Treasury wired at construction (`TreasuryMismatch`).

During setup the launch admin can:

- mint founder tokens directly on the Token (`mint`, `batch_mint`; only the admin mints before launch);
- add artwork to Metadata and update its settings (strings capped at 256 characters);
- change Auction parameters while it is paused and Marketplace parameters;
- change Governor parameters through the admin-only setters;
- upgrade modules along Manager-approved transitions;
- rename the pending DAO's requested slug (`update_pending_slug`).

Before launch, `token.set_mint_authority`, `auction.unpause`, primary listing creation, secondary `list` and `buy`, all Governor proposal functions, `treasury.execute` and the Minter fail with `NotLive` (7001).

`launch_dao` enforces:

- the factory is not paused (`FactoryPaused`, 7111): the pause is the emergency stop for both creation and launch;
- `launch_admin` authorization and that it is still the Token admin (`LaunchAdminNotOwner`, 7126);
- the requested slug is still unclaimed (`SlugTaken`, 7123); see [Slugs](#slugs);
- every module's current `wasm_hash()` is registered and not revoked (`PendingDaoUsesRevokedImplementation`, 7121), checked before any launch call;
- the Token's voting supply is greater than zero (`LaunchSupplyZero`, 7120): at least one token is held by someone other than the Treasury, Auction or Marketplace;
- the Auction and Marketplace payment assets equal those recorded at `create_dao` (`PaymentTokenMismatch` / `PaymentAssetMismatch`);
- the mint-authority set is fixed by the Manager: Treasury and Marketplace always, Auction if `launch_auction`, and the admin-registered platform minter if `enable_minter` (`PlatformMinterNotSet`, 7108; `PlatformMinterMismatch`, 7110, unless `expected_minter` equals it).

## Voting supply and quorum

Tokens held by the DAO's Treasury, Auction and Marketplace carry no votes. The token wires their addresses at construction (immutable) and maps them to "no holder" in OpenZeppelin's `transfer_voting_units`: moving a token into one of them burns its voting unit and removes it from the `TotalSupply` checkpoint; moving it out mints the unit again for the receiver's delegate. Consequences:

- The Governor's quorum (`ceil(voting_supply_at_snapshot * quorum_bps / 10_000)`) and the proposal-threshold check use the voting-capable supply. Unsold auction tokens piling up in the Treasury, the token on auction and escrowed listings never raise the quorum, so governance cannot drift into a permanent quorum lock.
- System holders are never auto-delegated and can never vote (`ZeroVotingWeight`, 7512). A system holder calling `delegate` moves no votes, because it holds no voting units.
- A holder whose token is escrowed in the Marketplace loses that vote until the token returns (cancel/expire) or is bought (the buyer's delegate gains it). The holder's delegation itself is unchanged.
- Delegating *to* the Treasury is allowed; those units belong to a voting-capable holder and stay in the voting supply. The Treasury can only cast them through a passed proposal.
- Votes and supply are read at the ledger before `propose`, so later transfers or listings never change a proposal's weights or quorum.

These behaviors are covered by `contracts/token` (`delegation_security`) and the e2e test `system_held_tokens_and_votes_through_a_real_proposal`.

## Governance execution path

1. Proposal functions (`propose`, `cast_vote`, `queue`) run on the Governor. `propose` emits OpenZeppelin `ProposalCreated` and `ProposalScheduled { vote_start, vote_end, snapshot_ledger, quorum_votes }`.
2. Anyone calls `treasury.execute(targets, functions, args, description_hash)`. Authority comes from the proposal.
3. The Treasury calls `governor.consume(...)`, which requires the Treasury's auth, checks the proposal is Queued, past its ETA (`ProposalNotReady`, 7513) and unexpired, marks it Executed and emits `ProposalExecuted`.
4. The Treasury dispatches each action in order and emits one `Execute` event per action:
   - target = Treasury, function `authorize`: stores extra authorization trees for the next action (see below);
   - target = Treasury, any other function: the allowlist `upgrade(from, to)`, `migrate()`, `sync_version()`; anything else fails with `UnknownSelfCall` (7602) or `InvalidSelfCallArgs` (7603);
   - any other target: invoked with the Treasury authorizing exactly that call, plus any trees from a preceding `authorize`.
5. Any failing action reverts the whole transaction, including the Executed mark. The proposal stays Queued and can be retried until it expires.

`governor.execute` always fails with `UseTreasuryExecute` (7507). A proposal has at most 20 actions (`TooManyActions`, 7508). A Succeeded proposal that is never queued expires 14 days after voting ends; a Queued proposal expires 14 days after its ETA.

### Nested authorization (`authorize` actions)

Some calls need the Treasury's authorization below the Treasury's direct call, for example `marketplace.buy` with the Treasury as buyer (the marketplace pulls the SAC payment from the Treasury) or a swap through a router. An `authorize` action (target = Treasury, function `authorize`, one `Vec<AuthNode>` argument) adds those authorization trees to the next action only. Because it is an ordinary action, the trees are part of the proposal id and voters approve them.

Rules: trees apply only to the immediately following external call; an `authorize` that is dangling, followed by another `authorize` or by a Treasury self-call, empty or malformed fails with `InvalidAuthorization` (7605). Trees are bounded to depth 4 and 16 nodes. `treasury.check_authorization(nodes)` is a read-only check to simulate before proposing. Each tree authorizes exactly the invocation it describes (contract, function, arguments), so voters must read them like any other action.

## Upgrade path and migrations

A module upgrade needs all of:

1. A Manager registry entry for the target hash that is not revoked, and an approval for the exact `from_hash -> to_hash` pair (Manager admin).
2. The module's stored current hash equal to `from_hash`.
3. The module admin's authorization. After launch this is the Treasury, reached by a proposal that targets the module's `upgrade`; for the Treasury itself the proposal uses the self-call allowlist.

Every module records a storage-layout version at construction (`StorageVersion`, initially 1) and exposes an admin-gated `migrate()` and a `storage_version()` view. A release that changes a module's storage layout bumps its `STORAGE_VERSION` and does its data rewrite in `migrate`, which first calls `common::upgrade::migrate` (fails with `NothingToMigrate`, 7012, unless the stored version is older; emits `Migrated`). A governance upgrade proposal runs `upgrade` then `migrate` as consecutive actions.

Revocation: `is_upgrade_approved(from, to)` requires only the target to be non-revoked, so a module on a revoked hash can still migrate away. Registry records are immutable (`ImplementationAlreadyRegistered`, 7109). Registration does not move the "latest" pointer for a name; the Manager admin sets it explicitly with `set_latest_implementation`, so registering an older patch release never regresses it.

## Slugs

`create_dao` validates the requested slug and rejects one already claimed by a launched DAO, but does not claim it. The slug is stored in `PendingDao`; `launch_dao` claims it (permanent, unique, emits `SlugClaimed`) and fails with `SlugTaken` if another DAO launched with it first. The launch admin can then rename with `update_pending_slug`. An abandoned pending DAO holds no slug, so there is nothing to release or expire.

Trade-off: a pending DAO's requested slug is public, so someone can create and launch their own DAO with it first. That costs the create fee plus rent for six contracts and yields a real, launched DAO, so it is far costlier than squatting at creation, but not impossible. Slug pricing (TODO in `manager/src/contract.rs`) is the lever if it becomes a problem.

## Auction

Settlement requires `now >= end_time` on both paths (`settle_and_create_new`, and `settle_auction` while paused; `AuctionActive`, 7404 otherwise). A pause, which every config change requires, therefore cannot be used to end a running auction early in the leader's favor; `cancel_auction` (admin, paused) is the only way to end a running auction, and it refunds the leader and sends the token to the Treasury.

Refunds to an outbid bidder are pushed; if the push fails, the amount is credited (`RefundDeferred`) and pulled later with `withdraw_refund` (`NoPendingRefund`, 7416, when empty), so a bidder that cannot receive cannot freeze the auction.

## Marketplace

- The secondary fee is capped at 25% (`common::MAX_FEE_BPS` = 2,500; `InvalidFee`, 7709). It is snapshotted into each listing.
- `list(token_id, seller, price, expires_at, max_fee_bps, payment_asset)`: the seller signs the worst fee and the asset they accept. If a fee or asset change lands between signing and inclusion, the listing fails (`FeeAboveMax`, 7714; `PaymentAssetMismatch`, 7712) instead of applying worse terms.
- `buy(token_id, buyer, max_price)` and `buy_primary(listing_id, buyer, max_price)` fail with `PriceAboveMax` (7715) above the buyer's bound.
- `expires_at` has no maximum; escrowed tokens stay in escrow until bought, cancelled (seller) or expired (anyone, after expiry).

## Batch minting

A transaction may publish at most 16 KiB of contract events. A `batch_mint` emits OpenZeppelin `Mint` per token, one `MintBatchWithMinter` for the id range and one metadata `SeedsGenerated` carrying every token's selections, plus OpenZeppelin delegation events for each recipient without a delegate. Measured worst case (16-trait artwork, all recipients new): ~376 bytes per call, ~288 per token, ~436 per recipient.

Each call must satisfy `common::batch_mint_fits`: `300 × tokens + 450 × recipient entries ≤ 13,500` estimated bytes (`BatchTooLarge`, 7205), about 85% of the limit. That allows up to `MAX_BATCH_MINT` = 43 tokens to one recipient, `MAX_BATCH_RECIPIENTS` = 18 recipients with one token each, or mixes such as 35 tokens over 5 recipients. Entries are counted as new recipients even when they repeat or already delegate. Storage writes (2 per token, ~5 per new recipient, limit 200) and CPU stay well below their limits. The budget also bounds the metadata seeding hook, whose failure (including budget exhaustion) cannot be caught. The e2e suite mints batches at the budget edge against real 16-trait metadata; re-measure there if events change. Larger allocations are minted in several calls.

## Error codes

Every project error code is unique across contracts. Each crate owns a block of 100 codes in 7000-7899, outside every OpenZeppelin range:

| Block | Crate |
| --- | --- |
| 7000 | common (`NotLive` 7001, `AlreadyLive` 7002, ... `NothingToMigrate` 7012) |
| 7100 | manager |
| 7200 | token |
| 7300 | metadata |
| 7400 | auction |
| 7500 | governor (custom; OpenZeppelin governor lifecycle errors keep their 5000s codes) |
| 7600 | treasury |
| 7700 | marketplace |
| 7800 | minter |

A code therefore identifies its crate even when it surfaces through a cross-contract call. The e2e test `error_codes_are_unique_per_crate_block` and a `common` unit test enforce the blocks. Errors raised by the token inside a Minter call propagate unchanged.

## TTL and archival

See [TTL_ECONOMICS.md](./TTL_ECONOMICS.md) for the policy. In short: instances are extended to ~170 days when fewer than 60 days remain; long-lived persistent entries (registry, slugs, delegations, mint authorities, artwork, refunds, minter claims) to the network cap when fewer than 30 days remain; proposals to 120 days (covers the longest lifecycle of 104 days) when fewer than 30 remain; listings to 30 days when fewer than 7 remain. Every Minter entry point extends the Minter's own instance. `metadata.bump_artwork_ttl` and `manager.bump_slug_ttl` are permissionless renewals.

## Known limitations

These are behaviors of the current contracts, not planned fixes.

- Metadata seed grinding. The artwork seed is `keccak256(token_id, ledger sequence, ledger timestamp, host PRNG u64)`. Whoever controls when a mint happens, or whether to submit after simulating, can pick preferred traits. `regenerate(token_id)` only seeds a token without attributes (`AlreadySeeded` otherwise).
- Governance parameter bounds. Voting delay, voting period and queue delay must be 300 seconds ..= 30 days; quorum 1 ..= 10,000 bp; proposal threshold nonzero and not above the voting supply. A DAO can still choose capturable or very slow parameters within those bounds. A quorum of 10,000 bp requires every voting-capable token to participate.
- Founder supply and early takeover. During setup the launch admin can mint any number of founder tokens (in batches that fit the event budget) and delegate them; launch only requires a nonzero voting supply. With minimum timings a majority holder can propose, vote, queue and execute about 15 minutes after launch. Bidders and holders should inspect founder supply and delegation; front ends should display founder share.
- Treasury-held tokens never vote. Tokens the Treasury holds (unsold auctions, transfers to the Treasury) only regain voting power when a proposal transfers them out.
- No veto once a proposal is queued. Only expiry (14 days after the ETA) stops it.
- Opaque upgrade hashes and authorization trees. The chain checks registry approval, not code; voters must verify `to_hash` against audited reproducible builds and read any `authorize` trees.
- Proposal ids do not include the proposer. An identical-payload proposal can be front-run and then cancelled by its proposer; an honest proposer changes the description.
- Slug front-running at launch (see [Slugs](#slugs)).
- Payment assets must be plain, non-regulated Stellar Asset Contracts. AUTH_REQUIRED, clawback, fee-on-transfer or rebasing assets can freeze or misprice settlement.
- Manager admin trust. The admin selects the hashes future DAOs deploy, can revoke implementations, pause the factory and register the platform minter (pinned by `expected_minter`). Creators should verify `DaoCreated.wasm_hashes` before launch. The admin is a single address with a two-step handover and no timelock; `PendingAdmin` has no expiry (withdraw with `cancel_pending_admin`).
- Archival assumptions. The design assumes protocol 23+ automatic restoration where footprints allow, plus periodic maintenance (see MONITORING.md).

## Application trust boundaries

The app authenticates wallets with SEP-53 message signing and a SEP-10 fallback,
then uses an encrypted `iron-session` cookie. Wallet connection alone is not an
authenticated session. Challenge/replay/rate-limit bookkeeping is process-local;
this reference does not claim a shared distributed replay store. Public DAO reads
remain scoped to the configured deployment. Trading inventory/readiness derive the
actor from the session, not a submitted address.

SEP-10 reads current account signers/medium threshold from canonical Horizon and
verifies their weighted signatures, excluding the server signer and requiring at
least one positive client weight. Disabled-master/insufficient-threshold proofs
cannot fall back. Master-key-only unfunded authentication is allowed only on an
authoritative Horizon account-not-found 404 problem response, not generic 404 or
network failure. Read/malformed-account failures return 503. Successful key-only
sign-in does not establish funding or transaction readiness.

Marketplace preparation checks same origin, session network, tenant/module/listing
identity, live wiring/terms, ownership, and relevant account funds/trustlines. It
returns unsigned XDR; the server does not sign/submit a trade. The wallet path
checks account/network/source/expiry and unchanged envelope. Approval and listing
are separate transactions. `list` carries the fee and payment asset the seller
saw (`max_fee_bps`, `payment_asset`) and purchases carry `max_price`, so a
governance or price change before confirmation makes the call fail (7714, 7712,
7715) instead of applying new terms; the web re-reads and asks again.

Proposal submission uses target-specific generated specs and explicit registered
SAC transfer encoding. Unsupported external ABIs, scalar batch-mint shapes, unsafe
integers, proposal-ID mismatch, or unavailable live state disable submission.
Execution receipt checks bind Treasury, Governor, proposal and ordered calls; a
missing indexed receipt is not evidence of failed execution.

Treasury funding prepares a session-owned SAC transfer after scoped wiring,
simulation and funds/reserve/fee checks; spending Treasury funds still requires
governance. Holder preparation rechecks current on-chain NFT owner, not merely
indexed ownership. Delegation applies to the account's owned voting units;
single-token approval revocation is not collection-wide permission revocation.

Minter claims use current registered Minter, Live/mint authority, method/round and
recipient-bound proof; restoration-required simulations are rejected. The client
rechecks reviewed state before signing. Allocation descriptors currently validate
only and cannot be submitted through the shared governance encoder. This limitation
must not be confused with implemented claimant signing.

Creation/launch recovery saves finite signed envelopes separately from RPC
acceptance. Rebroadcast preserves exact bytes/hash; reviewed configuration and
nonce cannot be silently changed after freezing. Unknown acceptance is not proof
of failure. Missing older envelopes cannot be safely rebroadcast.

Local drafts, home preferences, artwork plans, and marketplace labels/favorites are
browser storage, not encrypted shared permissions or on-chain rights. Scope filters
avoid mixing workspaces but do not secure data from another user of the same browser.
Clearing storage removes recovery data. Read-only SQL credentials do not imply that
all server endpoints are side-effect free: uploads and transaction preparation have
their own boundaries. See [web reference](../apps/web/README.md).
