# Manager Redesign

## Status

Approved design for the next clean testnet deployment. This replaces the
current Manager deployment; it is not a storage-compatible upgrade.

## Product Boundary

Builder deploys a DAO but does not own it. After launch, Builder has no
DAO registry entry, authority, or control over that DAO. The DAO's Treasury
and Governor control its modules. Builder's Manager remains only the platform
implementation registry, deployment factory, and upgrade-policy service.

Goldsky is the durable discovery and history layer. `DaoCreated` and
`DaoLaunched` are the canonical events for database/API projections.

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

- Manager owner/admin and any pending admin handover.
- The registered platform minter address.
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
    auction_payment_asset: Address,      // recorded at create_dao
    marketplace_payment_asset: Address,  // recorded at create_dao
}
```

`get_pending_dao(token_address)` exposes this state for launch recovery.

The entry exists only between successful `create_dao` and successful
`launch_dao`:

1. `create_dao` deploys all six deterministic modules and writes `PendingDao`
   atomically.
2. The launch administrator (already the owner of every module) configures each
   module in separate retriable transactions during the setup window, including
   token metadata and founder allocations.
3. `launch_dao` reads this one entry, calls `launch` on every module (ownership
   moves to Treasury), emits `DaoLaunched`, and deletes the entry.
4. A failed launch rolls back every cross-contract call, leaving the
   pending entry unchanged and available for retry.

The system must remove `DaoCreation`, `DaoCreationStorageParams`,
`DaoRegistration`, `DaoModules` (events now use `DaoAddresses`), `DaoMetadata`, `DaoList`, `DaoCount`,
`DaoStatus`, and the associated Manager read APIs. `NonceUsed` is also removed:
the deterministic deployed Token address already prevents reusing a successful
creator/nonce pair.

### Auction Policy

Auction is deployed for every DAO. `launch_auction` controls only whether
`launch_dao` starts it.

The Auction constructor always receives valid, non-optional configuration:

- launch-admin placeholder payment address;
- duration of at least 300 seconds;
- reserve price of at least 1,000 stroops;
- nonzero time buffer;
- Manager-selected 10% minimum bid increment.

`create_dao` also rejects a time buffer above 86,400 seconds, a quorum of 0, and
a proposal threshold of 0, and requires each of voting delay, voting period and
queue delay to be between 300 seconds and 2,592,000 seconds (30 days).

The launch administrator can change auction settings while the Auction is
paused, but the payment asset chosen at `create_dao` is recorded in
`PendingDao` and `launch_dao` fails (`PaymentTokenMismatch`) if the Auction's
asset differs. The Auction is owned by Treasury after launch, so DAO governance
can change its configuration and start it later.

### Creation and Launch Validation

`create_dao` validates factory state, implementation availability and the
initial configuration bounds above. It deploys modules with all wiring passed
to their constructors, so the launch administrator configures parameters but
never wires addresses.

Custom module WASMs remain valid: a Manager owner can register any WASM and
select it as current. A WASM hash cannot prove its contract interface on-chain.
The registered module role is administrator-attested and deployment/testing is
the compatibility gate.

`launch_dao(token_address, launch_config)` requires:

- the pending launch administrator's authorization;
- the launch administrator is still the Token owner (`Unauthorized`);
- token total supply > 0 (`LaunchSupplyZero`);
- the Auction and Marketplace payment assets still equal the ones recorded in
  `PendingDao`.

`LaunchConfig`:

```rust
LaunchConfig {
    launch_auction: bool,     // start the Auction (unpause and create the first auction)
    launch_marketplace: bool, // leave the Marketplace open; false forces it paused
    enable_minter: bool,      // grant mint authority to the admin-registered platform minter
}
```

The launch administrator cannot name a minter address. `enable_minter` uses the
address registered with `set_platform_minter` by the Manager admin and fails with
`PlatformMinterNotSet` if none is registered.

It then calls the one-shot, Manager-only `launch` on each module, in this order:

1. Token `launch(treasury, minters)` with minters = Treasury, Marketplace, plus
   Auction if `launch_auction` and the platform minter if `enable_minter`;
2. Governor `launch(treasury)`, Treasury `launch(treasury)`;
3. Marketplace `launch(treasury, open, expected_payment_asset)`;
4. Auction `launch(treasury, start, expected_payment_token)`;
5. Metadata `launch(treasury)`.

Each `launch` sets the module Live, hands ownership to Treasury (clearing any
pending two-step transfer), and emits `Launched`. A second call fails with
`AlreadyLive`, so the Manager has no authority over a launched DAO. `launch_dao`
then emits `DaoLaunched` (including `launch_auction`, `launch_marketplace`,
`enable_minter`) and deletes `PendingDao`. Any failure reverts every call.

Removed with this flow: `finalize_ownership` and `finalize_upgrade_authority`,
the wiring setters, the metadata `initialize` call (now a constructor), and
`enable_mint_authority_by_manager`.

### Admin and Platform Configuration

The Manager admin has a two-step handover (`propose_admin`, `accept_admin`;
`get_admin`, `get_pending_admin`; events `AdminProposed`, `AdminChanged`) and
registers the platform minter with `set_platform_minter` / `get_platform_minter`
(event `PlatformMinterSet`).

### Authority and Upgrades

Manager does not upgrade DAO modules. A DAO governance proposal authorizes an
upgrade, and the target module upgrades itself only when its DAO owner
authorizes it and Manager has approved the exact active `from_hash -> to_hash`
transition.

Every DAO module exposes a module-local upgrade entrypoint. Its upgrade flow is:

1. A governance proposal selects the target module and target WASM hash.
2. Anyone calls `treasury.execute` for the queued proposal. The Treasury calls
   `governor.consume` (which marks the proposal Executed and returns), then
   dispatches the actions with Treasury authorization. The Governor is no
   longer on the call stack at that point.
3. For a module other than the Treasury, the Treasury invokes the module's
   `upgrade` as the module owner. For the Treasury's own upgrade the action
   targets the Treasury; Soroban forbids re-entering a contract that is
   already on the stack, so the Treasury runs an internal allowlist
   (`self_dispatch`) instead of `invoke_contract`. That allowlist permits only
   `upgrade(from, to)` and `sync_version()`; anything else fails with
   `UnknownSelfCall` or `InvalidSelfCallArgs`.
4. The target module verifies that `from_hash` equals its locally stored current
   hash.
5. The target module asks Manager to validate the registered, active, approved
   transition and obtain the target implementation version
   (`common::upgrade::apply`).
6. The target module writes the target hash and version, emits its module
   upgrade event, and invokes `update_current_contract_wasm(to_hash)` on itself.

`Governor::execute` (the OpenZeppelin trait method) is retained but always fails
with `UseTreasuryExecute` (1508). There is no `Governor -> Treasury -> Governor`
call path. A Governor upgrade or owner-setter call is a Treasury action executed
after `consume` returns. A failing action reverts the whole `execute`
transaction, including the Executed mark, so the proposal stays Queued and can
be retried until it expires.

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

Use a String version value in Semantic Versioning format (e.g., "0.1.0"):

```rust
// Stored as String in both Manager and DAO modules
version: String  // e.g., "0.1.0", "0.2.0"
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

**Version Storage:**
- Manager stores its own `CurrentManagerVersion` via `ManagerKey::CurrentManagerVersion`
- Each DAO module stores version via their respective storage key:
  - Token: `TokenKey::CurrentVersion`
  - Governor: `GovernorKey::CurrentVersion`
  - Treasury: `TreasuryKey::CurrentVersion`
  - Auction: `DataKey::CurrentVersion`
  - Metadata: `DataKey::CurrentVersion`
  - Marketplace: `StorageKey::CurrentVersion`
- Version is set during module initialization/deployment and updated during upgrades

The database stores Manager and module address/hash/version as immutable
creation facts, then records upgrade events as an append-only history. Goldsky
must project these events without relying on an on-chain DAO registry.
Version parsing (String to structured versioning) happens in Goldsky/frontend,
not on-chain.

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
    deployment ledger, and verify `DaoCreated`, `DaoLaunched`, implementation,
   and upgrade projections.
7. Create one DAO with auctions enabled and one with auctions initially paused;
   verify launch recovery, final authority, event projections, version fields,
   and later Auction enablement.
8. Rehearse one state-preserving `0.1.x` upgrade for Manager and each DAO
   module before treating the release as the testnet baseline.

No production rollout is implied by this document.
