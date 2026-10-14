# Design: add and remove modules in the web app

Status: design for review. No app code yet. Preview: `docs/design/module-attach-preview.html` (open it in a browser; dark and light, with a clickable Add flow).

Contracts and indexer already support all of this (`Manager.create_module`, `Token.register_module` / `unregister_module`, the `module_created` / `module_registered` events and the `manager.daos` view that resolves auction, marketplace and claims from the registry). The web app has no way to build any of it. The audit that found the gap: `web-audit-040` finding F2.

## 1. Brief

- **Product and place:** Tribes Builder, Manage → Membership → Modules. Today the card lists each module, its allowance and badges ("Not deployed by the Manager", "Holds tokens without votes", votes held). It cannot add or remove one.
- **Who:** a tribe member who proposes a change (often a founder, new to DAOs), and the voters who read the proposal afterwards. Before launch, the launch admin.
- **Job:** "Let my tribe sell, auction or hand out memberships in a new way", and later "stop doing that, safely".
- **Idea level (Pollard):** an execution inside an existing surface. It has to feel like part of Manage, not like a new product.
- **Constraints:** DESIGN.md (Panda tokens, `components/ui` primitives only, voice, density rules, two authored motion moments), contract rules (below), and that a proposal's actions are fixed when it is created.

The contract rules that shape the design:

| Fact | Consequence for the UI |
|---|---|
| After launch, adding a module is several actions that run together: `create_module`, then `register_module`, then optionally an allowance and an opening call. Nothing is registered by `create_module` alone once Live. | One review that reads as plain steps, added to the proposal as a batch. |
| The module is deployed at an address that is a pure function of tribe, kind and a module number, and `create_module` must be given that number (`StaleModuleIndex` if another module of the kind was added first). | Read the number and the predicted address from the Manager while drafting. Show the address up front. Re-check before submit and again when the proposal is queued. |
| A module created after launch starts closed: the market is paused, the auction has not started, a claims module has no list. | "Open it when this passes" is a choice, and a closed module shows a row-level nudge. |
| Each built-in kind appears at most once; 16 modules at most. | Tiles disable with their reason. |
| Removing a module zeroes its allowance and its transfer-agent flag. Tokens it still holds become that contract's own votes. Removal is deliberately not blockable (anyone could send the module a token). | A readiness checklist that warns and offers the clean-up as steps, but never blocks. |
| Before launch only the Manager can register or unregister. | Add works directly for the launch admin (one signed transaction). Remove is disabled with its reason. |

## 2. Insight

**A tribe wants to grow a new way for people to join, or retire one, but a module change is four linked on-chain steps with an address nobody can see yet, because the contract deploys it inside the vote that passes.**

Tensions:

- Human: wanting to grow against the fear of breaking something that holds members' tokens.
- Category: DAO tools show the call ("create_module(CBKF…, {tag…}, 0)"); people think "add a market".
- Cultural: adding a module should feel like opening a room, not deploying a contract.

## 3. Directions explored

Three methods from different families: structural (SIT subtraction: remove every step that is not a decision), collision (bisociation with how a bank shows a standing order: "what happens, in what order, when"), and inversion (reverse brainstorming: how would we make this go wrong on purpose, then design against each).

| # | Direction | Verdict |
|---|---|---|
| 1 | A wizard with a step per contract call | Killed. It exposes the contract. Four screens for one intention. |
| 2 | Recipe tiles, then one screen of fields plus a plain "when this passes" list that rewrites itself | **Chosen** (below). |
| 3 | Modules as seats around the logo's table | Killed. Strong picture, wrong system: DESIGN.md allows two authored motion moments and no imagery beyond the mark, and it caps at 16 seats for no gain. |
| 4 | A general "check this whole proposal" step in the composer | Deferred. It is the right idea for every action, but dependent steps cannot be simulated alone, so a general version needs the contracts' help. The module flow gets the part that is possible. |
| 5 | Goal-first copy ("sell new memberships", "run auctions") | Kept as tile wording: plain goal first, module name one line beneath. |
| 6 | Hide the predicted address | Killed. It is the one concrete, checkable thing before a vote. |
| 7 | Block removal while a module holds tokens | Killed. The contract does not block it, and a block can be griefed by sending the module a token. Warn, offer the clean-up, let the tribe decide. |
| 8 | Attach as a separate page | Killed. The Modules card already exists and already owns allowances; a second place splits one subject. |

