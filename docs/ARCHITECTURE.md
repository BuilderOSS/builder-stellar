# Architecture

## Current System

The repository contains six Soroban contracts: five DAO modules and one Manager contract. Manager is the platform entry point. It combines three responsibilities that were previously described as separate contracts:

1. **Implementation registry**: registers WASM hashes, tracks versions, and revokes implementations.
2. **DAO factory**: deploys the five modules with deterministic salt-derived addresses and initializes them.
3. **DAO registry**: records DAO module addresses, creator, metadata, and supports bounded enumeration.

```text
Manager
├── implementation registry and upgrade approvals
├── DAO factory
└── DAO registry
    └── DAO: Token, Metadata, Auction, Governor, Treasury
```

## DAO Modules

### Token

The NFT governance token supports ownership and transfers, delegation with checkpointed voting power, bounded batch minting, minter authorization, and a Metadata mint hook.

### Metadata

Each DAO has a Metadata module with mutable settings, properties, and items. Governance can add properties/items and update descriptive settings. When a token is minted, Token calls `on_minted`; Metadata selects attributes from the current property/item data and stores the result.

### Auction

Auction provides continuous English-auction membership with reserve price, minimum bid increment, time buffer, configurable SAC payment asset, settlement, and Treasury proceeds.

### Governor

Governor creates and executes proposals using timestamp-based voting windows, historical voting power, quorum, proposal thresholds, and the normal pending/active/succeeded-or-defeated/queued/executed lifecycle.

### Treasury

Treasury holds DAO assets and executes arbitrary contract calls for the Governor. In production it owns the DAO modules, so module administration and upgrades are not controlled by an external launch administrator after setup.

## Creation and Authority Flow

1. Manager validates creation parameters and the current implementation hashes.
2. Manager derives deterministic salts and deploys Token, Metadata, Treasury, Governor, and Auction.
3. Manager initializes the modules and configures their cross-contract addresses.
4. Fixed founder token allocations are minted during creation. The total founder allocation is capped at 10,000 tokens.
5. Treasury becomes the production owner of the DAO modules; Governor controls Treasury execution.
6. Manager records the DAO registration and emits creation data.

## Upgrade Security

Module upgrades require all of the following:

- owner authorization on the module being upgraded;
- a Manager-approved `from_hash -> to_hash` transition; and
- the module's current WASM hash matching `from_hash`.

Manager also rejects unknown or revoked implementation hashes and can pause factory creation. This is a direct Soroban WASM upgrade model, not a proxy model.

## Application and Data Layers

The repository includes a Next.js frontend, Goldsky configuration, event decoders, and PostgreSQL migrations. These layers are useful for the current single-DAO workflow, but multi-DAO discovery, database identity, indexer backfill/partitioning, and frontend DAO routing are not complete. The historical and future-facing notes in the repository should not be read as shipped functionality.

## Testing

The current unit suite covers all six contract crates and has 153 passing Rust tests:

```bash
pnpm contracts:test:unit
```

End-to-end tests are separate and should be run with `pnpm contracts:test:e2e`.

## Future Work

- Complete multi-DAO database schema and identity model.
- Complete multi-DAO Goldsky ingestion, discovery, and backfill.
- Add frontend DAO directory and DAO-scoped routes.
- Add production deployment automation for Manager-created DAOs.
