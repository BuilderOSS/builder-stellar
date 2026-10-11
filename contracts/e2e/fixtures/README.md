# Upgrade fixtures

Released module code, byte for byte, used by the e2e upgrade tests to upgrade *from* what is
actually deployed rather than from a local rebuild.

| File | Module | Version | WASM hash (sha256) | Source |
|---|---|---|---|---|
| `token-0.1.0.wasm` | token | 0.1.0 | `3e44c30029436c92b2ee8a8c1c896a211e376eec217d841e29f9523acf9b9311` | testnet, Builder DAO token |
| `manager-0.1.0.wasm` | manager | 0.1.0 | `e5c3ec1f67e587446e6883c20a3e1b55a8e73c6119c35bf9d1cd4e8c7d22b402` | testnet Manager `CDFQIOSA…PD5W` |

Refresh (read-only):

```sh
stellar contract fetch --wasm-hash <hash> --network testnet --out-file contracts/e2e/fixtures/<module>-<version>.wasm
shasum -a 256 contracts/e2e/fixtures/<module>-<version>.wasm   # must equal <hash>
```
