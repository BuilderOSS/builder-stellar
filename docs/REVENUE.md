# Revenue: paying for the platform

Status: PROPOSED (2026-10-13). Nothing here is implemented. Builds on
[membership-models](designs/membership-models.md) (modules, allowances, ClaimMinter, pools, the assurance launch),
[savings-circle](designs/savings-circle.md) and [locked-tokens](designs/locked-tokens.md). Testnet rent figures come
from [STORAGE_COSTS](STORAGE_COSTS.md) and [TTL_ECONOMICS](TTL_ECONOMICS.md); mainnet figures are measured below.

Tribe Builder cannot be free. The platform keeps every contract's code alive on Stellar for every DAO, and it runs the
indexer, database and web app that make DAOs discoverable. This page says what that costs today, how Tribe Builder earns
it without taking back power over launched DAOs, and in what order to build it.

## Decisions

| ID | Decision | Why |
|---|---|---|
| RV-1 | A protocol fee of **2.5%** on money that buys membership: auction settlement, pool sales, paid claims and secondary sales. No client referral share yet. | Matches Nouns Builder's protocol share, so the number needs no defence. A referral split only matters once a second client exists. |
| RV-2 | **The Circle pays no protocol fee**: not on dues, savings, loans, interest or donations. | The pot belongs to the members and interest is their own return. A cut would also put the platform inside a savings-and-lending flow, a regulatory risk in most places Circles would run. |
| RV-3 | Fee terms are **fixed when a module is created**. The rate is a compiled constant; the recipient is copied from the Manager into the module's instance. Only the DAO's own upgrade vote changes either. | membership-models removed every platform lever over a launched DAO. A fee the Manager admin could change at runtime would bring one back. |
| RV-4 | The fee recipient is a **contract**, never a wallet. | A contract holds any Stellar asset without a trustline, so a fee transfer cannot make a sale fail. |
| RV-5 | A security release **never raises the fee**. | Otherwise a DAO could be forced to accept a fee increase to get a fix. Recorded in CONTRACT_UPGRADES when implemented. |

## What it costs today

Measured 2026-10-13. USD at **$0.20 per XLM** (Coinbase and Crypto.com, 12–13 Oct 2026; 52-week range $0.14–$0.35).

### Stellar rent: mainnet is at the network's minimum price

Since protocol 23 the rent price per KB follows how much contract state the network holds. Read from
`stellar network settings --internal` on both networks, and checked against `compute_rent_write_fee_per_1kb` in
`soroban-env-host` 27.0.1 (`src/fees.rs`):

| | Mainnet | Testnet |
|---|---|---|
| Contract state held / target | 1.63 GB / 3.0 GB (54%) | 3.52 GB / 4.0 GB (88%) |
| Rent price per KB | **1,000 stroops (the floor, `MINIMUM_RENT_WRITE_FEE_PER_1KB`)** | 6,781 stroops |
| Contract data, per KB per year | **0.52 XLM** | 3.52 XLM |
| Contract code, per KB of WASM per year | **2.72 XLM** | 18.46 XLM |

Code costs about 5.2 times data per byte (measured on testnet 2026-10-12: 514 against 98 stroops per byte-day); the
same ratio is applied to mainnet. Mainnet leaves the floor once it holds 2.0 GB, and rent then rises linearly; at
testnet's occupancy it would be 6.8 times today's price. The `stellar` CLI used (28.0.0) warned that the network runs
protocol 29, so re-read the settings with a current CLI before quoting a price.

### The platform's bill

| Cost | Size | Per year | Per year, USD |
|---|---|---|---|
| Contract code, 8 contracts after membership-models (measured: `feat/membership-models` 089d259 release build) | 301,748 bytes | 802 XLM | $160 |
| Plus the Circle (**estimated** 35–60 KB, not written yet) | | 95–165 XLM | $20–33 |
| Code, latest and previous version of each | | ~1,800–1,930 XLM | **~$360–385** |
| Same, if mainnet rent rises to testnet's level | | ~12,200–13,100 XLM | ~$2,430–2,620 |
| Goldsky (indexer pipelines) | | | **~$1,200** ($100/month today, owner; grows with communities) |
| Vercel (web app) | | | **$720** ($60/month, owner) |
| Neon (read-model database) | free plan; ~165 compute-hours/month at the measured pace | | $0 today; ~$210 on the paid plan |
| RPC provider, IPFS pinning | | | not included; add when known |
| **Total** | | | **~$2,300–2,500 today** (~$4,600 if mainnet rent climbs) |

**Goldsky is about half of the bill, Vercel about a third, Stellar rent about 15%.** Goldsky is also the line that
grows with communities: more DAOs means more events indexed. The question that decides whether Tribe Builder pays for
itself at scale is whether the indexer's cost per community stays below the fees a community brings (see Unit
economics).

### What DAOs and members pay (mainnet, today)

