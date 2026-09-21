# Manager Contract Deployment Guide

This guide explains how to deploy the Manager contract (DAO factory) and use it to create new DAOs.

## Overview

The Manager contract acts as a factory for creating DAOs. It:
1. Stores WASM implementations for all 5 DAO modules (Token, Metadata, Auction, Governor, Treasury)
2. Manages implementation versioning and upgrades
3. Deploys complete DAOs atomically with all modules configured
4. Predicts DAO addresses deterministically before deployment

## Architecture

```
Manager Contract
├── Implementation Registry (versioned WASM hashes)
│   ├── Token
│   ├── Metadata
│   ├── Auction
│   ├── Governor
│   └── Treasury
└── DAO Factory
    └── create_dao() → deploys all 5 contracts
```

## Deployment Steps

### 1. Deploy Manager Contract

The Manager contract must be deployed once per network and configured with the current implementation WASMs.

```bash
# Deploy to local network
node scripts/deploy-manager.mjs configs/local.json

# Deploy to testnet
node scripts/deploy-manager.mjs configs/testnet.json --force
```

This script will:
1. Build all 6 contracts (token, metadata, auction, governor, treasury, manager)
2. Deploy the Manager contract
3. Install all 5 implementation WASMs on-chain
4. Register each implementation with a name
5. Set the current implementations to be used for new DAOs
6. Save deployment artifact to `deploys/<label>-<network>-manager.json`

**Output:**
```
MANAGER=CCABC123...
TOKEN_WASM=abc123...
METADATA_WASM=def456...
AUCTION_WASM=ghi789...
GOVERNOR_WASM=jkl012...
TREASURY_WASM=mno345...
```

### 2. Create a DAO

Once the Manager is deployed, you can create DAOs by calling the `create_dao` function.

#### Using the Script

```bash
# Create a DAO using the template config
node scripts/create-dao.mjs configs/dao-template.json configs/local.json
```

#### DAO Configuration

Create a JSON file with your DAO parameters (see `configs/dao-template.json`):

```json
{
  "deployer": "G...",
  "nonce": 0,
  "token": {
    "name": "My DAO Vote NFT",
    "symbol": "MDAO",
    "uri": "https://example.com/api/token/"
  },
  "metadata": {
    "projectUri": "https://example.com/dao",
    "description": "My DAO description",
    "contractImage": "https://example.com/logo.png",
    "rendererBase": "https://example.com/render/"
  },
  "auction": {
    "duration": 86400,
    "reservePrice": "1000000000",
    "timeBuffer": 900,
    "paymentAsset": ""
  },
  "governance": {
    "votingDelay": 10,
    "votingPeriod": 100,
    "quorumBps": 1000,
    "proposalThresholdBps": 100
  },
  "founders": [
    {
      "address": "G...",
      "amount": 10
    }
  ],
  "launchAdmin": "G..."
}
```

**Parameters:**
- `deployer`: Address creating the DAO
- `nonce`: Unique number to avoid address collisions (increment for each DAO)
- `token`: NFT token configuration
- `metadata`: Artwork and metadata configuration
- `auction`: Auction mechanics configuration
- `governance`: Governor parameters
- `founders`: Initial token allocations (optional)
- `launchAdmin`: Address that can start the first auction

#### Predict DAO Addresses

Before creating a DAO, you can predict its addresses:

```bash
stellar contract invoke \
  --id <MANAGER_ADDRESS> \
  --source-account <networkName>-dev \
  --network <networkName> \
  -- predict \
  --creator <deployer> \
  --nonce <nonce>
```

This returns deterministic addresses for all 5 contracts before deployment.

### 3. Verify DAO Deployment

After creating a DAO, verify the contracts are deployed:

```bash
# Check token contract
stellar contract fetch --id <TOKEN_ADDRESS> --network <networkName>

# Query token metadata
stellar contract invoke --id <TOKEN_ADDRESS> --network <networkName> -- metadata

# Check auction status
stellar contract invoke --id <AUCTION_ADDRESS> --network <networkName> -- auction
```

## Upgrading Implementations

The Manager contract supports registering new implementation versions:

```bash
# Install new WASM
stellar contract install --wasm target/wasm32v1-none/release/token.wasm

# Register new version
stellar contract invoke \
  --id <MANAGER_ADDRESS> \
  -- reg_impl \
  --wasm_hash <NEW_WASM_HASH> \
  --name "Token"

# Set as current (requires admin)
stellar contract invoke \
  --id <MANAGER_ADDRESS> \
  -- set_cur \
  --token_wasm <NEW_WASM_HASH> \
  --metadata_wasm <CURRENT_METADATA_WASM> \
  --auction_wasm <CURRENT_AUCTION_WASM> \
  --governor_wasm <CURRENT_GOVERNOR_WASM> \
  --treasury_wasm <CURRENT_TREASURY_WASM>
```

## Network Configuration

Each network requires a configuration file (e.g., `configs/local.json`):

```json
{
  "network": "local",
  "label": "dev",
  "adminAddress": "G...",
  "rpcUrl": "http://localhost:8000/rpc",
  "networkPassphrase": "Standalone Network ; February 2017"
}
```

## Deployment Artifacts

### Manager Artifact
`deploys/<label>-<network>-manager.json`:
```json
{
  "network": "local",
  "label": "dev",
  "manager": "CCABC123...",
  "implementations": {
    "token": "abc123...",
    "metadata": "def456...",
    "auction": "ghi789...",
    "governor": "jkl012...",
    "treasury": "mno345..."
  },
  "deployedAt": "2026-09-21T..."
}
```

### DAO Artifact
`deploys/<label>-<network>-dao-<nonce>.json`:
```json
{
  "network": "local",
  "label": "dev",
  "deployer": "G...",
  "nonce": 0,
  "manager": "CCABC123...",
  "config": { ... },
  "createdAt": "2026-09-21T..."
}
```

## Troubleshooting

### "Manager deployment artifact not found"
Run `deploy-manager.mjs` first before creating DAOs.

### "Failed to predict DAO addresses"
Verify the Manager contract is deployed and the deployer address is valid.

### "Nonce collision"
Increment the `nonce` value in your DAO config to generate different addresses.

### "Implementation not registered"
Ensure all 5 implementations are registered and current implementations are set.

## Advanced: Manual DAO Creation

You can call the Manager contract directly using stellar CLI:

```bash
stellar contract invoke \
  --id <MANAGER_ADDRESS> \
  --source-account <account> \
  --network <networkName> \
  -- create_dao \
  --deployer <address> \
  --nonce 0 \
  --token_name "My DAO" \
  --token_symbol "MDAO" \
  --token_uri "https://..." \
  --project_uri "https://..." \
  --description "..." \
  --contract_image "https://..." \
  --renderer_base "https://..." \
  --auction_duration 86400 \
  --reserve_price 1000000000 \
  --time_buffer 900 \
  --payment_asset "" \
  --voting_delay 10 \
  --voting_period 100 \
  --quorum_bps 1000 \
  --proposal_threshold_bps 100 \
  --founders '[]' \
  --launch_admin <address>
```

## See Also

- [Deployment Guide](./DEPLOYMENT.md) - Direct contract deployment (without Manager)
- [Architecture Documentation](./ARCHITECTURE.md) - System design overview
- [Testing Guide](./TESTING.md) - How to test contracts
