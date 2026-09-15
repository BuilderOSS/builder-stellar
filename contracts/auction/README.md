# Auction Contract

Perpetual NFT auctions for the DAO. Each auction sells one governance NFT, sends the winning payment to the treasury, and can create the next auction after settlement.

## Behavior

- Payment uses the configured SAC token. Native XLM is not supported.
- The first bid must meet `reserve_price`; later bids must meet the configured percentage increment.
- A bid inside `time_buffer` extends the auction, up to the extension limit.
- The contract starts paused. The owner unpauses it to launch the first auction.
- Anyone can call `settle_and_create_new` after an auction ends.
- Configuration changes are owner-only and require the contract to be paused.

## Constructor

```text
__constructor(
  owner,
  token_contract,
  treasury,
  duration,
  reserve_price,
  min_bid_increment_percent,
  time_buffer,
  payment_token
)
```

`payment_token` must be `Some(Address)`. The minimum auction duration is 300 seconds. The reserve price must be at least 1,000 stroops, and the bid increment must be between 1% and 100%.

## Main Methods

- `pause(caller)` / `unpause(caller)` - stop or resume auction operations.
- `create_bid(bidder, token_id, amount)` - place a bid using the configured SAC token.
- `settle_and_create_new()` - settle the current auction and start the next one.
- `settle_auction()` - settle without creating another auction.
- `cancel_auction()` - cancel the active auction under the contract's cancellation rules.
- `get_auction()` / `get_config()` - read current state and configuration.

Configuration setters are `set_duration`, `set_reserve_price`, `set_min_bid_increment`, `set_time_buffer`, `set_payment_token`, and `set_treasury`.

## Related Contracts

```text
Auction -> Token       mint the NFT
Auction -> Treasury    deliver auction proceeds
```

## Tests

From the repository root:

```bash
pnpm dao:test:unit
pnpm dao:test:e2e
```
