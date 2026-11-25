# @builder-stellar/claim-minter-bindings

TypeScript bindings for the Tribe Builder **ClaimMinter** contract (crate
`minter`): the per-DAO claims module (registry kind `claims`), with Merkle claim
lists, free or priced, and assurance launch drives. See the
[contract README](../../contracts/minter/README.md).

> `src/client.ts` and `src/types.ts` are generated from `minter.wasm`. Do not
> edit them by hand. This README is hand-written and is preserved when the
> bindings are regenerated.

## Install and build

This is a pnpm workspace package. A workspace app depends on it as
`"@builder-stellar/claim-minter-bindings": "workspace:*"`, as `apps/web` does,
and `pnpm install` from the repository root links it. Build it before use:

```bash
pnpm --filter @builder-stellar/claim-minter-bindings build   # tsc -> dist/
```

`pnpm --dir apps/web codegen`, which runs before the web app's `dev` and
`build`, builds every bindings package.

## Usage

```typescript
import { Client } from '@builder-stellar/claim-minter-bindings';

const claims = new Client({
  contractId: 'C...', // ClaimMinter contract id
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015'
  // add publicKey and signTransaction to sign state-changing calls
});

// The id the next claim list receives (read-only)
const { result } = await claims.next_list_id();
```

Structs, enums, and events (`ContractEvent`) are exported from `src/types.ts`,
with `ClaimMinterError` (block 7800) and `CommonError` (7001-7013). Every
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
