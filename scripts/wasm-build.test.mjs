import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assertUploadProvenance,
  compareHashes,
  formatHashes,
  hashesDocument,
  parseToolchain,
  sha256Hex
} from './wasm-build.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

const TOOLCHAIN = { rustc: '1.95.0', stellarCli: '28.0.0', image: 'rust:x', platform: 'linux/amd64', host: 'h' };
const WASM = Buffer.from('\0asm token code');

function git(cwd, ...args) {
  const result = spawnSync(
    'git',
    ['-c', 'user.name=test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args],
    { cwd, encoding: 'utf8' }
  );
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function write(dir, path, content) {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), content);
}

/** A committed checkout whose releases/hashes.json publishes `publishedToken` for the token crate. */
function checkout(publishedToken = sha256Hex(WASM)) {
  const dir = mkdtempSync(join(tmpdir(), 'wasm-provenance-'));
  git(dir, 'init', '-q');
  write(dir, '.gitignore', 'target\n');
  write(dir, 'contracts/token/src/lib.rs', '// token\n');
  write(dir, 'Cargo.lock', '# lock\n');
  write(dir, 'releases/contracts.json', JSON.stringify({ token: '0.4.0' }));
  write(dir, 'releases/hashes.json', formatHashes({ schema: 1, toolchain: TOOLCHAIN, contracts: { token: { sha256: publishedToken, bytes: WASM.length } } }));
  write(dir, 'apps/web/page.ts', '// web\n');
  write(dir, 'target/wasm32v1-none/release/token.wasm', WASM);
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'release');
  return dir;
}

test('the pinned toolchain parses from rust-toolchain.toml and the build image', () => {
  const toolchain = parseToolchain(read('rust-toolchain.toml'), read('docker/wasm-build/Dockerfile'));
  assert.equal(toolchain.rustc, '1.95.0');
  assert.equal(toolchain.stellarCli, '28.0.0');
  assert.equal(toolchain.platform, 'linux/amd64');
  assert.equal(toolchain.host, 'x86_64-unknown-linux-gnu');
  assert.match(toolchain.image, /^rust:1\.95\.0-[\w.-]+@sha256:[0-9a-f]{64}$/);
});

test('a toolchain file and build image that disagree, or an unpinned image, are refused', () => {
  const dockerfile = read('docker/wasm-build/Dockerfile');
  assert.throws(() => parseToolchain('[toolchain]\nchannel = "1.96.0"\n', dockerfile), /pins Rust 1\.96\.0/);
  assert.throws(() => parseToolchain('[toolchain]\nchannel = "stable"\n', dockerfile), /no exact channel/);
  const unpinned = dockerfile.replace(/@sha256:[0-9a-f]{64}/, '');
  assert.throws(() => parseToolchain(read('rust-toolchain.toml'), unpinned), /digest-pinned/);
  const noPlatform = dockerfile.replace(/--platform=linux\/amd64 /, '');
  assert.throws(() => parseToolchain(read('rust-toolchain.toml'), noPlatform), /platform/);
});

test('CI installs the same Stellar CLI archive as the build image', () => {
  const ci = read('.github/workflows/ci.yml');
  const dockerfile = read('docker/wasm-build/Dockerfile');
  const version = ci.match(/STELLAR_CLI_VERSION:\s*([\d.]+)/)?.[1];
  const sha = ci.match(/STELLAR_CLI_SHA256:\s*([0-9a-f]{64})/)?.[1];
  assert.equal(version, parseToolchain(read('rust-toolchain.toml'), dockerfile).stellarCli);
  assert.ok(sha && dockerfile.includes(`--checksum=sha256:${sha}`), 'CI and the image must pin the same x86_64 archive');
});

// releases/hashes.json describes the last release, so it may trail the contracts and the toolchain on
// dev; it must still be a complete record that verify-wasm can check.
test('the published hashes are a complete record', () => {
  const published = JSON.parse(read('releases/hashes.json'));
  assert.equal(published.schema, 1);
  for (const field of ['rustc', 'stellarCli', 'image', 'platform', 'host']) {
    assert.equal(typeof published.toolchain[field], 'string', `toolchain.${field}`);
  }
  const crates = Object.keys(JSON.parse(read('releases/contracts.json')));
  for (const crate of Object.keys(published.contracts)) assert.ok(crates.includes(crate), `${crate} is a released crate`);
  for (const { sha256, bytes } of Object.values(published.contracts)) {
    assert.match(sha256, /^[0-9a-f]{64}$/);
    assert.ok(Number.isInteger(bytes) && bytes > 0 && bytes <= 131_072, 'within the network code size limit');
  }
});

test('a hashes document lists crates in order with their sha256 and size', () => {
  const document = hashesDocument(TOOLCHAIN, { token: WASM, auction: Buffer.from('a') });
  assert.deepEqual(Object.keys(document.contracts), ['auction', 'token']);
  assert.equal(document.contracts.token.sha256, sha256Hex(WASM));
  assert.equal(document.contracts.token.bytes, WASM.length);
});

test('a comparison passes only on identical hashes and toolchain', () => {
  const published = hashesDocument(TOOLCHAIN, { token: WASM, auction: Buffer.from('a') });
  assert.equal(compareHashes(published, published).ok, true);

  const changed = hashesDocument(TOOLCHAIN, { token: Buffer.from('other'), auction: Buffer.from('a') });
  const result = compareHashes(published, changed);
  assert.equal(result.ok, false);
  assert.deepEqual(result.rows.filter((row) => !row.match).map((row) => row.crate), ['token']);

  const missing = hashesDocument(TOOLCHAIN, { auction: Buffer.from('a') });
  assert.equal(compareHashes(published, missing).ok, false);

  const otherCompiler = hashesDocument({ ...TOOLCHAIN, rustc: '1.96.0' }, { token: WASM, auction: Buffer.from('a') });
  assert.equal(compareHashes(published, otherCompiler).ok, false);
});

