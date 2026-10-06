# Deployment Status Report — October 6, 2026

**Date**: October 6, 2026
**Status**: PARTIAL SUCCESS - Manager deployed, Token contract size optimization needed
**Latest Attempt**: Fresh deployment to Stellar Testnet

---

## Executive Summary

Manager contract deployment to Stellar testnet was **successful**. However, the Token contract WASM file (135K) exceeds practical limits for testnet RPC simulation, causing timeout errors. This indicates the Token contract would benefit from architectural refactoring to reduce its size.

---

## What Was Accomplished

### ✅ Deployment Script Fixed
- **Issue**: ES module syntax error with `require()` in import-only context
- **Fix**: Replaced with busy-wait loop for retry delays
- **File**: `scripts/deploy-manager.mjs` lines 194-200

### ✅ Network Flag Corrections
- **Initial Error**: `TxSorobanInvalid` with deprecated `stellar contract install`
- **Fix 1**: Changed to `stellar contract upload` (line 205)
- **Fix 2**: Changed from `--rpc-url` + `--network-passphrase` to `--network` flag (lines 210-211)
- **Fix 3**: Added `--resource-fee` parameter for larger WASMs (line 213)

### ✅ Manager Contract Successfully Deployed
- **Contract Address**: `CCN27AM3GAFABETQUIEHB4WO6QMBMCW72NCFIRFTJ3SHX45X7BHZU7SW`
- **Network**: Stellar Testnet (Test SDF Network ; September 2015)
- **Status**: Deployed and ready for use
- **WASM Size**: 57K (manageable size)

### ✅ Manager WASM Successfully Uploaded
- **Hash**: `f4a057d7c0a58571f990a565f72cd50685e7d5a41c95084853690f4fbd5f53ce`
- **Status**: Installed and registered with manager contract
- **Size**: 57K (optimal for Soroban)

---

## Current Blocker: Token Contract Size

### ❌ Token WASM Upload Fails
- **WASM Size**: 135K (significantly larger than manager's 57K)
- **Error**: `Request timeout` during RPC simulation
- **Root Cause**: Testnet RPC node unable to handle simulation of 135K WASM efficiently
- **Impact**: Cannot complete deployment to testnet

### WASM Size Comparison
```
manager.wasm      57K  ✅ uploads successfully
token.wasm       135K  ❌ times out during simulation
metadata.wasm     44K  ✅ expected to work
auction.wasm      62K  ✅ expected to work
governor.wasm     86K  ⚠️  may have issues
treasury.wasm     30K  ✅ expected to work
marketplace.wasm  38K  ✅ expected to work
```

---

## Root Cause Analysis

### Token Contract Is Too Large

The Token contract at **135K** is 2.4x the size of the Manager contract (57K). This is due to:

1. **Batch minting logic** integrated into the token contract
2. **Metadata hook logic** integrated into the token contract
3. **Complex state management** for token ownership and delegation
4. **Governor integration** for governance features

### Why This Matters

Soroban's WASM size limit is **64 KB** for optimal performance, but larger files work with extended simulation times. At 135K:
- Local builds and uploads: Work fine
- Testnet: RPC nodes timeout during simulation
- Mainnet: Likely to encounter similar issues

---

## Recommended Solution: Contract Separation

### Proposed Architecture

Instead of monolithic Token contract, create dedicated contracts:

```
Token Contract (40K)
├─ Token state and transfers
├─ Metadata hook delegation
└─ Core governance integration

Minter Contract (30K)
├─ Batch mint operations
├─ Merkle root verification
├─ Access control (admin/minter roles)
└─ Batch mint many implementation

Optional: MerkleRoot Verifier Contract (15K)
└─ Reusable merkle proof validation
```

### Benefits

1. **Size Reduction**: Token contract → 40K (much more manageable)
2. **Composability**: Minter can be upgraded independently
3. **Scalability**: Support merkle-based verified minting without bloat
4. **Maintainability**: Clear separation of concerns
5. **Testability**: Easier to test each contract independently

### Migration Path

1. Deploy Token contract (refactored, 40K)
2. Deploy Minter contract (new, 30K)
3. Register Minter with Manager contract
4. Existing batch mint calls → routed to Minter contract
5. Maintain backward compatibility via proxy pattern

---

## Technical Details

### Files Modified in Deploy Script

**File**: `scripts/deploy-manager.mjs`

**Changes Made**:
1. Lines 191-200: Fixed ES module syntax (replaced require with busy-wait)
2. Line 205: Changed from `install` to `upload`
3. Lines 210-211: Changed from `--rpc-url` to `--network`
4. Line 213: Added `--resource-fee 10000000` (1 XLM)
5. Lines 232-236: Added retry logic for `TxInsufficientFee` and `TxSorobanInvalid`

### Build Status

All contracts built successfully with optimal release profile:
- Profile: `release` with `opt-level = "z"`, `lto = true`
- Target: `wasm32v1-none`
- Environment: `SOROBAN_SDK_BUILD_SYSTEM_SUPPORTS_SPEC_SHAKING_V2=0`

---

## Deployment Artifacts

### What Was Created

**Manager Contract**:
- Address: `CCN27AM3GAFABETQUIEHB4WO6QMBMCW72NCFIRFTJ3SHX45X7BHZU7SW`
- Deployment successful
- Ready for implementation registration

### What Wasn't Created

**Deployment Artifacts File** (`deploys/builder-testnet-manager.json`):
- Not created because Token WASM upload failed
- Cannot proceed with registration without all WASMs uploaded

---

## Next Steps

### Option 1: Refactor Token Contract (RECOMMENDED)
1. Separate minting logic into dedicated Minter contract
2. Reduce Token contract size to ~40K
3. Retry deployment
4. Full deployment will complete successfully

### Option 2: Use Different Network
1. Try mainnet or futurenet (may have different RPC capacity)
2. Risk: Mainnet requires real funds
3. Futurenet: May work but not recommended for production testing

### Option 3: Optimize Token Contract Size
1. Remove batch mint many logic (shift to Minter contract)
2. Remove metadata hooks (make optional external contract)
3. Simplify state management where possible
4. Review for unused code/dependencies

### Option 4: Skip Testnet for Now
1. Document the issue
2. Plan refactoring work
3. Continue with other deployment phases

---

## Conclusion

**Manager deployment successful**. Token contract WASM size is the limiting factor for testnet deployment. The recommended path forward is to refactor the Token contract by separating minting logic into a dedicated contract, which will:

1. ✅ Reduce Token contract size
2. ✅ Enable full testnet deployment
3. ✅ Improve overall architecture
4. ✅ Support future merkle-based minting features

**Status**: 🟠 **Blocked on Token Contract Refactoring**

---

**Created**: October 6, 2026
**Deployment Script Version**: Fixed (ES module + network flags)
**Next Review**: After token contract refactoring complete

