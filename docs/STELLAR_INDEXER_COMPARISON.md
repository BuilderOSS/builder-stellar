# Stellar Blockchain Indexing Options for DAO Factory

**Date:** August 2026
**Project:** Stellar DAO - Multi-DAO Factory Platform
**Purpose:** Comprehensive evaluation of blockchain indexing solutions for production deployment

---

## Executive Summary

### Our Requirements
- **Multi-contract architecture**: 5+ contracts per DAO (Governor, Token, Treasury, etc.)
- **Massive scale**: Support 100s to 1000s of DAO instances
- **Complex queries**: Cross-contract relational queries, aggregations, real-time updates
- **Development workflow**: **MUST support testnet** for development and testing
- **Data integrity**: Reliable, consistent data (critical for governance decisions)

### Top Recommendations

| Rank | Platform | Why | Status |
|------|----------|-----|--------|
| 🥇 | **Goldsky Turbo Pipelines** | Best overall fit - testnet support, TypeScript transforms, PostgreSQL, free tier, managed | ✅ Live |
| 🥈 | **OBSRVR Flow** | Stellar-native turnkey solution, testnet support, minimal DevOps | ⚠️ Private Beta |
| 🥉 | **Mercury Retroshades** | Ultra-fast, Stellar-optimized, requires contract SDK integration | ✅ Live |

### Key Finding: OnFinality Testnet Support

**Good News:** OnFinality **DOES** support Stellar testnet despite initial concerns. Both Horizon REST and Soroban JSON-RPC endpoints are available for testnet deployment.

---

## Platform-by-Platform Analysis

### 1. The Graph (Substreams for Stellar)

**Official Docs Description:**
> "One of the earliest and most popular-at-the-time options on Ethereum. They now offer three main products: Subgraphs, Token API, and Substreams. The Graph offers Stellar support for Substreams, with no current plans to expand Subgraph or Token API support to Stellar."

#### What You Get
- **Substreams ONLY** - Not the famous Subgraphs with built-in GraphQL
- Parallel blockchain indexing written in **Rust** (compiled to WASM)
- gRPC streaming of processed data
- 100x faster historical sync vs Subgraphs
- **YOU control** the database and API layer

#### What You DON'T Get
- ❌ No GraphQL API (you build it)
- ❌ No managed database (you host PostgreSQL)
- ❌ No AssemblyScript (must use Rust)

#### Architecture
```
Stellar Blockchain
       ↓ (gRPC stream)
  Substreams Module (Rust)
  [your transformation logic]
       ↓
   Your Database (PostgreSQL, etc.)
       ↓
   Your API (GraphQL, REST, etc.)
```

#### Custom Handlers
✅ **YES** - Write Rust modules for data processing
- Full control over transformation logic
- Access to complete block data
- Can aggregate across multiple contracts

#### Testnet Support
✅ **YES**
- Mainnet: `mainnet.stellar.streamingfast.io:443`
- Testnet: `testnet.stellar.streamingfast.io:443`

#### Pricing
- Currently **FREE** hosted service for Substreams
- Future: Query-based pricing when deployed to The Graph Network

#### Documentation
⭐⭐⭐⭐ Good - Comprehensive Substreams docs at thegraph.com/docs/en/supported-networks/stellar/

#### Pros
- ✅ Maximum flexibility and control
- ✅ 100x faster historical syncing
- ✅ Testnet support
- ✅ Free (for now)
- ✅ Handle thousands of contracts efficiently

#### Cons
- ❌ Requires Rust expertise (steep learning curve)
- ❌ Must build and host GraphQL API yourself
- ❌ Higher infrastructure complexity
- ❌ More DevOps overhead than managed solutions

#### Best For
- Teams with Rust developers
- Need for maximum performance and control
- Custom data pipeline requirements
- Budget-conscious projects with technical capacity

#### Not Good For
- Teams wanting turnkey GraphQL APIs
- JavaScript/TypeScript-only teams
- Projects needing fast time-to-market
- Teams without DevOps resources

---

### 2. Goldsky (Mirror & Turbo Pipelines)

**Official Docs Description:**
> "One of the currently-most-loved options on Ethereum for this use-case. Goldsky provides two main products: Subgraphs (EVM-only, no Stellar support) and Mirror/Pipelines (supports Stellar)."

#### What You Get
- **Real-time ETL** streaming blockchain data to your database
- **Turbo Pipelines**: Next-gen engine with TypeScript transforms
- Automatic reorg handling
- One-click deployment via interactive CLI
- Managed infrastructure

