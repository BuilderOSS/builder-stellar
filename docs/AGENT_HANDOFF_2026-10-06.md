# Agent Handoff — 2026-10-06

This document provides targeted implementation requirements for three specialized agents working on the latest contract releases and system updates.

## Overview

Two contract features are complete and validated:
1. **Multi-recipient token batch minting** (`batch_mint_many`)
2. **Managed module versioning and upgrades**

Recent commits:
- `6cf3ba5 feat(contracts): add managed upgrade versioning`
- `522b1f1 feat(token): add multi-recipient batch minting`
- `89c2671 fix: handle missing Goldsky event indexes`

The handoff document [`CONTRACT_RELEASE_HANDOFF_2026-10-06.md`](./CONTRACT_RELEASE_HANDOFF_2026-10-06.md) provides full technical details.

---

## 1. Indexer Events (Goldsky) Agent

**Status**: Ready for implementation
**Owner**: `indexer-events` agent
**Blocking**: Database and Frontend agents

### Required Work

Update the Goldsky pipeline to decode and expose two new token contract events and metadata hook failures.

#### Task 1.1: Event Decoding (`packages/goldsky/src/decoded-events.script.js`)

Add topic mappings for the new events:

```javascript
topicNames: {
  // ... existing entries
  'BatchMintMany': ['minter'],
  'MetadataHookFailed': ['token_id'],
  // ... rest
}
```

**Key point**: The existing token-role matcher recognizes `BatchMintMany` (starts with `BatchMint`) but will **misclassify** `MetadataHookFailed` as metadata-module data. Add an explicit contract-role route to preserve its originating token contract context.

#### Task 1.2: Activity Feed (`packages/goldsky/src/activity-feed.script.js`)

Decide visibility for each event:

- **`BatchMintMany`**: Product decision. If enabled:
  - Use distinct activity kind: `token.batch_mint_many`
  - Create summary from `total_amount` and `recipient_count` fields
  - Include minter topic in activity attribution

- **`MetadataHookFailed`**: Keep as administrative/system-visible.
  - Only surface to users if product requirements explicitly demand it.
  - Mint operation succeeds even when metadata hook fails.

#### Task 1.3: Coverage Validation

Update test fixtures and validation scripts:

**File**: `packages/goldsky/scripts/validate-events.mjs`
- Add both event names to the required/app-owned event coverage list

**File**: `packages/goldsky/test/event-coverage.test.mjs`
- Add both event names to required coverage assertions

**File**: `packages/goldsky/test/dao-events-transform.test.mjs`
- Add fixtures validating topic extraction for both events
- Include a token contract `MetadataHookFailed` fixture to verify correct role assignment
- Verify `BatchMintMany` summaries match expected `total_amount` and `recipient_count`

#### Task 1.4: Validation

Run the test suite to confirm end-to-end correctness:

```bash
pnpm indexer:test
```

All tests must pass. If any fail, check:
1. Topic extraction order in `decoded-events.script.js`
2. Contract-role assignment for `MetadataHookFailed`
3. Event payload structure (fields: `total_amount`, `recipient_count` for `BatchMintMany`)

### Notes

- No SQL migration needed. The generic `chain.decoded_events` envelope already stores `topics`, `args`, and `payload`.
- Do not modify contract source code.
- Coordinate with `database-engineer` if read-model changes are needed.
- Coordinate with `frontend-services` if user-facing activity feed integration is required.

---

## 2. Database Engineer Agent

**Status**: Ready for review
**Owner**: `database-engineer` agent
**Blocking**: Frontend agent
**Blocked by**: Indexer Events agent completion

### Required Work

Validate and implement database read-model changes for new event coverage.

#### Task 2.1: Schema Review

The generic `chain.decoded_events` table already supports:
- `topics` (event topics extracted during decode)
- `args` (event-specific decoded arguments)
- `payload` (free-form event data)

No schema migration is strictly necessary to store the two new events.

**Decision point**: Determine whether product requirements demand dedicated read-model tables or views for:
1. Batch minting activity summaries
2. Metadata hook failures

If **no** product requirement exists, mark this task as complete with no migrations.

If **yes**, coordinate with `indexer-events` on:
- Which fields to expose (at minimum: `minter`, `total_amount`, `recipient_count`)
- View structure (separate `batch_mint_many_events` view or unified)
- Permission model (read-only access via `app_server` role)

#### Task 2.2: Permission Validation

Confirm that:
1. Goldsky writer role (`goldsky_writer`) can write to `chain.decoded_events`
2. Application read-only role (`app_server`) can read from views
3. No permission conflicts exist after Goldsky writes the new event rows

Verify with:
```sql
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'decoded_events';
```

#### Task 2.3: Query Plan Validation

If custom views are created, validate query performance:

```bash
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM batch_mint_many_events
WHERE deployment_id = $1 AND dao_id = $2
ORDER BY block_height DESC;
```

Ensure:
- Index scans on `deployment_id` and `dao_id` (no seq scans)
- No unnecessary table joins
- < 100 ms execution on production-scale data

#### Task 2.4: Rollback Artifacts

Document rollback procedure for any migrations:
1. Which tables/views are affected
2. Forward migration SQL
3. Rollback SQL (if not straightforward)
4. Data retention policy (keep decoded_events history)

