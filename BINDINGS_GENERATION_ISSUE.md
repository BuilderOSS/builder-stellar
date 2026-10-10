# Bindings generation (resolved)

Status: resolved. Kept as a short runbook.

This is the canonical authored regeneration reference. The SDK's `--overwrite`
replaces generic package documentation, but the current repository wrapper saves
each existing package README and restores it after generation. Keep authored
READMEs current; invoking the SDK directly bypasses this preservation step.

## Regenerating the TypeScript bindings

```bash
pnpm contracts:bindings        # stellar contract build + generate all 7 packages + pnpm install
pnpm --filter @builder-stellar/<name>-bindings build   # auction|governor|manager|marketplace|metadata|token|treasury
```

`pnpm contracts:build` (alias for `stellar contract build`) builds the WASMs only.

The seven clients cover six DAO modules plus Manager. The shared Minter has no
generated package in this script. `src/index.ts` exports `Client`, implemented in
`src/client.ts`; structs/errors/events are in `src/types.ts`. Consumers import
`@builder-stellar/<name>-bindings` from the pnpm workspace after its build.

The web's Minter client is loaded dynamically from the deployed spec and checks
method/error ABI shapes; it is not an eighth generated binding package.

Use the same deployable WASM/toolchain for deployment and generation. Successful
generation alone does not prove that a deployed contract has that ABI. Client
calls assemble/simulate transactions; mutations need a signing wallet and
`signAndSend`, then explicit confirmation. `result` from simulation is not a
receipt. Large integers use `bigint`; binary hashes use byte arrays, not lossy
JavaScript numbers or guessed argument types.

The web predev/prebuild hooks build all seven clients. Proposal arguments are
encoded by target ABI in
[`proposal-supported-calls.ts`](apps/web/src/lib/proposal-supported-calls.ts);
unsupported calls are not submitted. Token `batch_mint` uses recipient/amount
vectors. Governor's generated `execute` remains present for compatibility but
always rejects; use Treasury's four-argument vector execution method.

See [contract references](docs/README.md) and [web behavior](apps/web/README.md).

## Root cause of the old compile errors

1. `stellar-sdk generate --overwrite` deletes each package's `node_modules`, which in a pnpm
   workspace holds only symlinks to `@stellar/stellar-sdk`, `buffer` and `typescript`. Without
   relinking, `tsc` reports `Cannot find module '@stellar/stellar-sdk'`, which makes `Client`
   resolve to an incomplete type and produces the cascading
   `Property 'spec' / 'txFromJson' does not exist on type 'Client'` errors. (Token only
   "worked" because its links had not been wiped at that moment.) Fix: the generator now runs
   `pnpm install` after generating.
2. The old `contracts:build` used `SOROBAN_SDK_BUILD_SYSTEM_SUPPORTS_SPEC_SHAKING_V2=0`, which
   embeds every unused library type (OpenZeppelin RWA/Governor/etc.) in the contract spec. That
   produced duplicate type names (`ComplianceError`, `Point`), which needed hand-patches, and a
   spec that differs from the deployable WASM. The generator and `contracts:build` now use
   `stellar contract build` (spec shaking v2), which is the deployable artifact; the generated
   types now contain only each contract's own interface and the token/treasury patches were
   removed. The only remaining post-processing is exporting the `ManagerError` type alias.
