# Bug ledger

Defects found by the walkthrough suite (`apps/e2e`) or while building it. The rules are in
`docs/plans/walkthroughs-and-docs.md` §3.6: fix the root cause, land each fix with a test at the lowest
level that catches it, and never `test.skip` without a ledger id here. P0 and P1 entries also get a
GitHub issue labelled `walkthrough`.

| Level | Meaning |
|---|---|
| P0 | Funds, authority or data correctness |
| P1 | A flow is blocked |
| P2 | Wrong or misleading copy or state |
| P3 | Polish |

## Open

None.

## Fixed

### BUG-001 · Local Manager config points at the wrong RPC path
- **Flow:** local dev (`node scripts/local-up.mjs`), not a walkthrough path; found in the engineering review (§13.2).
- **Viewport and theme:** n/a.
- **Severity:** P2.
- **Steps:** run `node scripts/local-up.mjs`, then read `configs/local-manager.json`.
- **Expected:** `rpcUrl` is `http://localhost:8000/rpc`, the endpoint the app uses for `local`
  (`apps/web/src/config/networks.ts`).
- **Actual:** `rpcUrl` was `http://localhost:8000/soroban/rpc`, so the Manager artifact and the
  `stellar network` entry `deploy-manager.mjs` registers disagreed with the app.
- **Root cause:** the URL was written out twice, by hand, in two places.
- **Fix:** one constant in `scripts/local-network.mjs`, used by `local-up.mjs`.
- **Regression test:** `apps/web/src/config/networks.test.ts` asserts `NETWORKS.local` matches it.

### BUG-002 · The E2E Wallet was in a production build
- **Flow:** build (`pnpm build` without `NEXT_PUBLIC_E2E_WALLET`). Caught before merge, in the PR
  that added the wallet; it never reached `dev`.
- **Severity:** P0 had it shipped (a test-only signer path in production).
- **Steps:** `pnpm --dir apps/web build` with the flag unset.
- **Expected:** `✓ E2E Wallet absent from the build`.
- **Actual:** `apps/web/scripts/assert-e2e-wallet.mjs` failed: `static/chunks/…js: e2e_wallet, __e2eSign`.
- **Root cause:** Next inlines a `NEXT_PUBLIC_` variable only when it is set at build time. Unset, the
  guard `process.env.NEXT_PUBLIC_E2E_WALLET === '1'` in `lib/wallet-kit.ts` stayed a runtime check,
  so the bundler kept the module.
- **Fix:** `next.config.mjs` always defines the flag (`'1'` or `'0'`), so the guard folds to a constant
  and the module is dropped.
