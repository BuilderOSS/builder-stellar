# Manager contract

Platform implementation registry and deterministic six-module DAO factory. It keeps a permanent slug registry but is otherwise not an on-chain DAO directory, and it holds no DAO owner authority after launch.

## Factory

`predict_addresses(creator, nonce)` returns Token, Metadata, Auction, Governor, Treasury, and Marketplace addresses. `create_dao(params)` accepts deployer, `u64` nonce, launch admin, and initial Token/Metadata/Governance/Auction/Marketplace configuration, including the DAO `slug`. Deployer and launch admin both authorize (one auth when identical).

Creation validates factory/current implementation state and configuration, wires modules through constructors, claims the slug, emits `DaoCreated` with addresses, six hashes and the slug, and stores `PendingDao`. `get_pending_dao(token_address)` supports recovery; successful launch deletes it. There is no enumeration API or founder-allocation registry.

`launch_dao(token_address, launch_config)` validates launch-admin Token ownership, nonzero supply, current module hashes registered/non-revoked, and creation-time payment assets. `LaunchConfig` has `launch_auction`, `launch_marketplace`, `enable_minter`, and `expected_minter: Option<Address>`. Enabled Minter must match the registered address. All six modules become Live/Treasury-owned atomically.

## Slugs

Each DAO claims a unique, human-friendly slug in `create_dao` (`initial_config.slug`): 4-63 characters of `[a-z0-9-]`, no leading, trailing or doubled hyphen (`InvalidSlug`). A claimed slug fails with `SlugTaken`; claims are first come, first served and permanent (not released at launch).

- `get_dao_by_slug(slug)` returns the token address (`SlugNotFound` otherwise); `get_slug(token_address)` returns the slug. Neither extends TTL.
- Registry entries (`SlugToDao`, `DaoSlug`) are persistent and expire unless renewed. `bump_slug_ttl(slug)` is permissionless; DAO operators or the platform admin call it periodically (`node scripts/deploy-dao.mjs bump_slug_ttl <dao-config> <network-config>`). The network caps each extension at ~180 days.
- TODO before production: decide on slug pricing (see `TODO(pricing)` in `validate_slug`).

## Registry/admin

- Register implementation name/version/hash; revoke it; select six current module hashes.
- Approve directional `from_hash → to_hash` module upgrades. Both hashes must share the registered name; target must be active. A revoked source can migrate away.
- Read actual records/current hashes. Latest lookup has no fallback after revocation.
- Pause/unpause creation; set/get platform Minter.
- `propose_admin`, `accept_admin`, `cancel_pending_admin`, `get_admin`, `get_pending_admin`.
- `upgrade_manager(from_hash, to_hash)` requires admin, matching source, and active registered Manager destination. Versions come from registry, not caller-supplied upgrade labels.

Registration is write-once: an existing hash cannot be renamed, re-versioned, or un-revoked. Manager approval gates but cannot execute a DAO upgrade. Post-launch revocation does not halt normal DAO operation.

## Source and tests

[Contract](src/contract.rs), [structs/storage](src/storage.rs), [events](src/events.rs), [errors](src/error.rs). `cargo test -p manager`. [Deployment](../../docs/MANAGER_DEPLOYMENT.md) and [security](../../docs/SECURITY_MODEL.md).
