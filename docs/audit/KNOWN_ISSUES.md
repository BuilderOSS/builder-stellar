# Known issues

These are behaviours of the contracts and the read model that the project has accepted and documented. They are listed so that an auditor can see them before reporting them as new. Each entry restates an item from "Known limitations" in [`docs/SECURITY_MODEL.md`](../SECURITY_MODEL.md#known-limitations), with the code it concerns. Where `SECURITY_MODEL.md` documents closely related accepted behaviour in another section, the entry adds it under **Also documented**, with a link to that section. Where this page and `SECURITY_MODEL.md` differ, `SECURITY_MODEL.md` is the reference and this page needs updating.

This page was checked against `dev` at `f51d301`, which includes pull requests 118 to 130. IDs are stable, so a new entry takes the next number. An entry is not a claim that the behaviour is safe for every DAO: several depend on how a DAO configures itself, and say what voters, holders, or front ends should check.

| ID | Issue | Area |
| --- | --- | --- |
| [KI-01](#ki-01-metadata-seed-grinding) | Metadata seed grinding | Metadata |
| [KI-02](#ki-02-governance-parameter-bounds) | Governance parameter bounds | Governor |
| [KI-03](#ki-03-founder-supply-and-early-takeover) | Founder supply and early takeover | Token, Manager |
| [KI-04](#ki-04-unclaimed-setup-lists) | Unclaimed Setup lists | ClaimMinter |
| [KI-05](#ki-05-treasury-held-tokens-never-vote) | Treasury-held tokens never vote | Token |
| [KI-06](#ki-06-no-veto-once-a-proposal-is-queued) | No veto once a proposal is queued | Governor |
| [KI-07](#ki-07-opaque-upgrade-hashes-and-authorization-trees) | Opaque upgrade hashes and authorization trees | Treasury, upgrades |
| [KI-08](#ki-08-proposal-ids-do-not-include-the-proposer) | Proposal ids do not include the proposer | Governor |
| [KI-09](#ki-09-slug-front-running-at-launch) | Slug front-running at launch | Manager |
| [KI-10](#ki-10-payment-assets-must-be-plain-stellar-asset-contracts) | Payment assets must be plain Stellar Asset Contracts | Auction, Marketplace, ClaimMinter |
| [KI-11](#ki-11-manager-admin-trust) | Manager admin trust | Manager |
| [KI-12](#ki-12-assurance-proves-a-launch-not-a-community) | Assurance proves a launch, not a community | Manager, ClaimMinter |
| [KI-13](#ki-13-issuer-controlled-payment-assets) | Issuer-controlled payment assets | Every module that holds funds |
| [KI-14](#ki-14-modules-can-be-delegates) | Modules can be delegates | Token |
| [KI-15](#ki-15-outside-modules) | Outside modules | Token, read model |
| [KI-16](#ki-16-indexer-allowlisting) | Indexer allowlisting | Indexer, read model |
| [KI-17](#ki-17-archival-assumptions) | Archival assumptions | All contracts |
| [KI-18](#ki-18-a-non-voting-module-that-will-not-release-its-tokens-stays-registered) | A non-voting module that will not release its tokens stays registered | Token |
| [KI-19](#ki-19-removing-the-marketplace-can-be-delayed-by-its-listings) | Removing the Marketplace can be delayed by its listings | Marketplace, Token |
| [KI-20](#ki-20-a-drive-holds-its-slug-until-its-deadline) | A drive holds its slug until its deadline | Manager |
| [KI-21](#ki-21-claim-list-hashing) | Claim list hashing | ClaimMinter |

## KI-01: Metadata seed grinding

**Behaviour.** A token's artwork seed is `keccak256(token_id, ledger sequence, ledger timestamp, host PRNG u64)`. Whoever controls when a mint happens, or decides whether to submit a transaction after simulating it, can choose preferred traits. `regenerate(token_id)` seeds only a token that has no attributes yet (`AlreadySeeded` otherwise).

**Code.** [`metadata/src/contract.rs`](../../contracts/metadata/src/contract.rs): the seed function and `regenerate`.

## KI-02: Governance parameter bounds

**Behaviour.** The voting delay, voting period, and queue delay must each be 300 seconds to 30 days; the quorum 1 to 10,000 basis points; the proposal threshold nonzero, and not above the voting supply when it is set. The supply check is skipped while the supply is zero, so a launch admin can set the threshold before minting. `propose` caps the threshold at the voting supply at the snapshot, so a threshold above the supply means a proposer needs every vote rather than proposals being impossible. A Governor without `votes_needed_to_propose` (0.5.0 and earlier) has no cap. Within these bounds a DAO can still choose parameters that are easy to capture or very slow. A quorum of 10,000 basis points needs every voting-capable token to take part.

**Code.** [`governor/src/contract.rs`](../../contracts/governor/src/contract.rs): the parameter checks, `set_proposal_threshold`, and `propose`.

## KI-03: Founder supply and early takeover

**Behaviour.** During Setup the launch admin can mint any number of founder tokens, in batches that fit the event budget, and delegate them. Launch requires only a nonzero voting supply. With the minimum timings, a majority holder can propose, vote, queue, and execute about 15 minutes after launch.

**Guidance.** Bidders and holders should inspect founder supply and delegation before taking part. Front ends should show the founders' share.

**Code.** [`token/src/contract.rs`](../../contracts/token/src/contract.rs) `mint` and `batch_mint`; [`manager/src/contract.rs`](../../contracts/manager/src/contract.rs) the launch checks.

## KI-04: Unclaimed Setup lists

**Behaviour.** A free claim list that the launch admin opens in Setup stays claimable after launch until its `expires_at`, up to the ClaimMinter's remaining mint allowance. Its unclaimed allocations are founder supply that `total_supply` does not show until they are claimed, and they become votes as soon as they are. The DAO can end such a list by proposal with `close_list`, which sets `expires_at` to now and emits `ListClosed`; a claim can still land before that proposal executes. `close_list` exists only in ClaimMinters from the release that adds it.

**In the app.** The claims page and Manage, Membership show this founder supply from the read model (`claims.lists.opened_in_setup`, migration 0014), capped at the ClaimMinter's remaining allowance, and mark each such list. The proposal composer's "Close a claim list" action calls `close_list`. The app first simulates the call and offers the action only when the function exists.

**Guidance.** Voters and front ends should read open Setup lists and the ClaimMinter's allowance when judging supply.

**Code.** [`minter/src/contract.rs`](../../contracts/minter/src/contract.rs) `claim` and `close_list`; [`db/migrations/0014_claim_list_closed.sql`](../../db/migrations/0014_claim_list_closed.sql); [`apps/web/src/lib/minter/close-list.ts`](../../apps/web/src/lib/minter/close-list.ts) and [`founder-supply.tsx`](../../apps/web/src/components/minter/founder-supply.tsx).

## KI-05: Treasury-held tokens never vote

**Behaviour.** Tokens the Treasury holds, such as unsold auction tokens or tokens transferred to the Treasury, carry no votes. They regain voting power only when a proposal transfers them out.

**Code.** [`token/src/contract.rs`](../../contracts/token/src/contract.rs) `is_custody` and `voting_holder`. See also [Voting supply and quorum](../SECURITY_MODEL.md#voting-supply-and-quorum).

## KI-06: No veto once a proposal is queued

**Behaviour.** There is no veto once a proposal is queued. Only expiry, 14 days after the ETA, stops it.

**Code.** [`governor/src/contract.rs`](../../contracts/governor/src/contract.rs) `cancel` and the state computation. See [the proposal state machine](STATE_MACHINES.md#proposal).

## KI-07: Opaque upgrade hashes and authorization trees

**Behaviour.** The chain checks that an upgrade's target hash is registered and approved, not what the code does. Voters must check that `to_hash` is the published build of a release tag, and must read any `authorize` trees a proposal carries, because each tree authorizes exactly the call it describes.

**Guidance.** Run `node scripts/verify-wasm.mjs <tag>`; see [Reproducible contract builds](../REPRODUCIBLE_BUILDS.md).

**Code.** [`common/src/upgrade.rs`](../../contracts/common/src/upgrade.rs) `apply`; [`treasury/src/contract.rs`](../../contracts/treasury/src/contract.rs) the `authorize` action and `check_authorization`; [`scripts/verify-wasm.mjs`](../../scripts/verify-wasm.mjs).

## KI-08: Proposal ids do not include the proposer

**Behaviour.** A proposal id is the hash of its actions and description, not of its proposer. Someone can submit an identical proposal first and then cancel it. An honest proposer then changes the description and proposes again.

**Code.** [`governor/src/contract.rs`](../../contracts/governor/src/contract.rs) `propose`, which uses OpenZeppelin's `hash_proposal`.

## KI-09: Slug front-running at launch

**Behaviour.** A pending DAO's requested slug is public, and it is claimed only at launch (or when an assurance drive opens). Someone can create and launch their own DAO with that slug first. That costs creating a DAO and the rent for its core contracts, and produces a real, launched DAO. The pending DAO's launch then fails with `SlugTaken`, and its launch admin renames it with `update_pending_slug`.

**Code.** [`manager/src/contract.rs`](../../contracts/manager/src/contract.rs) `create_dao`, `launch_dao`, and `update_pending_slug`. See [Slugs](../SECURITY_MODEL.md#slugs).

## KI-10: Payment assets must be plain Stellar Asset Contracts

**Behaviour.** Payment assets must be plain, non-regulated Stellar Asset Contracts. The Manager (at `create_dao`, `create_module`, and `open_assurance`, `InvalidPaymentAsset`), the Auction, and the Marketplace (`NotStellarAsset`) refuse anything that is not a Stellar Asset Contract ([INV-35](INVARIANTS.md#inv-35-payment-assets-are-stellar-asset-contracts)), but cannot tell which issuer flags an asset has. An asset with `AUTH_REQUIRED`, clawback, a fee on transfer, or a rebasing balance can freeze or misprice settlement.

**Guidance.** DAOs should price auctions, listings, pools, and claim lists in plain assets.

**Also documented** ([Lifecycle](../SECURITY_MODEL.md#lifecycle-setup-window-and-launch)). Launch checks that each module's payment asset equals the one recorded at `create_dao` or `create_module`; it does not check again that the asset is a Stellar Asset Contract. A DAO created before the Manager's check keeps the asset it recorded.

**Code.** `require_stellar_asset` in [`manager/src/contract.rs`](../../contracts/manager/src/contract.rs), [`auction/src/helpers.rs`](../../contracts/auction/src/helpers.rs), and [`marketplace/src/contract.rs`](../../contracts/marketplace/src/contract.rs); the payment paths in those modules and in [`minter/src/contract.rs`](../../contracts/minter/src/contract.rs).

## KI-11: Manager admin trust

**Behaviour.** The Manager admin selects the hashes that future DAOs deploy, can revoke implementations, and can pause the factory. It holds no minting power over any DAO: every module that mints belongs to the DAO, is capped by an allowance the DAO sets, and is upgraded only by the DAO's proposal, apart from `recover_claims` on a failed drive.

The Manager's own upgrade is visible for a notice period: it applies only `upgrade_delay()` ledgers after the approval, and only to the hash the registry announces as latest (`latest_pointer(name)`), counting from the later of the approval and that announcement. Re-announcing or re-approving never restarts the clock, and a reduction of the delay waits out the notice in force. Manage shows the pending upgrade with the ledger it can apply from. DAO contracts keep per-path approvals (a migration can pass through v2 on the way to v3) and need no latest-only rule, except a recovery upgrade.

The admin is a single address with a two-step handover and no timelock. `PendingAdmin` has no expiry; the admin withdraws it with `cancel_pending_admin`. The admin can also end an assurance drive in refunds, by pausing the factory or revoking an implementation the DAO runs until the deadline passes. With the launch admin of a failed drive, it can also replace that drive's ClaimMinter code once the upgrade notice has passed ([Assurance launch](../SECURITY_MODEL.md#assurance-launch), [INV-26](INVARIANTS.md#inv-26-recovery-upgrades-of-a-failed-drive)).

**Guidance.** Creators should check `DaoCreated.wasm_hashes` before launch.

**Code.** [`manager/src/contract.rs`](../../contracts/manager/src/contract.rs): the registry, `pause_factory`, `upgrade_manager`, `recover_claims`, `propose_admin`, and `accept_admin`.

## KI-12: Assurance proves a launch, not a community

**Behaviour.** A drive shows that enough listed addresses claimed before the deadline. The launch admin wrote the list, so the addresses may all be theirs. The threshold counts addresses, not people.

**Also documented** ([Assurance launch](../SECURITY_MODEL.md#assurance-launch)). A drive opens only on the current ClaimMinter implementation or the hash announced as the latest ClaimMinter at least the upgrade notice ago ([INV-37](INVARIANTS.md#inv-37-a-drive-opens-only-on-current-or-announced-claimminter-code)). The current implementation itself has no notice: the Manager admin can change it at once.

**Guidance.** The claims page shows the hash the network reports for the drive's ClaimMinter, with its registry release, before anyone pays. Members can check it against the published releases (`node scripts/verify-wasm.mjs <tag>`).

**Code.** [`minter/src/contract.rs`](../../contracts/minter/src/contract.rs) `claim` and `assurance_state`; [`manager/src/contract.rs`](../../contracts/manager/src/contract.rs) `open_assurance`.

## KI-13: Issuer-controlled payment assets

**Behaviour.** A pool, claim list, or escrow priced in an asset whose issuer can freeze, claw back, or deauthorize holders can be frozen or drained by that issuer, including the escrow that refunds depend on.

**Guidance.** DAOs should price in plain assets ([KI-10](#ki-10-payment-assets-must-be-plain-stellar-asset-contracts)).

## KI-14: Modules can be delegates

**Behaviour.** A voting module holds voting units like any member and can receive delegations. If its code calls the Governor, it can vote them. Manage, Membership shows the votes each module holds.

**Code.** [`token/src/contract.rs`](../../contracts/token/src/contract.rs) `register_module` (the `non_voting` flag) and the voting-unit hooks.

## KI-15: Outside modules

**Behaviour.** After launch, the Treasury can register any contract as a module by proposal, under any kind, including a built-in one. Its mint allowance caps what it can mint, but the platform cannot vouch for its code, and its records are not covered by one-click renewal.

In the read model, a known role (`auction`, `marketplace`, `claims`) means the Manager deployed the code for that DAO: the indexer fills those roles only from the Manager's `DaoCreated` and `ModuleCreated` events, and the read model takes a registration's role from the kind the Manager deployed it as, only when the registering DAO is the one it was deployed for (`manager.created_modules`, migration 0015). A DAO that registers another DAO's module sees it as role `module`, so it cannot present that DAO's market or claim list as its own and send buyers' payments to the other DAO. Every other registered contract has the role `module` too: its events are indexed for its DAO but stay out of the domain views (pools, claim lists, auctions) and the public feed, `manager.daos` does not list it as the DAO's module of that kind, the claims page refuses to prepare calls against it, and Manage, Membership marks it "Not deployed by the Manager".

**Code.** [`token/src/contract.rs`](../../contracts/token/src/contract.rs) `register_module`; [`db/migrations/0015_known_role_owner.sql`](../../db/migrations/0015_known_role_owner.sql), which replaces the registration views of [`0002_manager_views.sql`](../../db/migrations/0002_manager_views.sql).

## KI-16: Indexer allowlisting

**Behaviour.** The indexer follows every contract a DAO's Token registers (`ModuleRegistered`, into `streamling.dao_modules`), so a contract a DAO registers by proposal has its events indexed under that DAO as admin rows. A DAO cannot use this to add rows to another DAO's views, because identity is windowed per DAO, but a hostile contract can fill its own DAO's admin feed with noise.

The views ignore malformed values from outside modules: a view that casts an event field reads only the roles the Manager deployed, and `manager.module_versions` and `manager.module_launches` do not take an outside module's own upgrade, storage-migration, or launch events, so such a contract's events cannot stop a shared view from reading for every DAO (migration 0012).

**Remedies.** The DAO unregisters the contract by vote (once it holds no tokens, if it is non-voting; see [KI-18](#ki-18-a-non-voting-module-that-will-not-release-its-tokens-stays-registered)), which ends its window in every view. Or the operator deletes its row from `streamling.dao_modules`, the only allowlist an outside contract is in, re-applies the pipeline (`packages/goldsky/scripts/deploy.sh deploy`), and checks that new events stop. Whether a running pipeline notices a deleted row without re-applying is not verified. Rows already indexed stay, because the landing tables are append-only.

**Code.** [`packages/goldsky/`](../../packages/goldsky/README.md); [`db/migrations/`](../../db/migrations).

## KI-17: Archival assumptions

**Behaviour.** The design assumes protocol 23 or later, with automatic restoration where footprints allow, plus periodic maintenance. See [`docs/TTL_ECONOMICS.md`](../TTL_ECONOMICS.md) and [`docs/MONITORING.md`](../MONITORING.md).

## KI-18: A non-voting module that will not release its tokens stays registered

**Behaviour.** The Token refuses to unregister a non-voting module while it holds tokens (`ModuleHoldsTokens`, 7222), and `dao_transfer` cannot move tokens out of a module. An outside module whose code holds tokens and offers no way to release them, or a member's contract wallet registered as non-voting custody that keeps its tokens, can then never be unregistered. It stays custody (it may move its tokens out and approve anyone for them under the lock), keeps its kind, and stays in the indexer's allowlist. The DAO can still cut its allowance to 0 and revoke it as a transfer agent, and the operator can remove it from the indexer's allowlist ([KI-16](#ki-16-indexer-allowlisting)).

**Code.** [`token/src/contract.rs`](../../contracts/token/src/contract.rs) `unregister_module` and `dao_transfer`.

## KI-19: Removing the Marketplace can be delayed by its listings

**Behaviour.** The Token refuses a token sent to the Auction or the Marketplace by anyone but the module itself (`ModuleCustodyClosed`, 7224), so a direct send can no longer keep either registered. The Auction gains tokens only by minting its own lot, which `cancel_auction` in the removal proposal handles whichever lot is running. The Marketplace still takes tokens through `list`, and `return_listing` names the listings known when the proposal is drafted. While transfers are unlocked, a member can list a token before the removal proposal's `pause` runs; and in any DAO, a seller can cancel a listing the proposal returns, which then fails `ListingNotFound`. Either makes the removal revert. Pausing the market in an earlier proposal stops new listings, and a cancelled listing delays the removal only once, because the next proposal leaves it out.

**Code.** [`marketplace/src/contract.rs`](../../contracts/marketplace/src/contract.rs) `list`, `cancel` and `return_listing`; [`token/src/contract.rs`](../../contracts/token/src/contract.rs) `unregister_module` and `require_custody_entry`. See [Mint allowances and modules](../SECURITY_MODEL.md#mint-allowances-and-modules).

## KI-20: A drive holds its slug until its deadline

**Behaviour.** `open_assurance` reserves the slug when the drive opens, and `release_slug` frees it only once the drive has failed. A drive nobody intends to meet can therefore keep a slug from other DAOs for up to 90 days (`MAX_ASSURANCE_WINDOW`).

**Code.** [`manager/src/contract.rs`](../../contracts/manager/src/contract.rs) `open_assurance` and `release_slug`.

## KI-21: Claim list hashing

**Behaviour.** Merkle leaves and nodes carry no tag, and a root is not bound to a list, a ClaimMinter, or a network. The contract computes every leaf itself from the claimer and amount. No leaf `claim` can hash has a node's length: a node hashes 64 bytes, an account leaf 60, and a contract leaf 56; a muxed address would give 64, but `claim` takes an `Address`, which a muxed address never converts to. A root takes effect only when an admin opens a list with it, so a root opened on two lists lets each listed address claim on both, as the admins chose. Binding the list id would need the id when the tree is built, but a proposal opens its list under the id current when it executes.

**Code.** [`minter/src/contract.rs`](../../contracts/minter/src/contract.rs) `leaf_hash`, `node_hash`, and `claim`; the shared vectors in [`contracts/minter/test-vectors/merkle-v1.json`](../../contracts/minter/test-vectors/merkle-v1.json) pin the format for the contract and the web's tree builder ([INV-25](INVARIANTS.md#inv-25-claims)).
