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
| Slug registry       | `update_pending_slug`, `get_dao_by_slug`, `get_slug`, `bump_slug_ttl`                                                     |
| Implementations     | `register_implementation`, `set_latest_implementation`, `revoke_implementation`, `set_current_implementations`, `get_implementation`, `get_latest_implementation` |
| Upgrades            | `approve_upgrade`, `is_upgrade_approved`, `upgrade_manager`                                                               |
| Admin / platform    | `propose_admin`, `accept_admin`, `cancel_pending_admin`, `get_admin`, `set_platform_minter`, `get_platform_minter`        |

## Slugs

A DAO requests a slug in `create_dao` (`initial_config.slug`): 4-63 characters of
`[a-z0-9-]`, no leading, trailing or doubled hyphen (`InvalidSlug`). The request is
stored in `PendingDao` and is not unique; `launch_dao` claims it (unique, permanent,
event `SlugClaimed`) and fails with `SlugTaken` if another DAO launched with it
first. The launch admin renames a pending request with `update_pending_slug`.
`get_dao_by_slug` / `get_slug` resolve launched DAOs only; the indexer exposes
`manager.daos.slug`, `slug_claimed` and `manager.dao_slugs`.

Slug storage is persistent and expires if untouched. `bump_slug_ttl(slug)` is
permissionless, so DAO operators or the platform admin can call it periodically
(the network caps each extension at roughly 180 days). `get_dao_by_slug` does not
extend the TTL.

## Errors

`ManagerError` is exported from `src/types.ts`; Manager codes are 7101-7128 (for
example `7123` is `SlugTaken` and `7127` is `DaoNotFound`). Every project contract
owns a unique block of codes in 7000-7899, so a code identifies its contract.

## Events

`DaoCreated`, `DaoLaunched`, `SlugClaimed`, `PendingSlugUpdated`,
`LatestImplementationSet`, `AdminChanged`, `ImplementationRegistered`, and the
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
