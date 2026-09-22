# Mercury Retroshade Critical Bug Report: Indexing Failed Transactions

**Report Date:** 2026-08-21
**Reporter:** Stellar DAO Project
**Severity:** HIGH - Data Integrity Issue
**Status:** UNRESOLVED

---

## Executive Summary

Mercury Retroshade indexes contract events from **failed transactions** as if they were successful, resulting in unreliable data. This is a fundamental flaw that makes Mercury data untrustworthy without cross-referencing every transaction hash with Stellar RPC to verify success status.

---

## Problem Description

### What's Happening

Mercury Retroshade indexes **all contract events** emitted during transaction execution, regardless of whether the transaction ultimately succeeds or fails. This means:

1. **Events from failed transactions appear in Mercury tables** as if they were successful
2. **No field exists to distinguish successful vs. failed transactions** in indexed data
3. **Applications consuming Mercury data get incorrect information** about on-chain state

### Why This is Critical

Contract events emitted during a failed transaction are **meaningless** because:
- All state changes from failed transactions are rolled back by the Stellar network
- The events represent operations that **never actually happened** on-chain
- Consuming this data leads to incorrect application state, broken UIs, and misleading analytics

---

## Reproduction

### Test Case

**Network:** Stellar Testnet
**Contract:** `CC6NMFVKCHMRKFA7M333CVEFAVPLXT3XAZHZX6Q4SGNDNTKZEKWTLXT2` (NFT Token Contract)
**Failed Transaction:** `6754762b5e5f975ed1b972e8743624ef74db1c687a7dc905c37dbafacd245209`

### Steps to Reproduce

1. **Execute a contract call that fails:**
   ```bash
   # Transaction attempted to mint token ID 2 via batch_mint
   # Transaction hash: 6754762b5e5f975ed1b972e8743624ef74db1c687a7dc905c37dbafacd245209
   ```

2. **Verify transaction failed on-chain:**
   ```bash
   curl -X POST https://soroban-testnet.stellar.org \
     -H 'Content-Type: application/json' \
     -d '{
       "jsonrpc":"2.0",
       "id":1,
       "method":"getTransaction",
       "params":{"hash":"6754762b5e5f975ed1b972e8743624ef74db1c687a7dc905c37dbafacd245209"}
     }' | jq '.result.status'
   ```

   **Result:** `"FAILED"`

   **Error:** "trying to access contract data key outside of the footprint"

3. **Verify on-chain total supply:**
   ```bash
   stellar contract invoke \
     --id CC6NMFVKCHMRKFA7M333CVEFAVPLXT3XAZHZX6Q4SGNDNTKZEKWTLXT2 \
     --source-account GCLGEIQB4RCG63LSIBSHQ6T67YICWKTHSORNHVXHFVVGXISZU3MQU6CO \
     --network testnet \
     -- \
     get-total-supply
   ```

   **Result:** `"2"` (tokens 0 and 1 exist; token 2 does NOT exist)

4. **Check Mercury indexed data:**
   ```bash
   # Query Mercury for token mint events
   pnpm mercury:query --program 42 --table token_mint_indexed --order ledger --limit 10
   ```

   **Result:**
   ```
   _mercury_event_id                                                 token_id  transaction
   ----------------------------------------------------------------  --------  ----------------------------------------------------------------
   28a7ca38b4b5ab3a4896f6d5dac68b900df561c450cc202d3c1f2aac3d5ec58e  2         6754762b5e5f975ed1b972e8743624ef74db1c687a7dc905c37dbafacd245209
   f242ef07f439831c556decada233e5cb09fb4017017e1e94d327dfe356965225  0         f843037fc0e657383612b9e07b07e6be9c91b44eee3d5e18e9f8fd07d5325847
   2815cdd1784981bd0aa4479b2497202191c40713f7360c90df12f4bd82dfadb7  1         f843037fc0e657383612b9e07b07e6be9c91b44eee3d5e18e9f8fd07d5325847
   ```

   **Mercury shows 3 tokens** (including the failed mint of token ID 2)

### Data Comparison

| Source | Total Supply | Token IDs | Notes |
|--------|--------------|-----------|-------|
| **On-Chain (Truth)** | 2 | 0, 1 | Verified via contract call |
| **Mercury Index** | 3 | 0, 1, 2 | **INCORRECT** - includes failed transaction |

---

## Technical Details

### Why Events Are Emitted from Failed Transactions

In Stellar Soroban contracts, events are emitted **during contract execution**, before the transaction is finalized. The sequence is:

1. Transaction begins execution
2. Contract code runs
3. **Events are emitted** (contract publishes them)
4. Transaction validation occurs (footprint check, resource limits, etc.)
5. Transaction either succeeds or **fails**

