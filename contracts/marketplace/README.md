# Marketplace contract

Per-DAO fixed-price sales. Primary listings mint on purchase; secondary listings escrow an existing NFT. Builder takes no protocol fee.

## Primary sales

```text
create_primary_listing(price: i128, expires_at: u64) -> u64
buy_primary(listing_id: u64, buyer: Address) -> u32
cancel_primary(listing_id: u64)
expire_primary(listing_id: u64)
get_primary_listing(listing_id: u64) -> Option<PrimaryListing>
next_listing_id() -> u64
```

Primary creation/cancellation require Live state and Treasury authority. Create also requires unpaused state. A listing contains price, future expiry, and current payment asset; it mints/escrows nothing until purchase. Buyer auth pays Treasury and Marketplace mints directly to the buyer. Expiry cleanup is permissionless and returns no NFT because none was escrowed.

## Secondary sales

```text
list(token_id: u32, seller: Address, price: i128, expires_at: u64)
buy(token_id: u32, buyer: Address)
cancel(token_id: u32, seller: Address)
expire(token_id: u32)
get_listing(token_id: u32) -> Option<Listing>
```

Seller approves Marketplace through `Token.approve(owner, spender, token_id, expiration_ledger)`, then lists with seller auth. Listing moves the token into escrow and snapshots payment asset and fee. Buying transfers escrow to buyer and splits payment between seller/Treasury. Seller cancellation and permissionless expiry return the NFT to the original seller, not the cleanup caller.

## State and administration

Price must be positive; expiry must be future, with no contract maximum duration. Fee is 0–10,000 bps (up to 100%). Payment assets and fees are snapshotted per listing; later changes do not reprice an existing listing. Primary `listing_id` and secondary `token_id` are separate keyspaces.

The constructor receives Token, launch admin, Treasury, payment asset, Manager, current hash/version, and default secondary fee. Manager-only `launch(treasury, open, expected_payment_asset)` validates wiring/asset, sets Live/open state, and hands ownership to Treasury.

Admin functions are `pause`, `unpause`, `set_payment_asset`, `set_secondary_fee_bps`, `upgrade`, and `sync_version`. They require launch-admin authority in Setup, Treasury after launch. Pausing blocks new listings/purchases, not cancellation/expiry recovery. Terminal listings are deleted; history lives in events/indexed views. Persistent listing TTL is 30 days on touch, distinct from sale expiry.

Upgrades emit shared `Upgraded`/`VersionSynced`, not the removed `MarketplaceUpgraded`. [Events](src/events.rs), [implementation](src/contract.rs), [storage](src/storage.rs). `cargo test -p marketplace`; cross-contract sales/auth tests live in [dao-e2e](../e2e/README.md). [Web trading and preparation API](../../apps/web/README.md).
