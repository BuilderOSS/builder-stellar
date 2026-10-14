# Storage diet: chain-complete operation, smaller hot state, one-sweep renewal

Status: **APPROVED 2026-10-12 (design), engineering review 2026-10-12 applied; implemented on `feat/markdown-text`; testnet redeploy pending.** Revised 2026-10-12. Supersedes the two earlier drafts (the
event-only diet and the compaction rewrite) and their ledgers. It does not authorize a deployment or a database
reset; the testnet redeploy needs its own go-ahead.

## 1. The rules

1. **Chain-complete operation.** Someone must be able to create and operate a DAO with nothing but public RPC, the
   contract addresses (or the Manager plus a slug), the published interfaces and their own keys. A new client
   must be able to resume an existing DAO from current or restorable chain state: setup, artwork, minting,
   auctions, market, proposals through execution, upgrades and renewal. No frontend, indexer, database, hosted
   API or event archive is required. The indexer is a read cache for discovery, feeds, galleries and history.
   The rule is about **operation**: every write, every executable flow and every input they need. Display text
   (the DAO profile, proposal descriptions, comments) is recoverable from events and the indexer only, and its
   absence never blocks an operation (see the exceptions below).
2. **Pay for what a flow reads.** DAOs pay rent and read bytes for every byte in their instance and persistent
   entries. State that no contract flow reads is display data and goes to events. State a flow reads stays, in
   the cheapest layout that keeps every existing operation and its authority.
3. **One-sweep renewal.** A DAO renews every contract and every entry it owns in one action from the app or a
   script, choosing how long to extend, with the expiry dates and a simulated cost shown before signing, and
   restores archived entries the same way. That requires every DAO-owned key to be enumerable from chain. No
   per-contract bump entrypoints. The design target is **one signature**: the DAO-owned key set is laid out to
   fit one `ExtendFootprintTTL` transaction (§ 7). The platform has the same view and action for its own state.

**Three explicit exceptions.**
- *Merkle claims* need a proof computed off-chain from the claim list. Claims are merkle-only (the on-chain
  allowlist is removed). Every root is published with its full tree at an on-chain `tree_uri` (§ 4 Minter), so a
  claimer needs the pinned file or the organizer, never our servers; the file is verified against the root before
  any claim is offered. This is the one place an operation needs something no RPC read can give.
- *Display text* (profile description, links and image; proposal descriptions; comments) lives in events. A fresh
  client with no event archive sees `profile_hash()` and `profile_seq()` only and shows "profile unavailable";
  the DAO re-publishes it with one `update_profile` call or proposal, which emits the text again. The same holds
  for a proposal whose description event is gone: it can still be voted, and queued or executed by whoever holds
  its preimage, and the proposer can re-post the text as a comment.
- *Proposal preimages.* `queue` and `execute` need `targets/functions/args/description_hash` again; the chain
  keeps the proposal's id, state and timing, not its inputs. The proposer, a frontend reading the indexer, or
  anyone who read `ProposalCreated` holds them. A passed proposal whose preimage is lost is re-proposed.

**Known gap, accepted (the third exception).** The Governor stores proposal status and timestamps only
(`contracts/governor/src/storage.rs:125-148`); `queue` and `execute` take `targets/functions/args/description_hash`
again and recompute the id (`contract.rs:518-530`, `720-728`). Storing the preimage would cost the proposer
1.7–22 XLM of rent per proposal (D10) for a recovery path events and the proposer already provide. What this
release adds is an on-chain **id list** so a client can find every proposal and read its state from chain.

## 2. What a DAO pays for today

| Entry class | Where | Renewed by | Enumerable from chain? |
|---|---|---|---|
| Module instances (config, admin, wiring, `Live`, hashes, version string) | 7 modules, instance | Every call bumps its own instance (170 d target) | Yes: the 7 addresses |
| Shared WASM code | per implementation hash | Platform (`scripts/renew-code-ttl.mjs`) | Yes: registry |
| Metadata `Settings` with 4 display strings | instance, loaded on every mint | as above | n/a |
| Artwork: property headers (name + count), items, IPFS groups | Metadata persistent, one key per item | `bump_artwork_ttl` windows from the admin panel | Yes, from counts |
| Per-token attributes, owner, approval | Metadata/Token persistent per token | On use (OZ extends ownership on read) | Yes, by token id |
| Balances, delegations, vote checkpoints | Token persistent per holder | On use | No (per holder) |
| Proposals (core only) | Governor persistent, 120 d target | On lifecycle calls | **No**: ids live in events only |
| Vote records (`HasVoted`) | Governor persistent per voter | On use | No (per voter) |
| Listings, primary listings | Marketplace persistent, 30 d | On use; anyone can expire | Yes: `next_listing_id`, per token |
| Pending refunds | Auction persistent per bidder | On use | No (per bidder) |
| Claim markers, roots, rounds | Minter persistent | On use | Roots/rounds yes; markers per claimer |
| Slug entries | Manager persistent per DAO | `bump_slug_ttl` | Yes |

Per-holder entries (balances, checkpoints, refunds, vote records, claim markers) renew when the holder acts and
are restorable by anyone; the sweep covers everything else. Nothing in this plan deletes any class above except
the allowlist markers and the four display strings, which § 4 removes.

## 3. Decisions

| Topic | Decision |
|---|---|
| DAO profile (description, links, image) | **Event-only JSON** (§ 6) with `ProfileState { hash, seq }` on-chain and compare-and-swap updates. The four display strings and their setters are removed from Metadata. |
| `renderer_base` | **Stays on-chain.** `token_uri` needs it. |
| `token_uri` | **On-chain `data:` JSON** (§ 5), built from on-chain names like the Nouns Builder Solidity renderer, without embedded layer URLs (compositors derive them from the per-trait getters). Collection level: SEP-50 has only `name` and `symbol`; nothing more is stored. |
| Artwork names, items, groups, attributes | **Stay on-chain**, laid out for one-transaction renewal: item counts hot; items in pages of 32 per property (`Items(property_id, page)`, ≤ 32 pages per property) instead of one key per item; one `IpfsGroups` vector; attributes paged 64 tokens per key. Public getters keep their shapes. No hash chain, no event-only artwork. |
| SEP-50 completion (G1) | **In this release**: `name`, `symbol`, `token_uri`, `get_approved`, `approve_for_all`, `is_approved_for_all`. |
| Module `version()` (S3) | **Derived from the registry on read.** `CurrentVersion`, the constructor argument, `sync_version` and `VersionSynced` are removed from the seven DAO modules. The Manager keeps its own stored version (it is the registry). |
| Manager registry slimming (S4) | **Dropped.** `get_latest_implementation` callers and `upgrade_manager` read the fields it would remove. |
| Claims | **Merkle-only, with the tree published.** Allowlist storage, `set_allowlist`, `mint_allowlist` and their events go. `set_merkle_root(root, tree_uri)` stores an `ipfs://<cid>` of the full tree beside each root; `MerkleRootSet` carries `{ root, round, tree_uri }` (G2 extended). Consumers recompute the root from the file and refuse to show claims on mismatch. |
| Quorum | **Stored per proposal (D33, D40).** `propose` computes `ceil(voting_supply_at_previous_ledger × quorum_bps / 10,000)` from the latest checkpoints only and stores it; `proposal_state` judges against the stored value, so only the latest supply and quorum checkpoints are swept. `quorum(ledger)` remains as a historical view. |
| Proposal recoverability | **Ids only**: a counter, `ProposalId(seq)` and a `proposal(id)` core getter. No payload on-chain; the preimage stays with the proposer and in `ProposalCreated` (exception 3). |
| Minter | **Required shared module.** The platform Minter is one contract for all DAOs; every DAO's token grants it mint authority at launch. `enable_minter` goes; the launch config carries a required `minter: Address` that must equal the registered PlatformMinter (keeps the pre-launch pin), and the token records it (`minter() -> Address`). The Minter adopts `common::upgrade` (Manager admin as upgrade authority, registered in the registry) so one approved upgrade fixes every DAO (eng review D8). |
| Wiring and counters | **Getters added** so a fresh client can discover every module and scan finite ranges (§ 4). |
| Byte-level codecs for attributes and items (compaction C) | **Optional, last.** Only if measurements say so. |
| In-contract bump entrypoints | **Removed** (`bump_artwork_ttl`, `bump_slug_ttl`) in favour of footprint TTL operations (§ 7). |
| Storage keys | **No module key may encode like an OpenZeppelin key the module links** (`NFTStorageKey`, `VotesStorageKey`, `GovernorStorageKey`, and any OZ module added later): a unit or tuple variant encodes as `[Symbol(name), args…]`, so the enum's type name does not separate them. The token's metadata-hook key is renamed (`TokenKey::MetadataContract`) and the governor's `Proposal(id)` becomes `ProposalTime(id)`. A per-module guard test enforces it (§ 9). Source: `docs/STORAGE_DIET_REVIEW.md` Finding 1. On top of that, every Builder key is wrapped as `("builder", variant)` (D30, § 4), so Builder and OZ keys cannot collide by construction. |
| Shared code rent | **Callers never pay for long code renewals.** The instance bump and the code bump are separate: instances keep 60 → 170 days; code is bumped only when under 2 days left, to 4 days, so a member pays a few days of shared code rent at most. The platform keeps code at 170 days, extends every new hash at upload, and builds its renewal list from the chain. Source: `docs/STORAGE_DIET_REVIEW.md` Finding 2. |
| Rollout | **One fresh testnet redeploy**, no migration code (pre-mainnet rule). `STORAGE_VERSION` stays 1 everywhere. |

Codes kept from the earlier drafts for traceability: S3 = derive the module version from the registry; S4 = slim
the Manager registry records; G1 = complete SEP-50; G2 = `MerkleRootSet` carries root and round; G4 = store a
quorum snapshot per proposal; compaction C = byte-level codecs for attributes and items.

