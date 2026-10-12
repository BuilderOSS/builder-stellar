# Storage, TTL and rent reference

Every ledger entry a Builder contract owns, how long it lives, who renews it and what that costs. The design
behind it is [STORAGE_DIET.md](STORAGE_DIET.md); this page is the operating reference and must change with any
storage layout change (the e2e tests `protocol_runs_on_chain_state_only` and
`a_dao_kept_alive_by_the_sweep_alone_works_after_a_year` fail when the inventory drifts).

Numbers are **testnet, measured 2026-10-12**. Rent rates move with the size of the network's live state, so
re-read them before quoting mainnet costs (`stellar network settings`, the Renewal tab's quote, or
`renew-code-ttl.mjs --dry-run`).

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
| Transaction fee | u32: 4,294,967,295 stroops (~429 XLM) | The most one transaction can pay |

Ledger time is estimated at 5 seconds, 17,280 ledgers per day, everywhere in the app and scripts.

## Rent

Rent is charged per byte of key plus value, for every ledger an entry's TTL is extended. An extension pays only
for the ledgers it adds: extending an entry that already has 170 days left to 180 days pays for 10 days. So rent
is linear in time: renewing for 180 days twice costs the same as renewing for 30 days twelve times, less the
per-transaction overhead. The Renewal tab defaults to 180 days for that reason.

| Entry kind | Measured rate | How |
|---|---|---|
| Contract data and instances | **~0.0098 XLM per KB per day** | Simulated `ExtendFootprintTTL` of the Manager and the six DAO 0 instances (884 and 6,420 bytes, 167.7 → 180 days): 98 stroops per byte-day |
| Contract code | **~0.051 XLM per KB per day** | A 35,604-byte code entry for ~164 days simulated at 2,998,799,289 stroops (STORAGE_DIET_REVIEW § 3): 514 stroops per byte-day, about five times data |

| What | 30 days | 120 days | 180 days | One year of upkeep |
|---|---|---|---|---|
| 1 KB of data | 0.29 XLM | 1.2 XLM | 1.8 XLM | 3.6 XLM |
| A DAO's six instances (6.4 KB) | 1.9 XLM | 7.5 XLM | 11.2 XLM | 23 XLM |
| Reference DAO sweep (32 KB, below) | 9.5 XLM | 38 XLM | 57 XLM | **~115 XLM** |
| One token's artwork record (~19 B) | | | | ~0.07 XLM |

The reference sweep was 117 KB (~420 XLM a year, plus ~240 XLM a year more for every year of daily auctions)
before D32–D38 (below). Who pays which part of all this, role by role, is in [STORAGE_COSTS.md](STORAGE_COSTS.md).

