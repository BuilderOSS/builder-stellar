# TODOS

## Membership

### Vote delay for pool purchases

**What:** Tokens bought from a Marketplace quick-buy pool start voting only T days after purchase, so a buyer who drains a pool can't swing a proposal right away.

**Why:** Per-buyer caps can be dodged with extra wallets; the pool-wide sales rate only slows a funded buyer. A vote delay is the one defense that holds against a buyer splitting purchases across wallets. Deferred in the membership-models design (Open Question 1; owner chose caps, sales rate and size warning, D4, 2026-10-13).

**Pros:** Closes the remaining takeover path for open sales; pools can then be larger.

**Context:**
- Trigger: a testnet pool drained by one wallet cluster, or a planned mainnet pool larger than 10% of voting supply. Start from `docs/designs/membership-models.md` §4.
- Today `buy_from_pool` (`contracts/marketplace/src/contract.rs`) transfers the token to the buyer in the same call, and the Token's `move_token` moves its voting unit at once, so it counts at the next proposal snapshot. Either contract has to change.
- **Option 1, delay in the Token:** tokens from the Marketplace arrive without their voting unit, and an `activate(token_id)` call after T moves it (checkpoints change only when a transaction runs). Touches checkpoints, delegation (transfer or re-delegation during the delay) and the balance = voting units invariant, in the contract every tribe's vote depends on. Effort L.
- **Option 2, the Marketplace holds the token for T days (preferred starting point):** `buy_from_pool` takes payment and records a pending claim (token, buyer, claimable after T) instead of transferring; a new `claim(token_id)` transfers it after T, and only then does the voting unit move. The Marketplace is already a `non_voting` module, so the Token, checkpoints and delegation are unchanged. Costs:
  - the buyer can't see or transfer the token for T days, and someone must call `claim` (a "Claim your token" button, or anyone on the buyer's behalf);
  - `close_pool` and `sweep_pool` must leave pending claims alone;
  - per-buyer caps and the sales rate count at purchase, not claim;
  - the web needs a pending-tokens view and the indexer a claim event;
  - live tribes upgrade the Marketplace by proposal.

  Effort M.
- Either way, holder views must explain "votes from <date>" (Option 1) or "yours from <date>" (Option 2).

**Effort:** M (Option 2) or L (Option 1)
**Priority:** P3
**Depends on:** quick-buy pools (docs/designs/membership-models.md §4), shipped on testnet in 0.4.0

### Clean-up steps for listings and stray tokens when removing a market or auction

**What:** In Manage → Membership → Remove, offer two more clean-up steps for the same proposal: "Return a listing" (`marketplace.return_listing(token_id)`, one per open listing, after "Pause the market") and "Recover a token sent to the module" (`marketplace.recover_token` or `auction.recover_token`, to the Treasury). Add both to the proposal-action catalog.

