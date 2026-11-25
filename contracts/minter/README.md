# ClaimMinter module

A per-DAO module, registry kind `claims`, that mints a DAO's tokens against merkle claim lists ([design §3](../../docs/designs/membership-models.md)). It replaces the shared platform Minter: every DAO has its own ClaimMinter, wired to its Token and Treasury at construction and upgraded only by that DAO. The crate keeps its `contracts/minter` path, error block 7800 and the merkle leaf, proof and `tree_uri` formats.

## Interface

```text
__constructor(admin, token, treasury, manager, payment_asset, current_hash)
open_list(root, tree_uri, asset, price, expires_at, total, assurance: Option<{threshold_claimers, deadline}>) -> list_id
close_list(list_id)
claim(list_id, claimer, leaf_amount, mint_now, proof, max_price) -> Vec<u32>
assurance_state(list_id) -> Open | Met | Failed
release(list_id) -> i128;  refund(list_id, claimer) -> i128
get_list(list_id); get_claim(list_id, claimer); next_list_id(); assurance_list(); get_config()
launch(treasury, open); handoff(treasury); payment_asset(); renewal_keys(cursor, limit)   // DaoModule
upgrade(from, to); recovery_upgrade(from, to); migrate(); version(); wasm_hash(); storage_version(); admin()
```

While the stored layout differs from the code's `STORAGE_VERSION`, every entry point that changes state fails `StorageVersionMismatch` (7831); `upgrade`, `recovery_upgrade`, `migrate` and the views stay open ([upgrade path](../../docs/SECURITY_MODEL.md#upgrade-path-and-migrations)). `refund` is gated too, so `migrate` needs no authorization: during a drive the admin is the Treasury, which can't act before launch.

**Lists.** Each list is a root of `(claimer, amount)` leaves with an asset, a price per token (0 for free), an expiry and a total across claimers. A claimer proves the full leaf and claims it in parts: `mint_now` is at most what is left of the leaf and at most `common::MAX_BATCH_MINT` (43) per call. Each claim pays `price × mint_now` and mints through the Token's `batch_mint`, spending this module's mint allowance (the Token's `AllowanceExceeded` propagates). All lists share that one allowance. `close_list` (the admin) ends a list early by moving its `expires_at` to now; the assurance list can't be closed before launch.

**Hashing.** The leaf is `sha256(claimer_xdr || amount_be_u128)`, where `claimer_xdr` is the `ScVal::Address` XDR; each internal node hashes its sorted pair; proofs have at most 32 siblings. Leaves and nodes carry no tag, and roots are not bound to a list, contract, or network. Length keeps them apart: a node hashes 64 bytes, an account leaf 60 and a contract leaf 56. A muxed address would make a 64-byte leaf, but `claim` takes an `Address`, which the host never builds from a muxed address. [`test-vectors/merkle-v1.json`](test-vectors/merkle-v1.json) pins the format: this crate's tests and the web's tree builder tests (`apps/web/src/lib/minter/tree.test.ts`) both check it, with account, contract, and muxed claimers. The reasons the format has no tags are under "Claim list hashing" in [SECURITY_MODEL.md](../../docs/SECURITY_MODEL.md#known-limitations).

**Who opens a list.**
- Setup: the launch admin opens free lists. A list with a price or assurance terms also needs the Manager's authorization, so only `manager.open_assurance` opens it. Setup lists use the configured payment asset (`PaymentAssetMismatch`) and need artwork (`ArtworkMissing`).
- Live: the Treasury, by proposal, with any asset and price and no assurance terms (`AssuranceNotAllowed`).

**The assurance list** (at most one, `AssuranceExists`). Its `threshold_claimers` runs from 1 to the list's `total`, since each claimer mints at least one token, and its deadline falls after now and no later than `expires_at` (`InvalidAssurance`). Before launch its payments stay in escrow here. It is `Met` once `threshold_claimers` distinct addresses have claimed, and `Failed` once the deadline passes while the DAO is not Live, whether it was met or not. `Failed` is computed from the deadline and the Token's `is_live()`, never stored. So `release` (needs Live, `TokenNotLive`) and `refund` (needs `Failed`, `NotFailed`) exclude each other. `claim` refuses a failed list (`AssuranceFailed`). `launch` releases the escrow to the Treasury in the launch transaction; after launch, claims pay the Treasury directly. A free list opened earlier in Setup stays claimable during the drive and draws on the same allowance as the drive.

**Funds held here.** Only payments made through `claim` into the assurance list's escrow are tracked. This code sends a list's escrow only to the Treasury wired at construction, and a refund only to the claimer address that paid; if that address can't receive the asset, the refund fails and the escrow stays until a later call succeeds. Assets sent to this contract directly are in no escrow, and no function moves them. An upgrade could change these rules. A paid 43-token claim publishes 13,888 bytes of events in the worst case for a Stellar Asset Contract payment asset, 2,496 under the 16,384-byte limit (e2e `the_largest_paid_claim_fits_the_event_limit`).

**DaoModule.** `launch` and `handoff` are Manager-only. `handoff` moves the admin to the Treasury and stays in Setup, which freezes list opening and upgrades during an assurance drive. `renewal_keys` lists `List(0..next_list_id)` from the instance counter and the payment asset (the escrow balance). `Claim(list, claimer)` records belong to their claimers (holder class) and are left out; a claimer's next claim or refund restores theirs.

**Upgrades.** `upgrade` needs the module admin (the launch admin in Setup, the Treasury by proposal once handed over) and a registry-approved hash pair. `recovery_upgrade` is the Manager's path for a failed, frozen drive whose refunds are broken (`manager.recover_claims`): it checks only the Manager's authorization and that the module is still in Setup.

Errors: block 7800 (7802, 7804, 7811, 7813 and 7814 belonged to the shared Minter and are retired). [Implementation](src/contract.rs), [storage](src/storage.rs), [events](src/events.rs). `cargo test -p minter`.
