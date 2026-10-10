# Manager contract

Platform implementation registry and deterministic six-module DAO factory. It keeps a permanent registry of claimed slugs but is otherwise not an on-chain DAO directory, and it holds no authority over a DAO after launch.

## Factory

`predict_addresses(creator, nonce)` returns Token, Metadata, Auction, Governor, Treasury, and Marketplace addresses. `create_dao(params)` accepts deployer, `u64` nonce, launch admin, and initial Token/Metadata/Governance/Auction/Marketplace configuration, including the requested `slug`. Deployer and launch admin both authorize (one auth when identical).

Creation validates the factory state (`FactoryPaused`), current implementations and configuration (shared bounds from `common`; marketplace fee at most 25%, `InvalidFee`), wires modules through constructors (the Token also receives the Auction and Marketplace addresses, which hold no votes), emits `DaoCreated` with addresses, six hashes and the requested slug, and stores `PendingDao`. `get_pending_dao(token_address)` supports recovery; launch deletes it.

`launch_dao(token_address, launch_config)` checks, in order: launch-admin auth, factory not paused (`FactoryPaused`), slug still free (`SlugTaken`), the launch admin is still the token admin (`LaunchAdminNotOwner`), module hashes registered/non-revoked, nonzero voting supply (`LaunchSupplyZero`), and the creation-time payment assets. `LaunchConfig` has `launch_auction`, `launch_marketplace`, `enable_minter`, and `expected_minter: Option<Address>`. All six modules become Live with the Treasury as admin, atomically; the slug is claimed (`SlugClaimed`) and `DaoLaunched` emitted.

## Slugs

A slug is 4-63 characters of `[a-z0-9-]`, no leading, trailing or doubled hyphen (`InvalidSlug`).

- `create_dao` only records the request (several pending DAOs may request the same slug) and rejects a slug claimed by a launched DAO.
- `launch_dao` claims it: unique, permanent. If another DAO launched with it first, `launch_dao` fails with `SlugTaken`.
- `update_pending_slug(token_address, slug)` (launch admin) renames a pending DAO's request.
- `get_dao_by_slug(slug)` / `get_slug(token_address)` resolve launched DAOs only (`SlugNotFound`); a pending request is in `get_pending_dao`. Neither read extends TTL.
- `bump_slug_ttl(slug)` is permissionless; call it periodically (`node scripts/deploy-dao.mjs bump_slug_ttl <dao-config> <network-config>`).
- TODO before production: decide on slug pricing (`TODO(pricing)` in `validate_slug`).

## Registry/admin

- `register_implementation(name, version, hash)` (write-once; does not move "latest"); `set_latest_implementation(name, hash)` selects the latest active hash for a name; `revoke_implementation`; `set_current_implementations` selects the six factory hashes.
- `approve_upgrade(from, to)`: both hashes share the registered name; target must be active; a revoked source can migrate away.
- `get_implementation`, `get_latest_implementation` (`None` once that hash is revoked), `is_upgrade_approved`, `get_implementation_version`.
- `pause_factory` / `unpause_factory` (blocks `create_dao` and `launch_dao`); `set_platform_minter` / `get_platform_minter`.
- `propose_admin`, `accept_admin`, `cancel_pending_admin`, `get_admin`, `get_pending_admin`.
- `upgrade_manager(from_hash, to_hash)` requires admin, matching source, and an approved, active Manager destination.

Ledger-number fields in events end in `_ledger` (`published_ledger`, `approved_ledger`, `revoked_ledger`, ...). Errors: block 7100.

## Source and tests

[Contract](src/contract.rs), [structs/storage](src/storage.rs), [events](src/events.rs), [errors](src/error.rs). `cargo test -p manager`. [Deployment](../../docs/MANAGER_DEPLOYMENT.md) and [security](../../docs/SECURITY_MODEL.md).
