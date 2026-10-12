# Who pays for storage

Builder DAOs live on Stellar, where every stored entry pays rent for the time it stays on the ledger. This page
answers, role by role, what you write, what you pay, what you have to renew, and what happens if you do not.
The full key-by-key reference is [TTL_ECONOMICS.md](TTL_ECONOMICS.md); the design is [STORAGE_DIET.md](STORAGE_DIET.md).

Every number below is **testnet, measured 2026-10-12**, rent only (add the network fee of a fraction of a cent
per transaction). Mainnet rates differ; the Renewal tab and `renew-code-ttl.mjs --dry-run` quote the live price.

| Rate | Value |
|---|---|
| Contract data | ~0.01 XLM per KB per day (98 stroops per byte-day) |
| Contract code | ~0.05 XLM per KB per day (514 stroops per byte-day), about five times data |
| Longest lifetime one renewal can buy | 180 days (`max_entry_ttl`) |

Rent is linear in time: renewing for 180 days twice costs the same as renewing for 30 days twelve times, minus
eleven transactions. Longer is never dearer per year.

## The short version

| Role | You write | You pay up front | You renew | If you do not |
|---|---|---|---|---|
| **Platform operator** | Contract code, the Manager registry, the shared Minter | ~2,000 XLM per 170 days for one copy of every contract's code | Code every ~5 months, with one command | Members start paying a few days of code rent per transaction; code archives after ~4 more days and every DAO stops until it is restored |
| **DAO creator** | Six contract instances, the artwork, founder tokens, the link | ~30 XLM for a DAO with 300 artwork items | Nothing more as creator | Handed to the DAO at launch |
| **DAO (whoever renews it)** | Nothing new | ~57 XLM per 180 days for the reference DAO | Everything the DAO owns, in one signature, from Manage → Storage renewal | Entries archive after 180 days; anyone restores them for about the same rent, plus a fee |
| **Member** | Your own ownership, balance and vote records | ~0.02 XLM with your first token | Automatically, 30 days, every time you act | After a quiet month the app restores your records before your next action (one extra signature, ~0.03 XLM) |
| **Proposer** | The proposal (270 B) and its id entry | ~0.5 XLM | The DAO sweep covers live proposals | Ended proposals archive; that is fine |
| **Voter** | Your vote record; the tally, if you vote first | ~0.005 XLM | Nothing | Nothing |
| **Proposal executor** | Whatever the actions write | The rent of what the proposal writes (usually 0 to 1 XLM) | Nothing | Nothing |
| **Bidder** | Nothing in the normal case | 0; ~0.25 XLM if your bid has to park a refund for the previous bidder | Nothing | Nothing |
| **Seller / buyer** | The listing (seller, ~250 B, 30 days) | ~0.01 XLM | Relist after 30 days | An expired listing is cleared by anyone; the token goes back to the seller |
| **Claimer** | Your claim marker | ~0.35 XLM | Nothing | Nothing |

## Platform operator

**What you keep alive.** Shared contract code (one entry per wasm hash, shared by every DAO on it), the Manager
instance and registry records (`Implementation`, `LatestImplementation`, `PlatformMinter`), and the shared Minter
instance. Code is the expensive part:

| | Size | 170 days | Per year |
|---|---|---|---|
| All eight contracts, one version each | 231 KB | ~2,020 XLM | ~4,330 XLM |
| One extra Governor version still run by older DAOs | 37 KB | ~325 XLM | ~700 XLM |
| Registry records, Manager and Minter instances | a few KB | under 10 XLM | under 20 XLM |

Every version a DAO still runs costs its own share, so an upgrade adds to the bill until the last DAO moves off
the old hash. Expect the bill to grow with the number of live versions, not with the number of DAOs.

**How.** One command, run before the shortest lifetime runs out:

```bash
node scripts/renew-code-ttl.mjs deploys/builder-testnet-manager.json --days 170 --dry-run   # quote
node scripts/renew-code-ttl.mjs deploys/builder-testnet-manager.json --days 170             # pay
```

It finds every hash from chain (current, latest, running on the Manager and Minter, and running on every known
DAO), simulates each extension, and splits any that would exceed 300 XLM in one transaction. New code is extended
to 170 days at upload by `deploy-manager.mjs` and `upgrade-contract.mjs`.

