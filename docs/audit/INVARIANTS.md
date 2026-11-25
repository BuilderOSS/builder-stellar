# Invariants

These are the properties the contracts must keep, each with the tests that check it. A property is **Covered** when tests assert it directly, **Partial** when they assert only part of it (the missing part is named), and **Missing** when no test asserts it. Test names are function names in the linked file; search the file for `fn <name>`.

The list describes `origin/dev` plus pull request 118; tests that exist only on that branch are marked "(pull request 118)". Contract changes in progress will add tests; link them here as they merge.

## Summary

| ID | Property | Status |
| --- | --- | --- |
| [INV-01](#inv-01-voting-units-equal-non-custody-balances) | Voting units equal non-custody balances | Covered |
| [INV-02](#inv-02-system-holders-never-vote) | System holders never vote | Covered |
| [INV-03](#inv-03-votes-and-the-quorum-are-fixed-at-the-snapshot) | Votes and the quorum are fixed at the snapshot | Covered |
| [INV-04](#inv-04-one-vote-per-account-and-only-the-proposer-cancels) | One vote per account, and only the proposer cancels | Missing |
| [INV-05](#inv-05-mint-allowance-accounting) | Mint allowance accounting | Covered |
| [INV-06](#inv-06-the-module-registry) | The module registry | Covered |
| [INV-07](#inv-07-batch-mints-fit-the-event-budget) | Batch mints fit the event budget | Covered |
| [INV-08](#inv-08-one-admin-per-contract) | One admin per contract | Partial |
| [INV-09](#inv-09-launch-is-one-shot-and-manager-only) | Launch is one-shot and Manager-only | Covered |
| [INV-10](#inv-10-a-failed-launch-changes-nothing) | A failed launch changes nothing | Partial |
| [INV-11](#inv-11-live-only-entry-points-refuse-before-launch) | Live-only entry points refuse before launch | Partial |
| [INV-12](#inv-12-handoff-freezes-setup) | Handoff freezes Setup | Partial |
| [INV-13](#inv-13-launch-checks) | Launch checks | Partial |
| [INV-14](#inv-14-the-factory-pause) | The factory pause | Partial |
| [INV-15](#inv-15-proposals-execute-only-through-the-treasury-once) | Proposals execute only through the Treasury, once | Covered |
| [INV-16](#inv-16-treasury-self-calls-and-authorization-trees) | Treasury self-calls and authorization trees | Covered |
| [INV-17](#inv-17-the-proposal-threshold) | The proposal threshold | Covered |
| [INV-18](#inv-18-governance-parameter-bounds) | Governance parameter bounds | Partial |
| [INV-19](#inv-19-proposal-expiry) | Proposal expiry | Covered |
| [INV-20](#inv-20-the-upgrade-path) | The upgrade path | Covered |
| [INV-21](#inv-21-the-managers-upgrade-notice) | The Manager's upgrade notice | Covered |
| [INV-22](#inv-22-claimminter-escrow-is-conserved) | ClaimMinter escrow is conserved | Partial |
| [INV-23](#inv-23-refund-and-release-are-mutually-exclusive) | Refund and release are mutually exclusive | Covered |
| [INV-24](#inv-24-assurance-state) | Assurance state | Covered |
| [INV-25](#inv-25-claims) | Claims | Covered |
| [INV-26](#inv-26-recovery-upgrades-of-a-failed-drive) | Recovery upgrades of a failed drive | Covered |
| [INV-27](#inv-27-auction-settlement-and-refunds) | Auction settlement and refunds | Partial |
| [INV-28](#inv-28-listings) | Listings | Partial |
| [INV-29](#inv-29-quick-buy-pools) | Quick-buy pools | Covered |
| [INV-30](#inv-30-membership-switches-and-transfer-agents) | Membership switches and transfer agents | Partial |
| [INV-31](#inv-31-slugs) | Slugs | Covered |
| [INV-32](#inv-32-error-codes-are-unique-per-crate) | Error codes are unique per crate | Partial |
| [INV-33](#inv-33-storage-and-ttl) | Storage and TTL | Partial |

## Votes and supply

### INV-01: Voting units equal non-custody balances

Each account's voting units equal its token balance, and are zero for the Treasury and the non-voting modules (Auction, Marketplace). The `TotalSupply` checkpoint equals the sum of all units, and the sum of `get_votes` equals `TotalSupply`.

- [`contracts/e2e/src/voting_invariant.rs`](../../contracts/e2e/src/voting_invariant.rs) `voting_units_match_balances_and_checkpoints_add_up`: a randomised walk (four fixed seeds, 150 steps each) over mints, batch mints, transfers, custody moves, delegations, the membership switches and the transfer paths, asserting all three equalities after every step.
- [`contracts/token/src/test.rs`](../../contracts/token/src/test.rs) `system_holders_carry_no_votes_through_every_path`, `registering_a_holder_non_voting_removes_its_votes_from_its_delegate`, `unregistering_a_holding_module_self_delegates_before_votes_return`.

**Covered.**

### INV-02: System holders never vote

The Treasury and non-voting modules are never auto-delegated and cannot cast a vote (`ZeroVotingWeight`, 7512); a system holder that delegates moves no votes.

- [`contracts/e2e/src/test.rs`](../../contracts/e2e/src/test.rs) `system_held_tokens_and_votes_through_a_real_proposal`.
- [`contracts/token/src/test.rs`](../../contracts/token/src/test.rs) `system_holders_are_never_auto_delegated_on_any_receive_path`, `treasury_delegating_explicitly_cannot_conjure_votes`.
- [`contracts/governor/src/test.rs`](../../contracts/governor/src/test.rs) `cast_vote_fails_with_zero_weight`.

**Covered.**

### INV-03: Votes and the quorum are fixed at the snapshot

Votes and the voting supply are read at the ledger before `propose`. The quorum is computed once and stored on the proposal; later mints, transfers, listings or rate changes do not change it.

- [`contracts/e2e/src/test.rs`](../../contracts/e2e/src/test.rs) `quorum_does_not_follow_later_supply_or_rate_changes`, `escrow_in_the_proposing_ledger_does_not_lower_the_quorum`, `a_mint_in_the_proposing_ledger_counts_toward_the_quorum_supply` (despite its name, it asserts that tokens minted in the proposing ledger neither vote nor count toward the quorum supply).

**Covered.**

### INV-04: One vote per account, and only the proposer cancels

An account votes once per proposal (OpenZeppelin `count_vote`). Only the proposer can cancel, and only while the proposal is `Pending` or `Active` (`ProposalNotCancellable`).

- [`contracts/e2e/src/test.rs`](../../contracts/e2e/src/test.rs) `protocol_runs_on_chain_state_only` has the proposer cancel a pending proposal.

**Missing:** no test asserts that a second vote fails, that someone other than the proposer cannot cancel, or that a proposal past `Active` cannot be cancelled.

## Minting

### INV-05: Mint allowance accounting

The admin mints without an allowance. Every other minter must be a registered module and spends its `mint_allowance`; minting past it fails (`AllowanceExceeded`) and leaves it unchanged. `u32::MAX` is unlimited and never decremented. `increase_mint_allowance`, `decrease_mint_allowance` and `release_mint_allowance` change it as documented, and `unregister_module` sets it to zero.

- [`contracts/token/src/test.rs`](../../contracts/token/src/test.rs) `module_mints_within_its_allowance_and_stops_at_zero`, `an_unlimited_allowance_is_never_spent`, `allowances_add_subtract_and_release`, `unregistering_zeroes_the_allowance_and_emits`.

**Covered.**

### INV-06: The module registry

One module per kind (`KindTaken`), at most `MAX_MODULES` (`TooManyModules`), the Treasury never a module. In Setup only the Manager registers; once Live only the admin, the Treasury.

- [`contracts/token/src/test.rs`](../../contracts/token/src/test.rs) `kinds_are_built_in_or_custom_and_unique`, `the_registry_is_capped`, `registration_needs_the_manager_in_setup_and_the_admin_once_live`, `the_treasury_is_never_a_module_even_with_an_empty_registry`.

**Covered.**

### INV-07: Batch mints fit the event budget

`common::batch_mint_fits` refuses a batch over its estimate (`BatchTooLarge`, 7205), and every batch it allows fits the 16 KiB per-transaction event limit.

- [`contracts/token/src/test.rs`](../../contracts/token/src/test.rs) `batch_mint_respects_the_event_budget`: the token, recipient and mixed edges, and `u32` overflow.
- [`contracts/e2e/src/test.rs`](../../contracts/e2e/src/test.rs) `batches_at_the_event_budget_fit_one_transaction`: measured event bytes at the edge stay under 90% of the limit with 16-trait artwork.

**Covered.** `batch_mint_fits` has no unit test of its own; it is tested through the Token.

## Authority and lifecycle

### INV-08: One admin per contract

Each contract has one admin, set at construction to the launch admin. `common::admin::handoff` is the only change, to the Treasury, at `open_assurance` or launch. No contract exposes a transfer, a two-step handover or a renounce.

- [`contracts/manager/src/test.rs`](../../contracts/manager/src/test.rs) `no_module_exposes_admin_transfer_or_renounce`, `a_met_drive_launches_with_the_stored_config_and_releases_the_escrow`, `launch_grants_exactly_the_canonical_mint_set`.
- [`contracts/common/src/test.rs`](../../contracts/common/src/test.rs) `admin_handoff_moves_authority_and_emits`.

**Partial:** "handoff is the only change" is checked by calling five common admin-transfer function names on every contract, not exhaustively.

### INV-09: Launch is one-shot and Manager-only

`launch` needs the Manager's authorization, and a second call fails with `AlreadyLive` (7002).

- [`contracts/manager/src/test.rs`](../../contracts/manager/src/test.rs) `second_launch_panics_already_live_for_all_six_modules`, `module_launch_requires_manager_auth_for_every_module`.
- [`contracts/minter/src/test.rs`](../../contracts/minter/src/test.rs) `launch_and_handoff_need_the_manager`.
- [`contracts/token/src/test.rs`](../../contracts/token/src/test.rs) `second_launch_panics_already_live`.

**Covered.**

### INV-10: A failed launch changes nothing

If any launch check or call fails, the transaction reverts: every contract stays in its previous state and `PendingDao` is kept.

- [`contracts/manager/src/test.rs`](../../contracts/manager/src/test.rs) `launch_dao_rejects_payment_asset_changed_during_setup`, `launch_checks_every_registered_modules_payment_asset`, `launch_rejects_revoked_hash_then_succeeds_after_upgrade_to_approved_hash`, `launch_dao_requires_launch_admin_auth`: after a failed launch, `PendingDao` remains and the Token or ClaimMinter admin is still the launch admin.

**Partial:** no test checks every contract's `Live` flag and admin after a failed launch.

### INV-11: Live-only entry points refuse before launch

Before launch these fail with `NotLive` (7001): auction `unpause`; Marketplace `list`, `buy`, `open_pool`, `restock` and `buy_from_pool`; Governor `propose`, `cast_vote`, `queue` and `consume`; `treasury.execute`; `dao_transfer` and `agent_transfer`.

- [`contracts/governor/src/test.rs`](../../contracts/governor/src/test.rs) `proposal_entrypoints_are_not_live_before_launch_and_work_after`.
- [`contracts/treasury/src/test.rs`](../../contracts/treasury/src/test.rs) `execute_before_launch_is_not_live`.
- [`contracts/marketplace/src/test.rs`](../../contracts/marketplace/src/test.rs) `secondary_list_and_buy_before_launch_are_not_live`, and `open_pool` in the pool tests.
- [`contracts/token/src/test.rs`](../../contracts/token/src/test.rs) `dao_transfer_needs_recovery_takes_the_current_owner_and_never_touches_modules`, `transfer_agents_are_granted_by_the_registrar_and_need_both_signatures`.
- [`contracts/auction/src/test.rs`](../../contracts/auction/src/test.rs): `unpause` before launch.

**Partial:** `restock` and `buy_from_pool` are not asserted to fail with `NotLive`.

### INV-12: Handoff freezes Setup

After `open_assurance` hands every admin to the Treasury, nothing in Setup can change until launch: settings, artwork, mints, allowances, claim lists, registrations and upgrades.

- [`contracts/manager/src/test.rs`](../../contracts/manager/src/test.rs) `a_met_drive_launches_with_the_stored_config_and_releases_the_escrow`.
- [`contracts/governor/src/test.rs`](../../contracts/governor/src/test.rs) `handoff_is_the_managers_freezes_settings_and_stays_in_setup`.
- [`contracts/metadata/src/test.rs`](../../contracts/metadata/src/test.rs) `handoff_is_the_managers_freezes_artwork_and_stays_in_setup`.
- [`contracts/minter/src/test.rs`](../../contracts/minter/src/test.rs) `handoff_freezes_the_lists_until_launch`. The Token's switches and `create_module` are also checked ([`contracts/token/src/test.rs`](../../contracts/token/src/test.rs), [`contracts/e2e/src/membership.rs`](../../contracts/e2e/src/membership.rs)).

**Partial:** after handoff, a launch-admin `increase_mint_allowance` and `upgrade` are not tested.

### INV-13: Launch checks

`launch_dao` and `launch_when_ready` refuse when the factory is paused, the launch admin is no longer the Token admin, the slug is taken, a contract runs an unregistered or revoked hash, the voting supply is zero, an outside vote source is not approved, or a module's payment asset changed.

- [`contracts/manager/src/test.rs`](../../contracts/manager/src/test.rs) `launch_dao_is_blocked_while_the_factory_is_paused`, `launch_rejects_each_module_on_revoked_or_unregistered_hash`, `launch_with_zero_supply_returns_launch_supply_zero`, `launch_dao_rejects_payment_asset_changed_during_setup`, and the slug and vote-source tests.

**Partial:** `LaunchAdminNotOwner` (7126) is never triggered by a test; only its code block is checked.

### INV-14: The factory pause

While the factory is paused, `create_dao`, `create_module`, `open_assurance`, `launch_dao`, `launch_when_ready` and `change_slug` refuse (`FactoryPaused`, 7111).

- [`contracts/manager/src/test.rs`](../../contracts/manager/src/test.rs) `launch_dao_is_blocked_while_the_factory_is_paused`, `change_slug_is_blocked_while_the_factory_is_paused`, `create_module_needs_the_token_admin_and_an_unpaused_factory`, `a_failed_drive_refuses_every_launch_refunds_and_frees_its_slug`.

**Partial:** `open_assurance` while paused is not tested, and the `create_dao` test does not check the error code.

## Governance

### INV-15: Proposals execute only through the Treasury, once

`governor.execute` always fails (`UseTreasuryExecute`, 7507). `consume` needs the Treasury's authorization, a `Queued` proposal and `now >= eta`. A proposal executes once. A failing action reverts the whole execution, with no partial effects, and the proposal stays `Queued`. A proposal has at most 20 actions (`TooManyActions`, 7508).

- [`contracts/e2e/src/test.rs`](../../contracts/e2e/src/test.rs) `governor_execute_always_fails_with_use_treasury_execute`, `consume_by_non_treasury_fails`, `execute_before_eta_fails_and_after_expiry_fails`, `failing_call_in_multi_call_proposal_leaves_it_queued_without_partial_effects`, and the `ProposalAlreadyExecuted` and 21-action cases in the same file.

**Covered.**

### INV-16: Treasury self-calls and authorization trees

A proposal can call the Treasury itself only for `authorize`, `upgrade` and `migrate` (`UnknownSelfCall` 7602, `InvalidSelfCallArgs` 7603). An `authorize` tree covers only the exact call it describes, only for the next action, and is bounded to depth 4 and 16 nodes (`InvalidAuthorization`, 7605).

- [`contracts/treasury/src/test.rs`](../../contracts/treasury/src/test.rs) `self_call_outside_allowlist_is_rejected`, `self_call_with_bad_args_is_rejected`, `authorization_is_exact_and_single_use`, `tree_size_and_depth_are_bounded`, and the malformed-tree cases.

**Covered.**

### INV-17: The proposal threshold

The threshold is nonzero, and not above the voting supply when it is set. `propose` caps it at the voting supply at the snapshot and never below 1, and `votes_needed_to_propose()` returns that requirement.

- [`contracts/governor/src/test.rs`](../../contracts/governor/src/test.rs) `set_proposal_threshold_zero_fails`; on pull request 118, `threshold_above_the_voting_supply_is_capped_at_the_supply` and `threshold_below_the_voting_supply_is_unchanged`.
- [`contracts/e2e/src/test.rs`](../../contracts/e2e/src/test.rs) `test_governor_proposal_threshold_exceeds_supply`.

**Covered** (the cap by pull request 118).

### INV-18: Governance parameter bounds

The voting delay, voting period and queue delay are each 300 seconds to 30 days; the quorum is 1 to 10,000 basis points. Both the constructor and the setters check them.

- [`contracts/governor/src/test.rs`](../../contracts/governor/src/test.rs) `setters_accept_exact_max_and_reject_above`, `constructor_rejects_short_voting_delay`, `set_quorum_bps_zero_fails`, and the over-10,000 quorum case.
- [`contracts/e2e/src/test.rs`](../../contracts/e2e/src/test.rs) `test_governor_queue_delay_minimum_300`.

**Partial:** a voting period below 300 seconds (`InvalidVotingPeriod`, 7505) is not tested.

### INV-19: Proposal expiry

A `Succeeded` proposal that is not queued expires 14 days after voting ends; a `Queued` one expires 14 days after its ETA. Expired proposals cannot be queued or executed.

- [`contracts/governor/src/test.rs`](../../contracts/governor/src/test.rs) `queue_at_boundary_and_after_fails_and_state_is_expired`, `queue_just_before_expiry_works`, `queued_proposal_expires_after_14_days`.
- [`contracts/e2e/src/test.rs`](../../contracts/e2e/src/test.rs) `execute_before_eta_fails_and_after_expiry_fails`.

**Covered.**

## Upgrades

### INV-20: The upgrade path

A module upgrade needs the admin's authorization, a Manager approval for the exact `from` to `to` pair, a non-revoked target, and the module's current hash equal to `from`. `migrate` runs only when the stored storage version is older (`NothingToMigrate`, 7012).

- [`contracts/common/src/test.rs`](../../contracts/common/src/test.rs) `upgrade_hash_mismatch`, `upgrade_not_approved`, `migrate_advances_storage_version_once`.
- [`contracts/manager/src/test.rs`](../../contracts/manager/src/test.rs) `test_revoked_target_is_rejected_for_approval_and_for_existing_approval`.
- Each crate's `upgrade_rejects_unauthorized_caller`, for example in [`contracts/token/src/test.rs`](../../contracts/token/src/test.rs).

**Covered.**

### INV-21: The Manager's upgrade notice

The Manager's own upgrade applies only `upgrade_delay()` ledgers after its approval and only to the hash announced as latest; re-approving or re-announcing does not restart the clock, and a shorter delay waits out the notice in force.

- [`contracts/manager/src/test.rs`](../../contracts/manager/src/test.rs) `manager_upgrade_waits_out_its_notice`.

**Covered** by one test.

## Escrow and payments

### INV-22: ClaimMinter escrow is conserved

For the assurance list, the list's `escrow` equals the sum of its claim records' `escrowed`, and the ClaimMinter's balance of the list's asset covers it.

- [`contracts/minter/src/test.rs`](../../contracts/minter/src/test.rs) `a_met_drive_launches_and_the_escrow_moves_to_the_treasury`, `a_missed_deadline_fails_the_drive_and_refunds_pay_out`.
- [`contracts/e2e/src/membership.rs`](../../contracts/e2e/src/membership.rs) `a_failed_drive_refunds_recovers_and_frees_its_slug`.

**Partial:** the tests check balances and single records at the start and end; no test asserts the three-way equality at intermediate states.

### INV-23: Refund and release are mutually exclusive

`release` needs the Token Live and `refund` needs the drive failed, which needs the Token not Live, so a drive's escrow is paid out one way only. Each amount leaves escrow once, and a refund pays only the claimer, whoever calls it.

- [`contracts/minter/src/test.rs`](../../contracts/minter/src/test.rs) `a_met_drive_launches_and_the_escrow_moves_to_the_treasury`, `a_missed_deadline_fails_the_drive_and_refunds_pay_out`, `a_met_drive_that_misses_its_deadline_also_fails`.
- [`contracts/manager/src/test.rs`](../../contracts/manager/src/test.rs) `a_failed_drive_refuses_every_launch_refunds_and_frees_its_slug`.

**Covered.**

### INV-24: Assurance state

A drive is `Met` once `threshold_claimers` distinct addresses have claimed, counting partial claims once per address, and `Failed` once the deadline has passed with the Token not Live, even if it was `Met`. The deadline is at most 90 days away, and a DAO has one drive.

- [`contracts/minter/src/test.rs`](../../contracts/minter/src/test.rs) `a_met_drive_launches_and_the_escrow_moves_to_the_treasury`, `a_missed_deadline_fails_the_drive_and_refunds_pay_out`, `a_met_drive_that_misses_its_deadline_also_fails`.
- [`contracts/manager/src/test.rs`](../../contracts/manager/src/test.rs) `open_assurance_bounds_the_deadline_and_runs_once`.

**Covered.**

### INV-25: Claims

A claim needs a Merkle proof for the claimer's own leaf; a claimer's total stays within the leaf amount and the list's total; the price is at most `max_price`; the list has not ended; and the mint stays within the ClaimMinter's allowance. `close_list` ends a list, but not the assurance list before launch.

- [`contracts/minter/src/test.rs`](../../contracts/minter/src/test.rs) `claims_check_the_proof_the_list_and_the_batch_size`, `a_free_setup_list_is_claimed_in_parts`, `a_live_list_pays_the_treasury_in_any_asset`; on pull request 118, `the_dao_closes_a_setup_list_after_launch` and `close_list_is_the_admins_and_spares_an_open_drive`.
- [`contracts/e2e/src/membership.rs`](../../contracts/e2e/src/membership.rs) `a_claim_minter_stops_at_its_allowance`.

**Covered.** A single claim larger than its leaf is not tested on its own; the over-leaf case is tested after the leaf is used up.

TODO: ClaimMinter changes in progress add Merkle test vectors shared with the TypeScript tree builder. Link them here when they merge.

### INV-26: Recovery upgrades of a failed drive

`recover_claims` works only for the launch admin recorded for the pending DAO, only after the drive has failed by the Manager's own rule, and only to an approved hash.

- [`contracts/manager/src/test.rs`](../../contracts/manager/src/test.rs) `recover_claims_waits_for_a_failed_drive_and_needs_the_launch_admin`, `a_lying_claim_minter_is_still_recovered_after_the_deadline`.
- [`contracts/minter/src/test.rs`](../../contracts/minter/src/test.rs) `recovery_upgrade_is_the_managers_and_only_before_launch`.
- [`contracts/e2e/src/membership.rs`](../../contracts/e2e/src/membership.rs) `a_failed_drive_refunds_recovers_and_frees_its_slug`.

**Covered.** TODO: the conditions on `recover_claims` are being revised; update this entry when that merges.

### INV-27: Auction settlement and refunds

Settlement needs `now >= end_time` on both paths, paused or not. `cancel_auction` refunds the leader and sends the token to the Treasury. An outbid refund is pushed, or credited and pulled with `withdraw_refund` if the push fails. Configuration changes need the Auction paused. The Auction's balance equals the live bid plus the credited refunds.

- [`contracts/auction/src/test.rs`](../../contracts/auction/src/test.rs) `paused_settle_before_end_time_is_rejected`, `paused_settle_after_end_time_settles_to_the_winner`, `cancel_with_bidder_refunds_and_sends_nft_to_treasury`, `deferred_refund_then_withdraw`; the `refunds` module's `assert_invariant` checks the balance equality.

**Partial:** only `set_duration` is tested for needing a pause.

### INV-28: Listings

The fee is at most 25% and recorded in the listing; a listing fails on a worse fee (`FeeAboveMax`) or another asset (`PaymentAssetMismatch`), and a purchase above `max_price` fails (`PriceAboveMax`). A purchase uses the recorded fee and asset. Only the seller cancels; anyone expires after expiry; both return the token to the seller.

- [`contracts/marketplace/src/test.rs`](../../contracts/marketplace/src/test.rs) `list_rejects_a_fee_above_the_sellers_bound`, `list_rejects_an_unexpected_payment_asset`, `buy_rejects_a_price_above_the_buyers_bound`, `secondary_buy_uses_captured_asset_and_fee_after_config_changes`, and the fee-cap, cancel and expire cases.

**Partial:** a cancel by someone other than the seller (`NotSeller`) is not tested.

### INV-29: Quick-buy pools

A pool enforces its per-buyer and per-period caps, reserves its own share of the Marketplace's allowance, refuses sales once closed or expired, and returns unsold stock to the Treasury through `close_pool` and `sweep_pool`. The admin closes at any time; anyone closes after expiry.

- [`contracts/marketplace/src/test.rs`](../../contracts/marketplace/src/test.rs) `a_buyer_picks_an_id_pays_the_treasury_and_hits_the_caps`, `pools_reserve_their_own_share_of_the_allowance`, `closing_stops_sales_and_sweeping_returns_unsold_stock`, `anyone_closes_an_expired_pool_and_restock_stops_at_expiry`.
- [`contracts/e2e/src/membership.rs`](../../contracts/e2e/src/membership.rs): a 100-token pool on the built WASM.

**Covered.**

## Membership switches

### INV-30: Membership switches and transfer agents

With `transfers_locked`, a token moves only out of DAO custody, back to the Treasury, or with the Treasury as spender, and approvals go only to the Treasury. With `members_only_delegation`, a new delegation names the delegator or a member. `dao_transfer` works only when Live, with recovery on, and never to or from a module. `agent_transfer` needs both the agent's and the owner's signatures, and unregistering a module revokes it as an agent.

- [`contracts/token/src/test.rs`](../../contracts/token/src/test.rs) `a_locked_token_moves_only_along_the_dao_paths`, `approvals_on_a_locked_token_go_to_the_treasury_or_come_from_custody`, `dao_transfer_needs_recovery_takes_the_current_owner_and_never_touches_modules`, `transfer_agents_are_granted_by_the_registrar_and_need_both_signatures`, and the members-only delegation tests.
- [`contracts/e2e/src/locked.rs`](../../contracts/e2e/src/locked.rs), and the randomised walk in [`voting_invariant.rs`](../../contracts/e2e/src/voting_invariant.rs).

**Partial:** an `agent_transfer` whose `from` is not the token's owner is not tested.

## Other

### INV-31: Slugs

A slug is unique. It is claimed at launch, or when a drive opens; `release_slug` frees it only after a failed drive; `change_slug` needs the Token's admin.

- [`contracts/manager/src/test.rs`](../../contracts/manager/src/test.rs) `slug_is_requested_at_create_and_claimed_at_launch`, `first_launch_wins_a_contested_slug_and_the_other_can_rename`, `a_failed_drive_refuses_every_launch_refunds_and_frees_its_slug`, `change_slug_requires_the_token_admin`.

**Covered.**

### INV-32: Error codes are unique per crate

Each crate's error codes sit in its own block of 100 in 7000 to 7899, outside OpenZeppelin's ranges.

- [`contracts/e2e/src/test.rs`](../../contracts/e2e/src/test.rs) `error_codes_are_unique_per_crate_block`.
- [`contracts/common/src/test.rs`](../../contracts/common/src/test.rs) `error_codes_sit_in_the_common_block`.

**Partial:** every `CommonError` variant is checked, but only two to four sample variants of each other crate.

### INV-33: Storage and TTL

Storage keys do not collide; entry points extend their contract's instance; shared code is bumped only briefly; and a DAO kept alive only by the permissionless sweep still works, with its renewal inventory matching the ledger.

- [`contracts/e2e/src/test.rs`](../../contracts/e2e/src/test.rs) `a_dao_kept_alive_by_the_sweep_alone_works_after_a_year`, `protocol_runs_on_chain_state_only`, `calls_bump_instance_long_and_shared_code_only_briefly`.
- [`contracts/governor/src/test.rs`](../../contracts/governor/src/test.rs) `state_changing_entrypoint_extends_instance_ttl`; each crate's `storage_keys_do_not_collide`; the `renewal_keys` tests in the Auction, Marketplace and ClaimMinter.

**Partial:** instance extension is sampled at one entry point per crate, and the Token, Treasury and Auction have no unit test for it.

## Test helpers worth knowing

- **Randomised walk:** [`contracts/e2e/src/voting_invariant.rs`](../../contracts/e2e/src/voting_invariant.rs) is the only property-style test. It is a fixed-seed walk that also requires each operation, refusals included, to run a minimum number of times.
- **Invariant helpers:** the Auction's `refunds` module (`assert_invariant`); the Token's `assert_voting_supply` and the registry's `assert_books`.
- **Resource limits:** `assert_within_limits` in [`contracts/e2e/src/test.rs`](../../contracts/e2e/src/test.rs), used by `largest_create_dao_and_propose_fit_the_live_limits`, `reference_dao_sweep_fits_one_transaction` and the 1,000-leaf drive in [`membership.rs`](../../contracts/e2e/src/membership.rs); the Manager's scale tests; the Metadata worst-case tests.
- **Storage:** [`contracts/common/src/testutils.rs`](../../contracts/common/src/testutils.rs) (`assert_keys_disjoint`, `assert_every_variant_sampled`, `assert_storage_namespaced`, a mock Manager).
- **Releases:** [`contracts/e2e/src/release_0_5_0.rs`](../../contracts/e2e/src/release_0_5_0.rs) upgrades the deployed 0.4.0 code in place, from fixtures of the deployed WASM.
- **Vote sources:** [`contracts/e2e/src/vote_adapter.rs`](../../contracts/e2e/src/vote_adapter.rs) and the Governor's adapter tests cover DAOs that vote through another source.

TODO: attach the coverage report for the frozen commit (`cargo llvm-cov`) once the build work adds it.