Creating a DAO pays the six new instances up to 170 days (about 10.6 XLM at this rate), because a new entry is
born at 7 days, under the 60-day instance threshold. The app's fee guard is therefore 50 XLM, not 10 (see
[Fee guard](#fee-guard)).

## TTL policy

| State | Extended to | When at or under | Source |
|---|---|---|---|
| Contract instances (module config, admin, wiring, `Live`, `CurrentHash`) | 170 days | 60 days | `common::ttl::extend_instance`, on every state-changing call |
| Shared contract code | 4 days | 2 days | `common::ttl::extend_instance` (code bumped separately, D27); the platform prepays 170 days |
| Persistent entries (`common::ttl::extend_persistent`) | 365 days, clamped to the network maximum | 30 days | Read or written by a contract call |
| Governor `ProposalTime(id)`, `ProposalId(seq)` | 120 days | 30 days | Covers the longest lifecycle (3 × 30-day delays + 14 days to execute) from one touch |
| Marketplace `Listing(id)`, `PrimaryListing(token)` | 30 days | 7 days | Expired listings can be cleared by anyone |
| OpenZeppelin owners, balances, votes, checkpoints | 30 days | 29 days | The library, when the entry is read or written |
| Asset contract (SAC) balances | 30 days | 29 days | The host, when the balance is read or written |

The host extends when the TTL is at or below the threshold (`common` test `thresholds_include_their_bound`). A
threshold well under the target means ordinary reads do not pay rent on every touch. Getters simulated by a client
are not transactions and renew nothing.

## Key reference

Every Builder key is namespaced: `(Symbol("builder"), [Symbol(Variant), args…])` (D30, D37). OpenZeppelin keys
keep OZ's own shape. Off-chain code builds Builder keys with `apps/web/src/lib/storage-key.ts`, whose bytes are
pinned against the Rust encoding. The namespace adds 28 bytes per key and no host allocation (the symbol stays
inline in a `Val`). Each crate's `storage::key_samples` lists every
variant through an exhaustive match, and its `storage_keys_do_not_collide` test keeps Builder enums disjoint.

"Sweep" means the DAO's renewal sweep covers the key. "Holder" means it renews when its owner acts and is restored
by the app before the owner's next transaction (see [Archived member state](#archived-member-state)). Sizes are
from the reference DAO below.

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
| OZ `TotalSupplyCheckpoint(i)` | persistent | Supply history | ~180 B each | Sweep: **the latest only** (D33) |
| OZ `Owner(t)`, `Balance(a)` held by the Treasury, Auction or Marketplace | persistent | The DAO's own tokens | ~130 B | Sweep (holdings) |
| OZ `Owner(t)`, `Balance(a)`, `Delegatee(a)`, `NumCheckpoints(a)`, `DelegateCheckpoint(a, i)`, `VotingUnits(a)` of members | persistent | Per-member ownership and votes | | Holder |
| OZ `Approval(t)`, `ApprovalForAll(o, op)` | temporary | Approvals; expire by design | | Never renewed |

`token_uri` checks existence by the id counter, not `Owner(t)`, so a member's token keeps rendering after their
30-day ownership entry archives.

### Metadata

| Key | Class | Holds | Bound | Renewed by |
|---|---|---|---|---|
| `Settings` | instance | The token address and the renderer base `token_uri` points images at | ≤ 256-byte URL | instance |
| `Profile` | instance | `profile_hash` and `profile_seq` of the event-only profile JSON (≤ 4,096 bytes, in events only) | Fixed | instance |
| `ItemCounts`, `IpfsGroupCount` | instance | Item count per property (≤ 16), groups in use; all a mint reads | | instance |
| `Manager`, `Treasury` | instance | Wiring | | instance |
| `PropertyNames` | persistent | Every property name (≤ 16 × 64 B), in one entry | ~460 B for 16 | Sweep |
| `Items(property, page)` | persistent | Up to 32 items: their names, plus one byte each for the IPFS group | ≤ 32 pages per property; ~580 B for 32 short names | Sweep |
| `IpfsGroups` | persistent | Every IPFS group (≤ 64) in one vector | ~1.4 KB | Sweep |
| `AttributesPage(p)` | persistent | Packed trait records of 64 tokens | one per 64 minted tokens; **~1.2 KB per full page** | Sweep |

An attribute record is a header byte (the trait count; the high bit marks two-byte indexes, needed only past 256
items in a property) and one byte per trait: 17 bytes for 16 traits. Every mint writes its token's record, empty
until artwork exists, so the pages up to the minted count always exist and an archived one is detectable (D32).

### Governor

| Key | Class | Holds | Size | Renewed by |
|---|---|---|---|---|
| `Treasury`, `QueueDelay`, `Manager`, `ProposalCount` | instance | Wiring, settings, the proposal counter | | instance |
| `ProposalTime(id)` | persistent | `(proposer, 49 packed bytes)`: snapshot, window, eta, state, seq and the quorum fixed at creation (D38) | ~270 B | Sweep while live |
| `ProposalId(seq)` | persistent | The id of proposal `seq`, so proposals are listable from chain | ~170 B | Sweep while live |
| OZ `VotingDelay`, `VotingPeriod`, `ProposalThreshold`, `NumQuorumCheckpoints`, `TokenContract` | instance | Governance settings | | instance |
| OZ `QuorumCheckpoint(i)` | persistent | Quorum rate history | ~170 B each | Sweep: **the latest only** (D33) |
| OZ `ProposalVote(id)` | persistent | Vote tallies; OZ renews it 30 days per vote or queue, the sweep to the full term while live | | Sweep while live, when present |
| OZ `HasVoted(id, voter)` | persistent | One vote record, 30 days | | Holder |

Each proposal stores its quorum when it is created, from the voting supply at the previous ledger (the snapshot
ledger, read from the two latest checkpoints only) and the current rate, so `proposal_state`, `queue` and
`execute` never look up historical checkpoints. Old ones may archive; the `quorum(ledger)` view for a past
ledger then needs them restored. Ended proposals leave the sweep; the id list then has gaps. **A contract call
that reads an archived key fails as a whole**, so `proposal_ids(start, limit)` fails for any page holding an
archived id; chain-reading clients read the `ProposalId(seq)` entries raw with `getLedgerEntries` instead
(`apps/web/src/lib/chain-reads/proposals.ts`), where an archived entry is simply absent.

### Treasury, Auction, Marketplace

| Key | Class | Holds | Renewed by |
|---|---|---|---|
| Treasury `Governor`, `Manager` | instance | Wiring | instance |
| Auction `Config`, `Auction`, `Manager`, `PaymentTokenLocked` | instance | Settings and the running auction | instance |
| Auction `PendingRefund(bidder)` | persistent | A refund the bidder can withdraw | Holder |
| Marketplace `Config`, `NextListingId` | instance | Settings and the listing counter | instance |
| Marketplace `Listing(id)`, `PrimaryListing(token)` | persistent | Open listings | Sweep while open |
| Asset `Balance(treasury|auction|marketplace)` on the auction's and market's payment assets and on every open listing's asset | persistent (SAC) | The DAO's funds and escrow in the assets it trades in | Sweep (holdings) |
| Asset `Balance(treasury)` on any other asset (donations, fees in a former payment asset) | persistent (SAC) | Funds the inventory cannot discover from chain | Restored when a proposal spends them (the proposal page restores before signing); add them to the sweep with `renew-dao.mjs --asset` |

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
| `ManagerAdmin`, `FactoryPaused`, `Current*Wasm`, `CurrentManagerVersion` | instance | Platform admin, pause flag, current hashes | Platform |
| `Implementation(hash)`, `LatestImplementation(name)` | persistent | The registry `version()` reads, and each name's latest | Platform (`renew-code-ttl.mjs`) |
| `PlatformMinter` | persistent | The shared Minter `launch_dao` pins | Platform |
| `UpgradeApproval(from, to)`, `PendingAdmin` | persistent | Approved upgrade paths, an admin handoff | Used soon after they are written; restore an old one if needed |
| `PendingDao(token)` | persistent | A created DAO awaiting launch; removed at launch | Sweep (listed while the DAO has no slug, so a long setup is renewable from the same tab) |
| `SlugToDao(slug)`, `DaoSlug(token)` | persistent | The DAO's `/dao` link, both directions | Sweep |

## The reference DAO

16 properties of 19 items, 500 tokens, 50 proposals of which 10 are live, one token and one balance held by the
DAO (e2e `reference_dao_sweep_fits_one_transaction`, which prints this table):

| Class | Entries | Bytes | Before D32–D38 |
|---|---|---|---|
| Six module instances | 6 | 6,188 | 6,372 |
| `AttributesPage` | 8 | 9,592 | 75,164 |
| `Items` | 16 | 8,560 | 25,008 |
| `ProposalTime` + `ProposalId` | 20 | 4,320 | 5,560 |
| `PropertyNames` | 1 | 452 | 2,368 (16 keys) |
| `IpfsGroups` | 1 | 1,432 | 1,436 |
| `MintAuthority` | 4 | 672 | 688 |
| DAO holdings (`Owner`, `Balance`) | 2 | 264 | not covered |
| Slug (both keys) | 2 | 348 | 356 |
| Latest supply and quorum checkpoints | 2 | 352 | 352, growing ~180 B per auction day |
| **Total** | **62** | **32,180** | **117,304** |

One `ExtendFootprintTTL` transaction holds it: 62 of 400 entries and 32 KB of the 200 KB read limit. At about 19
bytes per token, roughly 9,000 tokens fit before the read limit splits the sweep into a second transaction, and
the sweep no longer grows with time. Tokens the DAO itself keeps (unsold lots the Treasury holds) add ~130 bytes
each on top of that, so a DAO that accumulates unsold tokens reaches the limit sooner. Listing the inventory for
a large DAO reads every ownership entry (one `getLedgerEntries` call per 100 tokens).

Other measured budgets on the same fixtures:

| Call | CPU | Write bytes | Entries read / written | Event bytes |
|---|---|---|---|---|
| `create_dao` with a 4 KB profile | 9.2 M | 6,024 | 25 / 9 | 7,380 |
| `propose`, 20 actions, longest description | 3.3 M | 1,536 | 12 / 4 | 6,856 |

## Who renews what

**The DAO: one sweep.** Manage → Storage renewal lists every key in the Sweep column from chain reads alone,
shows each class's earliest expiry, simulates the price for 30, 90, 180 (the default) or any number of days, shows
what a year costs at that rate, and renews them in one `ExtendFootprintTTL` transaction. Archived keys, including
ones the RPC returns with a past live-until, are restored first with `RestoreFootprint`, quoted the same way.
Anyone can renew; the signing wallet pays. A DAO that wants to reimburse the renewer does it by proposal. The same
logic runs on the command line:

```bash
node scripts/renew-dao.mjs --network testnet --token C... --days 180 --source <identity> [--dry-run]
```

The e2e test `a_dao_kept_alive_by_the_sweep_alone_works_after_a_year` keeps an idle DAO alive with nothing but
this sweep (and the platform renewal) every 150 days while archiving everything else that expires. After a year it
settles an auction, a new member proposes and executes a Treasury spend, a year-old claim round is claimed, and an
old token renders. Its negative control shows an idle Treasury balance archiving when holdings are left out.

Sources: [inventory and transactions](../apps/web/src/lib/chain-reads/renewal.ts),
[report and quote](../apps/web/src/lib/renewal-queries.ts), [tab](../apps/web/src/components/admin/renewal-panel.tsx),
[CLI](../apps/web/src/cli/renew-dao.ts).

**The platform: code, registry and the shared Minter.** Code is never in a DAO's sweep: seven ~35 KB code entries
alone exceed the 200 KB read limit. Contracts bump code only to 4 days when under 2, so if the platform's renewal
lapses a member pays a few days of code rent at most. The platform prepays 170 days:

```bash
node scripts/renew-code-ttl.mjs deploys/builder-testnet-manager.json --days 170 [--token C...] [--dry-run]
```

It finds code from the Manager's `current_implementations()` and each name's latest implementation, the Manager's
and Minter's running `wasm_hash()`, and what every known DAO module runs (DAO deploy artifacts, `--token`, or the
indexer's `manager.module_versions` with `DATABASE_URL`), so a DAO that skipped an upgrade keeps its code alive. It
also renews each hash's `Implementation(hash)` record, every `LatestImplementation(name)`, `PlatformMinter`, and the
Manager and Minter instances.

Code rent is the platform's largest cost: a dry run on 2026-10-12 quoted about 900 XLM to bring nine code hashes
to 170 days (Auction 264 XLM, Marketplace 251 XLM, Governor ~300 XLM). Every extension is simulated first; one
whose resource fee would exceed 300 XLM (70 % of the u32 fee cap) is done in steps (the Governor's in that dry run:
102 days for 178 XLM, then the rest). `deploy-manager.mjs` and `upgrade-contract.mjs` extend new code to 170 days
at upload the same way, since new code is born at 7 days. A platform dashboard is deferred (TODOS.md).

**Members: on use.** A member's ownership, balance, vote and claim entries renew for 30 days whenever they act.

## Archived member state

A member back after more than a month may find their entries archived. The app restores them before the
member's transaction, with one extra wallet signature and a small fee:

- calls the app builds in the browser (votes, proposals, admin actions, bids, artwork, slug, upgrades) set the
  SDK's `restore` option (`restoreArchivedState`), so a `RestoreFootprint` runs first;
- server-prepared flows (token actions, marketplace, claims, Treasury funding) return an unsigned
  `RestoreFootprint` with status 409 (`code: restore-required`); the client signs and submits it, waits, and
  prepares again (`withArchivedRestore`).

Sources: [restore-required.ts](../apps/web/src/lib/restore-required.ts),
[restore-archived-client.ts](../apps/web/src/lib/restore-archived-client.ts).

## Fee guard

Every app transaction signs through `signWithWallet`, which refuses a transaction whose maximum fee exceeds
**50 XLM** and explains that it would be paying shared code rent. The design called for 10 XLM, but creating a DAO
legitimately costs about 10 XLM of instance rent on testnet. Before D27 a single code bump cost ~300 XLM, well
above the guard. The Renewal tab passes the price the member already saw as the allowance.

stellar-sdk 17.1.0 counted the resource fee twice when `AssembledTransaction.sign` rebuilt a transaction, which
doubled every displayed Soroban fee and overflowed u32 above ~214 XLM. `patches/@stellar__stellar-sdk@17.1.0.patch`
fixes it; `apps/web/src/lib/fee/sdk-sign-fee.test.ts` fails if a new SDK version brings it back. Reported
upstream as [stellar/js-stellar-sdk#1807](https://github.com/stellar/js-stellar-sdk/issues/1807) with fix
[#1808](https://github.com/stellar/js-stellar-sdk/pull/1808); drop the patch once a release includes it.

## Archival boundary

Extension and restoration are separate operations. A key the inventory expects but RPC does not return, or returns
with a past `liveUntilLedgerSeq`, is archived; the Renewal tab and `renew-dao.mjs` restore it before extending. A
restore needs the write-bytes budget (132,096 bytes), so a large archived DAO restores in several transactions.
`renew-code-ttl.mjs` extends but does not restore code; archived code needs a `RestoreFootprint` from the operator.

Per-holder rights such as refunds and claim markers are not deleted by archival: their owner or anyone holding the
key can restore them. Keep [SECURITY_MODEL.md](SECURITY_MODEL.md) and [MONITORING.md](MONITORING.md) aligned with
these limits.
