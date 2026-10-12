# Review: testnet settle and propose failures, and what STORAGE_DIET.md must add

*Independent review, 2026-10-12. Scope: contracts as of f1e45dc (`fix(web): signing works from WalletConnect wallets`), the live testnet DAO 0 (`builder`), and `docs/STORAGE_DIET.md` (approved 2026-10-12, not yet implemented). The later in-flux contract commits (c6b0b1f and after) were deliberately not reviewed.*

## 1. Summary

The two failures reported on 2026-10-12 have separate causes. Neither is f1e45dc, which only changes web wallet signing.

| Symptom | Root cause | Class | Fixed by STORAGE_DIET as written? |
|---|---|---|---|
| Settle and create traps in `token.mint` (`UnreachableCodeReached`) | The token's own `TokenKey::Metadata` key encodes identically to OpenZeppelin's `NFTStorageKey::Metadata`. A later `set_metadata` overwrote the metadata-hook address with OZ's `{base_uri, name, symbol}` map. | Contract bug (storage key collision) | **No.** The diet adds more readers of the OZ half (SEP-50 `name`/`symbol`/`token_uri`) and makes `token.metadata()` an inventory source, so the bug becomes easier to hit. |
| `propose` fails: "Total fee … exceeds the maximum uint32 value … Got 5993640048" | The 0.2.0 code entries for governor, auction and marketplace were uploaded at the network-minimum TTL and never extended (5.8 days left). `extend_instance` bumps code with the instance's 60/170-day policy, so the next caller pays ~300 XLM of shared code rent. | TTL policy and operations | **No.** The diet keeps in-contract renewal "as it is" and leaves code to `renew-code-ttl.mjs`, whose default (30 days) is below the 60-day threshold that triggers the caller-paid bump. |

Urgent, independent of the diet: those three code entries **archive around 2026-10-18** unless someone pays to extend them. After that every governor, auction and marketplace call on testnet needs a restore first.

## 2. Finding 1: token storage key collides with OpenZeppelin's NFT metadata key (critical)

### Mechanism
- A `#[contracttype]` enum variant encodes as `ScVal::Vec([Symbol(variant_name), args…])`. The enum's type name is not part of the key, so two enums with a same-named, same-arity variant address the same storage slot.
- `contracts/token/src/storage.rs`: `TokenKey::Metadata` (unit) holds the **metadata contract `Address`** used by the mint hook.
- OZ `stellar-tokens` (rev fbfde38) `non_fungible/storage.rs:27`: `NFTStorageKey::Metadata` (unit) holds `Metadata { base_uri, name, symbol }`. `Base::get_metadata` (l.136) backs `name()`, `symbol()`, `base_uri()` and `token_uri()`. `Base::set_metadata` (l.597) writes it.
- Token constructor at f1e45dc (`contracts/token/src/contract.rs:62,65`): `Base::set_metadata(...)` then `instance.set(&TokenKey::Metadata, &metadata)`. The address overwrites the OZ map at deploy. From that moment the OZ getters are the broken half.
- `token.set_metadata` (admin, i.e. Treasury by proposal) calls `Base::set_metadata` and overwrites the address with the map. From then on `metadata()` is the broken half:
  - `mint` → `call_metadata_hook` (l.383) → `Self::metadata(e)` → `instance().get::<_, Address>()` on a map → conversion panic → `UnreachableCodeReached`.
  - The panic happens before `try_on_minted`, so `try_` cannot catch it. That is why the event log shows the OZ `mint` event for token 32 and then the trap, with no metadata `fn_call` in between.
  - `batch_mint` fails the same way (`call_metadata_batch_hook`).

### Evidence (testnet, ledger ≈ 5,155,790)
- The token `CDK3…CZTR6` instance (code `c5a5c738`, token 0.2.0) holds `Metadata = {base_uri: ".../api/dao/{daoId}/token/", name: "Builder DAO", symbol: "BUILD"}`. No entry holds the metadata address `CDK5…LO45`.
- `stellar contract invoke --send=no -- metadata` on the token traps with `VM call trapped: UnreachableCodeReached, metadata`.
- Mints 1–31 succeeded, so the overwrite happened after token 31. The deploy records only show `upgrade` and `sync_version` for token, so it was a later rename or profile proposal. The RPC event window didn't let me pin the transaction.

