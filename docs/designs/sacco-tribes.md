# Design: Saccos as tribes

Status: DRAFT (2026-11-21). Not built. Nothing here changes a decision in
[savings-circle](savings-circle.md); where the two touch, that design wins for the Circle and this one adds a Sacco
layer on top.
Direction under discussion (2026-11-24): the first pilots may be grassroots circles and fundraisers rather than a
regulated Sacco, which would change the phase order below. See [fundraiser](fundraiser.md).
Builds on: [membership-models](membership-models.md), [locked-tokens](locked-tokens.md),
[savings-circle](savings-circle.md), [governance-adapter](governance-adapter.md), [REVENUE](../REVENUE.md).

Research for this page was done on 2026-11-21. Facts marked *unconfirmed* came from secondary sources or could not be
checked against a primary source. The sources are listed at the end.

## Summary

Kenya's Saccos (savings and credit cooperative societies) have about 7.9 million members and KSh1.21 trillion in
assets. Can they run on Tribe Builder? Yes, but not all at once, and not by moving members' savings on-chain first.

- **A Sacco is not a large savings circle.** The Circle is a village savings group: 15 to 30 people, one fixed
  payment a month, every loan voted by everyone, and the whole pot shared out each period. A Sacco has thousands of
  members, share capital and deposits as separate products, loans approved by a credit committee, guarantors, interest
  on the reducing balance, and dividends declared at the annual general meeting (AGM). Scaling up the Circle is
  not enough.
- **Regulation blocks money on-chain for a regulated Sacco today.**
  - SASRA's prudential rules: 15% liquidity, investment caps, and no business with non-members.
  - The Virtual Asset Service Providers (VASP) Act 2025: custodial wallets and conversion need a licence, and no
    licences have been issued yet.
  - The Data Protection Act 2019: a wallet address linked to a member is personal data.

  All three apply to member savings held in USDC.
- **What a regulated Sacco can use now is governance and transparency.** That means one-member-one-vote AGMs on-chain
  and a verifiable passbook: the Sacco publishes signed monthly attestations, and each member can check their own
  balances against them. No money moves on-chain. This is the lesson of the KUSCCO collapse (KSh13.3 billion lost
  behind opaque books), and it needs one new module.
- **Money on-chain starts with unregulated groups.** A chama or welfare group runs the Circle with USDC through a
  Kotani Pay M-Pesa ramp, as the founding-circles pilot in [savings-circle](savings-circle.md) already proposes.
- **A full Sacco module comes last.** Shares, deposits, loan products, a credit committee, guarantors, and dividends wait
  for licensed ramp partners and a licensed KES stablecoin.

```
Phase 0  Partners and checks ─────────────┐
Phase 1  Sacco Ledger tribe (no money) ───┼── regulated Saccos: governance + verifiable passbook
Phase 2  Circle pilot with money ─────────┼── chamas and welfare groups: USDC via M-Pesa ramp
Phase 3  Sacco module (money on-chain) ───┘── after licensed partners, KES stablecoin, sandbox
```

## Context: the news that prompted this

A Businessfront article (6 July 2026) reported that the government would draw on Sacco savings for the National
Infrastructure Fund, and that the Sacco Societies (Amendment) Bill 2025 would be signed within a month. Both claims
need care:

- The Treasury called the claim about Sacco savings "fake" (6 July 2026), and another outlet retracted a related
  report. What Deputy President Kindiki actually said was that moving projects into the fund creates fiscal space for
  cooperatives.
- The Bill had not passed as of August 2026. It was still in committee for public participation, and the Senate must
  consider it next. The KSh100,000 compensation cap is disputed: Parliament said the Bill does not contain it.

What this tells a design: members react strongly to any suggestion that their savings are being "moved somewhere new".
A product that asks members to move savings on-chain starts with a trust problem. A product that lets them **check**
the savings they already have starts with a trust answer.

## What a Sacco is, against the Circle

| | Circle (as designed) | Typical Sacco |
|---|---|---|
| Members | 15–30 | hundreds to hundreds of thousands (7.9M across 357 SASRA-regulated Saccos) |
| Money in | one fixed payment per cycle | share capital (fixed and non-withdrawable, earns dividends) plus monthly deposits (refundable on exit, earn interest, cover loans); deposit-taking (DT) Saccos also run withdrawable front office (FOSA) savings |
| How money arrives | member pays | payroll check-off by the employer, or M-Pesa paybill with the member number as account |
| Loan limit | `k × stamps × dues` | typically 3× deposits (about 4× for salary loans) |
| Loan approval | full DAO vote | credit committee and board within a policy the AGM sets (standard practice, *unconfirmed* in a primary source) |
| Collateral | own savings, forfeited on default | own deposits plus guarantors who pledge theirs; increasingly also assets |
| Interest | flat, at disbursement | about 1% per month on the reducing balance |
| Term | due before the period closes (≤ 64 cycles) | months to several years |
| Returns | whole pot shared out each period | dividends on shares and interest on deposits, declared at the AGM from the surplus, after capital ratios are met |
| Governance | every member votes on every loan | AGM, one member one vote. Cooperatives over 5,000 members were directed to elect delegates; a court has halted that for one Sacco |
| Regulator | none | SASRA (DT Saccos, and non-deposit-taking (NWDT) Saccos with ≥ KSh100M deposits); smaller ones the Commissioner for Cooperatives and counties |
| Reporting | the feed | monthly SASRA returns, credit bureau sharing, AML reporting to the Financial Reporting Centre |

