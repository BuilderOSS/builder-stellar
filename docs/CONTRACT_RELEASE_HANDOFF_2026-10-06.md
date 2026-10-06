# Contract Release Handoff — 2026-10-06

This handoff covers the contract changes in:

- `522b1f1 feat(token): add multi-recipient batch minting`
- `6cf3ba5 feat(contracts): add managed upgrade versioning`

The release manifest is [`releases/contracts.json`](../releases/contracts.json). All
modules are currently labelled `0.1.0`; the release label is recorded against the
installed WASM hash and is not, by itself, a deployment.

## Consumer impact

| Consumer | Required work | Release blocker |
| --- | --- | --- |
| Goldsky / indexer | Decode two new token events and add transform coverage. | Yes, before relying on the new events in indexed data. |
| Database | No schema migration is required for the generic decoded-event envelope. Add read-model changes only if product requirements expose batch-mint summaries or hook failures. | No. |
| Frontend / services | Regenerate/consume updated token and module bindings. Query versions directly on chain for upgrade status. | Yes for callers of `batch_mint_many`; otherwise no. |
| Deployment / governance | Use the managed upgrade script and execute the generated governance actions in order. | Yes for upgrades. |

## Token multi-recipient batch minting

### New public API

```text
batch_mint_many(minter: Address, recipients: Vec<BatchMintRecipient>) -> u32
BatchMintRecipient { to: Address, amount: u32 }
```

The method returns the final sequential token ID. It requires `minter`
authorization and existing mint authority, as with `mint` and `batch_mint`.

### Bounds and behavior

- The request must contain **1–16** recipient allocations.
- Each allocation amount must be non-zero.
- The sum of all allocation amounts must not exceed **100**.
- Duplicate recipients are allowed; their vote-checkpoint capacity is preflighted
  cumulatively before any token is minted.
- The transaction emits standard per-token `Mint` events, one `BatchMint` event
  per allocation, and one operation summary `BatchMintMany` event. It does not
  emit per-token `MintWithMinter` events.
- Existing `batch_mint` is unchanged and remains compatible.

Invalid allocation lists fail with `TokenError::InvalidBatchMintAmount` (`1101`).

### New token events

| Event | Topics | Data payload | Meaning |
| --- | --- | --- | --- |
| `BatchMintMany` | `minter` | `total_amount: u32`, `recipient_count: u32` | Summary for the entire multi-recipient operation. |
| `MetadataHookFailed` | `token_id` | none | The optional metadata hook failed for a minted token; minting itself succeeded. |

`BatchMintMany` does not identify recipients or token IDs. Use the accompanying
per-allocation `BatchMint` events and standard mint events when recipient-level
attribution is needed.

### Goldsky owner checklist

Update these files before treating the release as fully indexed:

1. `packages/goldsky/src/decoded-events.script.js`
   - Add `BatchMintMany: ['minter']` and `MetadataHookFailed: ['token_id']` to
     `topicNames`.
   - The existing token role matcher recognizes `BatchMintMany` because it begins
     with `BatchMint`. Add an explicit token-role route for
     `MetadataHookFailed` (or otherwise preserve its originating contract role):
     the current metadata matcher would incorrectly classify it as metadata-module
     data.
2. `packages/goldsky/src/activity-feed.script.js`
   - Decide whether `BatchMintMany` is public activity. If enabled, use a
     distinct `token.batch_mint_many` kind and a summary from `total_amount` and
     `recipient_count`.
   - Keep `MetadataHookFailed` administrative/system-visible unless product
     requirements explicitly surface non-fatal artwork failures to users.
3. `packages/goldsky/scripts/validate-events.mjs` and
   `packages/goldsky/test/event-coverage.test.mjs`
   - Add both event names to required/app-owned event coverage.
4. `packages/goldsky/test/dao-events-transform.test.mjs`
   - Add fixtures that verify topic extraction and token-role assignment for both
     events, including a token contract `MetadataHookFailed` fixture.

The generic `chain.decoded_events` envelope already has `topics`, `args`, and
`payload`; no SQL migration is necessary merely to retain these events.

## Managed module versioning and upgrades

### New query APIs

All managed modules expose:

```text
version() -> String
wasm_hash() -> BytesN<32>
sync_version() -> void
```

The Manager additionally exposes:

```text
get_implementation_version(wasm_hash: BytesN<32>) -> Option<String>
```

`sync_version` is owner-authorized and records the release version registered by
the Manager for the contract's active WASM hash. Module upgrades set the version
during `upgrade`; `sync_version` is included in the governance plan as an
idempotent verification/synchronization action.

### Security and compatibility behavior

- Upgrade approvals now require both WASM hashes to be registered, unrevoked,
  and for the **same module name**. Cross-module approvals are rejected.
- `set_current_implementations` verifies each supplied WASM hash belongs to its
  expected module type.
- New DAO deployment receives the registered module version rather than a
  hardcoded contract version.
- Manager and DAO deployment artifacts now record `versions` and `sourceCommit`.
- No upgrade/version-transition event was added. Indexers cannot derive the
  active version solely from events; query `version()` and `wasm_hash()` on-chain
  after an upgrade until a future additive event is introduced.

### Upgrade procedure

Build contracts first:

```bash
pnpm contracts:build
```

For a legacy Manager that predates `get_implementation_version`, verify its
active release and upgrade it first:

```bash
LEGACY_MANAGER_VERSION=<verified-active-manager-version> \
pnpm deploy:upgrade -- manager <network-config.json> <current-manager-wasm-hash>
```

For a DAO module:

```bash
pnpm deploy:upgrade -- <module> <dao-config.json> <network-config.json> <current-module-wasm-hash>
```

The module command installs the target WASM, registers it, and submits Manager
approval. It writes a DAO-specific upgrade plan to `deploys/`; DAO governance
must execute the generated actions in order:

1. `upgrade(from_hash, to_hash)`
2. `sync_version()`

Do not bypass this ordering. The manager must be migrated before its modules so
module upgrades can validate the registered target version.

## Frontend-services handoff

- Updated generated clients are under `packages/*-bindings/src/client.ts`.
- The token client includes `BatchMintRecipient` and `batch_mint_many`.
- All module clients include the version/hash/synchronization API specified above;
  the Manager client also includes `get_implementation_version`.
- Existing mint flows can keep calling `mint` or `batch_mint`; adopting the new
  method requires constructing the recipient vector and handling the same
  authorization/error path as batch minting.
- Do not display an indexed "active contract version" as authoritative until an
  on-chain read is incorporated or upgrade events are introduced in a later
  interface revision.

## Validation completed

- Contract suite: `pnpm contracts:test` — **167 tests passed** during the
  implementation work.
- Generated bindings were refreshed after the contract spec changed.

## Required handoffs

- **indexer-events:** Implement the Goldsky checklist above and run
  `pnpm indexer:test`.
- **frontend-services:** Consume regenerated bindings and decide which mint UI or
  service flow uses `batch_mint_many`; add direct version/hash reads where upgrade
  status is displayed.
- **docs-steward:** Keep this handoff and the deployment/Manager runbooks current
  as release versions advance or version-transition events are added.
