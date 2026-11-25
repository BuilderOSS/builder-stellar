# Upgrade fixtures

Released module code, byte for byte, for e2e tests that upgrade *from* what is actually deployed
rather than from a local rebuild.

The 0.1.0 fixtures were removed with the storage-diet release (`docs/STORAGE_DIET.md`), which ships
as one fresh testnet redeploy: the old token and Manager no longer match the current launch
interface, and no deployed DAO will run them. After the redeploy, capture the new deployed code here
when the first in-place upgrade is planned:

```sh
stellar contract fetch --wasm-hash <hash> --network testnet --out-file contracts/e2e/fixtures/<module>-<version>.wasm
shasum -a 256 contracts/e2e/fixtures/<module>-<version>.wasm   # must equal <hash>
```

Record each file here with its module, version, hash and source, as the previous table did.

## Production (tribes.build), release 0.5.0

Fetched from testnet on 2026-11-21 for `src/release_0_5_0.rs`, which upgrades them in place the way
`docs/plans/release-main-1.md` does on the production Manager (`CCLBJAC5…EK72ZD`).

| File | Module | Version | Hash (sha256 = Soroban wasm hash) | Source |
| --- | --- | --- | --- | --- |
| `manager-0.4.0-f5b32ab1.wasm` | Manager | 0.4.0 | `f5b32ab19f0817a563606c9a88ab290da05871a8bf21e006fb408406659e69c1` | `deploys/builder-testnet-manager.json`, commit `c20c822` |
| `governor-0.4.0-41ad48e8.wasm` | Governor | 0.4.0 | `41ad48e8fdbe4a4229ce7821fd207c1c7d06033a24e6bfa09efeb74a02b054dd` | same |
| `metadata-0.4.0-44a0c4b6.wasm` | Metadata | 0.4.0 | `44a0c4b673638b70ce8d8e9554db7903c208d00047c5e732db015b9942e62efb` | same |

Token, Auction, Treasury, Marketplace and ClaimMinter need no fixture: production runs exactly this
checkout's build of them. `release_build_matches_production_and_dev` checks that hash by hash, together
with the three 0.5.0 hashes. Bytes depend on the compiler and the build platform, so that test is ignored by
default: run it with `--include-ignored` on a native build on macOS on Apple silicon with rustc 1.95.0 and
stellar-cli 28.0.0, the platform and toolchain release 0.5.0 was built with
([reproducible builds](../../../docs/REPRODUCIBLE_BUILDS.md#the-deployed-code-release-050)).

## Recovery releases (test-only, never deployed)

Built from `fix/governance-hardening` (the recovery-path change on top of `3b7130c`) for
`src/governance.rs`, which upgrades a live tribe to a release whose migration always fails and then
recovers by proposal. Each is this checkout's Governor or Treasury with `STORAGE_VERSION = 2`; the
"broken" ones also panic at the end of `migrate` (Treasury: `do_migrate`):

```rust
common::upgrade::migrate(e, STORAGE_VERSION);
panic!("recovery fixture: this migration always fails");
```

Build: apply the change above to `contracts/{governor,treasury}/src`, then
`stellar contract build --package <module> --out-dir <dir>`, and revert the change.

| File | Module | Storage version | `migrate` | Hash (sha256) |
| --- | --- | --- | --- | --- |
| `governor-recovery-broken.wasm` | Governor | 2 | always fails | `22984b7b6be498724fbf1959b65434628934e3c2f8178581512ddc98a8afe599` |
| `governor-recovery-fixed.wasm` | Governor | 2 | works | `0bdd3267bef65efcc3281953bb75e04d2a2396cece9d5ea078bd4ae3169406de` |
| `treasury-recovery-broken.wasm` | Treasury | 2 | always fails | `a2b9ca357bf8c1f63b62119eeac8bfedffa0c0630d5227b4f10d333fb01a7d0c` |
| `treasury-recovery-fixed.wasm` | Treasury | 2 | works | `afba127044fb89efb342b2e6b8c635d1d72bba5469f8fa1dad3e0c66e914dc22` |

Rebuild them when the recovery path or the layout gates change in either contract (`is_recovery`, and
the checks in `propose`, `cast_vote`, `queue`, `consume` and `execute`): the stuck module runs the fixture's
code, not this checkout's.