## What Tribe Builder already has

| Sacco need | Tribe Builder today | Fit |
|---|---|---|
| One member, one vote | Token: one NFT per member; locked transfers; members-only delegation (`locked-tokens.md`) | good |
| Admitting only registered members | ClaimMinter free merkle lists; Circle intake rounds (S3-1) | good: the Sacco's register becomes the list |
| Members who lose phones | `dao_recovery` + `dao_transfer`, Circle `recover_membership` | good, with smart wallet guardians (below) |
| AGM resolutions | Governor proposals with quorum and delays | good for yes/no resolutions |
| Delegates | members-only delegation to an elected delegate | good, and optional, so a Sacco can keep direct votes |
| Board and committee elections | none: Governor proposals are yes/no | **gap** |
| Verifiable books | the feed covers on-chain events only | **gap**: needs attestations |
| Committee-approved loans | loans are full DAO votes (CEO-4) | **gap** for any Sacco-scale group |
| Shares, deposits, loan products, guarantors, dividends | Circle has one savings product; pledges deferred (RD-2) | **gap** |
| Large membership | renewal sweep and pull-based claims; no loops over members | good: 1,000 members cost ~67 XLM a year in rent (REVENUE) |
| Member wallets without crypto knowledge | Stellar Wallets Kit (Freighter, xBull, …) | **gap**: needs passkey smart wallets and fee sponsorship |
| Shillings in and out | none | **gap**: needs a ramp partner |
| Regulator reports | the legal entity export pattern | partial: same pattern, new content |

## Who to start with

| Segment | Regulator | Money on-chain? | Product |
|---|---|---|---|
| Chama or welfare group, informal | none | yes, member-held USDC shown in KES | Circle (Phase 2) |
| Small cooperative or NWDT Sacco below KSh100M deposits | Commissioner for Cooperatives | not first; ledger first, money only with a licensed partner | Sacco Ledger (Phase 1), later Sacco module |
| SASRA-regulated DT or NWDT Sacco | SASRA, plus FRC for AML | no | Sacco Ledger (Phase 1) |
| Diaspora Sacco | SASRA (NWDT regulations 2020 include them) | the best long-term fit for USDC, since members earn in other currencies, but regulated, so ledger first | Sacco Ledger, then Phase 3 |

The first Sacco to approach is a mid-sized one whose members already use a mobile app and the M-Pesa paybill, and
whose board wants to show members its books after KUSCCO. The founding-circles pilot keeps its own partner track.

## Phase 0: partners and checks (before code)

Phase 1 needs written answers to these:

1. **A pilot Sacco.** It agrees to publish monthly attestations, run one AGM resolution on-chain beside its normal
   process, and give members the passbook check.
2. **Data protection.** A data protection impact assessment (DPIA, s.31) for the Ledger design: what is on-chain,
   where the member mapping lives, how erasure (s.40) is honoured, and whether the member store must stay in Kenya
   (ss.48–50). The design below is built to pass it: nothing personal on-chain, and the mapping deletable.
3. **Whether the Ledger needs a licence.** The Ledger moves no money and holds no keys, so it should fall outside the
   VASP Act. Each Sacco confirms this with its own advisers. The platform's position is recorded once.
4. **Ramp partner (for Phase 2).** Kotani Pay is the only ramp confirmed live on Stellar for M-Pesa. Ask Kotani:
   - Can it pay to and collect from a contract address (C-address), or only a classic G-account?
   - Does it support a memo or muxed address on a Stellar asset contract (SAC) transfer to its escrow?
   - What are its fees?
   - What is the status of its VASP licence application?
   - Can it settle USDC on Stellar, and does it plan a Stellar KES asset?

   Backup partners: ClickPesa (a SEP-24 anchor; whether Kenya M-Pesa is live is *unconfirmed*) and Fonbnk (on-ramp
   only).

## Phase 1: the Sacco Ledger tribe (no money on-chain)

### What members see

- **Vote in the AGM from your phone.** One badge per member, one vote, with a passkey sign-in and no fees to pay. A
  Sacco can keep direct votes or let members delegate to an elected delegate.
