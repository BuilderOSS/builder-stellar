# Design: Fundraisers in tribes

Status: DRAFT (2026-11-24). Not built. Nothing here changes a decision in another design.
Builds on: [membership-models](membership-models.md) (the assurance escrow), [savings-circle](savings-circle.md)
(presets, `donate`), [sacco-tribes](sacco-tribes.md) (M-Pesa ramps and the questions for Kotani),
[STORAGE_DIET](../STORAGE_DIET.md) (the profile JSON), [STORAGE_COSTS](../STORAGE_COSTS.md), [REVENUE](../REVENUE.md).

Where it came from: the team meeting on 2026-11-18 (onboard 2 to 5 communities in six months, start with easy use
cases, M-Pesa and phone-credit ramps) and a team chat on 2026-11-23 proposing fundraising inside tribes, temporary
tribes formed for one purpose, and a pilot with one or two communities that intend to stay.

## Summary

A fundraiser is a group raising money for one purpose: equipment for a sports team, a school project, a community
event. Tribe Builder can host it as a **template on the general tribe**, not as a separate product.

- **What already exists.** Anyone can give to a tribe's treasury without joining
  ([fund-treasury.tsx](../../apps/web/src/components/treasury/fund-treasury.tsx)). Every spend is a proposal, voted on
  and public. Each tribe page has a share image. The assurance launch already holds money in escrow until a deadline
  and refunds it if a goal is not met.
- **What is missing.**
  1. Contributions are not indexed, so there is no progress bar and no list of gifts.
  2. Giving needs a signed-in wallet.
  3. There is no target or deadline on a treasury.
  4. There is nowhere to post updates.
  5. There is no way to close a tribe.
  6. A short-lived tribe may cost too much to create.
- **Where we compete.** Kenya's fundraising tradition (harambee) is already served well by M-Pesa-based apps. We will
  not be easier to give to. We can be more accountable: the money moves only by the group's vote, and everyone can see
  each payment.
- **Why fundraising first.** It is lower risk than the savings circle: no loans, caps, or share-out. It still tests
  the hard parts: the M-Pesa ramp, onboarding people with no wallet, and money held by a contract instead of a
  treasurer.
- **Recommendation.** Keep-what-you-raise fundraisers, built from what exists plus indexing, a template, and M-Pesa
  giving. No new contract for the pilot. An all-or-nothing fundraiser module comes later, if a group needs one.

```text
  F1 template + indexing        F2 M-Pesa giving        F3 M-Pesa payouts        F4 close a tribe
  (wallet givers only)    ──►   (no wallet needed) ──►  (pay suppliers)    ──►   (leftover money)
                                      │
                                      └── needs the answers from Kotani (Phase 0 of sacco-tribes)
                                                                                 later: fundraiser module
                                                                                 (all-or-nothing, optional)
```

## Where fundraising fits

| Kind of fundraiser | Fit | Why |
|---|---|---|
| Group project with a committee (school, clinic, water point) | strong | the risk is trust in whoever holds the money; voted, public spending answers it |
| Sports club or youth group buying equipment | strong | small committee, clear target, a reason to continue afterwards |
| Community event | strong | several suppliers to pay; each payment is a visible proposal |
| Giving from abroad to a home project | strong | givers abroad can pay in USDC; the public spending record matters more at a distance |
| One person's medical or funeral costs | weak | the money goes to one person anyway; a vote adds delay, not trust |

Pick the pilot groups from the strong rows. The best pilot group has a near-term goal with a known cost **and** a
reason to keep going. A club that raises for equipment now and collects monthly dues later can move to the
[savings circle](savings-circle.md) when it is ready.

## General platform, specific templates

The 2026-11-23 chat asked whether to keep the platform general and use tags for discovery, or build for specific
uses. Tags help people find a tribe, but they do not change what a newcomer sees first. So there are three layers:

| Layer | What it is | Changes for a fundraiser |
|---|---|---|
| Engine | tribe, token, treasury, proposals, modules | nothing |
| Template | a create-flow preset: sets defaults, hides settings that do not apply, and picks which card the tribe page shows first | new "Fundraiser" template |
| Tags | words in the profile JSON for search and filters in Discover | a "fundraiser" tag, set by the template |

One rule keeps the platform general: **a template never adds a new noun to user-facing copy.** It is still a tribe
with a treasury and proposals. A template may put a verb such as "Give" first, and it may hide settings, but the words
on every page stay the same. Today's create flow already has presets for membership type and voting pace
([create-dao-presets.ts](../../apps/web/src/lib/create-dao-presets.ts)), and the savings circle plan adds a "Savings
circle" preset. The Fundraiser template is the same kind of thing.

### The Fundraiser template

| Setting | Value | Why |
|---|---|---|
| Membership type | Invite only | the organisers are the members; givers do not need tokens |
| Tokens | locked, members-only delegation | organisers cannot sell their seat ([locked-tokens](locked-tokens.md)) |
| Voting pace | the fastest preset | suppliers should not wait days to be paid |
| Profile JSON | adds `purpose`, `target`, `deadline`, `display_currency`, `tags` | stored as event-only JSON (STORAGE_DIET § 6); changing the target needs a proposal, which is itself a record |
| Artwork | a default set supplied by the template | organisers should not have to design token art (to check: whether founder mints need artwork) |
| Lead card | fundraiser card | see below |

## The fundraiser page

```text
┌──────────────────────────────────────────────────────────────┐
│  New kit for Kibera Youth FC                                 │
│  Raised KSh 38,400 of KSh 60,000   ███████████░░░░░  64%     │
│  52 gifts · ends 15 January · 4 organisers                   │
│                                                              │
│  [ Give ]   [ Share ]                                        │
│                                                              │
│  Spent so far: KSh 12,000                                    │
│   · Boots from Toi Market supplier   KSh 12,000   voted 4–0  │
│                                                              │
│  Updates                                                     │
│   · 2 Dec  Boots bought. Photo and receipt attached.         │
└──────────────────────────────────────────────────────────────┘
```

- **Raised** comes from indexed contributions (below). The page shows amounts in shillings and holds USDC; the rate
  and its date are shown in the details.
- **Spent so far** lists executed spending proposals, each with its vote.
- **Updates** are short posts by the organisers. Each one is an event carrying a URI (IPFS text and photos), with no
  storage on-chain. That fits the chain-only rule in STORAGE_DIET. Posting needs an organiser's authorisation, but not a
  vote. Which contract carries the entry point is an F1 design question.
- **Share image.** The tribe page's existing `opengraph-image` gains the progress bar, so a link shared on WhatsApp
  shows the target and how much has been raised.
- **Discover.** A fundraiser is reachable by link only by default. Being listed in Discover is a choice, because
  public fundraising attracts scams and Discover should not appear to vouch for one.

## Giving

### Two ways to give

| Path | Who | Wallet | Status |
|---|---|---|---|
| Wallet | anyone with a Stellar wallet, including givers abroad | yes | exists (XLM or USDC); needs a "Give" entry point that does not require reading the treasury page |
| M-Pesa (and later phone credit) | everyone else | **no** | new; depends on the ramp |

Asking someone to create a wallet to give once is likely to lose many givers. In the M-Pesa path, **only organisers and
members have wallets.** The giver:

1. opens the shared link and taps "Give";
2. enters an amount and their M-Pesa number; the page shows the ramp's fee and the total;
3. confirms the M-Pesa prompt on their phone;
4. the ramp sends USDC directly to the tribe's treasury, and the page updates.

Tribe Builder never holds the money, and does not store the giver's phone number. The ramp handles it under its own
terms.

**Phone credit.** The 2026-11-18 meeting raised phone-credit vendors as a payment route. For savings, phone credit is weak
because members need cash back out. **For giving, that weakness does not matter: giving is one-way.** If the vendor
can settle in USDC on Stellar at a fair rate, phone credit may suit small gifts best. This waits on the phone-credit scope now being drafted.

