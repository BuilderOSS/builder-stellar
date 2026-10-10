# @builder-stellar/manager-bindings

TypeScript bindings for the Builder Stellar **Manager** contract: the DAO factory
and implementation registry. The Manager deploys the six DAO modules (token,
metadata, auction, governor, treasury, marketplace), hands them off at launch,
keeps the WASM implementation registry, and holds the slug registry.

> `src/client.ts` and `src/types.ts` are generated from `manager.wasm`. Do not
> edit them by hand. This README is hand-written and is preserved when the
> bindings are regenerated.

## Build

```bash
pnpm --filter @builder-stellar/manager-bindings build   # tsc -> dist/
```

## Usage

```typescript
import { Client } from '@builder-stellar/manager-bindings';

const manager = new Client({
  contractId: 'C...', // Manager contract id
  rpcUrl: 'https://soroban-testnet.stellar.org:443',
  networkPassphrase: 'Test SDF Network ; September 2015',
  publicKey: deployer // required to sign state-changing calls
});

// Predict module addresses before submitting
const predicted = await manager.predict_addresses({ creator: deployer, nonce: 1n });

// Create a DAO (requires auth from deployer and launch_admin)
const tx = await manager.create_dao({
  params: {
    deployer,
    nonce: 1n,
    launch_admin: deployer,
    initial_config: {
      /* token_name, token_symbol, ..., slug, governance, auction, marketplace */
    }
  }
});

// Resolve a DAO by slug (read-only)
const { result } = await manager.get_dao_by_slug({ slug: 'my-dao' });
```

## Main entrypoints

| Area                | Methods                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| DAO factory         | `create_dao`, `launch_dao`, `get_pending_dao`, `predict_addresses`, `pause_factory`, `unpause_factory`                    |
| Slug registry       | `get_dao_by_slug`, `get_slug`, `bump_slug_ttl`                                                                            |
| Implementations     | `register_implementation`, `revoke_implementation`, `set_current_implementations`, `get_implementation`, `get_latest_implementation` |
| Upgrades            | `approve_upgrade`, `is_upgrade_approved`, `upgrade_manager`                                                               |
| Admin / platform    | `propose_admin`, `accept_admin`, `cancel_pending_admin`, `get_admin`, `set_platform_minter`, `get_platform_minter`        |

## Slugs

Each DAO claims a unique, permanent slug in `create_dao` (`initial_config.slug`):
4-63 characters of `[a-z0-9-]`, no leading, trailing or doubled hyphen
(`InvalidSlug`); first come, first served. A taken slug fails with `SlugTaken`. The slug is
also emitted in the `DaoCreated` event, which the indexer exposes as
`manager.daos.slug`.

Slug storage is persistent and expires if untouched. `bump_slug_ttl(slug)` is
permissionless, so DAO operators or the platform admin can call it periodically
(the network caps each extension at roughly 180 days). `get_dao_by_slug` does not
extend the TTL.

## Errors

`ManagerError` is exported from `src/types.ts`; the numeric codes map to
contract errors, for example `1119` is `SlugTaken` and `1201` is `DaoNotFound`.

## Events

`DaoCreated`, `DaoLaunched`, `AdminChanged`, `ImplementationRegistered`, and the
other Manager events are typed as `ContractEvent` in `src/types.ts`. They are
decoded by the Goldsky pipeline in `packages/goldsky`; keep its event field maps
aligned with the contract (`packages/goldsky/test/contract-alignment.test.mjs`).

## Regenerating

From the repo root:

```bash
pnpm contracts:bindings
```

This builds the contracts and regenerates every `*-bindings` package, then
restores each package's `README.md`.
