#!/usr/bin/env node
/**
 * End-to-end TESTNET rehearsal driver for the hardened contracts.
 *
 * Usage:
 *   node scripts/e2e-testnet.mjs <phase|all> [--state .e2e/state.json] [--keep-going] [--redo]
 *   phases: preflight(0) deploy-manager(1) create-dao(2) setup(3) launch(4) auction(5) governance(6)
 *           marketplace(7) report(8)
 *
 * Resumable: progress (addresses, tx hashes, proposal id, timestamps) lives in the state file; a phase
 * whose result is recorded as done is skipped (use --redo to force it again). Sub-steps inside a phase
 * are guarded by state too (e.g. a proposal that is already proposed is never proposed twice).
 *
 * Identities (local `stellar keys` names; env overrides):
 *   E2E_MANAGER_ADMIN (testnet-admin)  deploys Manager, registers implementations, set_platform_minter
 *   E2E_DAO_OWNER     (testnet-dev)    deployer AND launch admin; founder 1 (3 tokens); proposer/voter
 *   E2E_BIDDER_A      (alice)          founder 2 (2 tokens); first bidder; second voter; primary buyer
 *   E2E_BIDDER_B      (testnet-admin)  second bidder; settles; queues/executes proposals
 * Only public addresses are ever read or printed (`stellar keys address`); secrets are never touched.
 *
 * Safety: hard-refuses any network other than `testnet`. Never run in CI by accident: it spends testnet
 * XLM and takes ~35-45 minutes (300s governance minimums x3 + 300s auction).
 *
 * Test seams (used by the unit/mock runs, harmless on testnet): E2E_POLL_MS (poll interval, default
 * 15000), E2E_ROOT (repo root), E2E_SCRIPTS_DIR (where deploy-*.mjs live).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { run, runQuiet } from './lib.mjs';

export const NETWORK = 'testnet';
export const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';
export const TESTNET_RPC = 'https://soroban-testnet.stellar.org';
export const EXPLORER_TX = 'https://stellar.expert/explorer/testnet/tx/';
export const MIN_BALANCE_STROOPS = 100n * 10_000_000n;
export const PHASES = ['preflight', 'deploy-manager', 'create-dao', 'setup', 'launch', 'auction', 'governance', 'marketplace', 'report'];

// ---------------------------------------------------------------------------------------------
// Keccak-256 (legacy 0x01 padding). Copied from scripts/upgrade-contract.mjs: this is what the
// Governor computes for `keccak256(description)`; node's sha3-256 pads differently and does NOT match.
// ---------------------------------------------------------------------------------------------
const MASK = (1n << 64n) - 1n;
const ROUND_CONSTANTS = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n
];
const ROTATIONS = [
  [0, 36, 3, 41, 18], [1, 44, 10, 45, 2], [62, 6, 43, 15, 61], [28, 55, 25, 21, 56], [27, 20, 39, 8, 14]
];
const rotl = (value, shift) => (((value << BigInt(shift)) | (value >> BigInt(64 - shift))) & MASK);

export function keccak256(input) {
  const rate = 136;
  const data = Buffer.from(input);
  const padded = Buffer.alloc(Math.ceil((data.length + 1) / rate) * rate);
  data.copy(padded);
  padded[data.length] ^= 0x01;
  padded[padded.length - 1] ^= 0x80;
  const state = Array.from({ length: 5 }, () => Array(5).fill(0n));
  for (let offset = 0; offset < padded.length; offset += rate) {
    for (let i = 0; i < rate / 8; i++) state[i % 5][Math.floor(i / 5)] ^= padded.readBigUInt64LE(offset + i * 8);
    for (const constant of ROUND_CONSTANTS) {
      const c = state.map((column) => column.reduce((a, b) => a ^ b));
      for (let x = 0; x < 5; x++) {
        const d = c[(x + 4) % 5] ^ rotl(c[(x + 1) % 5], 1);
        for (let y = 0; y < 5; y++) state[x][y] ^= d;
      }
      const b = Array.from({ length: 5 }, () => Array(5).fill(0n));
      for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) {
        b[y][(2 * x + 3 * y) % 5] = ROTATIONS[x][y] === 0 ? state[x][y] : rotl(state[x][y], ROTATIONS[x][y]);
      }
      for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) {
        state[x][y] = b[x][y] ^ (~b[(x + 1) % 5][y] & MASK & b[(x + 2) % 5][y]);
      }
      state[0][0] ^= constant;
    }
  }
  const out = Buffer.alloc(32);
  for (let i = 0; i < 4; i++) out.writeBigUInt64LE(state[i % 5][Math.floor(i / 5)], i * 8);
  return out.toString('hex');
}

/** Self-test vectors (well-known Keccak-256 values). Throws if the copy is broken. */
export function keccakSelfTest() {
  const vectors = [
    ['', 'c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470'],
    ['abc', '4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45']
  ];
  for (const [input, expected] of vectors) {
    const got = keccak256(Buffer.from(input, 'utf8'));
    if (got !== expected) throw new Error(`keccak256 self-test failed for ${JSON.stringify(input)}: ${got}`);
  }
}

export const descriptionHash = (description) => keccak256(Buffer.from(description, 'utf8'));

// ---------------------------------------------------------------------------------------------
// Argument encoding helpers (isolated + unit tested). Forms mirror scripts/deploy-dao.mjs and the
// governance payload of scripts/upgrade-contract.mjs:
//   Vec<Address>/Vec<Symbol>  -> JSON array of strings
//   Vec<Vec<Val>>             -> JSON array of arrays of ScVal-JSON objects ({u32:n}, {u64:"n"}, {i128:"n"}, {bytes:"hex"})
//   BytesN<32>                -> 64 lowercase hex chars (plain string)
//   u32 plain args            -> decimal; u64/u128/i128 plain args -> decimal string
// ---------------------------------------------------------------------------------------------
const ADDRESS_RE = /^[GC][A-Z2-7]{55}$/;
const SYMBOL_RE = /^[A-Za-z0-9_]{1,32}$/;
const HEX32_RE = /^[0-9a-f]{64}$/;

