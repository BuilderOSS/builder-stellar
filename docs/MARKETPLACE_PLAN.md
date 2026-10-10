# Marketplace v0.1 Plan

## Status

Approved architecture for a new per-DAO Marketplace module. Marketplace is
deployed alongside Token, Metadata, Auction, Governor, and Treasury by the
next Manager deployment. It starts at semantic version `0.1.0`.

## Goal

Each DAO can sell governance NFTs through a fixed-price marketplace without
giving Builder custody, an ongoing administrative role, or a claim on sale
proceeds.

Marketplace supports two inventory sources:

- **Primary inventory:** a Governor-approved action creates a primary listing
  (a price and expiry, no token). The NFT is minted to the buyer when the
  listing is bought. Nothing is minted or escrowed in advance.
- **Secondary inventory:** a holder escrows an existing Token NFT and lists it
  at a fixed price.

Auction remains the DAO's continuous auction module. Marketplace is for
explicit, fixed-price listings. v0.1 excludes offers, bidding, bundles,
seller-selected payment assets, and a Builder protocol fee.

## Authority Model

```text
Governor proposal (queued)
  -> anyone calls Treasury.execute
  -> Governor.consume, then Treasury calls Marketplace.create_primary_listing
  -> listing stored (no mint, no escrow)

Buyer
  -> Marketplace.buy_primary(listing_id, buyer, max_price)
  -> asset payment from buyer to Treasury
  -> Marketplace self-authorizes Token.mint -> NFT minted to the buyer
```

At DAO launch, Manager grants Marketplace Token mint authority together with
Treasury and, when enabled, Auction. Marketplace has no admin role over Token,
Treasury, Governor, Auction, or Metadata. Tokens it escrows carry no votes (the
token excludes the Marketplace from the voting supply), so a listed token's vote
leaves its holder's delegate until the token returns or is bought.

Admin functions (`create_primary_listing`, `cancel_primary`, `pause`, `unpause`,
`set_secondary_fee_bps`, `set_payment_asset`, `upgrade`, `migrate`,
`sync_version`) are gated by `common::admin`: the launch admin during setup, the
Treasury once launched (handed over at `launch`, event `AdminChanged`). `create_primary_listing` and `cancel_primary` additionally require the
Marketplace to be Live (`NotLive`), and `create_primary_listing` requires it to
be unpaused (`Paused`, 7713). Marketplace is therefore not an unrestricted
minter even though it has Token mint authority: it mints only inside
`buy_primary`, only for a listing the Treasury created, and only to the
paying buyer.

## Payment and Fee Policy

Every DAO Marketplace has one configured payment asset at a time. Sellers cannot
select an asset. The asset current at listing time is stored in each listing
(`payment_asset`) and is the asset charged on purchase; a later
`set_payment_asset` does not affect existing listings.

- Primary-sale proceeds go entirely to Treasury.
- Secondary-sale proceeds split between the seller and Treasury.
- Governance sets the default secondary fee in basis points, capped at 2,500
  (25%, `common::MAX_FEE_BPS`) by the contract.
- Marketplace snapshots the fee basis points into each secondary listing. A
  later governance change applies only to listings created afterward.
- The seller passes the worst fee (`max_fee_bps`) and the asset they accept to
  `list`, so a fee or asset change landing between signing and inclusion fails
  the listing (`FeeAboveMax`, `PaymentAssetMismatch`) instead of applying.
- Buyers pass `max_price` to `buy` / `buy_primary` (`PriceAboveMax`).

The DAO creation configuration supplies the initial payment asset and secondary
fee. `create_dao` records the payment asset in `PendingDao`, and `launch_dao`
passes it to `Marketplace.launch`, which fails with `PaymentAssetMismatch`
(7712) if the setup window changed it.

## Holder Escrow Flow

Escrow makes an active listing guaranteed purchasable. An approval-only order
can become stale when the owner transfers the NFT or revokes approval.

