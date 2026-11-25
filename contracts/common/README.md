# common

Library-only crate shared by the DAO module contracts and the Manager. It exports no `#[contract]` in normal builds.

| Module | Purpose |
| --- | --- |
| `admin` | The single admin model: `init`, `admin`, `require_admin`, `handoff`, and `handoff_once`. The admin is the launch admin during setup and the Treasury after `launch`; `handoff` emits `AdminChanged { old_admin, new_admin }`, and `handoff_once` moves nothing when the Treasury is already the admin (an assurance drive hands off before `launch`). There is no transfer, two-step handover, or renounce. |
| `lifecycle` | The `Live` instance flag: `is_live`, `require_live` (`NotLive`), `require_setup`, and `mark_live` (`AlreadyLive` on a second call). |
| `upgrade` | `init` records `CurrentHash` and `StorageVersion`. `version(manager)` looks `CurrentHash` up in the Manager registry on every read; nothing is stored or synced. `apply` checks the current hash and Manager approval, emits `Upgraded` with the registry version, and swaps the WASM. `migrate(code_storage_version)` advances `StorageVersion` (`NothingToMigrate` unless older) and emits `Migrated`. `is_current_layout` backs the storage-layout gate (see [Migrations](#migrations)). The Manager's upgrade notice is here too (`delay`, `set_delay`, and `notice_passed`): a longer notice applies at once, a shorter one only after the notice in force has passed (`UpgradeDelayChanged`). |
| `ttl` | Shared TTL policy: `extend_instance` (the instance to 170 days below 60, and the contract code to 4 days below 2), `extend_persistent` (to the network cap below 30 days), and `extend_persistent_for` (explicit values). See [TTL maintenance](../../docs/TTL_ECONOMICS.md). |
| `modules` | The Token's module registry types (`ModuleEntry`, `MintGrant`, `TokenSettings`, `AssuranceTerms`, `AssuranceState`, and `RenewalPage`), the built-in kinds (`auction`, `marketplace`, `claims`, `circle`, and `custom_<name>`), and `MAX_MODULES` (16). |
| `clients` | Typed `#[contractclient]` traits for cross-contract calls (no linked exports). |
| `error` | `CommonError` (7001-7013) and `error::codes`, the error-code block of every crate. |

The crate root also holds the parameter bounds the Manager and each module validate against: governance timing (300 s ..= 30 days), auction duration and time buffer, `MIN_RESERVE_PRICE`, `BPS_DENOMINATOR`, `MAX_FEE_BPS` (2,500 = 25%), `MAX_STRING_LENGTH` (256), and the `batch_mint` event budget: `batch_mint_fits(tokens, recipients)` checks `BATCH_MINT_BYTES_PER_TOKEN` (300) × tokens + `BATCH_MINT_BYTES_PER_RECIPIENT` (450) × recipients ≤ `BATCH_MINT_EVENT_BUDGET` (13,500), about 82% of the 16 KiB per-transaction event limit; `MAX_BATCH_MINT` (43, one recipient) and `MAX_BATCH_RECIPIENTS` (18, one token each) are derived from it.

A proposal runs all its actions in one `treasury.execute`, under the same event limit. `EXECUTION_EVENT_BUDGET` (15,500) bounds that whole execution: the Governor's `propose` estimates it with `execution_event_bytes` and refuses a proposal above it.

`ns` wraps every storage key the protocol owns as `("builder", key)`, so a module key cannot address the same slot as an OpenZeppelin key with the same variant name.

## Migrations

Each module declares `STORAGE_VERSION` (1 today) and records it at construction. A release that changes a storage layout bumps the constant and performs its data rewrite in the module's `migrate`, after calling `upgrade::migrate`. `migrate` is admin-gated in every module except the Governor and the Treasury, where anyone may call it. A governance upgrade proposal runs `upgrade` then `migrate` as consecutive actions. The Treasury is the exception: it runs a proposal on the code it started with, so its `migrate` is a separate call after the upgrade proposal has executed.

The Governor and the Treasury check `is_current_layout` and refuse with their own `StorageVersionMismatch` while the stored layout differs from the code's. `upgrade`, `migrate`, and the views stay outside that gate, and a recovery proposal (only `upgrade` and `migrate` calls on the Governor or its Treasury) still runs, so a release whose migration fails can be replaced by fixed code.

## Error codes

Every project error code is unique across contracts. `error::codes` assigns each crate a block of 100 in 7000-7899, outside every OpenZeppelin range:

| Block | Crate |
| --- | --- |
| 7000 | common |
| 7100 | manager |
| 7200 | token |
| 7300 | metadata |
| 7400 | auction |
| 7500 | governor (custom errors; OpenZeppelin governor errors keep 5000s) |
| 7600 | treasury |
| 7700 | marketplace |
| 7800 | minter |

Each crate numbers from `block + 1`. A `common` unit test and the e2e test `error_codes_are_unique_per_crate_block` enforce the blocks.

Run `cargo test -p common` from the repository root.

## `testutils` feature

`testutils` exports `MockManager`, a `#[contract]`, plus test helpers (TTL and ledger helpers, `empty_wasm`, and storage-key shape checks). Enable it only through `[dev-dependencies]`:

```toml
[dev-dependencies]
common = { path = "../common", features = ["testutils"] }
```

Never enable it in `[dependencies]`, or the mock contract's exports end up in a deployable WASM.

## `testdata/empty.wasm`

A minimal valid Soroban module: the 8-byte wasm header (`\0asm\1\0\0\0`) followed by a single custom section `contractenvmetav0` copied byte-for-byte from a built contract. `upload_contract_wasm` in the test host rejects modules without that section. To regenerate after an SDK bump, extract the `contractenvmetav0` custom section from `target/wasm32v1-none/release/treasury.wasm` and write header + `0x00` + `<section length>` + section payload.