**Why:** The Token now refuses to unregister a non-voting module that holds any token (`ModuleHoldsTokens`, 7222). The Remove sheet adds close-and-sweep for pools (enough sweeps for each pool's largest possible stock) and pause-and-cancel for a running auction, and its chain check passes when those steps empty the module. A market with open listings, or a module someone sent a token to directly, can only be emptied with these two calls, which the app doesn't offer, so for those the sheet shows the 7222 message and can't add the removal.

**Context:**
- `apps/web/src/lib/modules/plans.ts` (`buildDetachPlan`), `readiness.ts` (`planEmptiesModule` decides whether the chosen steps empty the module), `use-module-reads.ts` (`checkDetach` skips simulating the removal alone when they do).
- The listings to return come from the market index; stray tokens are tokens the module holds that no listing, pool page, or running auction records.
- Both calls need the module paused first; `recover_token` on the market also needs every pool swept (`PoolOpen`).
- The Token refuses a token sent to a module by anyone but the module (`ModuleCustodyClosed`, 7224), so a stray token is one sent before that rule. A listing made, or cancelled, after drafting still makes the proposal fail; the sheet can only check what the module holds now, so it could suggest pausing the market in an earlier proposal.

**Effort:** M
**Priority:** P2
**Depends on:** the contract release that adds `return_listing` and `recover_token`

## Token

### Verify `data:` token URIs in Stellar wallets

**What:** On the redeployed testnet, check that Freighter and the wallets/marketplaces that matter render the on-chain `data:application/json;base64` `token_uri`. First check that each shows NFTs from a custom contract at all; if it doesn't, no URI format helps. If one that matters needs an HTTPS `token_uri`, build the optional HTTPS mode below.

**Why:** SEP-50 says `token_uri` "returns an url"; no public evidence either way was found (two searches, 2026-10-12). Settles `docs/STORAGE_DIET.md` open question 1 (§ 12) before mainnet.

**Context:**
- Needs a minted token on the redeployed testnet.
- There is no fallback today. `renderer_base` fills only the JSON's `image` field; Metadata's `token_uri` (`contracts/metadata/src/contract.rs`) always returns the `data:` document, so changing `renderer_base` changes where the picture loads from, not the URI format.
- HTTPS mode, if needed:
  - **Metadata:** an optional `uri_base` in the settings, with an admin-only setter so each tribe opts in by proposal. When set, `token_uri` returns `<uri_base>/<token>/<id>`; when unset, the `data:` document as now. Adding the field likely needs a `STORAGE_VERSION` bump and migration.
  - **Token:** unchanged; its `token_uri` forwards to Metadata.
  - **Web:** a route (e.g. `/api/token/[contract]/[id]`) that simulates the on-chain `token_uri` and returns the decoded JSON, so HTTPS can't drift from the chain. Short cache: names can change after an artwork reset.
  - **Rollout:** testnet redeploys; live tribes pass one proposal that upgrades Metadata and sets `uri_base`.

**Effort:** S to verify; S–M for HTTPS mode
**Priority:** P2
**Depends on:** testnet redeploy of the storage-diet release

## Indexer

### Index proposal call arguments with their types

**What:** Carry every proposal call argument from the chain to the API in its typed form (the `ScVal`, not just its value), so the proposal page re-encodes any call exactly and checks the proposal ID without knowing the callee's signature. Then remove the web-side type recovery.

**Why:** The decoder (`packages/goldsky/src/decoded-events.script.js` `native`) drops each value's type: an `i128` and a `u32` both read as numbers or digit strings, `Vec<Val>` contents lose their types, bytes and strings look alike. The page can only rebuild a call when it already knows the callee's signature: the DAO's own contracts (bindings specs) and a treasury asset's `transfer` (`authorizedCallTypes` in `apps/web/src/lib/proposal-supported-calls.ts`, added for treasury purchases). A valid proposal that calls an external contract, or authorizes a call to one, can't be verified, so the page disables vote, queue and execute for it.

**Context:**
- The typed form already reaches the database: `chain.raw_events.data` holds Goldsky's XDR-JSON for each `proposal_created` event, including `args`. A view or column can expose it per proposal (for example `args_typed` on `governance.proposals` and `app.proposal_detail`) without changing the decoder, so no replay would be needed. Storing typed args in the decoder instead needs a full replay (Redeploy checklist in `packages/goldsky/README.md`).
- XDR-JSON strings are escape-bytes encoded; unescape them as the decoder does.
- On the web side:
  - the API route `app/api/dao/[daoId]/proposals/[proposalId]` serves the typed args;
  - the proposal page (`encodingError`, `verifiedCallPayload`) builds `ScVal`s from them directly;
  - drop `typeAuthNodes`, `authorizedCallTypes`, the untagging in `normalizeProposalCallArgs`, and the "Unsupported external call" refusal for re-encoding.
- What the composer may submit stays a separate allowlist.
- Converting XDR-JSON to `ScVal` in JS needs either `@stellar/stellar-xdr-json` (WASM) or a small converter for the `ScVal` cases contracts emit.
- Test with a proposal whose calls cover `Vec<Val>`, an external contract, `u64`/`i128`/`u32`, bytes and an option. Assert that the page's recomputed ID matches the chain.

**Effort:** M
**Priority:** P2
**Depends on:** the indexer's string fix (#66) and the treasury-purchase re-encode (#67), which this replaces

## Legal

### MIDAO review of the legal entity export

**What:** Get MIDAO to confirm the export bundle (`docs/LEGAL_EXPORT.md`) is useful for their intake, then fold their answers into the next schema version. Schema v2 (2026-11-18) already follows the published docs.midao.org guidance; the ten open questions are in `docs/LEGAL_EXPORT.md`.

**Why:** The SCF Tranche 2 sign-off reads "DAO registrar exports a bundle that is confirmed by MIDAO as useful for their intake process".

**Effort:** S (code), external (review)
**Priority:** P1
**Depends on:** our MIDAO contact sharing a sample bundle

## Governance

### NQG vote source adapter

**What:** an `NqgVotes` adapter that implements the vote source interface over an NQG governance contract, plus enabling the "Neural Quorum Governance (NQG)" choice in the create flow.

**Why:** this is the Tranche 2 NQG deliverable. The Governor already reads votes through a vote source (`docs/designs/governance-adapter.md`), and the create flow shows NQG as coming.

**Context:**
- The adapter design is `docs/designs/nqg-compatibility.md` §4. It uses ledger-keyed epoch snapshots (`stage` then `activate`), clamps scores and scales them from 1e18 to 9 decimals, and gates power by membership token.
- It must meet the interface's semantics, including the one-supply invariant (governance-adapter.md §1) and approval policy §4 (admin = the tribe's Treasury).
- The web side:
  - enable the `nqg` option in `voteTypeOptions` (`apps/web/src/components/create-dao/GovernanceStep.tsx`), offered only on locked tokens as nqg-compatibility.md §9 asks;
  - show the epoch's age.