- **Check your passbook.** Each month the Sacco publishes a signed fingerprint (a merkle root) of every member's
  balances. A member's app fetches their own entry and checks it against the fingerprint on-chain: "Your shares,
  deposits and loan balance for October match what your Sacco published."
- **See the Sacco's health.** Total deposits, share capital, loan book, loans in arrears, liquidity ratio, and capital
  ratios, as the officers published them each month, with the audited accounts' hash for each year. A missed month is
  visible to everyone.

### New contract: the `ledger` module

A per-DAO module of a new built-in kind `ledger`. It is `non_voting`, holds no assets, and mints nothing (allowance 0).
Attaching it takes one proposal, following `module-attach-ui.md`.

```text
set_attesters(signers: Vec<Address>, threshold: u32)     Treasury; the officers who sign (e.g. CEO, treasurer, supervisory committee chair)
post(kind, period, root, uri, figures, signers)          threshold of attesters; one entry per (kind, period); a later post of the same (kind, period) is a correction and keeps both
                                                         kind: Passbook | Accounts | Prudential | AuditedAccounts | Minutes
                                                         figures: up to 16 named i128 values (deposits, shares, loans, par30, liquidity_bps, ...)
latest(kind) / get(kind, period)                         reads
verify(kind, period, leaf, proof) -> bool                read: the same merkle check as ClaimMinter (common::merkle, savings-circle T3)
launch / handoff / renewal_keys / upgrade                DaoModule, as every module
```

- **Storage.** `Config` (instance): attesters, threshold, and the latest period per kind. `Entry(kind, period)` is
  persistent, about 300 B. A monthly passbook and prudential post comes to about 24 entries a year, and old entries
  may expire after a governance-set number of years. The indexer keeps the history.
- **Events.** `AttestersChanged`, `Posted{kind, period, root, uri, figures, signers}`, `Corrected{kind, period, …}`.
  Each one becomes a feed sentence: "Your Sacco published its October passbook (signed by 3 of 3 officers)".
- **Passbook leaf.** `hash(salt, member_number_hash, shares, deposits, loan_balance, guarantees_given, period)`. The
  salt is per member and per period, and only the member's app and the Sacco know it, so a leaf reveals nothing and
  two leaves from the same member cannot be linked. The tree file at `uri` is encrypted per member, or served behind
  the member's sign-in. It is never public in the clear.
- **Not on-chain:** names, phone numbers, ID numbers, member numbers in the clear, and per-member balances.

### New contract or adapter: elections

Boards and committees are elected, and the Governor only does yes/no. There are two options:

- **A. An `election` module.** Candidates per seat. Each member's weight is read from the Token checkpoint at a
  snapshot ledger. Ballots are approval or single-choice, and the count is published as an event. The module is
  `non_voting`.
- **B. One yes/no proposal per candidate.** Possible today, but clumsy and open to manipulation through the order of
  proposals.

Recommendation: A, with ballots public but tied only to pseudonymous addresses. A secret ballot is out of scope; say
so to the pilot Sacco.

### Membership flow

1. The Sacco exports its member register (member number, phone) to the **Sacco connector** (below). The register
   never leaves the Sacco's tenant store.
2. A member opens an invitation link from SMS, creates a passkey wallet, and proves they are the member with a code
   sent to their registered phone. The connector adds `(wallet, 1)` to the next intake list.
3. A proposal publishes the list root (ClaimMinter free list, or a Circle intake round once Circles exist). The member
   claims their badge, and the fee is sponsored.
4. Token settings for a Sacco tribe: transfers locked, members-only delegation on, DAO recovery on. This is a new
   **"Sacco" creation preset** next to the savings-only preset.
5. When a member exits, a proposal moves their badge back to the Treasury with `dao_transfer`, and the connector
   deletes the wallet mapping.

### Sacco connector (off-chain service, per Sacco)

The only new server-side system in Phase 1. It runs as a tenant of the web app, following
`MULTITENANT_ARCHITECTURE.md`.

- **Inputs:** a monthly export from the Sacco's core banking system (CSV or an API, whatever its vendor offers), and
  the member register.
- **What it does:**
  - builds the passbook tree;
  - computes the published figures;
  - prepares the `post` transaction for the officers to sign, as a multisig with each officer's own passkey;
  - serves each member their own leaf and proof after sign-in;
  - sends SMS notices for AGM votes, new posts, and missed months (Africa's Talking or similar).
- **Stores** the wallet ↔ member-number mapping and the salts, encrypted, in the tenant's database (hosted in Kenya if
  the DPIA asks). Deleting a member's row honours erasure: what stays on-chain cannot be linked back to them.
- **Holds no signing power.** Officers sign every post. The connector cannot post alone.

### Wallets and fees (shared with Phase 2)