export const val = {
  u32: (v) => ({ u32: Number(v) }),
  u64: (v) => ({ u64: String(v) }),
  u128: (v) => ({ u128: String(v) }),
  i128: (v) => ({ i128: String(v) }),
  bool: (v) => ({ bool: Boolean(v) }),
  bytes: (hex) => ({ bytes: hex }),
  address: (a) => ({ address: a }),
  symbol: (s) => ({ symbol: s })
};

export function assertAddress(value, label = 'address') {
  if (typeof value !== 'string' || !ADDRESS_RE.test(value)) throw new Error(`${label} is not a valid Stellar address: ${String(value)}`);
  return value;
}

export function encodeAddressVec(addresses) {
  return JSON.stringify(addresses.map((a, i) => assertAddress(a, `addresses[${i}]`)));
}

export function encodeSymbolVec(symbols) {
  return JSON.stringify(symbols.map((s) => {
    if (typeof s !== 'string' || !SYMBOL_RE.test(s)) throw new Error(`invalid Symbol: ${String(s)}`);
    return s;
  }));
}

export function assertBytes32(hex, label = 'BytesN<32>') {
  if (typeof hex !== 'string' || !HEX32_RE.test(hex)) throw new Error(`${label} must be 64 lowercase hex chars: ${String(hex)}`);
  return hex;
}

/** actions: [{ target, fn, args: [ScValJson, ...] }] -> the three vectors used by propose/queue/execute. */
export function encodeActions(actions) {
  if (!Array.isArray(actions) || actions.length === 0) throw new Error('at least one action is required');
  return {
    targets: encodeAddressVec(actions.map((a) => a.target)),
    functions: encodeSymbolVec(actions.map((a) => a.fn)),
    args: JSON.stringify(actions.map((a) => {
      if (!Array.isArray(a.args)) throw new Error(`action ${a.fn}: args must be an array`);
      return a.args;
    }))
  };
}

/** Flatten a params object into `--name value` argv. Strings pass through verbatim (as deploy-dao.mjs does). */
export function paramArgs(params = {}) {
  return Object.entries(params).flatMap(([name, value]) => [
    `--${name}`,
    typeof value === 'string' ? value : typeof value === 'bigint' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : JSON.stringify(value)
  ]);
}

export function invokeArgv({ id, source, send, method, params }) {
  return [
    'contract', 'invoke', '--id', id, '--source-account', source, '--network', NETWORK,
    ...(send === 'no' ? ['--send', 'no'] : []),
    '--', method, ...paramArgs(params)
  ];
}

