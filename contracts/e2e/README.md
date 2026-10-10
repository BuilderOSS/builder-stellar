# In-memory contract integration tests

The `dao-e2e` crate tests real cross-contract Token, Metadata, Manager, Auction, Governor, Treasury, Marketplace, and SAC flows in Soroban's in-memory environment. It needs no deployed network or Docker.

```bash
# Repository root
pnpm contracts:build          # the factory-flow test loads the compiled module WASMs
cargo test -p dao-e2e
pnpm contracts:test
```

The workspace command includes unit and integration crates. Coverage includes mint hooks, voting snapshots, ordered Treasury execution, failed-action atomicity, replay/expiry, owner setters/upgrades, Treasury self-dispatch, auctions/refunds, and primary/secondary marketplace authorization. `full_factory_flow_create_setup_launch_with_slug` runs the real factory path with the compiled WASMs from `target/wasm32v1-none/release`: Manager `create_dao` (claims the slug; a duplicate fails `SlugTaken`), setup-window founder mint and artwork as the launch admin, `launch_dao`, then checks the slug outlives the pending record and `bump_slug_ttl` works. It panics with a build hint if the WASMs are missing; CI builds them first. Some tests use mocks; consult [test.rs](src/test.rs) for each fixture.

[Testnet rehearsal](../../docs/DAO_DEPLOYMENT.md) is separate: `scripts/e2e-testnet.mjs` submits network transactions and saves artifacts. It is not run by `cargo test`.