- **Member wallet:** an OpenZeppelin Smart Account with passkey signers (smart-account-kit). It is built on audited
  OpenZeppelin contracts; passkey-kit is not independently audited. The alternative is Crossmint's Stellar smart
  wallet. Stellar Wallets Kit stays for members who already use Freighter or xBull.
- **Recovery:** the smart account gets a guardian rule, under which two Sacco officers plus a 7-day time lock can add a
  new passkey. Behind that sit the tribe's `dao_recovery` and the Circle's `recover_membership`.
- **Fees:** OpenZeppelin Channels (the managed relayer that replaced the now-closed Launchtube) during the pilot, then
  a self-hosted OpenZeppelin Relayer when traffic exceeds the fair-use cap. The Sacco or the platform pays, never the
  member (see Costs).
- **Phones without a passkey:** older Android phones, shared phones, and feature phones. *Open question 5.*

### Web

- **Sacco tab:** health figures over time, a missed-month banner, posts with their signers, and the passbook check.
- **Officer console:** upload the export, review the computed figures, sign the post, manage attesters.
- **AGM view:** resolutions and elections, turnout against quorum.
- **Create flow:** a "Sacco" preset, which turns on the three token settings, attaches the `ledger` module, and offers
  the election module.
- **Regulator export:** the published figures in the shape of SASRA's monthly returns, following the legal entity
  export pattern. It assists the Sacco; it files nothing.

### Phase 1 go and stop

- **Go:** one Sacco posts three months on time, members run the passbook check (target: 10% of active members), and an
  AGM resolution passes on-chain with turnout at or above the Sacco's in-person turnout.
- **Stop:** the Sacco cannot produce the export each month without manual work, or members do not open the check.

## Phase 2: Circle pilot with money (chamas and welfare groups)

This is the founding-circles pilot and Waves 2–4 of [savings-circle](savings-circle.md), unchanged. This design adds
the money rails.

### Asset

- **USDC on Stellar**, shown to members in KES at the ramp's quoted rate. Members earn and repay in shillings, so the
  passbook shows both amounts, and loans state the KES value at disbursement.
- **Why not a KES token yet:** ClickPesa's KES on Stellar is small (about KSh28.6M across 3,463 accounts), and it has
  no published reserves and no licence. Kenya's stablecoin rules (July 2026) require KSh300M capital, 1:1 reserves, and
  redemption at par within two working days, and no Kenyan issuer is licensed yet. A licensed KES stablecoin replaces
  USDC as soon as one exists on Stellar. The Circle's `payment_asset` is per Circle, so a new Circle can use it.
- **Risk to state plainly:** the CBK can order local platforms to restrict foreign stablecoins such as USDC.

### On-ramp and off-ramp

```
 M-Pesa ──STK push──► Kotani ──USDC──► member's wallet (C-address) ──pay_dues/repay──► Circle pot
 Circle pot ──disburse/claim_share──► member's wallet ──USDC──► Kotani escrow ──KES──► M-Pesa
```

- **Member-direct, not omnibus.** Each member converts their own shillings, so the group never holds pooled money
  outside the contract. This keeps the Circle's two-pot guarantee (CEO-1) meaningful.
- **The C-address gap.** No Kenyan ramp advertises SEP-45, the anchor sign-in for contract accounts. If Kotani cannot
  pay a C-address directly, each member gets a sponsored classic G-account that they control: a second signer on the
  same passkey device. Kotani pays that account, and the app sweeps it into the smart wallet in the same session. The
  platform never holds the funds in between, which would make it a custodial wallet provider under the VASP Act.
- **Integration code:** a `ramp` package in `apps/web/src/lib/ramp` behind a provider interface with `quote`,
  `startDeposit`, `startWithdraw`, `status`, and webhooks. Kotani's proprietary v3 API is first, and a SEP-24 adapter
  covers ClickPesa or any standard anchor.
- **Trustlines:** smart wallets hold SAC balances without a trustline, and Circle USDC needs no authorisation, so the
  Circle's `NoTrustline` errors (S2-1) apply only to classic accounts.

### Paying out to many members

Share-outs are already pull-based (`claim_share`). For members who want cash, the app offers "claim and cash out"
as one flow: claim, then Kotani off-ramp. The Stellar Disbursement Platform does not fit here: it sends one-way
payments and does not track loans.

### Lending

Loans stay in the Circle contract (cap, ceiling, forfeit). Blend does not fit member lending: it needs collateral, is
open to anyone, and needs a BLND backstop. Its oracle risk also showed in the YieldBlox pool loss in February 2026.
Treasury yield on idle funds is a separate question, and is out of scope for a savings group.

## Phase 3: the Sacco module (money on-chain)

Starts only when these hold:

- A ramp partner holds a CBK licence.
- A licensed KES stablecoin is on Stellar, or a sandbox approves USDC.
- A Sacco from Phase 1 asks for it.
- The Circle pilot reached "go".

