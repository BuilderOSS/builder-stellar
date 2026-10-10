# Security Model

Scope: current Rust contract sources and the frontend working-tree interfaces.
This is an implementation reference, not a security audit or a live deployment
check. Rust entrypoints/storage and pinned dependencies are authoritative for
protocol behavior; route handlers and generated ABI adapters define app behavior.

## Roles

| Role | Holder | Authority |
| --- | --- | --- |
| Manager admin | Address set in the Manager constructor; two-step handover via `propose_admin` / `accept_admin` | Registers/revokes implementation WASM hashes, selects current hashes, approves upgrade transitions, pauses `create_dao`, upgrades the Manager, registers the platform minter (`set_platform_minter`) |
| Deployer | `params.deployer` of `create_dao` | Authorizes `create_dao` (together with the launch admin); no standing authority afterward |
| Launch admin | `params.launch_admin` of `create_dao` | Owner of Token, Governor, Treasury, Auction, Metadata and the Marketplace admin during the setup window. Must also authorize `create_dao` (prevents naming a non-consenting launch admin); authorizes `launch_dao`. |
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

Before launch, `token.set_mint_authority`, `auction.unpause`, primary listing creation,
secondary `list`/`buy`, Governor propose/vote/queue/consume, and `treasury.execute`
require Live state (`NotLive`, 9001). Minter checks the Token and reports its own
`TokenNotLive` (13). Secondary cancel/expire remain recovery paths; Governor cancel
has proposer authorization and permits only Pending/Active proposals.

`launch_dao` enforces:

- `launch_admin` authorization and that `launch_admin` is still the Token owner (`Unauthorized`);
- Token total supply greater than zero (`LaunchSupplyZero`, 1121);
- every module's CURRENT `wasm_hash()` is registered and not revoked (`PendingDaoUsesRevokedImplementation`, 1122), checked before any launch call so a rejection launches nothing. The current hash is read from each module rather than stored in `PendingDao`, so a pre-launch owner `upgrade` to an approved, non-revoked hash fixes a pending DAO built on a since-revoked hash; `PendingDao` is unchanged. Revocation never affects the operation of an already-launched DAO;
- the Auction and Marketplace payment assets equal the ones recorded at `create_dao` (`PaymentTokenMismatch` / `PaymentAssetMismatch`), so a launch admin cannot swap the payment asset during setup without the launch failing;
- the mint-authority set is fixed by the Manager: Treasury and Marketplace always, Auction if `launch_auction`, and the admin-registered platform minter if `enable_minter` (`PlatformMinterNotSet`, 1008, when none is registered). The launch admin cannot name another minter. When `enable_minter` is set, `LaunchConfig.expected_minter` must be `Some(minter)` and equal the registered platform minter (`PlatformMinterMismatch`, 1010, otherwise, including `None`), so the Manager admin cannot swap the minter between the launch admin's review and the launch transaction.

At launch, ownership of each module moves to the Treasury and any pending two-step ownership transfer is cleared (`common::ownership::handoff_owner`), so a transfer started in setup cannot be accepted afterward. `launch_auction` / `launch_marketplace` only decide whether the Auction is started and whether the Marketplace is left open; a Marketplace launched with `open = false` is forced paused.

## What the Manager can and cannot do after launch

Manager cannot administer a launched DAO: module `launch` calls reject repeats,
and Manager holds no owner or minter role in its modules. `PendingDao` is deleted,
but permanent slug mappings remain and support lookup/permissionless TTL renewal.
These names confer no DAO authority and provide no enumeration API.

It does keep two platform-level effects:

- It answers `is_upgrade_approved`-style checks that modules perform during their own `upgrade`. The Manager admin can approve or revoke a `from_hash -> to_hash` transition, and the admin can revoke an implementation. A revoked or unapproved hash blocks a DAO's upgrade; the Manager cannot force one.
- The module `upgrade` and `sync_version` read the Manager address stored at construction. The Manager can therefore withhold approval but cannot execute an upgrade.