- Per-tribe adapters each need a Manager approval. Consider approval by code hash or an adapter factory (governance-adapter.md §10).

**Effort:** M
**Priority:** P1 (SCF Tranche 2)
**Depends on:** a maintained NQG testnet contract (nqg-compatibility.md §8, Q1)

## Savings Circle

### Automatic dues collection (`collect`)

**What:** `circle.collect(member)`, callable by anyone, pulls a member's dues for the current cycle from a SEP-41 allowance the member granted the Circle; the web offers "Approve six months" with the allowance's expiry date shown and a reminder before it lapses.

**Why:** Members who forget to pay miss stamps. Deferred from v1 in the CEO review (RD-1, 2026-10-13) because allowances expire silently (`expiration_ledger`) and overwrite on re-approve, which needs UI, reminders and tests.

**Context:** `docs/designs/savings-circle.md` (Premise 5, entry points, CEO Review RD-1). Allowance semantics: SEP-41 `approve` overwrites; an expired allowance reads as 0.

**Effort:** M
**Priority:** P2
**Depends on:** Circle v1 (`pay_dues`) on testnet

### Guarantor pledges

**What:** `pledge(guarantor, borrower, stamps)` / `withdraw_pledge`, per-member `pledges_in` / `locks_out` lists (at most 8, tagged with their period), locked stamps added to the borrower's cap, and guarantor forfeit when the borrower defaults.

**Why:** Lets a new member with few stamps borrow more with a neighbour's backing, the social collateral real circles use. Deferred from v1 in the CEO review (RD-2, 2026-10-13): the most intricate rules in the design (two lock lists, expiry, guarantor forfeit).

**Context:** `docs/designs/savings-circle.md` Pledges section (kept as the spec) and CEO Review RD-2. v1 cap is `k x own open-period stamps x dues - outstanding`.

**Effort:** M
**Priority:** P2
**Depends on:** Circle v1 on testnet with the forfeit path tested

## Build and dependencies

### Move to OpenZeppelin `v0.8.0` with soroban-sdk 28

**What:** Replace the `fbfde38` pin of OpenZeppelin `stellar-contracts` with the `v0.8.0` release, together with the soroban-sdk 28 upgrade it requires.

**Why:** `fbfde38` is an untagged commit. `v0.8.0` contains it and is a tagged, audited release (`docs/OPENZEPPELIN_PIN.md`).

**Context:**
- `v0.8.0` renames `Base::sequential_mint` (the Token's mint call) and renumbers the Governor error codes from 5000–5023 to 4200–4223; the Governor tests, the governor bindings, and the error ranges in `contracts/common/src/error.rs` follow.
- Every contract hash changes, so it ships as a contract release with new `releases/hashes.json` (`docs/REPRODUCIBLE_BUILDS.md`). The same release can take the Rust dependency updates held back for that reason (`docs/DEPENDENCIES.md`).

**Effort:** M
**Priority:** P2
**Depends on:** the external audit, unless the audit is rescoped to `v0.8.0`

## Completed

### Vitest 4 in the web, docs, and walkthrough packages (2026-11-25)

`apps/web`, `apps/docs`, and `apps/e2e` run Vitest 4.1.12, which clears the Vitest 3, `@vitest/mocker`, and `tinypool` advisories (`docs/DEPENDENCIES.md`). The web config gained a `styled-system` alias, as the docs config already had, and the `/api/health` test clears its mocks' calls itself, since `vi.restoreAllMocks()` no longer does.

### Governance adapter: vote source interface and configuration (2026-11-18)

The Governor reads all voting power through `common::clients::VoteSourceApi` on its permanent OZ token-contract slot. It is the DAO's token by default, or an adapter the Manager admin approved. The Manager's allowlist is checked at create and at launch, and a mock adapter crate drives Governor, Manager and e2e tests. The create flow asks how votes are counted (Token-weighted, or NQG shown as coming), and the governance page and every voting-power view follow the source. See `docs/designs/governance-adapter.md`.

### Legal entity export (2026-11-18)

Manage → Legal entity export is a four-step flow (entity, people, review, export) that downloads a JSON bundle and a Markdown summary for a DAO registrar's intake. It combines the founders' answers with the tribe's contracts, voting rules, treasury, and MIDAO's 25% beneficial-ownership test. It stays in the browser and is explicitly not legal advice ([docs/LEGAL_EXPORT.md](docs/LEGAL_EXPORT.md)).

### `/platform` admin dashboard (2026-11-09)

The operator's page at `/platform`: shared storage renewal (quote before signing), every tribe's storage health worst first, the implementation registry (register by hash, approve upgrade paths, set latest, choose what new tribes get, revoke), the factory switch and the Manager's upgrade notice. Anyone can read it; actions and the You-sheet link appear only for the live Manager admin. "Last sweep" per tribe is not observable (renewals emit no event), so the earliest expiry stands in for it. Admin handover stays in the scripts.