Until then this section is a sketch, so that Phase 1 and 2 choices do not block it.

### Savings products

| Product | Rule | Contract behaviour |
|---|---|---|
| Share capital | fixed minimum; non-withdrawable; transferable to another member only with the Sacco's approval | `buy_shares`; `transfer_shares` by a committee-approved request |
| Deposits | monthly minimum; refundable on exit after a notice period; loan cover | `deposit`, `request_exit` → refund after `notice_secs`, net of loans and guarantees |
| Dividends and interest on deposits | declared at the AGM from the surplus | the AGM proposal publishes a merkle root of each member's entitlement, computed off-chain from time-weighted balances and checkable from events; members claim |

### Loans: the real structure, with its weak points closed

The rule for this section: keep every step a Kenyan Sacco runs today, so officers and members recognise the process.
Where a step fails today, the contract closes the gap. Nothing is dropped that makes a loan safer or more useful. The
real-world steps come from Sacco loan policies and press reports. The lifecycle as a whole is standard practice, but
has not been checked against one written policy (*unconfirmed*). Phase 0 checks it against the pilot Sacco's own
credit policy.

| # | Step | How a Sacco does it today | What goes wrong today | On the tribe |
|---|---|---|---|---|
| 1 | Eligibility | member for some months (often 6), regular deposits, minimum shares paid | checked by hand | `eligible(member, product)` is computed: membership age, months with a deposit in the last `n`, shares at or above the minimum, no loan in arrears |
| 2 | Limit | a multiple of deposits (often 3×) minus outstanding loans | none | the contract computes `limit = multiple × deposits − outstanding principal` per product |
| 3 | Repayment capacity | payslip check: total deductions within two-thirds of pay (Employment Act s.19(3)); credit bureau check | forged payslips; skipped checks | stays off-chain. A loans officer signs an appraisal attestation (the hash of the appraisal, the capacity result, and the credit bureau result), and products that need one refuse approval without it |
| 4 | Guarantors | other members sign forms pledging their deposits | the same deposits pledged to several loans; forged or unaware guarantors; guarantors not told when the borrower falls behind | each guarantor signs `pledge(loan_id, amount)` from their own wallet. A pledge is capped at the guarantor's **free deposits** (deposits − cover for own loans − pledges already given). Guarantors see every missed instalment in their feed and by SMS |
| 5 | Approval | credit committee meeting; the board for large and insider loans | approvals over policy; members approving friends or their own loans | `m` of `n` committee signatures, and the contract checks the policy. A committee member who is the borrower or a guarantor cannot sign. Insider loans (officers, committee members, staff) need the board and count towards the insider cap |
| 6 | Review window | none | none | **new:** an approved loan above a threshold waits `review_secs` (for example 48 hours), during which the supervisory committee can block it with a recorded reason. Small loans skip the wait |
| 7 | Disbursement | to the member's FOSA account, bank, or M-Pesa, minus fees and loan insurance | fees not shown up front | `disburse` pays the principal minus a governance-set processing fee and loan-protection premium. Both amounts are shown before the borrower signs. Guards: liquidity floor, single-borrower limit, monthly approval total |
| 8 | Repayment | monthly instalments, by check-off or self-pay, interest on the reducing balance | employers hold back deducted money | interest accrues daily on the outstanding principal. A payment goes to penalties, then interest, then principal. The product sets the schedule (equal instalments or equal principal). Early repayment is allowed. A top-up is a new loan that clears the old one first |
| 9 | Arrears and recovery | notices, then guarantors, then recovery from guarantors' deposits | slow and uneven; guarantors surprised | days past due are counted from the oldest unpaid instalment. From day 1 the borrower and guarantors are notified. After `recovery_days` (for example 90) anyone can call `recover(loan_id)`: the borrower's own deposits are used first, then each guarantor's pledge pro rata. Each guarantor gets an on-chain claim on the borrower, and the borrower's later deposits repay guarantors first |
| 10 | Classification | SASRA classes and provisions | under-provisioning hides losses (KUSCCO overstated profits for six years) | the class (performing, watch, substandard, doubtful, loss) is computed from days past due. The indexer shows portfolio at risk and required provisions, so a Ledger figure that disagrees is visible to every member |
| 11 | Death or disability | loan protection insurance clears the loan | none | premiums go to a loan-protection fund. A board proposal with an attested claim clears the loan from that fund and releases the guarantors |
| 12 | Exit | deposits refunded after notice, net of loans and guarantees | none | `request_exit` → refund after `notice_secs`. It is blocked while the member guarantees an open loan, unless a substitute guarantor pledges first |

**Loan products** are data, not code. Each product names its multiple, maximum amount, maximum term, monthly rate,
schedule type, approval path, cover rule, fees, and whether an appraisal is needed. A Sacco starts from three presets:

- **Instant:** for example 1× free deposits, up to a small cap, up to 12 months, covered by the borrower's own deposits,
  no guarantors, automatic approval. This is the mobile-loan product members already use, and it answers the Circle's
  slow-emergency-loan concern (CEO-2) without a vote.
- **Normal:** for example 3× deposits, up to 48–72 months, any amount above the borrower's own deposits covered by
  guarantors, committee approval, appraisal required.
- **Top-up:** a Normal loan that first clears an existing one.

**Approval paths.** The contract supports four. Each product picks one, and the AGM's policy decides which products
exist.

| Path | Who approves | Used for |
|---|---|---|
| `Auto` | the contract, when every rule passes | Instant |
| `Committee` | `m` of `n` elected credit committee members | Normal, Top-up |
| `Board` | `m` of `n` board members, after the committee | insider loans and loans above the large-loan threshold |
| `DaoVote` | a full Governor proposal | the Circle (CEO-4); a Sacco may use it for exceptional loans |

**Invariants.** Each is a unit test, and each holds after every entry point:

1. A member's pledges ≤ their deposits − cover for their own loans.
2. No covered loan is disbursed unless the borrower's locked deposits + pledges ≥ principal.
3. Deposits locked as cover or pledged cannot be withdrawn or refunded on exit.
4. No approval exceeds the product, the per-loan maximum, the monthly total, the single-borrower limit, or the insider
   cap. Policy changes take effect after a delay, as `max_loan_bps` does (S3-3), so one action cannot both raise a
   limit and use it.
5. No disbursement takes liquid assets below 15% of deposits.
6. The borrower and their guarantors are never among the signers of their own approval.
7. Every state change emits an event, and the loan book rebuilt from events equals the contract's state.

**Out of scope for the first version:** loans secured by assets outside the chain (vehicle logbooks, title deeds). A
later version can record them as an attested pledge with a value and a document hash.

**The Assignment, again.** As with the Circle, no loan code until the rules are written as a hand-computed table:

- one Normal loan with two guarantors, falling into arrears in month 4;
- recovery in month 7;
- one Instant loan repaid early;
- one top-up.

If an officer from the pilot Sacco cannot follow the table, the rules are wrong.

### Prudential checks the contract can enforce

The 15% liquidity floor is a `disburse` guard (invariant 5). Capital ratios are a dividend guard: no dividend claim
opens unless the latest attested ratios meet SASRA's minimums. Both read the same figures the Ledger publishes.

### Circle and Sacco: one module or two

There are two ways to build the Circle and the Sacco.

**What differs**

| | Circle | Sacco |
|---|---|---|
| Savings unit | stamps: a fixed payment per cycle, kept in a bitmap | balances: variable deposits plus share capital |
| Time | periods that end in a full share-out | continuous; dividends declared once a year |
| Loan cap | `k × stamps × dues` | product multiple × deposits |
| Loan cover | own savings, forfeited on default | own deposits plus guarantor pledges, recovered on default |
| Interest | flat | daily on the reducing balance |
| Term | inside one period | months to years |
| Approval | full DAO vote | auto, committee, or board |

**What is shared:**

- membership: intake, badge mint, member pages, `move_membership`, and `recover_membership`;
- the two-pot custody rule;
- pull-based claims;
- `DaoModule`.

The loan side converges further once the Circle's deferred pledges (RD-2) arrive.

**Option A: one generic module.** The Circle gains configuration (variable deposits, products, guarantors, approval
paths), and a VSLA becomes a preset.

- **For:** one contract to audit, upgrade, and index.
- **Against:**
  - Every Circle carries Sacco complexity, and the audit must cover every combination of settings.
  - The Circle's design test ("if the table is hard to fill in by hand, the rules are too complicated for a group to
    trust") gets harder to pass.
  - One contract may also exceed Soroban's contract size limit.

**Option B: two module kinds and a shared loan engine (recommended).**

- `circle` and `sacco` stay separate kinds, each with its own savings rules.
- They share a `credit` library crate for:
  - loan products and approval paths;
  - pledges with the free-deposits rule;
  - repayment allocation, interest accrual, and schedules;
  - days past due and classification;
  - recovery.
- The Circle uses the engine with its own settings: a flat rate, the `DaoVote` path, due inside the period, with
  pledges once RD-2 lands. It can later add an `Auto` path for small emergency loans.
- **For:**
  - Each module stays readable for its own users.
  - The risky arithmetic is written and tested once.
  - The Circle gains guarantors and a fast path without carrying the rest.
- **Against:** two contracts to register, index, and upgrade. The membership-models module system already makes that
  routine.

**When to decide:** before Circle Wave 2 starts, because Wave 2 writes the Circle's loan code. Under option B, that
code goes into `credit` from the start. *Open question 4.*

### Money in

