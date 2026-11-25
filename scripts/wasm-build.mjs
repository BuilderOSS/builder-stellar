import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Reproducible contract builds and their published hashes (docs/REPRODUCIBLE_BUILDS.md).
 *
 * - `buildInContainer` builds one commit's contracts in the pinned image (docker/wasm-build) from a
 *   `git archive` of that commit, so the working tree, the host's toolchain and its caches never
 *   reach the build.
 * - `releases/hashes.json` publishes the sha256 of each deployable contract for the commit it is
 *   committed in. A release tag carries it, and `scripts/verify-wasm.mjs <tag>` rebuilds the tag and
 *   compares.
 * - `assertUploadProvenance` is what the upload scripts call before sending code to a network.
 */

export const HASHES_PATH = 'releases/hashes.json';
export const RELEASE_MANIFEST_PATH = 'releases/contracts.json';
export const DOCKER_DIR = 'docker/wasm-build';
export const TOOLCHAIN_PATH = 'rust-toolchain.toml';

/** Paths whose content decides the WASM bytes. */
export const WASM_INPUTS = ['contracts', 'Cargo.toml', 'Cargo.lock', TOOLCHAIN_PATH, '.cargo', DOCKER_DIR];
/** What an upload must have committed: the WASM inputs plus the release labels and published hashes. */
export const UPLOAD_INPUTS = [...WASM_INPUTS, 'releases'];

export function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function gitRaw(args, { cwd = process.cwd(), input } = {}) {
  const result = spawnSync('git', args, { cwd, input, encoding: 'buffer', maxBuffer: 512 * 1024 * 1024 });
  if (result.status !== 0) {
    const message = (result.stderr?.toString() || result.stdout?.toString() || '').trim();
    throw new Error(`git ${args.join(' ')} failed: ${message || `exit ${result.status}`}`);
  }
  return result.stdout;
}

export function git(args, options) {
  return gitRaw(args, options).toString('utf8').trim();
}

/** The full commit id a ref names. Throws for a ref that is not a commit. */
export function resolveCommit(ref, { cwd } = {}) {
  return git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { cwd });
}

/** A file's content at a commit, or null when the commit does not have it. */
export function fileAt(commit, path, { cwd } = {}) {
  const result = spawnSync('git', ['show', `${commit}:${path}`], { cwd, encoding: 'utf8' });
  return result.status === 0 ? result.stdout : null;
}

/** The deployable crates: the keys of releases/contracts.json, sorted. */
export function deployableCrates(manifestText) {
  return Object.keys(JSON.parse(manifestText)).sort();
}

/** Host triples of the platforms the build image may pin (`rustc -vV` reports this as `host`). */
const PLATFORM_HOSTS = { 'linux/amd64': 'x86_64-unknown-linux-gnu', 'linux/arm64': 'aarch64-unknown-linux-gnu' };

/**
 * The toolchain a commit pins, read from its rust-toolchain.toml and docker/wasm-build/Dockerfile.
 * Throws when either is missing, when the image is not pinned by digest and platform, or when the
 * two files name different Rust versions, since a build from such a commit would not be the build
 * the toolchain file describes.
 */