The platform minter chosen by the Manager admin is granted mint authority at launch if the launch admin sets `enable_minter`. That grant is not revocable by the Manager afterward; only the Treasury (via a proposal calling `token.set_mint_authority`) can revoke it.

## Governance execution path

1. Proposal functions (`propose`, `cast_vote`, `queue`) run on the Governor.
2. Anyone calls `treasury.execute(targets, functions, args, description_hash)`. No caller auth is required by the contract; authority comes from the proposal. Queue is also permissionless. The submitting wallet pays transaction fees. Queue's inherited ETA/operator inputs are ignored; Governor derives ETA from its queue delay.
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

Revocation: `is_upgrade_approved(from, to)` requires only the TARGET to be non-revoked (and both hashes registered under the same name), so a module running a revoked hash can still migrate away along an approval created after the revocation (`approve_upgrade` accepts a revoked source, rejects a revoked target). `get_implementation_version` also answers for revoked hashes so `sync_version` keeps working for modules still on one. Registry records are immutable: `register_implementation` rejects an existing hash (`ImplementationAlreadyRegistered`, 1009), so a record cannot be renamed or un-revoked.

`common::upgrade` emits `Upgraded { from_hash, to_hash (topics), version }` on every module upgrade and `VersionSynced { version }` on `sync_version`; `create_dao` emits the six module WASM hashes in `DaoCreated.wasm_hashes` so creators can verify what was deployed.

## Refund pull fallback

Auction refunds to the previous bidder are pushed on a best-effort basis. If the transfer fails, the amount is credited to a per-bidder balance and `RefundDeferred` is emitted instead of `BidRefunded`; the bid itself is not blocked, so a bidder that cannot receive funds cannot freeze the auction. The bidder collects with `withdraw_refund(bidder)` (`NoPendingRefund`, 1224, when the balance is zero) and `RefundWithdrawn` is emitted. `pending_refund(bidder)` reads the balance. Deferred balances persist until withdrawn, subject to the TTL caveat below.

## Registry caveats

`get_latest_implementation(name)` returns `None` once the latest hash for a name is revoked (there is no fallback pointer). Tooling and indexers must make security decisions with `get_implementation(hash)` and the Manager's `Current*` hashes, never with `get_latest_implementation`. Registry records are write-once: a wrong name/version for a hash cannot be corrected and un-revoking is impossible.

## Error code namespacing

Error codes are unique only per contract. Examples of overlaps: Auction 1201 and Manager 1201; Token 1103/1105 and Manager 1103/1105; Minter and Metadata share 3, 4, 10, 11, 13. Shared `CommonError` codes (9001-9011) are raised by the launch and upgrade paths of every module. Consumers must key errors by `(contract id, code)`, never by code alone.

## TTL and archival

The common instance helper requests 170 days when below 60 days. Source comments
assume a roughly 180-day network cap; this is not a current network-settings
measurement. Shared code, instances, and persistent keys have separate lifetimes.
Not every method uses the same extension helper, and simulated reads do not prove
durable renewal. See [TTL maintenance](TTL_ECONOMICS.md) for source-specific policies.

Persistent per-key entries expire independently of the instance:

- Metadata artwork (properties, items, IPFS groups) is only extended when read or written through the contract. Run `metadata.bump_artwork_ttl(start, limit)` periodically, in windows of at most 50 entries (`LimitTooHigh`, 16, above that). It is permissionless.
- Governor proposals are extended to 60 days on access.
- Pending auction refunds, token ownership and voting checkpoints, marketplace listings, and Manager registry entries are persistent per-key entries with the same cap.

The web's explicit artwork-renewal path uses the SDK restoration option and signed
windows. The shared-code extension script does not restore archived entries.
Missing instance/property headers can prevent a report from enumerating children;
do not treat missing persistent rights as safely deleted. Target-network restoration
behavior and full archived-state recovery are not verified by this document.

See [MONITORING.md](./MONITORING.md) for endpoint semantics and maintenance links.

## Known limitations

These are behaviors of the current contracts, not planned fixes.

