# Manager Deployment Guide

Manager is the current platform contract. It combines the implementation registry, DAO factory, and DAO registry. It deploys five modules per DAO: Token, Metadata, Auction, Governor, and Treasury.

## Responsibilities

- Register and revoke module WASM implementations.
- Select the current implementation hash for each module.
- Approve explicit upgrade transitions.
- Deploy modules at deterministic addresses using creator and nonce salts.
- Initialize module relationships and fixed founder allocations.
- Record DAO registrations and enumerate them with pagination.
- Pause and unpause DAO creation.

## Deploy Manager

```bash
node scripts/deploy-manager.mjs configs/local.json
node scripts/deploy-manager.mjs configs/testnet.json --force
```

The deployment script builds Manager and the five module crates, installs the five implementation WASMs, registers their hashes, selects current implementations, and writes a Manager artifact under `deploys/`.

## Create a DAO

Use the repository's DAO template and creation script:

```bash
node scripts/create-dao.mjs configs/dao-template.json configs/local.json
```

The configuration contains token, metadata, auction, governance, founder, deployer, and nonce fields. Founder entries are fixed token amounts, not percentages; the sum of all founder amounts must not exceed 10,000. The nonce must be unique for the creator.

Predict addresses before creation:

```bash
stellar contract invoke \
  --id <MANAGER_ADDRESS> \
  --source-account <network>-deployer \
  --network <network> \
  -- predict \
  --creator <CREATOR_ADDRESS> \
  --nonce <NONCE>
```

The result contains deterministic addresses for all five modules. After creation, verify each address and confirm that Treasury owns the modules in production.

## Upgrade Workflow

For a module upgrade:

1. Build and install the new WASM.
2. Register its hash with Manager.
3. Have the Manager owner approve the exact `from_hash -> to_hash` pair.
4. Invoke the module upgrade with `from_hash` and `to_hash` as the Treasury/module owner.
5. Verify that the module's current hash is now `to_hash`.

The module rejects upgrades without owner authorization, without Manager approval, or when `from_hash` does not match the current hash. Revoked or unknown implementations cannot be used. Approving a destination hash alone is not enough; the transition is directional.

## Artifacts and Verification

Manager deployment artifacts record the network, Manager address, and implementation hashes. DAO artifacts record the creator, nonce, Manager, and creation configuration. Treat these files and the corresponding ledger/hash records as the deployment source of truth.

Useful checks:

```bash
stellar contract info --id <MANAGER_ADDRESS> --network <network>
stellar contract fetch --id <TOKEN_ADDRESS> --network <network>
```

## Current Scope

Manager's on-chain DAO registry is implemented. The multi-DAO database schema, Goldsky discovery/backfill pipeline, and frontend DAO directory/routing are not complete. Existing migration and indexer documents describe historical or future work rather than a finished application path.

See [ARCHITECTURE.md](./ARCHITECTURE.md) and [DEPLOYMENT.md](./DEPLOYMENT.md) for the system model and direct module deployment.
