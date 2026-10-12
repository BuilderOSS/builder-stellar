# TODOS

## Platform

### `/platform` admin dashboard

**What:** A `/platform` area gated to the Manager admin wallet: platform renewals (Manager instance, `Implementation(hash)` records, shared WASM code, the shared Minter) with the same quote-before-sign flow as the DAO Renewal tab; the registry actions the scripts perform today (register, approve, set latest, set current implementations, set platform minter); a per-DAO health table (earliest expiry per class, last sweep).

**Why:** Platform duty lives in scripts and `deploys/*.json`; the operator has no view of which communities are about to archive. Deferred from the storage-diet release (eng review D2, 2026-10-12) to keep that release to DAO-facing work.

**Context:** Build on the storage-diet release: the `apps/web/src/lib/chain-reads/` module (key shapes, inventory) and the Renewal tab are the building blocks; `scripts/renew-code-ttl.mjs` (extended to Manager and registry keys in that release) is the key list to replace. See `docs/STORAGE_DIET.md` § 7–8.

**Effort:** L
**Priority:** P2
**Depends on:** storage-diet release merged (chain-reads module, Renewal tab)

## Token

### Verify `data:` token URIs in Stellar wallets

**What:** On the redeployed testnet, check that Freighter and the wallets/marketplaces that matter render the on-chain `data:application/json;base64` `token_uri`; if one does not, point `renderer_base` at HTTPS JSON served by `/api/token` (no contract change).

**Why:** SEP-50 says `token_uri` "returns an url"; no public evidence either way was found (two searches, 2026-10-12). Settles `docs/STORAGE_DIET.md` open question 14.1 before mainnet.

**Context:** Needs a minted token on the redeployed testnet. The HTTPS fallback already exists in the plan (§ 5), so this is verification, not design.

**Effort:** S
**Priority:** P2
**Depends on:** testnet redeploy of the storage-diet release

## Completed
