# Auction contract

Continuous English auctions for one governance NFT at a time. Payment uses a configured Stellar Asset Contract (SAC); native XLM is used through its native SAC address, not a separate raw-XLM path.

## Constructor and launch

The constructor receives owner, Token, Treasury, duration, reserve price, bid increment, time buffer, payment SAC, Manager, current hash, and version. All wiring is fixed at construction; there is no `set_treasury`.

The module starts paused in Setup. Manager-only `launch(treasury, start, expected_payment_token)` sets Live, validates wiring/asset, and transfers ownership to Treasury. `start=true` mints/opens the first auction. Otherwise governance must grant Auction Token mint authority and unpause when starting it later.

## Interface and bounds

- `create_bid(bidder, token_id: u128, amount: i128)` requires bidder auth and minimum bid/reserve rules.
- `settle_and_create_new()` settles after the deadline and starts the next auction; `settle_auction()` settles while paused without a next auction.

- `cancel_auction()` is owner-only while paused. Unsold/canceled NFTs go to Treasury.
- `pause(caller)` / `unpause(caller)` require owner authorization; unpause requires Live state.
- `get_auction()` / `get_config()` read state; the former requires an auction to have started.
- `pending_refund(bidder)` reads deferred credit; `withdraw_refund(bidder)` requires bidder auth.
- Paused owner setters: `set_duration`, `set_reserve_price`, `set_min_bid_increment`, `set_time_buffer`, `set_payment_token`.
- Shared upgrade interface: `upgrade(from_hash, to_hash)`, `sync_version`, `version`, `wasm_hash`.

Paused settlement is permissionless and can settle before the auction deadline;
it is not the same as the owner's paused cancellation. The web rechecks the
reviewed settlement mode so it cannot silently mint a next auction instead.

Duration is 300–2,592,000 seconds, reserve at least 1,000 base units, increment 1–100%, and time buffer 1–86,400 seconds. Late bids extend the deadline subject to an extension-count cap. The payment token locks after the first bid; pausing does not unlock it.

Outbid refunds push best-effort. A failed push credits persistent pending refund and emits `RefundDeferred`; withdrawal emits `RefundWithdrawn`. `BidRefunded` means a successful push, not a deferred credit. Settlement proceeds go to Treasury. Deferred credit has its own TTL; see [maintenance](../../docs/TTL_ECONOMICS.md).

## Tests

`cargo test -p auction`; `cargo test -p dao-e2e`. [Implementation](src/contract.rs), [helpers](src/helpers.rs), [events](src/events.rs), and [storage](src/storage.rs) define the exact behavior.
