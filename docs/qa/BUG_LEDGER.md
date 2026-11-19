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
  The draft's and proposal page's summary had the same fault ("Change the market payment asset to
  CBIELTK…"): `getProposalActionSummary` now names a known asset by its code (`knownAssetCode` in
  `apps/web/src/lib/assets-config.ts`, used by `apps/web/src/lib/proposal-call.ts`).
- **Regression test:** `catalog.test.ts`, "names a known market asset by its code";
  `proposal-call.test.ts`, "payment asset summaries"; W09 picks
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

### BUG-005 · Market amounts show seven trailing decimals
- **Flow:** W10, list a token (the sell form's "You receive" line). Every viewport and theme.
- **Severity:** P2.
- **Steps:** open Sell a token you own and enter a price of 5 XLM.
- **Expected:** "You receive 4.875 XLM if it sells", and prices such as "5 XLM", like the rest of the
  app.
- **Actual:** "You receive 4.8750000 XLM", and every market price, fee, summary and spendable balance
  padded to seven decimals ("5.0000000 XLM").
- **Root cause:** `formatMarketplaceAmount` in `lib/marketplace/amount.ts` always printed all seven
  decimal places, unlike `formatStroops` and `formatAuctionAmount`.
- **Fix:** it drops trailing zeros (still exact, never rounded), so every market amount reads the same
  as elsewhere.
- **Regression test:** `lib/marketplace/amount.test.ts`; W10 asserts the proceeds line and the
  "Token #3 · 5 XLM" row.

### BUG-006 · Stopping a guided listing promised to "continue later from the Market page"
- **Flow:** W10, list again while the permission is live (Stop here after Allow); Change price stopped
  after its Cancel. Every viewport and theme.
- **Severity:** P2 (after a stopped Change price the token is simply unlisted).
- **Steps:** start List for sale or Change price, confirm the first step, then read the note and press
  Stop here.
- **Expected:** the note says what stays in place, and a token that came back is easy to list again.
- **Actual:** "The steps you confirmed stay done if you stop here. You can continue later from the
  Market page.", but nothing resumes. The note also showed only while no step was prepared, so in
  practice it was rarely visible.
- **Root cause:** `components/marketplace/sell-sequence.tsx` had one fixed sentence, whatever the
  confirmed steps were.
- **Fix:** `sellStopNote` (`lib/marketplace/sell.ts`) words the note from the confirmed steps (after
  Allow: the permission lasts about 1 hour and List for sale then takes one signature; after Cancel:
  the listing stays cancelled and the token stays in your wallet). The sequence reports what it
  confirmed on close, and a Change price stopped after Cancel opens the sell form with that token
  chosen.
- **Regression test:** `lib/marketplace/sell.test.ts`; W10 asserts the note after Allow.

### BUG-007 · Listing end presets looked available while the form was disabled
- **Flow:** W10 @matrix, the signed-out sell form. Every viewport and theme.
- **Severity:** P3.
- **Steps:** signed out, open Sell a token you own and press 1 day.
- **Expected:** the presets look unavailable, like the other fields.
- **Actual:** they looked live but ignored the press.
- **Root cause:** `components/marketplace/listing-end-field.tsx` dropped changes itself, because
  `SegmentedControl` had no `disabled` prop.
- **Fix:** `SegmentedControl` (`components/ui/segmented-control.tsx`) takes `disabled`, passed to Ark
  with the shared disabled style, and the listing end field passes it through.
- **Regression test:** `components/marketplace/sell-form.test.tsx` (the radios are disabled signed out).

### BUG-008 · Market settings named an action that doesn't exist and offered Pause and Reopen together
- **Flow:** W10 @matrix, Market settings (from the Market page). Every viewport and theme.
- **Severity:** P2.
- **Steps:** open Market settings for a tribe whose market is paused, then for one that is open.
- **Expected:** the page is named like the nav and its link ("Market settings"), the paused notice names
  "Reopen the market", and only the pause action that applies is offered, as in the composer.
- **Actual:** "Manage the marketplace", "Add a resume-marketplace action", and both Pause the market
  and Reopen the market, whatever the state.
- **Root cause:** `components/marketplace/admin-marketplace.tsx` listed every marketplace setting
  handler without the composer's `actionAvailability` check, and its copy predated the action names.
- **Fix:** the settings list filters by `actionAvailability` with the live market state; heading, back
  link and notice use the current names.
- **Regression test:** W10's Market @matrix case asserts the heading and that only Pause the market
  shows on an open market.

### BUG-009 · Pool and comment errors from the market showed raw contract codes
- **Flow:** found reviewing W10's error paths (pools are W11). Every viewport and theme.
- **Severity:** P2.
- **Steps:** buy from a pool that sold its limit for the period (`Error(Contract, #7722)`).
- **Expected:** a plain sentence such as "This pool has sold as many tokens as it can for now. Try
  again when its next sales period starts."
- **Actual:** the raw simulation error.
- **Root cause:** `lib/marketplace/errors.ts` mapped only the resale codes; 7701, 7711 and 7716-7727
  (comments and pools, `contracts/marketplace/src/error.rs`) had no message.
- **Fix:** every marketplace contract error, 7701 to 7727, has a plain message.
- **Regression test:** `lib/marketplace/errors.test.ts` checks each code from 7701 to 7727.

### BUG-010 · Change price closed itself after Continue, so the price could not change
- **Flow:** W10, change a price. Found at desktop dark.
- **Severity:** P1 (Change price was blocked).
- **Steps:** in Your listings press Change price, enter a new price and press Continue.
- **Expected:** the "Change the price" sequence opens at Step 1 of 3, Cancel the current listing.
- **Actual:** the sequence rendered for a moment and closed, leaving the listing unchanged.
- **Root cause:** Continue unmounts the Change price dialog and opens the sequence's dialog in the same
  render. Closing the first dialog returns focus to the Change price button, outside the new dialog,
  and `components/marketplace/sell-sequence.tsx` closed on any outside interaction
  (`closeOnInteractOutside={!busy}`).
- **Fix:** the guided sequence never closes on an outside press or focus; Close, Stop here, Done and
  Escape still close it. This also keeps a stray press from dropping a sequence part way.
- **Regression test:** `components/marketplace/sell-sequence.test.tsx`; W10's Change price case.

### BUG-011 · Every resale purchase failed with "does not match the reviewed listing"
- **Flow:** W10, buy a listing. Found at desktop dark; every viewport (server side).
- **Severity:** P1 (no member could buy a resale listing).
- **Steps:** as another member, open a resale listing's Details, press Buy, then Check.
- **Expected:** the review shows the price and network fee, then Sign and send.
- **Actual:** "The simulated purchase does not match the reviewed listing. Refresh the listing and
  review it again; nothing was submitted." on every attempt.
- **Root cause:** `lib/marketplace/purchase-cycle.ts` proves the listing's creation from RPC
  `getEvents` and kept only events with `inSuccessfulContractCall` true. Current Stellar RPC servers
  return only successful-call events and no longer send that field (deprecated in the SDK), so the
  creation event was always dropped and the check failed closed.
- **Fix:** an event counts unless the field is explicitly `false`, which still rejects a failed call's
  events from an older server.
- **Regression test:** `lib/marketplace/purchase-cycle.test.ts` (an event without the field passes,
  one marked `false` fails); W10's buy case.

### BUG-012 · Cancelling your last listing closed the review before it confirmed
- **Flow:** W10, the seller cancels a listing. Found at desktop dark; every viewport and theme.
- **Severity:** P2 (the cancel went through, but the member never saw it confirm; a Change price on
  the only listing lost its sequence after the Cancel step).
- **Steps:** with one listing, press Cancel listing in Your listings, Check, then Sign and send.
- **Expected:** "Confirmed", the transaction and Done, then the row is gone.
- **Actual:** on confirmation the whole dialog vanished with the row.
- **Root cause:** a confirmed cancel hides its listing at once (the pending change), and
  `components/marketplace/your-listings.tsx` returned nothing when no rows were left, unmounting the
  review and the Change price sequence it renders. `ListingCard` likewise hid its own card, with its
  review inside, on confirmation.
- **Fix:** Your listings renders its review, Change price dialog and sequence outside the section, so
  they stay mounted, with their state, when no rows are left; a public card reports its cancel or
  return only when its review closes.
- **Regression test:** W10's cancel and listing-end cases (each acts on the seller's only listing).
