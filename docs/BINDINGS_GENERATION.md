# Bindings generation

This is the canonical reference for regenerating the TypeScript bindings. The SDK's
`--overwrite` replaces each package's README with generic text, but the repository wrapper
(`scripts/generate-bindings.mjs`) saves each existing package README and restores it after
generation. Keep the authored READMEs current. Running the SDK directly skips this step.

## Regenerating the TypeScript bindings

```bash
pnpm contracts:bindings        # stellar contract build + generate all 8 packages + pnpm install
pnpm --filter @builder-stellar/<name>-bindings build   # auction|claim-minter|governor|manager|marketplace|metadata|token|treasury
```

`pnpm contracts:build` (alias for `stellar contract build --locked`) builds the WASMs only.

The eight clients cover the seven DAO contracts (Token, Metadata, Governor, Treasury, Auction,
Marketplace, and ClaimMinter) plus Manager. The ClaimMinter package is
`@builder-stellar/claim-minter-bindings`, generated from `minter.wasm` (crate `minter`, registry
kind `claims`). There is no shared platform Minter. `src/index.ts` exports `Client`, implemented
in `src/client.ts`; structs, errors, and events are in `src/types.ts`. Consumers import
`@builder-stellar/<name>-bindings` from the pnpm workspace after its build.

Use the same deployable WASM and toolchain for deployment and generation. Successful
generation alone does not prove that a deployed contract has that ABI. Client
calls assemble and simulate transactions; mutations need a signing wallet and
`signAndSend`, then explicit confirmation. `result` from simulation is not a
receipt. Large integers use `bigint`; binary hashes use byte arrays, not lossy
JavaScript numbers or guessed argument types.

The web predev and prebuild hooks build all eight clients (`bindings:build` in
`apps/web/package.json`). Proposal arguments are encoded by target ABI in
[`proposal-supported-calls.ts`](../apps/web/src/lib/proposal-supported-calls.ts);
unsupported calls are not submitted. Token `batch_mint` uses recipient and amount
vectors, and each call must fit the event budget (`300 × tokens + 450 × recipients
≤ 13,500`: 43 tokens to one recipient, or 18 recipients with one token each).
Every DAO contract exposes `admin()` (no `owner()` or `get_owner()`), `migrate()`, and
`storage_version()`. Marketplace `list` takes `max_fee_bps` and `payment_asset`;
`buy` and `buy_from_pool` take `max_price`. Governor's generated `execute` remains present for
compatibility but always rejects (`UseTreasuryExecute`); use Treasury's four-argument vector
execution method.

See [contract references](README.md) and [web behaviour](../apps/web/README.md).

## Root cause of the old compile errors

1. `stellar-sdk generate --overwrite` deletes each package's `node_modules`, which in a pnpm
   workspace holds only symlinks to `@stellar/stellar-sdk`, `buffer`, and `typescript`. Without
   relinking, `tsc` reports `Cannot find module '@stellar/stellar-sdk'`, which makes `Client`
   resolve to an incomplete type and produces the cascading
   `Property 'spec' / 'txFromJson' does not exist on type 'Client'` errors. (Token only
   "worked" because its links had not been wiped at that moment.) Fix: the generator now runs
   `pnpm install` after generating.
2. The old `contracts:build` used `SOROBAN_SDK_BUILD_SYSTEM_SUPPORTS_SPEC_SHAKING_V2=0`, which
   embeds every unused library type (OpenZeppelin RWA, Governor, and others) in the contract spec.
   That produced duplicate type names (`ComplianceError`, `Point`), which needed hand-patches, and
   a spec that differs from the deployable WASM. The generator and `contracts:build` now use
   `stellar contract build` (spec shaking v2), which is the deployable artifact; the generated
   types contain only each contract's own interface, and the Token and Treasury patches were
   removed. The only remaining post-processing is exporting the `ManagerError` type alias.
