/**
 * Claim-tree builder for scripts/e2e-membership.mjs. It runs the web app's own tree code
 * (apps/web/src/lib/minter/tree.ts) so the rehearsal claims against the exact tree the app publishes:
 *
 *   cd apps/web && pnpm exec vite-node --config vitest.config.ts ../../scripts/e2e-membership-tree.ts <spec.json> <out.json>
 *
 * spec: { network, token, list, entries: [{ address, amount }] }
 * out:  the published tree file. The last stdout line is JSON { root, total, claims }.
 */
import { readFileSync, writeFileSync } from 'node:fs';

import { buildClaimTree, claimTreeJson, verifyClaimTree } from '../apps/web/src/lib/minter/tree';

const [specPath, outPath] = process.argv.slice(2);
if (!specPath || !outPath) throw new Error('usage: e2e-membership-tree.ts <spec.json> <out.json>');

const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const tree = buildClaimTree(spec.entries, { network: spec.network, token: spec.token, list: spec.list });
// Round-trip through the verifier, as the web claim flow does with a fetched file.
verifyClaimTree(JSON.parse(claimTreeJson(tree)), { network: spec.network, token: spec.token, root: tree.merkleRoot });
writeFileSync(outPath, claimTreeJson(tree));
console.log(JSON.stringify({ root: tree.merkleRoot, total: tree.tokenTotal, claims: tree.claims }));