| Who | What | Per year |
|---|---|---|
| Reference DAO (500 tokens, 304 artwork items) | its renewal sweep, 32 KB | ~17 XLM ($3.30) |
| Circle with 30 members | members and pages in the sweep, ~5 KB | ~3 XLM ($0.50) |
| Circle with 1,000 members | ~130 KB | ~67 XLM ($13) |
| A member | their own records, renewed when they act | a fraction of a cent |

On testnet multiply by 6.8. Rent is not a reason for a DAO to avoid Tribe Builder.

## Revenue lines

### 1. Protocol fee on money that buys membership (RV-1, RV-3)

| Money-in path | Fee | Rest goes to |
|---|---|---|
| Auction settlement with a winning bid | 2.5% of the winning bid | Treasury |
| Auction settlement with no bid | none | |
| Pool sale (`buy_from_pool`) | 2.5% of the price | Treasury |
| Paid claim after launch (`claim` with `price > 0`) | 2.5% of `price × mint_now` | Treasury |
| Assurance drive | none at `claim` (escrow holds 100%); 2.5% of the escrow in `release` | Treasury at launch |
| Assurance refund | none; `refund` returns 100% | the buyer |
| Secondary sale (`buy`) | 2.5% of the price, on top of the DAO's own fee | seller and Treasury, as today |
| Free claims, founder mints, Circle `join` | none | |

The assurance drive is all or nothing: a community pays only if it launches.

A DAO can avoid the fee by registering its own sale module by vote. That is intended: Tribe Builder is an open protocol.
The fee is the price of using maintained, renewable, indexed modules, and should stay low enough that writing your
own is not worth it.

### 2. Creation fee

A flat XLM amount paid at `create_dao` to the fee recipient, set by the Manager admin and capped by
`common::MAX_CREATION_FEE`. A platform-set price is fine here because no DAO exists yet and the creator sees the
price before signing. It also discourages claiming slugs with throwaway DAOs. `create_module` after launch stays
free: attaching a module is a DAO growing, not a new customer. Suggested 50 XLM (~$10); OQ-4.

### 3. Managed renewal

A DAO that does not want to remember renewals pays the platform yearly by proposal, and the platform's keeper runs
the one-click sweep (`scripts/renew-dao.mjs`) and restores archived entries. The Treasury cannot sign a renewal
itself (the extension is a transaction-level operation, not a contract call), so someone has to sign and pay.

On mainnet the rent itself is a few XLM a year, so this is priced as a service: rent passed through plus about
100 XLM (~$20) a year. Version 1 is an agreement plus a yearly payment proposal; an on-chain prepaid renewal credit
can come later. It is a convenience line, not a break-even line.

### 4. Older versions pay for themselves

The platform renews code for the **latest and previous** registered version of each contract. A DAO running anything
older gets that version's code entries in its own renewal sweep, with the cost shown in the quote and a prompt to
upgrade. At today's mainnet price this is cheap either way (~$40 per contract version per year at most); it is a
policy that keeps the number of live versions, and so the bill, bounded if rent rises.

### 5. Grants

The Stellar Community Fund (Tribe Builder already has an SCF project) and financial-inclusion funders for the Circle. Not
revenue, but the realistic way the first year is paid for while lines 1–3 grow. The Circle, which takes no fee
(RV-2), is the strongest grant story: savings and credit for people banks do not serve.

## How the fee works in the contracts

- **`common`:** `PROTOCOL_FEE_BPS: u32 = 250`; `MAX_CREATION_FEE`; `protocol_fee(amount) -> (fee, rest)`, rounding
  the fee down so tiny amounts may pay none. `MAX_FEE_BPS` stays the ceiling for the DAO's own secondary fee plus the
  protocol fee together.
- **Manager:** `fee_recipient` and `creation_fee`, set by the Manager admin, event `FeeTermsChanged`. A change
  applies only to DAOs and modules created afterwards. `create_dao` collects the creation fee from the deployer in
  the native asset.
- **Auction, Marketplace, ClaimMinter:** each constructor receives `fee_recipient` from the Manager and stores it in
  its instance config. There is no setter; only an upgrade and `migrate`, by the DAO's own proposal, can change it.
  The Circle receives none (RV-2).
