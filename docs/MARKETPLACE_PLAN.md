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

- **Primary inventory:** a Governor-approved action asks Marketplace to mint a
  new Token NFT into Marketplace escrow and list it for sale.
- **Secondary inventory:** a holder escrows an existing Token NFT and lists it
  at a fixed price.

Auction remains the DAO's continuous auction module. Marketplace is for
explicit, fixed-price listings. v0.1 excludes offers, bidding, bundles,
seller-selected payment assets, and a Builder protocol fee.

## Authority Model

```text
Governor proposal
  -> Treasury.execute(Marketplace.mint_and_list)
  -> Marketplace self-authorizes Token.mint
  -> Token mints NFT to Marketplace escrow

Buyer
  -> Marketplace.buy
  -> SAC payment to Treasury and, for secondary sales, seller
  -> Marketplace transfers escrowed NFT to buyer
```

At DAO finalization, Manager grants Marketplace Token mint authority together
with Treasury and, when enabled, Auction. Marketplace has no ownership of
Token, Treasury, Governor, Auction, or Metadata.

`mint_and_list` requires Treasury authentication. Marketplace is therefore not
an unrestricted minter even though it has Token mint authority. Governor reaches
this entrypoint through the existing `Governor -> Treasury.execute -> target`
path.

## Payment and Fee Policy

Every DAO Marketplace has one configured SAC payment asset. Sellers cannot
select a different asset per listing.

- Primary-sale proceeds go entirely to Treasury.
- Secondary-sale proceeds split between the seller and Treasury.
- DAO governance sets the default secondary fee in basis points, subject to a
  contract cap.
- Marketplace snapshots the fee basis points into each secondary listing. A
  later governance change applies only to listings created afterward.

The DAO creation configuration supplies the initial Marketplace payment asset
and secondary fee. The UI supplies platform defaults rather than requiring the
creator to configure a Marketplace when it is not immediately used.

## Holder Escrow Flow

Escrow makes an active listing guaranteed purchasable. An approval-only order
can become stale when the owner transfers the NFT or revokes approval.

The initial flow uses Token's existing per-token approval:

1. Seller calls `Token.approve(seller, marketplace, token_id,
   approval_expiration_ledger)`.
2. Seller calls `Marketplace.list(token_id, price, expires_at)`.
3. Marketplace requires seller authorization, verifies current ownership and
   valid listing inputs, then self-authorizes `Token.transfer_from` to move the
   NFT into Marketplace escrow.
4. Marketplace writes one active listing and emits `ListingCreated`.

The approval is consumed by the escrow transfer. Marketplace has no authority
over seller NFTs that are not actively escrowed.

## Contract Interface

### Governance-only

```rust
mint_and_list(price: i128, expires_at: u64) -> u32
set_secondary_fee_bps(fee_bps: u32)
set_payment_asset(payment_asset: Address)
pause()
unpause()
upgrade(from_hash: BytesN<32>, to_hash: BytesN<32>)
```

These functions require Treasury authentication. Treasury authentication is
available only through an approved Governor execution path after DAO
finalization.

### Holder and public functions

```rust
list(token_id: u32, seller: Address, price: i128, expires_at: u64)
buy(token_id: u32, buyer: Address)
cancel(token_id: u32, seller: Address)
expire(token_id: u32)
get_listing(token_id: u32) -> Option<Listing>
get_config() -> MarketplaceConfig
```

- `list` requires `seller` authorization and escrows the NFT.
- `buy` requires buyer authorization and succeeds only for a non-expired active
  listing.
- `cancel` requires the original seller authorization and returns the NFT.
- `expire` is permissionless. It returns an expired NFT to its original seller
  for secondary listings or Treasury for primary listings.
- Pausing blocks new listings and purchases but never blocks cancellation or
  expiry recovery.

## Active State Only

Marketplace persists only live protocol state:

```rust
MarketplaceConfig {
    token: Address,
    treasury: Address,
    payment_asset: Address,
    default_secondary_fee_bps: u32,
    manager: Address,
    current_hash: BytesN<32>,
    version: ContractVersion,
    paused: bool,
}

Listing {
    seller: Address,
    price: i128,
    expires_at: u64,
    fee_bps: u32,
    kind: ListingKind, // Primary or Secondary
}
```

Listings use `token_id` as their storage key. No listing counter or on-chain
listing index is needed because Token IDs are unique within a DAO.

