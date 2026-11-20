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

### BUG-W03-1 · Walkthrough tribes pointed their image and renderer at localhost
- **Flow:** W03, Create (identity). Every viewport and theme. Harness defect, in `apps/e2e`.
- **Severity:** P1 (Create blocked in the walkthrough build; on chain it would have broken the tribe's
  art on dev.tribes.build).
- **Steps:** build with `pnpm --dir apps/e2e build:app`, open `/create`, fill in Identity, press
  Continue.
- **Expected:** the default tribe image and renderer base are on the dev deployment that serves the
  tribe, and Identity passes.
- **Actual:** "Use an https:// or ipfs:// image address" under the image; the defaults were
  `http://localhost:<port>/images/dao-logo.png` and `http://localhost:<port>/api/render`.
- **Root cause:** the walkthrough build set `NEXT_PUBLIC_SITE_URL` to the local server. The app
  derives the default image and renderer base from it, and both are written on chain at create.
- **Fix:** `apps/e2e/scripts/build-app.mjs` and `src/app-env.ts` name the dev site
  (`https://dev.tribes.build`, or `E2E_SITE_URL`); the suite still browses the local server.
- **Regression test:** W03's Create cases (they fail at Identity without it).

### BUG-W03-2 · Setup never names the voting pace
- **Flow:** W03 and W04, the setup page's "Voting rules" row. Every viewport and theme.
- **Severity:** P2.
- **Steps:** create a tribe with the Super fast pace, open Set up and launch.
- **Expected:** "Super fast: votes open after 5 minutes, run 10 minutes".
- **Actual:** "votes open after 5 minutes, run 10 minutes" for every pace.
- **Root cause:** `components/launch/launch-setup.tsx` read the Governor over RPC, which has no getter
  for the queue delay, then compared the pace with a queue delay of 0, which no pace has.
- **Fix:** `votingPaceOfSettings` in `lib/create-dao-presets.ts` compares the queue delay only when
  it is known.
- **Regression test:** `lib/create-dao-presets.test.ts` and `components/launch/launch-setup.test.tsx`;
  W03 asserts the row.

### BUG-W03-3 · Setup's auction price has no unit
- **Flow:** W03, the setup page's "Auctions" row. Every viewport and theme.
- **Severity:** P3.
- **Steps:** create an auction tribe, open Set up and launch.
- **Expected:** "5 minutes each · starts at 1 XLM" (DESIGN.md: amounts carry their unit).
- **Actual:** "5 minutes each · starts at 1".
- **Root cause:** `launch-setup.tsx` formatted the reserve price without the payment asset.
- **Fix:** the row adds the asset code from the auction's payment token (or the pending tribe's).
- **Regression test:** `components/launch/launch-setup.test.tsx`; W03 asserts the row.

### BUG-W03-4 · Artwork folder uploads ignored the deployment's upload switch
- **Flow:** W04, Artwork. Every viewport and theme.
- **Severity:** P2.
- **Steps:** on a build with `NEXT_PUBLIC_PINATA_UPLOADS_ENABLED=false`, choose an artwork folder and
  press Upload.
- **Expected:** the page says uploads are off before anyone presses Upload, and the server refuses
  directory uploads like every other upload.
- **Actual:** the button was enabled and failed after the click with a service error; with a Pinata
  key configured, `/api/pinata/generate-jwt` and `/api/pinata/pin-cid` would have uploaded anyway.
- **Root cause:** only `/api/uploads/*` checked the switch; the directory routes and the upload
  buttons didn't.
- **Fix:** `lib/uploads-enabled.ts` is the one check. Both directory routes answer 404
  `FEATURE_DISABLED` while uploads are off, and the folder and tribe image upload buttons are disabled
  with "Uploads are off on this deployment." A folder can still be checked in the browser.
- **Regression test:** `lib/uploads-enabled.test.ts`; W04 asserts the disabled button and its note.

