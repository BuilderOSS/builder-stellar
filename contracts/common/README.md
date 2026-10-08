# common

Library-only crate shared by the DAO module contracts (`lifecycle`, `upgrade`,
`ttl`, `error`). It exports no `#[contract]` in normal builds.

## `testutils` feature

`testutils` exports `MockManager`, a `#[contract]`. Enable it ONLY through
`[dev-dependencies]`:

```toml
[dev-dependencies]
common = { path = "../common", features = ["testutils"] }
```

Never enable it in `[dependencies]`, or the mock contract's exports end up in
a deployable WASM.

## `testdata/empty.wasm`

A minimal valid Soroban module: the 8-byte wasm header
(`\0asm\1\0\0\0`) followed by a single custom section `contractenvmetav0`
copied byte-for-byte from a built contract (any contract built by this
workspace with `stellar contract build`; the env-meta section is identical
across them for a given soroban-sdk version). `upload_contract_wasm` in the
test host rejects modules without that section ("contract missing metadata
section"). To regenerate after an SDK bump, extract the `contractenvmetav0`
custom section (section id 0, name `contractenvmetav0`) from
`target/wasm32v1-none/release/treasury.wasm` and write
header + `0x00` + `<section length>` + section payload.

## Error codes are unique per contract only

Each contract defines its own `#[contracterror]` enum, and existing codes are
never renumbered. A numeric code is therefore only meaningful together with the
contract that raised it: consumers (indexer, frontend, docs) must key on
`(contract id, code)`, never on the code alone. Only `CommonError` (9001+) is
globally distinct.

Known overlaps between contract-local codes:

| Code | Contract A | Contract B |
|------|-----------|-----------|
| 3 | minter `InvalidTokenId` | metadata `NotInitialized` |
| 4 | minter `BatchTooLarge` | metadata `TreasuryMismatch` |
| 10 | minter `InvalidInput` | metadata `OnePropertyAndItemRequired` |
| 11 | minter `TokenContractError` | metadata `PropertyHasNoItems` |
| 13 | minter `TokenNotLive` | metadata `InvalidPropertySelected` |
| 1103 | token `MintAuthorityNotAllowed` | manager `InvalidParamBounds` |
| 1105 | token `TreasuryMismatch` | manager `InvalidQuorumBps` |
| 1201 | auction `InvalidTokenId` | manager `DaoNotFound` |

Library errors from the OpenZeppelin Stellar crates (governor, ownable, NFT,
pausable) use their own ranges and can also coincide with contract codes.