- Metadata seed grinding. The artwork seed is `keccak256(token_id, ledger sequence, ledger timestamp, host PRNG u64)`. Whoever controls when a mint happens, or whether to submit after simulating, can pick preferred traits. Traits are pseudo-random, not manipulation-resistant. `regenerate(token_id)` (owner only) can re-roll a token.
- Governance parameter bounds. Voting delay, voting period and queue delay must be 300–2,592,000 seconds; Manager and Governor enforce this. Quorum is 1–10,000 bps. Initial proposal threshold must be positive; the owner setter rejects a threshold above previous-ledger supply only when that supply is nonzero. The CLI additionally checks threshold against planned founder total. Configuration can still make governance capturable or unattainable within these bounds.
- Founder minting is unbounded in setup. Before launch the launch admin can mint any number of tokens (`batch_mint` limits only the `u32` total). The 10,000 founder cap described in older documents is not enforced by the contracts. Token distribution at launch is a launch-admin decision that is not constrained on-chain beyond supply being nonzero.
- Marketplace fee up to 100%. `default_secondary_fee_bps` may be set up to 10,000, and a fee of 10,000 sends the full secondary price to the Treasury. The fee is snapshotted into each listing at listing time.
- Marketplace expiry is unbounded. `expires_at` need only be in the future; there is no maximum. Escrowed secondary NFTs stay in escrow until `buy`, `cancel` (seller) or `expire` (anyone, after expiry). Primary listings hold no escrow.
- Primary and secondary listings record the payment asset current at listing time; changing `payment_asset` later does not reprice existing listings.
- Auction `set_time_buffer` and the Manager reject a time buffer above 86,400 seconds, and auction duration is bounded to 300 seconds ..= 2,592,000 seconds (30 days) in the Auction constructor, `set_duration` and the Manager (`InvalidDuration` / `InvalidConfig`). The reserve price has a lower bound only; there is deliberately no upper cap.
- Voting power is fixed at proposal creation. Votes and total supply are snapshotted at the ledger before `propose`, so the voting delay is a notice period only and cannot change that proposal's weights. Treasury-, Auction- and Marketplace-held NFTs count toward the quorum denominator (total supply at the snapshot) but cannot vote, except through a proposal for the Treasury.
- Founder supply and early takeover. During setup the launch admin can mint unlimited founder tokens and delegate them; launch only requires `total_supply > 0`. With the minimum governance timings (voting delay, voting period and queue delay of 300 s each) a holder of a majority of voting power can propose, vote, queue and execute roughly 15 minutes after launch (the first proposal needs only the previous ledger's snapshot). There is no cooling-off period, no cap on founder share, and no veto once a proposal is queued. Bidders and holders must inspect founder supply and delegation (Token mints, `DelegateChanged` events, `get_votes` of the launch admin) before bidding; DAO creators should choose longer governance timings. Front ends should display founder share.
- Quorum lock. The denominator is total supply at the snapshot, including contract-held NFTs. A quorum above attainable participating voting power can prevent proposals, including a proposal to lower it, and block governance-controlled funds/upgrades. A 100% quorum is not universally impossible, but can be unreachable with unavailable contract-held or nonparticipating voting power.
- Payment transfers can fail when account/asset authorization is unavailable. The contracts assume ordinary SAC amount semantics; a configured address alone does not establish compatible transfers or readiness. Tests distinguish authorized and unauthorized regulated SAC accounts. The web marketplace narrows assets to its verified XLM/USDC registry and checks relevant trustlines/balances.
- Manager admin trust. The Manager admin can change implementation defaults for future creation (`set_current_implementations`), and creation parameters cannot pin hashes. Once created, modules retain their deployed hashes unless upgraded; changing defaults does not replace pending modules. Creators inspect `DaoCreated.wasm_hashes`; launch checks current module hashes against the registry. The admin can also revoke implementations, pause the factory, and register the platform minter (pinned by `expected_minter` at launch).
- No veto once a proposal is queued. Voters and holders cannot cancel a queued proposal; only expiry (14 days after the ETA) stops it.
- Module upgrades depend on voters verifying opaque WASM hashes. A proposal names `from_hash` and `to_hash`; the chain checks registry approval, not code. Voters must verify the hash against audited, reproducible builds and the `Upgraded` event after execution.
- Archival handling is network/SDK-dependent. This reference does not promise automatic restoration for arbitrary calls or prescribe an unverified CLI restore sequence. The app opts into restoration for artwork renewal; maintain code/state before expiry and verify recovery on the target protocol.
- Proposal IDs do not include the proposer. An eligible holder can front-run an identical payload and become its recorded proposer; cancellation requires that recorded proposer and Pending/Active state. Another holder cannot cancel solely by exceeding the threshold. Changing description produces a different payload ID.
- Manager `PendingAdmin` has no logical acceptance timeout. The admin can withdraw it with `cancel_pending_admin` (admin-only, emits `AdminProposalCancelled`); its persistent entry is still subject to TTL/archival.
- The Manager admin is a single address with a two-step handover; there is no timelock or multisig in the contract.

## Application trust boundaries

The app authenticates wallets with SEP-53 message signing and a SEP-10 fallback,
then uses an encrypted `iron-session` cookie. Wallet connection alone is not an
authenticated session. Challenge/replay/rate-limit bookkeeping is process-local;
this reference does not claim a shared distributed replay store. Public DAO reads
remain scoped to the configured deployment. Trading inventory/readiness derive the
actor from the session, not a submitted address.

SEP-10 reads current account signers/medium threshold from canonical Horizon and
verifies their weighted signatures, excluding the server signer and requiring at
least one positive client weight. Disabled-master/insufficient-threshold proofs
cannot fall back. Master-key-only unfunded authentication is allowed only on an
authoritative Horizon account-not-found 404 problem response, not generic 404 or
network failure. Read/malformed-account failures return 503. Successful key-only
sign-in does not establish funding or transaction readiness.

Marketplace preparation checks same origin, session network, tenant/module/listing
identity, live wiring/terms, ownership, and relevant account funds/trustlines. It
returns unsigned XDR; the server does not sign/submit a trade. The wallet path
checks account/network/source/expiry and unchanged envelope. Approval and listing
are separate transactions. A governance change before confirmation can change a
new listing's captured asset/fee; preflight is not a contract-enforced price lock.

Proposal submission uses target-specific generated specs and explicit registered
SAC transfer encoding. Unsupported external ABIs, scalar batch-mint shapes, unsafe
integers, proposal-ID mismatch, or unavailable live state disable submission.
Execution receipt checks bind Treasury, Governor, proposal and ordered calls; a
missing indexed receipt is not evidence of failed execution.

Treasury funding prepares a session-owned SAC transfer after scoped wiring,
simulation and funds/reserve/fee checks; spending Treasury funds still requires
governance. Holder preparation rechecks current on-chain NFT owner, not merely
indexed ownership. Delegation applies to the account's owned voting units;
single-token approval revocation is not collection-wide permission revocation.

Minter claims use current registered Minter, Live/mint authority, method/round and
recipient-bound proof; restoration-required simulations are rejected. The client
rechecks reviewed state before signing. Allocation descriptors currently validate
only and cannot be submitted through the shared governance encoder. This limitation
must not be confused with implemented claimant signing.

Creation/launch recovery saves finite signed envelopes separately from RPC
acceptance. Rebroadcast preserves exact bytes/hash; reviewed configuration and
nonce cannot be silently changed after freezing. Unknown acceptance is not proof
of failure. Missing older envelopes cannot be safely rebroadcast.

Local drafts, home preferences, artwork plans, and marketplace labels/favorites are
browser storage, not encrypted shared permissions or on-chain rights. Scope filters
avoid mixing workspaces but do not secure data from another user of the same browser.
Clearing storage removes recovery data. Read-only SQL credentials do not imply that
all server endpoints are side-effect free: uploads and transaction preparation have
their own boundaries. See [web reference](../apps/web/README.md).