export function parseCliValue(output) {
  const text = String(output ?? '').replace(/\x1b\[[0-9;]*m/g, '').trim();
  if (!text) return undefined;
  try { return JSON.parse(text); } catch { /* fall through */ }
  const last = text.split('\n').pop().trim();
  try { return JSON.parse(last); } catch { return text; }
}

const STATES = ['Pending', 'Active', 'Defeated', 'Canceled', 'Succeeded', 'Queued', 'Expired', 'Executed'];
export function normalizeState(value) {
  if (typeof value === 'number') return STATES[value];
  if (typeof value === 'string' && /^\d+$/.test(value)) return STATES[Number(value)];
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return normalizeState(value[0]);
  if (value && typeof value === 'object') return Object.keys(value)[0];
  return undefined;
}

export function errorCode(text) {
  const match = String(text ?? '').match(/Error\(Contract,\s*#(\d+)\)/);
  return match ? Number(match[1]) : null;
}

export function txHashFrom(text) {
  return String(text ?? '').match(/Signing transaction:\s*([a-f0-9]{64})/i)?.[1] ?? null;
}

export const redact = (text) => String(text ?? '').replace(/\bS[A-Z2-7]{55}\b/g, '<redacted-secret>');

const big = (v) => BigInt(typeof v === 'object' && v !== null ? JSON.stringify(v) : v);

// ---------------------------------------------------------------------------------------------
// Context, state, assertions
// ---------------------------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pollMs = () => Number(process.env.E2E_POLL_MS || 15000);
const nowS = () => Math.floor(Date.now() / 1000);

function refuseWrongNetwork(templateNetworkConfig) {
  const bad = [];
  for (const key of ['E2E_NETWORK', 'STELLAR_NETWORK']) {
    if (process.env[key] && process.env[key] !== NETWORK) bad.push(`${key}=${process.env[key]}`);
  }
  if (process.env.STELLAR_NETWORK_PASSPHRASE && process.env.STELLAR_NETWORK_PASSPHRASE !== TESTNET_PASSPHRASE) bad.push('STELLAR_NETWORK_PASSPHRASE');
  if (process.env.STELLAR_RPC_URL && !/testnet/i.test(process.env.STELLAR_RPC_URL)) bad.push(`STELLAR_RPC_URL=${process.env.STELLAR_RPC_URL}`);
  if (templateNetworkConfig && templateNetworkConfig.network !== NETWORK) bad.push(`network config says ${templateNetworkConfig.network}`);
  if (bad.length) throw new Error(`REFUSING to run: this rehearsal only runs against "${NETWORK}" (${bad.join(', ')})`);
}

export function createContext({ root, statePath, keepGoing = false, redo = false }) {
  const scriptsDir = process.env.E2E_SCRIPTS_DIR || join(root, 'scripts');
  const ctx = {
    root, scriptsDir, statePath, keepGoing, redo,
    startedAt: Date.now(),
    results: [],
    state: null
  };
  ctx.load = () => {
    ctx.state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : null;
    if (!ctx.state) {
      const nonce = nowS();
      ctx.state = { runId: String(nonce), nonce, label: `e2e-${nonce}`, network: NETWORK, createdAt: new Date().toISOString(), phases: {}, txs: {}, results: {} };
    }
    if (ctx.state.network !== NETWORK) throw new Error(`State file network is ${ctx.state.network}; refusing`);
    return ctx.state;
  };
  ctx.save = () => {
    mkdirSync(dirname(statePath), { recursive: true });
    const tmp = `${statePath}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(ctx.state, replacer, 2)}\n`);
    renameSync(tmp, statePath);
  };
  ctx.tx = (name, hash) => { if (hash) { ctx.state.txs[name] = hash; ctx.save(); } };
  ctx.phaseName = '';
  ctx.check = (name, ok, detail = '') => {
    const status = ok ? 'PASS' : 'FAIL';
    const entry = { phase: ctx.phaseName, name, status, detail: String(detail) };
    ctx.results.push(entry);
    console.log(`[${status}] ${ctx.phaseName}: ${name}${detail ? ` -- ${detail}` : ''}`);
    return ok;
  };
  ctx.skip = (name, reason) => {
    ctx.results.push({ phase: ctx.phaseName, name, status: 'SKIP', detail: reason });
    console.log(`[SKIP] ${ctx.phaseName}: ${name} -- ${reason}`);
  };
  ctx.id = (role) => {
    const addr = ctx.state.identities?.[role]?.address;
    if (!addr) throw new Error(`identity ${role} not resolved (run preflight)`);
    return addr;
  };
  ctx.name = (role) => ctx.state.identities[role].name;
  return ctx;
}

const replacer = (_k, v) => (typeof v === 'bigint' ? v.toString() : v);

// ---------------------------------------------------------------------------------------------
// Chain access (all through the `stellar` CLI)
// ---------------------------------------------------------------------------------------------
function cli(args, opts = {}) {
  return runQuiet('stellar', args, { env: { ...process.env, STELLAR_NO_CACHE: 'true' }, timeout: opts.timeout ?? 180_000 });
}

/** Read-only call (simulation, nothing submitted). Throws on failure. */
function view(ctx, id, method, params, role = 'MANAGER_ADMIN') {
  const result = cli(invokeArgv({ id, source: ctx.name(role), send: 'no', method, params }));
  if (!result.ok) throw new Error(`view ${method} failed: ${redact(result.stderr || result.stdout).slice(0, 600)}`);
  return parseCliValue(result.stdout);
}

/** Simulation expected to fail. Returns { code, text, unexpectedSuccess }. Never submits a transaction. */
function expectFailure(ctx, id, method, params, role = 'MANAGER_ADMIN') {
  const result = cli(invokeArgv({ id, source: ctx.name(role), send: 'no', method, params }));
  const text = redact(`${result.stderr}\n${result.stdout}`);
  return { unexpectedSuccess: result.ok, code: errorCode(text), text };
}

/** Real transaction. Throws on failure; returns { value, txHash }. */
function write(ctx, id, method, params, role, txName) {
  const result = cli(invokeArgv({ id, source: ctx.name(role), method, params }));
  const text = `${result.stderr}\n${result.stdout}`;
  if (!result.ok) throw new Error(`${method} (${role}) failed: ${redact(text).slice(0, 800)}`);
  const txHash = txHashFrom(text);
  if (txName) ctx.tx(txName, txHash);
  return { value: parseCliValue(result.stdout), txHash };
}

function runScript(ctx, scriptName, args, role) {
  const env = { ...process.env, DEPLOY_IDENTITY: ctx.name(role), STELLAR_NO_CACHE: 'true' };
  console.log(`$ DEPLOY_IDENTITY=${ctx.name(role)} node scripts/${scriptName} ${args.join(' ')}`);
  run('node', [join(ctx.scriptsDir, scriptName), ...args], { env, cwd: ctx.root });
}

async function waitFor(label, fn, { timeoutS, every = pollMs() }) {
  const started = Date.now();
  for (let n = 0; ; n++) {
    const outcome = await fn();
    const elapsed = Math.round((Date.now() - started) / 1000);
    if (outcome.done) { console.log(`  ... ${label}: done after ${elapsed}s (${outcome.note ?? ''})`); return outcome; }
    console.log(`  ... ${label}: waiting (${elapsed}s/${timeoutS}s) ${outcome.note ?? ''}`);
    if (elapsed >= timeoutS) throw new Error(`timed out waiting for ${label}`);
    await sleep(every);
  }
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const stroops = (v) => big(v);

// ---------------------------------------------------------------------------------------------
// Config preparation
// ---------------------------------------------------------------------------------------------
function resolveIdentities(ctx) {
  const wanted = {
    MANAGER_ADMIN: process.env.E2E_MANAGER_ADMIN || 'testnet-admin',
    DAO_OWNER: process.env.E2E_DAO_OWNER || 'testnet-dev',
    BIDDER_A: process.env.E2E_BIDDER_A || 'alice',
    BIDDER_B: process.env.E2E_BIDDER_B || 'testnet-admin'
  };
  ctx.state.identities = ctx.state.identities ?? {};
  for (const [role, name] of Object.entries(wanted)) {
    const result = cli(['keys', 'address', name], { timeout: 30_000 });
    const address = result.stdout.trim();
    const ok = result.ok && ADDRESS_RE.test(address);
    ctx.check(`identity ${role}=${name} resolves to a public address`, ok, ok ? address : redact(result.stderr).slice(0, 200));
    if (ok) ctx.state.identities[role] = { name, address };
  }
  ctx.save();
}

function nativeSac(ctx) {
  if (ctx.state.nativeSac) return ctx.state.nativeSac;
  const result = cli(['contract', 'id', 'asset', '--asset', 'native', '--network', NETWORK], { timeout: 30_000 });
  const id = result.stdout.trim();
  if (!result.ok || !/^C[A-Z2-7]{55}$/.test(id)) throw new Error(`could not resolve native SAC: ${redact(result.stderr)}`);
  ctx.state.nativeSac = id;
  ctx.save();
  return id;
}

function prepareConfigs(ctx) {
  const s = ctx.state;
  const template = readJson(join(ctx.root, 'configs/e2e-testnet-dao.json'));
  const sac = nativeSac(ctx);
  const owner = ctx.id('DAO_OWNER');
  const config = {
    ...template,
    deployer: owner,
    launchAdmin: owner,
    nonce: s.nonce,
    founders: [{ address: owner, amount: 3 }, { address: ctx.id('BIDDER_A'), amount: 2 }],
    auction: { ...template.auction, paymentAsset: sac },
    marketplace: { ...template.marketplace, paymentAsset: sac },
    launch: { launchAuction: true, launchMarketplace: true, enableMinter: true }
  };
  delete config.$comment;
  const e2eDir = join(ctx.root, '.e2e');
  mkdirSync(e2eDir, { recursive: true });
  s.daoConfigPath = join('.e2e', `dao-${s.nonce}.json`);
  writeFileSync(join(ctx.root, s.daoConfigPath), `${JSON.stringify(config, null, 2)}\n`);
  const managerTemplate = readJson(join(ctx.root, 'configs/testnet-manager.json'));
  refuseWrongNetwork(managerTemplate);
  s.networkConfigPath = join('.e2e', `network-${s.nonce}.json`);
  writeFileSync(join(ctx.root, s.networkConfigPath), `${JSON.stringify({
    ...managerTemplate, network: NETWORK, label: s.label, adminAddress: ctx.id('MANAGER_ADMIN'),
    rpcUrl: TESTNET_RPC, networkPassphrase: TESTNET_PASSPHRASE
  }, null, 2)}\n`);
  s.config = config;
  ctx.save();
  return config;
}

// ---------------------------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------------------------
const nativeBalance = (ctx, who, asset) => big(view(ctx, asset ?? ctx.state.nativeSac, 'balance', { id: who }));

async function preflight(ctx) {
  const version = cli(['--version'], { timeout: 30_000 });
  if (!ctx.check('stellar CLI present', version.ok, version.stdout.split('\n')[0])) return;
  keccakSelfTest();
  ctx.check('keccak256 self-test vectors', true);

  const nets = cli(['network', 'ls', '--long'], { timeout: 30_000 });
  ctx.check('`testnet` network alias uses the testnet passphrase', nets.ok && (nets.stdout + nets.stderr).includes(TESTNET_PASSPHRASE),
    nets.ok ? '' : redact(nets.stderr).slice(0, 200));

  resolveIdentities(ctx);
  if (!Object.keys(ctx.state.identities ?? {}).length || Object.keys(ctx.state.identities).length < 4) return;
  const config = prepareConfigs(ctx);
  ctx.check('native XLM SAC resolved offline', true, ctx.state.nativeSac);

  for (const role of ['MANAGER_ADMIN', 'DAO_OWNER', 'BIDDER_A', 'BIDDER_B']) {
    try {
      const balance = nativeBalance(ctx, ctx.id(role));
      ctx.check(`${role} balance > 100 XLM`, balance > MIN_BALANCE_STROOPS, `${Number(balance) / 1e7} XLM`);
    } catch (e) {
      ctx.check(`${role} balance readable (fund the key with friendbot)`, false, e.message);
    }
  }

  const wasms = ['manager', 'token', 'metadata', 'auction', 'governor', 'treasury', 'marketplace', 'minter'];
  const missing = wasms.filter((n) => !existsSync(join(ctx.root, `target/wasm32v1-none/release/${n}.wasm`)));
  ctx.check('contract WASMs built', missing.length === 0, missing.length ? `missing: ${missing.join(', ')} (run: stellar contract build)` : '');
  ctx.check('releases/contracts.json present', existsSync(join(ctx.root, 'releases/contracts.json')));

  try {
    run('node', [join(ctx.scriptsDir, 'deploy-dao.mjs'), '--validate-only', ctx.state.daoConfigPath], { cwd: ctx.root, stdio: 'pipe' });
    ctx.check('deploy-dao.mjs --validate-only on generated e2e config', true, ctx.state.daoConfigPath);
  } catch (e) {
    ctx.check('deploy-dao.mjs --validate-only on generated e2e config', false, redact(e.stderr || e.message).slice(0, 400));
  }
  ctx.state.founderSupply = config.founders.reduce((n, f) => n + f.amount, 0);
  ctx.save();
}

const managerArtifactPath = (ctx) => join(ctx.root, 'deploys', `${ctx.state.label}-${NETWORK}-manager.json`);
const daoArtifactPath = (ctx) => join(ctx.root, 'deploys', `${ctx.state.label}-${NETWORK}-dao-${ctx.state.nonce}.json`);

function artifactTxs(artifact) {
  const out = {};
  for (const [key, value] of Object.entries(artifact?.transactions ?? {})) {
    (Array.isArray(value) ? value : [value]).forEach((tx, i) => { if (tx?.txHash) out[Array.isArray(value) ? `${key}[${i}]` : key] = tx.txHash; });
  }
  return out;
}

async function deployManager(ctx) {
  const s = ctx.state;
  runScript(ctx, 'deploy-manager.mjs', [s.networkConfigPath], 'MANAGER_ADMIN');
  const artifact = readJson(managerArtifactPath(ctx));
  s.manager = artifact.manager;
  s.minter = artifact.minter;
  s.implementations = artifact.implementations;
  for (const [k, h] of Object.entries(artifactTxs(artifact))) ctx.tx(`manager.${k}`, h);
  ctx.save();

  ctx.check('manager address recorded', ADDRESS_RE.test(s.manager ?? ''), s.manager);
  const platformMinter = view(ctx, s.manager, 'get_platform_minter');
  ctx.check('manager.get_platform_minter is set (== shared minter)', platformMinter === s.minter && !!platformMinter, String(platformMinter));
  const admin = view(ctx, s.manager, 'get_admin');
  ctx.check('manager.get_admin == MANAGER_ADMIN', admin === ctx.id('MANAGER_ADMIN'), String(admin));
  for (const name of ['manager', 'token', 'metadata', 'auction', 'governor', 'treasury', 'marketplace', 'minter']) {
    const impl = view(ctx, s.manager, 'get_implementation', { wasm_hash: assertBytes32(s.implementations?.[name], `implementations.${name}`) });
    ctx.check(`implementation ${name} registered`, impl !== null && impl !== undefined);
  }
  ctx.skip('set_current_implementations read-back', 'no Manager view returns the current-implementation set; it is proven indirectly by create_dao succeeding in the next phase');
}

function loadDao(ctx) {
  const artifact = readJson(daoArtifactPath(ctx));
  ctx.state.dao = artifact.addresses;
  for (const [k, h] of Object.entries(artifactTxs(artifact))) ctx.tx(`dao.${k}`, h);
  ctx.save();
  return artifact.addresses;
}

async function createDao(ctx) {
  const s = ctx.state;
  runScript(ctx, 'deploy-dao.mjs', ['create_dao', s.daoConfigPath, s.networkConfigPath], 'DAO_OWNER');
  const dao = loadDao(ctx);
  const modules = ['token', 'treasury', 'governor', 'metadata', 'auction', 'marketplace'];
  ctx.check('all six module addresses recorded', modules.every((m) => ADDRESS_RE.test(dao?.[m] ?? '')), modules.map((m) => `${m}=${dao?.[m]}`).join(' '));

  const pending = view(ctx, s.manager, 'get_pending_dao', { token_address: dao.token });
  ctx.check('manager.get_pending_dao exists', !!pending, pending ? '' : 'null');
  if (pending) {
    ctx.check('pending.launch_admin == DAO_OWNER', pending.launch_admin === ctx.id('DAO_OWNER'));
    ctx.check('pending payment assets == native SAC', pending.auction_payment_asset === s.nativeSac && pending.marketplace_payment_asset === s.nativeSac);
  }
  ctx.check('token.is_live == false', view(ctx, dao.token, 'is_live') === false);

  // Pre-launch guards: each simulation must fail with CommonError::NotLive (9001). Nothing is submitted.
  const owner = ctx.id('DAO_OWNER');
  const proposeActions = encodeActions([{ target: dao.governor, fn: 'set_quorum_bps', args: [val.u32(2000)] }]);
  const guards = [
    ['token.set_mint_authority (launch admin)', dao.token, 'set_mint_authority', { authority: owner, enabled: 'true' }, 'DAO_OWNER'],
    ['auction.unpause', dao.auction, 'unpause', { caller: owner }, 'DAO_OWNER'],
    ['marketplace.create_primary_listing', dao.marketplace, 'create_primary_listing', { price: '10000000', expires_at: String(nowS() + 3600) }, 'DAO_OWNER'],
    ['governor.propose', dao.governor, 'propose', { ...proposeActions, description: 'e2e pre-launch guard', proposer: owner }, 'DAO_OWNER']
  ];
  for (const [label, id, method, params, role] of guards) {
    const r = expectFailure(ctx, id, method, params, role);
    ctx.check(`pre-launch guard: ${label} fails with NotLive (9001)`, r.code === 9001 && !r.unexpectedSuccess,
      r.unexpectedSuccess ? 'simulation unexpectedly succeeded' : `error code ${r.code}${r.code === 9001 ? '' : `: ${r.text.slice(0, 300)}`}`);
  }
}

async function setup(ctx) {
  const s = ctx.state;
  runScript(ctx, 'deploy-dao.mjs', ['admin_checklist', s.daoConfigPath, s.networkConfigPath], 'DAO_OWNER');
  const dao = loadDao(ctx);
  const founderSupply = BigInt(s.config.founders.reduce((n, f) => n + f.amount, 0));
  ctx.check(`token.total_supply == ${founderSupply}`, big(view(ctx, dao.token, 'total_supply')) === founderSupply);
  for (const f of s.config.founders) {
    const bal = big(view(ctx, dao.token, 'balance', { account: f.address }));
    ctx.check(`founder ${f.address.slice(0, 6)}.. balance == ${f.amount}`, bal === BigInt(f.amount), String(bal));
  }
  ctx.check('token still not live after setup', view(ctx, dao.token, 'is_live') === false);
  const props = Number(view(ctx, dao.metadata, 'properties_count'));
  ctx.check('metadata artwork: properties_count == configured', props === s.config.metadata.artwork.properties.length, String(props));
  ctx.skip('payment-asset change before launch makes launch fail', 'intentionally not tested (would brick this DAO)');
}

async function launch(ctx) {
  const s = ctx.state;
  const dao = s.dao;
  runScript(ctx, 'deploy-dao.mjs', ['launch_dao', s.daoConfigPath, s.networkConfigPath], 'DAO_OWNER');
  loadDao(ctx);
  ctx.check('token.is_live == true', view(ctx, dao.token, 'is_live') === true);
  ctx.check('token.owner == treasury', view(ctx, dao.token, 'owner') === dao.treasury);
  const holders = [
    ['treasury', dao.treasury, true], ['marketplace', dao.marketplace, true], ['auction', dao.auction, true],
    ['platform minter', s.minter, true], ['DAO_OWNER (launch admin)', ctx.id('DAO_OWNER'), false]
  ];
  for (const [label, addr, expected] of holders) {
    ctx.check(`token.mint_authority(${label}) == ${expected}`, view(ctx, dao.token, 'mint_authority', { authority: addr }) === expected);
  }
  ctx.check('manager.get_pending_dao is gone', view(ctx, s.manager, 'get_pending_dao', { token_address: dao.token }) === null);
  ctx.check('governor.get_owner == treasury', view(ctx, dao.governor, 'get_owner') === dao.treasury);
  ctx.check('auction.get_owner == treasury', view(ctx, dao.auction, 'get_owner') === dao.treasury);
  ctx.check('treasury.governor == governor', view(ctx, dao.treasury, 'governor') === dao.governor);
  ctx.check('governor.treasury == treasury', view(ctx, dao.governor, 'treasury') === dao.treasury);
  ctx.check('auction not paused (started at launch)', view(ctx, dao.auction, 'paused') === false);
  const mkt = view(ctx, dao.marketplace, 'get_config');
  ctx.check('marketplace open (config.paused == false, treasury set)', mkt?.paused === false && mkt?.treasury === dao.treasury);
  const auction = view(ctx, dao.auction, 'get_auction');
  ctx.check('auction.get_auction active (not settled, end_time in the future)',
    auction && auction.settled === false && Number(auction.end_time) > nowS(), `token_id=${auction?.token_id} end_time=${auction?.end_time}`);
  ctx.skip('second Manager.launch attempt', 'launch is Manager-only and the Manager has no entrypoint to re-launch; not directly callable');
}

async function auction(ctx) {
  const s = ctx.state;
  const dao = s.dao;
  const A = ctx.id('BIDDER_A');
  const B = ctx.id('BIDDER_B');
  s.auction = s.auction ?? {};
  const a = s.auction;
  const cfg = view(ctx, dao.auction, 'get_config');
  const reserve = big(cfg.reserve_price);
  const pct = BigInt(cfg.min_bid_increment_percent);
  const auctionAsset = cfg.payment_token;

  if (!a.bidA) {
    const state = view(ctx, dao.auction, 'get_auction');
    a.tokenId = String(state.token_id);
    const bid = reserve;
    a.balanceABeforeBid = String(nativeBalance(ctx, A, auctionAsset));
    const r = write(ctx, dao.auction, 'create_bid', { bidder: A, token_id: a.tokenId, amount: String(bid) }, 'BIDDER_A', 'auction.bidA');
    a.bidA = { amount: String(bid), tx: r.txHash };
    a.balanceAAfterBid = String(nativeBalance(ctx, A, auctionAsset));
    ctx.save();
  }
  ctx.check('BIDDER_A bid at reserve accepted', true, `token ${a.tokenId} amount ${a.bidA.amount}`);
  ctx.check('BIDDER_A payment-asset balance dropped by the bid (fees tolerated)',
    big(a.balanceABeforeBid) - big(a.balanceAAfterBid) >= big(a.bidA.amount) && big(a.balanceABeforeBid) - big(a.balanceAAfterBid) < big(a.bidA.amount) + 1_000_000_000n);

  if (!a.bidB) {
    const prev = big(a.bidA.amount);
    const amount = prev + (prev * pct) / 100n;
    const r = write(ctx, dao.auction, 'create_bid', { bidder: B, token_id: a.tokenId, amount: String(amount) }, 'BIDDER_B', 'auction.bidB');
    a.bidB = { amount: String(amount), tx: r.txHash };
    a.balanceAAfterOutbid = String(nativeBalance(ctx, A, auctionAsset));
    ctx.save();
  }
  ctx.check('BIDDER_B outbid by >= min increment', big(a.bidB.amount) >= big(a.bidA.amount) + (big(a.bidA.amount) * pct) / 100n, `${a.bidB.amount} vs ${a.bidA.amount} (+${pct}%)`);
  // A signs nothing between the two balance reads, so the refund must be exact (no fee noise).
  ctx.check('BIDDER_A refunded exactly on outbid', big(a.balanceAAfterOutbid) - big(a.balanceAAfterBid) === big(a.bidA.amount),
    `delta ${big(a.balanceAAfterOutbid) - big(a.balanceAAfterBid)}`);
  ctx.check('auction.pending_refund(BIDDER_A) == 0', big(view(ctx, dao.auction, 'pending_refund', { bidder: A })) === 0n);
  ctx.skip('deferred refund / withdraw_refund path', 'needs a recipient whose token transfer fails (e.g. a frozen trustline); native XLM transfers to any account cannot be made to fail');

  if (!a.settleTx) {
    const live = view(ctx, dao.auction, 'get_auction');
    a.endTime = Number(live.end_time);
    ctx.save();
    a.treasuryBefore = String(nativeBalance(ctx, dao.treasury, auctionAsset));
    ctx.save();
    console.log(`  auction ends at ${new Date(a.endTime * 1000).toISOString()}`);
    await waitFor('auction end_time', async () => {
      const left = a.endTime + 3 - nowS();
      if (left > 0) return { done: false, note: `${left}s until end_time` };
      const sim = cli(invokeArgv({ id: dao.auction, source: ctx.name('BIDDER_B'), send: 'no', method: 'settle_and_create_new' }));
      return sim.ok ? { done: true, note: 'settle simulation ok' } : { done: false, note: `settle not yet possible (${errorCode(sim.stderr) ?? '?'})` };
    }, { timeoutS: 900 });
    const r = write(ctx, dao.auction, 'settle_and_create_new', {}, 'BIDDER_B', 'auction.settle');
    a.settleTx = r.txHash;
    a.winningBid = String(big(live.highest_bid));
    a.winner = live.highest_bidder;
    ctx.save();
  }
  ctx.check('settle_and_create_new succeeded (called by BIDDER_B)', !!a.settleTx);
  ctx.check(`winner (${String(a.winner).slice(0, 6)}..) is BIDDER_B`, a.winner === B);
  ctx.check('winner owns the auctioned NFT (token.owner_of)', view(ctx, dao.token, 'owner_of', { token_id: a.tokenId }) === a.winner);
  const treasuryAfter = nativeBalance(ctx, dao.treasury, auctionAsset);
  ctx.check('treasury received the winning bid exactly', treasuryAfter - big(a.treasuryBefore) === big(a.winningBid), `delta ${treasuryAfter - big(a.treasuryBefore)} vs ${a.winningBid}`);
  const next = view(ctx, dao.auction, 'get_auction');
  ctx.check('a new auction was created (next token id, unsettled, end in the future)',
    big(next.token_id) === big(a.tokenId) + 1n && next.settled === false && Number(next.end_time) > nowS(), `token_id=${next.token_id}`);
}

function governanceActions(ctx) {
  const g = ctx.state.gov;
  return [
    { target: ctx.state.dao.governor, fn: 'set_quorum_bps', args: [val.u32(g.newQuorumBps)] },
    { target: ctx.state.dao.marketplace, fn: 'create_primary_listing', args: [val.i128(g.listingPrice), val.u64(g.listingExpiresAt)] }
  ];
}

async function governance(ctx) {
  const s = ctx.state;
  const dao = s.dao;
  const owner = ctx.id('DAO_OWNER');
  const A = ctx.id('BIDDER_A');
  const B = ctx.id('BIDDER_B');
  const gov = view(ctx, dao.governor, 'quorum_bps');
  if (!s.gov) {
    const now = nowS();
    s.gov = {
      newQuorumBps: Number(gov) === 2000 ? 2500 : 2000,
      listingPrice: '10000000',
      listingExpiresAt: now + 3 * 3600,
      description: `E2E rehearsal ${s.runId}: set quorum + create primary listing`,
      steps: {}
    };
    s.gov.descriptionHash = descriptionHash(s.gov.description);
    ctx.save();
  }
  const g = s.gov;
  const enc = encodeActions(governanceActions(ctx));
  const statePoll = (id) => normalizeState(view(ctx, dao.governor, 'proposal_state', { proposal_id: id }));

  // Cheap parse check of the nested Vec<Vec<Val>> encoding before spending a transaction.
  const predicted = view(ctx, dao.governor, 'get_proposal_id', { ...enc, description_hash: g.descriptionHash });
  ctx.check('governor.get_proposal_id accepts the multi-action encoding', typeof predicted === 'string' && HEX32_RE.test(predicted), String(predicted));

  if (!g.steps.propose) {
    const r = write(ctx, dao.governor, 'propose', { ...enc, description: g.description, proposer: owner }, 'DAO_OWNER', 'gov.propose');
    g.proposalId = typeof r.value === 'string' ? r.value : predicted;
    g.steps.propose = { tx: r.txHash, at: nowS() };
    ctx.save();
  }
  ctx.check('propose (2 actions) by DAO_OWNER; id matches get_proposal_id', g.proposalId === predicted, g.proposalId);
  const id = g.proposalId;
  ctx.check('proposal initially Pending/Active', ['Pending', 'Active'].includes(statePoll(id)), String(statePoll(id)));

  const delay = Number(view(ctx, dao.governor, 'voting_delay'));
  const period = Number(view(ctx, dao.governor, 'voting_period'));
  const queueDelay = s.config.governance.queueDelay;
  await waitFor('voting delay (proposal -> Active)', async () => {
    const st = statePoll(id);
    return { done: st === 'Active', note: `state=${st} (voting_delay ${delay}s)` };
  }, { timeoutS: delay + 900 });

  for (const [role, who] of [['DAO_OWNER', owner], ['BIDDER_A', A]]) {
    const key = `vote_${role}`;
    if (!g.steps[key]) {
      const r = write(ctx, dao.governor, 'cast_vote', { proposal_id: id, vote_type: '1', reason: '', voter: who }, role, `gov.${key}`);
      g.steps[key] = { tx: r.txHash, weight: String(r.value) };
      ctx.save();
    }
    ctx.check(`${role} voted for`, view(ctx, dao.governor, 'has_voted', { proposal_id: id, account: who }) === true, `weight ${g.steps[key].weight}`);
  }

  await waitFor('voting period (Active -> Succeeded)', async () => {
    const st = statePoll(id);
    if (st === 'Defeated') throw new Error('proposal Defeated (quorum/votes insufficient)');
    return { done: st === 'Succeeded', note: `state=${st} (voting_period ${period}s)` };
  }, { timeoutS: period + 900 });
  ctx.check('proposal Succeeded', statePoll(id) === 'Succeeded');

  if (!g.steps.queue) {
    const r = write(ctx, dao.governor, 'queue', { ...enc, description_hash: g.descriptionHash, eta: '0', operator: B }, 'BIDDER_B', 'gov.queue');
    g.steps.queue = { tx: r.txHash, at: nowS() };
    ctx.save();
  }
  ctx.check('proposal Queued after queue()', statePoll(id) === 'Queued', String(statePoll(id)));

  if (!g.steps.execute) {
    g.nextListingBefore = String(big(view(ctx, dao.marketplace, 'next_listing_id')));
    ctx.save();
    // The Governor sets eta = ledger time at queue + queue_delay and exposes no eta view, so poll a
    // read-only simulation of the real call: it succeeds exactly when the proposal is executable.
    await waitFor(`queue delay (${queueDelay}s) until treasury.execute simulates OK`, async () => {
      const sim = cli(invokeArgv({ id: dao.treasury, source: ctx.name('BIDDER_B'), send: 'no', method: 'execute', params: { ...enc, description_hash: g.descriptionHash } }));
      return sim.ok ? { done: true, note: 'simulation ok' } : { done: false, note: `not executable yet (code ${errorCode(sim.stderr) ?? '?'})` };
    }, { timeoutS: queueDelay + 900 });

    // Governor.execute must always fail (checked before the real execute so the proposal is still Queued).
    const viaGov = expectFailure(ctx, dao.governor, 'execute', { ...enc, description_hash: g.descriptionHash, executor: B }, 'BIDDER_B');
    ctx.check('governor.execute fails with UseTreasuryExecute (1508)', viaGov.code === 1508 && !viaGov.unexpectedSuccess, `code ${viaGov.code}`);

    const r = write(ctx, dao.treasury, 'execute', { ...enc, description_hash: g.descriptionHash }, 'BIDDER_B', 'gov.execute');
    g.steps.execute = { tx: r.txHash, at: nowS(), returnedId: r.value };
    ctx.save();
  }
  ctx.check('treasury.execute (by BIDDER_B) returned the proposal id', g.steps.execute.returnedId === id || g.steps.execute.returnedId === undefined, String(g.steps.execute.returnedId));
  ctx.check('proposal_state == Executed', statePoll(id) === 'Executed', String(statePoll(id)));
  ctx.check(`governor.quorum_bps == ${g.newQuorumBps}`, Number(view(ctx, dao.governor, 'quorum_bps')) === g.newQuorumBps);
  const nextAfter = big(view(ctx, dao.marketplace, 'next_listing_id'));
  ctx.check('marketplace.next_listing_id advanced by 1', nextAfter === big(g.nextListingBefore) + 1n, `${g.nextListingBefore} -> ${nextAfter}`);
  const listing = view(ctx, dao.marketplace, 'get_primary_listing', { listing_id: g.nextListingBefore });
  ctx.check(`marketplace.get_primary_listing(${g.nextListingBefore}) exists with the proposed price`, !!listing && big(listing.price) === big(g.listingPrice), JSON.stringify(listing));
  g.listingId = g.nextListingBefore;
  ctx.save();
  const again = expectFailure(ctx, dao.treasury, 'execute', { ...enc, description_hash: g.descriptionHash }, 'BIDDER_B');
  ctx.check('second treasury.execute fails (ProposalAlreadyExecuted 5006)', !again.unexpectedSuccess && (again.code === 5006 || /AlreadyExecuted/.test(again.text)), `code ${again.code}`);
}

async function marketplace(ctx) {
  const s = ctx.state;
  const dao = s.dao;
  const A = ctx.id('BIDDER_A');
  const listingId = s.gov?.listingId;
  if (listingId === undefined) throw new Error('no primary listing recorded: run the governance phase first');
  const m = (s.market = s.market ?? {});
  const listing = view(ctx, dao.marketplace, 'get_primary_listing', { listing_id: listingId });
  if (!m.buyTx) {
    if (!listing) throw new Error(`primary listing ${listingId} is gone but no purchase is recorded`);
    m.asset = listing.payment_asset;
    m.price = String(big(listing.price));
    m.balanceBefore = String(big(view(ctx, dao.token, 'balance', { account: A })));
    m.supplyBefore = String(big(view(ctx, dao.token, 'total_supply')));
    m.buyerFundsBefore = String(nativeBalance(ctx, A, m.asset));
    m.treasuryBefore = String(nativeBalance(ctx, dao.treasury, m.asset));
    ctx.save();
    const r = write(ctx, dao.marketplace, 'buy_primary', { listing_id: String(listingId), buyer: A }, 'BIDDER_A', 'market.buy');
    m.buyTx = r.txHash;
    m.tokenId = r.value === undefined ? null : String(r.value);
    ctx.save();
  }
  ctx.check('buy_primary succeeded (BIDDER_A)', !!m.buyTx, `token_id=${m.tokenId}`);
  ctx.check('BIDDER_A token balance +1', big(view(ctx, dao.token, 'balance', { account: A })) === big(m.balanceBefore) + 1n);
  ctx.check('token total_supply +1', big(view(ctx, dao.token, 'total_supply')) === big(m.supplyBefore) + 1n);
  if (m.tokenId !== null) ctx.check('minted token owned by BIDDER_A', view(ctx, dao.token, 'owner_of', { token_id: m.tokenId }) === A);
  ctx.check('treasury received the listing price exactly', nativeBalance(ctx, dao.treasury, m.asset) - big(m.treasuryBefore) === big(m.price), `price ${m.price}`);
  ctx.check(`primary listing ${listingId} is gone`, view(ctx, dao.marketplace, 'get_primary_listing', { listing_id: String(listingId) }) === null);
}

async function report(ctx) {
  const s = ctx.state;
  const all = Object.values(s.results).flat();
  console.log('\n=== Assertions ===');
  for (const r of all) console.log(`${r.status.padEnd(4)}  ${r.phase.padEnd(15)} ${r.name}${r.detail ? `  [${r.detail.slice(0, 120)}]` : ''}`);
  console.log('\n=== Transactions ===');
  for (const [name, hash] of Object.entries(s.txs)) console.log(`${name.padEnd(30)} ${EXPLORER_TX}${hash}`);
  const elapsedS = Math.round((Date.now() - Date.parse(s.createdAt)) / 1000);
  const counts = { PASS: 0, FAIL: 0, SKIP: 0 };
  for (const r of all) counts[r.status] += 1;
  const summary = {
    runId: s.runId, network: NETWORK, counts, elapsedSinceStateCreatedSeconds: elapsedS,
    manager: s.manager, minter: s.minter, dao: s.dao, proposalId: s.gov?.proposalId,
    phases: s.phases, txs: Object.fromEntries(Object.entries(s.txs).map(([k, v]) => [k, `${EXPLORER_TX}${v}`])),
    failures: all.filter((r) => r.status === 'FAIL')
  };
  mkdirSync(join(ctx.root, '.e2e'), { recursive: true });
  writeFileSync(join(ctx.root, '.e2e/report.json'), `${JSON.stringify({ ...summary, assertions: all }, replacer, 2)}\n`);
  console.log(`\nreport written to .e2e/report.json (elapsed ${elapsedS}s since the state file was created)`);
}

const PHASE_FNS = { preflight, 'deploy-manager': deployManager, 'create-dao': createDao, setup, launch, auction, governance, marketplace, report };

// ---------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------
function parseArgs(argv) {
  const out = { target: argv[0], statePath: '.e2e/state.json', keepGoing: false, redo: false };
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--state') out.statePath = argv[++i];
    else if (argv[i] === '--keep-going') out.keepGoing = true;
    else if (argv[i] === '--redo') out.redo = true;
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  return out;
}

export function selectPhases(target) {
  if (target === 'all') return PHASES;
  const byIndex = /^\d+$/.test(target ?? '') ? PHASES[Number(target)] : undefined;
  const name = byIndex ?? target;
  if (!PHASES.includes(name)) throw new Error(`Usage: node scripts/e2e-testnet.mjs <${PHASES.join('|')}|all|0..8> [--state path] [--keep-going] [--redo]`);
  return [name];
}

export async function main(argv) {
  const opts = parseArgs(argv);
  const phases = selectPhases(opts.target);
  const root = resolve(process.env.E2E_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..'));
  refuseWrongNetwork(null);
  const ctx = createContext({ root, statePath: resolve(root, opts.statePath), keepGoing: opts.keepGoing, redo: opts.redo });
  ctx.load();
  let failed = false;
  console.log(`E2E rehearsal on ${NETWORK}; run ${ctx.state.runId}; state ${opts.statePath}`);

  for (const phase of phases) {
    ctx.phaseName = phase;
    const prior = ctx.state.phases[phase];
    if (phase !== 'report' && prior?.status === 'done' && !ctx.redo) {
      console.log(`\n--- ${phase}: already done at ${prior.finishedAt}, skipping (use --redo to force) ---`);
      continue;
    }
    if (phase !== 'preflight' && phase !== 'report' && !ctx.state.identities) { console.log('Run preflight first.'); failed = true; break; }
    console.log(`\n=== Phase ${PHASES.indexOf(phase)}: ${phase} ===`);
    const before = ctx.results.length;
    const started = Date.now();
    try {
      await PHASE_FNS[phase](ctx);
    } catch (error) {
      ctx.check('phase completed without error', false, redact(error instanceof Error ? error.message : String(error)).slice(0, 800));
    }
    const mine = ctx.results.slice(before);
    const bad = mine.filter((r) => r.status === 'FAIL');
    if (phase !== 'report') {
      ctx.state.results[phase] = mine;
      ctx.state.phases[phase] = { status: bad.length ? 'failed' : 'done', finishedAt: new Date().toISOString(), seconds: Math.round((Date.now() - started) / 1000) };
      ctx.save();
    }
    if (bad.length) {
      failed = true;
      if (!opts.keepGoing && phase !== 'report') { console.log(`\nStopping after failed phase ${phase} (use --keep-going to continue).`); break; }
    }
  }

  const all = ctx.results;
  const counts = { PASS: 0, FAIL: 0, SKIP: 0 };
  for (const r of all) counts[r.status] += 1;
  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify({ counts, failed: all.filter((r) => r.status === 'FAIL').map((r) => `${r.phase}: ${r.name}`) }, null, 2));
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (error) => {
    console.error(redact(error instanceof Error ? error.message : String(error)));
    process.exit(2);
  });
}