The initial flow uses Token's existing per-token approval:

1. Seller calls `Token.approve(seller, marketplace, token_id,
   approval_expiration_ledger)`.
2. Seller calls `Marketplace.list(token_id, seller, price, expires_at,
   max_fee_bps, payment_asset)`.
3. Marketplace requires seller authorization, verifies current ownership and
   valid listing inputs, then self-authorizes `Token.transfer_from` to move the
   NFT into Marketplace escrow.
4. Marketplace writes one active listing and emits `ListingCreated`.

The approval is consumed by the escrow transfer. Marketplace has no authority
over seller NFTs that are not actively escrowed.

## Contract Interface

### Admin (launch admin in setup, Treasury after launch)

```rust
create_primary_listing(price: i128, expires_at: u64) -> u64  // listing_id
cancel_primary(listing_id: u64)
set_secondary_fee_bps(fee_bps: u32)
set_payment_asset(payment_asset: Address)
pause()
unpause()
upgrade(from_hash: BytesN<32>, to_hash: BytesN<32>)
```

After launch these functions require Treasury authentication, which is
available only through `Treasury.execute` for a queued proposal.

### Holder and public functions

```rust
list(token_id: u32, seller: Address, price: i128, expires_at: u64,
     max_fee_bps: u32, payment_asset: Address)
buy(token_id: u32, buyer: Address, max_price: i128)
cancel(token_id: u32, seller: Address)
expire(token_id: u32)
buy_primary(listing_id: u64, buyer: Address, max_price: i128) -> u32  // token_id
expire_primary(listing_id: u64)
get_listing(token_id: u32) -> Option<Listing>
get_primary_listing(listing_id: u64) -> Option<PrimaryListing>
next_listing_id() -> u64
get_config() -> MarketplaceConfig
```

- `list` requires `seller` authorization and escrows the NFT.
- `buy` requires buyer authorization and succeeds only for a non-expired active
  listing.
- `cancel` requires the original seller authorization and returns the NFT.
- `expire` is permissionless. It returns an expired escrowed NFT to its original
  seller.
- `buy_primary` requires buyer authorization, an unpaused Marketplace
  (`Paused`) and an unexpired listing (`ListingExpired`). It removes the listing
  before any external call, then transfers the price to Treasury and mints one
  token to the buyer.
- `expire_primary` is permissionless once `expires_at` has passed
  (`ListingActive` before). It only deletes the listing; nothing is escrowed.
- Pausing blocks new listings and purchases (`list`, `create_primary_listing`,
  `buy`, `buy_primary`) but never blocks `cancel`, `expire`, `cancel_primary`
  or `expire_primary`.
- `expires_at` must be in the future; there is no upper bound.
- Primary listings are keyed by an incrementing `listing_id: u64`; secondary
  listings are keyed by `token_id: u32`.

## Active State Only

Marketplace persists only live protocol state:

```rust
MarketplaceConfig {   // the admin lives in common::admin
    token: Address,
    treasury: Address,
    payment_asset: Address,
    default_secondary_fee_bps: u32,
    manager: Address,
    paused: bool,
}   // hash and version come from wasm_hash() / version()

Listing {          // secondary, keyed by token_id
    seller: Address,
    price: i128,
    expires_at: u64,
    fee_bps: u32,
    payment_asset: Address,
}

PrimaryListing {   // keyed by listing_id
    price: i128,
    expires_at: u64,
    payment_asset: Address,
}
```

The Marketplace is constructed paused. The constructor takes `(token,
admin, treasury, payment_asset, manager, current_hash, version,
default_secondary_fee_bps)`. `launch(treasury, open, expected_payment_asset)`
sets paused to `!open` and emits `MarketplaceUnpaused` or `MarketplacePaused` if
the state changed, then `MarketplaceLaunched`.

