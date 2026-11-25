# @builder-stellar/marketplace-bindings

TypeScript bindings for the Tribe Builder **Marketplace** contract (crate
`marketplace`): quick-buy pools of new tokens and secondary sales of existing
ones. See the [contract README](../../contracts/marketplace/README.md).

> `src/client.ts` and `src/types.ts` are generated from `marketplace.wasm`. Do
> not edit them by hand. This README is hand-written and is preserved when the
> bindings are regenerated.

## Install and build

This is a pnpm workspace package. A workspace app depends on it as
`"@builder-stellar/marketplace-bindings": "workspace:*"`, as `apps/web` does,
and `pnpm install` from the repository root links it. Build it before use:

```bash
pnpm --filter @builder-stellar/marketplace-bindings build   # tsc -> dist/
```

`pnpm --dir apps/web codegen`, which runs before the web app's `dev` and
`build`, builds every bindings package.

## Usage

```typescript
import { Client } from '@builder-stellar/marketplace-bindings';

const marketplace = new Client({
  contractId: 'C...', // Marketplace contract id
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015'
  // add publicKey and signTransaction to sign state-changing calls
});

// Wiring, payment asset, default fee, and pause state (read-only)
const { result } = await marketplace.get_config();
```

Structs, enums, and events (`ContractEvent`) are exported from `src/types.ts`,
with `MarketplaceError` (block 7700) and `CommonError` (7001-7013). Every
project contract owns a block of 100 codes in 7000-7899, so a code identifies
its crate.

## Regenerating

From the repository root:

```bash
pnpm contracts:bindings
```

This builds the contracts, regenerates every `*-bindings` package, and then
restores each package's `README.md`. See
[bindings generation](../../docs/BINDINGS_GENERATION.md).
