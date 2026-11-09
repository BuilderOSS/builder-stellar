/**
 * Health of the Goldsky pipeline, from the pipeline's own position and status.
 *
 * The database cannot tell a stalled pipeline from a quiet chain: it holds only ledgers that
 * contain DAO events, so its newest ledger stands still whenever nothing happens. The pipeline's
 * source records the next ledger it will read (`next_number`, shown by `goldsky turbo state list`);
 * comparing that with the chain head is the real lag.
 */

const GOLDSKY_API = 'https://api.goldsky.com/api/v1';
const REQUEST_TIMEOUT_MS = 3000;

/** About 8 minutes at one ledger per ~5 seconds. */
export const PIPELINE_LAG_DEGRADED_LEDGERS = 100;
/** About 83 minutes. */
export const PIPELINE_LAG_UNHEALTHY_LEDGERS = 1000;

export type PipelineReport = {
  /** False when no Goldsky API token is set; nothing below is known then. */
  configured: boolean;
  /** Goldsky's runtime status (RUNNING, FAILED, ...), or null when it could not be read. */
  status: string | null;
  errors: string[];
  /** The last ledger the pipeline has read, or null when its position could not be read. */
  lastLedger: number | null;
};

export const PIPELINE_NOT_CONFIGURED: PipelineReport = {
  configured: false,
  status: null,
  errors: [],
  lastLedger: null
};

/**
 * The last ledger the pipeline read, from its state document. Each source keeps
 * `{ "next_number": <next ledger to read> }`; with several sources the slowest one counts.
 * The response shape is not documented, so look for the field anywhere in it.
 */
export function parsePipelineLastLedger(state: unknown): number | null {
  const next: number[] = [];
  const visit = (value: unknown, depth: number) => {
    if (depth > 8 || value === null || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (key === 'next_number') {
        const n = typeof child === 'string' ? Number(child) : child;
        if (typeof n === 'number' && Number.isSafeInteger(n) && n > 0) next.push(n);
      } else {
        visit(child, depth + 1);
      }
    }
  };
  visit(state, 0);
  return next.length ? Math.min(...next) - 1 : null;
}

/** GET a Goldsky API path as JSON; throws on a non-2xx response or after REQUEST_TIMEOUT_MS. */
async function getJson(path: string, token: string, fetchImpl: typeof fetch): Promise<unknown> {
  const response = await fetchImpl(`${GOLDSKY_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: 'no-store'
  });
  if (!response.ok) throw new Error(`Goldsky API ${path}: HTTP ${response.status}`);
  return response.json();
}

/**
 * Read the pipeline's status and position through the Goldsky API. Needs a Viewer-role API token
 * (`GOLDSKY_API_TOKEN`, server-side only); without one the report says so and health falls back
 * to the chain and database alone. Never throws: an unreachable API leaves the fields null.
 */
export async function fetchPipelineReport(
  env: { token?: string; pipeline: string },
  fetchImpl: typeof fetch = fetch
): Promise<PipelineReport> {
  if (!env.token) return PIPELINE_NOT_CONFIGURED;
  const name = encodeURIComponent(env.pipeline);
  const [status, state] = await Promise.allSettled([
    getJson(`/pipelines/${name}/status`, env.token, fetchImpl),
    getJson(`/pipelines/${name}/state`, env.token, fetchImpl)
  ]);
  const statusBody = status.status === 'fulfilled' ? (status.value as { status?: unknown; errors?: unknown }) : null;
  return {
    configured: true,
    status: typeof statusBody?.status === 'string' ? statusBody.status : null,
    errors: Array.isArray(statusBody?.errors)
      ? statusBody.errors.flatMap((e) => (typeof e?.message === 'string' ? [e.message] : []))
      : [],
    lastLedger: state.status === 'fulfilled' ? parsePipelineLastLedger(state.value) : null
  };
}

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export type PipelineAssessment = {
  status: HealthStatus;
  /** Chain head minus the pipeline's last read ledger; null when either is unknown. */
  lagLedgers: number | null;
  alerts: { pipeline_lag: boolean; pipeline_failed: boolean; pipeline_unknown: boolean };
};

/** Judge the pipeline against the chain head. An unconfigured pipeline never degrades health. */
export function assessPipeline(report: PipelineReport, chainLedger: number | null): PipelineAssessment {
  const lagLedgers =
    chainLedger !== null && report.lastLedger !== null ? Math.max(0, chainLedger - report.lastLedger) : null;
  const failed = report.status === 'FAILED' || report.status === 'STOPPED' || report.status === 'PAUSED';
  const unknown =
    report.configured &&
    (report.status === null ||
      report.status === 'UNKNOWN' ||
      report.status === 'RESTARTING' ||
      report.status === 'DEPLOYING' ||
      report.lastLedger === null);
  const lagUnhealthy = lagLedgers !== null && lagLedgers > PIPELINE_LAG_UNHEALTHY_LEDGERS;
  const lagDegraded = lagLedgers !== null && lagLedgers > PIPELINE_LAG_DEGRADED_LEDGERS;

  let status: HealthStatus = 'healthy';
  if (unknown || lagDegraded) status = 'degraded';
  if (failed || lagUnhealthy) status = 'unhealthy';
  return {
    status,
    lagLedgers,
    alerts: { pipeline_lag: lagDegraded, pipeline_failed: failed, pipeline_unknown: unknown }
  };
}

/** The whole health check answers within this many milliseconds; a check still running then is reported as unknown. */
export const HEALTH_BUDGET_MS = 5000;

export type Settled<T> = {
  value: T;
  /** How long the check took, or null when it did not finish before the deadline. */
  ms: number | null;
  timedOut: boolean;
};

/**
 * Run a check until `deadline` resolves. Never rejects: a check that throws or is still running at
 * the deadline yields `fallback` (the work itself is not cancelled, only no longer awaited).
 */
export async function settleBy<T>(work: () => Promise<T>, deadline: Promise<void>, fallback: T): Promise<Settled<T>> {
  const started = Date.now();
  const outcome = await Promise.race([
    work().then(
      (value) => ({ value, timedOut: false }),
      () => ({ value: fallback, timedOut: false })
    ),
    deadline.then(() => ({ value: fallback, timedOut: true }))
  ]);
  if (outcome.timedOut) return { value: fallback, ms: null, timedOut: true };
  return { value: outcome.value, ms: Date.now() - started, timedOut: false };
}