### Impact
- Any DAO whose token is renamed can no longer mint: auctions stop at settle, founder or batch mints fail, and claims through the Minter fail.
- Before a rename, OZ `name()`, `symbol()` and `token_uri()` trap on every DAO.
- Recovery on a live DAO needs a code change, because the address is gone from storage.

### Related latent overlap (low; fix while the diet touches the governor)
- `GovernorKey::Proposal(BytesN<32>)` encodes the same as OZ `GovernorStorageKey::Proposal(BytesN<32>)` but stores `ProposalCoreTime`, while OZ stores `ProposalCore`.
- It is safe today only because every OZ trait method that reads that key (`proposal_state`, `proposal_snapshot`, `proposal_deadline`, `proposal_proposer`, `propose`, `cast_vote`, `queue`, `execute`, `cancel`) is overridden, and the contract never calls `governor::get_proposal_core` or the OZ setters.
- An OZ upgrade that adds a default method reading `Proposal(id)`, or a future call to an OZ helper, would trap the same way.
- A sweep of every module enum at f1e45dc against the OZ key enums each module uses found no other overlap within the same contract. `Admin`, `PendingAdmin` and `Config` match OZ access-control and compliance names, but those OZ modules aren't linked into the matching contracts.
- None of the keys the diet introduces (`Minter`, `ProposalId`, `ItemCounts`, `PropertyName`, `Items`, `IpfsGroups`, `AttributesPage`, `MerkleRoot`, `MerkleRound`) collide with OZ.

## 3. Finding 2: callers pay for shared code rent whenever code falls under 60 days (high)

### Mechanism
- `contracts/common/src/ttl.rs` `extend_instance` = `instance().extend_ttl(INSTANCE_TTL_THRESHOLD = 60 d, INSTANCE_TTL_EXTEND_TO = 170 d)`.
- In soroban-sdk 27.0.6 (`storage.rs:609–624`) this calls `extend_current_contract_instance_and_code_ttl`. The threshold check and the extension apply to **both** the instance and the code entry.
- Every state-changing entry point calls `extend_instance`. So whenever a module's code entry has under 60 days left, the next caller pushes it to 170 days and pays all of that rent. For a ~35 KB code entry on testnet that is ~300 XLM (the existing `deploy-manager.mjs` comment measured ~213 XLM for 34 KB in an earlier fee regime).
- Newly uploaded code starts at `min_persistent_ttl` (120,960 ledgers ≈ 7 days). So **every upload is born inside the trap.**

### Evidence (testnet, 2026-10-12)

| Module | Code hash | Instance TTL | Code TTL |
|---|---|---|---|
| governor | 5f4c9b3a… | 167.8 d | **5.8 d** |
| auction | 39220837… | 167.8 d | **5.8 d** |
| marketplace | bdea07f0… | 167.8 d | **5.8 d** |
| token | c5a5c738… | 167.8 d | 168.2 d |
| metadata | e1aec5e8… | 167.8 d | 167.8 d |
| treasury | 07f27259… | 167.8 d | 167.8 d |
| manager | 5bc08fd3… | 167.8 d | 168.7 d |

- The three stale hashes are the 2026-10-11 comments 0.2.0 upgrades. The token 0.2.0 code was extended after its upload; these were not.
- A minimal one-action `governor.propose` simulates at a resource fee of **2,998,799,289 stroops (~300 XLM)**. It writes only 336 bytes (one new `Proposal` entry), and the footprint shows nothing else large. The cost is the governor code bump.
- Settle will hit the auction code the same way once Finding 1 is fixed. Any listing or purchase hits the marketplace code.

