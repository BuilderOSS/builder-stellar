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
  const result = runQuiet('stellar', [
    'tx',
    'fetch',
    'result',
    '--hash',
    txHash,
    '--network',
    networkName,
    '--output',
    'json-formatted'
  ], { timeout: 15_000 });

  if (!result.ok) {
    throw new Error(
      `Failed to fetch ledger for transaction ${txHash}: ${result.stderr || result.stdout}`
    );
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
export const STORAGE_NAMESPACE = 'buildeross';

/** Base64 XDR of `common::ns(e, Key::Variant(args..))`. `args` are encoded ScVals. */
export function namespacedKeyXdr(variant, ...args) {
  return scv
    .vec([scv.symbol(STORAGE_NAMESPACE), scv.vec([scv.symbol(variant), ...args])])
    .toString('base64');
}

/** Run a read-only contract call through the CLI and parse its JSON (or bare) result. */
export function invokeView(contractId, method, args, { network, source }) {
  const r = runQuiet('stellar', [
    'contract', 'invoke', '--id', contractId, '--source-account', source, '--network', network,
    '--send', 'no', '--', method, ...args
  ]);
  if (!r.ok) throw new Error(`${method} on ${contractId} failed: ${(r.stderr || r.stdout).trim()}`);
  const last = (r.stdout + r.stderr).replace(/\x1b\[[0-9;]*m/g, '').trim().split('\n').pop().trim();
  try {
    return JSON.parse(last);
  } catch {
    return last;
  }
}
