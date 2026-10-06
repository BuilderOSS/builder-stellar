# Bindings Generation Issue Report

**Reported by**: Frontend Builder Agent
**Date**: 2026-10-06
**Priority**: Blocking full app build/typecheck
**Scope**: Non-token contract bindings
**Assignee**: frontend-services agent

## Issue Summary

The non-token contract bindings (governor, auction, manager, metadata, treasury) fail to compile with TypeScript errors during build. This blocks the entire `pnpm build` and `pnpm typecheck` commands for the web app, even though individual token-bindings code is valid.

## Affected Packages

1. `@builder-stellar/governor-bindings` - FAILED
2. `@builder-stellar/auction-bindings` - FAILED
3. `@builder-stellar/manager-bindings` - FAILED (implied, not tested)
4. `@builder-stellar/metadata-bindings` - FAILED (implied, not tested)
5. `@builder-stellar/treasury-bindings` - FAILED (implied, not tested)
6. `@builder-stellar/token-bindings` - OK

## Error Details

### Governor Bindings Sample Errors

```
src/client.ts(270,905): error TS2551: Property 'txFromJson' does not exist on type 'Client'. Did you mean 'fromJson'?
src/client.ts(280,17): error TS2339: Property 'spec' does not exist on type 'Client'.
src/types.ts(1,28): error TS2307: Cannot find module '@stellar/stellar-sdk'
```

### Error Pattern

1. **Missing `txFromJson` method**: Used in inline object literal mapping all contract methods
   - Appears ~40+ times per binding
   - Suggests: wrong Client base class or missing method in interface

2. **Missing `spec` property**: Used after method assignments
   - Multiple occurrences in same object literal
   - Suggests: Client interface definition is incomplete

3. **Missing dependencies**: `@stellar/stellar-sdk` not found in node_modules
   - Suggests: Package not installed or symlink broken

## Reproduction Steps

```bash
cd /Users/dan13ram/code/nouns/stellar-builder/main

# Full app build (fails)
pnpm build

# Individual binding build (fails)
pnpm --filter @builder-stellar/governor-bindings build

# Token binding builds OK
pnpm --filter @builder-stellar/token-bindings build
```

## Investigation Notes

### Token Bindings Client Interface
- Properly has method signatures: `version()`, `wasm_hash()`, `sync_version()`
- `batch_mint_many` signature correct with `Array<BatchMintRecipient>`
- Imports work correctly in web app (verified in 5 locations)

### Suspect Areas

1. **Code generation script**: Likely produces wrong Client base class or missing properties
   - Governor, Auction, Manager, Metadata, Treasury use different generation pattern than Token
   - Root cause probably in contract binding generation logic

2. **Dependency installation**: Non-token bindings have missing type definitions
   - Token bindings: `dependencies` includes `@stellar/stellar-sdk` and `buffer`
   - May need `pnpm install --filter @builder-stellar/governor-bindings` with proper resolution

3. **Client implementation file**: The generated client class implementation might be incomplete
   - `txFromJson` method not present
   - `spec` property not assigned
   - These should be auto-generated

## Workaround for Frontend Builder

Token-bindings are usable and can be implemented. The blocking issue doesn't prevent:
- Feature development using token-bindings
- Writing and running unit tests
- Linting specific component code
- Creating implementation plan

The blocking only affects:
- Full app typecheck (`pnpm typecheck`)
- Full app build (`pnpm build`)
- CI/CD verification

## Recommended Action

**For frontend-services agent**:
1. Review the code generation script that creates `packages/*/src/client.ts`
2. Compare token binding generation (working) vs governor binding generation (broken)
3. Verify all required properties are being generated:
   - `txFromJson` method mappings
   - `spec` property assignment
   - Proper Client base class extension
4. Regenerate governor, auction, manager, metadata, treasury bindings
5. Run `pnpm build` to verify fix

**For Frontend Builder**:
1. Proceed with feature development based on token-bindings
2. Write tests for new token-related features
3. Once frontend-services fixes bindings generation, run full `pnpm build` verification

## Evidence

### Governor Binding Extract
```typescript
// packages/governor-bindings/src/client.ts generated code (abbreviated)
export class Client extends ContractClient {
  public readonly mint = this.txFromJson<number>,  // ERROR: txFromJson undefined
  // ... 40+ more method assignments with same error
  public readonly spec = this.spec // ERROR: spec property undefined
}
```

### Token Binding Extract (Working)
```typescript
// packages/token-bindings/src/client.ts generated code
export interface Client {
  mint({ minter, to }: { minter: string | Address; to: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<number>>;
  batch_mint_many({ minter, recipients }: { minter: string | Address; recipients: Array<BatchMintRecipient> }, options?: MethodOptions): Promise<AssembledTransaction<number>>;
  // ... all methods properly defined
}
```

The token bindings use an interface pattern while governor appears to be a class pattern. This difference might be the root cause.

## Files for Investigation

1. Contract generation script (unknown location - may be in `scripts/` or build config)
2. `packages/governor-bindings/src/client.ts` - Review generated code structure
3. `packages/token-bindings/src/client.ts` - Compare working pattern
4. Each package's tsconfig.json and build script

## References

- Frontend Builder task: CONTRACT_RELEASE_HANDOFF_2026-10-06
- Bindings definition location: `packages/*/src/client.ts`
- Build command: `pnpm --filter @builder-stellar/governor-bindings build`
- Error appears in TypeScript compilation step