export function parseToolchain(toolchainToml, dockerfile) {
  const channel = toolchainToml?.match(/^\s*channel\s*=\s*"([^"]+)"/m)?.[1];
  if (!channel || !/^\d+\.\d+\.\d+$/.test(channel)) throw new Error(`${TOOLCHAIN_PATH} has no exact channel`);
  const from = dockerfile?.match(/^FROM\s+--platform=(\S+)\s+(rust:\S+@sha256:[0-9a-f]{64})\s*$/m);
  if (!from) throw new Error(`${DOCKER_DIR}/Dockerfile has no platform- and digest-pinned rust image`);
  const [, platform, image] = from;
  const host = PLATFORM_HOSTS[platform];
  if (!host) throw new Error(`${DOCKER_DIR}/Dockerfile pins an unknown platform ${platform}`);
  const imageRust = image.match(/^rust:(\d+\.\d+\.\d+)/)?.[1];
  if (imageRust !== channel) {
    throw new Error(`${TOOLCHAIN_PATH} pins Rust ${channel} but the build image is ${image}`);
  }
  const cliVersions = [...dockerfile.matchAll(/stellar-cli\/releases\/download\/v(\d+\.\d+\.\d+)\//g)].map((m) => m[1]);
  if (cliVersions.length === 0 || new Set(cliVersions).size !== 1) {
    throw new Error(`${DOCKER_DIR}/Dockerfile must download exactly one Stellar CLI version`);
  }
  return { rustc: channel, stellarCli: cliVersions[0], image, platform, host };
}

export function toolchainAt(commit, { cwd } = {}) {
  return parseToolchain(fileAt(commit, TOOLCHAIN_PATH, { cwd }), fileAt(commit, `${DOCKER_DIR}/Dockerfile`, { cwd }));
}

/** The releases/hashes.json document for a set of built files (`{ crate: Buffer }`). */
export function hashesDocument(toolchain, files) {
  const contracts = {};
  for (const crate of Object.keys(files).sort()) {
    contracts[crate] = { sha256: sha256Hex(files[crate]), bytes: files[crate].length };
  }
  return { schema: 1, toolchain, contracts };
}

export function formatHashes(document) {
  return `${JSON.stringify(document, null, 2)}\n`;
}

/** The published document at a commit, or null when that commit has none. */
export function publishedHashesAt(commit, { cwd } = {}) {
  const text = fileAt(commit, HASHES_PATH, { cwd });
  return text === null ? null : JSON.parse(text);
}

/**
 * Compare a published document with a build. Returns one row per crate in either, and `ok` only
 * when both name the same crates with the same sha256 and the same toolchain.
 */
export function compareHashes(published, built) {
  const crates = [...new Set([...Object.keys(published.contracts ?? {}), ...Object.keys(built.contracts ?? {})])].sort();
  const rows = crates.map((crate) => {
    const expected = published.contracts?.[crate]?.sha256 ?? null;
    const actual = built.contracts?.[crate]?.sha256 ?? null;
    return { crate, published: expected, built: actual, match: expected !== null && expected === actual };
  });
  const toolchainMatches = JSON.stringify(published.toolchain ?? null) === JSON.stringify(built.toolchain ?? null);
  return { ok: toolchainMatches && rows.every((row) => row.match), toolchainMatches, rows };
}

/** `git status` lines for uncommitted changes (untracked files included) under `paths`. */
export function uncommittedChanges(paths, { cwd } = {}) {
  const output = git(['status', '--porcelain=v1', '--untracked-files=all', '--', ...paths], { cwd });
  return output ? output.split('\n') : [];
}

/**
 * Refuse an upload whose code is not the published build of the checked-out commit. Called before
 * any network call by the scripts that upload contract code.
 *
 * - The build inputs, release labels and published hashes must be committed: otherwise the code
 *   cannot be traced to a commit anyone else can rebuild.
 * - The file's sha256 must be the one releases/hashes.json publishes for its crate at HEAD:
 *   otherwise voters approving the hash have nothing to rebuild it from.
 *
 * Returns the commit and hash on success.
 */
export function assertUploadProvenance({ crate, wasmPath, cwd = process.cwd() }) {
  let head;
  try {
    head = resolveCommit('HEAD', { cwd });
  } catch {
    throw new Error('Refusing to upload: this is not a git checkout, so the code cannot be traced to a commit.');
  }
  const dirty = uncommittedChanges(UPLOAD_INPUTS, { cwd });
  if (dirty.length > 0) {
    throw new Error(
      `Refusing to upload: the build inputs have uncommitted changes:\n${dirty.map((line) => `  ${line}`).join('\n')}\n` +
        'Commit or discard them first: uploaded code must be the published build of a commit.'
    );
  }
  const published = publishedHashesAt(head, { cwd });
  const expected = published?.contracts?.[crate]?.sha256;
  if (!expected) {
    throw new Error(
      `Refusing to upload: ${HASHES_PATH} at ${head.slice(0, 12)} publishes no hash for ${crate}. ` +
        'Publish the release hashes first (node scripts/build-wasm.mjs --write-hashes).'
    );
  }
  const actual = sha256Hex(readFileSync(join(cwd, wasmPath)));
  if (actual !== expected) {
    throw new Error(
      `Refusing to upload ${wasmPath}: its sha256 is ${actual}, but ${HASHES_PATH} at ${head.slice(0, 12)} ` +
        `publishes ${expected} for ${crate}.\n` +
        'Build with the pinned toolchain (rust-toolchain.toml and stellar-cli ' +
        `${published.toolchain?.stellarCli ?? '?'}), or in the container (node scripts/build-wasm.mjs), ` +
        'and publish new hashes before an upgrade (docs/REPRODUCIBLE_BUILDS.md).'
    );
  }
  return { commit: head, sha256: actual };
}

function docker(args, { input, cwd } = {}) {
  const result = spawnSync('docker', args, {
    cwd,
    input,
    stdio: [input ? 'pipe' : 'ignore', 'pipe', 'inherit'],
    maxBuffer: 512 * 1024 * 1024
  });
  if (result.error) throw new Error(`docker ${args[0]} failed: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`docker ${args[0]} failed with exit code ${result.status}`);
  return result.stdout;
}

/**
 * Build the deployable contracts of `ref` in the pinned container and write them, with their
 * hashes, to `outDir` (`wasm/<crate>.wasm`, `SHA256SUMS`, `hashes.json`). The image is built from
 * the Dockerfile at that commit, on the platform it pins, so an old tag rebuilds with the toolchain
 * it recorded.
 */
export function buildInContainer({ ref = 'HEAD', outDir, cwd = process.cwd() }) {
  const commit = resolveCommit(ref, { cwd });
  const toolchain = toolchainAt(commit, { cwd });
  const manifest = fileAt(commit, RELEASE_MANIFEST_PATH, { cwd });
  if (manifest === null) throw new Error(`${commit.slice(0, 12)} has no ${RELEASE_MANIFEST_PATH}`);
  const crates = deployableCrates(manifest);

  const platformArgs = ['--platform', toolchain.platform];
  const imageTree = git(['rev-parse', `${commit}:${DOCKER_DIR}`], { cwd });
  const image = `tribes-wasm-build:${imageTree.slice(0, 12)}`;
  console.error(
    `Building image ${image} (Rust ${toolchain.rustc}, Stellar CLI ${toolchain.stellarCli}, ${toolchain.platform})`
  );
  docker(['build', ...platformArgs, '--tag', image, '-'], { input: gitRaw(['archive', '--format=tar', `${commit}:${DOCKER_DIR}`], { cwd }), cwd });

  console.error(`Building contracts at ${commit}`);
  const source = gitRaw(['archive', '--format=tar', commit], { cwd });
  const artifacts = docker(['run', '--rm', '--interactive', ...platformArgs, image], { input: source, cwd });

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const unpack = spawnSync('tar', ['-x', '-f', '-', '-C', outDir], { input: artifacts });
  if (unpack.status !== 0) throw new Error(`could not unpack the build output: ${unpack.stderr?.toString()}`);

  const files = {};
  for (const crate of crates) {
    const path = join(outDir, 'wasm', `${crate}.wasm`);
    if (!existsSync(path)) throw new Error(`the build did not produce ${crate}.wasm`);
    files[crate] = readFileSync(path);
  }
  const document = hashesDocument(toolchain, files);
  // The container's own sha256sum must agree with ours: a mismatch means the archive was altered.
  const sums = readFileSync(join(outDir, 'SHA256SUMS'), 'utf8');
  for (const [crate, { sha256 }] of Object.entries(document.contracts)) {
    if (!sums.includes(`${sha256}  wasm/${crate}.wasm`)) {
      throw new Error(`SHA256SUMS from the container does not list ${crate} as ${sha256}`);
    }
  }
  writeFileSync(join(outDir, 'hashes.json'), formatHashes(document));
  return { commit, document };
}

/** Print a hash comparison as a table and return whether every row matched. */
export function printComparison(label, comparison) {
  for (const row of comparison.rows) {
    const status = row.match ? 'match' : 'DIFFERENT';
    console.log(`${row.crate.padEnd(12)} ${status.padEnd(9)} published ${row.published ?? '(none)'}`);
    if (!row.match) console.log(`${''.padEnd(22)} built     ${row.built ?? '(none)'}`);
  }
  if (!comparison.toolchainMatches) console.log(`The toolchain recorded in ${label} differs from the one the build used.`);
  return comparison.ok;
}
