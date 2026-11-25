# State machines

These diagrams show the main state machines in the contracts, with their transitions and guards. Each transition names the entry point, who may call it, and what it checks; error names are in brackets, with the code where the project defines it. The Rust source is authoritative: where a diagram and the code differ, the code is right and the diagram is a documentation bug.

The diagrams were checked against `dev` at `b1ef765`, which includes pull requests 118 to 120. Times are ledger timestamps in seconds unless a field says it holds a ledger number.

- [Module lifecycle: Setup, handoff, Live](#module-lifecycle-setup-handoff-live)
- [Proposal](#proposal)
- [Assurance drive and claim lists](#assurance-drive-and-claim-lists)
- [Auction](#auction)
- [Listings](#listings)
- [Quick-buy pools](#quick-buy-pools)

## Module lifecycle: Setup, handoff, Live

Every DAO contract (Token, Metadata, Governor, Treasury, and each Manager-deployed module) holds two pieces of state that decide who can act on it: the `Live` flag ([`common/src/lifecycle.rs`](../../contracts/common/src/lifecycle.rs)) and the admin ([`common/src/admin.rs`](../../contracts/common/src/admin.rs)). The DAO as a whole moves through three states, which the Manager drives for every contract at once.

```mermaid
stateDiagram-v2
    [*] --> Setup: manager.create_dao
    Setup --> Setup: launch admin configures, mints founders, opens free lists, upgrades
    Setup --> Setup: manager.create_module
    Setup --> HandedOff: manager.open_assurance
    Setup --> Live: manager.launch_dao
    HandedOff --> Live: manager.launch_when_ready or launch_dao
    HandedOff --> HandedOff: drive failed, refunds, release_slug, recover_claims
    Live --> Live: Treasury acts by proposal
    Live --> Live: manager.create_module, then registration by proposal
```

| State | `Live` flag | Admin of every contract | Who can change settings, mints, and upgrades |
| --- | --- | --- | --- |
| Setup | false | The launch admin | The launch admin, directly |
| HandedOff | false | The Treasury | Nobody: the Treasury acts only through executed proposals, and proposals need `Live` |
| Live | true | The Treasury | The Treasury, by proposal |

A DAO that is never launched stays in Setup, or in HandedOff after a failed drive. There is no transition out of either other than launch.

### Transitions

| Transition | Entry point and caller | Guards |
| --- | --- | --- |
| Create | `manager.create_dao(params)`; the deployer and the launch admin both sign | Factory not paused (`FactoryPaused`, 7111); a valid initial config; slug not held by a launched DAO; the factory's current hash set and not revoked for every contract it deploys; an outside vote source approved. Deploys the core four and the modules named in the params, each with the launch admin as admin, and registers the modules in the Token's registry |
| Add a module | `manager.create_module(token, spec, expected_n)`; the Token's admin: the launch admin in Setup, the Treasury by proposal once Live | Factory not paused; the DAO is pending or launched (`DaoNotFound`); `expected_n` equals the number of modules of that kind created so far (`StaleModuleIndex`); a valid spec on the factory's current hash. In Setup the Manager also registers the module in the Token's registry, and only the Manager can ([`token` `require_registrar`](../../contracts/token/src/contract.rs)). For a launched DAO it deploys the module with the Treasury as admin and launches it at once, closed; the Treasury registers it by a separate proposal |
| Configure | Admin-gated setters on each contract; the admin | `common::admin::require_admin`. The same setters serve the Treasury after launch |
| Hand off | `manager.open_assurance`; the launch admin | See [Assurance drive](#assurance-drive-and-claim-lists). Calls `handoff(treasury)` on every contract: Manager authorization, Setup only (`AlreadyLive`, 7002), `treasury` equal to the one wired at construction (`TreasuryMismatch`) |
| Launch | `manager.launch_dao(token, config)`; the launch admin. `manager.launch_when_ready(token)`; anyone, during a drive | Factory not paused; without a drive, the launch admin is still the Token admin (`LaunchAdminNotOwner`, 7126); with a drive, not failed (`AssuranceFailed`) and `Met` (`AssuranceNotMet`); slug still free unless the drive holds it (`SlugTaken`, 7123); every contract's current `wasm_hash()` registered and not revoked (`PendingDaoUsesRevokedImplementation`, 7121); voting supply above zero (`LaunchSupplyZero`, 7120); an outside vote source approved and nonzero; each module's payment asset equal to the one recorded at creation (`PaymentAssetMismatch`) |

`launch` runs on the Token, Governor, Treasury, every registered module, and then Metadata, in one transaction. Each call is Manager-only and one-shot: `common::lifecycle::mark_live` fails with `AlreadyLive` (7002) on a second call. Each also hands the admin to the Treasury unless the drive already did (`handoff_once`), so no contract leaves launch with another admin. If any step fails the whole launch reverts and every contract stays in its previous state. During a drive, `launch_dao` uses the launch config stored at `open_assurance` rather than the one passed in.

In Setup, only the admin and the ClaimMinter can mint: the Token refuses every other module until launch (`MintAuthorityNotAllowed`, [`spend_mint_authority`](../../contracts/token/src/contract.rs)). Live-only entry points fail with `NotLive` (7001) before launch; see the table in [`docs/SECURITY_MODEL.md`](../SECURITY_MODEL.md#lifecycle-setup-window-and-launch).

After launch, the Manager holds no authority over the DAO's contracts. It still deploys a module the Treasury asks for, but only the Treasury can register it. The Treasury may also register a contract the Manager never deployed; such a module has its own lifecycle and is never launched by the Manager.

TODO: contract changes in progress may change this section; update it when they merge.

## Proposal

The Governor ([`governor/src/contract.rs`](../../contracts/governor/src/contract.rs)) stores four states: `Pending`, `Queued`, `Executed`, and `Canceled`. `Active`, `Succeeded`, `Defeated`, and `Expired` are computed from the clock and the tally whenever the state is read (`proposal_state_internal`), so they need no transaction.

```mermaid
stateDiagram-v2
    [*] --> Pending: propose
    Pending --> Active: now >= vote_start
    Pending --> Canceled: cancel by proposer
    Active --> Canceled: cancel by proposer
    Active --> Succeeded: now >= vote_end, quorum met and for > against
    Active --> Defeated: now >= vote_end, otherwise
    Succeeded --> Queued: queue
    Succeeded --> Expired: now >= vote_end + 14 days
    Queued --> Executed: treasury.execute calls consume, now >= eta
    Queued --> Expired: now >= eta + 14 days
    Executed --> [*]
    Canceled --> [*]
    Defeated --> [*]
    Expired --> [*]
```

| Entry point | Caller | Guards and effect |
| --- | --- | --- |
| `propose(targets, functions, args, description, proposer)` | Any account that holds enough votes | `Live` (`NotLive`, 7001); proposer authorization; proposer's votes at the snapshot (the previous ledger) at least the threshold (`InsufficientProposerVotes`). The threshold is capped at the voting supply at the snapshot and never below 1 (`votes_needed_to_propose()`); 1 to 20 actions (`EmptyProposal`; `TooManyActions`, 7508); matching lengths; description within the OpenZeppelin limit; id not already used (`ProposalAlreadyExists`). Sets `vote_start = now + voting_delay`, `vote_end = vote_start + voting_period`, and fixes the quorum, `ceil(voting_supply × quorum_bps / 10,000)` from the supply at the snapshot |
| `cast_vote` | Any account with votes at the snapshot | `Live`; voter authorization; state `Active` (`ProposalNotActive`); weight at the snapshot above zero (`ZeroVotingWeight`, 7512); one vote per account (OpenZeppelin `count_vote`) |
| `queue` | Anyone | `Live`; state `Succeeded` (`ProposalNotSuccessful`, `ProposalAlreadyExecuted`). Sets `eta = now + queue_delay` |
| `treasury.execute` then `governor.consume` | Anyone calls `execute`; `consume` requires the Treasury's authorization | `Live`; state `Queued` (`ProposalNotQueued`, `ProposalAlreadyExecuted`); `now >= eta` (`ProposalNotReady`, 7513). Marks the proposal `Executed`; the Treasury then runs each action in order. If any action fails, the whole transaction reverts, including the `Executed` mark, and the proposal stays `Queued` |
| `cancel` | The proposer only | Proposer authorization (`ProposalNotCancellable` for anyone else); state `Pending` or `Active` |
| `governor.execute` | Anyone | Always fails (`UseTreasuryExecute`, 7507) |

The voting delay, voting period, and queue delay are each 300 seconds to 30 days. A Governor without `votes_needed_to_propose` (0.5.0 and earlier) applies the configured threshold uncapped.

TODO: contract changes in progress may change this section; update it when they merge.

## Assurance drive and claim lists

An assurance drive is a paid claim list that must reach a number of distinct claimers before a deadline for the DAO to launch. The Manager records the drive ([`manager/src/contract.rs`](../../contracts/manager/src/contract.rs) `open_assurance`, `launch_when_ready`, `release_slug`, `recover_claims`); the ClaimMinter holds the list and the escrow ([`minter/src/contract.rs`](../../contracts/minter/src/contract.rs)).

```mermaid
stateDiagram-v2
    [*] --> Open: manager.open_assurance
    Open --> Open: claim, paid into escrow
    Open --> Met: claimers >= threshold_claimers
    Met --> Met: claim, paid into escrow
    Met --> Launched: launch_when_ready or launch_dao, then release
    Open --> Failed: now > deadline and Token not Live
    Met --> Failed: now > deadline and Token not Live
    Failed --> Failed: refund, release_slug, recover_claims
    Launched --> [*]
```

`assurance_state(list_id)` computes `Failed` first (the deadline has passed and the Token is not Live), then `Met` (at least `threshold_claimers` distinct addresses have claimed), otherwise `Open`. The Manager uses the same failure rule itself (`drive_failed`) and reads only `Met` from the ClaimMinter. `Launched` is not a stored state: it is the Token being Live.

| Entry point | Caller | Guards and effect |
| --- | --- | --- |
| `manager.open_assurance(token, list, launch_config)` | The launch admin | Factory not paused; no drive yet (`AssuranceExists`); the launch admin is still the Token admin; a ClaimMinter is registered (`NoClaimMinter`); `deadline` at most 90 days away (`DeadlineTooFar`); slug free (`SlugTaken`). The ClaimMinter's `open_list` then checks the terms: price not negative, `total` above zero, `expires_at` in the future, an `ipfs://` tree URI, `threshold_claimers` above zero and `deadline` between now and `expires_at` (`InvalidAssurance`), the payment asset recorded at creation, artwork present, and one assurance list per ClaimMinter. Grants the ClaimMinter `total` mint allowance, claims the slug, and hands every admin to the Treasury |
| `claim(list_id, claimer, leaf_amount, mint_now, proof, max_price)` | The claimer named in the list | Claimer authorization; before `expires_at` (`ListExpired`); drive not failed (`AssuranceFailed`); price at most `max_price` (`PriceAboveMax`); `mint_now` from 1 to `MAX_BATCH_MINT` (43); a valid Merkle proof for `(claimer, leaf_amount)` (`MerkleProofInvalid`); the claimer's total within `leaf_amount` (`AlreadyClaimed`); the list's total within `total` (`ListSoldOut`); the ClaimMinter's mint allowance (Token errors propagate). Before launch the payment goes into the list's escrow; after launch it goes to the Treasury. A claimer's first claim adds one to `claimers` |
| `launch_when_ready(token)` | Anyone | Every launch guard in the [module lifecycle](#module-lifecycle-setup-handoff-live), with the stored launch config. The launch calls `release` in the same transaction |
| `release(list_id)` | Anyone | Token Live (`TokenNotLive`). Moves the list's whole escrow to the Treasury wired at construction and sets it to zero |
| `refund(list_id, claimer)` | Anyone; the funds go only to the claimer | The list is the assurance list (`NotAssurance`); the drive failed (`NotFailed`); the claimer has escrow (`NothingToRefund`). Sets the claimer's escrow to zero, subtracts it from the list's escrow, and pays it back. The claimer keeps the tokens, which carry no power because the DAO never goes Live |
| `manager.release_slug(token)` | Anyone | The drive failed (`AssuranceNotFailed`); the slug is still held by this DAO (`SlugNotFound`) |
| `manager.recover_claims(token, from_hash, to_hash)` | The launch admin recorded for the pending DAO | The drive failed by the Manager's rule; the registry approves `from_hash` to `to_hash` (`InvalidUpgradePath`). Calls the ClaimMinter's `recovery_upgrade`, which needs the Manager's authorization and Setup |

Because `release` needs the Token Live and `refund` needs it not Live, the two can never both pay out from the same drive.

### Claim lists in general

Every claim list, assurance or free, follows the same shorter lifecycle:

```mermaid
stateDiagram-v2
    [*] --> Claimable: open_list
    Claimable --> Claimable: claim
    Claimable --> Ended: now >= expires_at
    Claimable --> Ended: close_list by the admin
    Ended --> [*]
```

`open_list` is admin-only: the launch admin in Setup (a priced or assurance list also needs the Manager's authorization, so it comes through `open_assurance`), the Treasury by proposal once Live, where assurance terms are refused (`AssuranceNotAllowed`). A free list opened in Setup stays claimable after launch until it ends. `close_list` sets `expires_at` to now and emits `ListClosed`; it refuses a list that has already ended (`ListExpired`) and the assurance list before launch (`AssuranceNotAllowed`).

TODO: contract changes in progress may change this section; update it when they merge.

## Auction

The Auction ([`auction/src/contract.rs`](../../contracts/auction/src/contract.rs), [`helpers.rs`](../../contracts/auction/src/helpers.rs)) sells one new token at a time. It starts paused, holds at most one auction, and keeps a separate pause flag (OpenZeppelin `pausable`).

```mermaid
stateDiagram-v2
    [*] --> PausedIdle: constructor (paused, no auction)
    PausedIdle --> Running: launch with start, or unpause after launch
    Running --> Running: create_bid
    Running --> Ended: now >= end_time
    Ended --> Running: settle_and_create_new
    Running --> PausedOpen: pause
    Ended --> PausedOpen: pause
    PausedOpen --> Running: unpause, auction not ended
    PausedOpen --> Ended: unpause, auction ended
    PausedOpen --> PausedIdle: settle_auction, after end_time
    PausedOpen --> PausedIdle: cancel_auction
```

`PausedIdle` covers both "no auction yet" and "last auction settled or cancelled". `Ended` is computed: the auction is unsettled and `now >= end_time`.

| Entry point | Caller | Guards and effect |
| --- | --- | --- |
| `launch(treasury, start)` | The Manager | One-shot (`AlreadyLive`); Treasury matches. With `start`, unpauses and creates the first auction, which mints the token into the Auction's custody |
| `unpause(caller)` | The admin (the Treasury after launch) | `Live`; admin authorization (`Unauthorized`). Creates a new auction if there is none or the last one is settled |
| `pause(caller)` | The admin | Admin authorization |
| `create_bid(bidder, token_id, amount, comment)` | Any bidder | Not paused; bidder authorization; the current token (`InvalidTokenId`); `now < end_time` (`AuctionOver`); the first bid at least the reserve (`ReservePriceNotMet`), later bids at least the previous bid plus the minimum increment (`MinBidNotMet`). Takes the bid, refunds the previous leader, and extends `end_time` to `now + time_buffer` when less than the buffer remains, a bounded number of times |
| `settle_and_create_new()` | Anyone | Not paused; not settled; `now >= end_time` (`AuctionActive`, 7404). Marks it settled, sends the token to the winner and the bid to the Treasury (or the token to the Treasury if there was no bid), then creates the next auction |
| `settle_auction()` | Anyone | Paused; the same checks as above, without creating a new auction |
| `cancel_auction()` | The admin | Paused; not settled (`AuctionSettled`). Refunds the leader, marks it settled, and sends the token to the Treasury |
| `withdraw_refund(bidder)` | The bidder | A credited refund exists (`NoPendingRefund`, 7416) |
| Setters (`set_duration`, reserve, increment, time buffer, and others) | The admin | Paused |

A refund to an outbid leader is pushed; if the transfer fails, the amount is credited and the bidder pulls it with `withdraw_refund`. A pause cannot end a running auction early: settlement on either path needs `now >= end_time`.

TODO: contract changes in progress may change this section; update it when they merge.

## Listings

A listing is a token a holder escrows in the Marketplace ([`marketplace/src/contract.rs`](../../contracts/marketplace/src/contract.rs)) at a fixed price.

```mermaid
stateDiagram-v2
    [*] --> Escrowed: list
    Escrowed --> Sold: buy
    Escrowed --> Returned: cancel by the seller
    Escrowed --> Returned: expire, now >= expires_at
    Sold --> [*]
    Returned --> [*]
```

| Entry point | Caller | Guards and effect |
| --- | --- | --- |
| `list(token_id, seller, price, expires_at, max_fee_bps, payment_asset)` | The token's owner | `Live`; not paused; price above zero; `expires_at` in the future; seller authorization; the current fee at most `max_fee_bps` (`FeeAboveMax`, 7714); the current asset equal to `payment_asset` (`PaymentAssetMismatch`, 7712); no listing for the token (`ListingExists`); the seller owns it (`NotSeller`). Moves the token into escrow and records the fee and asset in force |
| `buy(token_id, buyer, max_price)` | Any buyer | `Live`; not paused; buyer authorization; listing exists; `now < expires_at` (`ListingExpired`); price at most `max_price` (`PriceAboveMax`, 7715). Pays the recorded fee to the Treasury and the rest to the seller, in the recorded asset, and sends the token to the buyer |
| `cancel(token_id, seller)` | The seller | Seller authorization; the seller recorded on the listing (`NotSeller`). Works while paused. Returns the token |
| `expire(token_id)` | Anyone | `now >= expires_at` (`ListingActive`). Works while paused. Returns the token to the seller |

A token in escrow carries no votes, because the Marketplace is a non-voting module; its votes return with it.

## Quick-buy pools

A pool sells new tokens at a fixed price into the Treasury, within per-buyer and per-period caps.

```mermaid
stateDiagram-v2
    [*] --> Open: open_pool
    Open --> Open: restock
    Open --> Open: buy_from_pool
    Open --> Closed: close_pool by the admin
    Open --> Closed: close_pool by anyone, now >= expires_at
    Closed --> Closed: sweep_pool
    Closed --> [*]: sweep_pool returns 0
```

An open pool past `expires_at` refuses `restock` and `buy_from_pool` (`PoolClosed`) until someone closes it.

| Entry point | Caller | Guards and effect |
| --- | --- | --- |
| `open_pool(...)` | The admin: the Treasury, by proposal | `Live`; not paused; price above zero; `expires_at` in the future; size, `max_per_buyer`, `max_sold_per_period`, and `period_secs` above zero (`InvalidPool`); fewer than the maximum open pools (`TooManyPools`); the Marketplace's mint allowance not reserved by other open pools covers `size` (`AllowanceNotReserved`) |
| `restock(pool_id)` | Anyone | `Live`; open and not expired (`PoolClosed`); stock left to mint (`PoolFullyStocked`). Mints the next chunk into the Marketplace's custody, spending its allowance |
| `buy_from_pool(pool_id, page, token_id, buyer, max_price)` | Any buyer | `Live`; not paused; buyer authorization; open and not expired; price at most `max_price`; the buyer under `max_per_buyer` (`BuyerLimitReached`); the period under `max_sold_per_period` (`PoolRateLimited`); the token in that stock page (`NotInPool`). Pays the price to the Treasury and sends the token to the buyer |
| `close_pool(pool_id)` | The admin at any time; anyone once expired | Not already closed. Lowers the Marketplace's mint allowance by the unminted part of the reservation (`release_mint_allowance`). Unsold stock stays in custody |
| `sweep_pool(pool_id)` | Anyone | Closed (`PoolOpen`). Returns up to a fixed number of unsold tokens to the Treasury per call, until it returns 0 |

Each token sold from a pool adds a vote for its buyer. The per-buyer cap counts addresses, not people.

TODO: contract changes in progress may change this section; update it when they merge.
