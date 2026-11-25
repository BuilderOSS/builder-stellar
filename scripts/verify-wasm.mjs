import { join } from 'node:path';

import {
  HASHES_PATH,
  buildInContainer,
  compareHashes,
  printComparison,
  publishedHashesAt,
  resolveCommit,
  toolchainAt
} from './wasm-build.mjs';

/**
 * Rebuild a tag in the pinned container and compare every contract with the hashes the tag
 * publishes in releases/hashes.json (docs/REPRODUCIBLE_BUILDS.md).
 *
 *   node scripts/verify-wasm.mjs <tag> [--out <dir>]
 *
 * Exits 0 only when every published contract rebuilds byte for byte with the recorded toolchain.
 * Anyone can run it from a fresh clone with Docker and git; it needs no keys and sends nothing to a
 * network beyond fetching the image, the Stellar CLI and the crates.
 */

const USAGE = 'Usage: node scripts/verify-wasm.mjs <tag> [--out <dir>]';
const args = process.argv.slice(2);
const tag = args.find((arg, i) => !arg.startsWith('--') && args[i - 1] !== '--out');
const outIndex = args.indexOf('--out');
if (!tag || (outIndex >= 0 && !args[outIndex + 1])) {
  console.error(USAGE);
  process.exit(2);
}

let commit;
try {
  commit = resolveCommit(tag);
} catch {
  console.error(`${tag} is not a commit in this clone. Fetch tags first: git fetch --tags`);
  process.exit(2);
}
const published = publishedHashesAt(commit);
if (!published) {
  console.error(`${tag} has no ${HASHES_PATH}, so it publishes no hashes to verify.`);
  process.exit(2);
}
// The recorded toolchain must be the one the tag's own files pin; the build below uses those files.
const pinned = toolchainAt(commit);

const outDir = outIndex >= 0 ? args[outIndex + 1] : join('target', 'verify-wasm', tag.replace(/[^\w.-]+/g, '_'));
const { document } = buildInContainer({ ref: commit, outDir });

console.log(`\n${tag} (${commit})`);
console.log(`Toolchain: Rust ${pinned.rustc}, Stellar CLI ${pinned.stellarCli}, ${pinned.platform}, ${pinned.image}\n`);
const ok = printComparison(`${tag}:${HASHES_PATH}`, compareHashes(published, document));
console.log(
  ok
    ? `\nEvery contract in ${tag} rebuilds byte for byte. Rebuilt files: ${outDir}`
    : `\n${tag} does NOT rebuild to its published hashes. Rebuilt files: ${outDir}`
);
process.exit(ok ? 0 : 1);