- **Check-off:** the employer pays the Sacco in shillings, and the Sacco converts and credits members on-chain. This is
  **omnibus by nature**: the Sacco holds converted funds briefly, as it already holds shillings. A `credit_batch`
  entry, signed by the attesters, credits up to about 40 members per transaction, with a batch id that the next
  Ledger passbook must reconcile.
- **Self-pay** via M-Pesa through the Phase 2 ramp.

## Shared infrastructure, by phase

| Component | Phase 1 | Phase 2 | Phase 3 |
|---|---|---|---|
| Contracts | `ledger` module, `election` module, Sacco preset | Circle (Waves 1–2 of savings-circle), built on the `credit` engine if option B is chosen | `sacco` module on the `credit` engine, approval paths, `credit_batch` |
| Wallets | OZ Smart Account with passkeys and guardians | same | same |
| Fees | OZ Channels, then a self-hosted relayer | same | same |
| Ramps | none | Kotani v3 (provider interface, SEP-24 adapter) | licensed partner; omnibus conversion for check-off |
| Off-chain services | Sacco connector (export → tree → post), SMS | ramp webhooks | core banking sync both ways |
| Indexer and DB | Ledger and election events, `0011_ledger_views.sql` | Circle views (savings-circle Wave 3) | Sacco views, portfolio at risk |
| Web | Sacco tab, officer console, AGM view, passbook check, regulator export | Circle tab, ramp flows | loan products, committee queue, dividends |
| Security | audit of `ledger` and `election`; officer multisig | audit of Circle | audit of `sacco`; prudential guards tested against real returns |

## Costs

At about $0.19 per XLM (REVENUE's rate). Soroban fees are estimated at about 0.025 XLM per transaction, an older
measurement (*unconfirmed*). Smart-wallet deployment and storage rent are not yet measured.

| Item | 1,000 members | 10,000 members |
|---|---|---|
| Badge claims (once) | ~25 XLM | ~250 XLM |
| AGM: 2 votes per member per year | ~50 XLM | ~500 XLM |
| Ledger posts (24 a year) | < 1 XLM | < 1 XLM |
| Rent for badges and member records | ~67 XLM a year (REVENUE, Circle-sized records) | ~670 XLM a year |
| Phase 1 total, first year | ~150 XLM (~$30) | ~1,500 XLM (~$290) |

Ramp fees are not published. Kotani's is about 1% (*unconfirmed*), and Safaricom's charges come on top. Under
[REVENUE](../REVENUE.md), a Sacco tribe pays the creation fee and managed renewal, and RV-2 (no fee on savings, loans,
or interest) extends to the `sacco` kind. Managed relaying for a Sacco's members fits as part of managed renewal.

## Risks

1. **Trust.** After July 2026, any talk of "moving savings" alarms members. Phase 1 must say plainly that no money
   moves.
2. **Regulation can change under us.** The Amendment Bill, the Cooperatives Bill, and the National Payment System Bill
   are all pending. The Ledger is the least exposed piece, and Phase 3 waits for them.
3. **Exports.** Core banking systems differ from Sacco to Sacco, and a monthly export that needs manual cleaning will
   stall Phase 1. Measure this in the pilot.
4. **Passkey loss on shared or low-end phones.** Guardians and DAO recovery cover it, at the cost of officer time.
5. **One ramp partner.** Kotani's API is proprietary and its fees and licence are unconfirmed. Keep the provider
   interface and a SEP-24 adapter.
6. **Free relayer limits.** Channels has a fair-use cap, and Launchtube has already been shut down once, so plan the
   self-hosted relayer early.
7. **USDC and currency.** A savings group in USDC carries a shilling exchange risk. Show both currencies, and move to a
   licensed KES asset when one exists.
8. **Public ballots.** Votes are tied to pseudonymous addresses but are visible. Some Saccos will want secret ballots
   for elections.

## Open questions

1. **Order of the two pilots.** The two are different pilots with different partners:
   - **The Sacco Ledger pilot (Phase 1):** one regulated Sacco, no money on-chain, and new code (the `ledger` and
     `election` modules, the connector, smart wallets).
   - **The founding-circles pilot (Phase 2):** one to five chamas with real USDC. It starts by hand on today's tribe
     features, as savings-circle's pilot plan says, so its first months need no new code.

   Running both at once costs little engineering beyond the Ledger work. *Recommended: in parallel.* The open question
   is whether partner time allows two pilots at once.
2. **Sacco loans (direction set 2026-11-21):** the loan design follows the real Sacco process as closely as possible,
   simplifying or improving only where that keeps it as secure and as useful. The design is in "Loans: the real
   structure, with its weak points closed". Still to confirm: the three approval paths for the `sacco` kind (auto,
   committee, board), with the Circle keeping CEO-4.
