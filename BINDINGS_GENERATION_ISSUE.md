# Bindings generation (resolved)

Status: resolved. Kept as a short runbook.

## Regenerating the TypeScript bindings

```bash
pnpm contracts:bindings        # stellar contract build + generate all 7 packages + pnpm install
pnpm --filter @builder-stellar/<name>-bindings build   # auction|governor|manager|marketplace|metadata|token|treasury
```

`pnpm contracts:build` (alias for `stellar contract build`) builds the WASMs only.

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
