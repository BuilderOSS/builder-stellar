# Upgrade fixtures

Released module code, byte for byte, used by the e2e upgrade tests to upgrade *from* what is
actually deployed rather than from a local rebuild.

| File | Module | Version | WASM hash (sha256) | Source |
|---|---|---|---|---|
| `token-0.1.0.wasm` | token | 0.1.0 | `3e44c30029436c92b2ee8a8c1c896a211e376eec217d841e29f9523acf9b9311` | testnet, Builder DAO token |

Refresh (read-only):

```sh
stellar contract fetch --wasm-hash <hash> --network testnet --out-file contracts/e2e/fixtures/<module>-<version>.wasm
shasum -a 256 contracts/e2e/fixtures/<module>-<version>.wasm   # must equal <hash>
```
