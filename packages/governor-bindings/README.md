# @builder-stellar/governor-bindings

TypeScript bindings for the Tribe Builder **Governor** contract (crate
`governor`): proposals, checkpoint-weighted votes, quorum, and queueing; the
DAO's Treasury executes passed proposals. See the
[contract README](../../contracts/governor/README.md).

> `src/client.ts` and `src/types.ts` are generated from `governor.wasm`. Do not
> edit them by hand. This README is hand-written and is preserved when the
> bindings are regenerated.

## Install and build

This is a pnpm workspace package. A workspace app depends on it as
`"@builder-stellar/governor-bindings": "workspace:*"`, as `apps/web` does, and
`pnpm install` from the repository root links it. Build it before use:

```bash
pnpm --filter @builder-stellar/governor-bindings build   # tsc -> dist/
```

`pnpm --dir apps/web codegen`, which runs before the web app's `dev` and
`build`, builds every bindings package.

## Usage

```typescript
import { Client } from '@builder-stellar/governor-bindings';

const governor = new Client({
  contractId: 'C...', // Governor contract id
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015'
  // add publicKey and signTransaction to sign state-changing calls
});

// Proposals ever created (read-only)
const { result } = await governor.proposal_count();
```

Structs, enums, and events (`ContractEvent`) are exported from `src/types.ts`,
with `CustomGovernorError` (block 7500), OpenZeppelin's `GovernorError` (5000s),
and `CommonError` (7001-7013). Every project contract owns a block of 100 codes
in 7000-7899, so a code identifies its crate.

## Regenerating

From the repository root:

```bash
pnpm contracts:bindings
```

This builds the contracts, regenerates every `*-bindings` package, and then
restores each package's `README.md`. See
[bindings generation](../../docs/BINDINGS_GENERATION.md).
