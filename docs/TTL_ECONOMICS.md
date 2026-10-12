# Storage, TTL and rent reference

Every ledger entry a Builder contract owns, how long it lives, who renews it and what that costs. The design
behind it is [STORAGE_DIET.md](STORAGE_DIET.md); this page is the operating reference and must change with any
storage layout change (the e2e test `protocol_runs_on_chain_state_only` fails when the inventory drifts).

Numbers are **testnet, measured 2026-10-12**. Rent rates move with the size of the network's live state, so
re-read them before quoting mainnet costs (`stellar network settings`, or the Renewal tab's quote).

## Live network limits

| Setting | Testnet value | What it bounds |
|---|---|---|
| `max_entry_ttl` | 3,110,400 ledgers (180 days) | The longest any extension can reach |
| `min_persistent_ttl` | 120,960 ledgers (7 days) | The TTL a new persistent entry or new code is born with |
| `tx_max_footprint_entries` | 400 | Keys in one renewal transaction |
| `tx_max_disk_read_entries` / `_bytes` | 200 / 200,000 | Entries and bytes one transaction reads (binds the sweep) |
| `tx_max_write_bytes` | 132,096 | Bytes one transaction writes (binds restores) |
| `tx_max_instructions` | 400,000,000 | CPU per transaction |
| `tx_max_contract_events_size_bytes` | 16,384 | Events plus return value per invocation |

Ledger time is estimated at 5 seconds, 17,280 ledgers per day, everywhere in the app and scripts.

## Rent

Rent is charged per byte of key plus value, for every ledger an entry's TTL is extended. An extension pays only
for the ledgers it adds: extending an entry that already has 170 days left to 180 days pays for 10 days.

**Measured rate: about 0.0098 XLM per KB per day** (simulated `ExtendFootprintTTL` of the Manager and the six DAO
0 instances, 884 and 6,420 bytes, from 167.7 to 180 days; both gave 98 stroops per byte-day). Shared contract code
has been more expensive per byte (a ~35 KB code entry cost ~300 XLM for ~110 days in October 2026), which is why
code never rides on a member's transaction for long (below).

| Size | 30 days | 120 days | 180 days | One year of upkeep |
|---|---|---|---|---|
| 1 KB | 0.29 XLM | 1.2 XLM | 1.8 XLM | 3.6 XLM |
| A DAO's six instances (6.4 KB) | 1.9 XLM | 7.5 XLM | 11.2 XLM | 23 XLM |
| Reference DAO sweep (117 KB, below) | 35 XLM | 138 XLM | 207 XLM | 420 XLM |

Creating a DAO pays the six new instances up to 170 days (about 10.6 XLM at this rate), because a new entry is
born at 7 days, under the 60-day instance threshold. The app's fee guard is therefore 50 XLM, not 10 (see
[Fee guard](#fee-guard)).

## TTL policy

| State | Extended to | When under | Source |
|---|---|---|---|
| Contract instances (module config, admin, wiring, `Live`, `CurrentHash`) | 170 days | 60 days | `common::ttl::extend_instance`, on every state-changing call |
| Shared contract code | 4 days | 2 days | `common::ttl::extend_instance` (code bumped separately, D27); the platform prepays 170 days |
| Persistent entries (`common::ttl::extend_persistent`) | 365 days, clamped to 180 | 30 days | Read or written by a contract call |
| Governor `ProposalTime(id)`, `ProposalId(seq)` | 120 days | 30 days | Covers the longest lifecycle (3 × 30-day delays + 14 days to execute) from one touch |
| Marketplace `Listing(id)`, `PrimaryListing(token)` | 30 days | 7 days | Expired listings can be cleared by anyone |
| OpenZeppelin entries (owners, balances, votes, checkpoints) | The library's own policy | | Extended when read or written |

A threshold well under the target means ordinary reads do not pay rent on every touch. Getters simulated by a
client are not transactions and renew nothing.

## Key reference

Every Builder key is namespaced: `(Symbol("buildeross"), [Symbol(Variant), args…])` (D30). OpenZeppelin keys keep
OZ's own shape. Off-chain code builds Builder keys with `apps/web/src/lib/storage-key.ts`, whose bytes are pinned
against the Rust encoding. The namespace adds 32 bytes per key.

"Sweep" means the DAO's renewal sweep covers the key. "Holder" means it renews when its owner acts and anyone
holding the key can restore it. Sizes are from the reference DAO below.

### Every module (`contracts/common`)

| Key | Class | Holds | Renewed by |
|---|---|---|---|
| `Admin` | instance | The module admin (launch admin, then the Treasury) | instance |
| `CurrentHash`, `StorageVersion` | instance | The running wasm hash and storage layout version; `version()` looks the hash up in the Manager registry | instance |
| `Live` | instance | Whether the DAO has launched | instance |

### Token

| Key | Class | Holds | Size | Renewed by |
|---|---|---|---|---|
| `MetadataContract`, `Manager`, `Treasury`, `Auction`, `Marketplace`, `Minter` | instance | Wiring; `Minter` is the shared Minter pinned at launch | | instance |
| `MintAuthority(addr)` | persistent | A mint grant (Treasury, Auction, Marketplace, Minter) | ~170 B | Sweep |
| OZ `Metadata`, `TokenIdCounter`, `NumTotalSupplyCheckpoints` | instance | Name, symbol, next id, checkpoint count | | instance |
| OZ `TotalSupplyCheckpoint(i)` | persistent | Supply history, binary-searched by votes | ~180 B each | Sweep (every one, D31) |
| OZ `Owner(t)`, `Balance(a)`, `Delegatee(a)`, `NumCheckpoints(a)`, `DelegateCheckpoint(a, i)`, `VotingUnits(a)` | persistent | Per-holder ownership and votes | | Holder |
| OZ `Approval(t)`, `ApprovalForAll(o, op)` | temporary | Approvals; expire by design | | Never renewed |

Supply checkpoints grow about one per auction day, so after roughly a year the sweep needs a second transaction;
the batch splitter handles it.

### Metadata

| Key | Class | Holds | Bound | Renewed by |
|---|---|---|---|---|
| `Settings` | instance | The token address and the renderer base `token_uri` points images at | ≤ 256-byte URL | instance |
| `Profile` | instance | `profile_hash` and `profile_seq` of the event-only profile JSON (≤ 4,096 bytes, in events only) | Fixed | instance |
| `ItemCounts`, `IpfsGroupCount` | instance | Item count per property (≤ 16), groups in use; all a mint reads | | instance |
| `Manager`, `Treasury` | instance | Wiring | | instance |
| `PropertyName(i)` | persistent | One property name (≤ 64 B) | ≤ 16 keys, ~150 B each | Sweep |
| `Items(property, page)` | persistent | Up to 32 items | ≤ 32 pages per property; ~1.6 KB for 19 items | Sweep |
| `IpfsGroups` | persistent | Every IPFS group (≤ 64) in one vector | 1 key, ~1.4 KB | Sweep |
| `AttributesPage(p)` | persistent | Trait indexes for 64 tokens | `total_supply / 64` keys, **~9.4 KB per full page** | Sweep |

Attribute pages are the largest class: 64 % of the reference sweep. Each token's traits are stored as a vector of
`u32` values, about 150 bytes per token.

### Governor

| Key | Class | Holds | Size | Renewed by |
|---|---|---|---|---|
| `Treasury`, `QueueDelay`, `Manager`, `ProposalCount` | instance | Wiring, settings, the proposal counter | | instance |
| `ProposalTime(id)` | persistent | Timing and status of one proposal | ~390 B | Sweep while live |
| `ProposalId(seq)` | persistent | The id of proposal `seq`, so proposals are listable from chain | ~170 B | Sweep while live |
| OZ `VotingDelay`, `VotingPeriod`, `ProposalThreshold`, `NumQuorumCheckpoints`, `TokenContract` | instance | Governance settings | | instance |
| OZ `QuorumCheckpoint(i)` | persistent | Quorum history | ~170 B each | Sweep (every one, D31) |
| OZ `ProposalVote(id)` | persistent | Vote tallies | | Sweep while live, when present |
| OZ `HasVoted(id, voter)` | persistent | One vote record | | Holder |

Ended proposals leave the sweep. Their entries archive in time; the id list then has gaps, which the chain-read
proposal list skips (`apps/web/src/lib/chain-reads/proposals.ts`).

### Treasury, Auction, Marketplace

| Key | Class | Holds | Renewed by |
|---|---|---|---|
| Treasury `Governor`, `Manager` | instance | Wiring | instance |
| Auction `Config`, `Auction`, `Manager`, `PaymentTokenLocked` | instance | Settings and the running auction | instance |
| Auction `PendingRefund(bidder)` | persistent | A refund the bidder can withdraw | Holder |
| Marketplace `Config`, `NextListingId` | instance | Settings and the listing counter | instance |
| Marketplace `Listing(id)`, `PrimaryListing(token)` | persistent | Open listings | Sweep while open |

### Minter (shared by every DAO)

| Key | Class | Holds | Renewed by |
|---|---|---|---|
| `Manager`, `CurrentHash`, `StorageVersion` | instance | Wiring and version | Platform |
| `MerkleRoot(token)` | persistent | `MerkleConfig { root, tree_uri }` for the DAO's current round; `tree_uri` is `ipfs://`, ≤ 256 B | Sweep |
| `MerkleRound(token)` | persistent | The round number | Sweep |
| `MerkleClaimed(token, round, recipient)` | persistent | One claim marker | Holder |

### Manager (platform)

| Key | Class | Holds | Renewed by |
|---|---|---|---|
| `Admin`, `FactoryPaused`, `Current*Wasm`, `CurrentManagerVersion` | instance | Platform admin, pause flag, current hashes | Platform |
| `Implementation(hash)`, `LatestImplementation(name)`, `UpgradeApproval(from, to)` | persistent | The registry `version()` and upgrades depend on | Platform (`renew-code-ttl.mjs`) |
| `PlatformMinter`, `PendingAdmin` | persistent | Shared Minter address, admin handoff | Platform |
| `PendingDao(token)` | persistent | A created DAO awaiting launch; removed at launch | Creator |
| `SlugToDao(slug)`, `DaoSlug(token)` | persistent | The DAO's `/dao` link, both directions | Sweep |

## The reference DAO

16 properties of 19 items, 500 tokens, 50 proposals of which 10 are live (e2e
`reference_dao_sweep_fits_one_transaction`, which prints this table):

| Class | Entries | Bytes |
|---|---|---|
| Six module instances | 6 | 6,372 |
| `AttributesPage` | 8 | 75,164 |
| `Items` | 16 | 25,008 |
| `ProposalTime` + `ProposalId` | 20 | 5,560 |
| `PropertyName` | 16 | 2,368 |
| `IpfsGroups` | 1 | 1,436 |
| `MintAuthority` | 4 | 688 |
| Slug (both keys) | 2 | 356 |
| OZ checkpoints (supply, quorum) | 2 | 352 |
| **Total** | **75** | **117,304** |

One `ExtendFootprintTTL` transaction holds it: 75 of 400 entries and 117 KB of the 200 KB read limit. A DAO with
roughly twice the tokens reaches the read-bytes limit first; the sweep then splits into a second transaction.

Other measured budgets on the same fixtures:

| Call | CPU | Write bytes | Entries read / written | Event bytes |
|---|---|---|---|---|
| `create_dao` with a 4 KB profile | 9.3 M | 6,168 | 25 / 9 | 7,380 |
| `propose`, 20 actions, longest description | 3.3 M | 1,692 | 12 / 4 | 6,856 |

## Who renews what

**The DAO: one sweep.** Manage → Storage renewal lists every key in the Sweep column from chain reads alone,
shows each class's earliest expiry, simulates the price for 30, 90, 180 or any number of days, and renews them in
one `ExtendFootprintTTL` transaction. Archived keys are restored first with `RestoreFootprint`, quoted the same
way. Anyone can renew; the signing wallet pays. The same logic runs on the command line:

```bash
node scripts/renew-dao.mjs --network testnet --token C... --days 90 --source <identity> [--dry-run]
```

Sources: [inventory and transactions](../apps/web/src/lib/chain-reads/renewal.ts),
[report and quote](../apps/web/src/lib/renewal-queries.ts), [tab](../apps/web/src/components/admin/renewal-panel.tsx),
[CLI](../apps/web/src/cli/renew-dao.ts).

**The platform: code, registry and the shared Minter.** Code is never in a DAO's sweep: seven ~35 KB code entries
alone exceed the 200 KB read limit. Contracts bump code only to 4 days when under 2, so if the platform's renewal
lapses a member pays a few days of code rent at most. The platform prepays 170 days:

```bash
node scripts/renew-code-ttl.mjs deploys/builder-testnet-manager.json --days 170
```

It builds its hash list from chain (the Manager's and Minter's `wasm_hash`, `get_latest_implementation` for every
module name, plus the artifact and any `--hash`), refuses durations at or under the 4-day code target, and also
extends each hash's `Implementation(hash)` record, the Manager instance and the shared Minter instance.
`deploy-manager.mjs` and `upgrade-contract.mjs` extend new code to 170 days at upload, since new code is born at 7
days. A platform dashboard is deferred (TODOS.md).

**Holders: on use.** Owners, balances, delegations, vote records, refunds and claim markers renew when the holder
acts. Anyone who knows the key can restore an archived one.

## Fee guard

Every app transaction signs through `signWithWallet`, which refuses a transaction whose maximum fee exceeds
**50 XLM** and explains that it would be paying shared code rent. The design called for 10 XLM, but creating a DAO
legitimately costs about 10 XLM of instance rent on testnet. Before D27 a single code bump cost ~300 XLM, well
above the guard. The Renewal tab passes the price the member already saw as the allowance.

stellar-sdk 17.1.0 counted the resource fee twice when `AssembledTransaction.sign` rebuilt a transaction, which
doubled every displayed Soroban fee and overflowed u32 above ~214 XLM. `patches/@stellar__stellar-sdk@17.1.0.patch`
fixes it; `apps/web/src/lib/fee/sdk-sign-fee.test.ts` fails if a new SDK version brings it back.

## Archival boundary

Extension and restoration are separate operations. A key the inventory expects but RPC does not return, or returns
with a past `liveUntilLedgerSeq`, is archived; the Renewal tab and `renew-dao.mjs` restore it before extending. A
restore needs the write-bytes budget (132,096 bytes), so a large archived DAO restores in several transactions.
`renew-code-ttl.mjs` extends but does not restore code; archived code needs a `RestoreFootprint` from the operator.

Per-holder rights such as refunds and claim markers are not deleted by archival: their owner or anyone holding the
key can restore them. Keep [SECURITY_MODEL.md](SECURITY_MODEL.md) and [MONITORING.md](MONITORING.md) aligned with
these limits.