Delete the listing immediately after a successful purchase, cancellation, or
expiry recovery. Goldsky events provide listing discovery, seller inventory,
sale history, and API data. Persistent active-listing entries need an explicit
TTL extension policy while escrow remains live.

## Purchase Semantics

`buy` follows checks-effects-interactions:

1. Require buyer authorization; load and validate the listing, price, pause
   state, and expiry.
2. Remove the active listing before external calls so it cannot be purchased
   twice.
3. For a primary listing, transfer the entire SAC payment from buyer to
   Treasury. For a secondary listing, transfer the fee to Treasury and the
   remainder to seller using checked arithmetic.
4. Marketplace self-authorizes Token transfer from Marketplace escrow to buyer.
5. Emit `ListingPurchased` with price, fee, seller, buyer, and payment asset.

Any failure reverts the full Soroban transaction. Add a reentrancy guard around
purchase and escrow-mutating functions because the payment asset is an external
contract.

## Events and Goldsky

Marketplace emits:

- `MarketplaceInitialized`
- `PrimaryListingCreated`
- `SecondaryListingCreated`
- `ListingCancelled`
- `ListingExpired`
- `ListingPurchased`
- `PaymentAssetUpdated`
- `SecondaryFeeUpdated`
- `MarketplacePaused` and `MarketplaceUnpaused`
- `MarketplaceUpgraded`

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
4. Deploy Marketplace with Token, Treasury, Manager, payment asset, fee, current
   hash, and version.
5. Include Marketplace in `DaoAddresses`, `PendingDao`, and `DaoCreated`.
6. During finalization, grant Marketplace Token mint authority before deleting
   `PendingDao`.

Manager's only per-DAO state remains `PendingDao`. Auction and Marketplace are
validly constructed but paused before finalization. Their initial setup is not
tracked in Manager.

Finalization checks only the launch recovery invariants:

```text
Token owner == launch_admin
Token total supply == expected_founder_supply
```

Before finalization, neither Auction nor Marketplace has Token mint authority,
so neither can change total supply. After finalization, Treasury/governance
controls their configuration and inventory.

## Retention Policy Across DAO Modules

The protocol stores a snapshot only while it is required to enforce a live
on-chain right or transition. Events and Goldsky retain history.

- **Manager:** delete `PendingDao` after finalization.
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

1. A DAO Governor proposal dispatches `Marketplace.upgrade` through Treasury.
2. Marketplace requires Treasury/module-owner authorization.
3. The supplied `from_hash` must match Marketplace's stored current hash.
4. Marketplace asks Manager to validate the registered, active approved
   `from_hash -> to_hash` transition and return its target version.
5. Marketplace stores the new hash/version, emits `MarketplaceUpgraded`, and
   calls `update_current_contract_wasm(to_hash)` on itself.

Manager cannot execute this upgrade. Its approval is only the platform
compatibility gate; the DAO's proposal and Marketplace's own checks authorize
and perform the WASM replacement.

All DAO module upgrades use the same proposal route, including Governor and
Treasury: `Governor -> Treasury.execute -> target.upgrade`. Governor and
Treasury therefore need explicit real-WASM tests for their reentrant target
paths before this route becomes the versioned testnet baseline.

Before any Marketplace upgrade, define whether active listing storage is
schema-compatible. If it is not, provide a bounded migration entrypoint and
test active listing recovery and purchase after migration.

## Implementation Phases

### Phase 1: Marketplace contract

- Add `contracts/marketplace` with contract, storage, errors, events, and tests.
- Implement fixed-price primary listings, escrowed secondary listings, recovery,
  payment splitting, pause behavior, and upgrade checks.
- Add reentrancy, checked-arithmetic, authorization, and SAC failure tests.

### Phase 2: Manager and module wiring

- Add Marketplace implementation registration, deterministic deployment, version
  metadata, `PendingDao` address, and finalization mint authority.
- Update creation validation and deployment scripts for the sixth WASM.
- Regenerate Manager, Marketplace, and affected module bindings.

### Phase 3: Governance and frontend flows

- Add a Governor proposal action for `mint_and_list`.
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
- Test Manager creation/finalization with both Auction and Marketplace deployed.
- Rehearse a state-preserving Marketplace `0.1.x` upgrade with an active listing.
- Deploy a fresh versioned testnet Manager and six initial `0.1.0` module WASMs,
  wipe the legacy read-model database, and begin Goldsky ingestion at the new
  Manager deployment ledger.
