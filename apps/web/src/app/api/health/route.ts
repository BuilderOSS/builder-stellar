import { NextResponse } from 'next/server';

import { DEPLOYMENT_ID } from '@/config/deployments.generated';
import {
  assessPipeline,
  fetchPipelineReport,
  HEALTH_BUDGET_MS,
  type HealthStatus,
  type PipelineReport,
  settleBy
} from '@/lib/pipeline-health';
import { prisma } from '@/lib/prisma';

/**
 * Health check endpoint for monitoring production deployment
 *
 * Returns:
 * - The chain head (Stellar RPC)
 * - The pipeline's own position and Goldsky status, when GOLDSKY_API_TOKEN is set (lag = chain head
 *   minus the pipeline's last read ledger; this decides health)
 * - The newest ledger with a DAO event in the database (app.feed_status; informational: it stands
 *   still whenever the chain is quiet, so its age alone never degrades health)
 * - DAO count and recent activity (feed rows in the last 720 ledgers)
 * - Overall health status
 *
 * The checks run concurrently and the response never waits past HEALTH_BUDGET_MS (5 s): a check
 * still running then reports null/unknown (timing null) and sets `db_slow`.
 *
 * Usage: GET /api/health
 */
export const dynamic = 'force-dynamic';

/** Run the health checks concurrently within HEALTH_BUDGET_MS and report the worst status. */
export async function GET() {
  try {
    const startTime = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, HEALTH_BUDGET_MS);
    });

    // The checks are independent; each one that misses the deadline reports null/unknown.
    const [rpc, feed, pipelineCheck, dao] = await Promise.all([
      // Check 1: Latest ledger from Stellar RPC
      settleBy(
        async () => {
          try {
            const rpcUrl = process.env.NEXT_PUBLIC_STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org';
            const rpcResponse = await fetch(rpcUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getLatestLedger'
              }),
              signal: AbortSignal.timeout(HEALTH_BUDGET_MS)
            });
            const rpcData = await rpcResponse.json();
            return (rpcData.result?.sequence as number | undefined) || null;
          } catch (e) {
            console.error('Failed to check RPC latest ledger:', e);
            return null;
          }
        },
        deadline,
        null
      ),
      // Check 2: Feed freshness for this deployment (app.feed_status: the latest
      // feed ledger and the rows of the last 720 ledgers, ~1 h, from the index).
      settleBy(
        async () => {
          try {
            const result = await prisma.appFeedStatus.findFirst({ where: { deploymentId: DEPLOYMENT_ID } });
            return {
              latestLedger: result ? Number(result.latestLedger) : null,
              recentActivityCount: result ? Number(result.lastHourCount) : 0
            };
          } catch (e) {
            console.error('Failed to check feed status:', e);
            return { latestLedger: null, recentActivityCount: 0 };
          }
        },
        deadline,
        { latestLedger: null as number | null, recentActivityCount: 0 }
      ),
      // Check 3: the pipeline's own position and status (Goldsky API; skipped without a token).
      settleBy(
        () =>
          fetchPipelineReport({
            token: process.env.GOLDSKY_API_TOKEN,
            pipeline:
              process.env.GOLDSKY_PIPELINE_NAME || `builder-stellar-${process.env.NEXT_PUBLIC_NETWORK || 'testnet'}`
          }),
        deadline,
        // Only a configured pipeline can time out; it then reads as unknown.
        { configured: true, status: null, errors: [], lastLedger: null } satisfies PipelineReport
      ),
      // Check 4: DAO count (null when it could not be read)
      settleBy(
        async () => {
          try {
            return await prisma.managerDao.count({ where: { deploymentId: DEPLOYMENT_ID } });
          } catch (e) {
            console.error('Failed to count DAOs:', e);
            return null;
          }
        },
        deadline,
        null as number | null
      )
    ]);
    clearTimeout(timer);

    const rpcLatestLedger = rpc.value;
    const { latestLedger, recentActivityCount } = feed.value;
    const pipeline = pipelineCheck.value;
    const daoCount = dao.value;
    const assessment = assessPipeline(pipeline, rpcLatestLedger);
    const totalTime = Date.now() - startTime;
    const timedOut = [rpc, feed, pipelineCheck, dao].some((check) => check.timedOut);

    // Ledgers since the newest DAO event. Informational: a quiet chain makes it grow. Null when
    // either ledger is unknown, or when the RPC head is behind the database (a lagging RPC node).
    const lastEventAge =
      rpcLatestLedger !== null && latestLedger !== null && rpcLatestLedger >= latestLedger
        ? rpcLatestLedger - latestLedger
        : null;

    // The database must answer and hold this deployment's events; the pipeline's lag and status
    // can only make that worse.
    const databaseStatus: HealthStatus = latestLedger !== null ? 'healthy' : 'unhealthy';
    const rank: Record<HealthStatus, number> = { healthy: 0, degraded: 1, unhealthy: 2 };
    const status = [databaseStatus, assessment.status].reduce((worst, next) =>
      rank[next] > rank[worst] ? next : worst
    );

    return NextResponse.json(
      {
        status,
        timestamp: new Date().toISOString(),
        metrics: {
          rpc_latest_ledger: rpcLatestLedger,
          pipeline_last_ledger: pipeline.lastLedger,
          pipeline_lag_ledgers: assessment.lagLedgers,
          db_latest_ledger: latestLedger,
          db_latest_event_age_ledgers: lastEventAge,
          dao_count: daoCount,
          recent_activity_1h: recentActivityCount
        },
        pipeline: {
          configured: pipeline.configured,
          status: pipeline.status,
          errors: pipeline.errors
        },
        performance_ms: {
          rpc_check: rpc.ms,
          event_check: feed.ms,
          pipeline_check: pipelineCheck.ms,
          dao_check: dao.ms,
          total: totalTime
        },
        alerts: {
          ...assessment.alerts,
          no_recent_activity: recentActivityCount === 0,
          db_slow: timedOut || totalTime > HEALTH_BUDGET_MS,
          rpc_unreachable: rpcLatestLedger === null
        }
      },
      { status: status === 'unhealthy' ? 503 : 200 }
    );
  } catch (error) {
    console.error('Health check error:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Health check unavailable',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