**If you lapse.** Contracts bump their own code only from 2 to 4 days, so a member's transaction pays at most a
few days of code rent (about 4 XLM for a 37 KB module) instead of the 300 XLM that used to be the trap. A
transaction that touches several contracts pays several bumps: `launch_dao` touches all seven, so during a lapse
a launch can cost tens of XLM and can trip the app's 50 XLM guard until the platform renews. If no transaction
lands in those days the code archives, and every DAO on it stops until someone submits a `RestoreFootprint` for
the hash (which costs roughly a renewal). `renew-code-ttl.mjs` refuses to run when it cannot read the Manager
itself (its code or instance archived): restore the Manager first.

**Your upgrades are on notice.** The Manager's own upgrade and the shared Minter's apply only `upgrade_delay()`
ledgers after you approve them (set at deployment with `upgradeDelayLedgers`; 7 days recommended on a public
network). You can lengthen the notice at once; shortening it waits out the notice in force. Every DAO pins the
Minter as a mint authority; during the notice each DAO's minter guardian can revoke it with one signature, so
the notice only needs to be long enough for someone to notice, not for a vote.

## DAO creator (launch admin)

**What you pay for.** `create_dao` writes six contract instances (~6 KB) and extends them to 170 days; adding
artwork writes the item pages, property names and IPFS groups (about 35 bytes per item plus 180 bytes per
property) for 180 days; each founder mint writes about 17 bytes of traits; launch writes the two link entries.

| Step | Reference DAO (16 properties, 304 items, 1 founder) |
|---|---|
| `create_dao` | ~10 XLM |
| Artwork (10 KB) | ~18 XLM |
| Founder mints | under 0.01 XLM each |
| `launch_dao` | ~0.6 XLM |
| **Total** | **~29 XLM** |

Everything you write is handed to the DAO at launch; from then on it is renewed by the DAO's sweep, not by you.
You stay the community's minter guardian until the Treasury changes that by proposal: if the platform announces
a Minter upgrade the community distrusts, you can pause the shared Minter at once (one signature, no rent).
Until launch, the Manager's pending record of your DAO is part of the same sweep (Manage → Storage renewal lists
it while the DAO has no link), so a setup that takes longer than 180 days is renewable too.

## The DAO: renewing

**What is renewed.** Everything the DAO owns, listed from chain by the app: the six instances, the artwork, the
latest supply and quorum checkpoints, live proposals, open listings, the link, the claim round, and the tokens and
funds the Treasury, Auction and Marketplace hold. Members' own records are not the DAO's (see below).

**How.** Manage → Storage renewal shows each class with its earliest expiry, quotes 30, 90 or 180 days (the
default) by simulation, shows what a year costs at that rate, and renews everything in **one transaction with one
signature**. Archived entries are restored first, in the same flow. Anyone may renew; the wallet that signs pays.
A DAO that wants to reimburse the renewer does so by proposal (the Treasury cannot submit a renewal itself, since
the extension is a transaction-level operation, not a contract call). The same runs from the command line:

```bash
node scripts/renew-dao.mjs --network testnet --token C... --days 180 --source <identity> --dry-run
```

**What it costs.**

| DAO | Sweep | Per 180 days | Per year |
|---|---|---|---|
| Reference (500 tokens, 304 items, 10 live proposals) | 32 KB, 62 entries | ~57 XLM | ~115 XLM |
| Larger (5,000 tokens, same artwork) | ~110 KB, ~130 entries | ~195 XLM | ~390 XLM |
| Per 1,000 extra tokens | +17 KB | +30 XLM | +60 XLM |

A sweep up to about 200 KB and 400 entries (roughly 9,000 tokens) fits one transaction; beyond that the app
signs two.

**If nobody renews.** After 180 days the entries archive. Nothing is deleted: anyone can restore an archived
entry with a `RestoreFootprint`, for about the rent it would have cost to renew plus a write fee. An archived
instance stops its contract until restored, so an abandoned DAO is paused, not lost. The Renewal tab shows
`Expired` and offers the restore. Once the RPC no longer returns an expired entry at all (eviction), the tab can
read nothing from the token; it then restores the module instances from the deployment record first (the CLI
takes `--dao <deploys/...-dao-N.json>` for the addresses) and lists the rest on the next run.