test('an upload outside a git checkout is refused', () => {
  const dir = mkdtempSync(join(tmpdir(), 'no-git-'));
  try {
    write(dir, 'token.wasm', WASM);
    assert.throws(() => assertUploadProvenance({ crate: 'token', wasmPath: 'token.wasm', cwd: dir }), /not a git checkout/);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('an upload with uncommitted or untracked build inputs is refused', () => {
  const dir = checkout();
  const wasmPath = 'target/wasm32v1-none/release/token.wasm';
  try {
    write(dir, 'contracts/token/src/lib.rs', '// edited\n');
    assert.throws(() => assertUploadProvenance({ crate: 'token', wasmPath, cwd: dir }), /uncommitted changes:\n {2}M contracts\/token\/src\/lib\.rs/);
    git(dir, 'checkout', '--', 'contracts');

    write(dir, 'contracts/token/src/extra.rs', '// new\n');
    assert.throws(() => assertUploadProvenance({ crate: 'token', wasmPath, cwd: dir }), /\?\? contracts\/token\/src\/extra\.rs/);
    rmSync(join(dir, 'contracts/token/src/extra.rs'));

    // A local edit to the published hashes is a dirty input too, not a way round the check.
    write(dir, 'releases/hashes.json', '{}');
    assert.throws(() => assertUploadProvenance({ crate: 'token', wasmPath, cwd: dir }), /releases\/hashes\.json/);
    git(dir, 'checkout', '--', 'releases');

    // Changes outside the build inputs do not block an upload.
    write(dir, 'apps/web/page.ts', '// edited\n');
    assert.equal(assertUploadProvenance({ crate: 'token', wasmPath, cwd: dir }).sha256, sha256Hex(WASM));
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('an upload whose hash is not the published one, or is not published, is refused', () => {
  const dir = checkout('0'.repeat(64));
  try {
    assert.throws(
      () => assertUploadProvenance({ crate: 'token', wasmPath: 'target/wasm32v1-none/release/token.wasm', cwd: dir }),
      new RegExp(`its sha256 is ${sha256Hex(WASM)}, but releases/hashes\\.json at [0-9a-f]{12} publishes 0{64} for token`)
    );
    assert.throws(
      () => assertUploadProvenance({ crate: 'auction', wasmPath: 'target/wasm32v1-none/release/token.wasm', cwd: dir }),
      /publishes no hash for auction/
    );
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('the published build of a clean checkout passes, with its commit', () => {
  const dir = checkout();
  try {
    const result = assertUploadProvenance({ crate: 'token', wasmPath: 'target/wasm32v1-none/release/token.wasm', cwd: dir });
    assert.equal(result.commit, git(dir, 'rev-parse', 'HEAD'));
  } finally {
    rmSync(dir, { recursive: true });
  }
});

/** Run upgrade-contract.mjs in a checkout with a fake `stellar` that logs every call and fails. */
function runUpgrade(dir) {
  for (const file of ['upgrade-contract.mjs', 'lib.mjs', 'wasm-build.mjs']) {
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    copyFileSync(join(ROOT, 'scripts', file), join(dir, 'scripts', file));
  }
  write(dir, 'configs/testnet-manager.json', JSON.stringify({ label: 'test', network: 'testnet' }));
  write(dir, 'configs/testnet-test-dao.json', JSON.stringify({ nonce: 1 }));
  write(dir, 'deploys/test-testnet-manager.json', JSON.stringify({ manager: 'CMANAGER' }));
  git(dir, 'add', 'scripts', 'configs', 'deploys');
  git(dir, 'commit', '-q', '-m', 'scripts');
  const bin = join(dir, 'fake-bin');
  const log = join(dir, 'stellar-calls.log');
  write(dir, 'fake-bin/stellar', `#!/bin/sh\necho "$@" >> "${log}"\nexit 1\n`);
  chmodSync(join(bin, 'stellar'), 0o755);
  const result = spawnSync(
    process.execPath,
    ['scripts/upgrade-contract.mjs', 'token', 'configs/testnet-test-dao.json', 'configs/testnet-manager.json', 'a'.repeat(64)],
    { cwd: dir, encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } }
  );
  return { ...result, stellarCalls: existsSync(log) ? readFileSync(log, 'utf8') : '' };
}

test('upgrade-contract refuses a dirty tree before calling the network', () => {
  const dir = checkout();
  try {
    write(dir, 'Cargo.lock', '# changed\n');
    const result = runUpgrade(dir);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Refusing to upload: the build inputs have uncommitted changes/);
    assert.equal(result.stellarCalls, '', 'no stellar command may run');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('upgrade-contract refuses an unpublished hash before calling the network', () => {
  const dir = checkout('f'.repeat(64));
  try {
    const result = runUpgrade(dir);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Refusing to upload target\/wasm32v1-none\/release\/token\.wasm/);
    assert.equal(result.stellarCalls, '', 'no stellar command may run');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('upgrade-contract goes on to the network with the published build of a clean tree', () => {
  const dir = checkout();
  try {
    const result = runUpgrade(dir);
    // The fake CLI fails the first read, so the script stops there; it got past the provenance check.
    assert.match(result.stellarCalls, /get_implementation_version/);
  } finally {
    rmSync(dir, { recursive: true });
  }
});