#### How It Works
```
Stellar Blockchain
       ↓
  Goldsky Mirror
  [extraction & decoding]
       ↓
  TypeScript Transforms
  [your custom logic]
       ↓
  Your Database
  (PostgreSQL, BigQuery, S3, Kafka, etc.)
```

#### Supported Destinations
- PostgreSQL (recommended for relational queries)
- BigQuery
- ClickHouse
- S3
- Kafka
- Timescale
- Elasticsearch
- MongoDB
- Redis
- Google Cloud Storage

#### Custom Transformations
✅ **YES** - TypeScript transforms in Turbo Pipelines
- Write custom logic to combine data across contracts
- Dynamic table creation
- Live inspect during development
- Job mode for historical processing

#### Testnet Support
✅ **YES** - Supports 140+ networks including testnets

#### Pricing
- **Starter Plan**: FREE with Mirror access
- **Scale Plan**: Pay-as-you-go
  - Metered hourly, billed monthly
  - Database hosting: storage + CPU hours × vCPUs
  - Events written charged separately
- **Enterprise Plan**: Custom contracts

#### Documentation
⭐⭐⭐⭐⭐ Excellent - docs.goldsky.com with detailed guides

#### Pros
- ✅ Stellar testnet confirmed working
- ✅ TypeScript (familiar to most web developers)
- ✅ Free tier for testing
- ✅ PostgreSQL for complex relational queries
- ✅ Managed service (minimal DevOps)
- ✅ Real-time with automatic reorg handling
- ✅ Wide database support
- ✅ Scales to thousands of contracts

#### Cons
- ❌ Vendor lock-in to Goldsky platform
- ❌ No self-hosting option
- ❌ Costs scale with usage
- ❌ Less control than self-hosted solutions

#### Best For
- **DAO factories** with multi-contract architecture
- Teams wanting managed service
- TypeScript/JavaScript developers
- Production applications needing reliability
- Projects needing PostgreSQL for complex queries

#### Not Good For
- Teams requiring self-hosting
- Extreme cost sensitivity (though free tier generous)
- Need for vendor independence

#### **Recommendation for Your Use Case: 🥇 TOP CHOICE**
Goldsky Turbo Pipelines is the best fit for your DAO factory because:
1. TypeScript transforms let you combine data from 5 contracts into unified tables
2. PostgreSQL destination enables complex relational queries
3. Testnet support for development workflow
4. Free tier to start, scalable pricing
5. Managed service reduces operational burden

---

### 3. Mercury (Classic vs Retroshades)

**Official Docs Description:**
> "A home-grown Stellar-native team providing streamlined Soroban support via their Retroshades product. Note that this streamlined Soroban support comes at the cost of only supporting Soroban! Mercury also provides Mercury 'Classic', giving access to contract events & Stellar transactions via a GraphQL interface."

#### Two Products

**Mercury Classic:**
- Traditional indexer with GraphQL interface
- Contract events + Stellar transactions
- Straightforward approach

**Mercury Retroshades** (Revolutionary):
- Indexing logic lives **inside your smart contracts**
- Uses modified Soroban VM fork running parallel to network
- Define custom events using runtime variables, contract functions
- Emit rich, structured data optimized for your queries
- Build indexers in minutes using Soroban (no new language)

#### How Retroshades Works
```
Your Soroban Contract
  + Mercury SDK
  [define custom events]
       ↓
Mercury Retroshades SVM
  [parallel execution]
       ↓
Mercury Database
  [optimized tables]
       ↓
GraphQL API
```

#### Custom Logic
✅ **YES** - In Retroshades, you write indexing logic in Soroban itself

**Example:**
```rust
// In your contract
#[mercury::retroshade]
fn emit_dao_metrics() {
    let total_voting_power = calculate_total();
    let active_proposals = count_active();

    mercury::emit_event(DaoMetrics {
        voting_power: total_voting_power,
        proposals: active_proposals,
        timestamp: env.ledger().timestamp()
    });
}
```

#### Known Limitation: Failed Transactions
⚠️ **Critical Issue**: Mercury indexes events from **failed transactions** as if they were successful.

**Example we discovered:**
- On-chain total supply: 2 tokens
- Mercury indexed: 3 tokens (included failed mint)
- See `MERCURY_BUG_REPORT.md` for full details

This is a **data integrity bug** that makes Mercury unreliable without cross-checking transaction status.

#### Testnet Support
✅ **YES** - Both testnet and mainnet

#### Pricing
⚠️ Not publicly listed - must contact Mercury team

