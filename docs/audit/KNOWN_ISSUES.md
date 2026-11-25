# Known issues

These are behaviours of the contracts and the read model that the project has accepted and documented. They are listed so that an auditor can see them before reporting them as new. Each entry restates an item from "Known limitations" in [`docs/SECURITY_MODEL.md`](../SECURITY_MODEL.md#known-limitations), with the code it concerns. Where this page and `SECURITY_MODEL.md` differ, `SECURITY_MODEL.md` is the reference and this page needs updating.

This page was checked against `dev` at `b1ef765`, which includes pull requests 118 to 120. An entry is not a claim that the behaviour is safe for every DAO: several depend on how a DAO configures itself, and say what voters, holders, or front ends should check.

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

**Behaviour.** A free claim list that the launch admin opens in Setup stays claimable after launch until its `expires_at`, up to the ClaimMinter's remaining mint allowance. Its unclaimed allocations are founder supply that `total_supply` does not show until they are claimed, and they become votes as soon as they are. The DAO can end such a list by proposal with `close_list`, which sets `expires_at` to now and emits `ListClosed`; a claim can still land before that proposal executes. `close_list` exists only in ClaimMinters from the release that adds it, and the app's proposal composer offers it separately.

**Guidance.** Voters and front ends should read open Setup lists and the ClaimMinter's allowance when judging supply.

**Code.** [`minter/src/contract.rs`](../../contracts/minter/src/contract.rs) `claim` and `close_list`.

TODO: app changes in progress relate to this entry; link them when they merge.

## KI-05: Treasury-held tokens never vote

**Behaviour.** Tokens the Treasury holds, such as unsold auction tokens or tokens transferred to the Treasury, carry no votes. They regain voting power only when a proposal transfers them out.

**Code.** [`token/src/contract.rs`](../../contracts/token/src/contract.rs) `is_custody` and `voting_holder`. See also [Voting supply and quorum](../SECURITY_MODEL.md#voting-supply-and-quorum).

## KI-06: No veto once a proposal is queued

**Behaviour.** There is no veto once a proposal is queued. Only expiry, 14 days after the ETA, stops it.

**Code.** [`governor/src/contract.rs`](../../contracts/governor/src/contract.rs) `cancel` and the state computation. See [the proposal state machine](STATE_MACHINES.md#proposal).

## KI-07: Opaque upgrade hashes and authorization trees

**Behaviour.** The chain checks that an upgrade's target hash is registered and approved, not what the code does. Voters must check `to_hash` against audited, reproducible builds, and must read any `authorize` trees a proposal carries, because each tree authorizes exactly the call it describes.

**Code.** [`common/src/upgrade.rs`](../../contracts/common/src/upgrade.rs) `apply`; [`treasury/src/contract.rs`](../../contracts/treasury/src/contract.rs) the `authorize` action and `check_authorization`.

TODO: link the published WASM hashes and the reproducible build instructions once the build work merges.

## KI-08: Proposal ids do not include the proposer

**Behaviour.** A proposal id is the hash of its actions and description, not of its proposer. Someone can submit an identical proposal first and then cancel it. An honest proposer then changes the description and proposes again.

**Code.** [`governor/src/contract.rs`](../../contracts/governor/src/contract.rs) `propose`, which uses OpenZeppelin's `hash_proposal`.

## KI-09: Slug front-running at launch

**Behaviour.** A pending DAO's requested slug is public, and it is claimed only at launch (or when an assurance drive opens). Someone can create and launch their own DAO with that slug first. That costs creating a DAO and the rent for its core contracts, and produces a real, launched DAO. The pending DAO's launch then fails with `SlugTaken`, and its launch admin renames it with `update_pending_slug`.

**Code.** [`manager/src/contract.rs`](../../contracts/manager/src/contract.rs) `create_dao`, `launch_dao`, and `update_pending_slug`. See [Slugs](../SECURITY_MODEL.md#slugs).

## KI-10: Payment assets must be plain Stellar Asset Contracts

**Behaviour.** Payment assets must be plain, non-regulated Stellar Asset Contracts. An asset with `AUTH_REQUIRED`, clawback, a fee on transfer, or a rebasing balance can freeze or misprice settlement.

**Guidance.** DAOs should price auctions, listings, pools, and claim lists in plain assets.

**Code.** The payment paths in [`auction/src/helpers.rs`](../../contracts/auction/src/helpers.rs), [`marketplace/src/contract.rs`](../../contracts/marketplace/src/contract.rs), and [`minter/src/contract.rs`](../../contracts/minter/src/contract.rs).

TODO: contract changes in progress may change this entry; update it when they merge.

## KI-11: Manager admin trust

**Behaviour.** The Manager admin selects the hashes that future DAOs deploy, can revoke implementations, and can pause the factory. It holds no minting power over any DAO: every module that mints belongs to the DAO, is capped by an allowance the DAO sets, and is upgraded only by the DAO's proposal.

The Manager's own upgrade is visible for a notice period: it applies only `upgrade_delay()` ledgers after the approval, and only to the hash the registry announces as latest (`latest_pointer(name)`), counting from the later of the approval and that announcement. Re-announcing or re-approving never restarts the clock, and a reduction of the delay waits out the notice in force. Manage shows the pending upgrade with the ledger it can apply from. DAO contracts keep per-path approvals (a migration can pass through v2 on the way to v3) and need no latest-only rule.

The admin is a single address with a two-step handover and no timelock. `PendingAdmin` has no expiry; the admin withdraws it with `cancel_pending_admin`. The admin can also end an assurance drive in refunds, by pausing the factory or revoking an implementation the DAO runs until the deadline passes ([Assurance launch](../SECURITY_MODEL.md#assurance-launch)).

**Guidance.** Creators should check `DaoCreated.wasm_hashes` before launch.

**Code.** [`manager/src/contract.rs`](../../contracts/manager/src/contract.rs): the registry, `pause_factory`, `upgrade_manager`, `propose_admin`, and `accept_admin`.

## KI-12: Assurance proves a launch, not a community

**Behaviour.** A drive shows that enough listed addresses claimed before the deadline. The launch admin wrote the list, so the addresses may all be theirs. The threshold counts addresses, not people.

**Code.** [`minter/src/contract.rs`](../../contracts/minter/src/contract.rs) `claim` and `assurance_state`.

## KI-13: Issuer-controlled payment assets

**Behaviour.** A pool, claim list, or escrow priced in an asset whose issuer can freeze, claw back, or deauthorize holders can be frozen or drained by that issuer, including the escrow that refunds depend on.

**Guidance.** DAOs should price in plain assets ([KI-10](#ki-10-payment-assets-must-be-plain-stellar-asset-contracts)).

## KI-14: Modules can be delegates

**Behaviour.** A voting module holds voting units like any member and can receive delegations. If its code calls the Governor, it can vote them. Manage, Membership shows the votes each module holds.

**Code.** [`token/src/contract.rs`](../../contracts/token/src/contract.rs) `register_module` (the `non_voting` flag) and the voting-unit hooks.

## KI-15: Outside modules

**Behaviour.** After launch, the Treasury can register any contract as a module by proposal, under any kind, including a built-in one. Its mint allowance caps what it can mint, but the platform cannot vouch for its code, and its records are not covered by one-click renewal.

In the read model, a known role (`auction`, `marketplace`, `claims`) means the Manager deployed the code: the indexer fills those roles only from the Manager's `DaoCreated` and `ModuleCreated` events, and the read model takes a registration's role from the kind the Manager deployed it as (`manager.manager_modules`). Every other registered contract has the role `module`: its events are indexed for its DAO but stay out of the domain views (pools, claim lists, auctions) and the public feed, `manager.daos` does not list it as the DAO's module of that kind, the claims page refuses to prepare calls against it, and Manage, Membership marks it "Not deployed by the Manager".

**Code.** [`token/src/contract.rs`](../../contracts/token/src/contract.rs) `register_module`; [`db/migrations/0002_manager_views.sql`](../../db/migrations/0002_manager_views.sql).

TODO: read-model changes in progress may change this entry; update it when they merge.

## KI-16: Indexer allowlisting

**Behaviour.** The indexer follows every contract a DAO's Token registers (`ModuleRegistered`, into `streamling.dao_modules`), so a contract a DAO registers by proposal has its events indexed under that DAO as admin rows. A DAO cannot use this to add rows to another DAO's views, because identity is windowed per DAO, but a hostile contract can fill its own DAO's admin feed with noise.

The views ignore malformed values from outside modules: a view that casts an event field reads only the roles the Manager deployed, and `manager.module_versions` and `manager.module_launches` do not take an outside module's own upgrade, storage-migration, or launch events, so such a contract's events cannot stop a shared view from reading for every DAO (migration 0012).

**Remedies.** The DAO unregisters the contract by vote, which ends its window in every view. Or the operator deletes its row from `streamling.dao_modules`, the only allowlist an outside contract is in, re-applies the pipeline (`packages/goldsky/scripts/deploy.sh deploy`), and checks that new events stop. Whether a running pipeline notices a deleted row without re-applying is not verified. Rows already indexed stay, because the landing tables are append-only.

**Code.** [`packages/goldsky/`](../../packages/goldsky/README.md); [`db/migrations/`](../../db/migrations).

## KI-17: Archival assumptions

**Behaviour.** The design assumes protocol 23 or later, with automatic restoration where footprints allow, plus periodic maintenance. See [`docs/TTL_ECONOMICS.md`](../TTL_ECONOMICS.md) and [`docs/MONITORING.md`](../MONITORING.md).
