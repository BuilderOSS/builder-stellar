# Manager Deployment Guide

Manager is the platform deployment module. It owns the implementation registry and DAO factory. It deploys six modules per DAO: Token, Metadata, Auction, Governor, Treasury, and Marketplace. It does not retain a permanent DAO registry.

## Responsibilities

- Register and revoke module WASM implementations.
- Select the current implementation hash and `0.1.0` version for each module.
- Approve explicit upgrade transitions.
- Deploy modules at deterministic addresses using creator and nonce salts.
- Initialize module relationships and fixed founder allocations.
- Keep one temporary `PendingDao` record until finalization, then delete it.
- Pause and unpause DAO creation.

## Deploy Manager

```bash
pnpm deploy:manager configs/testnet-manager.json --force
```

The deployment script builds Manager and the six module crates, installs the six implementation WASMs, registers their `0.1.0` hashes, selects current implementations, and writes a versioned Manager artifact under `deploys/`.

## Create a DAO

Use the repository's DAO template and creation script:

```bash
pnpm deploy:dao configs/testnet-builder-dao.json configs/testnet-manager.json
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

The result contains deterministic addresses for all six modules. After finalization, verify each address and confirm that Treasury owns every module, including itself.

## Upgrade Workflow

For a DAO module upgrade:

1. Build and install the new WASM.
2. Register its hash with Manager.
3. Have the Manager owner approve the exact `from_hash -> to_hash` pair.
4. Create and execute a DAO Governor proposal routed through `Treasury.execute` to the target module's `upgrade` method. This same route applies to Governor and Treasury self-upgrades.
5. The target module verifies its current hash, asks Manager to validate the active approved transition and target version, writes the new version/hash, emits an event, and updates its own WASM.

The module rejects upgrades without owner authorization, without Manager approval, or when `from_hash` does not match the current hash. Revoked or unknown implementations cannot be used. Approving a destination hash alone is not enough; the transition is directional.

## Artifacts and Verification

Manager deployment artifacts record the network, Manager address, and implementation hashes. DAO artifacts record the creator, nonce, Manager, and creation configuration. Treat these files and the corresponding ledger/hash records as the deployment source of truth.

Useful checks:

```bash
stellar contract info --id <MANAGER_ADDRESS> --network <network>
stellar contract fetch --id <TOKEN_ADDRESS> --network <network>
```

## Current Scope

Goldsky and PostgreSQL provide the durable DAO directory and history. Manager stores no permanent DAO registry. For the full storage and versioning policy, see [MANAGER_REDESIGN.md](./MANAGER_REDESIGN.md).

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the system model and [DAO_DEPLOYMENT.md](./DAO_DEPLOYMENT.md) for DAO deployment.
