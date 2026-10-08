# Security Model

Scope: the Soroban contracts at commit `5136397` plus the governance timing caps in `contracts/governor`. The Rust sources under `contracts/*/src` are authoritative; this document describes behavior, not intent. It is not an audit.

## Roles

| Role | Holder | Authority |
| --- | --- | --- |
| Manager admin | Address set in the Manager constructor; two-step handover via `propose_admin` / `accept_admin` | Registers/revokes implementation WASM hashes, selects current hashes, approves upgrade transitions, pauses `create_dao`, upgrades the Manager, registers the platform minter (`set_platform_minter`) |
| Deployer | `params.deployer` of `create_dao` | Authorizes `create_dao`; no standing authority afterward |
| Launch admin | `params.launch_admin` of `create_dao` | Owner of Token, Governor, Treasury, Auction, Metadata and the Marketplace admin during the setup window. Authorizes `launch_dao`. |
| Treasury | The DAO Treasury contract | Owner of every module (including itself) from launch onward |
| Anyone | Any account | `treasury.execute` for a Queued proposal, `marketplace.expire_primary`, `metadata.bump_artwork_ttl`, auction bid/settle, token holders' own actions |

## Lifecycle: setup window and launch

Every module starts in Setup. `launch` is one-shot, callable only by the Manager (`manager.require_auth()`), and panics `AlreadyLive` (9002) on a second call. `launch_dao` calls them in this order: Token, Governor, Treasury, Marketplace, Auction, Metadata. It fails atomically, so a failed launch leaves every module in Setup and `PendingDao` intact.

All cross-module wiring (token, treasury, governor, manager addresses) is passed to constructors. The address setters that existed before (`set_treasury`, `set_token_contract`, `set_governor_authority`, `set_governor`, and the Auction `set_treasury`) are removed, and `launch` checks that the Treasury argument equals the Treasury wired at construction (`TreasuryMismatch`).

During setup the launch admin can:

- mint founder tokens directly on the Token (`mint`, `batch_mint`; the Token owner is the only minter before launch);
- add artwork to Metadata and update its settings;
- change Auction parameters while it is paused (`set_duration`, `set_reserve_price`, `set_min_bid_increment`, `set_time_buffer`, `set_payment_token`) and Marketplace parameters (`set_secondary_fee_bps`, `set_payment_asset`, `pause`, `unpause`);
- change Governor parameters through the owner-only setters;
- upgrade modules along Manager-approved transitions.

Before launch, `token.set_mint_authority`, `auction.unpause`, primary listing creation, all Governor proposal functions, `treasury.execute` and the Minter fail with `NotLive` (9001).

`launch_dao` enforces:

- `launch_admin` authorization and that `launch_admin` is still the Token owner (`Unauthorized`);
- Token total supply greater than zero (`LaunchSupplyZero`, 1121);
- the Auction and Marketplace payment assets equal the ones recorded at `create_dao` (`PaymentTokenMismatch` / `PaymentAssetMismatch`), so a launch admin cannot swap the payment asset during setup without the launch failing;
- the mint-authority set is fixed by the Manager: Treasury and Marketplace always, Auction if `launch_auction`, and the admin-registered platform minter if `enable_minter` (`PlatformMinterNotSet`, 1008, when none is registered). The launch admin cannot name another minter.

At launch, ownership of each module moves to the Treasury and any pending two-step ownership transfer is cleared (`common::ownership::handoff_owner`), so a transfer started in setup cannot be accepted afterward. `launch_auction` / `launch_marketplace` only decide whether the Auction is started and whether the Marketplace is left open; a Marketplace launched with `open = false` is forced paused.

## What the Manager can and cannot do after launch

The Manager has no entrypoint that acts on a launched DAO. Its `launch` calls fail with `AlreadyLive`, it holds no owner or minter role in any module, and it keeps no DAO registry (the `PendingDao` entry is deleted at launch).

It does keep two platform-level effects:

- It answers `is_upgrade_approved`-style checks that modules perform during their own `upgrade`. The Manager admin can approve or revoke a `from_hash -> to_hash` transition, and the admin can revoke an implementation. A revoked or unapproved hash blocks a DAO's upgrade; the Manager cannot force one.
- The module `upgrade` and `sync_version` read the Manager address stored at construction. The Manager can therefore withhold approval but cannot execute an upgrade.

The platform minter chosen by the Manager admin is granted mint authority at launch if the launch admin sets `enable_minter`. That grant is not revocable by the Manager afterward; only the Treasury (via a proposal calling `token.set_mint_authority`) can revoke it.

## Governance execution path

1. Proposal functions (`propose`, `cast_vote`, `queue`) run on the Governor.
2. Anyone calls `treasury.execute(targets, functions, args, description_hash)`. No caller auth is required; authority comes from the proposal.
3. The Treasury calls `governor.consume(...)`, which requires the Treasury's auth, checks the proposal is Queued and past its ETA, marks it Executed and emits `ProposalExecuted`. The Governor is no longer on the call stack when the actions run, so actions may call the Governor's owner setters.
4. The Treasury dispatches each action in order, authorizing exactly that call, and emits one `Execute` event per call (topics governor, target, proposal id; data function and index).
5. Any failing call reverts the whole transaction, including the Executed mark. The proposal stays Queued and can be retried until it expires.