If step 5 fails, all state changes are rolled back, but the events were already emitted in step 3.

### Transaction Details

**Failed Transaction:** `6754762b5e5f975ed1b972e8743624ef74db1c687a7dc905c37dbafacd245209`

**Operation:** `batch_mint` attempting to mint token ID 2

**Events Emitted (before failure):**
```json
{
  "events": {
    "transactionEventsXdr": [
      // delegate_changed event
      // mint event for token_id: 2
    ]
  }
}
```

**Failure Reason:**
```
"trying to access contract data key outside of the footprint"
```

**Diagnostic Events:**
```
"VM call trapped with HostError"
"error": "Escalating error to VM trap from failed host function call: put_contract_data"
```

The contract emitted a `mint` event for token ID 2, but then failed during storage operations. Mercury indexed the `mint` event, but **the mint never actually happened** because the transaction failed.

---

## Impact Analysis

### Current Issues

1. **Token Inventory Incorrect**
   - Mercury reports 3 tokens exist
   - On-chain only 2 tokens exist
   - Applications show wrong total supply and token ownership

2. **Activity Feeds Misleading**
   - Failed mints appear as successful operations
   - Users see "Token minted" for tokens that don't exist
   - Transaction history is inaccurate

3. **Members List Wrong**
   - Failed transfers may show tokens sent to addresses that never received them
   - Balance aggregations are incorrect

4. **Analytics Broken**
   - Metrics like "Total Minted" are inflated
   - Historical data is unreliable
   - Governance vote counts could be wrong (if failed vote events are indexed)

### Security Implications

- **Financial applications:** Wrong balance information could lead to incorrect payments
- **Governance systems:** Failed proposal or vote events could corrupt governance state
- **NFT marketplaces:** Showing tokens that don't exist, wrong ownership information
- **DeFi protocols:** Incorrect liquidity, wrong pool states

---

## Missing Mercury Data

Mercury indexed tables **do NOT include** any field to identify transaction success:

### Current Schema
```typescript
type MercuryTableRow = {
  _mercury_event_id?: string;
  contract_id?: string;
  ledger?: number;
  timestamp?: number;
  transaction?: string;  // Transaction hash only, no status
  // Event-specific fields (e.g., token_id, to, from, amount, etc.)
}
```

### What's Missing

**No field for:**
- `tx_successful` (boolean)
- `tx_status` ('SUCCESS' | 'FAILED')
- `tx_result` (XDR result data)
- Any way to filter out failed transactions

---

## Why Standard Workarounds Fail

### Attempted Solution: RPC Cross-Reference

We attempted to filter Mercury data by checking transaction status via Stellar RPC:

```typescript
// For each unique transaction hash from Mercury
const status = await fetch(rpcUrl, {
  method: 'POST',
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'getTransaction',
    params: { hash: txHash }
  })
});

// Filter out FAILED transactions
const validEvents = events.filter(e =>
  statusMap.get(e.transaction)?.status === 'SUCCESS'
);
```

### Why This Doesn't Work

1. **Performance:**
   - Mercury query: ~100ms for 1000 events
   - RPC calls: ~200ms per transaction × unique transaction count
   - Example: 1000 events with 500 unique transactions = **100 seconds of RPC calls**

2. **Scalability:**
   - Activity feeds fetch 50+ events
   - Token inventory scans 2000+ events
   - Each query now requires hundreds of additional RPC calls

3. **Rate Limiting:**
   - Public RPC endpoints have rate limits
   - Applications would hit limits immediately

4. **Defeats Mercury's Purpose:**
   - Mercury exists to **avoid** RPC calls
   - This workaround makes Mercury slower than direct RPC queries

5. **Cost:**
   - RPC providers charge per request
   - This multiplies API costs by 100x-1000x

---

## Required Solution

### Mercury Must Fix This

The fix needs to happen **at the Mercury indexing layer**, not in client applications.

### Option 1: Add Transaction Status Field (RECOMMENDED)

Modify Mercury Retroshade to include transaction status in indexed tables:

```typescript
type MercuryTableRow = {
  _mercury_event_id?: string;
  contract_id?: string;
  ledger?: number;
  timestamp?: number;
  transaction?: string;
  tx_successful: boolean;  // NEW FIELD
  // Event-specific fields
}
```

**Implementation:**
- During indexing, Mercury should call `getTransaction` for each transaction hash
- Store the `status` field from the RPC response
- Allow queries to filter: `WHERE tx_successful = true`

**SQL Example:**
```sql
SELECT * FROM retroshade.program_42_token_mint_indexed
WHERE tx_successful = true
ORDER BY ledger DESC
LIMIT 10
```

### Option 2: Don't Index Failed Transactions (ALSO GOOD)

Simply **don't index events from failed transactions at all:**

