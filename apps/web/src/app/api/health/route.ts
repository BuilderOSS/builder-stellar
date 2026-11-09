import { NextResponse } from 'next/server';

import { DEPLOYMENT_ID } from '@/config/deployments.generated';
import { assessPipeline, fetchPipelineReport, type HealthStatus } from '@/lib/pipeline-health';
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
 * Usage: GET /api/health
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const startTime = Date.now();

    // Get database connection from environment (read-only app role)
    // Check 1: Latest ledger from Stellar RPC
    let rpcLatestLedger = null;
    let rpcCheckTime = 0;
    try {
      const t1 = Date.now();
      const rpcUrl = process.env.NEXT_PUBLIC_STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org';
      const rpcResponse = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getLatestLedger'
        })
      });
      const rpcData = await rpcResponse.json();
      rpcLatestLedger = rpcData.result?.sequence || null;
      rpcCheckTime = Date.now() - t1;
    } catch (e) {
      console.error('Failed to check RPC latest ledger:', e);
    }

    // Check 2: Feed freshness for this deployment (app.feed_status: the latest
    // feed ledger and the rows of the last 720 ledgers, ~1 h, from the index).
    let latestLedger: number | null = null;
    let recentActivityCount = 0;
    let eventProcessingTime = 0;
    try {
      const t1 = Date.now();
      const result = await prisma.appFeedStatus.findFirst({ where: { deploymentId: DEPLOYMENT_ID } });
      latestLedger = result ? Number(result.latestLedger) : null;
      recentActivityCount = result ? Number(result.lastHourCount) : 0;
      eventProcessingTime = Date.now() - t1;
    } catch (e) {
      console.error('Failed to check feed status:', e);
    }

    // Check 3: the pipeline's own position and status (Goldsky API; skipped without a token).
    const t2 = Date.now();
    const pipeline = await fetchPipelineReport({
      token: process.env.GOLDSKY_API_TOKEN,
      pipeline: process.env.GOLDSKY_PIPELINE_NAME || `builder-stellar-${process.env.NEXT_PUBLIC_NETWORK || 'testnet'}`
    });
    const pipelineCheckTime = Date.now() - t2;
    const assessment = assessPipeline(pipeline, rpcLatestLedger);

    // Check 4: DAO count
    let daoCount = 0;
    let daoCheckTime = 0;
    try {
      const t1 = Date.now();
      daoCount = await prisma.managerDao.count({ where: { deploymentId: DEPLOYMENT_ID } });
      daoCheckTime = Date.now() - t1;
    } catch (e) {
      console.error('Failed to count DAOs:', e);
    }

    const totalTime = Date.now() - startTime;

    // Ledgers since the newest DAO event. Informational: a quiet chain makes it grow.
    const lastEventAge = rpcLatestLedger && latestLedger ? rpcLatestLedger - latestLedger : null;

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
          rpc_check: rpcCheckTime,
          event_check: eventProcessingTime,
          pipeline_check: pipelineCheckTime,
          dao_check: daoCheckTime,
          total: totalTime
        },
        alerts: {
          ...assessment.alerts,
          no_recent_activity: recentActivityCount === 0,
          db_slow: totalTime > 5000,
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
