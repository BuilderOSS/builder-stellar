# Marketplace contract

Per-DAO fixed-price sales. Quick-buy pools sell stock minted into the Marketplace's custody; secondary listings escrow an existing NFT. Tribes Builder takes no protocol fee.

## Quick-buy pools ([design §4](../../docs/designs/membership-models.md))

```text
open_pool(price, asset, expires_at, size, max_per_buyer, max_sold_per_period, period_secs) -> u32
restock(pool_id) -> u32
buy_from_pool(pool_id, page, token_id, buyer, max_price)
close_pool(pool_id); sweep_pool(pool_id) -> u32 (pages left)
get_pool(pool_id); pool_stock(pool_id, page) -> Vec<u32>; pool_purchases(pool_id, buyer); open_pools(); next_pool_id()
```

A proposal grants the Marketplace a mint allowance (`token.increase_mint_allowance`) and opens a pool (admin, Live, unpaused). Each pool reserves `size` of the allowance for itself: the allowance not reserved by other open pools must cover it (`AllowanceNotReserved`), so closing one pool never starves another. At most `MAX_OPEN_POOLS` (8) pools are open at once (`TooManyPools`); price, size, buyer cap, sales rate and period must be positive (`InvalidPrice`, `InvalidPool`).

Anyone calls `restock`, which mints up to `common::MAX_RESTOCK` (42) tokens into custody per call and appends the ids to stock pages of up to 64 (`PoolStock(pool, page)`), until the pool has stocked its size (`PoolFullyStocked`). Custody holds no votes. A buyer picks a specific id with `buy_from_pool` (buyer auth, unpaused). It pays the pool price to the Treasury and sends the token. It refuses when the pool is closed or expired (`PoolClosed`), past `max_per_buyer` (`BuyerLimitReached`), past `max_sold_per_period` in the current period (`PoolRateLimited`), above `max_price` (`PriceAboveMax`), or for an id not on that page (`NotInPool`).

`close_pool` needs the Treasury before expiry and anyone after it. It releases the pool's unstocked reservation back to the Token (`release_mint_allowance`). Anyone then calls `sweep_pool` until it returns 0: each call moves up to `MAX_SWEEP` (25) unsold tokens back to the Treasury and empties their pages.

## Secondary sales

```text
list(token_id: u32, seller: Address, price: i128, expires_at: u64,
     max_fee_bps: u32, payment_asset: Address)
buy(token_id: u32, buyer: Address, max_price: i128)
cancel(token_id: u32, seller: Address)
expire(token_id: u32)
get_listing(token_id: u32) -> Option<Listing>
```

The seller approves the Marketplace (`Token.approve`), then lists with seller auth. `max_fee_bps` and `payment_asset` are the terms the seller signed for: the listing fails with `FeeAboveMax` or `PaymentAssetMismatch` if the current config is worse, so a fee or asset change between signing and inclusion cannot apply. Listing escrows the token (its vote leaves the seller's delegate until it returns or is bought) and snapshots the fee and asset. `buy` fails with `PriceAboveMax` above `max_price`, splits payment between seller and Treasury, and delivers the token. Seller cancellation and permissionless expiry return the token to the seller.

## State and administration

Price must be positive; expiry must be future, with no maximum. The fee is 0–2,500 bps (25%, `common::MAX_FEE_BPS`; `InvalidFee`).

The constructor receives Token, the admin (launch admin), Treasury, payment asset, Manager, current hash and default secondary fee. It implements the Manager's `DaoModule` interface (`common::clients::DaoModuleApi`): Manager-only `launch(treasury, open)` checks the wiring, hands the admin to the Treasury (`AdminChanged`, unless `handoff` already did), sets open/paused state and emits `MarketplaceLaunched`; Manager-only `handoff(treasury)` hands the admin over early and stays in Setup; `payment_asset()` is compared by the Manager with the asset recorded at `create_dao` before launch; `renewal_keys(cursor, limit)` pages `Listing(0..minted)`, then each open pool's `Pool(id)` and `PoolStock(id, 0..pages)`, from instance storage only, and reports the token and payment balances it holds. `PoolBuyer(pool, buyer)` counts belong to buyers (holder class).

Admin functions (`pause`, `unpause`, `set_payment_asset`, `set_secondary_fee_bps`, `upgrade`, `migrate`) require the launch admin in setup and the Treasury after launch; their events carry the admin as `changed_by`. Pausing blocks new listings/purchases, not cancellation or expiry. Terminal listings are deleted; history lives in events/indexed views. Listing TTL is extended to 30 days when fewer than 7 remain.

Errors: block 7700. [Events](src/events.rs), [implementation](src/contract.rs), [storage](src/storage.rs). `cargo test -p marketplace`; cross-contract sales tests live in [dao-e2e](../e2e/README.md).
