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
