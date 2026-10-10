# Auction contract

Continuous English auctions for one governance NFT at a time. Payment uses a configured Stellar Asset Contract (SAC); native XLM is used through its native SAC address.

## Constructor and launch

The constructor receives the admin (launch admin), Token, Treasury, duration, reserve price, bid increment, time buffer, payment SAC, Manager, current hash, and version. All wiring is fixed at construction.

The module starts paused in Setup. Manager-only `launch(treasury, start, expected_payment_token)` sets Live, validates wiring/asset, hands the admin to the Treasury (`AdminChanged`) and emits `AuctionLaunched`. `start=true` unpauses and creates the first auction; otherwise governance grants Auction mint authority and unpauses later.

## Interface and bounds

- `create_bid(bidder, token_id: u128, amount: i128)` requires bidder auth; the amount must meet the reserve (first bid) or the previous bid plus the increment, validated before any payment moves.
- `settle_and_create_new()` settles and starts the next auction; `settle_auction()` settles while paused without a next auction. **Both require `now >= end_time`** (`AuctionActive`), so a pause cannot end a running auction early. No-bid auctions send the token to the Treasury (where it carries no votes).
- `cancel_auction()` is admin-only while paused: the only way to end a running auction. It refunds the leader and sends the token to the Treasury.
- `pause(caller)` / `unpause(caller)` require the caller to be the admin; unpause requires Live state and starts an auction if none is running.
- `get_auction()` (fails `NotLaunched` before the first auction) / `get_config()`.
- `pending_refund(bidder)`; `withdraw_refund(bidder)` requires bidder auth.
- Paused admin setters: `set_duration`, `set_reserve_price`, `set_min_bid_increment`, `set_time_buffer`, `set_payment_token`.
- `admin()`, `upgrade(from_hash, to_hash)`, `migrate()`, `sync_version()`, `version()`, `wasm_hash()`, `storage_version()`.

Duration is 300–2,592,000 seconds, reserve at least 1,000 base units, increment 1–100%, and time buffer 1–86,400 seconds. Late bids extend the deadline subject to an extension-count cap. The payment token locks after the first bid.

Outbid refunds push best-effort. A failed push credits a persistent pending refund and emits `RefundDeferred`; withdrawal emits `RefundWithdrawn`. `BidRefunded` means a successful push. See [TTL maintenance](../../docs/TTL_ECONOMICS.md).

Errors: block 7400.

## Tests

`cargo test -p auction`; `cargo test -p dao-e2e`. [Implementation](src/contract.rs), [helpers](src/helpers.rs), [events](src/events.rs), and [storage](src/storage.rs) define the exact behavior.

Paused settlement (`settle_auction`) is permissionless but, like
`settle_and_create_new`, requires `now >= end_time`; it never starts a next
auction. The web rechecks the settlement mode so it cannot silently mint a next
auction instead, and never offers settlement before the end time.
