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
