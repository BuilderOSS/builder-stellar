# TODOS

## Platform

### `/platform` admin dashboard

**What:** A `/platform` area gated to the Manager admin wallet: platform renewals (Manager instance, `Implementation(hash)` records, shared WASM code) with the same quote-before-sign flow as the DAO Renewal tab; the registry actions the scripts perform today (register, approve, set latest, set current implementations); a per-DAO health table (earliest expiry per class, last sweep).

**Why:** Platform duty lives in scripts and `deploys/*.json`; the operator has no view of which communities are about to archive. Deferred from the storage-diet release (`docs/STORAGE_DIET.md` D20) to keep that release to DAO-facing work.

**Context:** Build on the storage-diet release: the `apps/web/src/lib/chain-reads/` module (key shapes, inventory) and the Renewal tab are the building blocks; `scripts/renew-code-ttl.mjs` (extended to Manager and registry keys in that release) is the key list to replace. See `docs/STORAGE_DIET.md` § 7–8.

**Effort:** L
**Priority:** P2
**Depends on:** storage-diet release merged (chain-reads module, Renewal tab)

## Membership

### Vote delay for pool purchases

**What:** Tokens bought from a Marketplace quick-buy pool start voting only T days after purchase (a delay on their voting units), so a buyer who drains a pool can't swing a proposal right away.

**Why:** Per-buyer caps can be dodged with extra wallets; the pool-wide sales rate only slows a funded buyer. A vote delay is the one defense that holds against a buyer splitting purchases across wallets. Deferred in the membership-models design (Open Question 1; owner chose caps, sales rate and size warning, D4, 2026-10-13).

**Pros:** Closes the remaining takeover path for open sales; pools can then be larger.

**Cons:** Touches Token checkpoints and delegation, and every holder view must explain "votes from <date>"; the biggest change in that design for a risk not yet seen.

**Context:** Trigger: a testnet pool drained by one wallet cluster, or a planned mainnet pool larger than 10% of voting supply. Start from `docs/designs/membership-models.md` §4 and the Token's `transfer_voting_units` path (`contracts/token/src/contract.rs` voting_holder/move_voting_unit).

**Effort:** L
**Priority:** P3
**Depends on:** quick-buy pools (docs/designs/membership-models.md §4), shipped on testnet in 0.4.0

## Token

### Verify `data:` token URIs in Stellar wallets

**What:** On the redeployed testnet, check that Freighter and the wallets/marketplaces that matter render the on-chain `data:application/json;base64` `token_uri`; if one does not, point `renderer_base` at HTTPS JSON served by `/api/token` (no contract change).

**Why:** SEP-50 says `token_uri` "returns an url"; no public evidence either way was found (two searches, 2026-10-12). Settles `docs/STORAGE_DIET.md` open question 1 (§ 12) before mainnet.

**Context:** Needs a minted token on the redeployed testnet. The HTTPS fallback already exists (`docs/STORAGE_DIET.md` § 5), so this is verification, not design.

**Effort:** S
**Priority:** P2
**Depends on:** testnet redeploy of the storage-diet release

## Completed
