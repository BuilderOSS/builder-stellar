# common

Library-only crate shared by the DAO module contracts and the Manager. It exports no `#[contract]` in normal builds.

| Module | Purpose |
| --- | --- |
| `admin` | The single admin model: `init`, `admin`, `require_admin`, `handoff`. The admin is the launch admin during setup and the Treasury after `launch`; `handoff` emits `AdminChanged { old_admin, new_admin }`. There is no transfer, two-step handover or renounce. |
| `lifecycle` | The `Live` instance flag: `is_live`, `require_live` (`NotLive`), `require_setup`, `mark_live` (`AlreadyLive` on a second call). |
| `upgrade` | `init` records `CurrentHash`, `CurrentVersion` and `StorageVersion`. `apply` checks the current hash and Manager approval, stores the registry version, emits `Upgraded` and swaps the WASM. `sync_version` emits `VersionSynced`. `migrate(code_storage_version)` advances `StorageVersion` (`NothingToMigrate` unless older) and emits `Migrated`. |
| `ttl` | Shared TTL policy: `extend_instance` (to 170 days below 60), `extend_persistent` (to the network cap below 30 days), `extend_persistent_for` (explicit values). See [TTL maintenance](../../docs/TTL_ECONOMICS.md). |
| `clients` | Typed `#[contractclient]` traits for cross-contract calls (no linked exports). |
| `error` | `CommonError` (7001-7013) and `error::codes`, the error-code block of every crate. |

The crate root also holds the parameter bounds the Manager and each module validate against: governance timing (300 s ..= 30 days), auction duration and time buffer, `MIN_RESERVE_PRICE`, `BPS_DENOMINATOR`, `MAX_FEE_BPS` (2,500 = 25%), `MAX_STRING_LENGTH` (256) and the `batch_mint` event budget: `batch_mint_fits(tokens, recipients)` checks `BATCH_MINT_BYTES_PER_TOKEN` (300) × tokens + `BATCH_MINT_BYTES_PER_RECIPIENT` (450) × recipients ≤ `BATCH_MINT_EVENT_BUDGET` (13,500), about 85% of the 16 KiB per-transaction event limit; `MAX_BATCH_MINT` (43, one recipient) and `MAX_BATCH_RECIPIENTS` (18, one token each) are derived from it.

## Migrations

Each module declares `STORAGE_VERSION` (1 today) and records it at construction. A release that changes a storage layout bumps the constant and performs its data rewrite in the module's admin-gated `migrate`, after calling `upgrade::migrate`. A governance upgrade proposal runs `upgrade` then `migrate`.

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

`testutils` exports `MockManager`, a `#[contract]`, plus TTL helpers. Enable it ONLY through `[dev-dependencies]`:

```toml
[dev-dependencies]
common = { path = "../common", features = ["testutils"] }
```

Never enable it in `[dependencies]`, or the mock contract's exports end up in a deployable WASM.

## `testdata/empty.wasm`

A minimal valid Soroban module: the 8-byte wasm header (`\0asm\1\0\0\0`) followed by a single custom section `contractenvmetav0` copied byte-for-byte from a built contract. `upload_contract_wasm` in the test host rejects modules without that section. To regenerate after an SDK bump, extract the `contractenvmetav0` custom section from `target/wasm32v1-none/release/treasury.wasm` and write header + `0x00` + `<section length>` + section payload.