## 4. Contract changes

### Metadata

**Settings** becomes `{ token, renderer_base }` in instance storage. The four display strings, their getters,
`update_*` setters and events are removed. `renderer_base()` and admin-only `update_renderer_base()` stay
(`MAX_STRING_LENGTH`), emitting `RendererBaseUpdated`.

**Profile.**
- Instance `ProfileState { hash: BytesN<32>, seq: u32 }`, `hash = sha256(profile bytes)`.
- Constructor takes `profile: String`, sets `seq = 0`, emits `ProfileUpdated { seq, hash, profile }`.
- `update_profile(expected_seq: u32, profile: String)`, admin-only: `ProfileSeqMismatch` unless
  `expected_seq == seq`; then `seq += 1`, store the hash, emit `ProfileUpdated`. Length `1..=MAX_PROFILE_LENGTH`
  (4096 bytes) else `InvalidProfile`. The contract does not parse JSON.
- Views `profile_hash()`, `profile_seq()`.
- Through governance, a stale `expected_seq` makes `treasury.execute` fail; nothing in that proposal applies, and
  a fresh proposal with the current `seq` is needed. Intended: an edit written against a copy voters never saw
  must not land.

**Artwork layout** (chosen so a DAO's whole catalogue is a handful of keys, § 7):
- Instance `ItemCounts: Vec<u32>` (≤ 16) replaces `PropertyCount`; its length is the property count. Mint and
  batch mint read it once and nothing else from the artwork.
- Persistent `PropertyNames -> Vec<String>` (one key for all ≤ 16 names, D32) replaces the `name` half of
  `StoredProperty`.
- Persistent `Items(property_id, page)`, 32 items per page, `MAX_ITEM_PAGES = 32` (1,024 items per
  property), stored as the item names plus one IPFS-group byte per item (`ItemPage`, D32; ~580 B for a full
  page of short names). `add_properties` appends to the last page and rewrites at most one page per touched property.
  **Measured** worst case (16 properties each one item short of a full page, 64-byte names, a maximum-length new
  group): 89,496 bytes written, against the live `tx_max_write_bytes` of 132,096. The approved 64-item pages
  (eng review D6) measured 155,032 bytes and did not fit, so pages are 32 items; D6's intent (a bounded write
  under the limit) is unchanged. Test: `worst_case_add_properties_fits_the_write_limit`. Mint never reads items;
  `get_items` pages over pages. Today `item_count` is unbounded, a latent problem.
- IPFS groups: an upload split across several calls from one folder reuses the last group instead of appending a
  copy, so the 64-group cap limits distinct folders, not upload batches.
- Persistent `IpfsGroups -> Vec<IpfsGroup>`: one key, append-only; `get_ipfs_group(k)` indexes into it. Cap
  `MAX_IPFS_GROUPS = 64`.
- Persistent `AttributesPage(page) -> Bytes`, 64 tokens per page as packed records (a count byte plus one byte
  per trait, two past 256 items in a property: ~1.2 KB for a full page of 16-trait tokens, D32; the `Vec<u32>`
  layout first implemented measured ~9.4 KB). Every mint writes its record, empty before artwork exists, so the
  pages up to the minted count always exist. A mint reads, extends and rewrites one page instead of creating a
  key per token (rent is the same bytes in far fewer entries). A `batch_mint` (≤ 18 tokens) that crosses a page boundary writes two pages
  atomically. `get_attributes(token_id)` reads one page; an archived page makes `token_uri` fail at simulation
  with an archived-entry error, which `/api/token` and `/api/render` map to the "unavailable" state and the Renewal
  tab shows as expired. The stored vector per token is still the property count followed by one item index per
  property.
- Public shapes of `get_property`, `get_items` (paged), `get_ipfs_group`, `get_attributes` and `properties_count`
  are unchanged. Add `property_headers()` returning at most 16 `(name, count)` pairs so a fresh client resumes
  setup without reading every item.
- `add_properties` and `delete_and_recreate_properties` update names, counts, items and groups atomically with
  today's authorization, validation rollback and reset semantics (reset removes the pages and re-adds in batches).
  New caps (§ 5): names ≤ 64 bytes, group `base_uri` ≤ 256, `extension` ≤ 16, items per property ≤ 1,024 (32 pages),
  groups ≤ 64; these were unvalidated before. Names containing `"`, `\` or a control character (U+0000–U+001F)
  are rejected with `InvalidName` so the on-chain JSON needs no escaping (eng review D7); the token name is
  validated the same way in `set_metadata`.
- `bump_artwork_ttl` is removed (§ 7).

**`token_uri(token_id)`** returns the on-chain JSON document of § 5 and panics for an unminted token. Group
count is already exposed by `ipfs_data_count()`.

### Token

Add the six missing SEP-50 functions (`name`, `symbol`, `token_uri`, `get_approved`,
`approve_for_all(owner, operator, live_until_ledger)`, `is_approved_for_all`) over the OZ `Base` state the token
already uses (`Base::set_metadata` stores name and symbol today). `token_uri` forwards to Metadata, so the OZ
`base_uri` is dead state: the constructor and `set_metadata(name, symbol)` drop the `uri` argument and store an
empty OZ `base_uri` (eng review D9; removing the field itself would mean bypassing OZ `Base` for ~8 bytes, skipped).
Manager `create_dao`, bindings, `proposal-supported-calls` and the token actions follow. Operator
transfers run the same vote-checkpoint hook as direct transfers; approvals expire at their ledger and a single
token approval clears on transfer (OZ behaviour). Add wiring getters `manager()`, `treasury()`, `auction()`,
`marketplace()` over the existing instance keys, plus `minter() -> Address` over a new instance key `Minter`:
`token.launch(treasury, minters)` gains a third argument `minter: Address`, the shared platform Minter the
Manager grants mint authority to (today it only adds it to the `minters` set, `contracts/manager/src/contract.rs:869-889`).
The DAO's claim contract becomes DAO-owned state that survives a platform minter rotation. `total_supply` is the
mint counter (no burn extension).

### All DAO modules (`contracts/common`)

- Remove `UpgradeKey::CurrentVersion`, the `version` constructor argument, `sync_version`, `VersionSynced`.
- `version()` reads `CurrentHash` and calls `manager.get_implementation_version(hash)` (read-only); keeps the
  `ImplementationNotFound` error. `apply` still emits `Upgraded` with the version it looked up.
- The Treasury self-dispatch allow-list drops `sync_version`.
- **Instance and code TTLs are bumped separately** (`common::ttl::extend_instance`, used by every module, the
  Manager and the Minter). `instance().extend_ttl` extends the contract **code** with the same threshold (soroban-sdk
  27.0.6 `storage.rs`), so today any caller arriving when shared code has under 60 days left pays 170 days of code
  rent (~300 XLM per ~35 KB entry on testnet, 2026-10-12). It becomes
  `deployer().extend_ttl_for_contract_instance(self, 60 d, 170 d)` plus
  `deployer().extend_ttl_for_code(self, CODE_TTL_THRESHOLD = 2 d, CODE_TTL_EXTEND_TO = 4 d)`. The code values are
  tunable: small enough that a member pays a few days of rent at most if the platform's renewal lapses, large enough
  that code never archives while the DAO is used.
- **Key rule.** No storage variant may share its `(symbol, arity)` with an OpenZeppelin key the module links. The
  token's `TokenKey::Metadata` already collided with `NFTStorageKey::Metadata` (the hook address overwrote the
  collection name at construction; a rename overwrote the hook, so minting trapped). Fixed as
  `TokenKey::MetadataContract`.
- **Namespace (D30, name changed by D37).** Every key a Tribe Builder contract writes is `common::ns(e, Key::Variant(..))`,
  which encodes as `(Symbol("builder"), [Symbol("Variant"), args…])`. OpenZeppelin keys stay as OZ writes them. A Tribe Builder key
  is therefore a two-element vector starting with `builder`, and no OZ key can take that shape, so the two
  sets cannot collide whatever OZ adds later. This applies to the DAO modules, `common` (admin, upgrade,
  lifecycle), the Manager and the Minter. Off-chain readers build keys with `apps/web/src/lib/storage-key.ts`;
  a Rust test and a web test pin the same XDR bytes. The per-module guard still runs, because all Tribe Builder enums
  share one namespace and must stay disjoint inside it.
- **Namespace cost (measured, e2e factory DAO, with the original 10-character name).** Each key grew by 32 bytes
  of XDR (a 12-byte vector header and a 20-byte symbol); D37's 7-character name makes that 28. Rent is charged per
  byte, so:

  | Entry | Namespaced keys | Overhead with `buildeross` (measured) | With `builder` (D37) |
  |---|---|---|---|
  | Six DAO instances together | 48 | +1,536 (32 %) | +1,344 |
  | Manager instance | 10 | +320 (38 %) | +280 |
  | A small persistent entry (slug, minter, Minter marker) | 1 | +32 (10–24 %) | +28 |
  | An artwork item page (32 items) | 1 | +32 (under 1 %) | +28 |

  OZ per-holder entries (owners, balances, checkpoints) are unchanged. The vector header is the unavoidable part;
  a symbol of 9 characters or fewer also stays inline in a `Val` (no host object per key build), which is why the
  name is now `builder` (D37).

### Manager

- `InitialDaoConfigValues`: `profile` replaces `description`, `project_uri`, `contract_image`; `renderer_base`
  stays. `validate_profile` checks `1..=4096` bytes.
- Launch config: `enable_minter: bool` and `expected_minter: Option<Address>` become a required
  `minter: Address` that must equal the registered PlatformMinter (`PlatformMinterMismatch` otherwise), so every
  DAO launches with the shared Minter and the launch admin still pins the address they reviewed. `launch_dao`
  passes it to `token.launch`.
- `current_wasm` stops passing a version into module constructors.
- `bump_slug_ttl` is removed; slug entries are part of the sweep (§ 7). Registry unchanged.

### Minter

> Superseded by D43: the shared Minter is retired and each DAO has its own ClaimMinter module
> ([membership-models](designs/membership-models.md) § 3), which keeps this leaf, proof and `tree_uri` format.
> The rest of this section is the 0.3.0 record.

- Remove allowlist mode: `AllowlistVersion`, `AllowlistAmount`, `Allowlisted`, `AllowlistClaimed`,
  `set_allowlist`, `mint_allowlist` and their events.
- `set_merkle_root(token, root, tree_uri: String)`: `tree_uri` (≤ `MAX_STRING_LENGTH`, an `ipfs://<cid>`) is
  stored beside the root for the round (persistent, DAO-owned, in the sweep) and emitted in
  `MerkleRootSet { root, round, tree_uri }`. Leaves keep carrying the per-claimer amount; the leaf and node
  algorithm is unchanged: leaf `sha256(ScVal XDR(address) ‖ u128 BE(amount))`, node `sha256(sorted(a, b))`
  (`contracts/minter/src/contract.rs:258-272`).
