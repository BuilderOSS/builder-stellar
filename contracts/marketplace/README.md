# Marketplace contract

Per-DAO fixed-price sales. Primary listings mint on purchase; secondary listings escrow an existing NFT. Builder takes no protocol fee.

## Primary sales

```text
create_primary_listing(price: i128, expires_at: u64) -> u64
buy_primary(listing_id: u64, buyer: Address, max_price: i128) -> u32
cancel_primary(listing_id: u64)
expire_primary(listing_id: u64)
get_primary_listing(listing_id: u64) -> Option<PrimaryListing>
next_listing_id() -> u64
```

Primary creation/cancellation require Live state and the admin (Treasury). Create also requires unpaused state. A listing holds price, expiry and the current payment asset; nothing is minted or escrowed until purchase. `buy_primary` (buyer auth) fails with `PriceAboveMax` above `max_price`, pays the Treasury and mints to the buyer. Expiry cleanup is permissionless.

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

Price must be positive; expiry must be future, with no maximum. The fee is 0–2,500 bps (25%, `common::MAX_FEE_BPS`; `InvalidFee`). Primary `listing_id` and secondary `token_id` are separate keyspaces.

The constructor receives Token, the admin (launch admin), Treasury, payment asset, Manager, current hash/version, and default secondary fee. Manager-only `launch(treasury, open, expected_payment_asset)` validates wiring/asset, hands the admin to the Treasury (`AdminChanged`), sets open/paused state and emits `MarketplaceLaunched`.

Admin functions (`pause`, `unpause`, `set_payment_asset`, `set_secondary_fee_bps`, `upgrade`, `migrate`, `sync_version`) require the launch admin in setup and the Treasury after launch; their events carry the admin as `changed_by`. Pausing blocks new listings/purchases, not cancellation or expiry. Terminal listings are deleted; history lives in events/indexed views. Listing TTL is extended to 30 days when fewer than 7 remain.

Errors: block 7700. [Events](src/events.rs), [implementation](src/contract.rs), [storage](src/storage.rs). `cargo test -p marketplace`; cross-contract sales tests live in [dao-e2e](../e2e/README.md).
