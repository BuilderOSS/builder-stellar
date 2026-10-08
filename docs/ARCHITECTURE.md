# Architecture

## Versioned Redesign

The next baseline contains seven Soroban contracts: six DAO modules and one Manager deployment module. Every Manager and DAO module starts at semantic version `0.1.0`.

1. **Implementation registry**: registers WASM hashes, tracks versions, approves transitions, and revokes implementations.
2. **DAO factory**: deploys six modules with deterministic salt-derived addresses and wires them through constructors; `launch_dao` performs the one-shot Setup to Live handoff.
3. **Upgrade gate**: validates active, Manager-approved module transitions. Manager does not execute DAO upgrades.

```text
Manager
├── implementation registry and upgrade approvals
├── DAO factory
└── temporary PendingDao state until launch

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

The NFT governance token supports ownership and transfers, delegation with checkpointed voting power, batch minting, minter authorization, and a Metadata mint hook. Before launch only the Token owner (the launch admin) can mint. At launch the Manager sets the mint-authority set to Treasury and Marketplace, plus Auction and the platform minter when requested. `set_mint_authority` is available only after launch, to the owner (Treasury).

### Metadata

Each DAO has a Metadata module with mutable settings, properties, and items. The owner adds properties/items (at most 30 items per `add_properties` call) and updates descriptive settings. When a token is minted, Token calls `on_minted`; Metadata derives a seed and selects attributes. Paginated getters (`get_items`, `get_ipfs_group`, page size at most 50) are preferred over the O(total) `get_properties`/`get_ipfs_data`. `bump_artwork_ttl` is a permissionless maintenance call (see [SECURITY_MODEL.md](./SECURITY_MODEL.md)).

### Auction

Auction provides continuous English-auction membership with reserve price, minimum bid increment, time buffer (1 to 86,400 seconds), a configurable payment asset, settlement, and Treasury proceeds. Refunds to the outbid bidder are pushed best-effort; a failed push is credited and collected with `withdraw_refund`.

### Governor

Governor creates proposals using timestamp-based voting windows, historical voting power, quorum, and proposal thresholds. It does not execute proposals: `governor.execute` always fails with `UseTreasuryExecute`. Execution is `treasury.execute`, which calls `governor.consume` and then dispatches the actions.

### Treasury

Treasury holds DAO assets and is the top-level executor of passed proposals. Anyone can call `treasury.execute` for a Queued proposal past its ETA. After launch Treasury owns every DAO module, including itself. Calls targeting the Treasury itself are limited to `upgrade` and `sync_version`.

### Marketplace

Marketplace provides lazy primary sales and escrowed holder resale. A primary listing (`create_primary_listing`, Treasury only) escrows nothing; `buy_primary` pays the Treasury and mints the NFT to the buyer. Secondary listings escrow the NFT. Each listing records the payment asset current at creation. Only active listings are stored; terminal history is in events.

## Creation, Setup, and Launch Flow

1. Manager validates creation parameters and the current implementation hashes.
2. `create_dao` derives deterministic salts and deploys Token, Metadata, Treasury, Governor, Auction, and Marketplace. All cross-module addresses are passed to constructors; there are no wiring setters. The launch admin owns each module and every module is in Setup. `PendingDao` records the addresses, the launch admin, and the Auction and Marketplace payment assets.
3. In the setup window the launch admin mints founder tokens, adds artwork, and adjusts Auction, Marketplace, and Governor parameters. The Treasury has no authority yet.
4. `launch_dao(token, LaunchConfig { launch_auction, launch_marketplace, enable_minter })` (launch admin auth) checks Token ownership, nonzero supply, and the recorded payment assets, then calls `launch` on each module. Each module becomes Live, ownership moves to Treasury, and the Manager has no further authority. Token mint authority is the Manager-chosen set.
5. Manager emits `DaoLaunched` and deletes `PendingDao`. Goldsky provides durable DAO discovery.

The platform minter is registered separately by the Manager admin with `set_platform_minter`.

## Upgrade Security

DAO module upgrades require all of the following:

- a DAO Governor proposal executed through `Treasury.execute`; for the Treasury's own upgrade the action targets the Treasury and is handled by its self-call allowlist;
- Treasury authorization as the owner of the target module;
- a Manager-approved `from_hash -> to_hash` transition; and
- the module's current WASM hash matching `from_hash`.

The target module validates the transition through `common::upgrade::apply`, stores the new hash/version, emits an upgrade event, and calls `update_current_contract_wasm` on itself. Manager owner authorization applies only to Manager's own upgrade path. Every module, including Token, exposes `version()`, `wasm_hash()` and `sync_version()`.

See [SECURITY_MODEL.md](./SECURITY_MODEL.md) for trust boundaries, TTL caveats, and known limitations.

## Application and Data Layers

The repository includes a Next.js frontend, Goldsky configuration, event decoders, and PostgreSQL migrations. Goldsky is the durable query layer for DAO discovery, proposals, auctions, listings, sales, and upgrade history. Contracts retain only state required for live protocol behavior and replay safety.

## Testing

The unit and end-to-end suites run together:

```bash
pnpm contracts:test   # cargo test (the e2e crate is part of the workspace)
```

See [MANAGER_REDESIGN.md](./MANAGER_REDESIGN.md) and [MARKETPLACE_PLAN.md](./MARKETPLACE_PLAN.md) for the implementation phases and testnet reset procedure.
