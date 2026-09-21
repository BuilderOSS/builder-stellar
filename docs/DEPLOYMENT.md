# Deployment Guide

This guide covers direct deployment of the five DAO modules. Manager-based deployment is documented in [MANAGER_DEPLOYMENT.md](./MANAGER_DEPLOYMENT.md). The multi-DAO database, indexer, and frontend layers are not complete, so deploying contracts does not create a complete multi-DAO application.

## Prerequisites

- Rust and Cargo with the `wasm32v1-none` target
- Node.js 20+ and pnpm
- Stellar CLI v22+
- A funded account for the target network

## Local Network

```bash
pnpm local:up
pnpm local:down
```

`local:up` starts the Docker network, builds the contracts, deploys Token, Governor, Treasury, Auction, and Metadata, and writes deployment information under `deploys/`.

For manual deployment:

```bash
pnpm contracts:build
pnpm deploy:local
```

## Testnet and Mainnet

Create a network configuration under `configs/`, then run:

```bash
pnpm contracts:build
pnpm deploy:manager configs/testnet-manager.json --force
pnpm deploy:dao configs/testnet-builder-dao.json configs/testnet-manager.json
pnpm contracts:bindings
```

Use `configs/mainnet.json` and secure key management for mainnet. Deployment artifacts are written to `deploys/`. Verify each contract with:

```bash
stellar contract info --id <contract-id> --network testnet
```

Keep RPC URLs, account identifiers, and secret material out of committed configuration.

## Module Upgrades

Upgrades are authorization-checked by the module and Manager. A valid upgrade needs the module owner's authorization, an approved Manager transition from the module's current hash to the new hash, and an exact current-hash match.

The operational sequence is:

1. Build and install the new WASM.
2. Register the new hash with Manager if it is not registered.
3. Have the Manager owner approve the `from_hash -> to_hash` transition.
4. Invoke the module upgrade with both hashes from the module owner/Treasury authority.
5. Confirm the resulting current hash and exercise the module's critical paths.

Do not treat a raw `install` command or a direct `new_wasm_hash` invocation as sufficient; the Manager approval and current-hash checks are part of the protocol.

## Operational Checklist

- Build and test with `pnpm contracts:test:unit`.
- Run E2E coverage with `pnpm contracts:test:e2e`.
- Verify all five module addresses and their cross-contract authorities.
- Confirm Treasury owns modules in production.
- Store deployment artifacts securely and record network, ledger, and WASM hashes.
- Test upgrades on local network and testnet before mainnet.
- Configure Goldsky and the web application separately; multi-DAO support remains future work.

See [GOLDSKY_SETUP.md](./GOLDSKY_SETUP.md) for the existing indexing setup and [MANAGER_DEPLOYMENT.md](./MANAGER_DEPLOYMENT.md) for Manager operations.
