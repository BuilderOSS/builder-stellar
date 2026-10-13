# Security Model

Scope: the Soroban contracts under `contracts/` after the contract review fixes (see [CONTRACT_REVIEW_FIX_PLAN.md](./CONTRACT_REVIEW_FIX_PLAN.md)). The Rust sources under `contracts/*/src` are authoritative; this document describes behavior, not intent. It is not an audit.

## Roles

| Role | Holder | Authority |
| --- | --- | --- |
| Manager admin | Address set in the Manager constructor; two-step handover via `propose_admin` / `accept_admin` | Registers/revokes implementation WASM hashes, selects the latest hash per name (`set_latest_implementation`) and the factory's current hashes (`set_current_implementations`), approves upgrade transitions, pauses the factory (`create_dao`, `create_module`, `open_assurance`, `launch_dao`, `launch_when_ready`), upgrades the Manager. It mints for no DAO: there is no platform minter |
| Deployer | `params.deployer` of `create_dao` | Authorizes `create_dao` (together with the launch admin); no standing authority afterward |
| Launch admin | `params.launch_admin` of `create_dao` | Admin of the core contracts (Token, Metadata, Governor, Treasury) and of every module (Auction, Marketplace, ClaimMinter) during the setup window. Must also authorize `create_dao`; authorizes `create_module`, `launch_dao`, `open_assurance`, `update_pending_slug`, and `recover_claims` after a failed drive |
| Treasury | The DAO Treasury contract | Admin of every contract (including itself) from launch onward, or from `open_assurance`; acts only through passed proposals |
| Transfer agent | A registered module the DAO named (`set_transfer_agent`) | Moves a member's token with that member's signature (`agent_transfer`), locked or not; see [Membership switches](#membership-switches-locked-tokens) |
| Anyone | Any account | `treasury.execute` for a Queued proposal, auction bid/settle, `marketplace.expire`, `restock` and `buy_from_pool` on a quick-buy pool, ClaimMinter `refund` and `release`, Manager `launch_when_ready` and `release_slug`, the DAO storage sweep (`ExtendFootprintTTL` / `RestoreFootprint`, no contract call), token holders' own actions, and claims by the people a claim list names |

## One admin model

Every module stores its admin with `common::admin`. The admin is the launch admin during setup and the Treasury after `launch`; `common::admin::handoff` is the only change and emits `AdminChanged { old_admin, new_admin }`. There is no `transfer_ownership`, two-step handover, `set_admin` or `renounce_ownership` on any module, so:

- a transfer started during setup cannot survive launch (there is none to start);
- governance cannot hand a module to a non-Treasury address, and cannot renounce the admin and brick minting, upgrades or settings.

Each module exposes `admin()` for reads. Admin-gated functions call `common::admin::require_admin`.

## Lifecycle: setup window and launch

Every contract starts in Setup. `launch` is one-shot, callable only by the Manager (`manager.require_auth()`), and panics `AlreadyLive` (7002) on a second call. `launch_dao` (and `launch_when_ready`, below) calls them in this order: Token, Governor, Treasury, every registered module (the Auction and Marketplace open only if the launch config says so), Metadata. It fails atomically, so a failed launch leaves every contract in Setup and `PendingDao` intact.

`create_dao` deploys the core four and the modules named in `Vec<ModuleSpec>` (Auction, Marketplace and Claims are each optional); `create_module` adds one more in Setup. All core wiring (token, treasury, governor, metadata, manager addresses) is passed to constructors and is immutable; modules are found through the Token's registry (`token.modules()`, `token.module(kind)`). `launch` checks that the Treasury argument equals the Treasury wired at construction (`TreasuryMismatch`).

During setup the launch admin can:

- mint founder tokens directly on the Token (`mint`, `batch_mint`; the admin mints without an allowance);
- grant or cut module allowances, and open free claim lists on the ClaimMinter;
- set the membership switches (`set_transfers_locked`, `set_members_only_delegation`, `set_dao_recovery`);
- add artwork to Metadata and update its settings (strings capped at 256 characters);
- change Auction, Marketplace and Governor parameters through the admin-only setters;
- upgrade contracts along Manager-approved transitions;
- rename the pending DAO's requested slug (`update_pending_slug`);
- open an assurance drive (`open_assurance`), which ends all of the above (see [Assurance launch](#assurance-launch)).

Before launch, `auction.unpause`, the Marketplace's `open_pool`, `restock`, `buy_from_pool`, `list` and `buy`, all Governor proposal functions, `treasury.execute`, `dao_transfer` and `agent_transfer` fail with `NotLive` (7001). The ClaimMinter's `claim` works in Setup: on a free list for the people it names, and on the assurance list (paid into escrow).

`launch_dao` enforces:

- the factory is not paused (`FactoryPaused`, 7111): the pause is the emergency stop for creation, drives and launch;
- `launch_admin` authorization and that it is still the Token admin (`LaunchAdminNotOwner`, 7126);
- the requested slug is still unclaimed (`SlugTaken`, 7123); see [Slugs](#slugs);
- every contract's current `wasm_hash()` (core and registered modules) is registered and not revoked (`PendingDaoUsesRevokedImplementation`, 7121), checked before any launch call;
- the Token's voting supply is greater than zero (`LaunchSupplyZero`, 7120): at least one token is held by someone other than the Treasury or a non-voting module;
- each module's payment asset equals the one recorded at `create_dao` / `create_module` (`PaymentAssetMismatch`);
- allowances: a started Auction is granted an unlimited allowance (`u32::MAX`, it sells one token per auction); the Marketplace gets none (each pool's proposal grants its stock); the ClaimMinter keeps what the launch admin granted; the Treasury needs none, because the admin mints without one.

## Mint allowances and modules

Minting is capped per module, not granted as a yes/no authority (docs/designs/membership-models.md § 1):

- The admin (launch admin in Setup, Treasury once Live) mints without limit. Every other minter must be a registered module and spends its `mint_allowance(module)`; `u32::MAX` means unlimited and is never decremented. The admin raises, lowers or releases allowances (`increase_mint_allowance`, `decrease_mint_allowance`, `release_mint_allowance`), each emitting `MintAllowanceChanged`.
- The registry holds at most `MAX_MODULES` entries, one per kind. In Setup only the Manager registers (`create_dao` / `create_module`, Manager-deployed code on registered hashes). After launch the Treasury may register any contract by proposal (`register_module(kind, address, non_voting)`), including code the Manager never deployed. Such a module's power is its allowance and anything the DAO approves it for; the web labels it "not deployed by the Manager".
- `non_voting` modules (Auction, Marketplace) are custody: tokens they hold carry no votes. A voting module (the ClaimMinter, a custom vault) holds voting units like any member, can be delegated to, and can vote if its code calls the Governor (review 2 C3); Manage → Membership shows the votes each module holds.
- `unregister_module` drops the module's allowance and any transfer-agent right. Tokens or escrow it holds stay with it; sweep them back first (`sweep_pool`, `release`).

Each ClaimMinter, Marketplace and Auction is per DAO. A bug in one is fixed by that DAO's own upgrade proposal to a Manager-approved hash, and cannot touch another DAO's escrow or mints.

## Membership switches (locked tokens)

Three Token switches, set by the admin (the launch admin in Setup, the Treasury by proposal once Live; all off by default; docs/designs/locked-tokens.md):

- **`transfers_locked`.** A token moves only along three paths: out of DAO custody (the Treasury or a non-voting module sends it: auction settlement, pool sales, cancels and sweeps), back to the DAO (to the Treasury), or a DAO-approved transfer (the Treasury is the spender). A holder's token can be approved, singly or for all, only to the Treasury; the rule reads the token's owner, not the approver, and revoking is always allowed. Minting is never a transfer, so claims, restocks and auctions keep working. **Locking takes away every member's exit by sale**: on an unlocked DAO a majority can lock by proposal, after which only giving the token back remains. The web flags the lock in proposal review.
- **`members_only_delegation`.** A new delegation must name the delegator or a member: an account holding at least one token that votes (not the Treasury, not a non-voting module). Tokens escrowed on the Marketplace don't count, so a member whose tokens are all listed can't be delegated to while listed. Existing delegations stay. Turning it on takes away members' freedom to delegate to non-members.
- **`dao_recovery`.** `dao_transfer(token_id, to)` lets the Treasury move any member's token by proposal (Live only; `RecoveryOff` otherwise; never to or from a registered module, `ModuleCustody`). It is lost-key recovery and, by the same power, recall. **With recovery on, a majority can take any membership.** Combined with a lock, a majority can lock and then recall; the web flags both switches.

Transfer agents are registered modules the DAO names (`set_transfer_agent`; the Manager in Setup, from `transfer_agents` at `create_dao`, the Treasury after launch). `agent_transfer(agent, from, to, token_id)` needs both the agent's and the owner's signatures, works on locked and unlocked tokens, and doesn't check the recipient's consent (an agent that needs it checks it itself). Unregistering a module revokes it as an agent.

## Assurance launch

A launch admin can open the DAO's launch as an assurance drive: `manager.open_assurance(token, list, launch_config)` (docs/designs/membership-models.md § 2–3).

- It opens the ClaimMinter's assurance list (price, `threshold_claimers`, `deadline` at most 90 days out, `DeadlineTooFar`), grants the allowance, reserves the slug, and hands every admin to the Treasury at once (early `handoff`). From then on nothing in Setup can change: settings, artwork, allowances and upgrades are frozen until launch.
- People on the list claim and pay into the ClaimMinter's per-list escrow. `assurance_state` is `Met` once enough distinct addresses have claimed, and `Failed` once the deadline passes with the Token not Live, whether the list was `Open` or `Met`.
- `launch_when_ready(token)` is open to anyone while the state is `Met` and the deadline hasn't passed; it runs every `launch_dao` check with the stored launch config and calls `release` in the same transaction, so the escrow reaches the Treasury with the launch.
- After a failure, `refund(list_id, claimer)` (anyone may call it; funds go only to the claimer) returns each payment, and `release_slug` frees the slug. Claimers keep their tokens, which carry no power because the DAO never goes Live.
- **`recover_claims` (review B2).** If the ClaimMinter's own refund code is broken, the launch admin recorded in `PendingDao` can upgrade that DAO's ClaimMinter, only after the drive has failed by the Manager's rule (`deadline` passed and the Token not Live; ClaimMinter's state machine is never consulted), and only to a Manager-approved `claims` hash. The window opens only once nothing can launch, so the upgrade can't change the outcome; it can only unblock refunds.
- **The platform can end a drive in refunds.** The Manager admin can pause the factory or revoke an implementation the DAO runs; either blocks `launch_when_ready` until the deadline passes, and the drive fails. Nobody loses funds (refunds stay open), but a `Met` drive can be denied its launch.

## Voting supply and quorum

Tokens held by the DAO's Treasury and its non-voting modules (Auction, Marketplace) carry no votes. The token reads custody from its registry (`non_voting`) and maps them to "no holder" in OpenZeppelin's `transfer_voting_units`: moving a token into one of them burns its voting unit and removes it from the `TotalSupply` checkpoint; moving it out mints the unit again for the receiver's delegate. Consequences:

- The Governor's quorum (`ceil(voting_supply_at_snapshot * quorum_bps / 10_000)`) and the proposal-threshold check use the voting-capable supply. Unsold auction tokens piling up in the Treasury, the token on auction and escrowed listings never raise the quorum, so governance cannot drift into a permanent quorum lock.
- System holders are never auto-delegated and can never vote (`ZeroVotingWeight`, 7512). A system holder calling `delegate` moves no votes, because it holds no voting units.
- A holder whose token is escrowed in the Marketplace loses that vote until the token returns (cancel/expire) or is bought (the buyer's delegate gains it). The holder's delegation itself is unchanged.
- Delegating *to* the Treasury is allowed; those units belong to a voting-capable holder and stay in the voting supply. The Treasury can only cast them through a passed proposal.
- Votes are read at the ledger before `propose`, and the quorum is fixed when the proposal is created from the voting supply and rate at that moment (stored on the proposal, D33), so later transfers, listings, mints or rate changes never change a proposal's weights or quorum. Tokens minted earlier in the proposing ledger count toward the quorum supply but cannot vote, so the requirement can only be higher, never lower.

These behaviors are covered by `contracts/token` (`delegation_security`) and the e2e test `system_held_tokens_and_votes_through_a_real_proposal`.

## Governance execution path

1. Proposal functions (`propose`, `cast_vote`, `queue`) run on the Governor. `propose` emits OpenZeppelin `ProposalCreated` and `ProposalScheduled { vote_start, vote_end, snapshot_ledger, quorum_votes }`.
2. Anyone calls `treasury.execute(targets, functions, args, description_hash)`. Authority comes from the proposal.
3. The Treasury calls `governor.consume(...)`, which requires the Treasury's auth, checks the proposal is Queued, past its ETA (`ProposalNotReady`, 7513) and unexpired, marks it Executed and emits `ProposalExecuted`.
4. The Treasury dispatches each action in order and emits one `Execute` event per action:
   - target = Treasury, function `authorize`: stores extra authorization trees for the next action (see below);
   - target = Treasury, any other function: the allowlist `upgrade(from, to)`, `migrate()`; anything else fails with `UnknownSelfCall` (7602) or `InvalidSelfCallArgs` (7603);
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

`create_dao` validates the requested slug and rejects one already claimed by a launched DAO, but does not claim it. The slug is stored in `PendingDao`; `launch_dao` claims it (permanent, unique, emits `SlugClaimed`) and fails with `SlugTaken` if another DAO launched with it first. The launch admin can then rename with `update_pending_slug`. An abandoned pending DAO holds no slug, so there is nothing to release or expire. The exception is an assurance drive: `open_assurance` claims the slug when the drive opens, so nobody can take it while people pay in; if the drive fails, anyone can free it with `release_slug` (`SlugReleased`).

After launch, `change_slug(token, new_slug)` (Manager 0.2.0) moves a DAO to a new slug. It refuses unknown tokens before calling them (only `launch_dao` writes `DaoSlug`), then requires the token's `admin()`, which is the Treasury after launch, so only a passed proposal can rename. This relies on the token having no admin transfer after launch; a token release that adds one must revisit it. The old slug is released in the same call and anyone may claim it, even in the same transaction as `treasury.execute`. The app redirects an old link only while no DAO holds it and tells voters so. The new slug is visible in the proposal before execution and can be taken first; execution then fails with `SlugTaken` and the DAO proposes again. The factory pause also blocks `change_slug`.

Trade-off: a pending DAO's requested slug is public, so someone can create and launch their own DAO with it first. That costs the create fee plus rent for the core contracts and yields a real, launched DAO, so it is far costlier than squatting at creation, but not impossible. Slug pricing (TODO in `manager/src/contract.rs`) is the lever if it becomes a problem.

## Auction

Settlement requires `now >= end_time` on both paths (`settle_and_create_new`, and `settle_auction` while paused; `AuctionActive`, 7404 otherwise). A pause, which every config change requires, therefore cannot be used to end a running auction early in the leader's favor; `cancel_auction` (admin, paused) is the only way to end a running auction, and it refunds the leader and sends the token to the Treasury.

Refunds to an outbid bidder are pushed; if the push fails, the amount is credited (`RefundDeferred`) and pulled later with `withdraw_refund` (`NoPendingRefund`, 7416, when empty), so a bidder that cannot receive cannot freeze the auction.

## Marketplace

- The secondary fee is capped at 25% (`common::MAX_FEE_BPS` = 2,500; `InvalidFee`, 7709). It is snapshotted into each listing.
- `list(token_id, seller, price, expires_at, max_fee_bps, payment_asset)`: the seller signs the worst fee and the asset they accept. If a fee or asset change lands between signing and inclusion, the listing fails (`FeeAboveMax`, 7714; `PaymentAssetMismatch`, 7712) instead of applying worse terms.
- `buy(token_id, buyer, max_price)` and `buy_from_pool(pool_id, page, token_id, buyer, max_price)` fail with `PriceAboveMax` (7715) above the buyer's bound.
- `expires_at` has no maximum; escrowed tokens stay in escrow until bought, cancelled (seller) or expired (anyone, after expiry).
- Quick-buy pools (`open_pool`, by proposal) sell new tokens at a fixed price into the Treasury, capped per buyer (`max_per_buyer`) and per period (`max_sold_per_period` every `period_secs`). Stock is minted into Marketplace custody by `restock` (anyone; it spends the Marketplace's allowance, which the opening proposal grants) and stored in pages of 64 ids. Closing (admin before expiry, anyone after) and `sweep_pool` send unsold stock back to the Treasury. **Each token sold adds a vote**: a pool larger than the voting supply can let buyers outvote today's members. The web shows the largest share one wallet could reach in the proposal draft. The per-buyer cap counts addresses, so it doesn't stop one person with many wallets.

## Batch minting

A transaction may publish at most 16 KiB of contract events. A `batch_mint` emits OpenZeppelin `Mint` per token, one `MintBatchWithMinter` for the id range and one metadata `SeedsGenerated` carrying every token's selections, plus OpenZeppelin delegation events for each recipient without a delegate. Measured worst case (16-trait artwork, all recipients new): ~376 bytes per call, ~288 per token, ~436 per recipient.

A ClaimMinter claim mints through `batch_mint` too, so one claim mints at most 43 tokens; `claim(list_id, claimer, leaf_amount, mint_now, proof, max_price)` records how much of the leaf is claimed, and a larger allocation is claimed over several transactions.

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

A code therefore identifies its crate even when it surfaces through a cross-contract call. The e2e test `error_codes_are_unique_per_crate_block` and a `common` unit test enforce the blocks. Errors raised by the token inside a ClaimMinter, Marketplace or Auction call propagate unchanged.

## TTL and archival

See [TTL_ECONOMICS.md](./TTL_ECONOMICS.md) for the policy. In short: instances are extended to ~170 days when fewer than 60 days remain; long-lived persistent entries (registry, slugs, delegations, mint allowances, artwork, refunds, claim lists and records) to the network cap when fewer than 30 days remain; proposals to 120 days (covers the longest lifecycle of 104 days) when fewer than 30 remain; listings to 30 days when fewer than 7 remain. Every module entry point extends the module's own instance. Contracts bump shared code only to 4 days (when under 2), so a caller never pays more than a few days of code rent; the platform prepays code. Everything else a DAO owns is renewed by a permissionless sweep: the core contracts' keys from chain reads, and each registered module's from its own `renewal_keys` pages; the payer is whoever signs. A module without `renewal_keys` (one registered from outside the Manager) has only its instance renewed, and the web says so.

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
- Manager admin trust. The admin selects the hashes future DAOs deploy, can revoke implementations and pause the factory. It holds no minting power over any DAO: every module that mints is the DAO's own, capped by an allowance the DAO sets, and upgrades only by the DAO's proposal (docs/designs/membership-models.md supersedes the shared Minter and STORAGE_DIET D41). **The Manager's own upgrade is visible for the full notice (D42):** it applies only `upgrade_delay()` ledgers after the approval and only to the hash the registry announces as latest (`latest_pointer(name)`), counting from the later of the approval and that announcement; re-announcing or re-approving never restarts the clock, and a reduction of the delay waits out the notice in force. Manage shows the pending upgrade with the ledger it can apply from. DAO contracts keep per-path approvals (a migration can pass through v2 on the way to v3) and need no latest-only rule. Creators should verify `DaoCreated.wasm_hashes` before launch. The admin is a single address with a two-step handover and no timelock; `PendingAdmin` has no expiry (withdraw with `cancel_pending_admin`). The admin can also end an assurance drive in refunds (see [Assurance launch](#assurance-launch)).
- Assurance proves a launch, not a community (review 2 C1). A drive shows that enough listed addresses claimed before the deadline. The launch admin wrote the list, so the addresses may all be theirs; the threshold counts addresses, not people.
- Issuer-controlled payment assets (review 2 C2). A pool, claim list or escrow priced in an asset whose issuer can freeze, claw back or deauthorize holders can be frozen or drained by that issuer, including the escrow refunds depend on. DAOs should price in plain assets (see the payment-asset limitation above).
- Modules can be delegates (review 2 C3). A voting module holds voting units like any member and can receive delegations; if its code calls the Governor it can vote them. Manage → Membership shows the votes each module holds.
- Outside modules. After launch the Treasury can register any contract as a module by proposal. Its mint allowance caps what it can mint, but the platform can't vouch for its code, its records are not covered by one-click renewal, and the indexer follows it once registered (below).
- Indexer allowlisting (accepted, review finding 3). The indexer follows every module a DAO's Token registers (`ModuleRegistered`), so any contract a DAO registers by proposal has its events indexed and shown in that DAO's activity. A DAO can't use this to inject rows into another DAO's views (identity is windowed per DAO), but a hostile contract can fill its own DAO's feed with noise. Operator remedy: delete the module's row from `streamling.dao_modules` (the Goldsky pipeline's dynamic table) to stop following it, and hide its rows in the read model if needed.
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

Claims use the ClaimMinter the Token's registry names (`token.module("claims")`),
the list's root, price and the claimer's record read from chain, and a
claimer-bound Merkle proof; restoration-required simulations are rejected. The
claim list is fetched from the list's `tree_uri` and rebuilt: the app offers a
proof only when the rebuilt root equals the chain's, and uses the rebuilt proof,
never the file's. The claim carries `max_price`, so a price change fails the claim.
The client rechecks the list, price and the claimer's progress before signing.
Opening a list after launch is a governance action (allowance grant, then
`open_list`) with exact-spec encoding; in Setup the launch admin signs it directly.

Display text is not authenticated by storage: the DAO profile is shown only when the
indexed text hashes to Metadata's `profile_hash()`; otherwise the app says the profile
is unavailable. Every app signature passes a fee guard that refuses a transaction able
to charge more than 50 XLM.

A member's ownership, balance and vote entries renew 30 days per touch. When one has
archived, the app restores it before the member's transaction: the restore is a
separate `RestoreFootprint` the member signs and pays for, built from the simulation
for their own account, and nothing else is sent until it confirms.

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
