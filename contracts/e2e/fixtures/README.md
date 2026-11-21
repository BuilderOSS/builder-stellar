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
checkout's build of them, which `fixtures_are_production_code_and_the_other_five_modules_are_unchanged`
checks hash by hash.