Honest scores for the chosen direction (the skill's rubric; not a 9 and it should not pretend to be):

| Originality | Strategic fit | Emotional response | Feasibility | Scalability | Simplicity | Weighted |
|---|---|---|---|---|---|---|
| 6 | 9 | 7 (reassured, in control) | 7 | 8 | 8 | 7.4 |

Why not higher: the structure (choose, configure, review) is familiar. The two things that lift it are the address shown before the vote and a removal checklist that warns without blocking. It would not stand alone as an idea, and that is right for a settings screen.

**One sentence:** every change to what your tribe can do reads as a few plain steps, checked against the chain before anyone has to vote on it.

## 4. The design

Where: the existing Modules card in Manage → Membership. Heading stays "Modules"; the supporting line says it in plain words ("Add-ons that let your tribe auction, sell or hand out memberships").

### The card

- A secondary "Add a module" button in the card header.
- Each row keeps its title, address, chips and allowance chip, and gains an overflow menu (44px target): "Change allowance" (the form that sits under the list today moves here) and "Remove from tribe…".
- A module that is attached but closed shows a "Closed" chip and, for the auction and the market, a "Propose opening" (market) or "Propose starting auctions" (auction) button using the existing resume and reopen actions.

### Add (a sheet, two screens)

1. **Choose.** Three tiles in a radio group: Daily auction, Market, Invite lists. Plain goal first, module term one line beneath. A tile that cannot be chosen says why under its text and stays focusable.
2. **Set up and review**, one screen with a sticky action bar:
   - Fields by kind: auction (price asset, starting price, how long each runs, open it when this passes); market (price asset, resale fee in percent, open it when this passes); invite lists (price asset).
   - "When this passes, in order", numbered, rewriting as fields change, with the address the module will have.
   - A check line (checking, ok, or why it would not run) that runs on its own when the fields are valid.
   - The primary button names its outcome and counts: "Add 3 actions to your proposal". It stays disabled until the check passes.

### Remove (a sheet, one screen)

A checklist of what the module holds, read live, then the clean-up as steps in the same proposal, then the same review, check and button.

| Row | Source | If it is amber |
|---|---|---|
| Mint allowance | `token.mint_allowance` | Never amber: it is cleared by removal. |
| Holds N memberships | `token.balance(module)` and, for a market, its open pools | Offer "Also close pool X and sweep its memberships back to the treasury" (on by default). |
| Open resale listings | the market's open listings | Words only: sellers can still cancel, listings leave the market page. There is no clean-up the treasury can do. |
| Running auction | `auction.get_auction` | Offer "Pause and cancel the running auction first". |
| Open claim lists | the claims module's lists | Words only: unclaimed allocations stop being claimable. |
| Transfer agent | `token.transfer_agents` | Never amber: cleared by removal. |
| Votes held by the module | `token.get_votes(module)` | Words only. |

### Setup (launch admin)

Same Add sheet. The button reads "Add the market module" and signs one transaction (`create_module`, which the Manager registers). Remove is disabled: "Only a vote can remove a module, so this works after launch." In a launch drive everything is disabled with the card's existing "Locked in for the launch drive" callout.

## 5. What each flow does on chain

Order matters; all run in one execution, so either all succeed or none do.

| UI | After launch (one proposal) | Before launch |
|---|---|---|
| Daily auction | `manager.create_module(token, Auction{…}, n)`; `token.register_module("auction", predicted, true)`; `token.increase_mint_allowance(predicted, 4294967295)`; optionally `auction.unpause(treasury)` | `manager.create_module` |
| Market | `create_module(Marketplace{…}, n)`; `register_module("marketplace", predicted, true)`; optionally `marketplace.unpause()` | `create_module` |
| Invite lists | `create_module(Claims{…}, n)`; `register_module("claims", predicted, false)` | `create_module` |
| Remove | optional `close_pool` and `sweep_pool` per pool, or `pause` and `cancel_auction`; then `unregister_module(address)` | not possible |

The built-in "holds without votes" flag follows the contract (`builtin_non_voting`): true for auction and market, false for claims.

## 6. States

| State | What the person sees |
|---|---|
| Loading | Skeleton rows (existing). |
| Cannot read modules | Existing error callout. |
| No wallet | Buttons disabled; the card's existing "Connect a wallet to draft proposals". |
| Launch drive open | Disabled, "Locked in for the launch drive". |
| Kind already present | Tile disabled: "This tribe already has one. Remove it first to replace it." |
| 16 modules | All tiles disabled: "Your tribe already has the most modules it can hold." |
| Manager paused | Check fails: "New modules can't be created right now. The platform has paused it." |
| Stale module number | Check fails: "Another market was added while you were drafting. Reload this list, then add it again." |
| Added to the draft | Existing "added to the proposal draft" callout. |
| Not one of ours | Row says "Not deployed by Tribes Builder" and its "Remove from tribe…" stays disabled with the reason. |

## 7. Copy rules applied

Sentence case, contractions, no em dashes, plain words first with the DAO term one line beneath, buttons name their outcome, no "nonce", "SAC", "ledger" or "envelope" ("module number" instead of the index), durations as "5 minutes", "tribe" for the group, contract ids only in the Address pattern or under Technical details. "Tribes Builder did not deploy this contract" uses the brand name; the existing badge text "Not deployed by the Manager" changes to "Not deployed by Tribes Builder" for members.

## 8. Motion and polish

Summary; the table in the preview is the spec.

- No new authored moment. The sheet, press scale (.96, 160ms), menu (150ms from its trigger) and callouts are the primitives.
- The check line's icon swaps with scale .25 to 1, opacity and blur 4px to 0, `cubic-bezier(.2,0,0,1)`, 160ms. Its words change with it.
- The choose-to-setup swap and the rows that appear or vanish are instant: keyboard Enter picks a tile, and people toggle these while reading.
- Reduced motion keeps opacity and colour, drops scale and blur.
- Concentric corners (sheet 24, bar padding 14, buttons 10), tabular figures for counts and allowances, one icon set at 1.5px stroke beside regular text.

## 9. What the code needs

1. **Action types and handlers** (`lib/proposal-actions`): `create-module`, `register-module`, `unregister-module`, and an `open-module` that takes its target explicitly. The existing resume and reopen handlers read the module address from the tribe's indexed config, which does not have a module attached in the same proposal yet.
2. **Encoding** (`lib/proposal-supported-calls.ts`): allow `Manager.create_module` only for this tribe's token; `token.register_module` / `unregister_module`; support the `ModuleSpec` union in `specValue` (today it handles structs only), accepting both the builder's `{tag, values}` and the indexer's array form; accept, for targets, a module predicted by an earlier action in the same proposal (a new optional `pendingModules` on the encoding context).
3. **The proposal page** must resolve those predicted addresses before it re-encodes a proposal from indexed data (`predict_module_address` per `create_module`), or queue and execute will refuse a proposal that is fine. This is the part to prove first with a real proposal.
4. **Reads:** `module_count` and `predict_module_address` (Manager), `token.modules()` (exists), `token.balance` for a module, the market's pools and listings (the index already has `marketplace.pools` and `secondary_listings`), the running auction, the claims lists.
5. **Setup direct path:** `manager.create_module` through the Manager client, signed by the launch admin, in the same sheet.
6. **Tests:** pure plan builders (kind to ordered actions, counts, names, errors), the readiness checklist rules, encoder union round-trips (builder form and indexed form), the proposal-ID reproduction for an attach proposal, component tests for the tiles, check states and disabled reasons.
7. **Live proof:** extend the membership e2e (PR #55) with an attach and detach phase, then run it on testnet. Nothing in this document has been run live.

## 10. Risks (pre-mortem: "six months on, this failed because…")

| Cause | What prevents it |
|---|---|
| The predicted address is not where the contract deploys. | Never compute it locally: always read `predict_module_address`. |
| A module was added after drafting, so the vote passes and then reverts. | Check on submit, again when the proposal is queued, and say so before anyone pays fees. |
| Someone removed a market with open listings and sellers were confused. | Amber rows, repeated on the proposal review that voters read. |
| "Checked" was read as "safe". | The check line says "should run as planned" and names what it did and did not simulate. |
| The index does not show a module added after launch, so the tribe's page never gets its market. | The views already resolve `module_created` and `module_registered` into the tribe's config, and the market opens through `marketplace_unpaused`. This is argued from the SQL, not yet seen live. |
| The proposal page cannot rebuild an attach proposal from indexed data. | Item 3 above, proved first. |

## 11. Decisions (made with the owner)

1. **Home:** the Modules card in Manage → Membership stays the one place to add and remove. Once a tribe has an auction or a market, that module's own settings live on its own Manage page (Auction, Market), as today.
2. **Name:** "Modules", with the plain supporting line.
3. **Custom contracts:** not in this version. The contracts allow them; the web will not offer them, so there is no external-contract trust surface to design.
4. **Default:** "Open it when this passes" is on for an auction or market, and a proposer can turn it off.

## 12. As built

- The sheets use the app's existing `Sheet`: a bottom sheet on phones and a 420px side panel from `md`. The centred 560px sheet in the preview is a drawing convenience, not a new surface.
- A module that is attached but closed shows "Closed" (the preview's "Not open yet" was replaced during build).
- "Checked just now. This should run as planned." replaces any claim that every step will run: only the first step is simulated, the rest are checked against live reads, and later steps depend on earlier ones in the same execution.
- The action list is built once (`lib/modules/plans.ts`) and fed to the composer's own handlers (`lib/modules/requests.ts`), so a proposal made here and one made in the composer are identical on chain.
- The proposal page and the composer resolve a pending module's address from the Manager's `predict_module_address`, never from a local computation.

### Proven live (testnet, tribe `drive-launch`)

- Attach: a Market was added by proposal (create, register, open) at the predicted address with `non_voting` set, unpaused, version 0.4.0; the index showed the contract and `marketplace_enabled`.
- Detach: the same Market was removed by proposal (unregister) and executed (tx `22e4f116308bda26103e4c0f675f72ce22b8691da5dc107d841aa7469dfcc194`). On chain the token's modules list lost it and `module(marketplace)` is empty; the index shows `registered: false` and no marketplace contract on the tribe; the Add sheet offers Market again.
- Not exercised live: the launch-setup path (`create_module` signed directly by the launch admin), pool and auction clean-up steps, removing a claims module.
