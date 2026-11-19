import { describe, expect, it } from 'vitest';

import {
  IndexerLateError,
  type WaitTimeoutError,
  LedgerLateError,
  timeoutMs,
  UiTimeoutError,
  waitForIndexed,
  waitForLedgerTime,
  waitForUi
} from '../src/waits.ts';

/** The error a wait rejects with; fails the test if it resolves. */
function failure(promise: Promise<unknown>) {
  return promise.then(
    () => {
      throw new Error('expected the wait to fail');
    },
    (error: unknown) => error as WaitTimeoutError
  );
}

/** A fake clock: sleeping advances time instantly. */
function fakeClock() {
  let now = 0;
  return { now: () => now, sleep: async (ms: number) => void (now += ms) };
}

describe('timeoutMs', () => {
  it('scales with the governing duration, per kind', () => {
    expect(timeoutMs({ governingS: 300 }, 'ledger-late')).toBe((300 * 1.5 + 60) * 1000);
    expect(timeoutMs({ governingS: 300 }, 'indexer-late')).toBe((300 + 180) * 1000);
    expect(timeoutMs({ governingS: 0 }, 'ui-timeout')).toBe(30_000);
    expect(timeoutMs({ governingS: 300, factor: 2, slackS: 0 }, 'ledger-late')).toBe(600_000);
  });
});

describe('waitForLedgerTime', () => {
  it('returns once a ledger closes at or after the target', async () => {
    let close = 1_000;
    const head = async () => ({ sequence: close, closeTime: (close += 5) });
    const reached = await waitForLedgerTime(1_020, { governingS: 300, pollMs: 1_000 }, { head, clock: fakeClock() });
    expect(reached.closeTime).toBeGreaterThanOrEqual(1_020);
  });

  it('fails as ledger-late with how far short it was', async () => {
    const head = async () => ({ sequence: 7, closeTime: 1_000 });
    const error = await failure(
      waitForLedgerTime(2_000, { governingS: 10, label: 'vote start' }, { head, clock: fakeClock() })
    );
    expect(error).toBeInstanceOf(LedgerLateError);
    expect(error.kind).toBe('ledger-late');
    expect(error.message).toMatch(/^\[ledger-late\] vote start: .*1000s short/);
  });

  it('keeps polling through RPC errors and reports the last one', async () => {
    const head = async () => {
      throw new Error('503');
    };
    const error = await failure(waitForLedgerTime(1, { governingS: 1, slackS: 1 }, { head, clock: fakeClock() }));
    expect(error.message).toMatch(/RPC never answered: 503/);
  });
});

describe('waitForIndexed', () => {
  it('returns the body once the predicate holds', async () => {
    let calls = 0;
    const fetchJson = async () => ({ status: 200, body: { state: ++calls >= 3 ? 'active' : 'pending' } });
    const body = await waitForIndexed<{ state: string }>(
      null,
      { label: 'proposal active', path: '/api/x', predicate: (b) => b.state === 'active' },
      { governingS: 300 },
      { fetchJson, clock: fakeClock() }
    );
    expect(body.state).toBe('active');
    expect(calls).toBe(3);
  });

  it('fails as indexer-late, never a generic timeout, with the last response and health', async () => {
    const fetchJson = async (path: string) =>
      path === '/api/health'
        ? { status: 200, body: { status: 'degraded' } }
        : { status: 404, body: { message: 'not found' } };
    const error = await failure(
      waitForIndexed(
        null,
        { label: 'DAO in the read model', path: '/api/dao/C1', predicate: () => true },
        { governingS: 0, slackS: 10 },
        { fetchJson, clock: fakeClock() }
      )
    );
    expect(error).toBeInstanceOf(IndexerLateError);
    expect(error.message).toMatch(/^\[indexer-late\] DAO in the read model/);
    expect(error.message).toMatch(/HTTP 404/);
    expect(error.message).toMatch(/degraded/);
  });
});

describe('waitForUi', () => {
  it('labels a failed assertion as ui-timeout with the scaled timeout', async () => {
    let given = 0;
    const error = await failure(
      waitForUi(
        'toast',
        async (timeout) => {
          given = timeout;
          throw new Error('locator not visible');
        },
        { governingS: 10 }
      )
    );
    expect(given).toBe(40_000);
    expect(error).toBeInstanceOf(UiTimeoutError);
    expect(error.message).toMatch(/^\[ui-timeout\] toast: .*locator not visible/);
  });
});