3. **Asset for Phase 2:** USDC with KES display now, or wait for a licensed KES asset?
4. **One module or two (to decide before Circle Wave 2):** a generic Circle, or `circle` and `sacco` as separate kinds
   with a shared `credit` loan engine. See "Circle and Sacco: one module or two". *Recommended: two kinds and a shared
   engine.*
5. **Members without a passkey-capable phone:** leave them out of on-chain voting, offer assisted voting at a branch
   (an officer's device, the member's own passkey on a hardware key), or sign USSD votes server-side? The last option
   is custodial and probably needs a licence.
6. **Secret ballots for elections:** out of scope, or a later commit-reveal design?
7. **Who pays relayer fees in Phase 1:** the Sacco, through managed renewal, or the platform as pilot cost?

## Next steps

1. **Phase 0:**
   - find the pilot Sacco;
   - write the DPIA for the Ledger;
   - send Kotani the five questions;
   - get the pilot Sacco's written credit policy and check the loan table against it;
   - decide open questions 1 and 4, and confirm the approval paths in question 2.
2. **Ledger module design pass.** Settle the merkle leaf format, the `figures` names, and the correction rule, then hand
   the Ledger contract to `/plan-eng-review`.
3. **Contracts (one PR per item):**
   - `common::merkle` (shared with savings-circle T3);
   - the `ledger` module;
   - the `election` module;
   - the Sacco preset in the Manager.
4. **Off-chain:** the Sacco connector, smart wallets with passkeys and guardians, the relayer.
5. **Indexer and web:** Ledger and election views, the Sacco tab, the officer console, the AGM view, and the passbook
   check.
6. **Run Phase 1** with one Sacco for three months, and decide go or stop.
7. **Phase 2 rails:** in parallel, the Circle pilot proceeds as in savings-circle, and the `ramp` package is built
   against Kotani's sandbox.

## Sources (read 2026-11-21)

**Regulation**
- Sacco Societies Act 2008 · https://new.kenyalaw.org/akn/ke/act/2008/14/eng@2025-06-20
- DT Sacco Business Regulations 2010 (LN 95/2010) · https://new.kenyalaw.org/akn/ke/act/ln/2010/95/eng@2022-12-31
- SASRA/FSD Kenya regulations FAQ · https://www.fsdkenya.org/wp-content/uploads/2021/aws/Archive%20data%20FSD/13-05-23_Sacco_Regulations_FAQs_management.pdf
- NWDT regulations 2020 · https://sites.tufts.edu/flpfi/files/2020/05/THE-SACCO-SOCIETIES-NON-DEPOSIT-TAKING-BUSINESS-REGULA-TIONS-2020.pdf.pdf
- Sacco Societies (Amendment) Bill 2025 status · https://mzalendo.com/legislative-trends/bills/na/485/; https://www.the-star.co.ke/news/2026-07-13-parliament-clarifies-sacco-bill-amid-savings-rumours
- Treasury denial on Sacco savings and the National Infrastructure Fund · https://www.kenyans.co.ke/news/124976-treasury-denies-plan-use-sacco-savings-infrastructure-fund
- CBK/CMA VASP notice, 13 Nov 2026 · https://www.centralbank.go.ke/wp-content/uploads/2026/11/CBK-CMA-Public-Notice-Operationalisation-of-the-VASP-Regulations-2026-.pdf
- Stablecoin rules in the final VASP Regulations · https://the-star.co.ke/news/2026-07-27-kenya-maintains-tough-rules-but-cuts-stablecoin-capital
- Data Protection Act 2019 · https://www.odpc.go.ke/wp-content/uploads/2024/02/TheDataProtectionAct__No24of2019.pdf
- KUSCCO audit · https://capitalfm.africa/kuscco-audit-reveals-billions-lost-in-mismanagement-report-tabled-in-parliament/
- Delegate directive and court order · https://www.businessdailyafrica.com/bd/economy/court-halts-state-plan-to-replace-direct-sacco-member-votes-5547990

**Stellar rails**
- Kotani Pay API v3 · https://documentation.kotanipay.com/v3/flows/offramp-flow
- Smart wallets on Stellar · https://developers.stellar.org/docs/build/guides/contract-accounts/smart-wallets
- OpenZeppelin Relayer and Channels · https://developers.stellar.org/docs/tools/openzeppelin-relayer
- SEP-45 in the Anchor Platform · https://developers.stellar.org/docs/platforms/anchor-platform/sep-guide/sep45
- Stellar asset contract balances · https://developers.stellar.org/docs/tokens/stellar-asset-contract
- Stellar Disbursement Platform embedded wallets · https://developers.stellar.org/docs/platforms/stellar-disbursement-platform/admin-guide/embedded-wallets
- YieldBlox incident · https://blocksec.com/blog/yieldblox-dao-incident-on-stellar-oracle-misconfiguration-enabled-a-10m-drain
