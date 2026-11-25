# @builder-stellar/treasury-bindings

TypeScript bindings for the Tribe Builder **Treasury** contract (crate
`treasury`): it holds the DAO's assets, executes queued proposals, and is the
admin of every DAO contract after launch. See the
[contract README](../../contracts/treasury/README.md).

> `src/client.ts` and `src/types.ts` are generated from `treasury.wasm`. Do not
> edit them by hand. This README is hand-written and is preserved when the
> bindings are regenerated.

## Install and build

This is a pnpm workspace package. A workspace app depends on it as
`"@builder-stellar/treasury-bindings": "workspace:*"`, as `apps/web` does, and
`pnpm install` from the repository root links it. Build it before use:

```bash
pnpm --filter @builder-stellar/treasury-bindings build   # tsc -> dist/
```

`pnpm --dir apps/web codegen`, which runs before the web app's `dev` and
`build`, builds every bindings package.

## Usage

```typescript
import { Client } from '@builder-stellar/treasury-bindings';

const treasury = new Client({
  contractId: 'C...', // Treasury contract id
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015'
  // add publicKey and signTransaction to sign state-changing calls
});

// The Governor whose proposals it executes (read-only)
const { result } = await treasury.governor();
```

Structs, enums, and events (`ContractEvent`) are exported from `src/types.ts`,
with `TreasuryError` (block 7600) and `CommonError` (7001-7013). Every project
contract owns a block of 100 codes in 7000-7899, so a code identifies its crate.

## Regenerating

From the repository root:

```bash
pnpm contracts:bindings
```

This builds the contracts, regenerates every `*-bindings` package, and then
restores each package's `README.md`. See
[bindings generation](../../docs/BINDINGS_GENERATION.md).
