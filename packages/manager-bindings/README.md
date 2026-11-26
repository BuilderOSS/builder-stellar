# @builder-stellar/manager-bindings

TypeScript bindings for the Tribe Builder **Manager** contract (crate
`manager`): the DAO factory and implementation registry. The Manager deploys
each DAO's core contracts (token, metadata, governor, treasury) and its modules
(auction, marketplace, claims), runs the assurance launch, hands them off at
launch, keeps the WASM implementation registry, approves vote sources, and holds
the slug registry. See the [contract README](../../contracts/manager/README.md).

> `src/client.ts` and `src/types.ts` are generated from `manager.wasm`. Do not
> edit them by hand. This README is hand-written and is preserved when the
> bindings are regenerated.

## Install and build

This is a pnpm workspace package. A workspace app depends on it as
`"@builder-stellar/manager-bindings": "workspace:*"`, as `apps/web` does, and
`pnpm install` from the repository root links it. Build it before use:

```bash
pnpm --filter @builder-stellar/manager-bindings build   # tsc -> dist/
```

`pnpm --dir apps/web codegen`, which runs before the web app's `dev` and
`build`, builds every bindings package.

## Usage

```typescript
import { Client } from '@builder-stellar/manager-bindings';

const manager = new Client({
  contractId: 'C...', // Manager contract id
  rpcUrl: 'https://soroban-testnet.stellar.org',
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
      /* token_name, token_symbol, profile, renderer_base, slug, governance,
         modules, token_settings, transfer_agents */
    }
  }
});

// Resolve a DAO by slug (read-only)
const { result } = await manager.get_dao_by_slug({ slug: 'my-dao' });
```

## Main entrypoints

| Area                | Methods                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| DAO factory         | `create_dao`, `create_module`, `module_count`, `predict_module_address`, `launch_dao`, `get_pending_dao`, `predict_addresses`, `pause_factory`, `unpause_factory` |
| Assurance launch    | `open_assurance`, `launch_when_ready`, `get_assurance`, `release_slug`, `recover_claims`                                  |
| Slug registry       | `update_pending_slug`, `change_slug`, `get_dao_by_slug`, `get_slug`                                                       |
| Implementations     | `register_implementation`, `set_latest_implementation`, `revoke_implementation`, `set_current_implementations`, `current_implementations`, `get_implementation`, `get_implementation_version`, `get_latest_implementation`, `latest_pointer` |
| Upgrades            | `approve_upgrade`, `is_upgrade_approved`, `upgrade_approved_ledger`, `upgrade_manager`                                    |
| Vote sources        | `approve_vote_source`, `is_vote_source_approved`                                                                          |
| Admin / platform    | `propose_admin`, `accept_admin`, `cancel_pending_admin`, `get_admin`, `get_pending_admin`, `set_upgrade_delay`, `upgrade_delay`, `version`, `wasm_hash` |

## Slugs

A DAO requests a slug in `create_dao` (`initial_config.slug`): 4-63 characters of
`[a-z0-9-]`, with no leading, trailing, or doubled hyphen (`InvalidSlug`). The
request is stored in `PendingDao` and is not unique; `launch_dao` claims it
(unique while held, event `SlugClaimed`) and fails with `SlugTaken` if another
DAO launched with it first. The launch admin renames a pending request with
`update_pending_slug`. An assurance drive reserves the slug when it opens
(`open_assurance`, `SlugClaimed`), and `release_slug` frees it after a failed
drive (`SlugReleased`). A launched DAO moves to a new slug only by proposal
(`change_slug`, `SlugChanged`), which releases the old one at once.
`get_dao_by_slug` / `get_slug` resolve launched DAOs and DAOs whose drive
reserved a slug; the indexer exposes them in `manager.daos` (`slug`,
`slug_claimed`, `requested_slug`, and `claimed_slug`).

Slug storage is persistent and expires if untouched. The DAO's storage sweep
renews the slug entries with the rest of its storage (no contract call). Neither
read extends the TTL.

## Errors

`ManagerError` is exported from `src/types.ts`; Manager codes are in block 7100
(7101-7146; for example `7123` is `SlugTaken` and `7127` is `DaoNotFound`).
`CommonError` (7001-7013) is exported too. Every project contract owns a block
of 100 codes in 7000-7899, so a code identifies its crate.

## Events

`DaoCreated`, `DaoLaunched`, `SlugClaimed`, `PendingSlugUpdated`,
`LatestImplementationSet`, `AdminChanged`, `ImplementationRegistered`, and the
other Manager events are typed as `ContractEvent` in `src/types.ts`. They are
decoded by the Goldsky pipeline in `packages/goldsky`; keep its event field maps
aligned with the contract (`packages/goldsky/test/contract-alignment.test.mjs`).

## Regenerating

From the repository root:

```bash
pnpm contracts:bindings
```

This builds the contracts, regenerates every `*-bindings` package, and then
restores each package's `README.md`. See
[bindings generation](../../docs/BINDINGS_GENERATION.md).
