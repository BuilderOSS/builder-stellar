import { Pool } from '@neondatabase/serverless';
import { NextResponse } from 'next/server';

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
  const pool = new Pool({
    connectionString: process.env.APP_DATABASE_URL,
  });

  try {
    const startTime = Date.now();

    // Get database connection from environment (read-only app role)
    const databaseUrl = process.env.APP_DATABASE_URL;
    if (!databaseUrl) {
      return NextResponse.json(
        { status: 'error', message: 'APP_DATABASE_URL not configured' },
        { status: 503 }
      );
    }

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
          method: 'getLatestLedger',
        }),
      });
      const rpcData = await rpcResponse.json();
      rpcLatestLedger = rpcData.result?.sequence || null;
      rpcCheckTime = Date.now() - t1;
    } catch (e) {
      console.error('Failed to check RPC latest ledger:', e);
    }

    // Check 2: Latest event in system (event processing lag)
    let latestLedger = null;
    let eventProcessingTime = 0;
    try {
      const t1 = Date.now();
      const result = await pool.query('SELECT MAX(ledger_sequence) as latest_ledger FROM chain.decoded_events');
      latestLedger = result.rows[0]?.latest_ledger || null;
      eventProcessingTime = Date.now() - t1;
    } catch (e) {
      console.error('Failed to check latest event:', e);
    }

    // Check 2: DAO count
    let daoCount = 0;
    let daoCheckTime = 0;
    try {
      const t1 = Date.now();
      const result = await pool.query('SELECT COUNT(*) as count FROM manager.daos');
      daoCount = parseInt(result.rows[0]?.count || '0');
      daoCheckTime = Date.now() - t1;
    } catch (e) {
      console.error('Failed to count DAOs:', e);
    }

    // Check 3: Recent activity (last hour)
    let recentActivityCount = 0;
    let activityCheckTime = 0;
    try {
      const t1 = Date.now();
      const result = await pool.query(
        `SELECT COUNT(*) as count FROM app.activity_feed_events
         WHERE (ledger_closed_at::numeric / 1000) > EXTRACT(epoch FROM NOW() - INTERVAL '1 hour')`
      );
      recentActivityCount = parseInt(result.rows[0]?.count || '0');
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
          recent_activity_1h: recentActivityCount,
        },
        performance_ms: {
          rpc_check: rpcCheckTime,
          event_check: eventProcessingTime,
          dao_check: daoCheckTime,
          activity_check: activityCheckTime,
          total: totalTime,
        },
        alerts: {
          high_event_lag: hasHighLag,
          no_recent_activity: recentActivityCount === 0,
          db_slow: totalTime > 5000,
          rpc_unreachable: rpcLatestLedger === null,
        },
      },
      { status: isHealthy ? 200 : 503 }
    );
  } catch (error) {
    console.error('Health check error:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  } finally {
    await pool.end();
  }
}
