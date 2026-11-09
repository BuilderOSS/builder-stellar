import { describe, expect, it, vi } from 'vitest';

import {
  assessPipeline,
  fetchPipelineReport,
  parsePipelineLastLedger,
  PIPELINE_NOT_CONFIGURED,
  type PipelineReport,
  settleBy
} from './pipeline-health';

const running = (lastLedger: number | null): PipelineReport => ({
  configured: true,
  status: 'RUNNING',
  errors: [],
  lastLedger
});

describe('parsePipelineLastLedger', () => {
  it('reads the last ledger from a source state entry', () => {
    expect(parsePipelineLastLedger({ key: 'stellar_source___k37piba', data: { next_number: 5635475 } })).toBe(5635474);
  });

  it('finds the field inside lists and wrappers, and takes the slowest source', () => {
    const state = { entries: [{ data: { next_number: 200 } }, { data: { next_number: '150' } }] };
    expect(parsePipelineLastLedger(state)).toBe(149);
  });

  it('returns null when there is no usable position', () => {
    expect(parsePipelineLastLedger(null)).toBeNull();
    expect(parsePipelineLastLedger({ data: { next_number: 'soon' } })).toBeNull();
    expect(parsePipelineLastLedger({ data: { next_number: 0 } })).toBeNull();
    expect(parsePipelineLastLedger({ entries: [] })).toBeNull();
  });
});

describe('assessPipeline', () => {
  it('is healthy within the lag threshold, however old the last event is', () => {
    expect(assessPipeline(running(5_000_000), 5_000_040)).toMatchObject({ status: 'healthy', lagLedgers: 40 });
  });

  it('degrades past 100 ledgers and fails past 1000', () => {
    expect(assessPipeline(running(5_000_000), 5_000_101).status).toBe('degraded');
    expect(assessPipeline(running(5_000_000), 5_001_001).status).toBe('unhealthy');
  });

  it('fails when Goldsky reports the pipeline failed, stopped or paused', () => {
    for (const status of ['FAILED', 'STOPPED', 'PAUSED']) {
      const result = assessPipeline({ ...running(5_000_000), status }, 5_000_001);
      expect(result.status).toBe('unhealthy');
      expect(result.alerts.pipeline_failed).toBe(true);
    }
  });

  it('degrades while the pipeline restarts or its position cannot be read', () => {
    expect(assessPipeline({ ...running(5_000_000), status: 'RESTARTING' }, 5_000_001).status).toBe('degraded');
    expect(assessPipeline(running(null), 5_000_001)).toMatchObject({ status: 'degraded', lagLedgers: null });
  });

  it('never degrades health when no Goldsky token is configured', () => {
    expect(assessPipeline(PIPELINE_NOT_CONFIGURED, 5_000_000)).toMatchObject({ status: 'healthy', lagLedgers: null });
  });

  it('does not report lag when the chain head is unknown', () => {
    expect(assessPipeline(running(5_000_000), null)).toMatchObject({ status: 'healthy', lagLedgers: null });
  });
});

describe('fetchPipelineReport', () => {
  it('does not call Goldsky without a token', async () => {
    const fetchImpl = vi.fn();
    expect(await fetchPipelineReport({ pipeline: 'p' }, fetchImpl as unknown as typeof fetch)).toEqual(
      PIPELINE_NOT_CONFIGURED
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('combines the status and the state, with the token as a bearer', async () => {
    const fetchImpl = vi.fn(async (url: string, _init?: RequestInit) =>
      Response.json(
        url.endsWith('/status')
          ? { name: 'p', status: 'RUNNING', errors: [{ message: 'one' }] }
          : { data: { next_number: 101 } }
      )
    );
    const report = await fetchPipelineReport(
      { token: 't0ken', pipeline: 'my pipeline' },
      fetchImpl as unknown as typeof fetch
    );
    expect(report).toEqual({ configured: true, status: 'RUNNING', errors: ['one'], lastLedger: 100 });
    expect(fetchImpl.mock.calls[0][0]).toContain('/pipelines/my%20pipeline/');
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ headers: { Authorization: 'Bearer t0ken' } });
  });

  it('leaves fields null instead of throwing when the API fails', async () => {
    const fetchImpl = vi.fn(async () => new Response('no', { status: 500 }));
    expect(await fetchPipelineReport({ token: 't', pipeline: 'p' }, fetchImpl as unknown as typeof fetch)).toEqual({
      configured: true,
      status: null,
      errors: [],
      lastLedger: null
    });
  });
});

describe('settleBy', () => {
  it('returns the value of a check that finishes before the deadline', async () => {
    const result = await settleBy(async () => 42, new Promise<void>(() => {}), null);
    expect(result).toMatchObject({ value: 42, timedOut: false });
    expect(result.ms).not.toBeNull();
  });

  it('falls back when the deadline passes first', async () => {
    const result = await settleBy(() => new Promise<number>(() => {}), Promise.resolve(), null);
    expect(result).toEqual({ value: null, ms: null, timedOut: true });
  });

  it('falls back without throwing when the check rejects', async () => {
    const result = await settleBy(() => Promise.reject(new Error('down')), new Promise<void>(() => {}), 'unknown');
    expect(result).toMatchObject({ value: 'unknown', timedOut: false });
  });
});
