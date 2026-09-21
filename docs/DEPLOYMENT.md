# Deployment Guide

This guide covers deploying Nouns Builder Stellar contracts to different networks.

> **📖 New: Manager Factory Deployment**
> For deploying multiple DAOs through a factory contract, see the [Manager Deployment Guide](./MANAGER_DEPLOYMENT.md).
> This guide covers direct deployment of individual DAO contracts.

## Prerequisites

- Rust and Cargo with `wasm32v1-none` target
- Node.js 20+ and pnpm
- Stellar CLI installed
- Network-specific account with funding

## Local Development

### Starting Local Network

```bash
# Start Docker-based local network and deploy contracts
pnpm local:up

# Stop local network
pnpm local:down
```

The `local:up` command will:
1. Start a Stellar local network in Docker (container: `stellar-nouns-builder-local`)
2. Build all contracts
3. Deploy Token, Governor, Treasury, and Auction contracts
4. Save deployment info to `deploys/local.json`

### Manual Local Deployment

```bash
# Build contracts
pnpm contracts:build

# Deploy to local network
pnpm deploy:local
```

## Testnet Deployment

### 1. Configure Account

```bash
# Add testnet account
stellar keys generate testnet-deployer --network testnet

# Fund account from friendbot
stellar keys fund testnet-deployer --network testnet
```

### 2. Create Configuration

Create `configs/testnet.json`:

```json
{
  "network": "testnet",
  "label": "nouns",
  "admin": "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "rpcUrl": "https://soroban-testnet.stellar.org",
  "initialBalance": "1000000000",
  "tokenConfig": {
    "name": "Nouns",
    "symbol": "NOUN"
  },
  "auctionConfig": {
    "reservePrice": "1000000",
    "duration": "86400",
    "timeBuffer": "900",
    "minBidIncrement": "5"
  },
  "governorConfig": {
    "votingDelay": "1",
    "votingPeriod": "50400",
    "proposalThresholdBps": "50",
    "quorumThresholdBps": "1000"
  }
}
```

### 3. Deploy

```bash
# Build contracts
pnpm contracts:build

# Deploy to testnet
node scripts/deploy-contracts.mjs configs/testnet.json
```

The deployment will create `deploys/testnet-nouns.json` with all contract addresses.

### 4. Generate Bindings

```bash
# Generate TypeScript bindings from deployed contracts
pnpm contracts:bindings
```

## Mainnet Deployment

**⚠️ WARNING**: Mainnet deployments are permanent and use real XLM. Double-check all configurations.

### 1. Configure Account

```bash
# Add mainnet account (use hardware wallet or secure key management)
stellar keys generate mainnet-deployer --network mainnet
```

### 2. Create Configuration

Create `configs/mainnet.json` with production values:

```json
{
  "network": "mainnet",
  "label": "nouns",
  "admin": "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "rpcUrl": "https://soroban-mainnet.stellar.org",
  "initialBalance": "1000000000",
  "tokenConfig": {
    "name": "Nouns",
    "symbol": "NOUN"
  },
  "auctionConfig": {
    "reservePrice": "10000000",
    "duration": "86400",
    "timeBuffer": "900",
    "minBidIncrement": "5"
  },
  "governorConfig": {
    "votingDelay": "1",
    "votingPeriod": "50400",
    "proposalThresholdBps": "50",
    "quorumThresholdBps": "1000"
  }
}
```

### 3. Deploy

```bash
# Build contracts with optimizations
pnpm contracts:build

# Deploy to mainnet
node scripts/deploy-contracts.mjs configs/mainnet.json
```

### 4. Verify Deployment

```bash
# Check contract IDs in deploys/mainnet-nouns.json
cat deploys/mainnet-nouns.json

# Verify contracts are deployed
stellar contract info --id <contract-id> --network mainnet
```

## Contract Upgrades

Current contracts (Token, Governor, Treasury, Auction) support WASM upgrades through the `upgrade` method.

### Upgrade Process

1. **Build new WASM**:
   ```bash
   pnpm contracts:build
   ```

2. **Install new WASM**:
   ```bash
   stellar contract install \
     --wasm target/wasm32v1-none/release/token.wasm \
     --network testnet
   ```

3. **Upgrade contract**:
   ```bash
   stellar contract invoke \
     --id <contract-id> \
     --network testnet \
     -- upgrade \
     --new_wasm_hash <new-wasm-hash>
   ```

4. **Verify upgrade**:
   ```bash
   stellar contract info --id <contract-id> --network testnet
   ```

## Configuration Reference

### Token Config

- `name`: NFT collection name (e.g., "Nouns")
- `symbol`: NFT collection symbol (e.g., "NOUN")

### Auction Config

- `reservePrice`: Minimum bid in stroops (1 XLM = 10,000,000 stroops)
- `duration`: Auction duration in seconds (default: 86400 = 24 hours)
- `timeBuffer`: Time extension on last-minute bids in seconds (default: 900 = 15 minutes)
- `minBidIncrement`: Minimum bid increase percentage (default: 5%)

### Governor Config

- `votingDelay`: Blocks between proposal creation and voting start (default: 1)
- `votingPeriod`: Blocks for voting duration (default: 50400 = ~7 days at 12s blocks)
- `proposalThresholdBps`: Minimum votes to create proposal in basis points (default: 50 = 0.5%)
- `quorumThresholdBps`: Minimum votes for quorum in basis points (default: 1000 = 10%)

## Deployment Files

All deployments are saved to `deploys/{network}-{label}.json`:

```json
{
  "network": "testnet",
  "label": "nouns",
  "contractIds": {
    "token": "CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    "governor": "CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    "treasury": "CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    "auction": "CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
  },
  "admin": "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "timestamp": "2024-01-15T12:00:00.000Z"
}
```

## Troubleshooting

### Build Failures

```bash
# Clean and rebuild
cargo clean
pnpm contracts:build
```

### Deployment Failures

- Ensure account has sufficient XLM balance
- Check RPC URL is correct for network
- Verify Stellar CLI is up to date: `stellar version`

### Contract Invocation Failures

- Verify contract ID in deployment file
- Check contract is initialized
- Ensure signer has proper authorization

## Security Checklist

Before mainnet deployment:

- [ ] Review all contract code
- [ ] Audit configuration values
- [ ] Test on testnet with production config
- [ ] Verify admin key management
- [ ] Document upgrade procedures
- [ ] Set up monitoring and alerting
- [ ] Prepare incident response plan

## Next Steps

After deployment:

1. Set up Goldsky indexing (see `GOLDSKY_SETUP.md`)
2. Configure web app environment variables
3. Deploy web app to hosting platform
4. Monitor contract events and transactions
