# Invariants

These are the properties the contracts must keep, each with the tests that check it. A property is **Covered** when tests assert it directly, **Partial** when they assert only part of it (the missing part is named), and **Missing** when no test asserts it. Test names are function names in the linked file; search the file for `fn <name>`.

The list was checked against `dev` at `f51d301`, which includes pull requests 118 to 130. The tests in [`contracts/e2e/src/audit_invariants.rs`](../../contracts/e2e/src/audit_invariants.rs) and [`audit_properties.rs`](../../contracts/e2e/src/audit_properties.rs) were added afterwards. They close INV-04, INV-10, INV-12, INV-13, INV-14, INV-18, INV-22, and INV-28, now Covered, and add property tests to INV-01 and INV-05, and the authorization-scope check to INV-16; INV-07, INV-08, INV-11, INV-27, INV-32, and INV-33 remain Partial. IDs are stable: a new property takes the next number and sits in the section it belongs to. When a contract change adds a test, link it here.

## Summary

| ID | Property | Status |
| --- | --- | --- |
| [INV-01](#inv-01-voting-units-equal-non-custody-balances) | Voting units equal non-custody balances | Covered |
| [INV-02](#inv-02-system-holders-never-vote) | System holders never vote | Covered |
| [INV-03](#inv-03-votes-and-the-quorum-are-fixed-at-the-snapshot) | Votes and the quorum are fixed at the snapshot | Covered |
| [INV-04](#inv-04-one-vote-per-account-and-only-the-proposer-cancels) | One vote per account, and only the proposer cancels | Covered |
| [INV-05](#inv-05-mint-allowance-accounting) | Mint allowance accounting | Covered |
| [INV-06](#inv-06-the-module-registry) | The module registry | Covered |
| [INV-07](#inv-07-batch-mints-fit-the-event-budget) | Batch mints fit the event budget | Partial |
| [INV-08](#inv-08-one-admin-per-contract) | One admin per contract | Partial |
| [INV-09](#inv-09-launch-is-one-shot-and-manager-only) | Launch is one-shot and Manager-only | Covered |
| [INV-10](#inv-10-a-failed-launch-changes-nothing) | A failed launch changes nothing | Covered |
| [INV-11](#inv-11-live-only-entry-points-refuse-before-launch) | Live-only entry points refuse before launch | Partial |
| [INV-12](#inv-12-handoff-freezes-setup) | Handoff freezes Setup | Covered |
| [INV-13](#inv-13-launch-checks) | Launch checks | Covered |
| [INV-14](#inv-14-the-factory-pause) | The factory pause | Covered |
| [INV-15](#inv-15-proposals-execute-only-through-the-treasury-once) | Proposals execute only through the Treasury, once | Covered |
| [INV-16](#inv-16-treasury-self-calls-and-authorization-trees) | Treasury self-calls and authorization trees | Covered |
| [INV-17](#inv-17-the-proposal-threshold) | The proposal threshold | Covered |
| [INV-18](#inv-18-governance-parameter-bounds) | Governance parameter bounds | Covered |
| [INV-19](#inv-19-proposal-expiry) | Proposal expiry | Covered |
| [INV-20](#inv-20-the-upgrade-path) | The upgrade path | Covered |
| [INV-21](#inv-21-the-managers-upgrade-notice) | The Manager's upgrade notice | Covered |
| [INV-22](#inv-22-claimminter-escrow-is-conserved) | ClaimMinter escrow is conserved | Covered |
| [INV-23](#inv-23-refund-and-release-are-mutually-exclusive) | Refund and release are mutually exclusive | Covered |
| [INV-24](#inv-24-assurance-state) | Assurance state | Covered |
| [INV-25](#inv-25-claims) | Claims | Covered |
| [INV-26](#inv-26-recovery-upgrades-of-a-failed-drive) | Recovery upgrades of a failed drive | Covered |
| [INV-27](#inv-27-auction-settlement-and-refunds) | Auction settlement and refunds | Partial |
| [INV-28](#inv-28-listings) | Listings | Covered |
| [INV-29](#inv-29-quick-buy-pools) | Quick-buy pools | Covered |
| [INV-30](#inv-30-membership-switches-and-transfer-agents) | Membership switches and transfer agents | Covered |
| [INV-31](#inv-31-slugs) | Slugs | Covered |
| [INV-32](#inv-32-error-codes-are-unique-per-crate) | Error codes are unique per crate | Partial |
| [INV-33](#inv-33-storage-and-ttl) | Storage and TTL | Partial |
| [INV-34](#inv-34-a-due-migration-admits-only-recovery-proposals) | A due migration admits only recovery proposals | Covered |
| [INV-35](#inv-35-payment-assets-are-stellar-asset-contracts) | Payment assets are Stellar Asset Contracts | Covered |
| [INV-36](#inv-36-every-module-halts-on-a-mismatched-layout) | Every module halts on a mismatched layout | Covered |
| [INV-37](#inv-37-a-drive-opens-only-on-current-or-announced-claimminter-code) | A drive opens only on current or announced ClaimMinter code | Covered |
| [INV-38](#inv-38-only-a-non-voting-module-brings-tokens-into-its-custody) | Only a non-voting module brings tokens into its custody | Covered |

## Votes and supply

### INV-01: Voting units equal non-custody balances

Each account's voting units equal its token balance, and are zero for the Treasury and the non-voting modules (Auction, Marketplace). The `TotalSupply` checkpoint equals the sum of all units, and the sum of `get_votes` equals `TotalSupply`.

- [`contracts/e2e/src/voting_invariant.rs`](../../contracts/e2e/src/voting_invariant.rs) `voting_units_match_balances_and_checkpoints_add_up`: a randomized walk (ten fixed seeds, 150 steps each) over mints, batch mints, transfers, custody moves, delegations, registering and unregistering a module, the membership switches, and the transfer paths, asserting all three equalities after every step. A refused unregister must move nothing.
- [`contracts/e2e/src/audit_properties.rs`](../../contracts/e2e/src/audit_properties.rs) `voting_units_equal_non_custody_balances_over_generated_sequences`: a property test (48 generated sequences of up to 40 steps, shrunk on failure) over mints, batch mints, transfers, custody moves into and out of the Treasury, Auction, Marketplace, and a vault module (a send or another minter's mint into a module is refused and changes nothing; the module pulls the token in or mints to itself), delegations, and registering a holder as a non-voting module, asserting the three equalities and that every minted token is held after every step. The Token has no burn: a voting unit is burned only when its token moves into custody or its holder becomes a non-voting module.
- [`contracts/token/src/test.rs`](../../contracts/token/src/test.rs) `system_holders_carry_no_votes_through_every_path`, `registering_a_holder_non_voting_removes_its_votes_from_its_delegate`, `a_voting_module_holding_tokens_can_be_unregistered_and_keeps_its_votes`.

**Covered.**

### INV-02: System holders never vote

The Treasury and non-voting modules are never auto-delegated and cannot cast a vote (`ZeroVotingWeight`, 7512); a system holder that delegates moves no votes.

- [`contracts/e2e/src/test.rs`](../../contracts/e2e/src/test.rs) `system_held_tokens_and_votes_through_a_real_proposal`.
- [`contracts/token/src/test.rs`](../../contracts/token/src/test.rs) `system_holders_are_never_auto_delegated_on_any_receive_path`, `treasury_delegating_explicitly_cannot_conjure_votes`.
- [`contracts/governor/src/test.rs`](../../contracts/governor/src/test.rs) `cast_vote_fails_with_zero_weight`.

**Covered.**

### INV-03: Votes and the quorum are fixed at the snapshot

Votes and the voting supply are read at the ledger before `propose`. The quorum is computed once and stored on the proposal; later mints, transfers, listings, or rate changes do not change it.

- [`contracts/e2e/src/test.rs`](../../contracts/e2e/src/test.rs) `quorum_does_not_follow_later_supply_or_rate_changes`, `escrow_in_the_proposing_ledger_does_not_lower_the_quorum`, `a_mint_in_the_proposing_ledger_counts_toward_the_quorum_supply` (despite its name, it asserts that tokens minted in the proposing ledger neither vote nor count toward the quorum supply).

**Covered.**

### INV-04: One vote per account, and only the proposer cancels

An account votes once per proposal, with a known vote type (OpenZeppelin `count_vote`: `AlreadyVoted`, `InvalidVoteType`). Only the proposer can cancel, and only while the proposal is `Pending` or `Active` (`ProposalNotCancellable`).

- [`contracts/governor/src/test.rs`](../../contracts/governor/src/test.rs) `a_second_vote_fails_already_voted`, `an_unknown_vote_type_fails_invalid_vote_type`, `only_the_proposer_can_cancel` (another account, with its own authorization, cannot cancel; the proposer then can).
- [`contracts/e2e/src/test.rs`](../../contracts/e2e/src/test.rs) `protocol_runs_on_chain_state_only` has the proposer cancel a pending proposal.
- [`contracts/e2e/src/audit_invariants.rs`](../../contracts/e2e/src/audit_invariants.rs) `a_proposal_past_active_cannot_be_cancelled_even_by_its_proposer`: the proposer cancels a `Pending` and an `Active` proposal, and is refused (`ProposalNotCancellable`, 5009, the state unchanged) for `Succeeded`, `Defeated`, `Queued`, `Executed`, `Expired`, and `Canceled` ones.

**Covered.**

## Minting

### INV-05: Mint allowance accounting

The admin mints without an allowance. Every other minter must be a registered module and spends its `mint_allowance`; minting past it fails (`AllowanceExceeded`) and leaves it unchanged. `u32::MAX` is unlimited and never decremented, and an increase that reaches it saturates to unlimited. `increase_mint_allowance`, `decrease_mint_allowance`, and `release_mint_allowance` change it as documented, and `unregister_module` sets it to zero. All of a ClaimMinter's lists draw on its one allowance.

- [`contracts/token/src/test.rs`](../../contracts/token/src/test.rs) `module_mints_within_its_allowance_and_stops_at_zero`, `an_unlimited_allowance_is_never_spent`, `an_increase_that_reaches_the_cap_saturates_to_unlimited`, `allowances_add_subtract_and_release`, `unregistering_zeroes_the_allowance_and_emits`.
- [`contracts/minter/src/test.rs`](../../contracts/minter/src/test.rs) `free_lists_share_the_drives_allowance`.
- [`contracts/e2e/src/audit_properties.rs`](../../contracts/e2e/src/audit_properties.rs) `minted_plus_remaining_equals_granted_over_generated_sequences`: a property test (64 generated sequences of up to 40 steps) over module mints and batch mints, admin mints, increases (some saturating to unlimited), decreases (some from unlimited), releases, unregistering and registering again. Each module mints only to its own recipient. After every step each module's allowance equals a model of the rules above, and while it is finite, the tokens it minted (read from its recipient's balance) plus its remaining allowance equal the net amount granted to it. Refused mints and increases change nothing.

**Covered.**

### INV-06: The module registry

One module per kind (`KindTaken`), at most `MAX_MODULES` (`TooManyModules`), the Treasury never a module. In Setup only the Manager registers; once Live only the admin, the Treasury. A non-voting module is unregistered only when it holds no tokens (`ModuleHoldsTokens`, 7222), so tokens it holds for others never lose their custody path; a voting module may leave while holding tokens. The admin can empty the Auction and the Marketplace while they are paused (`cancel_auction`, `return_listing`, `close_pool` and `sweep_pool`, and `recover_token`); nobody else can add a token meanwhile ([INV-38](#inv-38-only-a-non-voting-module-brings-tokens-into-its-custody)), but the Marketplace's own listings can still delay a removal ([KI-19](KNOWN_ISSUES.md#ki-19-removing-the-marketplace-can-be-delayed-by-its-listings)).

- [`contracts/token/src/test.rs`](../../contracts/token/src/test.rs) `kinds_are_built_in_or_custom_and_unique`, `the_registry_is_capped`, `registration_needs_the_manager_in_setup_and_the_admin_once_live`, `the_treasury_is_never_a_module_even_with_an_empty_registry`, `a_non_voting_module_holding_tokens_cannot_be_unregistered_until_empty`, `unregistering_a_custody_module_holding_escrow_under_the_lock_is_refused`, `a_voting_module_holding_tokens_can_be_unregistered_and_keeps_its_votes`.
- [`contracts/marketplace/src/test.rs`](../../contracts/marketplace/src/test.rs) `the_admin_returns_a_listing_to_its_seller_while_paused`, `only_the_admin_returns_a_listing`, `recover_token_moves_only_unrecorded_tokens_to_the_treasury`, `only_the_admin_recovers_a_token`.
- [`contracts/auction/src/test.rs`](../../contracts/auction/src/test.rs) `recover_token_sends_a_stray_token_to_the_treasury_but_never_the_lot`.
- [`contracts/e2e/src/membership_hardening.rs`](../../contracts/e2e/src/membership_hardening.rs) `unregistering_the_marketplace_while_it_holds_escrow_under_a_lock_is_refused` (refused while it holds a listing, pool stock, and a stray token, then emptied and unregistered) and `cutting_the_auction_allowance_mid_auction_still_settles_it` (the Auction emptied and unregistered).

**Covered.**

### INV-38: Only a non-voting module brings tokens into its custody

A `transfer`, `transfer_from`, `agent_transfer`, `mint` or `batch_mint` to a registered non-voting module fails `ModuleCustodyClosed` (7224) unless the module is the call's minter, spender or transfer agent, or already owns the token, and a refused call moves nothing. The Auction's own mint, the Marketplace's `list` pull and its `restock` mint pass. The Treasury, voting modules and members still take tokens from anyone, and an unregistered module is an ordinary address again.

- [`contracts/token/src/test.rs`](../../contracts/token/src/test.rs) `nobody_else_can_put_a_token_in_a_modules_custody`, `each_module_still_brings_its_own_tokens_in`, `a_transfer_agent_reaches_a_modules_custody_only_as_that_module`, `a_voting_module_takes_tokens_from_anyone`, `under_the_lock_the_treasury_reaches_a_module_only_through_it`, `a_token_sent_while_a_removal_is_pending_cannot_block_it`.
- [`contracts/e2e/src/membership_hardening.rs`](../../contracts/e2e/src/membership_hardening.rs) `unregistering_the_marketplace_while_it_holds_escrow_under_a_lock_is_refused` and `cutting_the_auction_allowance_mid_auction_still_settles_it` (a member's send to the real Marketplace and Auction refused); [`contracts/e2e/src/test.rs`](../../contracts/e2e/src/test.rs) `a_dao_without_optional_modules_launches_and_registers_external_code` (an outside vault pulls its token in).
- [`contracts/e2e/src/voting_invariant.rs`](../../contracts/e2e/src/voting_invariant.rs) `voting_units_match_balances_and_checkpoints_add_up`: every random mint, batch mint, transfer and agent transfer into custody by anyone but the module is refused and moves nothing; the module's pull and self-mint then pass.

**Covered.**

### INV-07: Batch mints fit the event budget

The Token refuses a batch over the `common::batch_mint_fits` estimate (`BatchTooLarge`, 7205), and every batch the estimate allows fits the 16 KiB per-transaction event limit. A claim of up to 43 tokens fits with its payment events. Because a proposal executes all its actions in one transaction, `propose` also refuses a proposal whose estimated execution events exceed `common::EXECUTION_EVENT_BUDGET` (`MintsTooLarge`, 7517). The estimate counts mints by name and argument shape and allows 200 bytes for the own events of each other action.

- [`contracts/token/src/test.rs`](../../contracts/token/src/test.rs) `batch_mint_respects_the_event_budget`: the token, recipient, and mixed edges, and `u32` overflow.
- [`contracts/e2e/src/test.rs`](../../contracts/e2e/src/test.rs) `batches_at_the_event_budget_fit_one_transaction`: measured event bytes at the edge stay under 90% of the limit with 16-trait artwork.
- [`contracts/e2e/src/claims.rs`](../../contracts/e2e/src/claims.rs) `the_largest_paid_claim_fits_the_event_limit`: a 43-token first claim on both payment paths.
- [`contracts/common/src/test.rs`](../../contracts/common/src/test.rs) `execution_event_estimate_matches_its_documented_shapes`.
- [`contracts/governor/src/test.rs`](../../contracts/governor/src/test.rs) `propose_refuses_mints_that_cannot_execute_together`, `other_mint_shapes_are_not_counted`.
- [`contracts/e2e/src/governance.rs`](../../contracts/e2e/src/governance.rs) `the_largest_mint_proposals_the_governor_accepts_execute_within_the_live_limits` (one 43-token batch beside two other actions, two batches of 21, ten single mints, and one batch to 18 recipients, each refused one step larger) and `a_twenty_action_proposal_of_costly_actions_executes_within_the_live_limits` (five mints and fifteen Governor setters).

**Partial:** the e2e suite executes the largest accepted shapes, not every proposal the estimate allows. An action whose own events exceed its 200-byte allowance can still make a passed proposal fail at execution, and the Governor does not estimate CPU or memory; the 20-action test measures those for one costly mix. `batch_mint_fits` has no unit test of its own; it is tested through the Token.

## Authority and lifecycle

### INV-08: One admin per contract

Each DAO contract has one admin, set at construction to the launch admin. `common::admin::handoff` is the only change, to the Treasury, at `open_assurance` or launch. No DAO contract exposes a transfer, a two-step handover, or a renounce. (The Manager, which is not a DAO contract, has a two-step handover of its own admin.)

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

- [`contracts/manager/src/test.rs`](../../contracts/manager/src/test.rs) `launch_dao_rejects_payment_asset_changed_during_setup`, `launch_checks_every_registered_modules_payment_asset`, `launch_checks_the_code_the_host_runs_not_the_hash_a_contract_reports`, `launch_dao_requires_launch_admin_auth`: after a failed launch, `PendingDao` remains and the Token or ClaimMinter admin is still the launch admin. `open_assurance_checks_the_code_every_contract_runs` checks the same for a drive refused on revoked code: no drive is recorded and the launch admin keeps the Token.

- [`contracts/e2e/src/audit_invariants.rs`](../../contracts/e2e/src/audit_invariants.rs) `a_launch_that_fails_at_any_contract_leaves_every_contract_as_it_was`, on the built WASM: each of the six launch calls after the Token's (Governor, Treasury, Auction, Marketplace, ClaimMinter, and Metadata) is made to fail in turn, by launching that contract first, so the calls before it ran and were reverted; with the Token launched first, the launch is refused before any call (`LaunchAdminNotOwner`). Afterwards every other contract's `Live` flag is false and its admin is the launch admin, the first auction's token was not minted, the Auction has no allowance, `PendingDao` is unchanged, and the slug is free.

**Covered.**

### INV-11: Live-only entry points refuse before launch

Before launch these fail with `NotLive` (7001): auction `unpause`; Marketplace `list`, `buy`, `open_pool`, `restock`, and `buy_from_pool`; Governor `propose`, `cast_vote`, `queue`, and `consume`; `treasury.execute`; `dao_transfer` and `agent_transfer`.

- [`contracts/governor/src/test.rs`](../../contracts/governor/src/test.rs) `proposal_entrypoints_are_not_live_before_launch_and_work_after`.
- [`contracts/treasury/src/test.rs`](../../contracts/treasury/src/test.rs) `execute_before_launch_is_not_live`.
- [`contracts/marketplace/src/test.rs`](../../contracts/marketplace/src/test.rs) `secondary_list_and_buy_before_launch_are_not_live`, and `open_pool` in the pool tests.
- [`contracts/token/src/test.rs`](../../contracts/token/src/test.rs) `dao_transfer_needs_recovery_takes_the_current_owner_and_never_touches_modules`, `transfer_agents_are_granted_by_the_registrar_and_need_both_signatures`.
- [`contracts/auction/src/test.rs`](../../contracts/auction/src/test.rs) `unpause_before_launch_is_not_live`.

**Partial:** `restock` and `buy_from_pool` are not asserted to fail with `NotLive`.

### INV-12: Handoff freezes Setup

After `open_assurance` hands every admin to the Treasury, nothing in Setup can change until launch: settings, artwork, mints, allowances, claim lists, registrations, and upgrades.

- [`contracts/manager/src/test.rs`](../../contracts/manager/src/test.rs) `a_met_drive_launches_with_the_stored_config_and_releases_the_escrow`.
- [`contracts/governor/src/test.rs`](../../contracts/governor/src/test.rs) `handoff_is_the_managers_freezes_settings_and_stays_in_setup`.
- [`contracts/metadata/src/test.rs`](../../contracts/metadata/src/test.rs) `handoff_is_the_managers_freezes_artwork_and_stays_in_setup`.
- [`contracts/minter/src/test.rs`](../../contracts/minter/src/test.rs) `handoff_freezes_the_lists_until_launch`. The Token's switches and `create_module` are also checked ([`contracts/token/src/test.rs`](../../contracts/token/src/test.rs), [`contracts/e2e/src/membership.rs`](../../contracts/e2e/src/membership.rs)).

- [`contracts/e2e/src/audit_invariants.rs`](../../contracts/e2e/src/audit_invariants.rs) `after_handoff_the_launch_admin_cannot_change_an_allowance_or_upgrade`, on the built WASM: after `open_assurance`, the launch admin's signature no longer raises or lowers the ClaimMinter's allowance, and no longer upgrades any of the seven contracts along a path the registry approved (an authorization error, with the code unchanged). Before the handoff the same signature raised the allowance, and with the admin's authorization mocked the same upgrades apply.

**Covered.**

### INV-13: Launch checks

`launch_dao` and `launch_when_ready` refuse when the factory is paused, the launch admin is no longer the Token admin, the slug is taken, a contract runs unregistered or revoked code, the voting supply is zero, an outside vote source is not approved, or a module's payment asset changed. The code check reads what each contract runs (`address.executable()`), not the hash it reports, and covers the core four and every registered module before the Manager calls into any of them. `open_assurance` runs the same code check before a drive opens.

- [`contracts/manager/src/test.rs`](../../contracts/manager/src/test.rs) `launch_dao_is_blocked_while_the_factory_is_paused`, `launch_rejects_each_contract_on_revoked_or_unregistered_code`, `launch_checks_the_code_the_host_runs_not_the_hash_a_contract_reports`, `open_assurance_checks_the_code_every_contract_runs`, `launch_with_zero_supply_returns_launch_supply_zero`, `launch_dao_rejects_payment_asset_changed_during_setup`, and the slug and vote-source tests.
- [`contracts/e2e/src/manager_hardening.rs`](../../contracts/e2e/src/manager_hardening.rs) `launch_checks_the_code_each_contract_runs`, on the built module WASM.

- [`contracts/e2e/src/audit_invariants.rs`](../../contracts/e2e/src/audit_invariants.rs) `a_launch_that_fails_at_any_contract_leaves_every_contract_as_it_was` triggers `LaunchAdminNotOwner` (7126) by launching the Token before `launch_dao`. With the deployed code the launch admin holds the Token until a drive or a launch hands it over, and `launch_dao` during a drive does not run this check, so the test reaches it only by that earlier launch.

**Covered.**

### INV-14: The factory pause

While the factory is paused, `create_dao`, `create_module`, `open_assurance`, `launch_dao`, `launch_when_ready`, and `change_slug` refuse (`FactoryPaused`, 7111).

- [`contracts/manager/src/test.rs`](../../contracts/manager/src/test.rs) `launch_dao_is_blocked_while_the_factory_is_paused`, `change_slug_is_blocked_while_the_factory_is_paused`, `create_module_needs_the_token_admin_and_an_unpaused_factory`, `a_failed_drive_refuses_every_launch_refunds_and_frees_its_slug`.

- [`contracts/e2e/src/audit_invariants.rs`](../../contracts/e2e/src/audit_invariants.rs) `a_paused_factory_refuses_create_dao_and_open_assurance`, on the built WASM: both fail with `FactoryPaused` (7111) and change nothing (no DAO, list, allowance, slug, or handoff); unpaused, both go through.

**Covered.**

## Governance

### INV-15: Proposals execute only through the Treasury, once

`governor.execute` always fails (`UseTreasuryExecute`, 7507). `consume` needs the Treasury's authorization, a `Queued` proposal, and `now >= eta`. A proposal executes once. A failing action reverts the whole execution, with no partial effects, and the proposal stays `Queued`. A proposal has at most 20 actions (`TooManyActions`, 7508). No proposal can consume another: `propose` refuses an action that calls the Governor's `consume` (`CannotConsume`, 7516), and the Treasury refuses to dispatch one (`CannotConsume`, 7606), so `ProposalExecuted` means the proposal's own actions ran.

- [`contracts/e2e/src/test.rs`](../../contracts/e2e/src/test.rs) `governor_execute_always_fails_with_use_treasury_execute`, `consume_by_non_treasury_fails`, `execute_before_eta_fails_and_after_expiry_fails`, `failing_call_in_multi_call_proposal_leaves_it_queued_without_partial_effects`, and the `ProposalAlreadyExecuted` and 21-action cases in the same file.
- [`contracts/governor/src/test.rs`](../../contracts/governor/src/test.rs) `propose_refuses_an_action_that_calls_consume`.
- [`contracts/treasury/src/test.rs`](../../contracts/treasury/src/test.rs) `execute_refuses_an_action_that_calls_the_governors_consume`.
- [`contracts/e2e/src/governance.rs`](../../contracts/e2e/src/governance.rs) `a_proposal_cannot_consume_another`, directly and through an `authorize` tree.

**Covered.**

### INV-16: Treasury self-calls and authorization trees

A proposal can call the Treasury itself only for `authorize`, `upgrade`, and `migrate` (`UnknownSelfCall` 7602, `InvalidSelfCallArgs` 7603). An `authorize` tree covers only the exact call it describes, only for the next action, and is bounded to depth 4 and 16 nodes (`InvalidAuthorization`, 7605). A tree may not contain a node for the Governor's `consume`, at any depth (`CannotConsume`, 7606).

- [`contracts/treasury/src/test.rs`](../../contracts/treasury/src/test.rs) `self_call_outside_allowlist_is_rejected`, `self_call_with_bad_args_is_rejected`, `authorization_is_exact_and_single_use`, `tree_size_and_depth_are_bounded`, `an_authorization_tree_for_consume_is_refused`, and the malformed-tree cases.
- [`contracts/e2e/src/audit_invariants.rs`](../../contracts/e2e/src/audit_invariants.rs), through the real Governor and Treasury with no authorization but the Treasury's own: `an_authorize_tree_does_not_outlive_the_call_it_was_attached_to`, `an_authorize_node_is_used_once_at_any_depth_below_its_call`, `a_nested_authorize_node_is_used_only_below_its_parent`, and `check_authorization_installs_no_authorization`.

**Covered.**

**Checked: a tree cannot be used by a later call.** The question was whether a tree an `authorize` action stores could be consumed by a `require_auth(treasury)` deeper in a later call than the one it was meant for. It cannot. `execute` hands the trees to the host (`authorize_as_current_contract`) together with the entry for the next action's own call, just before making that call, and the host drops those entries when that call returns, used or not. A later action that needs the tree, one or two levels below its own call, fails authorization and the proposal stays `Queued`. The controls show the missing tree is the cause: the unused tree and the action it was attached to execute on their own, and the later action executes with a tree of its own. Within the call it is attached to, a node is used once, by a call with exactly its contract, function, and arguments, at any depth below the call and whichever contract makes it: an action that makes the same debit twice is refused with nothing debited, while two nodes cover both. A node's sub-nodes are used only below the call that used the node: not when that call never runs, and not after it returns. `check_authorization` stores nothing: after it has checked a tree, a proposal that needs the tree but carries no `authorize` action is still refused.

### INV-17: The proposal threshold

The threshold is nonzero, and not above the voting supply when it is set. `propose` caps it at the voting supply at the snapshot and never below 1, and `votes_needed_to_propose()` returns that requirement.

- [`contracts/governor/src/test.rs`](../../contracts/governor/src/test.rs) `set_proposal_threshold_zero_fails`, `threshold_above_the_voting_supply_is_capped_at_the_supply`, `threshold_below_the_voting_supply_is_unchanged`.
- [`contracts/e2e/src/test.rs`](../../contracts/e2e/src/test.rs) `test_governor_proposal_threshold_exceeds_supply`.

**Covered.**

### INV-18: Governance parameter bounds

The voting delay, voting period, and queue delay are each 300 seconds to 30 days; the quorum is 1 to 10,000 basis points. Both the constructor and the setters check them.

- [`contracts/governor/src/test.rs`](../../contracts/governor/src/test.rs) `setters_accept_exact_max_and_reject_above`, `constructor_rejects_short_voting_delay`, `set_quorum_bps_zero_fails`, and the over-10,000 quorum case.
- [`contracts/e2e/src/test.rs`](../../contracts/e2e/src/test.rs) `test_governor_queue_delay_minimum_300`.

- [`contracts/e2e/src/audit_invariants.rs`](../../contracts/e2e/src/audit_invariants.rs) `a_governor_constructed_with_a_voting_period_under_300_seconds_is_refused` (the constructor, `InvalidVotingPeriod`, 7505) and `a_voting_period_under_300_seconds_is_refused_by_the_setter_and_the_manager` (`set_voting_period` refuses 0, 1, and 299 and keeps its value, and accepts 300; the Manager's `create_dao` refuses 299 with `InvalidGovernanceTiming`, 7118).

**Covered.**

### INV-19: Proposal expiry

A `Succeeded` proposal that is not queued expires 14 days after voting ends; a `Queued` one expires 14 days after its ETA. Expired proposals cannot be queued or executed. A proposal's storage outlives its longest lifecycle, 118 days: `propose` and `queue` each renew it to 120 days.

- [`contracts/governor/src/test.rs`](../../contracts/governor/src/test.rs) `queue_at_boundary_and_after_fails_and_state_is_expired`, `queue_just_before_expiry_works`, `queued_proposal_expires_after_14_days`, `queue_renews_the_proposal_for_the_rest_of_its_life`, and `a_proposal_lives_through_its_maximum_lifetime` (the 118-day lifecycle at 5-second and 4.5-second ledgers, with expired entries archived).
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

### INV-34: A due migration admits only recovery proposals

While the Governor's or the Treasury's stored storage version differs from its code's, every state-changing entry point on it fails (`StorageVersionMismatch`, Governor 7518, Treasury 7607), except for a recovery proposal: one whose every action is `upgrade` or `migrate` on the DAO's own Governor or Treasury. Such a proposal can be made, voted on (only proposals marked as recovery proposals take votes), queued, and executed. `upgrade`, `migrate`, and the views stay outside the gate, and `migrate` on these two modules needs no authorization. A failed migration can therefore be replaced by fixed code through governance.

- [`contracts/common/src/test.rs`](../../contracts/common/src/test.rs) `the_layout_is_current_only_when_the_stored_version_equals_the_code_version`.
- [`contracts/governor/src/test.rs`](../../contracts/governor/src/test.rs) `a_skipped_migration_halts_proposals_until_anyone_migrates`, `code_older_than_the_layout_refuses_to_run`, `a_recovery_proposal_runs_while_a_migration_is_due`, `consume_runs_only_recovery_proposals_while_a_migration_is_due`.
- [`contracts/treasury/src/test.rs`](../../contracts/treasury/src/test.rs) `execute_refuses_while_the_layout_is_out_of_step`, `launch_and_handoff_refuse_while_the_layout_is_out_of_step`, `a_recovery_proposal_executes_while_a_migration_is_due`.
- [`contracts/e2e/src/governance.rs`](../../contracts/e2e/src/governance.rs) `the_treasury_upgrades_then_migrates_in_two_steps`, `a_skipped_governor_migration_is_completed_by_anyone`, `a_governor_whose_migration_fails_recovers_by_proposal`, `a_treasury_whose_migration_fails_recovers_by_proposal`. The last two upgrade to a test-only release whose `migrate` always fails, then recover with a fixed release ([`contracts/e2e/fixtures/README.md`](../../contracts/e2e/fixtures/README.md)).

**Covered.** The other modules have the same gate without a recovery proposal; see [INV-36](#inv-36-every-module-halts-on-a-mismatched-layout).

### INV-36: Every module halts on a mismatched layout

While the Token's, Metadata's, Auction's, Marketplace's, ClaimMinter's or Manager's stored storage version differs from its code's, every entry point on it that changes state fails with its own `StorageVersionMismatch` (Token 7223, Metadata 7320, Auction 7421, Marketplace 7730, ClaimMinter 7831, Manager 7147). `upgrade`, `migrate`, the ClaimMinter's `recovery_upgrade`, and the views stay outside the gate. The ClaimMinter's and the Manager's `migrate` need no authorization; the others stay admin-only, which the Treasury reaches by proposal because the Governor and the Treasury never call a gated entry point to run one. While a Manager migration is due, only the steps of its own upgrade stay open: `register_implementation` and `set_latest_implementation` for the name `Manager`, `approve_upgrade` to a hash registered as `Manager`, and `upgrade_manager`. A Manager with no stored version reads as version 1.

- [`contracts/token/src/test.rs`](../../contracts/token/src/test.rs) `a_skipped_migration_halts_every_state_change_until_migrate`, `code_older_than_its_data_stays_halted_with_upgrade_open`.
- [`contracts/metadata/src/test.rs`](../../contracts/metadata/src/test.rs), [`contracts/auction/src/test.rs`](../../contracts/auction/src/test.rs) and [`contracts/marketplace/src/test.rs`](../../contracts/marketplace/src/test.rs) `a_skipped_migration_halts_every_state_change_until_migrate`.
- [`contracts/minter/src/test.rs`](../../contracts/minter/src/test.rs) `a_skipped_migration_halts_every_state_change`, `after_a_failed_drive_anyone_migrates_and_refunds_pay_out`.
- [`contracts/manager/src/test.rs`](../../contracts/manager/src/test.rs) `a_skipped_migration_halts_the_manager_except_its_own_upgrade`, `anyone_runs_the_managers_migration`, `a_manager_without_a_recorded_layout_reads_as_version_one`.

**Covered.** Each test calls every gated entry point of its module.

### INV-37: A drive opens only on current or announced ClaimMinter code

`open_assurance` refuses, with `DriveCodeNotAllowed` (7148) and before anything changes, a ClaimMinter whose code (read with `address.executable()`) is neither the current `claims` implementation nor the hash announced as the latest `ClaimMinter` at least `upgrade_delay()` ledgers ago.

- [`contracts/manager/src/test.rs`](../../contracts/manager/src/test.rs) `real_dao::open_assurance_refuses_claim_minter_code_that_is_not_current`, `real_dao::open_assurance_accepts_the_latest_claim_minter_once_its_notice_has_passed`.

**Covered.**

## Escrow and payments

### INV-22: ClaimMinter escrow is conserved

For the assurance list, until `release`, the list's `escrow` equals the sum of its claim records' `escrowed`, and the ClaimMinter's balance of the list's asset is the escrow plus whatever was sent to it directly. `release` sets the escrow to zero and leaves the records ([`ClaimList::escrow`](../../contracts/minter/src/storage.rs)); no refund can follow, because a released drive's Token is Live.

Only `claim` adds to escrow, and only `release` and `refund` take from it. An asset sent to the ClaimMinter directly is in no escrow, and no function moves it.

- [`contracts/minter/src/test.rs`](../../contracts/minter/src/test.rs) `a_met_drive_launches_and_the_escrow_moves_to_the_treasury`, `a_missed_deadline_fails_the_drive_and_refunds_pay_out`, `assets_sent_directly_stay_in_the_claim_minter`.
- [`contracts/e2e/src/membership.rs`](../../contracts/e2e/src/membership.rs) `a_failed_drive_refunds_recovers_and_frees_its_slug`.

- [`contracts/e2e/src/audit_invariants.rs`](../../contracts/e2e/src/audit_invariants.rs) `a_drives_escrow_equals_its_records_and_its_balance_after_every_step`, on the built WASM through the Manager: the three-way equality after every partial claim, a payment sent directly, refused claims, refunds, and releases, then either a met drive launched (escrow released, records kept) or a failed drive refunded one claimer at a time.
- [`contracts/e2e/src/audit_properties.rs`](../../contracts/e2e/src/audit_properties.rs) `claim_minter_escrow_equals_its_records_and_its_balance_over_generated_sequences`: a property test (64 generated drives and sequences of up to 40 steps) over claims, direct payments, the passing of time, launch, releases, and refunds, checking after every step the equality, each record against a model, the ClaimMinter's and the Treasury's balances, and that no payment is created or lost.

**Covered.**

### INV-23: Refund and release are mutually exclusive

`release` needs the Token Live and `refund` needs the drive failed, which needs the Token not Live, so a drive's escrow is paid out one way only. Each amount leaves escrow once, and a refund pays only the claimer, whoever calls it. A refund the claimer cannot receive fails and leaves the escrow in place.

- [`contracts/minter/src/test.rs`](../../contracts/minter/src/test.rs) `a_met_drive_launches_and_the_escrow_moves_to_the_treasury`, `a_missed_deadline_fails_the_drive_and_refunds_pay_out`, `a_met_drive_that_misses_its_deadline_also_fails`, `a_refund_waits_for_the_claimer_who_paid`.
- [`contracts/manager/src/test.rs`](../../contracts/manager/src/test.rs) `a_failed_drive_refuses_every_launch_refunds_and_frees_its_slug`.

**Covered.**

### INV-24: Assurance state

A drive is `Met` once `threshold_claimers` distinct addresses have claimed, counting partial claims once per address, and `Failed` once the deadline has passed with the Token not Live, even if it was `Met`. The threshold is from 1 to the list's `total` (`InvalidAssurance`, 7825), since each distinct claimer mints at least one token. The deadline is at most 90 days away, and a DAO has one drive.

- [`contracts/minter/src/test.rs`](../../contracts/minter/src/test.rs) `a_met_drive_launches_and_the_escrow_moves_to_the_treasury`, `a_missed_deadline_fails_the_drive_and_refunds_pay_out`, `a_met_drive_that_misses_its_deadline_also_fails`, `an_assurance_threshold_above_the_list_total_is_refused`.
- [`contracts/manager/src/test.rs`](../../contracts/manager/src/test.rs) `open_assurance_bounds_the_deadline_and_runs_once`.
- [`contracts/e2e/src/claims.rs`](../../contracts/e2e/src/claims.rs) `open_assurance_refuses_a_threshold_above_the_list_total`.

**Covered.**

### INV-25: Claims

A claim needs a Merkle proof for the claimer's own leaf; a claimer's total stays within the leaf amount and the list's total; the price is at most `max_price`; the list has not ended; and the mint stays within the ClaimMinter's allowance. `close_list` ends a list, but not the assurance list before launch. The contract and the web's tree builder hash leaves and nodes the same way, as the shared vectors in [`contracts/minter/test-vectors/merkle-v1.json`](../../contracts/minter/test-vectors/merkle-v1.json) pin, and no leaf `claim` can hash has a node's length.

- [`contracts/minter/src/test.rs`](../../contracts/minter/src/test.rs) `claims_check_the_proof_the_list_and_the_batch_size`, `a_free_setup_list_is_claimed_in_parts`, `a_live_list_pays_the_treasury_in_any_asset`, `the_dao_closes_a_setup_list_after_launch`, `close_list_is_the_admins_and_spares_an_open_drive`, `the_contract_hashes_the_shared_leaf_vectors`, `the_contract_accepts_the_web_builders_proofs`, `a_muxed_address_leaf_is_node_sized_but_can_never_be_claimed`.
- [`contracts/e2e/src/membership.rs`](../../contracts/e2e/src/membership.rs) `a_claim_minter_stops_at_its_allowance`.
- [`apps/web/src/lib/minter/tree.test.ts`](../../apps/web/src/lib/minter/tree.test.ts): the shared vectors block, for the web's `buildClaimTree`.

**Covered.** A single claim larger than its leaf is not tested on its own; the over-leaf case is tested after the leaf is used up.

### INV-26: Recovery upgrades of a failed drive

`recover_claims` works only for the launch admin recorded for the pending DAO, only after the drive has failed by the Manager's own rule, and only to an approved hash that the registry announces as latest for its name (`UpgradeNotLatest`, 7131). It waits out the upgrade notice since the later of the approval and the announcement, never less than seven days of ledgers, and the same notice in seconds since the drive's deadline, never less than seven days (`UpgradeDelayNotElapsed`, 7130). Members therefore have at least seven days after a drive fails, and after each recovery target is announced, to take their refunds with the code in place, even if the notice is lowered.

- [`contracts/manager/src/test.rs`](../../contracts/manager/src/test.rs) `recover_claims_waits_for_a_failed_drive_and_needs_the_launch_admin`, `a_lying_claim_minter_is_still_recovered_after_the_deadline`, `recovery_waits_out_the_notice_after_the_deadline_so_members_refund_first`, `a_newly_registered_recovery_target_waits_for_its_announcement_and_notice` (approval and announcement in different ledgers), `a_lowered_notice_still_leaves_members_the_refund_floor` (including a second recovery right after a first).
- [`contracts/minter/src/test.rs`](../../contracts/minter/src/test.rs) `recovery_upgrade_is_the_managers_and_only_before_launch`.
- [`contracts/e2e/src/membership.rs`](../../contracts/e2e/src/membership.rs) `a_failed_drive_refunds_recovers_and_frees_its_slug`, which announces the target and waits out the notice.

**Covered.**

### INV-27: Auction settlement and refunds

Settlement needs `now >= end_time` on both paths, paused or not. A settlement completes even when the Auction can no longer mint: with its allowance at 0, `settle_and_create_new` pauses the Auction instead of starting the next auction. `cancel_auction` refunds the leader and sends the token to the Treasury. An outbid refund is pushed, or credited and pulled with `withdraw_refund` if the push fails. Configuration changes need the Auction paused. `recover_token` never takes the token of an auction that has not settled (`TokenInAuction`, 7420). The Auction's balance equals the live bid plus the credited refunds.

- [`contracts/auction/src/test.rs`](../../contracts/auction/src/test.rs) `paused_settle_before_end_time_is_rejected`, `paused_settle_after_end_time_settles_to_the_winner`, `cancel_with_bidder_refunds_and_sends_nft_to_treasury`, `deferred_refund_then_withdraw`, `settle_completes_and_pauses_when_the_mint_allowance_is_cut_mid_auction`, `settle_with_an_allowance_left_starts_the_next_auction`, `recover_token_sends_a_stray_token_to_the_treasury_but_never_the_lot`; the `refunds` module's `assert_invariant` checks the balance equality.
- [`contracts/e2e/src/membership_hardening.rs`](../../contracts/e2e/src/membership_hardening.rs) `cutting_the_auction_allowance_mid_auction_still_settles_it`, on the built WASM.

**Partial:** only `set_duration` is tested for needing a pause.

### INV-28: Listings

The fee is at most 25% and recorded in the listing; a listing fails on a worse fee (`FeeAboveMax`) or another asset (`PaymentAssetMismatch`), and a purchase above `max_price` fails (`PriceAboveMax`). A purchase uses the recorded fee and asset. Only the seller cancels; anyone expires after expiry; the admin returns a listing only while the Marketplace is paused (`NotPaused`, 7729); all three return the token to the seller with no payment.

- [`contracts/marketplace/src/test.rs`](../../contracts/marketplace/src/test.rs) `list_rejects_a_fee_above_the_sellers_bound`, `list_rejects_an_unexpected_payment_asset`, `buy_rejects_a_price_above_the_buyers_bound`, `secondary_buy_uses_captured_asset_and_fee_after_config_changes`, `the_admin_returns_a_listing_to_its_seller_while_paused`, `only_the_admin_returns_a_listing`, and the fee-cap, cancel, and expire cases.

- [`contracts/e2e/src/audit_invariants.rs`](../../contracts/e2e/src/audit_invariants.rs) `a_listing_is_cancelled_only_by_its_seller`, on the built WASM: another account naming itself fails `NotSeller` (7708), naming the seller without the seller's signature fails authorization, and the listing and the escrowed token stay; the seller then cancels and gets the token back.

**Covered.**

### INV-29: Quick-buy pools

A pool enforces its per-buyer and per-period caps, reserves its own share of the Marketplace's allowance, refuses sales once closed or expired, and returns unsold stock to the Treasury through `close_pool` and `sweep_pool`. The admin closes at any time; anyone closes after expiry.

- [`contracts/marketplace/src/test.rs`](../../contracts/marketplace/src/test.rs) `a_buyer_picks_an_id_pays_the_treasury_and_hits_the_caps`, `pools_reserve_their_own_share_of_the_allowance`, `closing_stops_sales_and_sweeping_returns_unsold_stock`, `anyone_closes_an_expired_pool_and_restock_stops_at_expiry`.
- [`contracts/e2e/src/membership.rs`](../../contracts/e2e/src/membership.rs): a 100-token pool on the built WASM.

**Covered.**

### INV-35: Payment assets are Stellar Asset Contracts

Wherever a payment asset is set, it must be a Stellar Asset Contract: the Manager's `create_dao`, `create_module`, and `open_assurance` (`InvalidPaymentAsset`, 7146); the Auction's constructor and `set_payment_token` (`NotStellarAsset`, 7419); the Marketplace's constructor, `set_payment_asset`, and `open_pool` (`NotStellarAsset`, 7728). Accounts, undeployed addresses, and other contracts are refused. A list opened after launch may still use another asset, because the ClaimMinter does not check one.

- [`contracts/manager/src/test.rs`](../../contracts/manager/src/test.rs) `create_dao_requires_a_stellar_asset_contract_for_every_payment_asset`, `create_module_requires_a_stellar_asset_contract`, `open_assurance_refuses_a_recorded_asset_that_is_not_a_stellar_asset_contract`.
- [`contracts/auction/src/test.rs`](../../contracts/auction/src/test.rs) `constructor_refuses_a_payment_token_that_is_not_a_stellar_asset`, `constructor_refuses_an_account_as_payment_token`, `constructor_refuses_an_undeployed_contract_address_as_payment_token`, `set_payment_token_refuses_anything_but_a_stellar_asset`.
- [`contracts/marketplace/src/test.rs`](../../contracts/marketplace/src/test.rs) `the_constructor_refuses_an_asset_that_is_not_a_stellar_asset`, `set_payment_asset_refuses_anything_but_a_stellar_asset`, `a_pool_refuses_an_asset_that_is_not_a_stellar_asset`.
- [`contracts/e2e/src/manager_hardening.rs`](../../contracts/e2e/src/manager_hardening.rs) `a_payment_asset_must_be_a_stellar_asset_contract`; [`contracts/e2e/src/membership_hardening.rs`](../../contracts/e2e/src/membership_hardening.rs) `a_payment_asset_that_is_not_a_stellar_asset_is_refused_everywhere`.

**Covered.** The check cannot tell which issuer flags an asset has ([KI-10](KNOWN_ISSUES.md#ki-10-payment-assets-must-be-plain-stellar-asset-contracts)), and launch does not repeat it for an asset recorded before the check existed.

## Membership switches

### INV-30: Membership switches and transfer agents

With `transfers_locked`, a token moves only out of DAO custody, back to the Treasury, or with the Treasury as spender, and approvals go only to the Treasury. With `members_only_delegation`, a new delegation names the delegator or a member. `dao_transfer` works only when Live, with recovery on, and never to or from a module. `agent_transfer` needs both the agent's and the owner's signatures, and unregistering a module revokes it as an agent.

- [`contracts/token/src/test.rs`](../../contracts/token/src/test.rs) `a_locked_token_moves_only_along_the_dao_paths`, `approvals_on_a_locked_token_go_to_the_treasury_or_come_from_custody`, `dao_transfer_needs_recovery_takes_the_current_owner_and_never_touches_modules`, `transfer_agents_are_granted_by_the_registrar_and_need_both_signatures`, `agent_transfer_from_someone_other_than_the_owner_fails`, and the members-only delegation tests.
- [`contracts/e2e/src/locked.rs`](../../contracts/e2e/src/locked.rs), and the randomized walk in [`voting_invariant.rs`](../../contracts/e2e/src/voting_invariant.rs).

**Covered.**

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

Storage keys do not collide; entry points extend their contract's instance; shared code is bumped only briefly; a proposal's entries outlive its lifecycle ([INV-19](#inv-19-proposal-expiry)); and a DAO kept alive only by the permissionless sweep still works, with its renewal inventory matching the ledger.

- [`contracts/e2e/src/test.rs`](../../contracts/e2e/src/test.rs) `a_dao_kept_alive_by_the_sweep_alone_works_after_a_year`, `protocol_runs_on_chain_state_only`, `calls_bump_instance_long_and_shared_code_only_briefly`.
- [`contracts/governor/src/test.rs`](../../contracts/governor/src/test.rs) `state_changing_entrypoint_extends_instance_ttl`; each crate's `storage_keys_do_not_collide`; the `renewal_keys` tests in the Auction, Marketplace, and ClaimMinter.

**Partial:** instance extension is sampled at one entry point per crate, and the Token, Treasury, and Auction have no unit test for it.

## Test helpers

- **Randomized walk:** [`contracts/e2e/src/voting_invariant.rs`](../../contracts/e2e/src/voting_invariant.rs) is a fixed-seed walk that also requires each operation, refusals included, to run a minimum number of times.
- **Property tests:** [`contracts/metadata/src/storage/page_properties.rs`](../../contracts/metadata/src/storage/page_properties.rs) checks the attributes-page codec with fixed-seed generated input: round trips at the exact size, canonical encoding, malformed bytes refused without reading out of range, the public record form, and range writes against a map. [`contracts/e2e/src/audit_properties.rs`](../../contracts/e2e/src/audit_properties.rs) uses `proptest` for INV-01, INV-05, and INV-22: a fixed seed by default, so CI is repeatable; `PROPTEST_RNG_SEED` and `PROPTEST_CASES` explore other and longer runs, for example `PROPTEST_CASES=500 PROPTEST_RNG_SEED=7 cargo test -p dao-e2e audit_properties`. A failing case is shrunk to a shorter sequence. With the default seed and case count, each property also requires every kind of step that changes state or is refused to run a minimum number of times.
- **Invariant helpers:** the Auction's `refunds` module (`assert_invariant`); the Token's `assert_voting_supply` and the registry's `assert_books`.
- **Resource limits:** `assert_within_limits` in [`contracts/e2e/src/test.rs`](../../contracts/e2e/src/test.rs), used by `largest_create_dao_and_propose_fit_the_live_limits`, `reference_dao_sweep_fits_one_transaction`, the 1,000-leaf drive in [`membership.rs`](../../contracts/e2e/src/membership.rs), the largest paid claim in [`claims.rs`](../../contracts/e2e/src/claims.rs), and the mint and 20-action proposals in [`governance.rs`](../../contracts/e2e/src/governance.rs); the Manager's scale tests; the Metadata worst-case tests.
- **Storage:** [`contracts/common/src/testutils.rs`](../../contracts/common/src/testutils.rs) (`assert_keys_disjoint`, `assert_every_variant_sampled`, `assert_storage_namespaced`, a mock Manager).
- **Releases:** [`contracts/e2e/src/release_0_5_0.rs`](../../contracts/e2e/src/release_0_5_0.rs) upgrades the deployed 0.4.0 code in place, from fixtures of the deployed WASM. [`contracts/e2e/fixtures/README.md`](../../contracts/e2e/fixtures/README.md) describes the test-only Governor and Treasury releases the recovery tests use.
- **Vote sources:** [`contracts/e2e/src/vote_adapter.rs`](../../contracts/e2e/src/vote_adapter.rs) and the Governor's adapter tests cover DAOs that vote through another source.

## Coverage

[`scripts/coverage.sh`](../../scripts/coverage.sh) (`pnpm contracts:coverage`) writes a `cargo llvm-cov` report of line, region, and function coverage for the contract crates. [`docs/COVERAGE.md`](../COVERAGE.md) gives the latest figures, the commit they describe, and what the report leaves out: code that runs inside the Soroban VM is not instrumented, so the e2e tests on the built WASM add assurance the figures do not show. Run it at the frozen commit and send the report with the package.