### Notes

- Do not change Goldsky pipeline code.
- Do not edit frontend code.
- Preserve the `deployment_id` and `dao_id` filters in all queries.
- Use only read-only `app_server` role for schema queries; never grant write access to application code.
- Coordinate with `indexer-events` for backfill behavior if historical events are needed.

---

## 3. Frontend Builder Agent

**Status**: Ready for implementation
**Owner**: `frontend-builder` agent
**Blocked by**: Database and Indexer Events agents

### Required Work

Consume the new token contract bindings and implement UI for batch minting and metadata feedback.

#### Task 3.1: Binding Updates

The `contract-writer` agent regenerated all bindings during contract changes.

**File**: `packages/token-bindings/src/client.ts`

This file now includes:
- `BatchMintRecipient` type (for `{ to: Address, amount: u32 }`)
- `batch_mint_many(minter, recipients)` method
- Updated `TokenClient` exports

**Action**: Consume the regenerated binding in your UI layer. No manual type updates needed.

#### Task 3.2: Mint Flow Enhancement (Optional)

If product requirements support it, add a new UI flow for multi-recipient minting:

1. **Form Input**:
   - Array of recipient addresses and amounts
   - Validation: 1–16 recipients, sum ≤ 100, all amounts > 0
   - Duplicate recipient warning (allowed but cumulatively charged for vote capacity)

2. **Authorization**:
   - Use same authorization as existing `mint` and `batch_mint` methods
   - Verify `minter` authorization before submission

3. **Transaction Feedback**:
   - Display pending state during minting
   - On success: show final token ID (returned by `batch_mint_many`)
   - On error: handle `TokenError::InvalidBatchMintAmount` (code 1101)

4. **Activity Feed** (if Goldsky integration is enabled):
   - Display `BatchMintMany` summary from activity feed
   - Show recipient count and total amount
   - Link to individual `BatchMint` events for recipient-level details

**Note**: Existing `batch_mint` and `mint` flows remain unchanged. You can migrate incrementally.

#### Task 3.3: Version Display (Product Dependent)

Module versions are now queryable via three new methods on all managed modules:
- `version()` -> String (release version)
- `wasm_hash()` -> BytesN<32> (active WASM hash)
- `sync_version()` -> void (owner-authorized sync, idempotent)

Manager also exposes:
- `get_implementation_version(wasm_hash)` -> Option<String>

**Action**: If your UI displays active module versions or upgrade status:
1. Query `version()` and `wasm_hash()` directly on-chain after upgrades
2. Do **not** rely on indexed "active version" as authoritative (no upgrade events yet)
3. Display version alongside WASM hash for debugging

**Do not** add indexed version as a source of truth until upgrade events are introduced in a future release.

#### Task 3.4: UI State & Error Handling

Verify the following states are handled:

1. **Loading**: Show spinner during token retrieval and minting
2. **Empty**: No token data available (user hasn't minted)
3. **Error**: Authorization failure, invalid batch allocation, or network error
   - `TokenError::InvalidBatchMintAmount` (1101): Show validation feedback
   - Authorization: Show signer requirement
   - Network: Show retry option
4. **Success**: Confirm token ID(s), display on-chain version if queried
5. **Pending**: Show transaction hash and block confirmation progress

#### Task 3.5: Test Coverage

Run relevant frontend tests:
```bash
pnpm --dir apps/web test
pnpm lint
pnpm typecheck
pnpm build
```

Ensure:
- Type checks pass against updated bindings
- No lint errors in new batch-minting flows
- Build completes without warnings

### Notes

- Only consume documented contracts from `frontend-services`
- Do not implement unverified contract behavior
- Report any missing API fields to `frontend-services` agent
- Batch minting is optional; existing flows work without changes
- Do not query contract directly for indexed data; use API endpoints

---

## Implementation Sequence

1. **Start**: `indexer-events` completes event decoding and transforms
2. **Then**: `database-engineer` validates schema and confirms no migrations needed (or implements if required)
3. **Finally**: `frontend-builder` consumes bindings and implements optional UI enhancements

All three agents can work independently on discovery tasks, but `database-engineer` and `frontend-builder` should await `indexer-events` completion before merging to main.

---

## Validation Checklist

- [ ] `indexer-events`: `pnpm indexer:test` passes all tests
- [ ] `database-engineer`: Query plan validated; rollback procedure documented
- [ ] `frontend-builder`: `pnpm --dir apps/web test` and `pnpm build` pass
- [ ] No merge conflicts in `packages/` or `apps/web/src/`
- [ ] All agents document handoff to next owner (if needed)

---

## Related Documents

- [CONTRACT_RELEASE_HANDOFF_2026-10-06.md](./CONTRACT_RELEASE_HANDOFF_2026-10-06.md) — Full contract technical details
- [GOLDSKY_MULTITENANT_INTEGRATION.md](./GOLDSKY_MULTITENANT_INTEGRATION.md) — Pipeline integration reference
- [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) — Complete schema and permission reference
- [README.md](./README.md) — Documentation index

---

**Handoff Date**: October 6, 2026
**Prepared by**: Contract Writer Agent
**Status**: Ready for distribution
