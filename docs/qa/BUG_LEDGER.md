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