### Contributing defects
- `scripts/renew-code-ttl.mjs` defaults to `--days 30`, and `docs/TTL_ECONOMICS.md` recommends `--days 30`. A 30-day code TTL is still under the 60-day threshold, so the renewal pays rent **and** leaves the next caller to pay for 170 days anyway. Any renewal ≤ 60 days is wasted.
- `scripts/deploy-manager.mjs` code extension is opt-in (`EXTEND_CODE_TTL_DAYS` defaults to 0). A fresh redeploy without it reproduces the trap on day one (the script's own comment: "the first create_dao paid ~223 XLM").
- Nothing in the upgrade path extends a newly uploaded hash. `TTL_ECONOMICS.md` says the renewal script does not "discover later DAO upgrade hashes".
- The admin panel's health thresholds (soon < 45 d, critical < 14 d) report code at 45–60 days as healthy, even though callers already pay the 170-day bump at that point.

### Open item: the 2× in the reported fee
The app reported 5,993,640,048, about 2 × the simulated 2,998,799,289. That suggests the resource fee is being counted twice somewhere in the web assemble path, e.g. re-assembling an already-assembled transaction. `assembleTransaction` in stellar-sdk 17.1.0 only subtracts the previous resource fee when the classic fee exceeds it. **Not confirmed.** Worth a separate check in the web signing path. Even without doubling, 300 XLM per proposal is the real problem.

## 4. Does STORAGE_DIET.md address these?

**Finding 1: no, and the diet raises exposure.**
- § 4 Token adds SEP-50 `name`, `symbol` and `token_uri` "over the OZ `Base` state the token already uses (`Base::set_metadata` stores name and symbol today)". It keeps `set_metadata(name, symbol)` writing OZ `Metadata`, and leaves `TokenKey::Metadata` as is. On a fresh deploy the new SEP-50 getters trap. After the first rename, mint traps.
- § 7 lists `token.metadata()` (existing) as the inventory source for the Metadata instance, so after a rename the renewal sweep cannot be built either.
- § 9's enumeration test asserts the inventory against the persistent keys the e2e flow wrote. Instance storage keys live inside one instance entry, so that test cannot see an instance-key collision.
- The diet's fresh testnet redeploy (§ 3 rollout) does make recovering DAO 0 unnecessary, provided the key is fixed in the same release.

**Finding 2: no.**
- § 7 "Consequences for contracts": "In-contract threshold renewal on touched keys stays as it is". Code is "platform duty: `scripts/renew-code-ttl.mjs`", with the script only gaining the Manager instance, `Implementation(hash)` records and the Minter (§ 7 inventory row, § 8 l.396–398).
- None of the three defects above is addressed: the 30-day default, opt-in extension at deploy, and no extension on upgrade upload. So the trap persists after the diet: at day one of the redeploy, after every module upgrade, and whenever a renewal is missed.

## 5. Suggested changes to STORAGE_DIET.md

### 5.1 § 4 Token: separate the hook address from OZ metadata (required)
- Rename `TokenKey::Metadata` → `TokenKey::MetadataHook` (any name not used by an OZ key). Update the constructor, `metadata()`, `call_metadata_hook` and `call_metadata_batch_hook`. Public getter names and shapes are unchanged.
- Add a rule to § 4 "All DAO modules": *no module storage variant may share its `(symbol, arity)` with an OpenZeppelin storage key used by that module (`NFTStorageKey`, `VotesStorageKey`, `GovernorStorageKey`, and any OZ module added later).*
- Governor: rename `GovernorKey::Proposal(id)` → e.g. `ProposalTime(id)` in the same release (the diet already touches governor storage with `ProposalId(seq)`). This removes the latent overlap in § 2.
- Add both renames to the § 7 key-shape inventory and to `apps/web/src/lib/chain-reads/` key builders, since key shapes become published interfaces in the diet.

### 5.2 § 9 Tests: catch this class of bug (required)
- **Token unit tests.** After construction, `name()`, `symbol()`, `token_uri()` and `metadata()` all return. After `set_metadata(name, symbol)`, `metadata()` still returns the hook, and `mint` and `batch_mint` still seed attributes (assert via `metadata.token_attributes`).
- **Key-collision guard** (one test per module, or one in `common` with a per-module table). Build the `ScVal` of every variant of the module's key enums with dummy arguments. Build the same for the OZ key enums that module links. Assert the `(first symbol, vec length)` pairs are disjoint. This is cheap and catches future additions.
- **e2e.** A live DAO renames by proposal, then settles an auction. The mint succeeds and the new token has attributes.

### 5.3 § 7: make code renewal impossible to get wrong (required, pick A or B)
- **A (recommended): split the code bump from the instance bump in `common::ttl`.**
  - `extend_instance` becomes `e.deployer().extend_ttl_for_contract_instance(self, 60 d, 170 d)` plus `e.deployer().extend_ttl_for_code(self, CODE_TTL_THRESHOLD, CODE_TTL_EXTEND_TO)`, with small values (e.g. 7 d / 14 d).
  - Effect: the platform's renewal keeps code long and callers normally pay nothing. If the platform lapses, a caller pays at most ~14 days of code rent (≈ 1/12 of today's 300 XLM) instead of 170 days, and code still never archives while the DAO is used.
  - The diet's S3 change already touches `common` across all modules, so this lands in the same release.
