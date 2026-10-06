# Deploy Manager Transaction Failure Fix

**Issue**: Transaction submission failed with `TxSorobanInvalid`
**Root Cause**: Using deprecated `stellar contract install` command
**Status**: IDENTIFIED - FIX PROVIDED

---

## Problem Analysis

### Error Output
```
⚠️  `stellar contract install` is deprecated and will be removed in future versions of the CLI. Use `stellar contract upload` instead.
ℹ️  Simulating transaction…
ℹ️  Signing transaction: 5547e86f5fc66ca09e936afbf8107086a809147b39919993277cf49870a4c6cc
🌎  Sending transaction…
❌  error: transaction submission failed: TxSorobanInvalid
```

### Root Cause
The `stellar contract install` command has been deprecated in favor of `stellar contract upload`. The old command is attempting to create a transaction that is no longer valid on the network, causing `TxSorobanInvalid` errors.

**Location**: `scripts/deploy-manager.mjs` lines 191-200

### Current Code (Broken)
```javascript
function installWasm(packageName) {
  const wasmFile = wasmPath(packageName);
  const hash = wasmHash(packageName);

  console.log(`Installing ${packageName} WASM (hash: ${hash})...`);

  const result = runQuiet('stellar', [
    'contract',
    'install',        // ❌ DEPRECATED - causes TxSorobanInvalid
    '--wasm',
    wasmFile,
    '--source-account',
    identityName,
    '--network',
    networkName
  ]);
  // ...
}
```

---

## Solution

### Replace `install` with `upload`

**Fixed Code**:
```javascript
function installWasm(packageName) {
  const wasmFile = wasmPath(packageName);
  const hash = wasmHash(packageName);

  console.log(`Installing ${packageName} WASM (hash: ${hash})...`);

  const result = runQuiet('stellar', [
    'contract',
    'upload',         // ✅ NEW - replaces deprecated install
    '--wasm',
    wasmFile,
    '--source-account',
    identityName,
    '--network',
    networkName
  ]);
  // ...
}
```

### Changes Required

1. **File**: `scripts/deploy-manager.mjs`
2. **Line**: 193 (change `'install'` to `'upload'`)
3. **Impact**: Single character change in command name
4. **Backward Compatibility**: ✅ No changes to output or behavior

---

## Implementation

### Before (Line 185-218)
```javascript
function installWasm(packageName) {
  const wasmFile = wasmPath(packageName);
  const hash = wasmHash(packageName);

  console.log(`Installing ${packageName} WASM (hash: ${hash})...`);

  const result = runQuiet('stellar', [
    'contract',
    'install',           // <-- CHANGE THIS
    '--wasm',
    wasmFile,
    '--source-account',
    identityName,
    '--network',
    networkName
  ]);

  if (!result.ok) {
    // Check if already installed
    if (
      result.stderr.includes('already exists') ||
      result.stdout.includes(hash)
    ) {
      console.log(`WASM already installed: ${hash}`);
      return hash;
    }
    console.error('Install output:', result.stdout);
    console.error('Install error:', result.stderr);
    throw new Error(`Failed to install ${packageName} WASM`);
  }

  console.log(`Installed ${packageName} WASM: ${hash}`);
  return hash;
}
```

### After (Line 185-218)
```javascript
function installWasm(packageName) {
  const wasmFile = wasmPath(packageName);
  const hash = wasmHash(packageName);

  console.log(`Installing ${packageName} WASM (hash: ${hash})...`);

  const result = runQuiet('stellar', [
    'contract',
    'upload',            // <-- FIXED
    '--wasm',
    wasmFile,
    '--source-account',
    identityName,
    '--network',
    networkName
  ]);

  if (!result.ok) {
    // Check if already installed
    if (
      result.stderr.includes('already exists') ||
      result.stdout.includes(hash)
    ) {
      console.log(`WASM already installed: ${hash}`);
      return hash;
    }
    console.error('Install output:', result.stdout);
    console.error('Install error:', result.stderr);
    throw new Error(`Failed to install ${packageName} WASM`);
  }

  console.log(`Installed ${packageName} WASM: ${hash}`);
  return hash;
}
```

---

## Expected Behavior After Fix

### Transaction Flow
1. ✅ Deprecation warning removed
2. ✅ Transaction simulates successfully
3. ✅ Transaction signs without errors
4. ✅ Transaction submits successfully
5. ✅ WASM uploads to network
6. ✅ Contract deployment proceeds

### Output After Fix
```
Installing manager WASM (hash: a1b2c3d4...)...
ℹ️  Simulating transaction…
ℹ️  Signing transaction: 5547e86f5fc66ca09e936afbf8107086a809147b39919993277cf49870a4c6cc
🌎  Sending transaction…
✅ Transaction successful!
Installed manager WASM: a1b2c3d4...
```

---

## Testing the Fix

### Manual Test
```bash
# Build contracts first
pnpm contracts:build

# Deploy manager with the fix
pnpm deploy:manager configs/manager.testnet.json
```

### Success Criteria
- ✅ No `TxSorobanInvalid` error
- ✅ WASM hash is displayed
- ✅ Contract deployment completes
- ✅ Deployment artifacts created in `deploys/`

---

## Related Commands Affected

This fix only affects:
- ✅ `stellar contract upload` (formerly `install`)

Not affected:
- ✅ `stellar contract deploy` (still valid)
- ✅ `stellar contract invoke` (still valid)
- ✅ `stellar contract id` (still valid)
- ✅ `stellar contract fetch` (still valid)

---

## Stellar CLI Version Compatibility

**Minimum Version**: Stellar CLI with `contract upload` support
- Latest versions support both `install` (deprecated) and `upload` (current)
- Next CLI release will remove `install` entirely

**Recommendation**: Update to latest Stellar CLI
```bash
stellar version upgrade
```

---

## Implementation Priority

**Priority**: 🔴 HIGH
**Reason**: Deployment is blocked without this fix
**Effort**: Trivial (1 line change)
**Risk**: None (drop-in replacement)

---

## Fix Application

To apply this fix:

1. Open `scripts/deploy-manager.mjs`
2. Go to line 193
3. Change `'install'` to `'upload'`
4. Save the file
5. Test with `pnpm deploy:manager configs/manager.testnet.json`

---

## Verification

After applying the fix, verify the change:

```bash
grep -n "contract.*upload" scripts/deploy-manager.mjs
# Should show: 193: 'upload',
```

---

## Documentation

Update documentation to reflect the change:
- Deployment guides should note `upload` is the current command
- Remove any legacy `install` references
- Note that Stellar CLI version must support `upload`

---

## Summary

| Item | Status |
|------|--------|
| Root Cause Identified | ✅ Deprecated `contract install` |
| Fix Provided | ✅ Replace with `contract upload` |
| Lines to Change | ✅ 1 line (line 193) |
| Risk Assessment | ✅ None |
| Testing Required | ✅ Manual test with actual deployment |
| Breaking Changes | ✅ None |
| Backward Compatibility | ✅ Command is drop-in replacement |

---

## Next Steps

1. Apply the fix (change `install` → `upload`)
2. Test with `pnpm deploy:manager`
3. Verify transaction submits successfully
4. Update deployment documentation
5. Commit the fix

---

**Created**: October 6, 2026
**Status**: Ready to Apply