### BUG-W02-1 · An unknown tribe link shows "Something went wrong" instead of Page not found
- **Flow:** W02, opening `/dao/<slug>` for a slug no tribe has. All viewports and themes.
- **Severity:** P2.
- **Steps:** open `/dao/e2e-no-such-tribe-w02`.
- **Expected:** HTTP 404 and the Page not found page, with Find a tribe.
- **Actual:** HTTP 500 and the generic error boundary ("An error occurred in the Server Components
  render").
- **Root cause:** `app/dao/[daoId]/layout.tsx` let `resolveDaoId`'s "DAO not found" error escape as a
  render error; the segment's `not-found.tsx` was never reached.
- **Fix:** `isDaoNotFound` in `lib/dao-db.ts`; the layout calls `notFound()` for it and still throws
  any other error (a read model that is down stays an error, not a 404).
- **Regression test:** `lib/dao-db.test.ts` (`isDaoNotFound`); W02 "an unknown tribe link says so".

### BUG-W02-2 · A treasury payout's high-risk warning describes something else
- **Flow:** W13, Treasury → Send funds → Add the payout to proposal. All viewports and themes.
- **Severity:** P2.
- **Steps:** propose a payout from the Treasury page.
- **Expected:** the review says what a payout does.
- **Actual:** "This action can change who controls the tribe, how the treasury works, or token
  balances." A payout does none of the first two.
- **Root cause:** `transfer-sac-token` fell through to the generic message in
  `highRiskMessage` (`lib/proposal-action-identity.ts`).
- **Fix:** its own message: "Sends funds out of the treasury. Check the recipient and the amount: once
  the proposal runs, the payment cannot be undone."
- **Regression test:** `lib/proposal-action-identity.test.ts`; W13 asserts the review text.

### BUG-W02-3 · A dialog opened after the page loads has no accessible name
- **Flow:** W13, composer → Submit proposal (the "Submit this proposal?" confirmation). Any `Dialog`
  or `Sheet` that mounts closed and opens later. All viewports and themes.
- **Severity:** P2 (screen readers announce an unnamed alert dialog).
- **Steps:** open the composer, go to Review, press Submit proposal.
- **Expected:** an `alertdialog` named "Submit this proposal?".
- **Actual:** an `alertdialog` with no name or description.
- **Root cause:** Zag's dialog checks for its title one frame after opening and drops
  `aria-labelledby` when it isn't there yet; with `lazyMount` and a portal the title often isn't.
- **Fix:** `components/ui/dialog.tsx` and `sheet.tsx` give Ark fixed title and description ids and
  set `aria-labelledby`/`aria-describedby` on the content themselves.
- **Regression test:** W13 finds the confirmation by role and name.

### BUG-W02-4 · "Loading your proposal" never goes away after submitting
- **Flow:** W13, a proposal submitted from the composer. All viewports and themes.
- **Severity:** P1 (the new proposal can't be seen without a reload or refocus).
- **Steps:** submit a proposal; the app opens its page as soon as the transaction confirms.
- **Expected:** "Loading your proposal" until the indexer has it, then the proposal.
- **Actual:** the loading state stayed after the read model had the proposal.
- **Root cause:** the first fetch is a 404 (not indexed yet), and SWR 2 skips `refreshInterval`
  revalidation while the cached result is an error, so the page never asked again.
- **Fix:** `app/dao/[daoId]/proposals/[proposalId]/page.tsx` revalidates every 3s while it waits for
  the index.
- **Regression test:** W13 waits for the proposal's title on its page after submitting.

### BUG-W02-5 · Checking a contribution pushes Cancel off the card and the page sideways
- **Flow:** W13, Treasury → Add funds → Review contribution. Mobile and tablet, both themes.
- **Severity:** P1 on phones (Cancel can't be pressed; the page scrolls sideways).
- **Steps:** at 375 or 768px wide, enter an amount and press Review contribution.
- **Expected:** Sign and send and Cancel side by side inside the card.
- **Actual:** Sign and send fills the row and Cancel sits past the card's edge; the page scrolls
  horizontally (38px at 768px) and Cancel is covered.
- **Root cause:** `components/treasury/fund-treasury.tsx` put a `block` (full-width) button and Cancel
  in a flex row.
- **Fix:** the row is a grid: the main button takes the remaining width, Cancel its own.
- **Regression test:** W13 "checks a contribution up to the signature, then cancels it" checks for
  horizontal scroll and presses Cancel at every viewport.

### BUG-W02-6 · A proposal the Governor refuses fails with a Buffer TypeError
- **Flow:** W13 rotation run, the same payout proposed a second time (tablet after desktop). Any
  proposal the Governor refuses in simulation: already exists, too few votes.
- **Severity:** P2.
- **Steps:** submit a proposal identical to one that exists (same actions, title and reason).
- **Expected:** "Proposal failed · The proposal already exists.", nothing signed.
- **Actual:** "The first argument must be one of type string, Buffer, ArrayBuffer, Array, or
  Array-like Object. Received type object".
- **Root cause:** for a contract error, the bindings' `AssembledTransaction#result` is an `Err`
  holding the error's name, and the composer passed it straight to `Buffer.from` as the proposal id.
- **Fix:** `simulatedProposalId` in `lib/proposal-id.ts` returns the id for bytes and throws
  "Error(Contract, #N)" for an `Err`, so the usual Governor messages apply.
- **Regression test:** `lib/proposal-id.test.ts`; W13 submits the same proposal twice and expects the
  message with no second signature.

### BUG-W02-7 · The proposal composer scrolls sideways on phones when a payout suggests the title
- **Flow:** W13, a payout opened in the composer (rotation run, mobile 375×812).
- **Severity:** P1 on phones (the page pans sideways and Next: review can't be pressed).
- **Steps:** add a treasury payout, open the composer at 375px wide.
- **Expected:** the page fits the screen.
- **Actual:** the layout grew to 496px: "Suggested from the actions: Send 1 XLM to G…" holds a 56-character
  address that can't wrap, in a flex row whose items don't shrink.
- **Root cause:** the suggestion row in `app/dao/[daoId]/proposals/create/page.tsx` had no `min-width:
  0` or `overflow-wrap` for its children.
- **Fix:** its children can shrink and wrap anywhere.
- **Regression test:** W13's matrix case fills the composer and checks for horizontal scroll at every
  viewport (with the harness fix in BUG-W02-8).

### BUG-W02-8 · The harness's horizontal-scroll check missed overflow on phones
- **Flow:** every `@matrix` spec that calls `expectNoHorizontalScroll`, at mobile.
- **Severity:** P2 (a check that passes when the page overflows).
- **Root cause:** `apps/e2e/src/fixtures.ts` compared `scrollWidth` with `window.innerWidth`. With
  mobile emulation, content wider than the screen widens the layout viewport, so `innerWidth` grew
  with it (496 against a 375px screen) and the difference stayed 0.
- **Fix:** compare with `document.documentElement.clientWidth`, the screen's width.
- **Regression test:** BUG-W02-7's case fails without it.

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

### BUG-W11-1 · Market settings showed the payment asset as a contract id
- **Flow:** W11, Market settings (`/dao/<tribe>/admin/marketplace`), "Change the market payment
  asset". Every viewport and theme.
- **Severity:** P2.
- **Steps:** open Market settings of a tribe whose market takes XLM.
- **Expected:** "Now: XLM".
- **Actual:** "Now: CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC", while the select under
  it said XLM.
- **Root cause and fix:** the same defect as BUG-W09-1, found by W11 and W09 in parallel. It is fixed
  once, by BUG-W09-1's change (`knownAssetCode` and the `assetCode` on the market's setting values);
  W11 carries no code of its own for it.
- **Regression test:** BUG-W09-1's tests in `lib/proposal-actions/catalog.test.ts` and
  `lib/proposal-call.test.ts`; W11's Market settings @matrix case ("Now: XLM").

### BUG-W11-2 · A holder action's review widened the token page past the screen
- **Flow:** W14, a token page's "Your token" form, Review. Desktop (the right column), and any
  width where the column is narrower than a Stellar address.
- **Severity:** P3 (the page scrolled sideways by 19px and the four choices were clipped).
- **Steps:** on a token you hold, choose Send, enter a G-address, press Review.
- **Expected:** the summary wraps inside the card.
- **Actual:** "Transfer token #0 to G…" did not wrap; the card grew to the address's width and the
  page scrolled horizontally.
- **Root cause:** the panel `card` and `review` grids used an implicit `auto` column, whose minimum
  is the widest unbreakable word, and `reviewTitle` didn't allow breaking inside a word.
- **Fix:** `components/ui/panel-styles.ts`: both grids get one `minmax(0, 1fr)` column and
  `reviewTitle` wraps anywhere.
- **Regression test:** W14's "token form reaches the review" @matrix case (no horizontal scroll with
  the review open, at every viewport).

### BUG-W11-3 · "Cancel token approval" said the contract can't show the approval
- **Flow:** W14, a token page's "Your token" form, Cancel token approval.
- **Severity:** P2.
- **Steps:** approve a wallet for one token, then choose Cancel token approval.
- **Expected:** the form shows who is approved now, or that no one is.
- **Actual:** "The current spender isn't shown because the contract doesn't expose it." The token
  has had `get_approved` for some time, so the member couldn't see what they were cancelling, and
  could pay a fee to cancel nothing.
- **Root cause:** the copy (and a code comment in `lib/token-holder/actions.ts`) predates
  `get_approved` in the token bindings.
- **Fix:** `components/token-holder/holder-controls.tsx` reads `get_approved` for the token when
  Cancel token approval is chosen: "Approved now" with the address, or "No one is approved to move
  this token right now" with Review disabled. It reads again after a confirmed action.
- **Regression test:** W14's approve-then-cancel @chain case asserts "Approved now" before the
  cancel and `get_approved` is empty after it.

### BUG-W11-4 · A pool proposal's summary left out the asset and the sales limit
- **Flow:** W11, Market settings, Propose a quick-buy pool: the add-to-proposal check, the composer
  and the proposal page all use the action summary.
- **Severity:** P2 (members vote on terms the summary didn't state).
- **Steps:** propose a pool of 3 tokens at 1 XLM, 1 per wallet, 1 sale every 24h.
- **Expected:** "Open a quick-buy pool: 3 tokens at 1 XLM each, at most 1 per wallet and 1 sold
  every 24h, closing …".
- **Actual:** "Open a quick-buy pool: 3 tokens at 1, at most 1 per wallet, closing …": no asset, and
  no word of the per-period limit.
- **Root cause:** `getProposalActionSummary` in `lib/proposal-call.ts` printed only some of the
  pool's fields.
- **Fix:** the summary names the asset (its code when known, else its contract id) and the sales
  limit and period.
- **Regression test:** `lib/proposal-call.test.ts` ("summarises a pool with its asset and sales
  limit"); W11's pool proposal case checks the add-to-proposal dialog.

### BUG-W11-5 · A second holder action right after the first failed on chain
- **Flow:** W14, members-only delegation: delegate to a member, then at once "Vote for myself
  again". Any two holder actions (send, delegate, approve, cancel approval) in quick succession.
- **Severity:** P2 (the member pays a network fee for a transaction that can't succeed, and sees
  "Transaction … failed on-chain").
- **Steps:** on a token page, delegate to another member and wait for Confirmed; press Do something
  else, Vote for myself again, Review, Sign and send.
- **Expected:** the second delegation lands.
- **Actual:** the transaction failed with "trying to access contract data key outside of the
  footprint" for the new delegate's `DelegateCheckpoint`.
- **Root cause:** `/api/dao/<id>/tokens/prepare` simulated the second delegation on the ledger that
  held the first one (or an earlier one). The votes library writes one checkpoint per account per
  ledger: simulated in that ledger, the new delegate's checkpoint is updated in place, but the real
  transaction lands in a later ledger and writes a new checkpoint key the footprint doesn't include.
- **Fix:** the holder form remembers the ledger of its last confirmed action and sends it as
  `afterLedger`; `prepareHolderAction` (`lib/token-holder/actions.ts`) simulates again, up to five
  times two seconds apart, until the simulation's `latestLedger` is past it, then asks the member to
  wait a few seconds instead of handing over a transaction bound to fail.
- **Regression test:** `lib/token-holder/actions.test.ts` ("simulates again until RPC has the ledger
  of the last confirmed action"); W14's members-only @chain case.

### BUG-W11-6 · A token the Treasury holds showed a bare contract address as its holder
- **Flow:** W11, the token page of a token the Treasury bought (`/dao/<tribe>/token/<id>`), "Held by".
  Every viewport and theme.
- **Severity:** P3.
- **Steps:** after a Treasury purchase executes, open the bought token's page.
- **Expected:** "Held by" names the Treasury, as the member directory does.
- **Actual:** "CBW6…HND2" with "Read live from the token contract": nothing said it was the tribe's
  own Treasury (the walkthrough's first check only passed because the navigation's "Treasury" link
  matched, which is hidden on phones, so the mobile rotation caught it).
- **Root cause:** only the member directory mapped the tribe's contracts to names, in a local table.
- **Fix:** `lib/member-directory/system-holders.ts` (`systemHolderName`) names the Treasury, Auction
  and Marketplace; the directory and the token page's "Held by" both use it ("Treasury (tribe
  contract)").
- **Regression test:** `lib/member-directory/system-holders.test.ts`; W11's Treasury purchase case
  checks the "Held by" region.

### BUG-W07-1 · The inline confirmation has no accessible name
- **Flow:** W08, cancel by the proposer (proposal page, Cancel proposal). Every viewport and theme;
  every `ConfirmAction` (artwork, platform factory, proposal cancel).
- **Severity:** P3 (screen readers announce an unnamed "dialog" before a destructive action).
- **Steps:** as the proposer of a pending proposal, press Cancel proposal.
- **Expected:** a dialog named "Cancel this proposal?", described by its consequence.
- **Actual:** `role="dialog"` with no `aria-labelledby` or `aria-describedby`.
- **Root cause:** Ark's popover links the content to its title only when it has seen the title
  mounted. `ConfirmAction` mounts the content lazily inside a portal, so Ark never links them.
- **Fix:** `components/ui/confirm-action.tsx` gives the title and description ids (`useId`) and sets
  `aria-labelledby` and `aria-describedby` on the content itself.
- **Regression test:** W08's cancel case finds the confirmation by role and name
  (`getByRole('dialog', { name: 'Cancel this proposal?' })`). Vitest runs in node with no DOM, so the
  open popover can't be rendered at unit level.

### BUG-W07-2 · On a phone, a suggested proposal title widens the composer past the screen
- **Flow:** W07, composer with a payment action. Mobile (375px), both themes.
- **Severity:** P2 (the page zooms out; the action sheet then opens off to one side and its button
  is covered).
- **Steps:** on a phone, start a proposal, add "Pay someone" to a G… address, then add another action.
- **Expected:** the page stays 375px wide; "Suggested from the actions: Send 1 XLM to G…" wraps.
- **Actual:** the layout viewport grows to about 468px to fit the 56-character address; the next
  "Set up the action" sheet opens shifted left and "Add to proposal" can't be pressed.
- **Root cause:** `FieldHelperText` (and field errors) wrapped long words with the global
  `overflow-wrap: break-word`, which breaks a word only after it has set the min-content width, so the
  grid column grew to the address.
- **Fix:** `components/ui/field.tsx` sets `overflow-wrap: anywhere` on helper and error text.
- **Regression test:** `expectNoHorizontalScroll` (`apps/e2e/src/fixtures.ts`) now also fails when
  the layout viewport is wider than the screen, which a mobile browser does instead of scrolling;
  W07's composer case checks it after three actions at every viewport.

### BUG-W07-3 · At tablet width the floating Reference button covers Submit proposal
- **Flow:** W07, composer review step. Tablet (768×1024), both themes.
- **Severity:** P1 at tablet width (the proposal can't be submitted without scrolling the button away,
  and at the page's end it can't be).
- **Steps:** on a tablet, write a proposal and press Next: review.
- **Expected:** Back and Submit proposal are both pressable.
- **Actual:** the fixed "Reference" button sat over the right end of the action row, on Submit
  proposal.
- **Root cause:** the review step's Reference trigger was `position: fixed` at the bottom right,
  offset by the tab bar's height. Between md and lg there is no tab bar, so it landed on the page's own
  action row.
- **Fix:** `app/dao/[daoId]/proposals/create/page.tsx` puts the trigger in the review step's action
  row, next to Submit proposal, hidden from lg where the rail is always shown.
- **Regression test:** W07's composer case (`w08-proposal-states.spec.ts`, every viewport) presses
  Submit proposal on the review step; Playwright refuses a click on a covered button.

### BUG-W06-1 · An unreachable claim list shows members a gateway status code
- **Flow:** W12, claim from a list whose published file no gateway returns. All viewports and themes.
- **Severity:** P2.
- **Steps:** open a claim list whose `tree_uri` isn't pinned (or while IPFS gateways are down), then
  open Claims.
- **Expected:** "Claim list unavailable" says in words that the published list couldn't be loaded,
  then points to the proof file.
- **Actual:** "Claim list unavailable · 530 You can still claim with a proof file from the
  organizer." The reason was the last gateway's HTTP status (or a raw timeout message).
- **Root cause:** `fetchJson` in `apps/web/src/lib/minter/claim-list.ts` threw `${response.status}`
  for a failed gateway and rethrew the last gateway's error as the member-facing reason.
- **Fix:** every fetch failure (status, timeout, network error, a body that isn't JSON) moves on to
  the next gateway; when none answers, the reason is "The published list couldn't be loaded from
  IPFS." A too-large file keeps its own reason.
- **Regression test:** `apps/web/src/lib/minter/claim-list.test.ts`; W12 asserts the card's text.

### BUG-W06-2 · An unreachable claim list holds the Claims page for up to a minute and a half
- **Flow:** W12, the Claims page of a tribe with a list whose file no gateway returns (found at mobile,
  where the page was still loading when the check ran). All viewports and themes.
- **Severity:** P2.
- **Steps:** open Claims for a tribe with such a list, signed out or in.
- **Expected:** the lists show within seconds, marked "Claim list unavailable", with the proof file
  fallback.
- **Actual:** "Checking what you can claim…" for up to 105 seconds, every minute (the failure is
  remembered for 60s). The proof file fallback only shows once the lists load, so it was out of reach too.
- **Root cause:** `fetchJson` in `apps/web/src/lib/minter/claim-list.ts` tried the seven gateways one
  after another with a 15s timeout each.
- **Fix:** ask every gateway at once, take the first JSON answer and abort the rest, all within one
  15s budget.
- **Regression test:** `apps/web/src/lib/minter/claim-list.test.ts` (one budget, every gateway asked
  at once); W12's signed-out @matrix check waits one budget, not more.

### BUG-W06-3 · Past claims says "1 tokens"
- **Flow:** W12, Past claims after a one-token claim. All viewports and themes.
- **Severity:** P3.
- **Expected:** "1 token from Claim list 2".
- **Actual:** "1 tokens from Claim list 2".
- **Root cause:** the row in `apps/web/src/components/minter/claims.tsx` always used the plural.
- **Fix:** the singular for one token.
- **Regression test:** `apps/web/src/components/minter/claims.test.tsx` ("Past claims"); W12 asserts the row.

### BUG-W06-4 · A settled auction doesn't reach Past auctions until a reload
- **Flow:** W06, settle from the Auction page. Desktop dark (chain run); the hook is the same at every
  viewport.
- **Severity:** P3.
- **Steps:** after the end, press Settle and start the next auction, then stay on the page.
- **Expected:** the settled token and its winner appear under Past auctions.
- **Actual:** the next auction shows (it polls every 15s) but Past auctions stays at the earlier
  token until the page is reloaded. It refetched once, right after confirmation, which is usually
  before the indexer has the settlement.
- **Root cause:** `useAuctionHistory` in `apps/web/src/lib/auction-history/hooks.ts` had no refresh;
  the page only remounts it after its own transactions.
- **Fix:** the first page refetches every 30s, like the current auction does.
- **Regression test:** `apps/web/src/lib/auction-history/hooks.test.ts`; W06 waits for the token under
  Past auctions without a reload.

### BUG-CAP-1 · "Add a link" is announced as "Links"
- **Flow:** docs capture, Create → Identity (and Manage → Tribe profile) with no links yet. All viewports.
- **Severity:** P3 (accessibility).
- **Expected:** the button reads "Add a link".
- **Actual:** its accessible name was "Links". With no links, the field label pointed at the add button,
  and a label names the control it points at.
- **Root cause:** `htmlFor` in `apps/web/src/components/admin/profile-links-editor.tsx` fell back to the
  add button.
- **Fix:** with no links the label points at nothing; once a link exists it labels the first field.
- **Regression test:** the docs capture spec `apps/e2e/capture/01-create.capture.ts` finds the button by
  its own name.

### BUG-CAP-2 · Creating or launching a tribe toasts "DAO creation envelope accepted"
- **Flow:** docs capture, Create → Create tribe, and Setup → Launch. All viewports.
- **Severity:** P3 (copy).
- **Expected:** plain words, in line with the other transaction toasts ("Proposal sent", "Vote sent").
- **Actual:** "DAO creation envelope accepted" and "DAO launch envelope accepted", with "Saved …" variants
  on a resend. They use jargon ("envelope") and the DAO term the copy avoids.
- **Fix:** "Creating your tribe" and "Launching your tribe" in `apps/web/src/lib/use-dao-deployment.ts`.
- **Regression test:** none; the docs capture shows the toast when a shot keeps toasts.

### BUG-CAP-3 · Opening a claim list can't publish it to IPFS
- **Flow:** docs capture, Claims → Open a claim list (a free list or a launch drive), with uploads on.
- **Severity:** P1. No claim list can be opened in the app where uploads are on.
- **Expected:** "Publish the full list to IPFS" uploads the JSON list.
- **Actual:** Pinata refuses it: "Presigned URL does not grant permissions to upload detected MIME type:
  application/json".
- **Root cause:** `createSignedUploadUrl` in `apps/web/src/lib/pinata-service.ts` gave only the two
  image types their own policy; a claim list fell through to the artwork folder's `directory` policy.
- **Fix:** a claim list gets its own policy (`application/json`, 12 MB) from `UPLOAD_POLICIES`.
- **Regression test:** `apps/web/src/lib/pinata-service.test.ts`.

### BUG-CAP-4 · "1 tokens for you", "1 claims so far" and "1 votes"
- **Flow:** docs capture: Claims, with one token on the list and one claim made; the composer's
  For reference → Members list, for a member with one vote.
- **Severity:** P3 (copy).
- **Fix:** the singular for one, in `apps/web/src/components/minter/claims.tsx` and
  `apps/web/src/components/proposal/proposal-context-rail.tsx`.
- **Regression test:** none yet; the claims shots show it.

### BUG-CAP-5 · Open: smaller findings from the capture
- **Manage nav "Required".** After artwork and founder tokens are done, the Manage menu still marks both
  Required (`apps/web/src/components/admin/manage-nav.tsx`). Seen in setup/assurance-drives/01 to 05.
- **"Manage claim lists" in setup.** On a tribe still in setup, any token holder is offered Manage claim
  lists (`apps/web/src/hooks/use-dao-membership.ts`).
- **"Quorum reached (5 of 1)".** The count reads backwards; "5 votes, 1 needed" would be clearer.
- **The top bar.** Fixed: it was transparent (commit 0d5f0cd), so page text showed under the tribe
  switcher and the avatar when a page scrolled. It is translucent again (88% canvas with a 12px blur,
  `apps/web/src/components/shell/shell-frame.tsx`). Shots captured before the fix still show it.
- **Raw ids in copy.** The pool buy dialog names the full Treasury contract id ("Pay 25 XLM to the tribe
  Treasury CCJC…"); the Link field shows the contract id before the slug loads; action rows and the
  review on phones show full account addresses.
- **"Step 3 of 2".** The List for sale dialog says it after both steps are done (phones); on desktop the
  step labels are clipped ("Allow the market to hold your tol…").
- **The Why byte count.** An empty Why box reports "46 used" (the title and links count too, but the line
  reads as the box's own count).
- **Raw values in a pool's steps.** "Raise the mint allowance of CCCIPL… by 3 tokens" names the
  marketplace by its contract id, and "closing 2026-12-04T12:30:00.000Z" shows an ISO timestamp.
- **Collapsed steps.** "In this proposal (2 actions)" shows one row for a pool or a Treasury purchase,
  whose two steps are folded into it.
- **Phones.** The Market settings bar covers listing content above the tab bar; Manage pages show the
  action button twice (inline and in the sticky bar); the CSV row cuts the file name and wraps "3 rows
  read" onto three lines; the contract rows' badges don't line up; the legal summary preview shows two
  lines.
- **The pool card on the tribe home** shows an empty image area before the pool has stock.
- **Claims toast.** After both signatures of a free list, the first toast keeps spinning with "Approve
  the transaction in your wallet" (`apps/web/src/components/minter/allocation-draft.tsx`).
