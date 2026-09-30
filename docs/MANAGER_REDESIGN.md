# Manager Redesign

## Status

Approved design for the next clean testnet deployment. This replaces the
current Manager deployment; it is not a storage-compatible upgrade.

## Product Boundary

Builder deploys a DAO but does not own it. After finalization, Builder has no
DAO registry entry, authority, or control over that DAO. The DAO's Treasury
and Governor control its modules. Builder's Manager remains only the platform
implementation registry, deployment factory, and upgrade-policy service.

Goldsky is the durable discovery and history layer. `DaoCreated` and
`DaoFinalized` are the canonical events for database/API projections.

## Phase 0: Manager

### Goals

- Keep Manager state small and bounded regardless of the number of DAOs.
- Make DAO creation recoverable across the multi-transaction setup flow.
- Reject revoked implementation WASMs before deployment.
- Preserve deterministic child addresses and support a later auction launch.
- Give the Manager owner a controlled Manager-WASM upgrade path.

### Non-goals

- An on-chain DAO directory, DAO lookup API, or DAO enumeration.
- Permanent Manager ownership or administration of deployed DAOs.
- Proving arbitrary custom WASM interfaces from a hash on-chain.

### Persistent Manager State

Only platform-wide state is permanent:

- Manager owner/admin.
- Factory pause state.
- Registered implementation hashes, semantic versions, publication state, and
  revocation state.
- Current implementation hashes for Token, Metadata, Auction, Governor,
  Treasury, and Marketplace.
- Approved module upgrade paths.
- Manager's own current WASM hash and semantic version.

The Manager must not persist a DAO registry, DAO list, DAO count, DAO creation
configuration, metadata configuration, or founder allocation details.

### Pending DAO State

`create_dao` writes one small per-DAO entry, keyed by the deterministic Token
address:

```rust
PendingDao {
    addresses: DaoAddresses,
    launch_admin: Address,
    expected_founder_supply: u32,
}
```

`get_pending_dao(token_address)` exposes this state for launch recovery.

The entry exists only between successful `create_dao` and successful
`finalize_dao`:

1. `create_dao` deploys all six deterministic modules and writes `PendingDao`
   atomically.
2. The launch administrator accepts Token ownership, configures Metadata, and
   mints the founder allocation in separate retriable transactions.
3. `finalize_dao` reads this one entry, validates launch readiness, transfers
   final authority, emits `DaoFinalized`, and deletes the entry.
4. A failed finalization rolls back every cross-contract call, leaving the
   pending entry unchanged and available for retry.

The system must remove `DaoCreation`, `DaoCreationStorageParams`,
`DaoRegistration`, `DaoModules`, `DaoMetadata`, `DaoList`, `DaoCount`,
`DaoStatus`, and the associated Manager read APIs. `NonceUsed` is also removed:
the deterministic deployed Token address already prevents reusing a successful
creator/nonce pair.

### Auction Policy

Auction is deployed for every DAO. `launch_auction` controls only whether
finalization unpauses it.

The Auction constructor always receives valid, non-optional configuration:

- payment SAC address;
- duration of at least 300 seconds;
- reserve price of at least 1,000 stroops;
- nonzero time buffer;
- Manager-selected 10% minimum bid increment.

When the creator chooses not to launch auctions, the UI supplies platform
defaults instead of displaying or requiring auction configuration. The default
payment asset is the network-native XLM SAC. The paused Auction transfers to
Treasury at finalization, so DAO governance can change its paused configuration
and enable it later.

### Creation and Finalization Validation

`create_dao` validates every constructor requirement before deployment. It
loads each current implementation through one helper that requires both a
registration and `revoked == false`.

Custom module WASMs remain valid: a Manager owner can register any WASM and
select it as current. A WASM hash cannot prove its contract interface on-chain.
The registered module role is administrator-attested and deployment/testing is
the compatibility gate.

`finalize_dao` requires:

- the pending launch administrator's authorization;
- Token ownership accepted by that launch administrator;
- Token total supply equal to `expected_founder_supply`;
- Auction still paused if `launch_auction` is false.

 It then grants Treasury and, conditionally, Auction and Marketplace mint
 authority; transfers Token, Governor, Treasury, Auction, and Marketplace
 ownership; transfers Metadata upgrade authority; emits `DaoFinalized`; and
 deletes `PendingDao`.

Use dedicated errors for a revoked current implementation and an incomplete
launch. Remove unused Manager error variants rather than retaining misleading
documented failures.

### Authority and Upgrades

Manager does not upgrade DAO modules. A DAO governance proposal authorizes an
upgrade, and the target module upgrades itself only when its DAO owner
authorizes it and Manager has approved the exact active `from_hash -> to_hash`
transition.

Every DAO module exposes a module-local upgrade entrypoint. Its upgrade flow is:

1. A governance proposal selects the target module and target WASM hash.
2. Governor dispatches every module upgrade through Treasury, including Governor
   and Treasury upgrades. The resulting `Governor -> Treasury -> Governor` and
   `Governor -> Treasury -> Treasury` call paths are intentional and must be
   covered by real-WASM integration tests before interface freeze.
3. The target module requires the DAO's Treasury/module-owner authority.
4. The target module verifies that `from_hash` equals its locally stored current
   hash.
5. The target module asks Manager to validate the registered, active, approved
   transition and obtain the target implementation version.
6. The target module writes the target hash and version, emits its module
   upgrade event, and invokes `update_current_contract_wasm(to_hash)` on itself.

Manager approval is a technical compatibility gate, not permission for Builder
to execute an upgrade. The DAO proposal and module-owner authorization remain
required for every DAO-local upgrade.

Manager itself is different: its configured owner/admin can upgrade it. Manager
stores its own current hash and semantic version. `upgrade_manager(from_hash,
to_hash)` requires owner authorization, checks `from_hash` against the stored
current hash, requires `to_hash` to be a registered, active Manager
implementation, writes the new hash/version, emits an upgrade event, and calls
`update_current_contract_wasm(to_hash)`.

This permits Manager evolution without granting Builder control over any DAO.

## Versioning

Every Manager and DAO module starts at semantic version **0.1.0**.

Use one contract-compatible version value:

```rust
ContractVersion { major: u16, minor: u16, patch: u16 }
```

The version is stored with each registered implementation and as the current
module version in every deployed module. Manager must expose an upgrade
validation method that returns the approved target version; modules must never
accept a caller-supplied version label. Upgrade events include module address,
module role, previous hash/version, target hash/version, and the DAO governance
proposal/action provenance where available.

The deployment artifact records:

- Manager address, WASM hash, and `0.1.0` version;
- the initial Token, Metadata, Auction, Governor, Treasury, and Marketplace
  hashes and `0.1.0` versions;
- deployment ledger and transaction hash.

The database stores Manager and module address/hash/version as immutable
creation facts, then records upgrade events as an append-only history. Goldsky
must project these events without relying on an on-chain DAO registry.

## Later Contract Phases

Apply the same rule to every DAO contract: retain only state needed to enforce
live protocol behavior; emit immutable history and query data for Goldsky.

### Phase 1: Token

- Audit every persistent and instance entry, especially checkpoints, approvals,
  mint authority, ownership transfer, and metadata references.
- Keep only data required for ownership, transfer, voting, minting, and upgrade
  authorization.
- Define TTL/archival behavior for historical voting checkpoints before removal
  or compaction.
- Record version/hash upgrades through events and test state-preserving
  upgrades from `0.1.0`.

### Phase 2: Metadata

- Keep artwork manifests and immutable mint seeds only where token rendering
  requires them.
- Continue placing artwork files and bulk asset data on IPFS.
- Audit property, item, IPFS-group, and per-token attribute storage for bounded
  growth and TTL correctness.
- Make Treasury the final Metadata upgrade authority.

### Phase 3: Auction

- Keep live auction, settlement, refund-claim, and paused configuration state.
- Move historical bids, settlements, and configuration history to events and
  Goldsky.
- Audit long-lived refund/claim storage and explicitly define expiry and
  permissionless maintenance.

### Phase 4: Governor

- Keep only live proposals, vote accounting, execution protections, and the
  historical checkpoints required for the supported voting window.
- Move proposal presentation, vote history, and activity feeds to Goldsky.
- Define proposal retention/archival and state-schema migration rules before
  changing storage.

### Phase 5: Treasury

- Keep assets, Governor authority, live execution state, and upgrade state.
- Move execution history and asset-activity views to Goldsky.
- Audit replay markers and any queued execution state for bounded retention.

Each phase requires a storage inventory, explicit TTL policy, upgrade
compatibility decision, unit tests, end-to-end tests, generated bindings, and a
testnet upgrade rehearsal before it becomes the next deployment baseline.

## Clean Testnet Rollout

1. Finish and test Phase 0 against a fresh local deployment.
2. Regenerate all contract bindings and event decoders.
3. Replace the testnet Manager with a fresh `0.1.0` deployment and fresh
   `0.1.0` module implementation WASMs.
4. Write a versioned deployment artifact and configure the frontend/indexer
   exclusively from that artifact.
5. Wipe the existing testnet read-model database before ingesting the new
   Manager events. Do not mix legacy and versioned deployment rows.
6. Apply the versioned database schema, start Goldsky from the new Manager
   deployment ledger, and verify `DaoCreated`, `DaoFinalized`, implementation,
   and upgrade projections.
7. Create one DAO with auctions enabled and one with auctions initially paused;
   verify launch recovery, final authority, event projections, version fields,
   and later Auction enablement.
8. Rehearse one state-preserving `0.1.x` upgrade for Manager and each DAO
   module before treating the release as the testnet baseline.

No production rollout is implied by this document.
