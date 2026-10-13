# Manager contract

Platform implementation registry and deterministic DAO factory: four core contracts plus the modules each DAO asks for ([design §2](../../docs/designs/membership-models.md)). It keeps a permanent registry of claimed slugs but is otherwise not an on-chain DAO directory, and it holds no authority over a DAO after launch.

## Factory

`predict_addresses(creator, nonce)` returns the Token, Metadata, Governor and Treasury addresses and the address each module kind would get. `create_dao(params)` accepts deployer, `u64` nonce, launch admin, and initial Token/Metadata/Governance configuration with the requested `slug` and `modules: Vec<ModuleSpec>` (`Auction(AuctionConfig)`, `Marketplace(MarketplaceConfig)`, `Claims(ClaimsConfig { payment_asset })`). Each kind at most once; Phase 1 still requires an Auction and a Marketplace (`InvalidModules`). Deployer and launch admin both authorize (one auth when identical).

Creation validates the factory state (`FactoryPaused`), current implementations and configuration (shared bounds from `common`; marketplace fee at most 25%, `InvalidFee`), deploys the core contracts and each module (wired through constructors), registers every module on the Token (Auction and Marketplace non-voting), emits `DaoCreated` with addresses (a module the DAO lacks is `None`), hashes and the requested slug, and stores `PendingDao` with each module's creation payment asset. `get_pending_dao(token_address)` supports recovery; launch deletes it.

`create_module(token, spec, expected_n)` deploys another module for a DAO this Manager created (`DaoNotFound`), with the token admin's authorization, at `predict_module_address(token, kind, n)` where `n = module_count(token, kind)`; a different `expected_n` fails (`StaleModuleIndex`), so a proposal deploys exactly the module its later actions target. In Setup the module is registered on the Token and recorded in `PendingDao`; once Live it is launched at once (Treasury admin, not opened) and the proposal registers and funds it. Emits `ModuleCreated { token, kind, n, address }`.

`launch_dao(token_address, launch_config)` checks, in order: launch-admin auth, factory not paused (`FactoryPaused`), slug still free (`SlugTaken`), the launch admin is still the token admin (`LaunchAdminNotOwner`), the hashes of the core contracts and every registered module registered/non-revoked, nonzero voting supply (`LaunchSupplyZero`), and each module's `payment_asset()` against its creation asset (`PaymentAssetMismatch`, 7132). `LaunchConfig` has `launch_auction` and `launch_marketplace`. The Token launches with unlimited allowances for the Marketplace and (when started) the Auction; then the Governor and Treasury, every registered module through `DaoModule::launch`, and the Metadata go Live with the Treasury as admin, atomically. The slug is claimed (`SlugClaimed`) and `DaoLaunched` emitted with the launch-time registry. There is no platform Minter (7108 and 7110 are retired).

**Assurance launch** ([design §2](../../docs/designs/membership-models.md)). `open_assurance(token, list, launch_config)` (launch admin) opens a paid claim drive before launch: it opens the list on the DAO's ClaimMinter (`NoClaimMinter`) in the asset recorded at its creation, grants the ClaimMinter `total` allowance, records the drive (`get_assurance`) and reserves the slug (`SlugClaimed`), then hands every contract's admin to the Treasury without going Live (`handoff` on the core four and `DaoModule::handoff` on every module), which freezes the DAO until launch. One drive per DAO (`AssuranceExists`); the deadline is at most `MAX_ASSURANCE_WINDOW`, 90 days, away (`DeadlineTooFar`); `update_pending_slug` refuses during a drive (`AssuranceOpen`). Emits `AssuranceOpened`.

A drive has failed once its deadline passed and the Token is not Live; the Manager applies this rule itself and never asks the ClaimMinter. Every launch path, `launch_when_ready(token)` (anyone) and the launch admin's `launch_dao`, then requires the list to be `Met` (`AssuranceNotMet`) and not failed (`AssuranceFailed`), and uses the stored launch config. The ClaimMinter releases the escrow to the Treasury in the launch transaction. After a failure, anyone may `release_slug(token)` (`SlugReleased`), and the launch admin may `recover_claims(token, from, to)` to upgrade only that DAO's ClaimMinter to a registry-approved hash; the Manager checks the approval itself, since the ClaimMinter cannot call it back (`InvalidUpgradePath`, `AssuranceNotFailed`).

## Slugs

A slug is 4-63 characters of `[a-z0-9-]`, no leading, trailing or doubled hyphen (`InvalidSlug`).

- `create_dao` only records the request (several pending DAOs may request the same slug) and rejects a slug claimed by a launched DAO.
- `launch_dao` claims it: unique, permanent. If another DAO launched with it first, `launch_dao` fails with `SlugTaken`.
- `update_pending_slug(token_address, slug)` (launch admin) renames a pending DAO's request.
- `get_dao_by_slug(slug)` / `get_slug(token_address)` resolve launched DAOs only (`SlugNotFound`); a pending request is in `get_pending_dao`. Neither read extends TTL.
- The slug pair (`SlugToDao`, `DaoSlug`) is renewed by the DAO's renewal sweep (docs/STORAGE_DIET.md § 7).
- TODO before production: decide on slug pricing (`TODO(pricing)` in `validate_slug`).

## Registry/admin

- `register_implementation(name, version, hash)` (write-once; does not move "latest"); `set_latest_implementation(name, hash)` selects the latest active hash for a name; `revoke_implementation`; `set_current_implementations(CurrentImplementations)` selects the seven factory hashes (the four core contracts, Auction, Marketplace and ClaimMinter).
- `approve_upgrade(from, to)`: both hashes share the registered name; target must be active; a revoked source can migrate away.
- `get_implementation`, `get_latest_implementation` (`None` once that hash is revoked), `is_upgrade_approved`, `get_implementation_version`.
- `pause_factory` / `unpause_factory` (blocks `create_dao`, `create_module` and `launch_dao`).
- `propose_admin`, `accept_admin`, `cancel_pending_admin`, `get_admin`, `get_pending_admin`.
- `upgrade_manager(from_hash, to_hash)` requires admin, matching source, and an approved, active Manager destination.

Ledger-number fields in events end in `_ledger` (`published_ledger`, `approved_ledger`, `revoked_ledger`, ...). Errors: block 7100.

## Source and tests

[Contract](src/contract.rs), [structs/storage](src/storage.rs), [events](src/events.rs), [errors](src/error.rs). `cargo test -p manager`. [Deployment](../../docs/MANAGER_DEPLOYMENT.md) and [security](../../docs/SECURITY_MODEL.md).

## Upgrade notice

`upgrade_manager(from, to)` requires an `approve_upgrade(from, to)` record at least `upgrade_delay()` ledgers old
(constructor argument `upgrade_delay`; `UpgradeDelayNotElapsed`, 7130, before that). Re-approving keeps the first
approval's ledger. `set_upgrade_delay(ledgers)` (admin) lengthens the notice at once; a reduction takes effect only
after the notice in force has passed; either emits `UpgradeDelayChanged` (`from_ledgers`, `to_ledgers`,
`effective_ledger`). `upgrade_approved_ledger(from, to)` and `current_implementations()` are
read-only views for the platform renewal and upgrade scripts. `upgrade_manager` also requires `to` to be the
hash announced as latest for `Manager` (`latest_pointer(name)`: hash and announcement ledger; `UpgradeNotLatest`,
7131), and the notice counts from the later of the approval and the announcement (D42). Re-announcing the same
hash keeps its ledger.
