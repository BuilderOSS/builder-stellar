# Manager Deployment Guide

Manager is the platform deployment module. It owns the implementation registry and DAO factory. It deploys six modules per DAO: Token, Metadata, Auction, Governor, Treasury, and Marketplace. It does not retain a permanent DAO registry.

## Responsibilities

- Register and revoke module WASM implementations.
- Select the current implementation hash and `0.1.0` version for each module.
- Approve explicit upgrade transitions.
- Deploy modules at deterministic addresses using creator and nonce salts.
- Deploy modules with all cross-module wiring passed to their constructors.
- Keep one temporary `PendingDao` record until launch, then delete it.
- Run `launch_dao`, the one-shot handoff that makes each module Live and moves ownership to the DAO Treasury.
- Register the platform minter (`set_platform_minter`) and manage the admin role (`propose_admin` / `accept_admin`).
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

The configuration contains token, metadata, auction, governance, founder, deployer, and nonce fields. Founder entries are fixed token amounts, not percentages; the contracts do not cap the founder total. The nonce must be unique for the creator.

The script predates the hardened launch flow: its setup phase uses `set_mint_authority` and the Minter before launch, which now fail with `NotLive`, and it does not pass `enable_minter`. See the drift note in [DAO_DEPLOYMENT.md](./DAO_DEPLOYMENT.md).

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

The result contains deterministic addresses for all six modules. After launch, verify each address and confirm that Treasury owns every module, including itself, and that each module reports Live (for example `token.is_live()`).

## Launch Flow and Platform Configuration

`create_dao` writes `PendingDao`; the launch admin configures the DAO during the setup window; `launch_dao(token_address, LaunchConfig { launch_auction, launch_marketplace, enable_minter })` then launches every module. Rules enforced by the Manager at launch: launch admin authorization and Token ownership, nonzero Token supply, and unchanged Auction/Marketplace payment assets (recorded at `create_dao`). See [MANAGER_REDESIGN.md](./MANAGER_REDESIGN.md) and [SECURITY_MODEL.md](./SECURITY_MODEL.md).

Before any DAO that uses `enable_minter` launches, the Manager admin registers the minter:

```bash
stellar contract invoke --id <MANAGER_ADDRESS> --source-account <admin-identity> --network <network> \
  -- set_platform_minter --minter <MINTER_ADDRESS>
```

The launch admin cannot choose the minter. Without a registered minter, `launch_dao` with `enable_minter: true` fails with `PlatformMinterNotSet` (1008). `get_platform_minter` returns the current value.

Admin handover is two-step: the current admin calls `propose_admin(new_admin)` and the new admin calls `accept_admin()`; `get_admin` and `get_pending_admin` read the state.

Creation bounds: voting delay, voting period and queue delay each 300 to 2,592,000 seconds; auction time buffer 1 to 86,400 seconds; quorum 1 to 10,000 bps; proposal threshold at least 1. Out-of-range values are rejected by `create_dao`.

## Upgrade Workflow

For a DAO module upgrade:

1. Build and install the new WASM.
2. Register its hash with Manager.
3. Have the Manager owner approve the exact `from_hash -> to_hash` pair.
4. Create a DAO Governor proposal whose action targets the module's `upgrade` method, pass it through vote and queue, then have anyone call `treasury.execute`. (`governor.execute` always fails with `UseTreasuryExecute`.) Treasury self-upgrades use the same route; calls aimed at the Treasury itself are limited to `upgrade` and `sync_version`.
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