- **B: keep the contracts and harden operations only.** Do all of 5.4. One missed renewal then costs some member ~300 XLM (testnet scale), which most wallets cannot pay. That is why A is recommended.

### 5.4 § 7 / § 8: platform renewal, needed in both A and B
- `renew-code-ttl.mjs`:
  - Default to 170 days. Reject (or require `--force` for) any value ≤ `INSTANCE_TTL_THRESHOLD` (60 d) under option B, or ≤ `CODE_TTL_THRESHOLD` under A, and print why.
  - Build the hash list **from chain**: Manager registry `Implementation(hash)` records, and current implementation per module. Do not use the deploy artifact, so upgrade hashes are always included.
- Upgrade and registration path (`deploy-manager.mjs`, whatever registers a new implementation): extend the new code to 170 days immediately after upload. Make `EXTEND_CODE_TTL_DAYS` default to 170 rather than opt-in, at least for the § 3 fresh redeploy.
- Renewal tab and health report:
  - Classify code (and instances) against the contract threshold: "critical" below the threshold at which a caller would pay (60 d under B, `CODE_TTL_THRESHOLD` under A).
  - Show the quoted cost of the next caller-paid bump.
- `TTL_ECONOMICS.md` (which the diet rewrites): state that `instance().extend_ttl` governs code as well, record the measured ~300 XLM per 35 KB per 164 days on testnet (2026-10-12), and delete the 30-day recommendation.

### 5.5 § 8 App: fail clearly when a simulation includes a large rent bump (recommended)
- Before signing, if the simulated resource fee exceeds a threshold (e.g. 10 XLM), stop and explain: "This action would pay ~N XLM to renew shared contract code. The platform renews this; please report it." This replaces the SDK's uint32 error, or a silent 300 XLM charge.
- Investigate the 2× resource fee in the assemble path (§ 3, open item).

### 5.6 § 3 Rollout checklist (add)
1. Key renames from 5.1 are in the release, and the 5.2 tests are green.
2. Fresh redeploy with code extended to 170 days at upload (5.4).
3. Post-deploy check: every module code TTL > threshold, and `token.metadata()`, `token.name()` and a rename-then-settle succeed on testnet.

## 6. Interim testnet note (no action taken)
- Until the diet's redeploy, DAO 0 on testnet cannot mint (Finding 1), and any first propose, settle or market call pays ~300 XLM per stale code entry (Finding 2).
- An operator `stellar contract extend --wasm-hash <hash> --ledgers-to-extend 2937600 --durability persistent` for the three hashes, one transaction each to stay under u32, would unblock proposals before the ~2026-10-18 archival.
- Settle stays broken until the token is fixed. Per the user's instruction, nothing was run.

## 7. Method
- Read-only simulation against `soroban-testnet.stellar.org` (protocol 29, RPC 29.0.0): `token.metadata()`, and a minimal `governor.propose` with footprint and resource decode.
- `getLedgerEntries` for instance and code TTLs. Contract source at f1e45dc via `git show`. OZ `stellar-contracts` fbfde38 sources. soroban-sdk 27.0.6 `Instance::extend_ttl` docs and source.
- A scripted comparison of every module key enum against OZ key enums.