Delete the listing immediately after a successful purchase, cancellation, or
expiry. Goldsky events provide listing discovery, seller inventory, sale
history, and API data. Persistent active-listing entries are per-key and
subject to the network TTL cap (about 180 days) while escrow remains live.

## Purchase Semantics

`buy` (secondary) and `buy_primary` follow checks-effects-interactions:

1. Require buyer authorization; load and validate the listing, pause state,
   and expiry.
2. Remove the active listing before external calls so it cannot be purchased
   twice.
3. Primary: transfer the whole price from buyer to Treasury in the listing's
   asset. Secondary: transfer the fee to Treasury and the remainder to the
   seller in the listing's asset, using checked arithmetic.
4. Primary: Marketplace self-authorizes `Token.mint` and mints to the buyer.
   Secondary: Marketplace self-authorizes the Token transfer from escrow to the
   buyer.
5. Emit `PrimaryListingPurchased` or `ListingPurchased`.

Any failure reverts the full Soroban transaction. A zero-amount payment
transfer (for example a 0 fee) is skipped.

## Events and Goldsky

Marketplace emits:

- `MarketplaceInitialized { #token, #admin, ... }`, `MarketplaceLaunched { #treasury, opened }`, `AdminChanged`
- Primary: `PrimaryListingCreated { #listing_id, price, expires_at, payment_asset }`,
  `PrimaryListingPurchased { #listing_id, #buyer, token_id, price, payment_asset }`,
  `PrimaryListingCancelled { #listing_id }`, `PrimaryListingExpired { #listing_id }`
- Secondary: `SecondaryListingCreated { #token_id, seller, price, expires_at, fee_bps, payment_asset }`,
  `ListingPurchased { #token_id, #buyer, seller, price, fee, payment_asset }`,
  `ListingCancelled { #token_id, seller }`, `ListingExpired { #token_id, seller }`
- `PaymentAssetUpdated { #changed_by, payment_asset }`, `SecondaryFeeUpdated { #changed_by, fee_bps }`
- `MarketplacePaused { #changed_by }` and `MarketplaceUnpaused { #changed_by }`
  (also emitted by `launch` when the pause state changes; `changed_by` is then
  the Manager)
- the common `Upgraded`, `VersionSynced` and `Migrated` (the old
  `MarketplaceUpgraded` is gone)

`ListingPurchased`, `ListingCancelled` and `ListingExpired` are secondary-only.
Primary and secondary listing ids are different keyspaces (`listing_id` versus
`token_id`); do not join them.

Events include DAO-identifying module addresses, token ID, seller where
applicable, buyer where applicable, price, fee, payment asset, timestamps or
ledger sequence, and previous/target version/hash for upgrades.

Goldsky is the canonical query layer for completed and deleted listing state.
The database keeps versioned Manager and module deployment facts plus append-only
Marketplace events. It must not depend on a permanent Manager DAO registry.

## Manager and DAO Integration

Manager becomes a six-module factory:

1. Register Marketplace WASM with role `Marketplace` and version `0.1.0`.
2. Maintain an active Marketplace implementation hash and reject it if revoked.
3. Derive a deterministic Marketplace salt/address with the other DAO module
   addresses.
4. Deploy Marketplace with Token, launch admin, Treasury, payment asset, Manager,
   current hash, version, and fee.
5. Include Marketplace in `DaoAddresses`, `PendingDao`, and `DaoCreated`.
6. During `launch_dao`, include Marketplace in the Token's launch minter set and
   call `Marketplace.launch` before deleting `PendingDao`.

Manager's only per-DAO state remains `PendingDao`. Marketplace is constructed
paused and the launch admin owns it during setup; no module holds Token mint
authority before launch, so neither Auction nor Marketplace can change total
supply. After launch, Treasury/governance controls their configuration and
inventory.

Launch checks only the recovery invariants:

```text
factory not paused
requested slug not claimed by a launched DAO
token admin == launch_admin
token voting supply > 0
Marketplace and Auction payment assets == the assets recorded at create_dao
```

## Retention Policy Across DAO Modules

The protocol stores a snapshot only while it is required to enforce a live
on-chain right or transition. Events and Goldsky retain history.

- **Manager:** delete `PendingDao` after launch.
- **Marketplace:** delete terminal listings after sale, cancellation, or expiry.
- **Auction:** retain only active auction and unresolved refund/claim state;
  delete terminal snapshots once no on-chain claim remains.
- **Governor:** retain proposal actions, vote accounting, and queue state until
  terminal execution, cancellation, or expiry; then delete bulky state.
- **Governor replay safety:** retain the smallest permanent execution/tombstone
  marker required to prevent an executed proposal from running again. Goldsky
  events cannot enforce on-chain replay protection.

## Upgrade Path

Marketplace starts at `0.1.0` and follows the DAO module upgrade policy:

1. A DAO Governor proposal dispatches `Marketplace.upgrade` through `Treasury.execute`.
2. Marketplace requires Treasury/module-owner authorization.
3. The supplied `from_hash` must match Marketplace's stored current hash.
4. Marketplace asks Manager to validate the registered, active approved
   `from_hash -> to_hash` transition and return its target version.
5. Marketplace stores the new hash/version, emits `MarketplaceUpgraded`, and
   calls `update_current_contract_wasm(to_hash)` on itself.

Manager cannot execute this upgrade. Its approval is only the platform
compatibility gate; the DAO's proposal and Marketplace's own checks authorize
and perform the WASM replacement.

All DAO module upgrades use the same proposal route: `Treasury.execute`
(callable by anyone for a queued proposal) calls `Governor.consume`, then
dispatches `target.upgrade`. A Treasury upgrade targets the Treasury itself and
is handled by its internal self-call allowlist (`upgrade`, `sync_version`).

Before any Marketplace upgrade, define whether active listing storage is
schema-compatible. If it is not, provide a bounded migration entrypoint and
test active listing recovery and purchase after migration.

## Implementation Phases

### Phase 1: Marketplace contract

- Add `contracts/marketplace` with contract, storage, errors, events, and tests.
- Implement lazy fixed-price primary listings, escrowed secondary listings, recovery,
  payment splitting, pause behavior, and upgrade checks.
- Add reentrancy, checked-arithmetic, authorization, and SAC failure tests.

### Phase 2: Manager and module wiring

- Add Marketplace implementation registration, deterministic deployment, version
  metadata, `PendingDao` address, and launch mint authority.
- Update creation validation and deployment scripts for the sixth WASM.
- Regenerate Manager, Marketplace, and affected module bindings.

### Phase 3: Governance and frontend flows

- Add a Governor proposal action for `create_primary_listing` and `cancel_primary`, and a buyer flow for `buy_primary`.
- Add seller approval and escrow-listing UX, buyer checkout, cancellation, and
  expiry recovery.
- Show primary, secondary, active, sold, and expired state from Goldsky.

### Phase 4: Goldsky and database

- Add Marketplace event decoders, DAO-scoped tables/views, and version fields.
- Index active listings and append-only sales without reconstructing Manager
  storage.
- Include Marketplace in deployment configuration and DAO routing.

### Phase 5: Verification and testnet baseline

- Unit-test every authority boundary and terminal-state deletion path.
- End-to-end test primary sale, secondary approval/escrow/list/buy, fee snapshot,
  cancellation, expiry, paused recovery, and failed SAC/NFT transfers.
- Test Manager creation/launch with both Auction and Marketplace deployed.
- Rehearse a state-preserving Marketplace `0.1.x` upgrade with an active listing.
- Deploy a fresh versioned testnet Manager and six initial `0.1.0` module WASMs,
  wipe the legacy read-model database, and begin Goldsky ingestion at the new
  Manager deployment ledger.
