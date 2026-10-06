import { NextResponse } from 'next/server';

import { DEPLOYMENT_ID } from '@/config/deployments.generated';
import { prisma } from '@/lib/prisma';

/**
 * Health check endpoint for monitoring production deployment
 *
 * Returns:
 * - Goldsky pipeline status (latest event ledger)
 * - DAO count
 * - Recent activity count
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

    // Check 2: Latest event for this deployment (event processing lag)
    let latestLedger = null;
    let eventProcessingTime = 0;
    try {
      const t1 = Date.now();
      const result = await prisma.appActivityFeed.findFirst({
        where: { deploymentId: DEPLOYMENT_ID },
        orderBy: { ledgerSequence: 'desc' },
        select: { ledgerSequence: true }
      });
      latestLedger = result ? Number(result.ledgerSequence) : null;
      eventProcessingTime = Date.now() - t1;
    } catch (e) {
      console.error('Failed to check latest event:', e);
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

    // Check 3: Recent activity (last hour)
    let recentActivityCount = 0;
    let activityCheckTime = 0;
    try {
      const t1 = Date.now();
      const activity: Array<{ ledgerClosedAt: string | null }> = await prisma.appActivityFeed.findMany({
        where: { deploymentId: DEPLOYMENT_ID },
        select: { ledgerClosedAt: true }
      });
      const hourAgo = Date.now() - 60 * 60 * 1000;
      recentActivityCount = activity.filter((row) => {
        const raw = row.ledgerClosedAt ?? '';
        const numeric = Number(raw);
        const timestamp = Number.isFinite(numeric)
          ? numeric < 10_000_000_000
            ? numeric * 1000
            : numeric
          : Date.parse(raw);
        return Number.isFinite(timestamp) && timestamp > hourAgo;
      }).length;
      activityCheckTime = Date.now() - t1;
    } catch (e) {
      console.error('Failed to check recent activity:', e);
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
          activity_check: activityCheckTime,
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