- **Secondary sales:** the seller's signed `max_fee_bps` covers the DAO's fee plus the protocol fee, so a fee change
  between signing and inclusion still cannot apply to a listing. `set_secondary_fee_bps` refuses a DAO fee above
  `MAX_FEE_BPS − PROTOCOL_FEE_BPS` (22.5% instead of today's 25%).
- **Events:** each module emits `ProtocolFeePaid { asset, amount }` next to the sale event, so revenue is public and
  indexable.
- **Fee vault:** a small platform contract (`contracts/fee_vault`) that receives fees in any asset and lets the
  platform multisig withdraw. It holds no DAO authority. Its balance entries join the platform's renewal in
  `renew-code-ttl.mjs`. Assets whose issuer requires authorization can still refuse a contract holder; the web already
  shows an asset's flags next to the price.

## Unit economics

Planning figure: **$3,000 a year** (today's ~$2,300–2,500 plus room for an RPC provider and pinning). That is
15,000 XLM at $0.20, 21,400 XLM at $0.14 and 8,600 XLM at $0.35. The bill is in dollars; fees arrive in whatever
asset each DAO prices in, so XLM-priced fees buy less of it when XLM falls.

| Protocol fee | Membership sales needed per year | DAOs, 20 XLM ($4) daily auction | DAOs, 50 XLM ($10) | DAOs, 200 XLM ($40) |
|---|---|---|---|---|
| 1% | $300,000 | ~205 | ~82 | ~21 |
| **2.5% (RV-1)** | **$120,000** | **~82** | **~33** | **~8** |
| 5% (Nouns Builder total) | $60,000 | ~41 | ~16 | ~4 |

Read it this way: on the protocol fee alone, Tribe Builder covers today's bill at about 33 active auction communities
selling a $10 token a day, or about 8 selling a $40 one. Creation fees (~$10 each) and managed renewal (~$20 a year
each) add a little.

**At scale the bill grows with communities, mostly through Goldsky.** What keeps the model sound is the comparison per
community:

| A community that auctions daily at | Brings in fees per year (2.5%) |
|---|---|
| $4 (20 XLM) | ~$37 |
| $10 (50 XLM) | ~$91 |
| $40 (200 XLM) | ~$365 |

As long as indexing, hosting and storage cost less per community than that, each new auction community moves Tribe Builder
further past break-even. A Circle or a free-claims community brings no protocol fee, so it is covered by the creation
fee, managed renewal and grants. For example, if Goldsky reached $500 a month at 100 communities, the bill would be
about $7,500 a year, covered at 2.5% by about 82 communities at $10 a day.

So two things matter more than the exact fee rate:

1. **Indexer cost per community.** Measure it as communities arrive on testnet (Goldsky usage per pipeline and per
   event volume) and keep it under the fees above, by filtering events earlier, sizing pipelines, or another indexer.
2. **Grants for year one.** Fees cover today's bill at a few dozen active communities; an SCF award bridges the time
   to get there, and the Circle is a fundable story on its own.

## Positioning

> For communities on Stellar that own and decide things together, Tribe Builder is an open membership protocol where you
> pay the chain's rent plus a small share of what members pay to join, and nothing for saving together. Unlike hosted
> DAO tools, there is no subscription and no platform power over your DAO: the fee is part of the code version your
> community voted for.

## Order of work

1. **Contracts, before mainnet.** `common` constants and `protocol_fee`; Manager `fee_recipient`, `creation_fee` and
   `FeeTermsChanged`; the fee in Auction settlement, `buy_from_pool`, ClaimMinter `claim` and `release`, and
   Marketplace `buy`; `ProtocolFeePaid`; the fee vault. Fee terms copied into module instances cannot be added
   cheaply after mainnet, so this goes in with the membership-models redeploy. Tests: refunds stay whole, a drive
   pays the fee once at release, a seller's `max_fee_bps` includes the protocol fee, the Circle pays nothing.
2. **Indexer cost per community.** Before mainnet, find out what drives the Goldsky bill (today ~$100/month) and how it
   grows per community and per event, so pricing can stay ahead of it.
3. **Indexer and web.** Decode `ProtocolFeePaid` and `FeeTermsChanged` (one fixture each in
   `test/every-event.test.mjs`); a `platform.protocol_fees` view; the fee on every confirmation ("2.5% protocol fee:
   1.25 XLM"); a public revenue page on the `/platform` dashboard.
4. **Operations.** The managed-renewal keeper on `renew-dao.mjs`; the older-versions rule in the renewal inventory
   (`apps/web/src/lib/chain-reads/`, `renew-dao.mjs`) and in `renew-code-ttl.mjs`.
5. **Docs.** SECURITY_MODEL (fee terms and the vault), CONTRACT_UPGRADES (RV-5), STORAGE_COSTS (mainnet rates, the
   platform row and the older-versions rule).
6. **Later.** A client referral share, once a second client exists; an on-chain renewal credit.

## Open questions

- **OQ-1:** the RPC provider and IPFS pinning costs for mainnet (Goldsky, Vercel and Neon are in the table).
- **OQ-2:** whether to budget at $0.20 per XLM or more conservatively.
- **OQ-3:** how fast mainnet state grows toward 2.0 GB, where rent leaves the floor; re-read the settings with a
  current CLI before quoting anyone.
- **OQ-4:** the creation fee amount (suggested 50 XLM).
- **OQ-5:** legal review of taking a fee on membership sales, and confirmation that RV-2 keeps the platform out of
  the Circle's savings and lending.
- **OQ-6:** the Circle's WASM size once it exists (35–60 KB estimated).
- **OQ-7:** how the Goldsky bill grows per community and per event on mainnet.