- Add `claim_status(token, recipient) -> { root, round, tree_uri, claimed }` over existing state. `MerkleRoot(token)`
  and `MerkleRound(token)` (and the URI stored with the root) are the DAO-owned Minter keys the sweep renews
  (§ 7); claim markers are per claimer.
- **Tree file format.** The Uniswap `merkle-distributor` shape, the most widely recognised airdrop file, with an
  explicit algorithm header because our hashing differs from the EVM defaults (so no stock EVM loader verifies it
  and we never label it as one):

  ```json
  {
    "format": "builder-stellar-merkle-v1",
    "hash": "sha256", "leaf": "sha256(scval_xdr(address) || u128_be(amount))", "node": "sha256(sorted(a, b))",
    "network": "Test SDF Network ; September 2015",
    "token": "C…", "round": 3, "merkleRoot": "<64 hex>", "tokenTotal": "1234",
    "claims": { "G…": { "amount": "5", "proof": ["<64 hex>", "…"] } }
  }
  ```

  A `claims` entry is exactly today's `{ amount, proof }` upload (`lib/minter/proof.ts`), so manual proof files
  keep working. Internal nodes are not stored (derivable); per-claim proofs are, so a claimer needs no tool. At
  10k recipients the file is ~9 MB, fine for IPFS; a two-file index is the escape if a DAO ever exceeds that.
- **Verify, never trust.** The chain cannot check that the file matches the root. Every consumer (the app, the
  acceptance CLI, anyone) recomputes the root from `claims` and refuses to offer a claim if it differs or the
  file does not resolve ("claim list unavailable"). The URI is a hint; the root is the truth.
- **Pinning.** The app uploads through Pinata (the existing upload path) and re-pins on every new round; the
  indexer keeps a copy; anyone holding the file can re-pin and the on-chain pointer resolves again with no
  contract change. Publishing the full allocation before claims is a deliberate transparency choice.
- The Minter is a platform module: one instance and one code hash for all DAOs, renewed by the platform (§ 7);
  its per-DAO keys are DAO-owned and in the DAO's sweep. It adopts `common::upgrade` with the Manager admin as its
  upgrade authority, is registered, approved and current in the registry like the modules, and gains `wasm_hash`,
  `version` (derived per S3) and `storage_version`; today it has no upgrade path at all (eng review D8). The e2e
  suite upgrades the shared Minter and claims against an existing root afterwards.

### Governor

