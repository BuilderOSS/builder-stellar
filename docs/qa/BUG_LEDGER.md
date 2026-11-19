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
