# ClaimMinter module

A per-DAO module, registry kind `claims`, that mints a DAO's tokens against merkle claim lists ([design §3](../../docs/designs/membership-models.md)). It replaces the shared platform Minter: every DAO has its own ClaimMinter, wired to its Token and Treasury at construction and upgraded only by that DAO. The crate keeps its `contracts/minter` path, error block 7800 and the merkle leaf, proof and `tree_uri` formats.

## Interface

```text
__constructor(admin, token, treasury, manager, payment_asset, current_hash)
open_list(root, tree_uri, asset, price, expires_at, total, assurance: Option<{threshold_claimers, deadline}>) -> list_id
claim(list_id, claimer, leaf_amount, mint_now, proof, max_price) -> Vec<u32>
assurance_state(list_id) -> Open | Met | Failed
release(list_id) -> i128;  refund(list_id, claimer) -> i128
get_list(list_id); get_claim(list_id, claimer); next_list_id(); assurance_list(); get_config()
launch(treasury, open); handoff(treasury); payment_asset(); renewal_keys(cursor, limit)   // DaoModule
upgrade(from, to); recovery_upgrade(from, to); migrate(); version(); wasm_hash(); storage_version(); admin()
```

**Lists.** Each list is a root of `(claimer, amount)` leaves with an asset, a price per token (0 for free), an expiry and a total across claimers. A claimer proves the full leaf and claims it in parts: `mint_now` is at most what is left of the leaf and at most `common::MAX_BATCH_MINT` (43) per call. Each claim pays `price × mint_now` and mints through the Token's `batch_mint`, spending this module's mint allowance (the Token's `AllowanceExceeded` propagates). The leaf is `sha256(claimer_xdr || amount_be_u128)`; each internal node hashes its sorted pair; proofs have at most 32 siblings.

**Who opens a list.**
- Setup: the launch admin opens free lists. A list with a price or assurance terms also needs the Manager's authorization, so only `manager.open_assurance` opens it. Setup lists use the configured payment asset (`PaymentAssetMismatch`) and need artwork (`ArtworkMissing`).
- Live: the Treasury, by proposal, with any asset and price and no assurance terms (`AssuranceNotAllowed`).

**The assurance list** (at most one, `AssuranceExists`). Before launch its payments stay in escrow here. It is `Met` once `threshold_claimers` distinct addresses have claimed, and `Failed` once the deadline passes while the DAO is not Live, whether it was met or not. `Failed` is computed from the deadline and the Token's `is_live()`, never stored. So `release` (needs Live, `TokenNotLive`) and `refund` (needs `Failed`, `NotFailed`) exclude each other. `claim` refuses a failed list (`AssuranceFailed`). `launch` releases the escrow to the Treasury in the launch transaction; after launch, claims pay the Treasury directly.

**DaoModule.** `launch` and `handoff` are Manager-only. `handoff` moves the admin to the Treasury and stays in Setup, which freezes list opening and upgrades during an assurance drive. `renewal_keys` lists `List(0..next_list_id)` from the instance counter and the payment asset (the escrow balance). `Claim(list, claimer)` records belong to their claimers (holder class) and are left out; a claimer's next claim or refund restores theirs.

**Upgrades.** `upgrade` needs the module admin (the launch admin in Setup, the Treasury by proposal once handed over) and a registry-approved hash pair. `recovery_upgrade` is the Manager's path for a failed, frozen drive whose refunds are broken (`manager.recover_claims`): it checks only the Manager's authorization and that the module is still in Setup.

Errors: block 7800 (7802, 7804, 7811, 7813 and 7814 belonged to the shared Minter and are retired). [Implementation](src/contract.rs), [storage](src/storage.rs), [events](src/events.rs). `cargo test -p minter`.