- No payload is stored (D10). At a successful `propose`, increment a proposal counter and write persistent
  `ProposalId(sequence) -> id` (about 60 bytes, proposer-paid, the core's 120-day lifecycle TTL). Add
  `proposal_count()`, a bounded `proposal_ids(start, limit)` view and a full `proposal(id)` core getter (window,
  eta, state). Never a list in instance storage.
- `queue`, `execute`, Treasury nested authorization, consumption-before-call and rollback are unchanged; the
  caller supplies the preimage as today.
- Id entries renew with the core on lifecycle calls; after completion they stay persistent and may archive.
- Quorum checkpoints, `quorum(ledger)`, `cancel` rules: unchanged. Override `version()` per S3 and `name()` as
  a constant; drop the OZ `Version`/`Name` keys and `set_version` calls.
- Rename `GovernorKey::Proposal(id)` to `ProposalTime(id)`: it encodes like OZ `GovernorStorageKey::Proposal(id)`
  but holds `ProposalCoreTime`. Safe today only because every OZ method that reads it is overridden.

### Treasury, Auction, Marketplace

S3 only. Treasury already exposes its Governor; Marketplace already exposes `next_listing_id`. Add any missing
read over existing state that § 7's inventory needs (none identified yet).

### Shared and versions

- `common`: add `MAX_PROFILE_LENGTH = 4096`, `MAX_ARTWORK_NAME_LENGTH = 64`, `MAX_EXTENSION_LENGTH = 16` and a
  base64 encoder.
- `releases/contracts.json`: every module bumps (S3 touches all seven; metadata, token, governor, minter and
  manager change interfaces).
- Regenerate bindings and `test_snapshots`.

## 5. `token_uri`: the JSON built on-chain

Modelled on `protocol/main/src/token/metadata/MetadataRenderer.sol:283-385`, minus the collection description.

```json
{
  "name": "Builder #12",
  "image": "<renderer_base>?contract=<token address>&token=12",
  "attributes": [{ "trait_type": "Head", "value": "crown" }, { "trait_type": "Body", "value": "blue" }]
}
```

returned as `data:application/json;base64,<…>`.

- `name` = token name + ` #` + id. `attributes` come from `Attributes(token_id)` resolved through
  `PropertyName` and `Item`. `description` and `external_url` are omitted (optional in the SEP-50 schema); they
  live in the profile.
- **Layer URLs are not embedded, and there is no bulk layer view.** The Solidity renderer appends `&images=<url>` per
  trait; 16 percent-encoded URLs do not fit reliably under the per-invocation return-value limit, and a `token_layers`
  view would hit the same limit. A compositor derives each layer from chain with the existing bounded reads:
  `get_attributes(token_id)` (the stored vector is the property count followed by one item index per property),
  `property_headers()` once for the names, then per trait `get_items(i, j, 1)` for the item name and
  `reference_slot` (one vector read in memory), and `get_ipfs_group(slot)` for `base_uri` and `extension`; the layer URL is `base_uri + property name + "/" + item
  name + extension`, percent-encoded. At most 2 + 2 × 16 small RPC reads, each bounded by the caps below, cacheable
  forever per token. (`get_property(i)` is not used here: it assembles every item of the property.) The derivation
  lives in `lib/chain-reads/` (D4), used by `/api/render`, the artwork inspector and the
  acceptance tests; `/api/render` caches per token forever (attributes are immutable after mint).
- **Caps.** Artwork strings are not length-checked today at all (`_add_properties` stores them as given; only the
  Settings strings pass `check_length`). This release adds the first caps, validated in `_add_properties` and the
  constructor: property and item names ≤ `MAX_ARTWORK_NAME_LENGTH = 64` bytes; IPFS group `base_uri` ≤
  `MAX_STRING_LENGTH = 256` and `extension` ≤ `MAX_EXTENSION_LENGTH = 16`. Fresh redeploy, so no compatibility
  cost. They bound `token_uri`: token name (≤ 256) + 16 × (64 + 64 + JSON overhead) ≈ 3 KB raw, ≈ 4 KB base64,
  and every per-trait read to under 1 KB. Names never contain `"`, `\` or control characters (rejected at
  setup, D7), so the builder concatenates them verbatim.
- SEP-50 schema verified against the draft (v0.1.0): `name`, `description`, `image`, `external_url`,
  `attributes[]{trait_type, value, display_type, max_value}`, no required fields.
- Cost: a read-only call, so simulation only; CPU for ≤ 16 traits plus base64 of a document of a few KB. Needs a
  small base64 routine in `common` (no host function). § 10 gates both CPU and the return-value size against the
  live network limits; the name cap exists so the maximum document is known at compile time.
- The spec says `token_uri` "returns an url". A `data:` URL follows ERC-721 practice; which Stellar wallets and
  marketplaces render it is an open question (§ 14.2). If one does not, `renderer_base` can serve HTTPS JSON
  without a contract change.

## 6. Profile JSON

```json
{ "v": 1, "description": "Markdown.", "links": [{ "label": "Website", "url": "https://…" }], "image": "ipfs://…" }
```

- Readers are tolerant (unknown fields ignored, missing fields empty); `v` lets the app read older shapes.
- URL rules as markdown links (`https`, `http`, `mailto`, `ipfs`); at most 8 links, labels ≤ 32 code points.
  Readers enforce these as well as writers: non-conforming links and images are dropped. The description renders
  through the existing sanitised `Markdown` component.
- Editors validate the **serialized byte length** against `MAX_PROFILE_LENGTH` and show the remaining budget.
- App verification: the indexer stores the `ProfileUpdated` string byte-for-byte with the emitted hash beside
  it; the app hashes those raw bytes and compares with `profile_hash()` (cached per contract for 60 s,
  invalidated on a new `seq`); mismatch or missing shows "Profile unavailable right now", never a block.

## 7. One-sweep renewal and restoration

Stellar provides this without contract code: the `ExtendFootprintTTL` operation extends the TTL of every ledger
key listed in a transaction's read-only footprint, and `RestoreFootprint` restores archived persistent entries.
Anyone can submit them; the signer pays the rent. The SDK exposes them as `Operation.extendFootprintTtl` with a
`SorobanDataBuilder` footprint, and `Operation.restoreFootprint`. What the plan has to guarantee is that every
DAO-owned key can be **listed from chain state**.

**Inventory a client builds from RPC** (all shapes are known, all counts are on-chain after § 4):

| Keys | Source of the list |
|---|---|
| 7 module instances | `manager.get_dao_by_slug(slug)` → token (existing); `token.metadata()` (existing), `manager()`, `treasury()`, `auction()`, `marketplace()`, `minter()` (added); `treasury.governor()` (existing) |
| Metadata `PropertyNames` (1 key), `Items(i, page)` (≤ 16 × pages keys; 16 for the reference DAO), `IpfsGroups` (1 key) | `property_headers()` (added) |
| Metadata `AttributesPage(p)` (one per 64 minted tokens; every mint writes its record, so they all exist, D32) | `TokenIdCounter` in the token instance |
| Governor `ProposalTime(id)`, `ProposalId(seq)`, OZ `ProposalVote(id)` | `proposal_count()`, `proposal_ids(start, limit)`, `proposal(id).state`; terminal proposals are skipped |
| Governor OZ `QuorumCheckpoint(n - 1)`, the latest only (D33) | `NumQuorumCheckpoints` in the governor instance (read with the instance entry) |
| Token `MintAuthority(addr)` for the canonical grants | `token.treasury()`, `auction()`, `marketplace()`, `minter()`, kept if `mint_authority(addr)` |
| Token OZ `TotalSupplyCheckpoint(n - 1)`, the latest only (D33) | `NumTotalSupplyCheckpoints` in the token instance |
| DAO holdings: OZ `Owner(t)` and `Balance` of the Treasury, Auction and Marketplace; their asset `Balance` on the payment assets (D34) | every `Owner(t)` read raw up to `TokenIdCounter`; the payment assets from the auction and marketplace `Config` |
| Marketplace listings | `next_listing_id`, per-token `get_listing` |
| Minter `MerkleRoot(token)` (root + `tree_uri`), `MerkleRound(token)` | `token.minter()` (the launch-pinned shared Minter, not the mutable platform setting), keyed by the token address |
| Manager `SlugToDao(slug)`, `DaoSlug(token)` | the slug |
| Shared WASM code (modules and Minter), the Manager instance and its `Implementation(hash)` records, the shared Minter instance | platform duty: `scripts/renew-code-ttl.mjs` extended to these keys in this release; a `/platform` dashboard follows in its own wave (TODOS.md); `version()`, upgrades and claims depend on them |

The reference rules live in the e2e test `protocol_runs_on_chain_state_only` (`dao_renewal_inventory`), which
asserts that the list equals the DAO's persistent keys on the ledger minus the per-holder ones; `lib/chain-reads`
mirrors them. Writing that test found four classes the first draft of this table missed (vote tallies, quorum and
total-supply checkpoints, mint grants). The two inventories are kept equal by hand, each against its own fixture;
a shared fixture (the Rust test dumps its key list, the TypeScript test asserts against it) is a follow-up
(open question 4).

Per-holder keys (OZ `Owner(t)`, balances, delegations, per-account checkpoints, approvals, refunds, vote records,
claim markers) are the holder's state, not the DAO's: they renew on use (OZ extends ownership on read and transfer) and
anyone holding the key can restore them. They are not in the DAO sweep.

**Is it one transaction? Yes, by design.** Live testnet settings (`stellar network settings --network testnet`,
2026-10-12): `tx_max_footprint_entries` 400, `tx_max_disk_read_entries` 200, `tx_max_disk_read_bytes` 200,000,
`tx_max_write_bytes` 132,096 (binds restores), `tx_max_size_bytes` 132,096, `max_entry_ttl` 3,110,400 ledgers
(180 days at 5 s). With the § 4 layout the reference DAO of § 10 (16 properties, 300 items, 500 tokens, 50
proposals of which ~10 live) is 6 instances + 1 names key + 16 item pages + 1 groups key + 8 attribute pages
+ 20 live proposal keys + the latest two checkpoints + 4 mint grants + the DAO's holdings + 2 slug keys: **62 keys and
32,180 bytes measured (`reference_dao_sweep_fits_one_transaction`): one `ExtendFootprintTTL` transaction, one
signature**, with headroom to the 400-entry and 200 KB limits. The per-key layout it replaces needed about seven. The batch splitter stays
only as a guard for a DAO that somehow exceeds the live limit (the UI then says so and signs in sequence).
Mainnet values are read the same way at implementation, never assumed [re-measure before gate]. The sweep footprint
holds persistent and instance keys only, never temporary ones (OZ approvals): one extend mixing durabilities fails
as a whole when `extend_to` exceeds the temporary maximum.

**Renewal tab in Manage.** One screen, built from the inventory above:
- one row per class (contracts, artwork, tokens, proposals, listings, slug, claim rounds) with the number of
  keys, the earliest `liveUntilLedgerSeq` as a date and time (ledger → time at 5 s per ledger, as the existing
  panel does), bytes, and a healthy / soon / critical / expired state with the thresholds the artwork panel uses
  today (45 and 14 days);
- a duration selector (presets 30, 90, 180 days; any value up to the network maximum), applied to every selected
  class;
- a quote: the batches are built and **simulated** before anything is signed, so the member sees the number of
  transactions and the total fee for the chosen duration, per class and in total;
- sign and submit in sequence with progress; confirmed batches survive a later failure; the rows refresh.
Archived keys (a key the inventory says must exist that `getLedgerEntries` does not return, or returns with a
past `liveUntilLedgerSeq`) are routed to `RestoreFootprint` first from the same inventory, quoted the same way;
a restore reporting no such entry is surfaced as an error. `scripts/renew-dao.mjs` offers the same choices on
the command line for the RPC-only path. Payer is the signing wallet; a Treasury cannot submit a
transaction-level operation, so a DAO reimburses by proposal if it wants to.

Storage key shapes (the seven storage enums and the OZ `Owner`/`Balance` keys) thereby become published
interfaces: they live in one module, `apps/web/src/lib/chain-reads/` (key shapes, renewal inventory, token layer
derivation; it absorbs the key builders of `lib/ttl-expiry-rpc.ts:74-96` and `lib/minter/storage.ts`), used by the
Renewal tab, `/api/render`, the artwork inspector, `scripts/renew-dao.mjs` and the acceptance tests (eng review
D4); they are documented in `TTL_ECONOMICS.md` next to the bindings, and the § 9 enumeration test is the regression
guard for any storage or OZ change.

**Consequences for contracts.** `bump_artwork_ttl` and `bump_slug_ttl` are removed. In-contract threshold
renewal of touched persistent keys and instances stays (it keeps active state alive for free); code is bumped only
in small steps (§ 4 All DAO modules); the sweep is for everything the DAO does not touch often.

**Code is never in a DAO's sweep.** `ExtendFootprintTTL` counts every entry's bytes against
`tx_max_disk_read_bytes` (200,000 on testnet); seven ~35 KB code entries alone exceed it. Shared code is the
platform's: `scripts/renew-code-ttl.mjs`
- defaults to 170 days and refuses any value at or below the code threshold (it would be paid again by the next
  caller);
- builds its hash list **from chain** (the Manager registry's implementations and current hashes, plus the
  Manager's own and the Minter's), not from the deploy artifact, so upgrade hashes are never missed;
- and is joined by an extension at upload: `deploy-manager.mjs` and every implementation registration extend the
  new hash to 170 days immediately (`EXTEND_CODE_TTL_DAYS` defaults to 170, no longer opt-in), because new code is
  born at the network minimum (~7 days).

The Renewal tab's shared-code row carries a platform status with operator lead time (renew soon under 60 days,
renew now under 14, expired), separate from the member thresholds of the DAO's own classes, and says that a
lapse costs a member's next transaction a few days of code rent. The platform's own check is
`renew-code-ttl.mjs --dry-run` (MONITORING.md).

## 8. Indexer and app

**Indexer (migration 0014, Goldsky decoders).** Decode `ProfileUpdated`, `MerkleRootSet { root, round }`, the
payload-bearing `ProposalCreated` as today. Remove decoders for the deleted events (the four `*Updated` display
events, `VersionSynced`, allowlist events). Views: `metadata.profile` (highest `seq` per contract, scoped by role
and DAO identity, with `hash`); `manager.daos.profile` replaces `token_description`; `module_versions` derived
from `Upgraded` / `ImplementationRegistered`; claims merkle-only. Activity feed: "Community profile updated"
(suppressed at creation). `START_AT` at or before the Manager deploy ledger.

**App.**
- Profile: `lib/dao-profile.ts` (parse, sanitise, verify); community home shows the markdown description, link
  chips and image; the create flow gets a `MarkdownField` and a links editor; Manage → Community profile becomes
  one `update-dao-profile` action carrying `expected_seq` (direct in setup, proposed after launch). The proposal
  page explains `ProfileSeqMismatch` and offers re-propose; a superseded proposal is labelled.
- Token JSON: `/api/token/<id>` may keep serving HTTPS JSON for clients that do not read `data:` URIs; it reads
  the same on-chain data. `/api/render` takes only `contract` and `token` from the query string, resolves the
  layers from chain exactly as § 5 describes (attributes, names, groups), caches per token, and composites them.
  It works with the indexer off (§ 9 web tests).
- Artwork: `ArtworkSetup` resumes from `property_headers()` and `ItemCounts`; the inspector reads chain through
  `lib/chain-reads/`.
- Claims: allowlist UI and paths removed. Claim setup builds the tree in the browser, uploads the file through
  Pinata and submits `set_merkle_root(root, tree_uri)` in one action; the claims page fetches the CID, recomputes
  the root, compares with chain, then auto-fills the connected wallet's `{ amount, proof }` (manual upload stays
  as a fallback); the inspector shows "claim list unavailable" when the CID does not resolve or mismatches.
- Versions: Manage keeps calling `version()`; `sync_version` action and `proposal-supported-calls` entry go.
- Governance: the proposal list and states can be built from `proposal_ids` and `proposal(id)` when the indexer
  is down; queue and execute use the preimage from the indexer or the proposer's saved draft.
- Renewal: the Manage tab of § 7.
- **Fee guard.** Before signing, if the transaction's maximum fee exceeds a threshold, stop and explain
  ("This action would pay ~N XLM in network fees, most of it to renew shared contract code…") instead of the SDK's
  u32 overflow error or a silent charge. **Implemented at 50 XLM, not the 10 XLM first planned:** testnet rent
  measured at implementation is ~0.0098 XLM per KB-day, so creating a DAO already pays ~10 XLM of instance rent
  (TTL_ECONOMICS.md). The 2× resource fee was stellar-sdk 17.1.0 `AssembledTransaction.sign` passing
  `fee: this.built.fee` to `cloneFrom`, so `build()` added the resource fee again; fixed by a pnpm patch with a
  regression test.
- **Platform admin dashboard: deferred** to its own wave (eng review D2; TODOS.md). In this release the platform's
  renewal duty is covered by extending `scripts/renew-code-ttl.mjs` to the Manager instance, every
  `Implementation(hash)` record and the shared Minter instance and code hash.
- Scripts, configs and docs: `deploy-dao.mjs`, `configs/*-dao.json`; `DAO_DEPLOYMENT`, `ARCHITECTURE`,
  `DATABASE_SCHEMA`, `SECURITY_MODEL`, `CONTRACT_UPGRADES`, `GOLDSKY_SETUP`, module READMEs.
- **`TTL_ECONOMICS.md` becomes the storage and TTL reference**, rewritten as part of this plan: for every module
  and every key, the storage class (instance, persistent, temporary), what it holds, its size bound, its TTL
  target and threshold, who renews it (DAO sweep, platform dashboard, or the holder on use), and the measured
  cost from § 10 (write fee and rent for 120 and 180 days), plus the live-limit snapshot above and the renewal
  flows. The implementation is not done while that table is stale.

## 9. Tests

**Contract e2e, the guarantee.** `protocol_runs_on_chain_state_only`: contract clients only, no event as an input,
no database. Create with a profile; artwork setup, then resume a second batch from `property_headers()` and
`ItemCounts`; founder mint; launch; bid, settle, next auction; recover a refund; primary and secondary sales; a
merkle claim with a locally generated proof; propose, vote, queue, execute, cancel; list proposals from
`proposal_ids` and read their state from `proposal(id)`; `update_profile` and `add_properties` by proposal;
upgrade a module and read `version()`. Renewal and restoration are transaction-level operations the Rust test
env cannot submit; they run in the fresh-client acceptance below.

**Fresh-client acceptance** (automated tests over the bindings and RPC against a local network, run in CI and
before any testnet rollout; no CLI, eng review D3): start a DAO and leave setup, proposals and listings outstanding;
discard every cached argument and receipt; a second process with only network settings, a Manager + slug or token
address, and signers:
discovers wiring; resumes artwork and renders a token from `token_uri` plus the derived layers; lists
outstanding proposals from chain and executes one from the preimage it is given (exception 3); finds and operates
auctions and listings; claims with a supplied proof; runs the renewal sweep and a restore. Our frontend, database,
indexer and API are off. Mocks that return indexed data invalidate the run.

**Storage-key and TTL tests (`docs/STORAGE_DIET_REVIEW.md`).**
- Token: after construction `name()`, `symbol()`, `token_uri()` and `metadata()` all return; after
  `set_metadata(name, symbol)`, `metadata()` still returns the hook and `mint`/`batch_mint` still seed attributes.
- Key-collision guard per module: the `ScVal` of every variant of the module's key enums, with dummy arguments,
  is disjoint by `(first symbol, length)` from the OZ key enums that module links.
- Namespace walk (D30, e2e `every_protocol_storage_key_is_namespaced`): after artwork, a launch with auction and
  marketplace, Minter claims, both listing kinds and a governed rename, every key the Manager, the Minter and the
  six modules own is `("builder", variant)` or a listed OZ shape (`common::testutils::OZ_KEY_SHAPES`). The
  namespaced key XDR is pinned in Rust (`common` `namespaced_key_xdr_is_pinned`) and in the app
  (`storage-key.test.ts`).
- e2e: a live DAO renames its token by proposal, then settles an auction; the minted token has attributes.
- `common::ttl`: with code under the code threshold and the instance above its own, a call bumps code to
  `CODE_TTL_EXTEND_TO` only; with the instance under 60 days, the instance goes to 170 days and code is untouched
  when above its threshold.

**Regression contract (eng review D10).** Every existing contract, e2e, web and Goldsky test stays green except
tests that assert removed behaviour (allowlist mode, `sync_version`/`VersionSynced`, the four display-string
setters, getters and events, `enable_minter`/`expected_minter`, the 0.2.0 deployed-code upgrade fixtures); each
retired test gets a retirement card in the commit that removes it; intentional assertion changes are named in the
commit message.

**Per-change.** Profile seq/hash/CAS/auth and length; page boundaries (64th item, 16-page cap, batch mint crossing
an attributes page) and the worst-case 16-page write; `InvalidName` rejection and a builder test with the
maximum valid name; the shared Minter upgrade followed by a claim; artwork headers and counts agree across add and reset, rollback
on failed mutation, 16-property boundary, no shifted indices; `token_uri` JSON for 0, 1 and 16 traits and
maximum-length names, caps enforced on names, base URIs and extensions, panics for unminted; SEP-50 functions,
operator transfer moves voting power like a direct transfer, expired approval cannot transfer; `version()` after
upgrade and `ImplementationNotFound`; merkle amounts, double-claim, new round, `tree_uri` stored and emitted per round,
allowlist entrypoints gone;
`proposal_ids` pagination bounded and ids match the emitted events, same-ledger bps and historical quorum unchanged;
the renewal inventory enumerates **every** persistent key the e2e flow wrote (assert against the test env's ledger).

**Web and indexer.** Profile parse, sanitise (disallowed schemes, >8 links, long labels dropped) and verify;
degraded states; `lib/chain-reads/` layer derivation against a fixture with non-ASCII names (pins the percent-encoding rule);
`/api/render` and `/api/token` with the indexer off; tree file build, upload, fetch and root recomputation
(mismatched and unreachable files refuse claims); proposal list from chain; renewal batching
and cost display; Goldsky unit tests and the migration cycle with scenarios (seq ordering, version derivation).

## 10. Budget and acceptance gates

Record the source commit, network resource settings and fixtures, then measure baseline and candidate: total
key+value bytes and entry counts by storage class; instance size; footprint keys, read/write bytes, CPU and event
bytes; simulated fees and rent for initial write, ordinary touch, threshold renewal, archive restoration; and
lifecycle totals (create, add artwork, mint, claim, govern, renew, restore). Fixtures: 0/1/16 properties, small
and large catalogues, maximum settings and profile, 30-item adds, mint batch boundaries, proposal action and
description boundaries with nested Treasury authorization.

Gates: a compaction ships only with measured benefit in its target dimension; `token_uri` for a 256-byte token
name and 16 maximum-length (64-byte) traits, and each per-trait getter at 256-byte base URIs, stay within the
simulation CPU limit (`tx_max_instructions` 400,000,000 on testnet) **and** the per-invocation events-plus-return
limit (`tx_max_contract_events_size_bytes` 16,384 on testnet), both re-read from the live network config, with
headroom; the largest supported proposal (20 actions) still fits the live transaction limits; `create_dao` with
a maximum profile and `propose` with a maximum description stay inside the live transaction limits (measured);
the renewal sweep for a reference DAO (16 properties, 300 items, 500 tokens, 50 proposals) fits in **one**
transaction under the live footprint limit with a quoted cost, and the quote the Renewal tab shows matches the fees
charged; `add_properties` touching 16 pages and a mint at a full attributes page (and one crossing a page) stay
within budget and their measured per-call fees are published (the per-mint delta against today's layout is a
published number).

## 11. Sequencing

One PR on one branch (eng review D5), reviewable commits:

1. Baseline and interface inventory; the acceptance-test skeleton; `protocol_runs_on_chain_state_only` as a
   skeleton against the current contracts (it pins down which inputs a client must hold: merkle proofs and
   proposal preimages).
2. Metadata: settings split, profile, artwork layout, `token_uri` JSON, base64 in `common`; tests.
3. Token SEP-50 and wiring getters; `common` S3 across modules; Manager profile and `current_wasm`; tests.
4. Minter merkle-only, `tree_uri`, `claim_status`, the common upgrade path; proof tooling and vectors.
5. Governor ids and getters; tests.
6. Renewal: inventory library, `renew-dao.mjs`, the Renewal tab in Manage; the enumeration test.
7. Platform renewal: `renew-code-ttl.mjs` defaults to 170 days, refuses values at or below the code threshold, and
   reads its hash list from chain (registry, Manager, Minter); `deploy-manager.mjs` and registration extend new code
   at upload.
8. e2e guarantee and acceptance run on a local network; event, CPU and transaction-size budgets; bindings and
   snapshots.
9. Indexer migration 0014 and decoders; app; docs and configs, including the rewritten `TTL_ECONOMICS.md`.
10. Fresh testnet redeploy (separate go-ahead; runbook in project notes): new salt, Goldsky pipeline re-applied,
   database reset and migrated, the three communities recreated with real profiles and artwork, then the
   verification of § 9 against testnet, including a sweep from a wallet that is not the platform admin.
   Checklist: the key renames and guard tests are green; every module's code is extended to 170 days at upload;
   after deploy, every code TTL is above its threshold, and `token.metadata()`, `token.name()` and a
   rename-then-settle succeed on testnet. The current testnet DAOs are left as they are until then (their
   governor, auction and marketplace code archives around 2026-10-18; DAO 0 cannot mint because of the key
   collision).

## 12. Decision ledger

| ID | Decision | Why | Rejected |
|---|---|---|---|
| D1 | Chain-complete operation is the first rule; a fresh-client acceptance test enforces it | Owner's hard rule, sharpened by the rewrite | Hash-chain style indexer verification as a substitute for recoverable state |
| D2 | Profile is event-only JSON with `hash` + `seq` and CAS | Owner: no strings stored for no reason; the fingerprint detects a stale copy and orders updates | Four strings in a cold persistent record (rewrite A) |
| D3 | `renderer_base` stays on-chain; `token_uri` builds `data:` JSON on-chain | `token_uri` must work from chain alone; Solidity precedent | URL to our API; nothing collection-level beyond `name`/`symbol` because SEP-50 defines nothing more |
| D4 | Artwork stays on-chain, compacted (counts hot, names cold, items and attributes chunked per D19) | An independent renderer needs the names; events cannot restore them | Event-only artwork with hash chain |
| D5 | SEP-50 completed in this release | Owner; wallets and marketplaces display from chain | Defer |
| D6 | `version()` derived from the registry; `sync_version` removed | Removes bytes DAOs pay for on every call; the registry already holds the string and must stay alive for upgrades | Keep stored string; derive at write time (a no-op: the Manager already passes the registry version) |
| D7 | S4 dropped | `get_latest_implementation` callers and `upgrade_manager` read those fields | Return `(hash, record)` |
| D8 | Merkle-only claims, explicit exception | Owner; one claim path | Keep allowlist; emit leaves |
| D9 | ~~Quorum checkpoints kept~~ (superseded by D33: the stored quorum is what lets the sweep drop checkpoint history) | Functionality-preserving; the snapshot saved nothing meaningful | Stored `quorum_votes` (G4) |
| D10 | Proposal ids only (counter, `ProposalId(seq)`, `proposal(id)`); no payload on-chain; the preimage is exception 3 | A payload costs the proposer 1.7–22 XLM of rent per proposal for a recovery path events and the proposer already provide; ids give a chain-only proposal list for ~60 bytes | Store the payload while live and prune it (drafts 2–3); nothing at all |
| D11 | One-sweep renewal via footprint operations; in-contract bumps removed | Owner's new rule; Stellar already provides the operations | Per-contract bump entrypoints; a keeper |
| D12 | Compaction C optional, last | Codec risk against per-field savings | In scope |
| D13 | One fresh testnet redeploy, no migrations | Pre-mainnet rule; three testnet DAOs are the only state | In-place storage-version migrations with legacy proposal import |
| D14 | `token_uri` omits layer URLs; compositors derive layers from the existing per-trait getters; first caps on artwork strings (names 64, base URI 256, extension 16) | Bounds every read under the return-value limit; keeps compositors chain-only | Embedded layer URLs (Solidity); a bulk `token_layers` view (same limit); unbounded strings (draft 2's rule 5) |
| D15 | **Superseded by D43.** The Minter is a required shared platform module; the launch config pins it (`minter: Address`) and the token records it | Owner: the Minter is central to the protocol; the pin keeps the pre-launch review property | Optional per-DAO minter (`enable_minter`) |
| D16 | Renewal is a Manage tab with expiry dates, a duration choice and a simulated quote before signing; a platform admin dashboard does the same for platform-owned state | Owner's ask; a DAO decides how much to pay and for how long with the cost in front of it | Blind "renew everything" button; scripts only |
| D17 | `TTL_ECONOMICS.md` is rewritten as the storage, TTL and cost reference and gates completion | Owner's ask; the numbers come from § 10 measurements | Leave it as a policy summary |
| D18 | Every merkle root is published with its full tree at an on-chain `tree_uri` (IPFS), in the Uniswap merkle-distributor shape with an explicit algorithm header; consumers recompute the root before offering claims | Common practice (Uniswap-style files on IPFS; Sablier and thirdweb store the URI beside the root); removes the organizer as a single point of failure for ~60 bytes per round | Organizer-supplied proofs only; OZ `StandardMerkleTree` dump (no per-claim proofs, EVM hashing); leaves in events (16 KiB limit) |
| D19 | Artwork items chunked per property, IPFS groups in one vector, attributes paged 64 tokens per key, per-holder OZ entries out of the sweep | Makes the DAO sweep one transaction (≈ 60–80 keys against a 400-entry limit) at ~0.0035 XLM per `add_properties` rewrite and ~0.0004 XLM per mint | Per-key layouts with a seven-transaction sweep; a platform renewal service as the only path; whole catalogue in the instance (64 KB cliff) |
| D20 | Engineering review (2026-10-12): `/platform` dashboard deferred to its own wave; acceptance is automated tests, not a CLI; one `chain-reads` module owns key shapes; base64 in metadata | Scope and structure answers D2–D4 | Keep the dashboard; a published CLI; separate libs |
| D21 | Items in pages of 32 per property (≤ 32 pages) | One vector per property writes 160 KB at a 400-item cap, over the 132 KB per-transaction limit (eng review D6); 64-item pages measured 155,032 bytes, 32-item pages 89,496 | One vector with an 80-item cap; one key per item |
| D22 | Names with `"`, `\` or control characters rejected at setup | Keeps the on-chain JSON builder a plain concatenation (eng review D7) | Escape on output |
| D23 | **Superseded by D43.** The shared Minter gets the common upgrade path | It is required for every DAO and had no upgrade path (eng review D8) | Rotation playbook |
| D24 | Token drops the `uri` argument; OZ `base_uri` stored empty | Dead state once `token_uri` forwards to Metadata (eng review D9); removing the OZ field is not worth the divergence | Keep the argument |
| D25 | One PR, ten commits; regression contract: preserve everything except the listed removals, with retirement cards | Eng review D5 and D10 | Three PRs by layer; re-baseline freely |
| D26 | No storage key may encode like a linked OpenZeppelin key; token hook key renamed, governor `Proposal(id)` renamed; a guard test per module | The token collision broke minting on testnet DAO 0 after a rename (`STORAGE_DIET_REVIEW.md` Finding 1) | Rely on review |
| D27 | Instance and code TTL bumps decoupled: instances 60 → 170 days, code under 2 → 4 days | `instance().extend_ttl` bumps code too, so callers paid ~300 XLM of shared code rent (Finding 2) | Operations only (one missed renewal costs a member ~300 XLM) |
| D28 | Platform code renewal: 170-day default, refuse values at or below the code threshold, hash list from chain, extend at upload; code stays out of DAO sweeps | Renewals ≤ 60 days were paid twice; upgrade hashes were missed; code entries exceed the sweep's read-bytes limit | 30-day default from the deploy artifact |
| D29 | Fee guard before signing (50 XLM after measuring testnet rent); the 2× resource fee was an SDK double count, patched | A rent bump surfaced as a u32 overflow error | Leave to the SDK; 10 XLM (blocks DAO creation at testnet rent) |
| D31 | ~~Every OZ total-supply and quorum checkpoint is in the DAO sweep~~ (superseded by D33) | OZ binary-searches checkpoints and renews only what it reads, so an untouched midpoint can archive and break `proposal_state` years later. Supply checkpoints grow about one per auction day, so after roughly a year the sweep needs a second transaction (the batch splitter) | Renew only the latest checkpoints (breaks old lookups); compact checkpoints in the token |
| D30 | Every Tribe Builder storage key is wrapped as `("builder", Variant)` (named `builder` until D37); OZ keys untouched; an e2e test walks the ledger and rejects any other shape | Separates Builder keys from OZ keys by construction instead of by review; readable in explorers. Costs 32 bytes per key (DAO instances +1.5 KB, § 4) | Bare variants plus the D26 guard only; a shorter prefix |
| D32 | Compact Metadata storage: attribute pages as packed bytes (count byte + one byte per trait, two past 256 items), item pages as names + one group byte each, all property names in one key; every mint writes its record (empty before artwork) | Attribute pages were 64 % of the sweep at ~150 B per token (u32 value tags); item structs spent ~60 B per item on field names. Reference sweep 117 KB → 34 KB; a full attribute page 9.4 KB → 1.2 KB | Keep the u32 vectors; a seed per token (counts change after mint) |
| D33 | Proposals store the quorum fixed at creation (voting supply × current rate, the supply at the snapshot ledger by D40); only the latest supply and quorum checkpoints are swept | `proposal_state` binary-searched every checkpoint, so all had to stay live and the sweep grew ~180 B per auction day (~240 XLM more per year per year). Supply minted in the proposing ledger counts toward the quorum but cannot vote, so the requirement can only be higher | Keep every checkpoint live (D31) |
| D34 | The sweep covers what the DAO itself holds: tokens and balances of the Treasury, Auction and Marketplace, including asset-contract balances; `token_uri` checks existence by the id counter | OZ and the asset contract renew these 30 days per touch, so an idle DAO's funds and unsold tokens archived about a month after last use (e2e negative control); a 30-day ownership entry made idle members' tokens unrenderable | Leave them to whoever touches them |
| D35 | The app restores a member's archived records before their transaction (SDK `restore` for wallet-built calls; a 409 restore payload for server-prepared ones) | Members' entries renew 30 days per touch; without this every flow failed for a member back after a month | Extend member entries longer at the actor's cost |
| D36 | Platform renewal finds every running hash (current implementations, latest, each DAO module) and steps any extension whose fee would exceed 300 XLM | DAOs that skipped an upgrade ran code no pointer named; a fresh 43 KB code entry to 170 days simulates at ~360 XLM, 84 % of the u32 fee cap (STORAGE_DIET_FIX_REVIEW issues 1, 2) | Artifact hashes only; one extension per entry |
| D37 | The namespace symbol is `builder` (7 characters) instead of `buildeross` (10) | At most 9 characters the host keeps the symbol inline in a `Val`, so building a key allocates no host object; the XDR is 4 bytes shorter per key. Lowercase cannot equal a PascalCase OZ variant. Pinned bytes updated in Rust, the app and the scripts | Keep the 10-character name (readable, but a host object per key build) |
| D38 | A proposal is stored as `(proposer, 49 packed bytes)` instead of a field-named map; the app decodes it with one shared decoder | 424 → 268 bytes per live proposal (37 % of the proposals class); the map spent ~170 bytes on field names and value tags | Keep the map (self-describing in explorers) |
| D39 | Platform upgrade notice: the Manager's own upgrade and the shared Minter's wait `upgrade_delay()` ledgers after the Manager's approval; the delay is a constructor argument (`upgradeDelayLedgers`, short on testnet, 7 days recommended on a public network), the admin can raise it at once but a reduction applies only after the notice in force; `approve_upgrade` keeps the first approval's ledger | Every DAO depends on both contracts (registry, factory, pinned mint authority), and a Minter upgrade could mint against every DAO (contract review M1); the notice lets a DAO revoke the Minter's mint authority by proposal first | Immediate admin upgrades; a fixed delay (useless on testnet) |
| D40 | The stored quorum uses the voting supply at the previous ledger (`token.voting_supply_at_previous_ledger`, the two latest checkpoints only), the ledger votes are snapshotted at | With this ledger's supply a holder could escrow tokens in the Marketplace in the proposing ledger (lowering the supply) while still voting with them, then cancel: a 50 % quorum passable by 34 % (contract review H1). Same-ledger mints neither vote nor count | This ledger's supply (D33 as first implemented) |
| D41 | **Superseded by D43** (the shared Minter it guarded is gone). ~~Minter guardian~~: a per-DAO address able to revoke the shared Minter's mint authority without a vote was built and then **rejected by the owner** as an extra authority not worth its complexity. The limitation it addressed is documented instead: a DAO whose governance cycle exceeds the platform notice cannot revoke the Minter in time and trusts the platform admin for it, as it does for the Manager | Review 3, issue 1 asked for one of: a 92-day notice floor (rejected: unreasonable), capping governance cycles under the notice (rejected: constrains every DAO), or a fast exit (built, rejected). The notice is kept as a warning, and Manage shows pending platform upgrades | A notice floor; capped governance cycles; a guardian |
| D42 | The Manager and the shared Minter upgrade only to the hash announced as latest (`LatestImplementation(name)` now holds the hash and its announcement ledger; `latest_pointer(name)` reads it), and their notice counts from the later of the approval and the announcement; re-announcing a hash keeps its ledger | Review 4: the contracts accepted any approved hash, so an admin could approve a hostile build quietly and the "running → latest" display never showed it; now that pair is the only possible platform upgrade and is visible for the full notice, from chain state alone. DAO modules keep per-path approvals: their upgrade is their own vote, and migrations may need intermediate steps | Listing approvals from indexer events (needs the indexer, which the chain-only rule forbids relying on) |
| D43 | The shared Minter is retired ([membership-models](designs/membership-models.md)). Minting is capped per module: the Token keeps a registry of the DAO's modules with a `MintAllowance(module)` each (the admin mints without one), and claims move to a per-DAO ClaimMinter module (crate `contracts/minter`, kind `claims`) that each DAO upgrades by its own vote. D39 and D42 now apply to the Manager alone. Quick-buy pool stock is paged (`PoolStock(pool, page)`, 64 ids) and modules list their own renewal keys (`renewal_keys`), so the sweep stays one click for any module | A shared contract that could mint for every DAO was the platform's largest trust assumption (D39, D41); per-DAO modules remove it, and allowances cap what any module, Manager-built or not, can mint | Keep the shared Minter with a guardian (D41) or a notice floor |

## 13. Review record

Draft 1 (event-only diet): three independent review rounds, 7 → 8 → 8 / 10, PASS. Draft 2 (owner + Codex
rewrite): reviewed against the contracts; its factual anchors held, it found the proposal-payload gap, and it
reversed eight session decisions, which the owner then re-decided one by one into this draft. Draft 3 (this
document): three rounds, 7 / 10 each, stopped at the round cap with two blocking findings (bounded per-trait
reads; the launch Minter mechanism), both applied afterwards together with the owner's D10 revision and the minor
findings; the generated section below lists them as the reviewer last saw them. After the loop closed the owner
added D15–D19 (required shared Minter, the renewal tab and platform dashboard, the TTL reference doc, published
merkle trees, the one-transaction artwork layout) and the live testnet limits were read into § 7 and § 10.
Engineering review (`/plan-eng-review`, 2026-10-12): decisions D20–D25 above; full ledger and verdict in
`~/.gstack/projects/BuilderOSS-builder-stellar/feat-markdown-text-eng-review-20261012-141625.md`.
Independent review of the testnet settle and propose failures (`docs/STORAGE_DIET_REVIEW.md`, 2026-10-12):
both findings verified against the SDK source and the live chain and adopted as D26–D29; the token key
collision was already fixed on this branch.

## 14. Open questions

1. **`data:` URIs in Stellar wallets.** Which wallets and marketplaces render a `data:application/json;base64`
   `token_uri`? Test with the ones that matter before relying on it; HTTPS fallback exists either way.
2. **Profile `v` policy.** Read `v: 1` forever (default) or a one-time rewrite proposal per DAO on schema change.
3. **Renewal cadence.** Should the app nudge members when any DAO class drops under 45 days, as it does for
   artwork today? Default: yes, same thresholds, one button.
4. **One inventory fixture.** `dao_renewal_inventory` (Rust) and `buildDaoInventory` (TypeScript) are equivalent by
   hand. Dump the Rust key list from the e2e test and assert the TypeScript inventory against it, so a class added
   to one cannot be missed by the other.

<!-- gstack:office-hours:concerns:start -->
## Reviewer Concerns

Disposition: CONCERNS_RECORDED

Stop: MAX_ITERATIONS

### R3-1 — feasibility (blocking)

**Problem**

> Section 5 now says a compositor derives each layer with 'existing bounded reads' and names `get_property(i)` as the per-trait read for the property name, claiming 'every per-trait read [is bounded] to under 1 KB'. In the current contract `get_property` returns `Property { name, items: Vec<Item> }` assembled by reading every item of the property (contracts/metadata/src/storage.rs assemble_property, lines 200-214; contract.rs get_property line 403), and § 4 keeps 'Public shapes of get_property ... unchanged'. Its size is therefore bounded by the property's item count, not by the new caps: a property with a few hundred 64-byte items returns tens of KB, which is the same per-invocation return-value limit this change set out to avoid, and the § 10 gate ('each per-trait getter at 256-byte base URIs') varies only the base URI length, so a small fixture passes while the reference catalogue (300 items) can fail. The 1 + 3 x 16 read count and the 'under 1 KB' claim that D14 relies on do not hold for the getter named.

**Remedy**

> Take property names from the one bounded read the plan already adds, `property_headers()` (at most 16 `(name, count)` pairs), or from the header `get_items` already loads; rewrite the derivation as `get_attributes(token_id)` + `property_headers()` + per trait `get_items(i, j, 1)` and `get_ipfs_group(slot)`; state explicitly that `get_property` and `get_properties` are O(items) reads outside the chain-only path (or make `get_property` return the header only, which contradicts 'shape unchanged' and must then be decided); and gate the per-trait getters in § 10 against the largest-catalogue fixture (300 items), not only the 256-byte base URI.

### R3-2 — completeness (blocking)

**Problem**

> Section 4 Token says `launch` sets a new `Minter` instance key 'to the Minter it grants mint authority to (the `expected_minter` the DAO pinned)'. Today `token.launch(treasury, minters: Vec<Address>)` receives the canonical set [Treasury, Marketplace, Auction if launched, PlatformMinter if `enable_minter`] built by the Manager (contracts/manager/src/contract.rs lines 869-889); nothing in that call tells the token which entry is the claim Minter, and `expected_minter` is a field of the Manager's `LaunchConfig` that never reaches the token. `enable_minter` is optional, so a DAO can launch with no Minter at all. The document does not specify the interface change that lets the token learn the Minter (a new `launch` argument, or the Manager writing it), whether `minter()` returns `Option<Address>`, what the § 7 inventory row, the sweep and the TTL health report do for a DAO without a Minter, nor that Token `launch` and the Manager launch path change interfaces. Without this the inventory source the plan commits to cannot be built as described.

**Remedy**

> Specify the mechanism: e.g. `token.launch(treasury, minters, minter: Option<Address>)` where the Manager passes the pinned `expected_minter` (or `None`), the token stores it under `Minter` and `minter()` returns `Option<Address>`; state the inventory rule 'no Minter: no `MerkleRoot`/`MerkleRound` keys; the health report shows claims as not enabled rather than missing'; list the Token `launch` interface change under § 4 and the interface-bump list; add 'DAO launched without a minter' to the § 9 enumeration test and the fresh-client acceptance run.

### R3-3 — clarity (minor)

**Problem**

> The stored attribute vector is `[num_properties, item_index...]`: element 0 is the property count, not a trait index (contracts/metadata/src/contract.rs seed_token, lines 647-660). A compositor following § 5 literally would treat the count as the first item index and shift every layer by one.

**Remedy**

> Describe the shape as 'property count followed by one item index per property' (or decide that the new layout drops the leading count, since `ItemCounts.len()` now carries it) so the derivation in § 5 and the `/api/render` implementation agree with the stored vector.

### R3-4 — clarity (minor)

**Problem**

> The group count is not missing today: the public getter `ipfs_data_count()` already returns `get_ipfs_group_count` (contracts/metadata/src/contract.rs line 398). As written the plan ships two getters for one number and the '(missing today)' justification is inaccurate.

**Remedy**

> Either name `ipfs_data_count()` in § 4 and § 7, or state that `ipfs_group_count()` renames and replaces `ipfs_data_count()` (an interface change for the bindings and the artwork inspector).

### R3-5 — clarity (minor)

**Problem**

> Section 9 lists 'the per-trait layer derivation and percent-encoding' under the contract per-change tests, but after this change no contract code derives or encodes layer URLs; the derivation lives in a client library used by `/api/render` and the fresh-client CLI. It is unclear which component the test targets and whether the two consumers share one implementation.

**Remedy**

> Move the item to the Web tests, name the shared derivation module (used by `/api/render`, the inspector and the standalone acceptance CLI), and test it against a fixture with non-ASCII names to pin the percent-encoding rule.

### R3-6 — consistency (minor)

**Problem**

> Persisting from R2-4: § 4 Governor stores only `description_hash` in `ProposalPayload` yet still says 'Payload size counts against the existing action and description limits'. The description no longer contributes to payload size; only the `propose` transaction carries it.

**Remedy**

> Say the payload size counts against the action limits and that the description limit bounds the `propose` transaction (covered by the § 10 gate on 'propose with a maximum description').

### R3-7 — clarity (minor)

**Problem**

> Persisting from R2-6: the decision ledger still lists D14 before D13, and the § 3 `token_uri` row still describes the document 'like the Nouns Builder Solidity renderer' without saying that layer URLs are omitted and derived per trait, so the two tables read as if they disagree with D14.

**Remedy**

> Order the ledger D13, D14 and add 'layer URLs omitted; compositors derive them from the per-trait getters' to the § 3 `token_uri` row.

### R3-8 — clarity (minor)

**Problem**

> Persisting from R2-7 (R1-5): § 3, § 4 and § 12 still use the codes G1, G2, G4, S3, S4 and 'compaction C' from the superseded drafts without defining them.

**Remedy**

> Define each code in one line at first use or in a short glossary, or replace the codes with the plain decision names.

### R3-9 — completeness (minor)

**Problem**

> Persisting from R2-10 (R1-9): § 2 and the § 7 inventory still list per-token `Approval(t)` as persistent and part of the sweep; the OZ non-fungible `Base` keeps the single-token approval in temporary storage with its own `live_until_ledger`.

**Remedy**

> Verify the storage class of the OZ approval entries and remove them from the sweep inventory if temporary, noting that approvals carry their own expiry.

### R3-10 — feasibility (minor)

**Problem**

> Persisting from R2-11 (R1-10): the § 9 contract e2e still ends with 'renew and restore an archived entry (the test env can advance ledgers past TTL)'. `ExtendFootprintTTL` and `RestoreFootprint` are transaction-level operations the Rust test env cannot submit.

**Remedy**

> Move the renew-and-restore step to the local-network fresh-client acceptance run, or state exactly how the Rust test env performs it.

### R3-11 — completeness (minor)

**Problem**

> Persisting from R2-12 (R1-11): § 7 still splits the sweep only by `txMaxReadLedgerEntries`; read bytes, write bytes for restore and transaction size also bound footprint operations.

**Remedy**

> List every limit the batcher reads from the live network config and state which one it splits on.

### R3-12 — clarity (minor)

**Problem**

> Persisting from R2-13 (R1-12): § 7 still says archived keys go through `RestoreFootprint` first 'from the same inventory' without defining how a key is judged archived, and the health report's 'expired' state needs the same rule.

**Remedy**

> Define archived detection against the enumerated key set (expected key absent from `getLedgerEntries` or past `liveUntilLedgerSeq`) and the error surfaced when a restore reports no such entry.

### R3-13 — clarity (minor)

**Problem**

> Persisting from R2-14 (R1-13): § 6 still compares sha256 of 'the indexed profile' with `profile_hash()` without requiring the indexer to keep the `ProfileUpdated` string byte-for-byte; any re-encoding or trimming makes every profile show as unavailable.

**Remedy**

> State that the indexer stores the profile bytes verbatim (or the event hash alongside) and add that case to the § 9 web and indexer tests.

### R3-14 — completeness (minor)

**Problem**

> Persisting from R2-15 (R1-14): the § 7 platform-duty row still covers only shared WASM code; nothing assigns renewal of the Manager instance and registry entries that `version()` and upgrades depend on, nor of the platform Minter's own instance that claims depend on.

**Remedy**

> Add the Manager instance and registry entries and the platform Minter instance to the platform-duty row (or to `renew-code-ttl.mjs`) so the dependency chain for `version()`, upgrades and claims is covered.

### R3-15 — consistency (minor)

**Problem**

> Persisting from R2-16 (R1-15): § 2 still ends 'Nothing in this plan deletes any class above' while the table's 'Claim markers, roots, rounds' row includes the allowlist markers and the Settings row includes the four display strings, both removed by § 4.

**Remedy**

> Qualify the sentence or split the rows so the statement is accurate.

### R3-16 — feasibility (minor)

**Problem**

> Persisting from R2-17 (R1-16): the sweep client must reproduce the LedgerKey encoding of every storage enum in seven contracts plus the Minter and the OZ-internal keys; the document still treats those shapes as implementation detail rather than a published interface guarded by the § 9 enumeration test.

**Remedy**

> State that storage key shapes are part of the published interfaces, document them with the bindings, and name the enumeration test as the regression guard for storage and OZ version changes.

### Prior finding evidence

**R2-4 → R3-6 (persisting)**

> § 4 Governor still reads 'Payload size counts against the existing action and description limits' while the payload stores only `description_hash`.

**R2-6 → R3-7 (persisting)**

> The ledger still lists D14 before D13, and the § 3 `token_uri` row is unchanged ('built from on-chain names like the Nouns Builder Solidity renderer') with no mention that layer URLs are omitted.

**R2-7 → R3-8 (persisting)**

> § 3 still uses '(G1)', '(S3)', '(S4)', '(G2)', '(G4)' and 'compaction C'; § 4 and § 12 repeat them; no definition anywhere.

**R2-10 → R3-9 (persisting)**

> § 7 row 'Metadata `Attributes(t)`, Token `Owner(t)`, `Approval(t)` | `t < total_supply`' and § 2 'Per-token attributes, owner, approval ... persistent' are unchanged.

**R2-11 → R3-10 (persisting)**

> § 9 contract e2e still ends 'renew and restore an archived entry (the test env can advance ledgers past TTL)' with no statement of how the Rust test env performs a RestoreFootprint.

**R2-12 → R3-11 (persisting)**

> § 7 'App and script' still splits only 'under the network's per-transaction read-entry limit (`txMaxReadLedgerEntries`, read from the live config, not assumed)'.

**R2-13 → R3-12 (persisting)**

> § 7 still says 'Archived keys go through `RestoreFootprint` first, from the same inventory' without defining archived detection or the health report's 'expired' rule.

**R2-14 → R3-13 (persisting)**

> § 6 'App verification: the indexed profile's `sha256` is compared with `profile_hash()`' is unchanged; § 8 Indexer does not require byte-for-byte storage of the `ProfileUpdated` string.

**R2-15 → R3-14 (persisting)**

> § 7 platform-duty row is still only 'Shared WASM code | registry; platform duty (`renew-code-ttl.mjs`), not the DAO's'; the Manager instance, registry entries and platform Minter instance have no assigned renewer.

**R2-16 → R3-15 (persisting)**

> § 2 still ends 'Nothing in this plan deletes any class above' while § 4 removes the allowlist markers and the four Settings display strings listed in the table.

**R2-17 → R3-16 (persisting)**

> No section states that storage key shapes are a published interface; § 9 still names only the enumeration test, and the inventory now also depends on the Minter's and the new Token `Minter` key shapes.

### Unresolved at the cap

1. R3-1 — feasibility (blocking): Section 5 now says a compositor derives each layer with 'existing bounded reads' and names `get_property(i)` as the per-trait read for the property name, claiming 'every per-trait read [is bounded] to under 1 KB'. In the current contract `get_property` returns `Property { name, items: Vec<Item> }` assembled by reading every item of the property (contracts/metadata/src/storage.rs assemble_property, lines 200-214; contract.rs get_property line 403), and § 4 keeps 'Public shapes of get_property ... unchanged'. Its size is therefore bounded by the property's item count, not by the new caps: a property with a few hundred 64-byte items returns tens of KB, which is the same per-invocation return-value limit this change set out to avoid, and the § 10 gate ('each per-trait getter at 256-byte base URIs') varies only the base URI length, so a small fixture passes while the reference catalogue (300 items) can fail. The 1 + 3 x 16 read count and the 'under 1 KB' claim that D14 relies on do not hold for the getter named.
2. R3-2 — completeness (blocking): Section 4 Token says `launch` sets a new `Minter` instance key 'to the Minter it grants mint authority to (the `expected_minter` the DAO pinned)'. Today `token.launch(treasury, minters: Vec<Address>)` receives the canonical set [Treasury, Marketplace, Auction if launched, PlatformMinter if `enable_minter`] built by the Manager (contracts/manager/src/contract.rs lines 869-889); nothing in that call tells the token which entry is the claim Minter, and `expected_minter` is a field of the Manager's `LaunchConfig` that never reaches the token. `enable_minter` is optional, so a DAO can launch with no Minter at all. The document does not specify the interface change that lets the token learn the Minter (a new `launch` argument, or the Manager writing it), whether `minter()` returns `Option<Address>`, what the § 7 inventory row, the sweep and the TTL health report do for a DAO without a Minter, nor that Token `launch` and the Manager launch path change interfaces. Without this the inventory source the plan commits to cannot be built as described.

issues verified: 2 of 2

Verification is deterministic: a fix counts when its `applied_text` is in the current design and absent from the round-3 snapshot. It confirms applied edits, never a review verdict; no reviewer was launched past the cap.
<!-- gstack:office-hours:concerns:end -->
