import { spawnSync } from 'node:child_process';

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.stdio ?? 'inherit',
    encoding: 'utf8',
    env: options.env ?? process.env,
    cwd: options.cwd ?? process.cwd()
  });

  if (result.status !== 0) {
    const error = new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
    error.stdout = result.stdout;
    error.stderr = result.stderr;
    throw error;
  }

  return result.stdout ?? '';
}

export function runQuiet(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    env: options.env ?? process.env,
    cwd: options.cwd ?? process.cwd(),
    timeout: options.timeout
  });

  return {
    ok: result.status === 0,
    code: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? ''
  };
}

export function fetchTransactionLedger(txHash, networkName) {
  const result = runQuiet(
    'stellar',
    ['tx', 'fetch', 'result', '--hash', txHash, '--network', networkName, '--output', 'json-formatted'],
    { timeout: 15_000 }
  );

  if (!result.ok) {
    throw new Error(`Failed to fetch ledger for transaction ${txHash}: ${result.stderr || result.stdout}`);
  }

  const match = result.stdout.match(/Transaction Ledger:\s*(\d+)/i);
  if (!match) {
    throw new Error(`Could not parse ledger for transaction ${txHash}`);
  }

  return Number.parseInt(match[1], 10);
}

export function enrichTransactionMetadata(metadata, networkName) {
  if (!metadata?.txHash) {
    return metadata ?? null;
  }

  const ledger = metadata.ledger ?? fetchTransactionLedger(metadata.txHash, networkName);
  return { ...metadata, ledger };
}

// ---------------------------------------------------------------------------
// Shared-code TTL policy (docs/STORAGE_DIET.md § 7, D28)
// ---------------------------------------------------------------------------

export const LEDGERS_PER_DAY = 17_280;
/** Contracts bump their own code to this many days (`common::ttl::CODE_TTL_EXTEND_TO`). */
export const CONTRACT_CODE_EXTEND_TO_DAYS = 4;
/** Platform renewals extend shared code to this many days unless told otherwise. */
export const DEFAULT_CODE_TTL_DAYS = 170;
/** The network caps an entry at max_entry_ttl (~180 days); stay under it. */
export const MAX_CODE_TTL_DAYS = 170;

/**
 * Validate a platform code-renewal lifetime. A value at or below what the contracts bump code to
 * themselves would be paid again by the next caller, so it is refused.
 */
export function parseCodeTtlDays(raw) {
  const days = Number(raw);
  if (!Number.isInteger(days) || days <= CONTRACT_CODE_EXTEND_TO_DAYS || days > MAX_CODE_TTL_DAYS) {
    throw new Error(
      `Code TTL must be an integer above ${CONTRACT_CODE_EXTEND_TO_DAYS} days (contracts bump code that far ` +
        `themselves) and at most ${MAX_CODE_TTL_DAYS} days (network cap), got ${raw}`
    );
  }
  return days;
}

/**
 * The first positional argument: anything not a `--flag` and not the value of one. Flags in
 * `valueless` take no value, so the argument after them is positional.
 */
export function positionalArg(args, valueless = []) {
  return args.find((a, i) => {
    if (a.startsWith('--')) return false;
    const prev = args[i - 1];
    return !(prev?.startsWith('--') && !valueless.includes(prev));
  });
}

/**
 * What the Manager's latest pointers name, for renewal. `view(method, name)` reads the Manager.
 * The `LatestImplementation(name)` entry outlives a revoke (`latest_pointer` still returns it,
 * `get_latest_implementation` filters the hash out), and `upgrade_manager`
 * and the app read that entry, so every existing pointer is renewed; only an unrevoked
 * hash is worth keeping alive.
 */
export function collectLatest(view, names) {
  const hashes = [];
  const pointerNames = [];
  for (const name of names) {
    const pointer = view('latest_pointer', name);
    if (pointer && typeof pointer === 'object') pointerNames.push(name);
    const latest = view('get_latest_implementation', name);
    if (latest && typeof latest === 'object') hashes.push({ hash: latest.wasm_hash, label: `${name} (latest)` });
  }
  return { hashes, pointerNames };
}

// ---------------------------------------------------------------------------
// Minimal ScVal XDR encoding for storage keys passed to `stellar contract extend --key-xdr`
// ---------------------------------------------------------------------------

const SCV_U32 = 3;
const SCV_BYTES = 13;
const SCV_STRING = 14;
const SCV_SYMBOL = 15;
const SCV_VEC = 16;

function u32be(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0);
  return b;
}

function padded(bytes) {
  const pad = (4 - (bytes.length % 4)) % 4;
  return Buffer.concat([u32be(bytes.length), bytes, Buffer.alloc(pad)]);
}

export const scv = {
  u32: (n) => Buffer.concat([u32be(SCV_U32), u32be(n)]),
  bytes: (buf) => Buffer.concat([u32be(SCV_BYTES), padded(Buffer.from(buf))]),
  string: (s) => Buffer.concat([u32be(SCV_STRING), padded(Buffer.from(s, 'utf8'))]),
  symbol: (s) => Buffer.concat([u32be(SCV_SYMBOL), padded(Buffer.from(s, 'utf8'))]),
  vec: (items) => Buffer.concat([u32be(SCV_VEC), u32be(1), u32be(items.length), ...items])
};

