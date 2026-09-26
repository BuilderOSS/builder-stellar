# Deployment Runbook

Comprehensive guide for deploying the Stellar DAO Builder to production.

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Deployment Overview](#deployment-overview)
3. [Step-by-Step Procedure](#step-by-step-procedure)
4. [Verification and Health Checks](#verification-and-health-checks)
5. [Post-Deployment](#post-deployment)
6. [Rollback Procedures](#rollback-procedures)
7. [Emergency Contacts](#emergency-contacts)

---

## Pre-Deployment Checklist

### Prerequisites

- [ ] All code changes merged to main branch
- [ ] Git branch clean (`git status` shows no uncommitted changes)
- [ ] Environment variables configured:
  - [ ] `DATABASE_URL` - Goldsky writer role (for migrations)
  - [ ] `APP_DATABASE_URL` - App reader role (for health checks)
  - [ ] `GOLDSKY_API_KEY` - For Goldsky deployments
  - [ ] `STELLAR_NETWORK_PASSPHRASE` - Testnet or Production
  - [ ] Other env vars in `.env.production`

### Code Quality Checks

- [ ] All tests passing: `pnpm test`
- [ ] TypeScript compilation clean: `pnpm build`
- [ ] Database migrations validated
- [ ] Goldsky transforms validated (syntax, error handling)
- [ ] No console.error or TODOs related to production blockers

### Database Checks

- [ ] Fresh database available or backup created
- [ ] Database connection tested to `DATABASE_URL`
- [ ] `psql` CLI available for running migrations
- [ ] Sufficient disk space on database (check `pg_database_size()`)

### Access Verification

- [ ] SSH access to deployment server (if applicable)
- [ ] Goldsky dashboard access verified
- [ ] Neon dashboard access verified
- [ ] Health check endpoint accessible after deployment

### Wallet Authentication Environment

Set these values before deploying the web app:

```env
# Required for the encrypted application session
IRON_PASSWORD=<at-least-32-characters>

# Required for server-signed SEP-53 and SEP-10 authentication
STELLAR_WEB_AUTH_SECRET=<funded-account-secret-key>
STELLAR_HOME_DOMAIN=app.example.com
STELLAR_WEB_AUTH_DOMAIN=app.example.com

# Required for WalletConnect wallets, including Freighter Mobile
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=<walletconnect-cloud-project-id>
```

`APP_URL` must be the production origin, and `NEXT_PUBLIC_NETWORK` must match the
network used by the server authentication account. Keep
`STELLAR_WEB_AUTH_SECRET` server-only. `AUTH_APP_NAME` is optional and defaults to
`Stellar DAOs`.

## Authentication Methods

The application supports two wallet authentication methods:

- **SEP-53** (preferred): lightweight message signing.
- **SEP-10** (fallback): transaction-based authentication for wallets without message signing.

Both methods establish the same application session and use server-signed
challenges. Their underlying challenge structures remain protocol-specific.

## MVP Authentication Limitations

### Horizontal Scaling

- Challenge claims are stored in memory and are not shared across instances.
- This works for a single-instance deployment.
- Migrate challenge claims to Redis or another shared store before adding multiple instances.

### WalletConnect Network Validation

- WalletConnect wallets do not expose a reliable pre-signing network query through the installed SDK.
- The UI displays a network reminder, and server-side verification still rejects network mismatches.

### Challenge Pruning

- Expired claims are pruned on each authentication request with an O(n) scan.
- This is sufficient for MVP traffic; use shared storage with TTLs at higher scale.

---

## Deployment Overview

### Components

| Component | Type | Deployment Method | Estimated Time |
|-----------|------|-------------------|-----------------|
| Database Schema | SQL Migrations | psql CLI | 3-5 minutes |
| Goldsky Pipeline | Transforms + Sinks | Goldsky API | 5-10 minutes |
| Application | Next.js | Docker/Vercel | 2-5 minutes |
| Monitoring | Endpoints + Dashboards | Configuration | 2-3 minutes |

### Timeline

- **Total deployment time**: 15-25 minutes
- **Service downtime**: ~2-5 minutes during schema migration
- **Rollback time**: 5-10 minutes (if needed)

### Risk Assessment

| Component | Risk Level | Mitigation |
|-----------|-----------|-----------|
| Database Migration | **HIGH** | Test on staging, have rollback ready, backup beforehand |
| Goldsky Transform | **MEDIUM** | Validate transforms, monitor for processing lag |
| Application Deploy | **LOW** | Standard deployment, can rollback easily |
| Monitoring Setup | **LOW** | Configuration only, no data impact |

---

## Step-by-Step Procedure

### Phase 1: Pre-Deployment Validation (5 minutes)

#### 1.1 Clone Latest Code

```bash
cd stellar-builder
git fetch origin
git checkout main
git pull origin main
git status  # Should show "nothing to commit, working tree clean"
```

#### 1.2 Verify Environment

```bash
# Check required environment variables
echo "DATABASE_URL: ${DATABASE_URL:0:50}..."
echo "APP_DATABASE_URL: ${APP_DATABASE_URL:0:50}..."
echo "GOLDSKY_API_KEY: ${GOLDSKY_API_KEY:0:20}..."

# Test database connection
psql "$DATABASE_URL" -c "SELECT version();"
```

#### 1.3 Run Pre-Deployment Tests

```bash
# Install dependencies
pnpm install

# Run all tests
pnpm test

# Build the application
pnpm build

# TypeScript check
pnpm type-check
```

**Expected Result**: No errors, all tests pass.

---

### Phase 2: Database Migration (3-5 minutes)

#### 2.1 Create Pre-Migration Backup

```bash
# If using Neon, create a branch snapshot
# Or if on your own database:
pg_dump "$DATABASE_URL" > backup_pre_migration_$(date +%s).sql

# Verify backup
ls -lh backup_pre_migration_*.sql
```

#### 2.2 Run Migrations in Order

Migrations must run in sequence (0 → 8):

```bash
# Navigate to project root
cd /path/to/stellar-builder

# Run each migration
echo "Running migration 0000..."
psql "$DATABASE_URL" -f db/migrations/0000_base_tables.sql

echo "Running migration 0001..."
psql "$DATABASE_URL" -f db/migrations/0001_manager_views.sql

echo "Running migration 0002..."
psql "$DATABASE_URL" -f db/migrations/0002_governance_views.sql

echo "Running migration 0003..."
psql "$DATABASE_URL" -f db/migrations/0003_token_views.sql

echo "Running migration 0004..."
psql "$DATABASE_URL" -f db/migrations/0004_auction_views.sql

echo "Running migration 0005..."
psql "$DATABASE_URL" -f db/migrations/0005_treasury_views.sql

echo "Running migration 0006..."
psql "$DATABASE_URL" -f db/migrations/0006_metadata_views.sql

echo "Running migration 0007..."
psql "$DATABASE_URL" -f db/migrations/0007_app_views.sql

echo "Running migration 0008..."
psql "$DATABASE_URL" -f db/migrations/0008_decoded_events_indexes.sql

echo "All migrations completed!"
```

#### 2.3 Verify Schema

```bash
# Verify all schemas created
psql "$DATABASE_URL" -c "SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT LIKE 'pg_%' AND schema_name != 'information_schema' ORDER BY schema_name;"

# Expected schemas: app, auction, chain, governance, manager, metadata, token, treasury

# Verify key tables exist
psql "$DATABASE_URL" -c "\dt chain.*"
psql "$DATABASE_URL" -c "\dv manager.*"

# Verify indexes created
psql "$DATABASE_URL" -c "SELECT schemaname, tablename, indexname FROM pg_indexes WHERE tablename = 'decoded_events' ORDER BY indexname;"
```

**Expected Result**: All schemas, tables, views, and indexes exist without errors.

---

### Phase 3: Goldsky Pipeline Deployment (5-10 minutes)

#### 3.1 Deploy Goldsky Transforms

Access Goldsky Dashboard and deploy transforms in order:

1. **decoded-events.script.js**
   - Purpose: XDR decoding
   - Sink: `chain.decoded_events`
   - Monitor for errors

2. **activity-feed.script.js**
   - Purpose: User-facing activity transformation
   - Sink: `chain.activity_feed_events` (if configured)
   - Check for parsing errors

#### 3.2 Monitor Initial Event Processing

```bash
# Watch event processing progress
# Check Goldsky dashboard for:
# - Latest processed ledger
# - Error rate (should be < 0.1%)
# - Transform execution time (should be < 500ms)

# Alternative: Query database for latest events
psql "$APP_DATABASE_URL" -c "SELECT MAX(ledger_sequence) as latest_ledger FROM chain.decoded_events;"

# Should return a recent ledger number (not NULL)
```

#### 3.3 Verify Event Flow

```bash
# Wait 30-60 seconds, then check for events
psql "$APP_DATABASE_URL" -c "
  SELECT
    contract_role,
    COUNT(*) as event_count,
    MAX(ledger_sequence) as latest_ledger
  FROM chain.decoded_events
  GROUP BY contract_role
  ORDER BY contract_role;
"

# Expected: Events present for manager, governor, token, auction, treasury, metadata
```

**Expected Result**: Events flowing normally, no transform errors.

---

### Phase 4: Application Deployment (2-5 minutes)

#### 4.1 Deploy Application

**Option A: Docker**
```bash
docker build -t stellar-builder:latest .
docker tag stellar-builder:latest stellar-builder:$(git rev-parse --short HEAD)
docker push stellar-builder:latest
# Update deployment to use new image
```

**Option B: Vercel**
```bash
vercel deploy --prod
```

**Option C: Manual/Custom**
```bash
cd apps/web
pnpm build
# Copy build artifacts to production server
# Restart application service
```

#### 4.2 Verify Application Online

```bash
# Check application health
curl https://your-deployment.com/api/health

# Expected response:
# {
#   "status": "healthy",
#   "timestamp": "2024-01-15T10:30:45.123Z",
#   "metrics": { ... },
#   ...
# }
```

**Expected Result**: Health endpoint returns 200 with healthy status.

---

### Phase 5: Monitoring Setup (2-3 minutes)

#### 5.1 Configure Monitoring Alerts

Set up monitoring for these metrics (see [MONITORING.md](./MONITORING.md)):

**Critical Alerts (immediate action required)**:
- [ ] Health endpoint returns 503 or 5xx
- [ ] Event lag > 1 hour (ledger_sequence < current - 200)
- [ ] Database connection pool exhausted

**Warning Alerts (investigate within 30 minutes)**:
- [ ] Health check response time > 5 seconds
- [ ] Event processing errors > 1% of events
- [ ] No activity in last 2 hours

#### 5.2 Configure Dashboards

**Goldsky Dashboard**:
- [ ] Set up alert for high error rate
- [ ] Monitor transform execution time
- [ ] Watch latest processed ledger

**Neon Dashboard**:
- [ ] Monitor query performance (slow queries)
- [ ] Watch connection pool usage
- [ ] Set up storage growth alerts

**Application Monitoring**:
- [ ] Set up uptime monitoring for /api/health
- [ ] Configure response time alerts
- [ ] Enable error tracking (Sentry, etc.)

---

## Verification and Health Checks

### Database Verification

```bash
# Check table row counts
psql "$APP_DATABASE_URL" -c "
  SELECT 'decoded_events' as table_name, COUNT(*) as row_count FROM chain.decoded_events
  UNION ALL
  SELECT 'activity_feed_events', COUNT(*) FROM chain.activity_feed_events
;"

# Check view query plans (should use new indexes)
psql "$APP_DATABASE_URL" -c "
  EXPLAIN (ANALYZE, BUFFERS)
  SELECT * FROM manager.daos WHERE deployment_id = 'test' LIMIT 10;
"

# Verify no NULL creators in daos
psql "$APP_DATABASE_URL" -c "
  SELECT COUNT(*) as null_creators FROM manager.daos WHERE admin_address IS NULL;
"
# Expected: 0 (all DAOs should have creator)
```

### Event Processing Verification

```bash
# Check all domain views have data
psql "$APP_DATABASE_URL" -c "
  SELECT 'manager.daos' as view_name, COUNT(*) as row_count FROM manager.daos
  UNION ALL
  SELECT 'governance.proposals', COUNT(*) FROM governance.proposals
  UNION ALL
  SELECT 'token.inventory', COUNT(*) FROM token.inventory
  UNION ALL
  SELECT 'auction.auctions', COUNT(*) FROM auction.auctions
  UNION ALL
  SELECT 'treasury.calls', COUNT(*) FROM treasury.calls
;"

# Check event types being processed
psql "$APP_DATABASE_URL" -c "
  SELECT event_name, COUNT(*) as count
  FROM chain.decoded_events
  WHERE contract_role IN ('manager', 'governor', 'token', 'auction', 'treasury', 'metadata')
  GROUP BY event_name
  ORDER BY count DESC;
"
```

### Application Verification

```bash
# Test health endpoint multiple times
for i in {1..5}; do
  echo "Health check $i:"
  curl -s https://your-deployment.com/api/health | jq '.status, .metrics.latest_ledger'
done

# Check application logs for errors
# (How you access logs depends on deployment method)
```

### Index Performance Verification

```bash
# Check that indexes are being used
psql "$APP_DATABASE_URL" -c "
  SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan as scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
  FROM pg_stat_user_indexes
  WHERE tablename = 'decoded_events'
  ORDER BY idx_scan DESC;
"

# If idx_scan is 0 for new indexes, they're not being used yet
# This is OK - they'll be used once queries run
```

---

## Post-Deployment

### Monitoring Period

**First 24 hours**:
- Monitor health endpoint every 15 minutes
- Watch Goldsky dashboard for processing lag
- Check application logs for errors

**First 7 days**:
- Daily review of event processing
- Monitor performance trends
- Verify no data anomalies

### Documentation Updates

- [ ] Update DEPLOYMENT.md with any lessons learned
- [ ] Document any emergency procedures needed
- [ ] Update MONITORING.md with threshold adjustments
- [ ] Record deployment timestamp and version

### Backup and Archival

```bash
# Archive deployment artifacts
mkdir -p deployments/$(date +%Y-%m-%d)
cp db/migrations/* deployments/$(date +%Y-%m-%d)/
cp packages/goldsky/src/*.js deployments/$(date +%Y-%m-%d)/
echo "Deployment completed: $(date)" > deployments/$(date +%Y-%m-%d)/TIMESTAMP

# Keep backup for 30 days
ls -lah deployments/
```

---

## Rollback Procedures

### Quick Rollback (Emergency)

```bash
# If something is critically broken immediately after deployment:
# 1. Stop accepting new requests (if possible)
# 2. Restore from previous backup

# For database rollback (CAUTION - destructive):
DATABASE_URL="postgres://user:pass@host:5432/db" ./db/rollback.sh
# This will:
# - Drop all views in reverse order (8 → 0)
# - Drop all tables
# - Restore database to pre-deployment state
```

### Selective Rollback

If only specific components need rollback:

**Rollback Goldsky Only**:
1. Go to Goldsky Dashboard
2. Revert transforms to previous version
3. Monitor for event reprocessing
4. Verify no data loss

**Rollback Application Only**:
```bash
# Option A: Docker
docker run --detach -p 3000:3000 stellar-builder:previous-version

# Option B: Vercel
vercel rollback --prod --to=<previous-deployment-id>

# Option C: Manual
# Restore previous application files and restart
```

**Rollback Database Only**:
```bash
# Restore from backup
psql "$DATABASE_URL" < backup_pre_migration_*.sql

# OR manually drop problematic migrations
psql "$DATABASE_URL" -f db/rollback/0008_decoded_events_indexes_rollback.sql
psql "$DATABASE_URL" -f db/rollback/0007_app_views_rollback.sql
# ... etc
```

### Full Rollback Checklist

- [ ] Stop application (prevent new requests)
- [ ] Restore database from backup OR run rollback.sh
- [ ] Restore Goldsky transforms to previous version
- [ ] Restore application code to previous version
- [ ] Verify health endpoint returns healthy
- [ ] Check event processing restarted
- [ ] Notify team of rollback completion

---

## Emergency Contacts

| Role | Name | Contact | Timezone |
|------|------|---------|----------|
| Database Lead | [Name] | [email] | [TZ] |
| DevOps Lead | [Name] | [email] | [TZ] |
| On-Call | [Name] | [email/phone] | [TZ] |
| Engineering Manager | [Name] | [email] | [TZ] |

### Escalation Procedure

1. **Immediate issue** → Contact On-Call
2. **Database issue** → Contact Database Lead
3. **Infrastructure** → Contact DevOps Lead
4. **Business impact** → Contact Engineering Manager

### Common Issues and Quick Fixes

See [MONITORING.md](./MONITORING.md#troubleshooting) for detailed troubleshooting guide.

**Issue: Events not flowing**
- Check Goldsky dashboard for errors
- Run: `psql "$APP_DATABASE_URL" -c "SELECT COUNT(*) FROM chain.decoded_events;"`
- Check database connection: `psql "$DATABASE_URL" -c "SELECT 1;"`

**Issue: NULL creators in daos**
- This should not happen (view includes LEFT JOIN protection)
- If it occurs, run: `SELECT * FROM manager.daos WHERE admin_address IS NULL;`
- Verify DaoCreated events are being processed

**Issue: High query latency**
- Check slow query log: See MONITORING.md
- Verify indexes are present: `psql ... -c "\d chain.decoded_events"`
- Analyze query plan: `EXPLAIN ANALYZE SELECT ...`

---

## Sign-Off

| Component | Verified By | Date | Signature |
|-----------|------------|------|-----------|
| Database Migrations | _____ | _____ | _____ |
| Goldsky Pipeline | _____ | _____ | _____ |
| Application Deploy | _____ | _____ | _____ |
| Health Checks | _____ | _____ | _____ |
| Monitoring Setup | _____ | _____ | _____ |

---

**Document Version**: 1.0
**Last Updated**: 2024-01-15
**Next Review**: After first production deployment
