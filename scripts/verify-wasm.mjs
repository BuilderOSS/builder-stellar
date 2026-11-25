import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  HASHES_PATH,
  buildInContainer,
  compareHashes,
  hashesDocument,
  parseArgs,
  printComparison,
  publishedHashesAt,
  resolveCommit,
  toolchainAt
} from './wasm-build.mjs';

/**
 * Check a tag's contracts against the hashes it publishes in releases/hashes.json
 * (docs/REPRODUCIBLE_BUILDS.md).
 *
 *   node scripts/verify-wasm.mjs <tag> [--out <dir>]     rebuild the tag in the pinned container
 *   node scripts/verify-wasm.mjs <tag> --wasm-dir <dir>  check existing <crate>.wasm files instead,
 *                                                        for example a native build or downloaded files
 *
 * Exits 0 only when every published contract matches byte for byte, 1 when any differs, and 2 for a
 * usage error or a tag with nothing to verify. Anyone can run it from a fresh
 * clone with Docker and git; it needs no keys and sends nothing to a network beyond fetching the
 * image, the Stellar CLI and the crates.
 */

const USAGE = 'Usage: node scripts/verify-wasm.mjs <tag> [--out <dir> | --wasm-dir <dir>]';
let parsed;
try {
  parsed = parseArgs(process.argv.slice(2), { values: ['--out', '--wasm-dir'], usage: USAGE });
} catch {
  usage();
}
function usage() {
  console.error(USAGE);
  process.exit(2);
}
const { options, positionals } = parsed;
const tag = positionals[0];
const outOption = options.out;
const wasmDir = options['wasm-dir'];
if (!tag || positionals.length > 1 || (outOption && wasmDir)) usage();

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
// The recorded toolchain must be the one the tag's own files pin; a container build uses those files.
const pinned = toolchainAt(commit);

let document;
let source;
if (wasmDir) {
  // Only the bytes can be checked here; the files carry no record of the machine that built them.
  const files = {};
  for (const crate of Object.keys(published.contracts)) {
    const path = join(wasmDir, `${crate}.wasm`);
    if (existsSync(path)) files[crate] = readFileSync(path);
  }
  document = hashesDocument(published.toolchain, files);
  source = wasmDir;
} else {
  source = outOption ?? join('target', 'verify-wasm', tag.replace(/[^\w.-]+/g, '_'));
  ({ document } = buildInContainer({ ref: commit, outDir: source }));
}

console.log(`\n${tag} (${commit})`);
console.log(`Toolchain: Rust ${pinned.rustc}, Stellar CLI ${pinned.stellarCli}, ${pinned.platform}, ${pinned.image}\n`);
const ok = printComparison(`${tag}:${HASHES_PATH}`, compareHashes(published, document));
console.log(
  ok
    ? `\nEvery contract published by ${tag} matches byte for byte. Files: ${source}`
    : `\nThe files in ${source} do NOT match the hashes ${tag} publishes.`
);
process.exit(ok ? 0 : 1);