/** Prefix of every Builder storage key (contracts/common/src/lib.rs `STORAGE_NAMESPACE`). */
export const STORAGE_NAMESPACE = 'builder';

/** Base64 XDR of `common::ns(e, Key::Variant(args..))`. `args` are encoded ScVals. */
export function namespacedKeyXdr(variant, ...args) {
  return scv.vec([scv.symbol(STORAGE_NAMESPACE), scv.vec([scv.symbol(variant), ...args])]).toString('base64');
}

/** Run a read-only contract call through the CLI and parse its JSON (or bare) result. */
export function invokeView(contractId, method, args, { network, source }) {
  const r = runQuiet('stellar', [
    'contract',
    'invoke',
    '--id',
    contractId,
    '--source-account',
    source,
    '--network',
    network,
    '--send',
    'no',
    '--',
    method,
    ...args
  ]);
  if (!r.ok) throw new Error(`${method} on ${contractId} failed: ${(r.stderr || r.stdout).trim()}`);
  const last = (r.stdout + r.stderr)
    .replace(/\x1b\[[0-9;]*m/g, '')
    .trim()
    .split('\n')
    .pop()
    .trim();
  try {
    return JSON.parse(last);
  } catch {
    return last;
  }
}

// ---------------------------------------------------------------------------
// Fee-capped TTL extension (STORAGE_DIET_FIX_REVIEW issue 2)
// ---------------------------------------------------------------------------

/**
 * Most resource fee one extension may carry, in stroops (300 XLM). A
 * transaction's total fee is a u32 (4,294,967,295 stroops, ~429 XLM); a fresh
 * 43 KB code entry extended to 170 days on testnet simulates at ~360 XLM, so
 * anything above this ceiling is extended in steps instead.
 */
export const SAFE_RESOURCE_FEE_STROOPS = 3_000_000_000n;

function runWithInput(command, args, input) {
  const result = spawnSync(command, args, {
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
    encoding: 'utf8',
    env: process.env
  });
  if (result.status !== 0)
    throw new Error(`${command} ${args.slice(0, 2).join(' ')}: ${(result.stderr || result.stdout).trim()}`);
  return result.stdout.trim();
}

/** Build and simulate `stellar contract extend` to `ledgers` without sending. */
export function simulateExtend(selectorArgs, ledgers, { network, source }) {
  const built = runQuiet('stellar', [
    'contract',
    'extend',
    ...selectorArgs,
    '--ledgers-to-extend',
    String(ledgers),
    '--durability',
    'persistent',
    '--source-account',
    source,
    '--network',
    network,
    '--build-only'
  ]);
  if (!built.ok) throw new Error((built.stderr || built.stdout).trim());
  const xdr = runWithInput(
    'stellar',
    ['tx', 'simulate', '--source-account', source, '--network', network],
    built.stdout.trim()
  );
  const decoded = JSON.parse(runWithInput('stellar', ['tx', 'decode', '--output', 'json'], xdr));
  const tx = decoded.tx.tx;
  const resourceFee = BigInt(tx.ext?.v1?.resource_fee ?? 0);
  return { xdr, fee: BigInt(tx.fee), resourceFee };
}

/**
 * Plan the extension targets for `days`: the full target when its simulated
 * resource fee fits under `ceiling`, else the longest shorter target that does
 * (rent is charged per ledger added, so each step pays only its share). Calls
 * `simulate(ledgers)` and returns the target to submit next.
 */
export function nextExtendTarget(
  targetLedgers,
  simulate,
  { ceiling = SAFE_RESOURCE_FEE_STROOPS, minLedgers = LEDGERS_PER_DAY } = {}
) {
  let ledgers = targetLedgers;
  let sim = simulate(ledgers);
  while (sim.resourceFee > ceiling) {
    const shorter = Math.floor(ledgers * 0.6);
    if (shorter < minLedgers) {
      throw new Error(`even a ${Math.round(shorter / LEDGERS_PER_DAY)}-day extension costs ${sim.resourceFee} stroops`);
    }
    ledgers = shorter;
    sim = simulate(ledgers);
  }
  return { ledgers, sim };
}

/**
 * Extend an entry (`--wasm-hash h`, `--id c`, or `--id c --key-xdr k`) to
 * `days`, in steps when one extension would come too close to the u32 fee
 * cap. Signs and sends exactly the simulated transaction. Returns the steps
 * taken as `{ days, fee }`; with `dryRun` only reports what would be sent.
 */
export function extendWithinFeeCap(selectorArgs, days, { network, source, dryRun = false, ceiling } = {}) {
  const target = days * LEDGERS_PER_DAY;
  const steps = [];
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { ledgers, sim } = nextExtendTarget(target, (l) => simulateExtend(selectorArgs, l, { network, source }), {
      ceiling
    });
    steps.push({ days: +(ledgers / LEDGERS_PER_DAY).toFixed(1), fee: sim.fee });
    if (dryRun) return steps;
    const signed = runWithInput('stellar', ['tx', 'sign', '--sign-with-key', source, '--network', network], sim.xdr);
    runWithInput('stellar', ['tx', 'send', '--network', network], signed);
    if (ledgers === target) return steps;
  }
  throw new Error(`could not reach ${days} days in 8 steps`);
}
