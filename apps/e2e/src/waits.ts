import { expect, type APIRequestContext, type Locator } from '@playwright/test';

import { E2E_BASE_URL, TESTNET_RPC_URL } from './network.ts';

/**
 * Waits are conditions, not sleeps (§3.3). Each takes the duration that governs it (a voting period,
 * an auction) and allows a multiple of it plus slack, then fails with a class that says what was
 * late. Reports group failures by `kind`, so a Goldsky outage reads as "indexer late", never as a
 * generic timeout (§13.5).
 */
export type WaitKind = 'ledger-late' | 'indexer-late' | 'ui-timeout';

export class WaitTimeoutError extends Error {
  constructor(
    readonly kind: WaitKind,
    readonly label: string,
    readonly waitedMs: number,
    detail: string
  ) {
    super(`[${kind}] ${label}: not reached after ${Math.round(waitedMs / 1000)}s. ${detail}`.trim());
    this.name = 'WaitTimeoutError';
  }
}

export class LedgerLateError extends WaitTimeoutError {
  constructor(label: string, waitedMs: number, detail: string) {
    super('ledger-late', label, waitedMs, detail);
    this.name = 'LedgerLateError';
  }
}

export class IndexerLateError extends WaitTimeoutError {
  constructor(label: string, waitedMs: number, detail: string) {
    super('indexer-late', label, waitedMs, detail);
    this.name = 'IndexerLateError';
  }
}

export class UiTimeoutError extends WaitTimeoutError {
  constructor(label: string, waitedMs: number, detail: string) {
    super('ui-timeout', label, waitedMs, detail);
    this.name = 'UiTimeoutError';
  }
}

export type Budget = {
  /** The duration that governs this wait, in seconds (e.g. the 300s voting period). */
  governingS: number;
  /** Multiple of the governing duration to allow. */
  factor?: number;
  /** Fixed allowance on top, in seconds, for ledger close and indexer lag. */
  slackS?: number;
};

/** Timeout for a wait: governing × factor + slack. Defaults are per kind (measured lag can tune them, §13.4). */
export function timeoutMs({ governingS, factor, slackS }: Budget, kind: WaitKind) {
  const defaults = { 'ledger-late': [1.5, 60], 'indexer-late': [1, 180], 'ui-timeout': [1, 30] }[kind];
  return Math.round((governingS * (factor ?? defaults[0]) + (slackS ?? defaults[1])) * 1000);
}

type Clock = { now: () => number; sleep: (ms: number) => Promise<void> };
const realClock: Clock = { now: () => Date.now(), sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) };

export type LedgerHead = { sequence: number; closeTime: number };

/** RPC `getLatestLedger`: the ledger head and its close time (unix seconds). */
export async function latestLedger(rpcUrl = TESTNET_RPC_URL): Promise<LedgerHead> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getLatestLedger' })
  });
  if (!response.ok) throw new Error(`getLatestLedger: HTTP ${response.status}`);
  const body = (await response.json()) as {
    result?: { sequence: number; closeTime: string };
    error?: { message: string };
  };
  if (!body.result) throw new Error(`getLatestLedger: ${body.error?.message ?? 'no result'}`);
  return { sequence: body.result.sequence, closeTime: Number(body.result.closeTime) };
}

/**
 * Wait until the chain's ledger close time reaches `targetUnixS` (a proposal's vote start, an
 * auction's end). Contracts compare against ledger time, not wall time, so this reads RPC.
 */
export async function waitForLedgerTime(
  targetUnixS: number,
  budget: Budget & { label?: string; pollMs?: number },
  deps: { head?: () => Promise<LedgerHead>; clock?: Clock } = {}
): Promise<LedgerHead> {
  const head = deps.head ?? (() => latestLedger());
  const clock = deps.clock ?? realClock;
  const limit = timeoutMs(budget, 'ledger-late');
  const label = budget.label ?? `ledger time ${new Date(targetUnixS * 1000).toISOString()}`;
  const started = clock.now();
  let last: LedgerHead | null = null;
  let lastError = '';
  while (clock.now() - started <= limit) {
    try {
      last = await head();
      if (last.closeTime >= targetUnixS) return last;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await clock.sleep(budget.pollMs ?? 5_000);
  }
  throw new LedgerLateError(
    label,
    clock.now() - started,
    last
      ? `Ledger ${last.sequence} closed at ${last.closeTime}, ${targetUnixS - last.closeTime}s short.`
      : `RPC never answered: ${lastError}`
  );
}

export type IndexedCheck<T> = {
  label: string;
  /** App API path, e.g. `/api/dao/<id>/proposals/<n>`. */
  path: string;
  /** True once the read model shows what the step wrote. */
  predicate: (body: T) => boolean;
  pollMs?: number;
};

/**
 * Poll one of the app's own API routes until the read model shows a write (§3.3). The app reads
 * the Goldsky-fed Postgres views, so a timeout here means the indexer is late, not the chain.
 */
export async function waitForIndexed<T>(
  request: APIRequestContext | null,
  check: IndexedCheck<T>,
  budget: Budget,
  deps: { fetchJson?: (path: string) => Promise<{ status: number; body: unknown }>; clock?: Clock } = {}
): Promise<T> {
  const clock = deps.clock ?? realClock;
  const fetchJson =
    deps.fetchJson ??
    (async (path: string) => {
      if (!request) throw new Error('waitForIndexed needs a request context');
      const response = await request.get(new URL(path, E2E_BASE_URL).toString(), { failOnStatusCode: false });
      return { status: response.status(), body: await response.json().catch(() => null) };
    });
  const limit = timeoutMs(budget, 'indexer-late');
  const started = clock.now();
  let lastSeen = 'no response yet';
  while (clock.now() - started <= limit) {
    try {
      const { status, body } = await fetchJson(check.path);
      if (status === 200 && body !== null && check.predicate(body as T)) return body as T;
      lastSeen = `HTTP ${status}: ${JSON.stringify(body)?.slice(0, 300)}`;
    } catch (error) {
      lastSeen = error instanceof Error ? error.message : String(error);
    }
    await clock.sleep(check.pollMs ?? 5_000);
  }
  let health = '';
  try {
    const { body } = await fetchJson('/api/health');
    health = ` /api/health: ${JSON.stringify(body)?.slice(0, 400)}`;
  } catch {
    /* health is a hint only */
  }
  throw new IndexerLateError(check.label, clock.now() - started, `Last ${check.path}: ${lastSeen}.${health}`);
}

/**
 * A UI condition through Playwright's own retrying assertions, with the timeout taken from the
 * governing duration and a labelled failure.
 */
export async function waitForUi(
  label: string,
  assertion: (timeout: number) => Promise<void>,
  budget: Budget = { governingS: 0 }
) {
  const limit = timeoutMs(budget, 'ui-timeout');
  const started = Date.now();
  try {
    await assertion(limit);
  } catch (error) {
    const detail = error instanceof Error ? error.message.split('\n').slice(0, 3).join(' ') : String(error);
    throw new UiTimeoutError(label, Date.now() - started, detail);
  }
}

/** The common case: a locator becomes visible. */
export function waitForVisible(locator: Locator, label: string, budget?: Budget) {
  return waitForUi(label, (timeout) => expect(locator).toBeVisible({ timeout }), budget);
}
