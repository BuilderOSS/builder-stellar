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
