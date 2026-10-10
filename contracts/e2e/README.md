# In-memory contract integration tests

The `dao-e2e` crate tests real cross-contract Token, Metadata, Manager, Auction, Governor, Treasury, Marketplace, Minter and SAC flows in Soroban's in-memory environment, with mainnet-like resource limits. It needs no deployed network or Docker.

```bash
# Repository root
pnpm contracts:build          # the factory-flow test loads the compiled module WASMs
cargo test -p dao-e2e
pnpm contracts:test
```

Coverage includes mint hooks, voting snapshots, ordered Treasury execution, failed-action atomicity, replay/expiry, admin setters and upgrades, Treasury self-dispatch, auctions/refunds (including no early settlement while paused), and primary/secondary marketplace authorization. Review-fix tests:

- `full_factory_flow_create_setup_launch_with_slug`: real factory path with the compiled WASMs from `target/wasm32v1-none/release`: a slug requested by two pending DAOs, setup-window founder mint and artwork, `launch_dao` claiming the slug, the rival failing `SlugTaken` and renaming, and `bump_slug_ttl`. Panics with a build hint if the WASMs are missing.
- `batches_at_the_event_budget_fit_one_transaction`: the largest batches `common::batch_mint_fits` allows (43 tokens to one recipient, 18 recipients × 1, 5 recipients × 7) against real 16-trait metadata, each under 90% of the 16 KiB event limit, with a mainnet-like `max_entry_ttl`.
- `treasury_buys_a_marketplace_listing_through_an_authorized_proposal`: nested authorization via an `authorize` action.
- `system_held_tokens_and_votes_through_a_real_proposal`: voting supply, quorum, delegation and system contracts never voting.
- `error_codes_are_unique_per_crate_block`.

Some tests use mocks; consult [test.rs](src/test.rs) for each fixture.

[Testnet rehearsal](../../docs/DAO_DEPLOYMENT.md) is separate: `scripts/e2e-testnet.mjs` submits network transactions and saves artifacts. It is not run by `cargo test`.