**Funds in other assets.** The sweep finds the auction's and market's payment assets and every open listing's
asset on chain. A balance in any other asset (a donation, fees in a former payment asset) is not discoverable;
it archives 30 days after its last use and is restored automatically when a proposal spends it (the proposal
page restores before signing). To keep it alive in the sweep, pass it to the CLI with `--asset`.

## Members

**What is yours.** Your token ownership entries, your balance and delegation records, your vote checkpoints, your
pending auction refund, your claim markers. Each is renewed for 30 days whenever you act (vote, transfer, bid,
delegate, claim), by the library that owns it, and the rent for those 30 days is in your transaction fee: about
0.02 XLM for a holder with one token.

**After a quiet month.** Your records archive. They are not lost: before your next action the app shows
"Restoring your archived records first", asks for one extra signature on a small restore transaction (about 0.03
XLM), waits for it, and then continues. Your tokens keep rendering in the meantime: `token_uri` does not depend on
your ownership entry.

**Voting.** A vote writes your `HasVoted` record (~150 B) and, for the first voter on a proposal, the tally
(~200 B): about 0.005 XLM. Vote weight comes from the snapshot ledger, so archived history never changes a result.

## Proposers and executors

**Proposing** writes the proposal (270 B, packed) and its id entry (160 B) for 120 days: about 0.5 XLM. The quorum
is fixed when you propose, from the current voting supply and rate, so nothing you or anyone does later changes
it. Live proposals are in the DAO sweep; ended ones archive, and that is by design (the id list skips them).

**Executing** a queued proposal is permissionless, and the executor pays the rent of whatever the actions write.
If an action reads something archived (a Treasury balance in an asset the sweep does not know, an old upgrade
approval), the proposal page restores it first with one extra signature. The executor pays for that too:
a renderer or profile update writes only instance data (negligible); `add_properties` rewrites one item page
(~1 XLM); `set_merkle_root` writes the root and round (~1 XLM); an upgrade writes the instance only. The app shows
the simulated fee before you sign.

## Bidders, sellers, buyers

**Bidding** writes nothing persistent in the normal case: the auction lives in the Auction instance and the
payment moves between balances you already have. If the previous bidder's refund cannot be pushed (their account
refuses the asset), your bid parks it as a `PendingRefund` entry for them (~0.25 XLM for 180 days).

**Selling** writes the listing (~250 B) for 30 days: about 0.01 XLM. The approval is temporary and expires with
the listing. An expired listing is cleared by anyone; the token returns to you. A listing's own `expires_at` can be
set further out than 30 days; past the storage lifetime the listing is covered by the DAO's sweep while open, and if
that lapses too the escrowed token waits until someone restores the listing entry.

**Buying** writes only your own ownership and balance records (a member's 0.02 XLM). A primary purchase mints the
token's traits (~17 B).

## Claimers

A merkle claim writes your claim marker (~200 B) for 180 days: about 0.35 XLM, paid with the claim. The DAO pays
for the claim round itself (root and `tree_uri`, ~1 XLM, by proposal). An archived marker is not a second chance:
archived entries are restored, not deleted, so a claim in the same round still fails once it is back.

## Questions

**How do I know when to renew?** Manage → Storage renewal shows the earliest expiry per class with a status chip
(healthy / renew soon under 45 days / renew now under 14 days / expired). The platform watches code with
`renew-code-ttl.mjs --dry-run`.

**Why did my transaction fail with "requires restoration"?** Something it reads has archived. For your own
records the app restores them first; for DAO-owned entries use the Renewal tab, which restores and renews
together.

**Why would a transaction want hundreds of XLM?** It should not any more: a member's call bumps shared code at
most 4 days. The app refuses to sign anything above 50 XLM and tells you to report it; the Renewal tab is the one
screen allowed to exceed that, with the price shown first.

**Is anything ever deleted?** No. Archival is a pause: every entry can be restored by anyone who knows its key,
for about the rent it would have cost to keep.

**Does a bigger DAO cost more?** Only in what it stores: about 17 bytes per token and 35 bytes per artwork item.
Proposals and auctions do not accumulate (ended proposals and old checkpoints leave the sweep).

**What about mainnet?** The same mechanics; different rates. Re-measure with the Renewal tab's quote and a
`--dry-run` before quoting anyone a price.