- **Regression test:** the assertion itself runs after every `pnpm build` (CI's Build Web job), with
  unit tests in `apps/web/scripts/assert-e2e-wallet.test.ts`.

### BUG-003 · A refused sign-in says "Wallet sign-in failed." instead of why
- **Flow:** W01, refused signature. All viewports and themes.
- **Severity:** P2.
- **Steps:** Connect, pick a wallet, refuse the sign-in signature.
- **Expected:** the error toast says the request was declined.
- **Actual:** "Couldn't connect your wallet · Wallet sign-in failed." for every wallet error.
- **Root cause:** `components/shell/wallet-session.tsx` read the reason only from `Error#message`.
  Stellar Wallets Kit modules (Freighter included) reject with plain `{ code, message }` objects, so
  every wallet's reason was dropped.
- **Fix:** `walletErrorMessage` in `lib/auth/client.ts` reads kit-shaped errors, and names a refusal
  (SEP-43 code -4, or a "rejected"/"declined" message) in plain words.
- **Regression test:** `lib/auth/wallet-error-message.test.ts`; W01 asserts the toast text.

### BUG-004 · Connecting again after a refused signature hangs on "Check wallet"
- **Flow:** W01, refused signature then retry. All viewports and themes.
- **Severity:** P1 (sign-in blocked until the modal is closed or the page reloaded).
- **Steps:** Connect, refuse the signature, press Connect again and pick the wallet within about a
  second.
- **Expected:** the wallet asks for the sign-in signature.
- **Actual:** the wallet returns its address, but the modal stays open and the top bar shows
  "Check wallet" indefinitely.
- **Root cause:** Stellar Wallets Kit 2.6 `authModal()` renders the wallet list, then awaits
  `refreshSupportedWallets()` (up to 1s per wallet) before it subscribes to the pick. On a first
  connect the list shows "Loading wallets..." for that time; on a later one the cached list shows at
  once, so a quick pick is emitted before anyone listens and is lost. Upstream kit behaviour.
- **Fix:** `lib/wallet-connect-modal.ts` clears the kit's cached wallet list before opening the modal,
  so the loading state stays up until the kit listens.
- **Regression test:** `lib/wallet-connect-modal.test.ts`; W01's retry case picks the wallet at once.

### BUG-W09-1 · "Change the market payment asset" shows a contract id as its current value
- **Flow:** W09 (composer picker and Manage → Market), every viewport and theme.
- **Severity:** P2.
- **Steps:** on a launched tribe with a market, open New proposal → Add an action, or Manage → Market.
- **Expected:** `Now: XLM`, as the starting price reads `Now: 1 XLM`.
- **Actual:** `Now: CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`.
- **Root cause:** the catalog's `currentValue` for `set-marketplace-payment-token` printed the
  market's `paymentAsset` (a SAC contract id); the auction setting already carried an `assetCode`.
- **Fix:** `useSettingValues` and Manage → Market pass the asset's code with the market config
  (`apps/web/src/lib/proposal-actions/use-setting-values.ts`,
  `apps/web/src/components/marketplace/admin-marketplace.tsx`); the catalog shows it, and the contract
  id only for an asset it can't name (`apps/web/src/lib/proposal-actions/catalog.ts`).
- **Regression test:** `catalog.test.ts`, "names a known market asset by its code"; W09 picks
  `Change the market payment asset Now: XLM`.

### BUG-W09-2 · Manage overview doesn't say Market and Artwork need a vote after launch
- **Flow:** W15 (Manage overview), every viewport and theme.
- **Severity:** P2 (authority copy).
- **Steps:** open Manage on a launched tribe.
- **Expected:** every section whose changes go to a vote reads "Needs a vote".
- **Actual:** Market ("Listings, fees and pausing") and Artwork had no chip, as if anyone could change
  them, though launch hands the Marketplace and Metadata admin to the Treasury like the rest.
- **Root cause:** the overview's per-section access map listed profile, token, governance, owner and
  auction only.
- **Fix:** the map moved to `apps/web/src/lib/manage-access.ts` (`manageSectionAccess`) with
  `artwork` and `marketplace` added; `apps/web/src/app/dao/[daoId]/admin/page.tsx` uses it.
- **Regression test:** `apps/web/src/lib/manage-access.test.ts`; W15's authority-copy check.

### BUG-W09-3 · "Recover a membership" stays disabled with DAO recovery turned on in the same draft
- **Flow:** W09 (composer), every viewport and theme.
- **Severity:** P1 (`dao-transfer` could not be proposed together with `set-dao-recovery`).
- **Steps:** New proposal → Add an action → DAO recovery (on) → Add to proposal → Add an action.
- **Expected:** "Recover a membership" is offered: its own reason says "Turn it on first, in this
  proposal or an earlier one". Likewise "Reopen the market" after "Pause the market" in the draft.
- **Actual:** it stayed disabled with "DAO recovery is off…", and "Reopen the market" with "The market
  is already open.", because availability read only the live settings.
- **Root cause:** `actionAvailability` was given the tribe's live values, never the draft's effect.
- **Fix:** `valuesAfterDraft` (`apps/web/src/lib/proposal-actions/catalog.ts`) applies the draft's
  switches and pauses in order; the picker uses it for availability and for a switch's starting value
  (on, then off), while "Now:" still shows the live value
  (`apps/web/src/lib/proposal-actions/components/action-picker-sheet.tsx`).
- **Regression test:** `catalog.test.ts`, "counts what the draft already does"; W09's members and
  market proposals.

### BUG-W09-4 · Recovery on, recover, recovery off can't be submitted
- **Flow:** W09 (composer review), every viewport and theme.
- **Severity:** P1 (the documented way to recover a lost key, with recovery off again afterwards,
  was blocked).
- **Steps:** New proposal → DAO recovery (on) → Recover a membership → DAO recovery (off) → review.
- **Expected:** it submits: each switch call changes the value it finds when it runs.
- **Actual:** "Turn DAO recovery off" showed "This is off already, and setting it again would fail
  the proposal." and the error "Another action in this draft changes the same resource to a different
  value.", which blocks submitting.
- **Root cause:** the unchanged-switch rule compared against the live setting, not the value the
  draft's earlier steps leave; the clash rule treated any two values for one switch as a conflict.
- **Fix:** `switchValueBefore` reads the switch at its place in the draft; a switch turned back with
  steps between is a plan, not a clash (on then off back to back still is)
  (`apps/web/src/lib/proposal-action-identity.ts`).
- **Regression test:** `proposal-action-identity.test.ts`, "reads a switch at its place in the
  draft"; W09's members proposal.

### BUG-W09-5 · Add a module and Remove a module add nothing to the proposal
- **Flow:** W09 (Manage → Membership), every viewport and theme.
- **Severity:** P1 (`create-module`, `register-module` and `unregister-module` could not be proposed).
- **Steps:** Manage → Membership → Add a module → Invite lists → "Add 2 actions to your proposal"
  (or a module's options → Remove from tribe… → "Add 1 action to your proposal").
- **Expected:** the "Add this to your proposal?" review (the steps are high-risk), then the steps in
  the draft.
- **Actual:** the sheet closed and nothing was added: no review, no toast, an empty draft. The
  review dialog opened for a moment and closed itself.
- **Root cause:** the sheet closed first and proposed one animation frame later; the sheet's focus
  restore, after its exit animation, landed outside the newly opened review dialog, which dismissed
  it as a cancel.
- **Fix:** both sheets propose while still open; the review opens over the sheet, and the sheet closes
  when the steps are added (`onAdded`), or at once when no review is needed. A refusal now shows in
  the sheet (`apps/web/src/components/admin/modules/add-module-sheet.tsx`,
  `remove-module-sheet.tsx`, `modules-card.tsx`).
- **Regression test:** W09's modules proposal (round 1) and cleanup proposal (round 2).