- During indexing, check transaction status before storing events
- Only index events where `status = 'SUCCESS'`
- Failed transactions never enter the database

**Advantages:**
- Simpler implementation
- Smaller database size
- No query changes needed
- Matches developer expectations (events from failed txs are meaningless)

### Option 3: Hybrid Approach

- Store all events (including failed transactions) for debugging purposes
- Add `tx_successful` field
- **Default behavior:** All queries auto-filter to `tx_successful = true`
- Opt-in parameter to include failed transactions for debugging: `?include_failed=true`

---

## Temporary Mitigation

Until Mercury fixes this, applications should:

### 1. Document the Limitation

Add warnings to UIs:
```tsx
<Alert variant="warning">
  Data shown is indexed by Mercury and may include events from failed
  transactions. For accurate balances, verify on-chain.
</Alert>
```

### 2. Verify Critical Data On-Chain

For important operations, always cross-check with contract calls:

```typescript
// Don't trust Mercury for balances
const mercuryBalance = getMercuryBalance(address);  // May be wrong
const actualBalance = await contractClient.balance({ account: address });  // Truth
```

### 3. Accept Display Inaccuracies

For non-critical displays (activity feeds, dashboards), accept that:
- Counts may be inflated
- Some events shown may be from failed transactions
- Historical data is approximate

### 4. Monitor for Anomalies

Compare Mercury totals with on-chain data periodically:

```bash
# On-chain truth
stellar contract invoke --id $TOKEN_CONTRACT -- get-total-supply

# Mercury index
curl "$MERCURY_API/token_mint_indexed" | jq 'length'

# If these don't match, investigate
```

---

## Recommendations

### For Mercury Team

1. **Priority Fix:** Add `tx_successful` field to all indexed tables
2. **Documentation:** Warn users about this limitation in current versions
3. **Migration Plan:** Provide a way to re-index existing data with transaction status
4. **API Update:** Add filter parameter for transaction success in queries

### For Application Developers

1. **Don't trust Mercury for critical data** (balances, ownership, governance state)
2. **Use on-chain verification** for any operation with financial or security impact
3. **Monitor for discrepancies** between Mercury and on-chain data
4. **Report specific cases** of failed transactions being indexed to help Mercury prioritize the fix

---

## Related Issues

- Events from failed transactions pollute all Mercury tables (token, governor, treasury, etc.)
- Affects all Stellar ecosystem projects using Mercury Retroshade
- Similar issue likely exists in other Stellar indexers if they don't filter by transaction status

---

## Appendices

### Appendix A: Failed Transaction Diagnostic Events

Full diagnostic events from failed transaction `6754762b5e5f975ed1b972e8743624ef74db1c687a7dc905c37dbafacd245209`:

```json
{
  "diagnosticEventsXdr": [
    "fn_call: batch_mint(to, to, [1])",
    "delegate_changed: from_delegate=none, to_delegate=to",
    "mint: token_id=2",
    "error: trying to access contract data key outside of the footprint",
    "error: Escalating error to VM trap from failed host function call: put_contract_data",
    "log: VM call trapped with HostError, batch_mint",
    "host_fn_failed"
  ]
}
```

The `mint` event was emitted, then the transaction failed trying to write contract data.

### Appendix B: Successful Transaction Comparison

Successful transaction `f843037fc0e657383612b9e07b07e6be9c91b44eee3d5e18e9f8fd07d5325847` that minted tokens 0 and 1:

```bash
curl -X POST https://soroban-testnet.stellar.org \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc":"2.0",
    "id":1,
    "method":"getTransaction",
    "params":{"hash":"f843037fc0e657383612b9e07b07e6be9c91b44eee3d5e18e9f8fd07d5325847"}
  }' | jq '.result.status'
```

**Result:** `"SUCCESS"`

This transaction's events were correctly indexed **and** the state changes persisted on-chain.

### Appendix C: Environment Details

```
Network: Stellar Testnet
RPC URL: https://soroban-testnet.stellar.org
Mercury URL: https://testnet.mercurydata.app/rest
Mercury Program ID: 42 (token)
Contract: CC6NMFVKCHMRKFA7M333CVEFAVPLXT3XAZHZX6Q4SGNDNTKZEKWTLXT2
Failed TX: 6754762b5e5f975ed1b972e8743624ef74db1c687a7dc905c37dbafacd245209
Success TX: f843037fc0e657383612b9e07b07e6be9c91b44eee3d5e18e9f8fd07d5325847
Ledger: 4244806 (failed), 4244804 (success)
```

---

## Contact

For questions about this report or to discuss solutions:
- GitHub: https://github.com/BuilderOSS/stellar-dao
- Related Project: Stellar DAO (Soroban-based governance system)

---

**End of Report**
