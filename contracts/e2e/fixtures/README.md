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