### What the ramp has to support

The questions for Kotani in [sacco-tribes](sacco-tribes.md) Phase 0 apply, especially paying a contract address. Two
more come from fundraising:

6. **A reference on each payment.** A transfer into a contract address carries no memo. To show "52 gifts" and an
   optional giver name, we need the ramp's webhook to report each payment's transaction hash, with the name the giver
   chose to show. The page matches the two. Names are stored off-chain, only with the giver's consent, and are
   removable (Data Protection Act 2019).
7. **A standing payout account per supplier.** Spending is voted, and a vote can take days. A ramp quote usually
   lasts minutes. A proposal that pays a fixed USDC amount to a standing account linked to the supplier's M-Pesa
   number or till number avoids an expired quote at execution. The supplier receives shillings at the rate on the day
   the proposal executes.

If the ramp cannot pay a contract address, wallet-free giving waits. A forwarding account run by the platform would
mean the platform holds givers' money, which this design rules out. A forwarding account run by the organisers'
multisig is possible, but it brings back the treasurer risk this product exists to remove.

## Indexing contributions

The treasury page says it today: "Contributions don't appear in it." A gift is a plain asset transfer into the
treasury. The Treasury contract has no deposit entry point and emits no event, and the Goldsky pipeline only ingests
events from contracts on its allowlist (token, metadata, governor, treasury, and modules, taken from Manager events).
The asset contracts' `transfer` events are not ingested.

**Proposed:** ingest `transfer` events from the supported asset contracts (XLM and USDC) whose `to` is a known
treasury, into a new `dao_contributions` view: tribe, asset, amount, from, ledger, transaction hash. The progress bar,
the gift count and the activity feed ("Someone gave 500 KSh") read from it.

- **Volume.** USDC transfers on mainnet are many. Filter on the `to` topic early in the pipeline, against the set of
  known treasuries. To check: whether Goldsky can filter by a dynamic list on a topic value, as it does today for
  contract IDs.
- **Classic payments.** Since Protocol 23 (CAP-67), classic payments also emit `transfer` events from the asset
  contract. A treasury is a contract address, so classic payments cannot reach it anyway (to confirm against the
  final CAP-67 text).
- **Not only fundraisers.** Every tribe's treasury page gains a true contribution history. This is worth building
  even without the template.

## Spending

Spending is an ordinary proposal: no change to the Treasury or Governor. Two additions to the proposal composer
([PROPOSAL_ACTIONS](../PROPOSAL_ACTIONS.md)):

- **"Pay a supplier by M-Pesa":** a USDC transfer to the supplier's standing ramp account (question 7), with the
  shilling amount, supplier name, and the purpose shown in the description. A receipt is posted as an update after
  payment.
- **"Refund a gift":** a transfer back to a wallet giver's address. It is useful for mistakes. M-Pesa givers cannot
  be refunded this way, because we do not know their wallet. It would need the ramp's off-ramp to their number.

## Closing a tribe

Some fundraisers end. Nothing on-chain can be deleted, so "closed" is a state the tribe chooses by proposal:

1. **Leftover money.** The closing proposal does one of three things:
   - sends the rest to a cause or another tribe;
   - keeps the tribe going by switching its template (to the general tribe or the savings circle);
   - refunds wallet givers pro rata (M-Pesa givers cannot be refunded on-chain; see above).
2. **Profile.** The proposal sets `closed: true` in the profile JSON. The page shows a final summary (raised, spent,
   where the rest went), and the tribe leaves Discover.
3. **Storage.** The tribe stops renewing. Its entries archive in time, and anyone can restore them later
   ([TTL_ECONOMICS](../TTL_ECONOMICS.md)). The event history stays in the indexer, so the final summary page keeps
   working.

## Cost of a short-lived tribe

From [STORAGE_COSTS](../STORAGE_COSTS.md) and [REVENUE](../REVENUE.md) at $0.20 per XLM:

| Item | XLM | USD |
|---|---|---|
| `create_dao` | ~10 | ~$2 |
| Artwork (a small default set; the reference DAO's 10 KB costs ~18) | ~2–18 | ~$0.40–3.60 |
| `launch_dao` | ~0.6 | ~$0.12 |
| Creation fee (proposed, REVENUE OQ-4) | 50 | $10 |
| **Total** | **~63–79** | **~$13–16** |

For a KSh 60,000 target (about $460 at an assumed KSh 130 per USD), that is about 3%, which is a large share for a
small group. Options: a lower creation fee for the Fundraiser template, or waiving the fee while a fundraiser is open
and charging it if the tribe carries on. That is a decision for REVENUE OQ-4.

## Later: an all-or-nothing fundraiser module

Some fundraisers only make sense if the whole target is met: if a pitch costs KSh 500,000, raising KSh 200,000 does
not build it. The assurance launch in membership-models already has the right shape:

- escrow until a deadline (at most 90 days);
- `Met` or `Failed` decided by a rule anyone can compute;
- release to the Treasury on `Met`;
- each giver claims a refund on `Failed`.

But it counts claimers against a membership list before launch. A `fundraiser` module would apply the same pattern to
an amount, after launch, open to anyone:

```text
open(asset, target, deadline, uri)          Treasury; one open round at a time; deadline ≤ now + 90 days
contribute(from, amount, note_hash)         from auth; escrows; emits Contributed
state() -> Open | Met | Failed              Failed = now > deadline && raised < target
release()                                   anyone, once Met; sends everything to the Treasury
refund(from)                                anyone for `from`, once Failed; returns that giver's total
launch / handoff / renewal_keys / upgrade   DaoModule
```

This conflicts with wallet-free giving. A refund needs an address to return money to, and an M-Pesa giver has none.
Until the ramp can refund to a phone number, an all-or-nothing round accepts wallet gifts only, or treats ramp gifts
as keep-what-you-raise. That is why the pilot does not need this module.

## Phases

| Phase | Scope | Depends on |
|---|---|---|
| F0 | Run a pilot by hand with what exists: a tribe, gifts from wallets, spending by proposal, updates in the description | nothing |
| F1 | Contribution indexing; the Fundraiser template; the fundraiser card; updates as events; the share image with progress | Goldsky check on topic filtering |
| F2 | Giving by M-Pesa without a wallet; then phone credit | Kotani answers (Phase 0 of sacco-tribes, plus questions 6 and 7); the phone-credit scope |
| F3 | The "Pay a supplier by M-Pesa" action | question 7 |
| F4 | Closing a tribe | F1 |
| Later | The all-or-nothing `fundraiser` module | a group that needs it |

Each phase ships with its docs (the PR's Docs line). F1's design should go through `/plan-design-review` (the
template and the card) and `/plan-eng-review` (the pipeline change) before code.

## Pilot

One or two groups, found through the team's partner contacts in Kenya, matching the strong rows above.

- **Go** if most M-Pesa givers who start a gift finish it; a supplier is paid within a week of the spending vote; the
  organisers would use it again; and at least one group carries on after the fundraiser.
- **Stop or rethink** if givers drop off at the M-Pesa step, if fees take more than the group accepts, or if the
  organisers find voting on each payment slower than it is worth.

## Open questions

1. **The comparison app.** The app mentioned on 2026-11-23 is not named in these notes. What does it charge, how do
   organisers withdraw, and does it show spending? That sets the bar for "more accountable".
2. **Ramp questions 6 and 7** above, added to the Kotani list.
3. **Phone credit:** which vendor, what rate after fees, daily limits, and whether it settles in USDC on Stellar.
4. **Creation fee** for a Fundraiser template (REVENUE OQ-4).
5. **Who approves spending:** all organisers by vote (as proposed), or a smaller threshold for small payments? A
   threshold would reuse the approval paths sketched in sacco-tribes.
6. **Giver names:** anonymous by default, as proposed?
7. **Discover:** link-only by default, as proposed, and what makes a fundraiser eligible to be listed?
