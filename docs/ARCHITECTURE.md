# Architecture

## Versioned Redesign

The next baseline contains seven Soroban contracts: six DAO modules and one Manager deployment module. Every Manager and DAO module starts at semantic version `0.1.0`.

1. **Implementation registry**: registers WASM hashes, tracks versions, approves transitions, and revokes implementations.
2. **DAO factory**: deploys six modules with deterministic salt-derived addresses and initializes them.
3. **Upgrade gate**: validates active, Manager-approved module transitions. Manager does not execute DAO upgrades.

```text
Manager
├── implementation registry and upgrade approvals
├── DAO factory
└── temporary PendingDao state until finalization

DAO
├── Token
├── Metadata
├── Auction
├── Governor
├── Treasury
└── Marketplace
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

Treasury holds DAO assets and executes arbitrary contract calls for Governor. After finalization, Treasury owns every DAO module, including itself. Governor is the decision layer, not the module owner.

### Marketplace

Marketplace provides fixed-price primary issuance and escrowed holder resale. It stores only active listings, routes payments to Treasury and sellers, and emits terminal history for Goldsky.

## Creation and Authority Flow

1. Manager validates creation parameters and the current implementation hashes.
2. Manager derives deterministic salts and deploys Token, Metadata, Treasury, Governor, Auction, and Marketplace.
3. Manager initializes the modules and configures their cross-contract addresses.
4. Fixed founder token allocations are minted during creation. The total founder allocation is capped at 10,000 tokens.
5. Finalization checks Token ownership and total supply, grants post-finalization mint authority, and transfers every module's authority to Treasury.
6. Manager emits creation/finalization events and deletes temporary `PendingDao` state. Goldsky provides durable DAO discovery.

## Upgrade Security

DAO module upgrades require all of the following:

- a DAO Governor proposal routed through `Treasury.execute`, including Governor and Treasury self-upgrades;
- Treasury authorization as the owner of the target module;
- a Manager-approved `from_hash -> to_hash` transition; and
- the module's current WASM hash matching `from_hash`.

The target module validates the transition, stores the new hash/version, emits an upgrade event, and calls `update_current_contract_wasm` on itself. Manager owner authorization applies only to Manager's own upgrade path.

## Application and Data Layers

The repository includes a Next.js frontend, Goldsky configuration, event decoders, and PostgreSQL migrations. Goldsky is the durable query layer for DAO discovery, proposals, auctions, listings, sales, and upgrade history. Contracts retain only state required for live protocol behavior and replay safety.

## Testing

The current unit suite covers all six contract crates and has 153 passing Rust tests:

```bash
pnpm contracts:test:unit
```

End-to-end tests are separate and should be run with `pnpm contracts:test:e2e`.

See [MANAGER_REDESIGN.md](./MANAGER_REDESIGN.md) and [MARKETPLACE_PLAN.md](./MARKETPLACE_PLAN.md) for the implementation phases and testnet reset procedure.
