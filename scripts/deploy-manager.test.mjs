import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { publishedBuildRequired } from './deploy-guards.mjs';
import { formatHashes, sha256Hex } from './wasm-build.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CRATES = ['manager', 'token', 'metadata', 'auction', 'governor', 'treasury', 'marketplace', 'minter'];
const ADMIN = 'GADMINADDRESSFORTHEDEPLOYTEST';
const TOOLCHAIN = { rustc: '1.95.0', stellarCli: '28.0.0', image: 'rust:x', platform: 'linux/amd64', host: 'h' };
const WASM_DIR = 'release-build/wasm';
const wasmFor = (crate) => Buffer.from(`\0asm ${crate} code`);

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

/**
 * A committed checkout of the deploy scripts whose releases/hashes.json publishes every crate's file in
 * `release-build/wasm` (or `published` overrides), with HEAD tagged `release-test` and the tag pushed to a
 * local bare `origin`.
 */
function checkout({ published = {}, tag = 'release-test' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'deploy-manager-'));
  git(dir, 'init', '-q');
  write(dir, '.gitignore', 'release-build\norigin.git\nfake-bin\nstellar-calls.log\ndeploys\n');
  for (const file of ['deploy-manager.mjs', 'deploy-guards.mjs', 'lib.mjs', 'wasm-build.mjs']) {
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    copyFileSync(join(ROOT, 'scripts', file), join(dir, 'scripts', file));
  }
  write(dir, 'contracts/token/src/lib.rs', '// token\n');
  write(dir, 'Cargo.lock', '# lock\n');
  write(dir, 'releases/contracts.json', JSON.stringify(Object.fromEntries(CRATES.map((crate) => [crate, '0.6.0']))));
  const contracts = Object.fromEntries(
    CRATES.map((crate) => [crate, { sha256: published[crate] ?? sha256Hex(wasmFor(crate)), bytes: wasmFor(crate).length }])
  );
  write(dir, 'releases/hashes.json', formatHashes({ schema: 1, toolchain: TOOLCHAIN, contracts }));
  for (const network of ['local', 'testnet', 'mainnet']) {
    write(
      dir,
      `configs/${network}.json`,
      JSON.stringify({
        network,
        label: 'test',
        adminAddress: ADMIN,
        rpcUrl: 'http://127.0.0.1:1',
        networkPassphrase: network === 'mainnet' ? 'Public Global Stellar Network ; September 2015' : 'Test SDF Network ; September 2015'
      })
    );
  }
  for (const crate of CRATES) write(dir, `${WASM_DIR}/${crate}.wasm`, wasmFor(crate));
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'release');
  git(dir, 'init', '-q', '--bare', 'origin.git');
  git(dir, 'remote', 'add', 'origin', join(dir, 'origin.git'));
  if (tag) {
    git(dir, 'tag', tag);
    git(dir, 'push', '-q', 'origin', `refs/tags/${tag}`);
  }
  return dir;
}

/**
 * Run deploy-manager.mjs with a fake `stellar` that knows the admin key, logs every other call and fails
 * it, so a run that gets past the preflight stops at its first network command.
 */
function deploy(dir, network, extraArgs = []) {
  const bin = join(dir, 'fake-bin');
  const log = join(dir, 'stellar-calls.log');
  write(
    dir,
    'fake-bin/stellar',
    `#!/bin/sh\nif [ "$1" = keys ] && [ "$2" = address ]; then echo ${ADMIN}; exit 0; fi\necho "$@" >> "${log}"\nexit 1\n`
  );
  chmodSync(join(bin, 'stellar'), 0o755);
  const result = spawnSync(process.execPath, ['scripts/deploy-manager.mjs', `configs/${network}.json`, ...extraArgs], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, WASM_DIR, DEPLOY_IDENTITY: 'test-admin' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return { ...result, stellarCalls: existsSync(log) ? readFileSync(log, 'utf8') : '' };
}

test('testnet and mainnet need the published build; local never does; only testnet may opt out', () => {
  assert.equal(publishedBuildRequired('local', false), false);
  assert.equal(publishedBuildRequired('local', true), false);
  assert.equal(publishedBuildRequired('testnet', false), true);
  assert.equal(publishedBuildRequired('testnet', true), false);
  assert.equal(publishedBuildRequired('mainnet', false), true);
  assert.throws(() => publishedBuildRequired('mainnet', true), /--allow-unpublished is for testnet rehearsals/);
});

test('a testnet deploy refuses a contract whose hash is not the published one, before any network call', () => {
  const dir = checkout({ published: { minter: 'f'.repeat(64) } });
  try {
    const result = deploy(dir, 'testnet');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Refusing to upload release-build\/wasm\/minter\.wasm: its sha256 is [0-9a-f]{64}, but releases\/hashes\.json at release-test publishes f{64} for minter/);
    assert.equal(result.stellarCalls, '', 'no stellar command may run');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('a testnet deploy refuses a commit without a pushed release tag, before any network call', () => {
  const dir = checkout({ tag: null });
  try {
    const result = deploy(dir, 'testnet');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /carries no release tag/);
    assert.equal(result.stellarCalls, '');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('a mainnet deploy refuses an unpublished hash, and refuses --allow-unpublished outright', () => {
  const dir = checkout({ published: { manager: '0'.repeat(64) } });
  try {
    const result = deploy(dir, 'mainnet');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Refusing to upload release-build\/wasm\/manager\.wasm/);
    assert.equal(result.stellarCalls, '');

    const flagged = deploy(dir, 'mainnet', ['--allow-unpublished']);
    assert.notEqual(flagged.status, 0);
    assert.match(flagged.stderr, /--allow-unpublished is for testnet rehearsals/);
    assert.equal(flagged.stellarCalls, '');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('the published build of a pushed release tag goes on to the network', () => {
  const dir = checkout();
  try {
    const result = deploy(dir, 'testnet');
    assert.match(result.stdout, /All 8 contracts are the published build of release-test/);
    // The fake CLI fails the first network command, so the script stops there: it got past the preflight.
    assert.match(result.stellarCalls, /network use testnet/);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('a local deploy and a testnet rehearsal skip the check and say so', () => {
  const dir = checkout({ published: { token: 'e'.repeat(64) }, tag: null });
  try {
    const local = deploy(dir, 'local');
    assert.match(local.stellarCalls, /network use local/);

    const rehearsal = deploy(dir, 'testnet', ['--allow-unpublished']);
    assert.match(rehearsal.stderr, /--allow-unpublished: this rehearsal Manager runs code that is not checked/);
    assert.match(rehearsal.stellarCalls, /network use testnet/);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('an unknown flag is a usage error', () => {
  const dir = checkout();
  try {
    const result = deploy(dir, 'testnet', ['--allow-unpublishd']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Usage: node scripts\/deploy-manager\.mjs <config\.json> \[--force\] \[--allow-unpublished\]/);
    assert.equal(result.stellarCalls, '');
  } finally {
    rmSync(dir, { recursive: true });
  }
});