`governor.execute` always fails with `UseTreasuryExecute` (1508). Calls whose target is the Treasury itself cannot use `invoke_contract` (Soroban forbids re-entry); they run through an internal allowlist limited to `upgrade(from, to)` and `sync_version()`. Any other Treasury self-call fails with `UnknownSelfCall` (1402) or `InvalidSelfCallArgs` (1403). After launch the Treasury is its own owner, so `treasury.upgrade` and `treasury.sync_version` called directly cannot be authorized by any external account; they are only reachable through `execute`.

A proposal has at most 20 actions (`TooManyActions`, 1509). A Succeeded proposal that is never queued becomes Expired 14 days after voting ends; a Queued proposal expires 14 days after its ETA.

## Upgrade path

A module upgrade needs all of:

1. A Manager registry entry for the target hash that is not revoked, and an approval for the exact `from_hash -> to_hash` pair (Manager admin).
2. The module's stored current hash equal to `from_hash`.
3. The module owner's authorization. After launch this is the Treasury, reached by a DAO proposal that targets the module's `upgrade`; for the Treasury itself the proposal targets the Treasury and uses the self-call allowlist.

`common::upgrade::apply` performs steps 1 and 2 for every module. Failures are reported with `CommonError` codes 9004-9007. During setup the launch admin can run the same upgrade directly as owner.

## Refund pull fallback

Auction refunds to the previous bidder are pushed on a best-effort basis. If the transfer fails, the amount is credited to a per-bidder balance and `RefundDeferred` is emitted instead of `BidRefunded`; the bid itself is not blocked, so a bidder that cannot receive funds cannot freeze the auction. The bidder collects with `withdraw_refund(bidder)` (`NoPendingRefund`, 1224, when the balance is zero) and `RefundWithdrawn` is emitted. `pending_refund(bidder)` reads the balance. Deferred balances persist until withdrawn, subject to the TTL caveat below.

## Error code namespacing

Error codes are unique only per contract. Examples of overlaps: Auction 1201 and Manager 1201; Token 1103/1105 and Manager 1103/1105; Minter and Metadata share 3, 4, 10, 11, 13. Shared `CommonError` codes (9001-9011) are raised by the launch and upgrade paths of every module. Consumers must key errors by `(contract id, code)`, never by code alone.

## TTL and archival

The network caps entry TTL at about 180 days (about 3,110,400 ledgers); the host clamps longer extensions. Instance TTL (which covers the contract code reference and instance keys such as owner, config, mint authority, lifecycle flag) is extended to 170 days when fewer than 60 days remain, on state-changing calls. A module nobody touches for roughly 170 days can have its instance expire; archived entries can be restored, but the module is unavailable until then.

Persistent per-key entries expire independently of the instance:

- Metadata artwork (properties, items, IPFS groups) is only extended when read or written through the contract. Run `metadata.bump_artwork_ttl(start, limit)` periodically, in windows of at most 50 entries (`LimitTooHigh`, 16, above that). It is permissionless.
- Governor proposals are extended to 60 days on access.
- Pending auction refunds, token ownership and voting checkpoints, marketplace listings, and Manager registry entries are persistent per-key entries with the same cap.

See [MONITORING.md](./MONITORING.md) for the maintenance task.

## Known limitations

These are behaviors of the current contracts, not planned fixes.

- Metadata seed grinding. The artwork seed is `keccak256(token_id, ledger sequence, ledger timestamp, host PRNG u64)`. Whoever controls when a mint happens, or whether to submit after simulating, can pick preferred traits. Traits are pseudo-random, not manipulation-resistant. `regenerate(token_id)` (owner only) can re-roll a token.
- Governance parameter bounds. Voting delay, voting period and queue delay must be at least 300 seconds and at most 2,592,000 seconds (30 days); the Manager and Governor both enforce this. Quorum may be as low as 1 bp (the Manager and Governor reject 0 and values above 10,000), and the proposal threshold only needs to be nonzero and not above total supply. A DAO can set parameters that make governance trivially capturable or very slow within those bounds.
- Founder minting is unbounded in setup. Before launch the launch admin can mint any number of tokens (`batch_mint` limits only the `u32` total). The 10,000 founder cap described in older documents is not enforced by the contracts. Token distribution at launch is a launch-admin decision that is not constrained on-chain beyond supply being nonzero.
- Marketplace fee up to 100%. `default_secondary_fee_bps` may be set up to 10,000, and a fee of 10,000 sends the full secondary price to the Treasury. The fee is snapshotted into each listing at listing time.
- Marketplace expiry is unbounded. `expires_at` need only be in the future; there is no maximum. Escrowed secondary NFTs stay in escrow until `buy`, `cancel` (seller) or `expire` (anyone, after expiry). Primary listings hold no escrow.
- Primary and secondary listings record the payment asset current at listing time; changing `payment_asset` later does not reprice existing listings.
- Auction `set_time_buffer` and the Manager reject a time buffer above 86,400 seconds, but reserve price and duration have no upper bound.
- The Manager admin is a single address with a two-step handover; there is no timelock or multisig in the contract.
