import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  HASHES_PATH,
  WASM_INPUTS,
  buildInContainer,
  formatHashes,
  parseArgs,
  resolveCommit,
  uncommittedChanges
} from './wasm-build.mjs';

/**
 * Build one commit's contracts in the pinned container (docs/REPRODUCIBLE_BUILDS.md).
 *
 *   node scripts/build-wasm.mjs [<ref>] [--out <dir>] [--write-hashes]
 *
 * <ref> defaults to HEAD. Only committed content is built: uncommitted edits are never in the
 * output. The WASM files, SHA256SUMS and hashes.json go to --out (default target/wasm-build/<commit>).
 * --write-hashes also writes the hashes to releases/hashes.json, for the release commit; it needs
 * <ref> to be HEAD and the build inputs committed, so the file describes the tree it is committed in.
 */

const USAGE = 'Usage: node scripts/build-wasm.mjs [<ref>] [--out <dir>] [--write-hashes]';
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(USAGE);
  process.exit(0);
}
const { options, positionals } = parseArgs(process.argv.slice(2), { values: ['--out'], flags: ['--write-hashes'], usage: USAGE });
if (positionals.length > 1) throw new Error(USAGE);
const ref = positionals[0] ?? 'HEAD';
const outDir = options.out;
const writeHashes = options['write-hashes'] === true;

const commit = resolveCommit(ref);
if (writeHashes) {
  if (commit !== resolveCommit('HEAD')) {
    throw new Error(`--write-hashes describes the checked-out commit: check out ${ref} first.`);
  }
  // A hash file written next to uncommitted contract changes would describe code nobody can rebuild.
  const dirty = uncommittedChanges(WASM_INPUTS);
  if (dirty.length > 0) {
    throw new Error(`Commit the build inputs before writing ${HASHES_PATH}:\n${dirty.map((l) => `  ${l}`).join('\n')}`);
  }
}

const out = outDir ?? join('target', 'wasm-build', commit);
const { document } = buildInContainer({ ref: commit, outDir: out });

console.log(`Built ${commit} with Rust ${document.toolchain.rustc} and Stellar CLI ${document.toolchain.stellarCli}`);
console.log(`(${document.toolchain.platform}, ${document.toolchain.image})\n`);
for (const [crate, { sha256, bytes }] of Object.entries(document.contracts)) {
  console.log(`${crate.padEnd(12)} ${sha256}  ${bytes} bytes`);
}
console.log(`\nWASM, SHA256SUMS and hashes.json: ${out}`);
if (writeHashes) {
  writeFileSync(HASHES_PATH, formatHashes(document));
  console.log(`Wrote ${HASHES_PATH}. Commit it with the release; tag that commit.`);
}
