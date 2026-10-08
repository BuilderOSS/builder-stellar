# TTL and rent economics

Soroban charges rent for every ledger entry. An entry has a time-to-live (TTL) measured in ledgers.
When its TTL runs out the entry is **archived**: it is no longer readable or writable until someone
**restores** it (a paid transaction; see `stellar contract restore`). Extending the TTL before expiry
costs rent proportional to the entry's size times the extension length. Who pays depends on which
entry it is. This document covers the three kinds of state in this system and the operator tasks they
imply.

## Network limits (testnet, read with `stellar network settings`)

| Limit | Value | Meaning |
|---|---|---|
| `max_entry_ttl` | 3,110,400 ledgers (~180 days) | Longest TTL an entry can have. Longer extension requests are clamped to this. |
| `min_persistent_ttl` | 120,960 ledgers (~7 days) | Shortest TTL a persistent entry can be given. |
| `contract_max_size_bytes` | 131,072 (128 KiB) | Largest uploadable contract WASM. |

A "day" here is 17,280 ledgers (5 seconds per ledger). Every constant in the code below uses that.

## 1. Shared contract code (operator-paid)

Each module WASM is one code entry, shared by every DAO deployed from that hash. Extending it costs
rent for its whole size (about 6–7 XLM per KB for 170 days on testnet, measured).

| Contract | WASM size | Approx. cost to 170 days | Approx. cost to 30 days |
|---|---|---|---|
| total, all eight contracts (new code) | ~215 KB | ~1,350–1,400 XLM | (top-up only; see above) |

Measured on testnet: extending the 34 KB token code to 170 days cost **213 XLM**. The first
`create_dao` on a fresh hash paid **223 XLM**; the second paid **2.5 XLM** once the code was already
extended. Without operator pre-payment, the first DAO creator after the code expires pays the bill for
everyone, and an expired code entry must be restored before any call works.

**Decision (2026-10-08): operator pre-pays, targeting 30 days remaining.** The renewal sets each code
entry's TTL to at least 30 days from now. It only pays rent for the time it actually adds: an entry
that already has 170 days left costs nothing to "renew to 30 days" (its TTL is not shortened). So the
monthly job's cost is the top-up of whatever has fallen below 30 days, which is much less than a full
170-day extension. Measured on testnet on 2026-10-08: the eight-contract renewal cost 12.4 XLM, because
seven contracts still had ~170 days left and only the Minter (30 days left) needed a top-up.

Renew at least monthly. If the job runs more often, it costs even less, because it only pays for the
time that has actually passed.

Commands:

```bash
# renew all shared code of a deployment to 30 days (default)
node scripts/renew-code-ttl.mjs deploys/builder-testnet-manager.json
# or pick a length (max 170)
node scripts/renew-code-ttl.mjs deploys/builder-testnet-manager.json --days 30
```

`scripts/deploy-manager.mjs` pre-pays on deploy when `EXTEND_CODE_TTL_DAYS` is set.

If a renewal is missed and the code archives: restore it first with
`stellar contract restore --wasm-hash <hash>` (the restore is paid, and its cost is set by the same
rent rate; check the simulated fee before sending), then renew. Calls to the affected contracts fail
until restored.

## 2. Per-DAO contract instances (paid by the caller that touches them)

Each deployed contract's instance storage (its config, owner, Live flag, etc.) is extended by
`common::ttl::extend_instance` on every state-changing entrypoint:

- extend to **170 days** whenever fewer than **60 days** remain;
- so an active DAO is extended at most about once every 110 days, paid by whoever's transaction
  crosses the threshold (a few XLM at most for the instance, far below the code cost).

A DAO that is never touched for 170 days will archive. Its instance (owner, treasury, Live flag)
must then be restored before the DAO can be used again. Restoring is an ordinary restore transaction.

Persistent per-key entries have their own TTLs (values in the code, clamped by the network cap):

| Entry | Set in | TTL | Effective TTL |
|---|---|---|---|
| Manager registry records (`Implementation`, `UpgradeApproval`, `PendingAdmin`, `PlatformMinter`) | `contracts/manager/src/storage.rs` | extend to 365 days when below 30 | 180 days (network cap) |
| Auction pending refunds | `contracts/auction/src/storage.rs` | 365 days | 180 days |
| Marketplace listings (escrow of NFTs) | `contracts/marketplace/src/storage.rs` | 30 days | 30 days |
| Governor proposals | `contracts/governor/src/storage.rs` | 60 days | 60 days |
| Token delegations | `contracts/token/src/storage.rs` | 365 days (threshold 30) | 180 days |
| Metadata artwork entries (properties, items, IPFS groups) | `contracts/metadata/src/storage.rs` | 365 days | 180 days |
| Minter claim markers and allowlists | `contracts/minter/src/storage.rs` | 365 days | 180 days |

Entries whose TTL runs out are archived, and lose their contents until restored. Some of them are
security-relevant: an archived `PendingRefund` is a refund owed to a bidder that can't be claimed until
restored; an archived listing holds an NFT in escrow; an archived delegation changes voting power.
The code treats a missing entry as its default. This is only safe when the entry is restored, not
silently replaced, so the operator runbook below restores before anything else.

## 3. Artwork (operator or anyone may bump)

`metadata.bump_artwork_ttl(start, limit)` is permissionless: anyone may call it and pay its small
cost. It extends a window of at most 50 `(property, item)` entries plus IPFS groups per call, starting
at `start`, and returns the next start.

Artwork entries have an effective lifetime of about 180 days. A DAO's artwork must be bumped in windows
until the whole range is covered, at least once per ~110 days, otherwise the renderer's reads fail.

**Decision (2026-10-08): the web app triggers the bump.** When the artwork renders, the app walks the
artwork range with `bump_artwork_ttl` in windows of 50 (see §5 for the open UX question).

## Operator checklist

1. **Monthly:** `node scripts/renew-code-ttl.mjs deploys/<label>-<network>-manager.json` (cost is only the
   top-up below 30 days; about 12 XLM on testnet for the first run). Missing a month means restoring code
   before anything works.
2. **Continuously (automatic):** every state-changing contract call extends its instance; no action.
3. **Ongoing:** keep the web app's artwork bumps running; check that `bump_artwork_ttl` calls succeed.
4. **Quarterly:** check `stellar network settings` for changes to `max_entry_ttl`.
5. **If something archived:** restore the affected entry (`stellar contract restore --id <contract>`,
   or `--wasm-hash` for code, or `--key` for a persistent entry), then renew.

## Open questions

- **Scheduling the monthly renewal:** the script exists; it still needs a scheduler (cron or a
  scheduled agent) and an operator key on that machine.
- **Mainnet pricing:** the numbers above are testnet measurements. Mainnet rent rates must be measured
  before choosing the renewal length for production.
- **Protocol behavior:** this document assumes Soroban auto-restore on access is not relied on; the
  code must still be restored explicitly. Verify on the target network before launch.
