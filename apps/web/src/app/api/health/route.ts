import { NextResponse } from 'next/server';

import { DEPLOYMENT_ID } from '@/config/deployments.generated';
import { prisma } from '@/lib/prisma';

/**
 * Health check endpoint for monitoring production deployment
 *
 * Returns:
 * - Goldsky pipeline status (latest feed ledger, from app.feed_status)
 * - DAO count
 * - Recent activity count (feed rows in the last 720 ledgers)
 * - Overall health status
 *
 * Usage: GET /api/health
 */
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

    // Check 2: DAO count
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

    // Calculate pipeline lag
    const pipelineLag = rpcLatestLedger && latestLedger ? rpcLatestLedger - latestLedger : null;

    // Determine health status
    const isHealthy = latestLedger !== null && daoCount >= 0;
    const hasHighLag = pipelineLag !== null && pipelineLag > 100; // More than 100 ledgers behind

    return NextResponse.json(
      {
        status: isHealthy ? (hasHighLag ? 'degraded' : 'healthy') : 'unhealthy',
        timestamp: new Date().toISOString(),
        metrics: {
          rpc_latest_ledger: rpcLatestLedger,
          db_latest_ledger: latestLedger,
          pipeline_lag_ledgers: pipelineLag,
          dao_count: daoCount,
          recent_activity_1h: recentActivityCount
        },
        performance_ms: {
          rpc_check: rpcCheckTime,
          event_check: eventProcessingTime,
          dao_check: daoCheckTime,
          total: totalTime
        },
        alerts: {
          high_event_lag: hasHighLag,
          no_recent_activity: recentActivityCount === 0,
          db_slow: totalTime > 5000,
          rpc_unreachable: rpcLatestLedger === null
        }
      },
      { status: isHealthy ? 200 : 503 }
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