#### Documentation
⭐⭐⭐ Growing - docs.mercurydata.app

#### Pros
- ✅ Stellar-native team (understands ecosystem)
- ✅ Ultra-fast, optimized queries
- ✅ Define indexing in familiar language (Soroban)
- ✅ Testnet support
- ✅ Soroban-first approach

#### Cons
- ❌ **Indexes failed transactions** (data integrity issue)
- ❌ Requires adding Mercury SDK to contracts
- ❌ Vendor lock-in (proprietary approach)
- ❌ Unknown pricing
- ❌ Separate program per contract (doesn't scale for DAO factory)
- ❌ Can't combine data across contracts into unified tables

#### Best For
- Single-contract applications
- Teams willing to integrate Mercury SDK
- Need for maximum query performance
- Soroban-centric teams

#### Not Good For
- **DAO factories** (can't combine multi-contract data)
- Production apps requiring data integrity
- Teams wanting vendor-independent solutions
- Cross-contract relational queries

#### **Recommendation for Your Use Case: ⚠️ Not Recommended**
Mercury's per-contract limitation and failed-transaction bug make it unsuitable for a DAO factory requiring cross-contract queries and data reliability.

---

### 4. OnFinality (SubQuery Hosting Provider)

**Official Docs Description:**
> "A big player in the Polkadot ecosystem, now expanding to other blockchains. OnFinality provides data hosting services for your SubQuery logic. SubQuery is the software, OnFinality is the infra."

#### What OnFinality Provides
1. **RPC Endpoints**: Horizon REST + Soroban JSON-RPC for Stellar
2. **SubQuery Hosting**: Managed deployment of SubQuery indexers
3. **Infrastructure**: Storage for raw data, ETL processors, and transformed data

#### Stellar Support Status
✅ **Mainnet**: SUPPORTED
✅ **Testnet**: SUPPORTED (Both Horizon and Soroban RPC)

**Update:** Initial concern about testnet support was incorrect - OnFinality **does** provide testnet endpoints.

#### SubQuery Architecture
```
Stellar RPC (via OnFinality)
       ↓
  SubQuery Node
  [TypeScript handlers]
       ↓
  PostgreSQL (OnFinality hosted)
       ↓
  GraphQL API (auto-generated)
```

#### Features via SubQuery
- GraphQL schema-first design
- TypeScript mappings/handlers
- Auto-generated GraphQL API with subscriptions
- Multi-contract indexing in single project
- Cross-contract relational queries

#### Pricing
- Free tier with public endpoints
- Scalable from shared to dedicated nodes
- 99.99% uptime SLA on paid tiers
- Specific pricing tiers not publicly listed

#### Documentation
⭐⭐⭐⭐ Good - academy.subquery.network

#### Pros
- ✅ Testnet support (confirmed)
- ✅ Managed hosting (no infrastructure management)
- ✅ One-click deployment
- ✅ Auto-scaling
- ✅ TypeScript (familiar language)
- ✅ GraphQL API with subscriptions
- ✅ Multi-contract support in single project

#### Cons
- ❌ Vendor lock-in to OnFinality platform
- ❌ Less flexible than self-hosted SubQuery
- ❌ Pricing not transparent

#### Best For
- Teams wanting managed SubQuery
- Need for GraphQL APIs
- TypeScript developers
- Projects needing auto-scaling

#### Not Good For
- Teams requiring self-hosting
- Extreme cost sensitivity
- Need for maximum control

#### **Recommendation for Your Use Case: ✅ Viable Option**
OnFinality-hosted SubQuery is a good managed alternative, especially now that testnet support is confirmed. However, Goldsky offers more mature features and transparent pricing.

---

### 5. Allium

**Official Docs Description:**
> "In addition to their Portfolio APIs offering, Allium is also under contract with SDF to build out tools for Indexing Use Case #2, with target launch date of Q1 2026."

#### Current Status (August 2026)
⚠️ **Status Unclear** - Announced Q1 2026 launch, but no confirmation of availability

#### What They're Building
- Enterprise-grade blockchain data solutions
- Audit-grade historical and real-time data
- Based on their 150+ chain offering: likely data warehouse/analytics

#### Expected Features
- BigQuery-style data warehouse
- SQL queries over blockchain data
- Real-time and historical data
- Enterprise integrations

#### Company Background
- $56.5M total funding ($40M Series B)
- Serves Coinbase, Visa, Uniswap
- Institutional-grade provider

#### Testnet Support
❓ Unknown - need to verify with Allium

#### Pricing
⚠️ Not announced for Stellar
- Likely **enterprise-premium pricing**
- Serves institutional customers

#### Documentation
⏳ Pending Stellar launch

#### Pros
- ✅ SDF partnership (official support)
- ✅ Enterprise-grade infrastructure
- ✅ Proven with major clients
- ✅ Audit-grade data quality

#### Cons
- ❌ Status unclear (may not be launched yet)
- ❌ Likely expensive (enterprise-focused)
- ❌ Testnet support unknown
- ❌ No public documentation yet

#### Best For
- Enterprise applications
- Institutional users
- Analytics and data warehousing
- Projects with large budgets

#### Not Good For
- Startups and indie developers
- Budget-conscious projects
- Need for immediate availability
- Testing and development (if no testnet)

#### **Recommendation for Your Use Case: ⏳ Wait and See**
Too much uncertainty about availability, pricing, and testnet support. Monitor for launch announcements.

---

### 6. Space and Time

**Official Docs Description:**
> "One challenge with most indexing approaches is the reintroduction of trusted 3rd parties into what is otherwise a verifiable, trustless software stack. Space and Time aims to fix this with 'Proof of Indexing' and 'Proof of SQL', using Zero-Knowledge proofs to offer tamper-proof computation."

#### Launch Status
✅ **LIVE** - Launched October 2025 (Q4 2025)

#### What Makes It Unique

**Proof of SQL:**
- Novel **Zero-Knowledge circuit** verifying SQL query accuracy
- Cryptographic proof that results are tamper-proof
- Powered by NVIDIA accelerated computing
- Sub-second proving for queries against 1M+ rows

**How ZK Proofs Work:**
1. Data indexed from Stellar blockchain
2. SQL queries run against indexed data
3. ZK proof generated proving correctness
4. Users get verifiable, tamper-proof results

#### Why ZK Proofs Matter
- **Trustless verification**: Don't trust the indexer, verify cryptographically
- **Compliance**: Audit-grade data for enterprises
- **Tamper-proof**: Mathematical guarantee of data integrity

#### Query Interface
- Standard SQL queries
- Natural language queries (converts to SQL)
- No GraphQL (SQL-first approach)

#### Testnet Support
❓ **Unknown** - Likely mainnet-focused for enterprise use

#### Pricing
⚠️ Not publicly listed - Enterprise-focused product

#### Documentation
⭐⭐⭐⭐ Good - docs.spaceandtime.io

#### Pros
- ✅ Unique ZK-proof verification
- ✅ Trustless computation (no 3rd party trust)
- ✅ Enterprise-grade security
- ✅ SQL interface (familiar)
- ✅ Tamper-proof results

#### Cons
- ❌ Testnet support unclear
- ❌ Enterprise pricing (likely expensive)
- ❌ Overkill for most dapps
- ❌ ZK proving adds latency (though sub-second)

#### Best For
- Compliance-sensitive applications
- Financial institutions
- Auditing and verification
- Projects requiring provable data integrity

#### Not Good For
- Typical dapps (ZK overhead unnecessary)
- Budget-conscious projects
- Development/testing (if no testnet)
- Real-time queries (ZK proving adds latency)

#### **Recommendation for Your Use Case: ❌ Not Recommended**
ZK proofs are overkill for a DAO factory. The added cost and complexity aren't justified unless you have specific compliance requirements. Testnet support is also unclear.

---

### 7. OBSRVR Flow

**Official Docs Description:**
> "Structured ledger data and contract events straight to your app or warehouse—no ETL needed. Currently in private beta."

#### Current Status
⚠️ **Private Beta** - Requires invitation and subscription

#### How to Get Access
1. Sign up at withobsrvr.com
2. Join Flow waitlist
3. Await approval
4. Activate subscription once approved

#### What "No ETL Needed" Means
- OBSRVR handles all data extraction and structuring
- Pre-processed blockchain data arrives ready-to-use
- Define what data you want via pipeline configuration
- One-click deployment

#### Architecture
```
Stellar Blockchain
       ↓
  OBSRVR Flow
  [extraction & structuring]
       ↓
  Your Destination
  (PostgreSQL, Redis, S3, Kafka, etc.)
```

#### Supported Destinations
- PostgreSQL
- Redis
- MongoDB
- S3
- Kafka
- Google Cloud Storage
- Webhooks
- DuckDB

#### Features
- Start from any ledger (genesis or latest)
- Real-time monitoring + historical analysis
- Production-ready without DevOps
- Auto-scaling and orchestration
- Stellar RPC with full history for testnet

#### Stellar Support
✅ **YES** - Stellar-native offering (built specifically for Stellar/Soroban)

#### Testnet Support
✅ **YES** - Explicitly provides testnet RPC and data

#### Pricing
**$0.003/minute** during active subscription
- Pay-as-you-go metering
- Clear, transparent pricing

#### Documentation
⭐⭐⭐ Good - docs.withobsrvr.com

#### Pros
- ✅ Stellar-native (optimized for ecosystem)
- ✅ Testnet support confirmed
- ✅ No ETL pipeline building
- ✅ Multiple destination options (PostgreSQL ideal)
- ✅ Real-time + historical
- ✅ Start from any ledger
- ✅ Transparent pricing
- ✅ Minimal DevOps overhead

#### Cons
- ❌ Private beta (may have waitlist)
- ❌ Newer platform (less battle-tested)
- ❌ Pricing adds up ($129.60/month at constant use)
- ❌ Unknown if supports complex transformations like Goldsky

#### Best For
- Stellar-first teams
- Turnkey solution seekers
- PostgreSQL + real-time needs
- Teams willing to join beta

#### Not Good For
- Projects needing immediate access (beta waitlist)
- Teams on very tight budgets
- Need for proven, battle-tested platform

#### **Recommendation for Your Use Case: 🥈 Strong Alternative**
If you can get beta access, OBSRVR Flow is a compelling Stellar-native option. The testnet support and PostgreSQL destination make it suitable for your DAO factory. However, Goldsky is more proven and likely more feature-rich for complex transformations.

---

### 8. SubQuery Self-Hosted

#### What SubQuery Offers
- Open-source indexing framework
- GraphQL schema-first design
- TypeScript handlers for data transformation
- Auto-generated GraphQL API with subscriptions
- Multi-contract support in single project

#### Deployment Requirements

**Core Components:**
- Docker (recommended) OR Node.js services
- PostgreSQL database
- SubQuery node software
- Query service

**Infrastructure:**
- Linux/MacOS/Windows with Docker
- Sufficient storage for blockchain data
- Network connectivity to Stellar RPC
- **Private RPC endpoint** (see testnet limitation below)

#### Testnet Support
⚠️ **YES, but Challenging**

**The Problem:**
- Public Stellar testnet Horizon endpoint has **very strict rate limits**
- Continuous indexing "difficult or impossible without private endpoint"
- Default config frequently hits HTTP 429 rate limit errors

**The Solution:**
- Need **dedicated/private RPC endpoint** for reliable testnet indexing
- Options:
  1. Pay for dedicated endpoint (OnFinality, etc.)
  2. Run your own Stellar Horizon node (significant infrastructure)

#### Operational Complexity

**Medium-High:**

**DevOps Tasks:**
- Managing tooling quirks per network
- Infrastructure maintenance
- Handling rate limiting on public endpoints
- Blue/green deployments (manual setup)
- Monitoring and alerting
- Database optimization
- Scaling as query volume grows

**Skills Needed:**
- Docker/containerization
- PostgreSQL database administration
- Node.js (if not using Docker)
- Infrastructure management
- Network engineering
- Monitoring/alerting setup

#### Cost (Infrastructure Only)

**Monthly Estimates:**
- PostgreSQL hosting: $10-100+ (scales with data volume)
- Server/VPS: $20-200+ (scales with compute needs)
- Private RPC endpoint: $50-500+ (or DIY Horizon node)
- **Total: $80-800+/month** (not including engineer time)

**Hidden Costs:**
- Engineer time for setup and maintenance
- Opportunity cost vs building features
- Debugging and troubleshooting

#### Monitoring/Debugging

**DIY Setup Required:**
- Prometheus/Grafana for metrics
- ELK stack or similar for log aggregation
- Alerting (PagerDuty, etc.)
- Custom dashboards

SubQuery provides logging, but sophisticated monitoring requires manual setup.

#### Scaling Considerations

**Vertical Scaling:**
- Increase server CPU/RAM
- Upgrade PostgreSQL instance
- Simple but limited

**Horizontal Scaling:**
- Multiple query nodes
- Requires load balancing
- PostgreSQL replication/sharding
- More complex, requires expertise

#### Pros
- ✅ Full control over infrastructure
- ✅ No vendor lock-in
- ✅ No usage-based fees (just infrastructure)
- ✅ Open source (GPL v3)
- ✅ Can customize deeply
- ✅ Multi-contract support
- ✅ GraphQL with subscriptions

#### Cons
- ❌ Significant DevOps burden
- ❌ Testnet requires private RPC (added cost)
- ❌ Higher maintenance than managed
- ❌ Need in-house expertise
- ❌ Less sophisticated tooling vs managed platforms
- ❌ Rate limiting on public endpoints
- ❌ Manual scaling and optimization

#### Best For
- Teams with strong DevOps capabilities
- Need for full control
- Vendor independence priority
- Long-term projects justifying setup investment
- Teams already running infrastructure

#### Not Good For
- Small teams or solo developers
- Projects wanting fast time-to-market
- Teams without DevOps expertise
- Budget constraints (engineer time expensive)
- Need for managed support

#### **Recommendation for Your Use Case: ⚠️ Viable but Not Ideal**

Self-hosting SubQuery **can work** for your DAO factory, but:

**Challenges:**
- Testnet rate limiting requires paid private endpoint (eliminates cost advantage)
- DevOps overhead significant at 1000+ DAO scale
- Monitoring and maintenance burden

**When to Consider:**
- You have strong DevOps team already
- You're building long-term infrastructure
- Vendor independence is critical
- You can afford private RPC endpoints

**Better Options:**
- Goldsky (managed, TypeScript, free tier)
- OBSRVR Flow (Stellar-native, turnkey)
- OnFinality-hosted SubQuery (managed SubQuery, less overhead)

---

## Comprehensive Comparison Matrix

| Feature | Goldsky Turbo | OBSRVR Flow | The Graph | SubQuery Self | OnFinality | Mercury | Allium | Space & Time |
|---------|---------------|-------------|-----------|---------------|------------|---------|--------|--------------|
| **Testnet** | ✅ Yes | ✅ Yes | ✅ Yes | ⚠️ Rate limits | ✅ Yes | ✅ Yes | ❓ Unknown | ❓ Unknown |
| **Multi-Contract** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No | ✅ Likely | ✅ Yes |
| **Custom Logic** | ✅ TypeScript | ⚠️ Pipelines | ✅ Rust | ✅ TypeScript | ✅ TypeScript | ✅ In-contract | ❓ Unknown | ✅ SQL |
| **GraphQL API** | ❌ No | ❌ No | ❌ No (DIY) | ✅ Yes | ✅ Yes | ✅ Yes | ❓ Unknown | ❌ SQL only |
| **Managed Hosting** | ✅ Yes | ✅ Yes | ⚠️ Partial | ❌ DIY | ✅ Yes | ✅ Yes | ✅ Likely | ✅ Yes |
| **PostgreSQL** | ✅ Destination | ✅ Destination | ⚠️ DIY | ✅ Built-in | ✅ Built-in | ❌ Proprietary | ✅ Likely | ❌ Proprietary |
| **Pricing** | Free tier + usage | $0.003/min | Free (for now) | Infra only | Tiered | Unknown | Enterprise | Enterprise |
| **Status** | ✅ Live | ⚠️ Private Beta | ✅ Live | ✅ Live | ✅ Live | ✅ Live | ⏳ Unclear | ✅ Live |
| **Data Integrity** | ✅ Reliable | ✅ Reliable | ✅ Reliable | ✅ Reliable | ✅ Reliable | ❌ Failed TXs | ❓ Unknown | ✅ ZK-proven |
| **DevOps Burden** | Low | Low | High | High | Low | Low | Low | Low |
| **Vendor Lock-in** | Medium | Medium | Low | None | Medium | High | High | High |

---

## Top Recommendations (Ranked)

### 🥇 **1. Goldsky Turbo Pipelines** - Best Overall

**Why It's #1:**
1. **Testnet support** - Critical for development workflow ✅
2. **TypeScript transforms** - Combine data from 5 contracts into unified tables ✅
3. **PostgreSQL destination** - Complex relational queries, aggregations ✅
4. **Free tier** - Test before committing budget ✅
5. **Managed service** - Low DevOps overhead ✅
6. **Proven at scale** - "Most loved" on Ethereum, handles 1000s of contracts ✅
7. **Real-time** - Automatic reorg handling ✅

**For Your DAO Factory:**
```javascript
// Goldsky TypeScript Transform
// Combine Governor + Token + Treasury data
export default function transform(events) {
  const proposals = events.filter(e => e.topic === 'proposal_created');
  const votes = events.filter(e => e.topic === 'vote_cast');
  const mints = events.filter(e => e.topic === 'mint');

  // Create unified DAO state
  return {
    dao_id: extractDaoId(events[0].contract),
    proposals: proposals.map(enrichProposal),
    members: aggregateMembers(mints),
    votes: votes.map(enrichVote)
  };
}
```

**Estimated Cost:**
- Development (free tier): $0
- Production (100 DAOs): ~$50-100/month
- Production (1000 DAOs): ~$200-500/month

**Next Steps:**
1. Sign up for free tier
2. Set up testnet pipeline
3. Test with 3-5 contracts (governor, token, treasury)
4. Measure performance and query capability
5. Evaluate cost at scale

---

### 🥈 **2. OBSRVR Flow** - Stellar-Native Alternative

**Why It's #2:**
1. **Stellar-native** - Built specifically for Stellar/Soroban ✅
2. **Testnet support** - Explicit testnet RPC with full history ✅
3. **No ETL** - Turnkey solution, minimal DevOps ✅
4. **PostgreSQL** - Relational queries ✅
5. **Transparent pricing** - $0.003/min = ~$130/month ✅
6. **Real-time + historical** - Start from any ledger ✅

**Concerns:**
- Private beta (may have waitlist)
- Less proven than Goldsky
- Unknown if transformations as powerful as Goldsky's TypeScript

**Estimated Cost:**
- $129.60/month at constant operation
- Scales with active indexing time

**Next Steps:**
1. Join waitlist at withobsrvr.com
2. Once approved, test on testnet
3. Compare transformation capabilities vs Goldsky
4. Evaluate if Stellar-specific optimizations provide advantages

---

### 🥉 **3. OnFinality (SubQuery Hosting)** - Managed SubQuery

**Why It's #3:**
1. **Testnet support** - Confirmed working (initial concern resolved) ✅
2. **TypeScript handlers** - Familiar language ✅
3. **GraphQL API** - Auto-generated with subscriptions ✅
4. **Multi-contract** - Single project for all 5 contracts ✅
5. **Managed** - One-click deployment, auto-scaling ✅
6. **99.99% SLA** - Production-grade reliability ✅

**Why Not #1:**
- Less transparent pricing than Goldsky
- Goldsky's Turbo Pipelines more mature for ETL
- OnFinality more focused on query endpoints than transformation pipelines

**Estimated Cost:**
- Unknown - need to contact OnFinality
- Likely comparable to Goldsky

**Next Steps:**
1. Contact OnFinality for pricing
2. Compare with Goldsky free tier results
3. Use if GraphQL subscriptions critical to your architecture

---

## Alternative Considerations

### **Mercury Retroshades** - Only If...
Consider ONLY if:
- You're willing to modify all contracts with Mercury SDK
- You can accept per-contract data silos (no cross-contract queries)
- Ultra-fast queries more important than data integrity
- You're okay with failed transaction bug

**Verdict:** ❌ Not suitable for DAO factory architecture

---

### **The Graph Substreams** - For Advanced Teams
Consider if:
- You have Rust developers on team
- Maximum control/flexibility required
- Budget for infrastructure but not managed services
- Willing to build custom GraphQL layer

**Verdict:** ⚠️ Viable but high complexity for your needs

---

### **SubQuery Self-Hosted** - For Control Freaks
Consider if:
- Strong DevOps team already in place
- Vendor independence critical
- Can afford private RPC endpoints
- Long-term infrastructure investment

**Verdict:** ⚠️ Viable but Goldsky/OBSRVR easier

---

### **Space and Time** - For Compliance-Heavy Use Cases
Consider if:
- Regulatory compliance requires ZK-proven data
- Institutional/enterprise application
- Budget for premium pricing
- Testnet not critical (mainnet-only acceptable)

**Verdict:** ❌ Overkill for DAO factory

---

### **Allium** - Wait and See
**Verdict:** ⏳ Monitor for launch, but don't wait - use Goldsky now

---

## Testing Strategy

### Phase 1: Quick Validation (Week 1-2)

**Goldsky Free Tier:**
1. Sign up for Goldsky account
2. Create testnet pipeline
3. Index 3 contracts: Governor, Token, Treasury
4. Write TypeScript transforms combining data
5. Test queries against PostgreSQL destination
6. Create sample DAO dashboards

**Success Criteria:**
- Can combine data from multiple contracts ✅
- Complex relational queries work ✅
- Real-time updates functioning ✅
- Performance acceptable for 10 test DAOs ✅

### Phase 2: Parallel Evaluation (Week 2-3)

**If Goldsky passes Phase 1:**

**OBSRVR Flow (if beta access granted):**
1. Join waitlist, await approval
2. Set up similar pipeline on testnet
3. Compare ease of use vs Goldsky
4. Test PostgreSQL query performance
5. Evaluate transformation capabilities

**OnFinality (optional):**
1. Request pricing information
2. If comparable to Goldsky, test deployment
3. Compare GraphQL API quality
4. Evaluate subscription features

### Phase 3: Scale Testing (Week 3-4)

**Winner from Phase 1-2:**
1. Index 50 test DAOs (250 contracts)
2. Measure indexing speed and resource usage
3. Test query performance at scale
4. Simulate 1000 DAOs (estimate costs)
5. Load test with concurrent queries

**Success Criteria:**
- Handles 50 DAOs without issues ✅
- Query latency acceptable (<500ms) ✅
- Cost projections reasonable for 1000 DAOs ✅
- Real-time updates don't lag ✅

### Phase 4: Production Pilot (Week 4-6)

1. Deploy to mainnet with 5-10 real DAOs
2. Monitor for 2 weeks
3. Gather team feedback on developer experience
4. Evaluate actual costs vs estimates
5. Make final decision

---

## Key Decision Factors

### Must-Haves
- ✅ Stellar testnet support (non-negotiable)
- ✅ Multi-contract indexing in single project
- ✅ Complex relational queries (cross-contract JOINs)
- ✅ Real-time updates
- ✅ Reliable data (no failed transaction indexing)

### Important
- TypeScript/JavaScript developer experience
- Managed service (minimize DevOps)
- Clear pricing model
- PostgreSQL or similar relational database
- Auto-scaling for 1000s of DAOs

### Nice-to-Have
- GraphQL API (can build REST if needed)
- WebSocket subscriptions
- Free tier for testing
- Stellar-native optimizations
- ZK proofs (only if compliance-critical)

---

## Final Recommendation

### **Start with Goldsky Turbo Pipelines**

**Reasoning:**
1. Meets all must-haves and most important requirements
2. Free tier enables risk-free testing
3. TypeScript familiar to team
4. Proven at scale on other chains
5. Testnet support confirmed
6. Can migrate if needed (PostgreSQL standard)

**Backup Plan:**
If Goldsky doesn't meet needs in testing:
1. **OBSRVR Flow** (if beta access) - Stellar-native alternative
2. **OnFinality SubQuery** - Managed GraphQL option
3. **Self-hosted SubQuery** - If vendor independence critical

### **Do NOT Use:**
- ❌ Mercury Retroshades - Can't combine multi-contract data, data integrity issues
- ❌ Space and Time - Overkill, unknown testnet support
- ❌ Allium - Availability unclear, likely too expensive

### **Timeline:**
- Week 1-2: Goldsky testing on testnet
- Week 2-3: OBSRVR Flow comparison (if available)
- Week 3-4: Scale testing with winner
- Week 4-6: Production pilot
- Week 6: Final decision and full deployment

---

## Appendix: Mercury Data Integrity Issue

During our evaluation, we discovered a **critical bug in Mercury Retroshades**:

**Problem:** Mercury indexes events from failed transactions as if they were successful.

**Evidence:**
- Transaction `6754762...` failed with "storage footprint violation"
- Contract emitted `mint` event for token ID 2 before failing
- Mercury indexed the event
- On-chain: 2 tokens exist (IDs 0, 1)
- Mercury: 3 mint events indexed (including failed token ID 2)

**Impact:**
- Token inventory incorrect
- Activity feeds show phantom operations
- Analytics inflated
- Governance vote counts potentially wrong

**Root Cause:**
- Contracts emit events during execution
- Transaction fails after events emitted
- Mercury indexes all events regardless of transaction status
- No `tx_success` field in Mercury tables

**Mercury's Response:** Unknown - bug report filed

**For Full Details:** See `MERCURY_BUG_REPORT.md` in project root

**Conclusion:** Do not use Mercury for production without verifying all transaction statuses via RPC (defeating the purpose of an indexer).

---

## Resources

- **Goldsky**: https://goldsky.com / docs.goldsky.com
- **OBSRVR**: https://withobsrvr.com / docs.withobsrvr.com
- **The Graph**: https://thegraph.com/docs/en/supported-networks/stellar/
- **SubQuery**: https://academy.subquery.network
- **OnFinality**: https://onfinality.io
- **Mercury**: https://mercurydata.app / docs.mercurydata.app
- **Space and Time**: https://spaceandtime.io
- **Stellar Docs**: https://developers.stellar.org

---

**Document Version:** 1.0
**Last Updated:** August 21, 2026
**Prepared By:** Stellar DAO Team
**Status:** Ready for Team Review
