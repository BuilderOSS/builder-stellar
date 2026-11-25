# In-memory contract integration tests

The `dao-e2e` crate tests real cross-contract Token, Metadata, Manager, Auction, Governor, Treasury, Marketplace, ClaimMinter and SAC flows in Soroban's in-memory environment, with mainnet-like resource limits. It needs no deployed network or Docker.

```bash
# Repository root
pnpm contracts:build          # the factory-flow test loads the compiled module WASMs
cargo test -p dao-e2e
pnpm contracts:test
```

Coverage includes mint hooks, voting snapshots, ordered Treasury execution, failed-action atomicity, replay/expiry, admin setters and upgrades, Treasury self-dispatch, auctions/refunds (including no early settlement while paused), and primary/secondary marketplace authorization. Review-fix tests:

- `full_factory_flow_create_setup_launch_with_slug`: real factory path with the compiled WASMs from `target/wasm32v1-none/release`: a slug requested by two pending DAOs, setup-window founder mint and artwork, `launch_dao` claiming the slug, the rival failing `SlugTaken` and renaming. Panics with a build hint if the WASMs are missing.
- `batches_at_the_event_budget_fit_one_transaction`: the largest batches `common::batch_mint_fits` allows (43 tokens to one recipient, 18 recipients × 1, 5 recipients × 7) against real 16-trait metadata, each under 90% of the 16 KiB event limit, with a mainnet-like `max_entry_ttl`.
- `treasury_buys_a_marketplace_listing_through_an_authorized_proposal`: nested authorization via an `authorize` action.
- `system_held_tokens_and_votes_through_a_real_proposal`: voting supply, quorum, delegation and system contracts never voting.
- `error_codes_are_unique_per_crate_block`.
- `voting_units_match_balances_and_checkpoints_add_up` (`src/voting_invariant.rs`): fixed-seed random mints, batch mints, transfers between wallets and the Treasury/Auction/Marketplace, and delegations, over eight seeds. After every step: voting units equal balance (zero for non-voting holders), `TotalSupply` equals the units, and the account checkpoints add up to `TotalSupply`. A vault module is registered and unregistered at random; unregistering it while it holds tokens is refused and moves nothing, so the sequence empties it first. It is the gate for the module registry in `docs/designs/membership-models.md` ("The Assignment").
- Custody and payment assets (`src/membership_hardening.rs`), on the built WASMs: a payment asset that is not a Stellar Asset Contract refused at creation, by the Marketplace's `set_payment_asset` and `open_pool`, and by the Auction's `set_payment_token`; the Marketplace refused unregistration while it holds an escrowed listing, pool stock, and a token sent to it directly under a transfer lock, then emptied by `return_listing`, `close_pool`, `sweep_pool`, and `recover_token` and unregistered; the Auction's allowance cut mid-auction, the auction still settling to its winner and pausing instead of minting; then resumed on an allowance of one, which its mint uses up, so the next settlement pauses it too; a token sent to it directly recovered with `recover_token` (the running lot refused), and the empty Auction unregistered.
- Membership token settings (`src/locked.rs`, [design](../../docs/designs/locked-tokens.md)), on the built WASMs: a DAO created with its switches and transfer agents (an uncreated agent kind refused, a later module not an agent); a locked DAO whose auction and pool still sell while resale, holder approvals and listings are refused, a DAO-approved transfer and an unlock by real proposals; one proposal turning recovery on and recovering a lost-key membership. The voting invariant also flips the three switches and runs `dao_transfer` and `agent_transfer`, and checks that a refused transfer or delegation moves nothing.
- Governance adapter (`src/vote_adapter.rs`, [design](../../docs/designs/governance-adapter.md)), on the built WASMs: a tribe created through the Manager with the approved mock adapter as its vote source refuses to launch with no adapter votes, then proposes, votes, queues and executes on adapter weights alone (the founder's NFT carries none); a withdrawn approval blocks a pending tribe's launch and new tribes; a token-weighted tribe reports its token as the source.
- Membership models (`src/membership.rs`, [design](../../docs/designs/membership-models.md)), on the built WASMs:
  - an assurance drive over a 1,000-leaf tree: a frozen DAO, partial claims counting once, refusals until `Met`, then anyone launches and the escrow reaches the Treasury in the launch transaction (resources measured);
  - a failed drive: both launch paths refused, refunds, the launch admin's `recover_claims` upgrade of the ClaimMinter, then the slug freed for another DAO;
  - a 100-token quick-buy pool: restocks at the event-budget edge against 16-trait artwork, buyer caps, close and sweep, with the renewal inventory checked against a ledger scan;
  - a ClaimMinter stopping at its allowance.

  Not covered here: an escrow balance archived during a quiet drive and restored by the launch (review 2 B6). The test host has no hot archive, so that path needs a testnet run.

Some tests use mocks; consult [test.rs](src/test.rs) for each fixture.

[Testnet rehearsal](../../docs/DAO_DEPLOYMENT.md) is separate: `scripts/e2e-testnet.mjs` submits network transactions and saves artifacts. It is not run by `cargo test`.
