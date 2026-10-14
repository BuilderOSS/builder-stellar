# Design: membership models with capped minting, custody and plug-in modules

The 0.4.0 design: mint allowances, the Token's module registry, the per-DAO ClaimMinter, the assurance launch and
quick-buy pools. It shipped in PR #45 (contracts) and PR #46 (web). It was written before the build, so "today"
means the 0.3.0 contracts it replaced; the "As built" notes in §7 and the implementation notes at the end record
where the build differed. Code cites it by section (§1 to §7) and by decision (R1 to R9).

Related: the savings-circle design, `docs/designs/savings-circle.md` on the `feat/savings-circle` branch. Its
Circle mints badges only within a mint allowance the DAO grants.

## Problem Statement

1. **A contract the DAO doesn't control can mint votes.** Every DAO's Token pins one shared platform Minter as a mint
   authority, and the Manager admin can upgrade that Minter. SECURITY_MODEL admits that a hostile upgrade "could mint
   against every DAO". This reverses the 2026-10-12 decision "the platform Minter is a required shared module".
2. **Each way of joining needs its own minting arrangement.** There are four ways to join a DAO (four membership
   models): the auction, quick-buy (`workflows.png`), merkle claim lists (free or paid, including community
   self-claims before launch), and the savings Circle. Today each one needs its own minting setup. An open
   fixed-price sale that can mint without limit lets anyone buy a majority for `(voting supply + 1) × price` and
   then drain the Treasury.
3. **Every DAO deploys modules it may never use, and new ones can't be added later.** Auction and Marketplace are
   deployed for every DAO and wired into the Token constructor (already nine arguments). Future custom modules
   cannot be added later.

In the owner's words: "I see them as different membership models", and "I do want separation of concerns but also
future proof without simply going on increasing number of modules".

## Constraints

- One transaction may publish at most 16 KiB of events. One `batch_mint` fits about 43 tokens to one recipient
  (SECURITY_MODEL "Batch minting"). `Treasury.execute` runs every proposal action in one transaction, so **one
  proposal mints at most about 43 tokens**.
- Today, before launch, only the launch admin can mint (`ensure_mint_authority`,
  `contracts/token/src/contract.rs:550`). This design changes that rule (section 1, "Minting before launch").
- Today exactly three addresses hold NFTs without voting: Treasury, Auction and Marketplace (`voting_holder`,
  `contract.rs:492`). They are fixed at construction, so "balances and voting units can never drift apart".
- The Treasury acts only through executed proposals.
- Chain-only rule: a client with public RPC must be able to operate and renew a DAO. Every key is in the renewal
  sweep (TTL_ECONOMICS).
- Pre-mainnet, so breaking interfaces are fine and testnet is redeployed fresh. Fees on Stellar are small, so gas
  is not a reason to prefer one model over another.

## Premises

1. The trust gap from a platform-upgradable minter is worth fixing before mainnet. (Agreed.)
2. Self-claims before launch are for large communities. Their value is that only members who show up get votes
   (quorum is a share of voting supply), plus fees and a demand signal. Small groups are minted directly by the
   creator. (Agreed.)
3. Joining is the DAO's decision. Auction, quick-buy, claim lists and the Circle are membership models, and a module
   the DAO controls may mint, **but only within an allowance the DAO sets**. (Revised twice: first by the owner,
   then after the second opinion.)
4. Keep concerns separate without the module count growing. A DAO deploys only the modules it uses. Custom
   modules, including ones that hold NFTs, must plug in later by vote. (The owner's revision.)

## Approaches Considered

- **Per-DAO Issuer as a fixed seventh module** (docs/ISSUER_PLAN.md). Rejected: every DAO would deploy a module it
  may never use, which is the module growth the owner wants to avoid.
- **Merkle claims inside the Marketplace.** Rejected: it puts the power to mint votes in the contract that holds
  members' NFTs in escrow.
- **Optional modules fixed at creation ("C-lite").** Rejected: a new custom module that holds NFTs could never be
  added later.
- **Modules that never take custody (approvals over Treasury tokens).** Rejected:
  - Approving a Treasury token for one module silently cancels another module's approval.
  - Any Treasury proposal can move the token out from under a running sale.
  - It would mean rewriting the Auction and Marketplace.
- **A shared, non-upgradable ClaimList policy** (the Nouns `MerkleReserveMinter` shape). Rejected: it adds a second
  kind of plug-in across the Manager, Token, indexer and web, and pools many DAOs' escrow in one contract that
  can't be patched.
- **Boolean mint authority, as today.** Rejected: an open sale or a buggy module can mint without limit.
- **Fees before launch locked in the Treasury.** Rejected in favour of the assurance launch: members would lose
  their fees to a creator who walks away.

## Recommended Approach

**New tokens come from capped allowances. Existing tokens are held in custody. Modules plug in through a
registry.** There is one kind of plug-in, the per-DAO module. Claim lists, sales, the Circle and custom code
all use the same registration, allowance and upgrade path.

### Terms

- **Module:** a contract deployed for one DAO: Auction, Marketplace, ClaimMinter, Circle, or custom code.
  - The Manager deploys it from a registered implementation (`create_dao` / `create_module`), and it is registered
    on the Token. The one exception is custom code, which the Treasury registers by proposal.
  - It may mint within its allowance, may be non-voting, and may hold that DAO's NFTs or funds.
  - It is upgraded only by its admin: the launch admin in Setup, the Treasury once handed over. Upgrades go only to
    Manager-approved hashes.
- There are no shared plug-ins. Each DAO's state and escrow live in its own contracts.

### 1. Token: allowances and a module registry

- **Allowances replace mint authority.** `MintAllowance(addr) -> u32` (remaining) replaces `MintAuthority(addr) ->
  bool`. Every `mint` / `batch_mint` by a module subtracts from it (`AllowanceExceeded` once it runs out).
  - `increase_mint_allowance(addr, n)` and `decrease_mint_allowance(addr, n)` (saturating at 0) need the admin.
    They **add and subtract** rather than overwrite, so a grant for a second list never erases the first.
  - `increase_mint_allowance` refuses an address that isn't in `Modules` (`NotAModule`). So every allowance
    holder is a registered module, and `unregister_module` always zeroes it.
  - The admin (the Treasury) still mints without a limit.
  - The Auction gets `u32::MAX`, because it sells one token per auction and is already rate-limited. A DAO can
    lower it by proposal.
- **Minting before launch** is allowed for:
  - the admin (the launch admin);
  - this DAO's registered ClaimMinter (kind `claims`) with a non-zero allowance.

  Every other module's allowance (Auction, Marketplace, Circle, custom) applies only once the Token is Live, and
  every other mint before launch fails, as today. The Auction's `u32::MAX` therefore can't mint anything before
  launch, whatever its own code does.
- **The registry.** `Modules` is an instance `Vec<(Symbol kind, Address, bool non_voting)>` with at most 16
  entries, readable from the chain for renewal and the web. Each kind appears at most once
  (`auction()` / `marketplace()` return that entry). Kinds are `Symbol`s, which allow only `a-zA-Z0-9_` and at
  most 32 characters, so custom kinds are `custom_<name>` with `<name>` at most 25 characters (`InvalidKind`),
  unique by name.
- **Who can register.** `register_module(kind, addr, non_voting)` and `unregister_module(addr)` are allowed:
  - in Setup, only for the Manager (during `create_dao` / `create_module`);
  - once Live, only for the Treasury (by proposal; custom DAO code allowed).
- **Only contracts can be modules.** `register_module` refuses any address that isn't a deployed Wasm contract:
  `addr.executable()` must be `Some(Executable::Wasm(_))` (soroban-sdk 27; `NotAContract`). A wallet (account)
  or a Stellar Asset Contract can never be registered, so no proposal can strip a holder's votes by marking
  their wallet non-voting, and no wallet can hold an allowance.
- **Unregistering** also sets the module's allowance to 0.
- **Every registration is an event.** The Token emits `ModuleRegistered { kind, address, non_voting }` and
  `ModuleUnregistered { address }`. These event shapes are the contract's public API for the indexer, which
  allowlists modules from them, whether the Manager built them or not (R6; the full indexer design
  is in §7).
- **External modules** (deployed outside the Manager, registered by proposal after launch) are first-class with
  labels. The web badges them "not deployed by the Manager" and shows their allowance and any `admin()` /
  `wasm_hash()` they report. `renewal_keys` is optional for them: without it the sweep renews their instance
  and code and shows a "not covered by one-click renewal" warning. The DAO's vote and the allowance are the only
  safeguards on external code. External modules never receive `launch` or `handoff`: they join a live DAO and
  don't need to implement the `DaoModule` trait.
- **Who counts as non-voting.** `voting_holder()` treats the Treasury (core) and every registered module with
  `non_voting = true` as holding no votes.
- **Registration moves the votes of what the module already holds, so there's nothing to grief.**
  - Registering a non-voting module that already holds k tokens runs `transfer_voting_units(Some(addr), None, k)`.
  - Unregistering it first calls `ensure_self_delegate(addr)`, then runs `transfer_voting_units(None, Some(addr),
    k)`, the same order `mint` and `transfer` use today. Without the self-delegation, OZ would add
    `k` to `TotalSupply` and credit nobody's checkpoint, because a module that only ever held tokens while
    non-voting has no delegate. Quorum would then be harder to reach by `k` for no reason.
  - These are the same moves a transfer into or out of the Treasury makes today. So voting units always equal
    balances (zero for non-voting holders), and the account checkpoints always add up to `TotalSupply`.
  - **Empty a module before unregistering it.** Tokens left in an unregistered module become that contract's
    own votes, which nobody casts unless its code votes, and they still count toward quorum. The normal path is
    to sweep them back to the Treasury first (for example `sweep_pool`). The web warns when an unregister
    proposal targets a module that still holds tokens. Unregistering is not blocked, because anyone could send
    the module an NFT to block it.
  - Sending an NFT to a predicted or registered module address can't block anything.
  - A wallet can't be registered at all (see "Only contracts can be modules"), so registration can't be used to
    strip a holder's votes.
- **One-click renewal covers every module (R3).** Every registered module implements
  `DaoModule::renewal_keys(cursor, limit) -> (keys, assets, next_cursor)`. It returns its own storage keys with
  their durability (holder-class entries excluded, as the sweep rule already says) and the assets whose balances
  it holds. The renewal sweep reads the Token's registry and pages through each module by simulation, so a
  custom module added by vote is renewed in the same click. The core Token, Metadata, Governor and Treasury keep
  today's client-side enumeration (`renewal.ts`).
  - The keys are **the exact `Val`s as stored, already namespaced** (`common::ns(e, key)`), each with its
    durability. The sweep builds `LedgerKey::ContractData { contract, key, durability }` from them directly, so
    a wrong answer silently renews the wrong entry; the R3 e2e (listed keys against a ledger scan) runs for
    ClaimMinter and the Marketplace pool pages.
  - `MintAllowance(addr)` entries live in the Token, not in the module, so they stay out of `renewal_keys`. The
    Token's core enumeration lists one `MintAllowance` per registry entry, replacing today's `MintAuthority`
    loop (`renewal.ts:231-232`); TTL_ECONOMICS documents the key.
- **The constructor shrinks to core wiring:** admin, treasury, metadata, manager, name, symbol, hash.
  `minter()` and `TokenKey::Minter` are removed.

### 2. Manager: optional modules and the assurance launch

- **`create_dao` deploys only the modules asked for.** It deploys the four core modules plus the optional modules
  listed in `params.initial_config.modules`, then registers them on the Token. A DAO that wants claims before
  launch includes ClaimMinter here, or adds it in Setup with `create_module`.
  - Today's `InitialDaoConfigValues` has fixed `auction: AuctionConfig` and `marketplace: MarketplaceConfig`
    fields (`contracts/manager/src/storage.rs:60`). They become `modules: Vec<ModuleSpec>`, where
    `ModuleSpec` is `Auction(AuctionConfig)`, `Marketplace(MarketplaceConfig)` or `Claims(ClaimsConfig {
    payment_asset })`.
  - `PendingDao`'s `auction_payment_asset`, `marketplace_payment_asset` and `claims_payment_asset` are copied
    from these specs. A ClaimMinter added in Setup with `create_module(token, claims, config, n)` sets
    `claims_payment_asset` from its `ClaimsConfig`.
- **`create_module(token, kind, config, expected_n) -> Address`** needs `token.admin()`'s authorization.
  - It deploys a registered implementation at `salt = sha256(token, kind, n)`, where `n = module_count(token, kind)`
    is a Manager counter that `create_module` increments.
  - It refuses with `StaleModuleIndex` unless `expected_n == module_count(token, kind)`.
  - `predict_module_address(token, kind, n)` is a pure function of its inputs.
  - The proposer reads `module_count` while drafting (the web's "attach module" draft does this), predicts the
    address for that `n`, and bakes the same `n` into the proposal's `create_module` action. A proposal that goes
    stale reverts at execution with `StaleModuleIndex` and has to be proposed again. **So the proposal either deploys exactly the module its later actions target, or the whole
    execution reverts.** It can never register or fund a module that another proposal created.
  - It emits `ModuleCreated { token, kind, n, address }`.
  - **A module created after launch is launched at once.** If the Token is already Live,
    `create_module` calls the new module's `DaoModule::launch(treasury, open)` in the same invocation, with
    `open` from its creation config; the Manager is the caller, so the Manager-only check passes. In Setup it
    leaves the module for `launch_dao`, as today. A module created after launch takes its payment asset from
    its own creation config alone, because `PendingDao` no longer exists; the proposal that creates it is the
    approval.
  - After launch, the same proposal goes on to call `token.register_module(...)` and
    `token.increase_mint_allowance(...)`.
- **`launch_dao`** calls `launch(treasury, ...)` on every registered module (a common `DaoModule` trait) and checks
  each module's `wasm_hash()` is registered and not revoked, as today.
  - Registered modules implement the `DaoModule` trait's two **Manager-only** entry points, which need the
    Manager's authorization, not the module admin's (R5):
    - `launch(treasury, open)`, which goes Live and hands the admin to the Treasury unless it already is. Each
      module fixes its payment asset in its creation config and checks it here. For modules created in Setup, the
      Manager compares that config with `PendingDao` before calling; modules created after launch use their
      config alone (see `create_module`).
    - `handoff(treasury)`, which hands the admin over early and stays in Setup.
  - The core Token, Metadata, Governor and Treasury keep their existing typed launch calls, and each gains a
    Manager-only `handoff(treasury)`. `open_assurance` and every launch path call both the core contracts and the
    registered modules. ARCHITECTURE documents both shapes.
  - Today's `token.launch` and module `launch` are already Manager-only. Their launch settings
    (`launch_auction`, `launch_marketplace`, the open flags) are launch arguments, not admin setters, so the Manager
    can apply a stored `LaunchConfig` whoever the module admin is.
  - `PendingDao` already records `launch_admin`. After an early handoff the launch admin is no longer
    `token.admin()`, so the manual launch checks this field instead.
  - `PendingDao`'s payment assets (`auction_payment_asset`, `marketplace_payment_asset`) become `Option`s for
    optional modules, and it gains `claims_payment_asset`. All three come from the `ModuleSpec` configs (see
    `create_dao` above).
- **No platform minter.** `PlatformMinter`, `set/get_platform_minter`, `LaunchConfig.minter` and errors 7108 and
  7110 are removed. The Manager's own upgrade notice stays (D39/D42).
- **`open_assurance(token, list_params, launch_config)`** is how a paid list opens before launch. It needs the
  launch admin's authorization and, in one call:
  1. looks up the DAO's registered ClaimMinter (`token` registry, kind `claims`; `NoClaimMinter` if there isn't
     one), checks that no assurance is already recorded for this token (**at most one assurance per token**), and
     checks that the list's payment asset equals `PendingDao.claims_payment_asset`. It also checks
     `now < deadline ≤ now + MAX_ASSURANCE_WINDOW` (90 days; `DeadlineTooFar`). That bounds how long a drive can
     hold its slug and keep members' fees in escrow, so `create_dao` plus `open_assurance` can't be used to sit
     on names;
  2. calls `claim_minter.open_list(...)` with the assurance terms;
  3. calls `token.increase_mint_allowance(claim_minter, total)`;
  4. stores `launch_config`, `list_id` and the list's `deadline` in `PendingDao`, and **claims the DAO's slug** (`SlugToDao` / `DaoSlug`,
     `SlugClaimed`) so no other DAO can launch with it during the drive (R2). Once the list is
     `Failed`, anyone can call `release_slug(token)` to free it. `launch_dao` skips the slug claim for a DAO that
     already holds its slug. `update_pending_slug` refuses while an assurance is recorded (`AssuranceOpen`), so
     `PendingDao.slug` and the claimed slug can't drift apart;
  5. **hands every module's admin to the Treasury** through each module's Manager-only `handoff(treasury)`, without
     going Live.

  From then on the launch admin can change nothing, and the Treasury can't act before launch. So settings,
  artwork, other allowances, module registrations, founder mints and module upgrades are frozen by construction.
  Founders must be minted and artwork added before the list opens.
- **Launching:**
  - `launch_when_ready(token)` can be called by anyone, without authorization. The Manager reads `PendingDao`,
    requires `claim_minter.assurance_state(list_id) == Met`, and launches with the stored `launch_config`. The
    Manager authorizes its own calls into the modules, as it does today.
  - While an assurance is recorded, **every launch path, including the launch admin's `launch_dao`, requires
    `assurance_state == Met`** and uses the stored `launch_config`. The two escrow exits therefore exclude each other:
    `release` refuses unless the Token is Live (only possible after `Met`), and `refund` refuses unless the state is
    `Failed`, which a Live Token can never reach. A manual `launch_dao` checks the launch admin recorded in
    `PendingDao` instead of today's `LaunchAdminNotOwner` (`token.admin()`) check.
  - Once `assurance_state` is `Failed`, every launch path refuses (`AssuranceFailed`). That's a terminal state: the
    DAO never launches, and the tokens minted to members carry no power because nothing ever goes Live.
  - **One definition of failure, owned by the Manager.** Because R1 defines `Failed` as "the
    deadline passed and the DAO isn't Live", the Manager can compute it alone:
    `ledger_timestamp > PendingDao.deadline && !token.is_live()`. Launch refusal, `release_slug` and
    `recover_claims` all use this Manager-side rule and never ask ClaimMinter. ClaimMinter's `refund` applies
    the same rule from its own stored deadline plus `token.is_live()`, so `assurance_state` is a derived view,
    not a source of truth. Only `Met` (the threshold count) is read from ClaimMinter.
  - `release` inside launch may touch an archived escrow balance. A `Met` list can wait up to 90 days, and the
    ClaimMinter's asset balance is a host entry with a 30-day TTL (TTL_ECONOMICS.md:63). It's renewable before
    launch, because `renewal_keys` reports the held asset and the sweep covers pending DAOs, but nobody has to
    click renew. The launch transaction therefore restores it automatically, like `refund`.

### 3. ClaimMinter: a per-DAO module (replaces `contracts/minter`)

- **A module like any other.** Registry kind `claims`, voting (it never holds NFTs). Its constructor wires the
  Token, the Treasury and the Manager. It uses `common::upgrade` with the DAO admin, as the other modules do, and
  stays in Setup until the Manager launches it. It keeps error block 7800 and the existing merkle leaf, proof and
  `tree_uri` format (the 2026-10-12 decision).
- **`open_list(root, tree_uri, asset, price, expires_at, total, assurance: Option<{threshold_claimers, deadline}>)
  -> list_id`.**
  - It needs the token admin's authorization, plus one more check before launch:
    - **Setup with `price > 0` or an `assurance`:** the call must also carry the Manager's authorization (ClaimMinter
      stores the Manager address from its constructor). So only `manager.open_assurance` can open it, and
      `PendingDao` always records it. A launch admin calling `open_list` directly fails with `ManagerRequired`.
    - **Setup with `price == 0` and no assurance:** the launch admin may open the list directly.
    - **Live:** the Treasury, by proposal, with any price and no assurance (`AssuranceNotAllowed`).
  - Each list has one payment asset.
  - In Setup it also needs artwork (`metadata.properties_count() > 0`).
  - ClaimMinter tracks each list's `minted` count against its `total` itself. The Token allowance is only the
    aggregate cap across all of this DAO's lists.
- **`claim(list_id, buyer, leaf_amount, mint_now, proof, max_price)`.**
  - The proof covers the full leaf `(buyer, leaf_amount)`.
  - **Partial claims:** a per-(list, buyer) record holds how much has been claimed, and
    `mint_now ≤ min(leaf_amount − claimed, MAX_BATCH_MINT)`. So a large leaf is claimed across several
    transactions and never gets stuck behind the event budget.
  - Each claim charges `price × mint_now` in the list's asset, then mints through `batch_mint`, using up the
    allowance.
  - Where the payment goes: during Setup on the assurance list, into per-list escrow (and the buyer's paid amount
    is recorded); otherwise to the Token's `treasury()`.
- **Assurance state** (`assurance_state(list_id)`):
  - `Open` until the threshold is reached;
  - `Met` once `distinct claimers ≥ threshold_claimers`;
  - `Failed` once the deadline passes and the DAO is not Live, whether the list was `Open` or `Met`
    (R1). So a `Met` list whose launch is blocked (a taken slug, a paused factory, a revoked hash) still refunds.
    Launching is allowed only from `Met` until the deadline.

  `claim` refuses on a `Failed` list (`AssuranceFailed`). After launch, the list keeps accepting claims until its
  `expires_at`; those pay the Treasury directly (the Setup escrow rule no longer applies), so `release` is called
  once, inside the launch transaction. Before launch, the deadline decides: `Met` and launched, or `Failed`
 .

  The unit is distinct claimers, because the goal is "people who show up". The tree fixes the addresses, so
  nobody can add sybil leaves, and partial claims count once per address.
- **`release(list_id)`** moves the list's escrow to the Treasury wired at construction, so nobody can redirect it.
  `launch_dao` and `launch_when_ready` call it in the same transaction, right after every module goes Live, so
  the fees arrive with the launch (R4). It stays public, and refuses unless the Token is Live.
- **`refund(list_id, buyer)`** works only in `Failed` and returns the buyer's escrowed payments.
- **Each DAO's escrow is isolated** in its own ClaimMinter.
  - A bug is fixed by that DAO's own upgrade, to a Manager-approved hash.
  - While an assurance list is open, the early handoff also freezes upgrades. A Setup-frozen DAO's way out is
    the deadline and refunds.
  - **Recovery upgrade for a failed drive.** If `assurance_state` or `refund` itself is broken, a
    `Failed` list would strand its escrow, because nobody can upgrade a frozen ClaimMinter. So
    `manager.recover_claims(token, from_hash, to_hash)` lets the launch admin recorded in `PendingDao` upgrade
    **only that DAO's ClaimMinter**, **only while the drive has failed**, and **only to a Manager-approved
    `claims` hash**. The gate is the Manager-side failure rule (`ledger_timestamp > PendingDao.deadline &&
    !token.is_live()`), never ClaimMinter's own `assurance_state`, because the state machine may be the broken
    code. It calls ClaimMinter's Manager-only `recovery_upgrade(from, to)`, which checks only the
    Manager's authorization and that it is still in Setup (it must never run on a Live module); it doesn't consult
    its own state machine. The window opens only once nothing can be launched any more, so the upgrade can't
    change the drive's outcome; it can only unblock refunds.
  - `refund` and `release` never need an allowance, so cutting a buggy module's allowance to zero never strands
    escrow.
- **Same indexer route as every module.** ClaimMinter events route through the Token's `ModuleRegistered` and
  the module identity views (§7), so the old `token`-topic route for the shared Minter is removed.

### 4. Quick-buy (`workflows.png`): a stock pool minted into Marketplace custody

- **The Marketplace mints its own stock.** It is a registered non-voting module and mints within an allowance.
  1. A proposal runs `token.increase_mint_allowance(marketplace, n)`, then
     `marketplace.open_pool(price, asset, expires_at, n, max_per_buyer, max_sold_per_period, period_secs) ->
     pool_id`.
     - **Each pool reserves its own share.** `open_pool` records `reserved = n` and requires
       `token.mint_allowance(marketplace) − Σ reserved_open_pools ≥ n` (`AllowanceNotReserved`). `restock`
       draws only from its own pool's reservation, so closing one pool can never starve another.
  2. Anyone calls `marketplace.restock(pool_id)`. That mints the next chunk straight into the Marketplace's custody
     and appends the ids to the pool's stock pages. `Pool(pool_id)` holds price, asset, expiry, limits and
     counters; `PoolStock(pool_id, page)` holds up to 64 ids, so a 100-token pool adds about 3 entries to one-click
     renewal instead of 100 (R8).
     - The chunk is sized to the event budget for a mint plus a page append (`common::restock_fits`, measured in
       e2e like `batch_mint_fits`).
     - It repeats until n tokens are stocked.
- **What this avoids:**
  - Token ids are decided when minted, so a proposal never names ids.
  - The Treasury never transfers or approves anything.
  - Pools of any size work, because no single proposal does the minting.
- **Closing a pool.**
  - `restock` refuses after `expires_at` or once the pool is closed.
  - `close_pool(pool_id)` needs the Treasury, by proposal, at any time, or anyone once the pool has expired.
  - `sweep_pool(pool_id)` can be called by anyone after close. It moves unsold stocked tokens back to the Treasury
    in budget-sized chunks and empties their stock pages. Both holders are non-voting, so no votes move.
  - `close_pool` returns the pool's unstocked remainder, `n − stocked` for that pool only, through
    `token.release_mint_allowance(n − stocked)`, and drops the pool's reservation. `release_mint_allowance`
    saturates at the current allowance, because the Treasury may have lowered it by proposal in between. The Marketplace authorizes that Token call itself, and it can only
    lower the caller's own allowance. Unsold supply always ends up in the Treasury, and no allowance is left behind.
- **Buyers pick a specific NFT** with `buy_from_pool(pool_id, page, token_id, buyer, max_price)`, which removes the
  id from its page and pays the Treasury. Member resales keep the existing `Listing` / `buy(token_id)` path. `buy_from_pool` refuses on a
  pool that is closed or past `expires_at` (`PoolClosed`), so the pool stops selling at once, even before its stock
  is swept.
- **Custody caps only the pool total.** A token sits in exactly one pool, and the pool can't sell more than its
  stock, but on its own that doesn't stop one buyer taking the whole pool. Each pool therefore also enforces:
  - **`max_per_buyer`:** a per-(pool, buyer) count; `buy_from_pool` refuses past it (`BuyerLimitReached`). This is for
    fairness. A funded attacker can still split purchases across wallets (about 1 XLM each).
  - **`max_sold_per_period`** over `period_secs`: a pool-wide counter that resets each period; `buy_from_pool`
    refuses past it (`PoolRateLimited`). Splitting across wallets can't get around it. It paces a pool the way the auction is
    paced, and gives the DAO time to close a pool that one buyer is draining.
  - **A size warning** (web only): the proposal draft shows the largest share of voting supply one buyer could
    reach (`min(n, max_per_buyer × wallets)`, and the full n in the worst case) against the current voting
    supply. Voters see the takeover risk of a large pool before they vote.
- The diagram's "verify escrow owns NFTs" step is the web reading the pool's stocked ids after `restock`.
- **Lazy single-token primary listings are removed from the Marketplace.** Pools and ClaimMinter cover them.

### 5. Circle and Auction

- **Circle:** a per-DAO module from `create_module`, attached by proposal after launch, with `non_voting = false`.
  It mints badges on `join` within its allowance. How it admits members is the Circle's own design question.
- **Auction:** optional at `create_dao`, non-voting, with an allowance of `u32::MAX` (see section 1).

### 6. Who holds which power

| Actor | Before launch | After launch |
|---|---|---|
| Platform admin, through Manager upgrades (with the D39/D42 notice) | Deploys and registers modules for DAOs still in Setup (registered hashes only). A hostile Manager could launch or alter a DAO that is still in Setup, the same factory trust DAOs accept today. It can also end an assurance drive in refunds, by pausing the factory or revoking a hash before the drive's deadline: the same factory trust, but a new lever. | **No Token authority.** It can approve hashes in the registry, but a module upgrade still needs the DAO's own proposal. It can't reach any DAO's escrow: ClaimMinter pays only the Treasury wired at its construction. |
| Modules (Auction, Marketplace, ClaimMinter, Circle, custom) | Mint within their allowances; ClaimMinter holds assurance escrow. Upgrades by the launch admin until `open_assurance` freezes them; after that, only the recorded launch admin's `recover_claims` on a `Failed` list, to an approved `claims` hash. | Mint within their allowances. **Upgraded only by the DAO's own proposal** to Manager-approved hashes. |
| Treasury | Can't act | Mints without a limit; manages allowances and registrations |

Modules can also be **delegates**. `non_voting` zeroes what a module *holds*, but `Votes::delegate` is public
(`contracts/token/src/contract.rs:565`), so members can delegate *to* a module's address. A custom module whose
code calls `vote` would then vote with delegated power. That is the DAO's choice when it registers the module,
and the web shows any delegated votes next to a module.

**Trust limitations SECURITY_MODEL states:**
- **An assurance proves a launch, not a community.** The creator writes the tree, so a creator can meet
  `threshold_claimers` with their own wallets and launch a DAO they control, with outsiders' fees in a Treasury
  they govern. Refunds, the deadline bound and the frozen settings don't cover this, and nothing on chain can.
  Members must read the published tree before paying. The claim page shows the tree's address count against
  the threshold and the share of the tree the largest leaves hold.
- **Payment assets with issuer controls.** A list's or pool's payment asset is the creator's or the DAO's choice.
  An asset with clawback or authorization-required flags can be clawed back from escrow, or frozen in the
  Treasury, by its issuer. This extends SECURITY_MODEL's existing payment-asset limitation to escrow and pools,
  and the web shows the asset's flags next to the price.

### 7. Indexer and read model

Today the stream filter and each event's `contract_role` come from six Goldsky dynamic tables, one per module
kind, each filled by a regexp over `DaoCreated` data (`packages/goldsky/templates/builder-stellar-events.yaml.mustache`).
The role is decided by *which* table holds an address, because `dynamic_table_check(table, value)` is only a
membership test. `manager.event_identity` is `manager.dao_modules`, built from `DaoCreated`
(`db/migrations/0002_manager_views.sql:76`). Three things in this design break that scheme: kinds are no longer a
fixed set (`claims`, `circle`, `custom_<name>`); dynamic tables are append-only, so an unregistered module's events
would still pass with its old role; and external modules emit event names the decoder has never seen.

- **Allowlists.** One dynamic table per *known* kind (`dao_auctions`, `dao_marketplaces`, `dao_claims`,
  `dao_circles`), each filled by a regexp over the Token's `ModuleRegistered` data where `kind` matches. Plus one
  catch-all `dao_modules`, filled from every `ModuleRegistered`. The stream filter admits any address in any
  table. The role CASE tries the known kinds first and falls back to `module`. The core four (token, metadata,
  governor, treasury) stay in `DaoCreated` and keep their tables. Custom kinds match
  `"kind":{"symbol":"custom_[A-Za-z0-9_]{1,25}"}`.
  - **How the per-kind tables are filled (as built).** `goldsky turbo validate` refused a dynamic table
    that reads an intermediate SQL transform ("table 'default.module_registrations' not found", then "no
    consumers"), so every module table reads `stellar_events` directly: the `ModuleRegistered` branch is gated
    by `dynamic_table_check('dao_tokens', contract_id)` inside the table's own SQL, and the per-kind tables also
    take the Manager's `DaoCreated` and `ModuleCreated`, because `create_dao` registers its modules on the Token
    before `DaoCreated` allowlists that Token.

    **Then narrowed (2026-10-13).** The per-kind tables keep only the Manager branches, so a known
    role means the Manager deployed the code; every `ModuleRegistered` goes to the catch-all `dao_modules`
    only. A contract a DAO registers by vote under a built-in kind is role `module`: indexed for the DAO,
    admin feed rows, outside the domain views, and refused by the claims page. The read model matches it
    (`manager.manager_modules`). Each module table also guards `<extracted address> <> ''`, so a
    `DaoCreated` without a module kind adds no empty key.
    Same-transaction ordering (a module's constructor events before its
    `ModuleRegistered`) behaves like today's `DaoCreated` population.
- **Identity in SQL.**
  - `manager.dao_modules` and `manager.event_identity` are built from `ModuleRegistered` (dao_id = the emitting
    Token's DAO, kind, address, non_voting, `registered_pos`) and `ModuleUnregistered` (`unregistered_pos`).
  - `manager.module_events` joins on `registered_pos <= e.pos AND (unregistered_pos IS NULL OR e.pos <
    unregistered_pos)`. So an unregistered module's later events are dropped in SQL, even though the
    append-only stream still passes them.
- **Optional modules in the Manager views.** `DaoCreated.modules` and `DaoAddresses` become optional per module.
  `manager.dao_registry`, `manager.daos` (`auction_contract`, `marketplace_contract`, `auction_enabled`,
  `marketplace_enabled`) and the Prisma `ManagerDao` view become nullable.
- **`DaoLaunched` changes shape.** Its `minter` field disappears, the open flags come from the
  stored launch config, and it gains the launch-time module list `Vec<(kind, address)>`. That way the indexer
  knows a DAO's launch set without the Token's `ModuleRegistered` events. `manager.dao_launches`
  (`db/migrations/0002_manager_views.sql:90-100`) changes with it: `minter` is dropped, `launch_auction` and
  `launch_marketplace` are kept as reported, and `manager.daos.minter_contract` and `auction_enabled` are
  rewired.
- **Common events from new roles.** `COMMON_EVENT_EMITTERS` in
  `packages/goldsky/src/contract-events.mjs` replaces `minter` with `claims`, `circle` and `module`, so a
  ClaimMinter upgrade becomes `claims.upgraded`, not `contract.upgraded`.
- **Unknown events.** An event from a `module`-role contract with an unknown name decodes as follows:
  - `event_name` as emitted;
  - `topics` / `args` positional (`topic_0..`, `arg_0..`);
  - kind `module.<event_name>`, title "Module event", visibility `admin`.

  `test/every-event.test.mjs` keeps its strict rule for events the contracts define, and adds one fixture for
  the unknown path.
- **Tests.** `test/allowlist-regex.test.mjs` today asserts one dynamic table per `DaoAddresses` field. It moves to
  asserting the per-kind tables and the catch-all against `ModuleRegistered`.
- **Marketplace read model.** Removing primary listings deletes:
  - `marketplace.primary_listings` and `marketplace.primary_listing_comments`;
  - the `sale_type` split in `marketplace.sales` (`db/migrations/0008_marketplace_views.sql:23,102,122`);
  - their Prisma views, and the web pages that read them.

  Pools need `Pool` and `PoolStock` views, and `buy_from_pool` purchases in `marketplace.sales`. Pre-mainnet the
  baseline is edited in place.
- **The event shapes** (`ModuleRegistered`, `ModuleUnregistered`, `ModuleCreated`) are the contract's public API
  for the indexer.

## Open Questions

1. **Vote delay.** Should tokens bought from a pool vote only after T days? That is the strongest takeover defense,
   but it changes the Token's checkpoints. It's deferred until per-buyer caps and the sales rate prove
   insufficient.
2. **Circle `join` for existing holders.** Mint for a member who already holds a token, or skip
   (savings-circle open question 2).

## Success Criteria

- **No platform minting.** Every allowance holder is a module the DAO upgrades by its own proposal; nothing the
  platform can upgrade holds an allowance. After launch the Manager has no Token authority, and per-DAO modules change code only
  through the DAO's own proposal.
- **Vote counts stay exact.** A property test across random mint, transfer, list, restock, `delegate`, register and
  unregister sequences, including registering and unregistering modules that hold tokens. Three clauses after
  every operation:
  1. for every address, voting units equal balance, or zero for a non-voting holder;
  2. the `TotalSupply` checkpoint equals the sum of voting units;
  3. the sum of all account checkpoints equals the `TotalSupply` checkpoint.

  Extra cases:
  - Register a non-voting module that already holds tokens and has delegated to another address. The delegate's
    checkpoint drops by `k`, and the module's units are zero.
  - Unregister a module that holds tokens. `TotalSupply` and the module's own checkpoint both rise by `k`.
- **Allowances hold.** A module can't mint beyond its allowance; increases add up; unregistering zeroes it;
  `release_mint_allowance` lowers only the caller's own allowance; no module except ClaimMinter mints before launch.
- **Assurance launch, end to end:** a 1,000-leaf tree.
  - The threshold is met by distinct claimers, including partial claims, and any account launches with the stored
    config.
  - When the deadline is missed: `Failed`, refunds pay out, and both `launch_when_ready` and the manual
    `launch_dao` are refused. A manual `launch_dao` while the list is still `Open` is refused too, and `refund` on
    a Live DAO is refused.
  - While the list is open, the launch admin's setters and mints fail.
  - `open_assurance` with a deadline more than 90 days out fails (`DeadlineTooFar`).
  - A failed drive whose ClaimMinter `refund` is broken is recovered: `recover_claims` upgrades ClaimMinter to an
    approved hash only while the list is `Failed`, and refunds then pay out. `recover_claims` on an `Open` or
    `Met` list, or by anyone else, fails.
- **Quick-buy:** a pool of 100 is stocked by repeated `restock` calls; a buyer picks a specific id; nobody can buy
  more than the stock, one buyer can't exceed `max_per_buyer`, and sales in a period stop at
  `max_sold_per_period`. The web draft shows the largest voting share one buyer could reach. Closing or expiring the pool sweeps unsold stock back to the Treasury, and the unused
  allowance is released.
- **ClaimMinter before launch:** a launch admin's direct `open_list` with a price or an assurance fails
  (`ManagerRequired`). After `open_assurance` hands admins over early, `launch_when_ready` still launches every
  module with the stored config.
- **Module prediction:** `create_module` with a stale `expected_n` fails, and nothing is registered or funded.
- **Modules created after launch work at once:** a Circle attached by proposal after launch mints a badge in the
  next transaction.
- **Recovery doesn't trust the broken code:** a ClaimMinter test double whose `assurance_state` always returns
  `Open` is still recovered by `recover_claims` after the deadline, and refunds then pay out.
- **Pools don't starve each other:** two pools share one Marketplace allowance; closing the first doesn't stop
  the second restocking to its `n`; `open_pool` beyond the unreserved allowance fails.
- **Predicted addresses can't be registered:** `register_module` with an address whose `executable()` is `None`
  (predicted, not yet deployed) fails with `NotAContract`; the same address succeeds once deployed.
- **Kinds:** `register_module` with `custom_` plus more than 25 characters, or any character outside
  `a-zA-Z0-9_`, fails (`InvalidKind`).
- **Slug stays put:** `update_pending_slug` during an assurance fails (`AssuranceOpen`).
- **Launch after a quiet drive:** a `Met` list whose escrow balance archived launches, and the escrow is restored
  and released in the same transaction.
- **Only contracts are modules:** `register_module` with a wallet or a Stellar Asset Contract address fails
  (`NotAContract`). `increase_mint_allowance` for an unregistered address fails (`NotAModule`).
- **Indexer:** an unregistered module's later events are dropped by `manager.module_events`; an external
  module's unknown event decodes as `module.<event_name>`; `allowlist-regex.test.mjs` checks the per-kind tables.
- **Optional modules:** a DAO created without Auction or Marketplace gets a Circle attached by one proposal, and a
  custom module that holds NFTs is registered by vote.
- **Renewal:** the renewal quote covers every registered module, including ClaimMinter lists, claim records and
  escrow balances.
- **Vote tally lifetime:** after a proposal's first and only vote, `ProposalVote(id)` has at least
  `PROPOSAL_TTL_EXTEND_TO − 1` ledgers left (today it has the 7-day network minimum). The test follows
  `proposal_id_entry_renews_with_the_core` (`contracts/governor/src/test.rs:1951`). `queue` after a full 30-day
  voting period with one early vote needs no restore.

## Decisions

Made with the owner on 2026-10-13 and built as written.

| ID | Decision |
|---|---|
| R1 | An assurance list fails once its deadline passes and the DAO isn't Live, even if it was `Met`, so a drive whose launch is blocked (a taken slug, a paused factory, a revoked hash) still refunds. Launching is allowed only from `Met` until the deadline. |
| R2 | `open_assurance` claims the DAO's slug for the drive. Anyone can release it once the list has failed, and `launch_dao` skips the claim for a DAO that already holds its slug. |
| R3 | Every registered module lists its own renewal keys (`DaoModule::renewal_keys(cursor, limit)`: the exact stored keys with durability, the assets it holds, and a cursor). The sweep pages through each module; the core four keep client-side enumeration. |
| R4 | The assurance escrow moves to the Treasury inside the launch transaction. |
| R5 | Manager-built modules share the `DaoModule` trait: Manager-only `launch(treasury, open)` and `handoff(treasury)`, with each module checking its payment asset at launch. The core four keep their typed launch calls and gain a Manager-only `handoff`. |
| R6 | Modules deployed outside the Manager are first-class with labels: registered only after launch, by proposal; allowlisted by the indexer from `ModuleRegistered`; badged in the web; renewed by instance and code, with a warning, when they don't list their keys. |
| R7 | The existing Token, Manager and Marketplace suites plus the voting-units invariant are the regression contract. The intentional changes: allowances replace mint authority, the Minter pin and primary listings go, and the non-voting set comes from the registry. |
| R8 | Pool stock is paged: `Pool(pool_id)` plus `PoolStock(pool_id, page)` with up to 64 ids per page, so a pool adds pages + 1 entries to the sweep. |
| R9 | A vote delay for pool purchases is a TODO (TODOS.md), not built. |

## Implementation notes (2026-10-13)

Choices made while building. Each refines the design without changing what it guarantees.

- **`create_module(token, spec, expected_n)`.** The kind comes from the `ModuleSpec` variant, so a kind and a config can never disagree. `module_count` and `predict_module_address` still take the kind. The salt is `sha256(xdr(token) || xdr(kind) || n_be)`.
- **A module created after launch is launched with `open = false`.** The proposal grants its allowance after creating it, so an Auction that opened at creation would try to mint without one. The proposal opens the module once it is funded.
- **The payment-asset check lives in the Manager (R5).** `DaoModule` has `payment_asset()`. Before any launch call, `launch_dao` compares each registered module's current asset with the one `PendingDao` recorded at creation (`PaymentAssetMismatch`, 7132). The module-side errors (Auction 7415) are retired.
- **ClaimMinter releases its own escrow in `launch` (R4).** The Manager launches the Token first and then every module, so the ClaimMinter's `launch` sees a Live Token and moves the assurance escrow to the Treasury in the same transaction. `release` stays public.
- **No `ManagerRequired` error.** Soroban can't tell a contract who invoked it, so a launch admin's direct `open_list` with a price or assurance terms fails the Manager's `require_auth` (an authorization error) instead of a named code.
- **Claim records are holder class.** `Claim(list, claimer)` belongs to the claimer; their next claim or refund restores it (automatic since protocol 23). `renewal_keys` lists the DAO-owned `List(id)` entries and the escrow balance. Read the renewal Success Criterion as "lists and escrow balances".
- **No contract re-entry in recovery.** `recover_claims` → ClaimMinter → `manager.is_upgrade_approved` would re-enter the Manager, which Soroban forbids. So the Manager checks the approval and passes the target version, and `recovery_upgrade` applies it (`common::upgrade::apply_checked_by_manager`). The gate is unchanged: Manager authorization, Setup only, an approved hash.
- **Storage shapes.** A `#[contracttype]` field can't hold `Option<struct>`, so a `ClaimList` stores its assurance terms flattened (a threshold of 0 means none). The Manager keeps a drive under its own `Assurance(token)` key rather than inside `PendingDao`, and drops it at launch.
- **`open_assurance` takes `AssuranceListParams`** without an asset: the list is priced in the `claims_payment_asset` recorded at creation.
- **`DaoLaunched.registry`** is the launch-time module list (`Vec<ModuleEntry>`). `modules` keeps the `DaoAddresses`, whose module fields are now optional, so optional modules changed no shape.
- **`LaunchAdminNotOwner` stays for launches without a drive.** With a drive, the admins are already the Treasury's and the recorded launch admin is checked instead.

### Test map (Success Criteria → tests)

Unit tests live in each crate's `src/test.rs`; end-to-end tests run on the built WASMs in `contracts/e2e/src/{test,membership,voting_invariant}.rs`.

| Success Criterion | Tests |
|---|---|
| No platform minting; allowance holders are modules | token `launch_refuses_a_grant…`, `increase_mint_allowance_requires_admin_auth`, `only_deployed_wasm_contracts_can_be_modules`, `the_treasury_is_never_a_module_even_with_an_empty_registry`; manager `launch_grants_exactly_the_canonical_mint_set` |
| Vote counts stay exact (3 clauses; register/unregister of a holding module; module as delegate) | e2e `voting_units_match_balances_and_checkpoints_add_up` (each op, including registering and unregistering while holding, runs at least 20 times over 4 seeds); token `registry::*` (D2, A1) |
| Allowances hold (cap, increases add, unregister zeroes, release lowers only one's own, only claims mints pre-launch) | token `allowances_add_subtract_and_release`, `module_mints_within_its_allowance…`, `before_launch_only_the_claims_module_mints`, `an_unlimited_allowance_is_never_spent`, `releasing_from_an_unlimited_allowance_keeps_it_unlimited`, `registry_and_allowance_changes_are_events`; e2e `a_claim_minter_stops_at_its_allowance` |
| Assurance launch end to end (1,000 leaves, partial claims, anyone launches, both paths refused until Met and after failure, refund refused on Live, frozen setters and mints, DeadlineTooFar, recovery) | e2e `an_assurance_drive_of_a_thousand_leaves_meets_and_anyone_launches`, `a_failed_drive_refunds_recovers_and_frees_its_slug`, `a_pending_drive_is_covered_by_the_renewal_inventory`; manager `real_dao::a_met_drive_…`, `launch_dao_during_a_drive_uses_the_stored_config`, `a_failed_drive_refuses_every_launch_…` (paused factory, R1), `open_assurance_bounds_the_deadline_and_runs_once`, `recover_claims_waits_for_a_failed_drive_…` (Open and Met refused); minter `a_met_drive_…`, `a_missed_deadline_…`, `a_met_drive_that_misses_its_deadline_also_fails` |
| Quick-buy (100-token pool, restocks, picks, caps, rate, close, sweep, allowance released) | e2e `a_hundred_token_pool_restocks_sells_closes_and_sweeps` (16-trait artwork, event budget); marketplace `pools::*` |
| ClaimMinter before launch (priced or assurance `open_list` needs the Manager) | minter `a_setup_list_with_a_price_or_assurance_needs_the_manager`, `setup_lists_need_artwork_and_the_configured_asset`, `handoff_freezes_the_lists_until_launch` |
| Module prediction (stale `expected_n` changes nothing) | manager `create_module_refuses_a_stale_index_and_unknown_tokens`; e2e `a_module_created_after_launch_works_in_the_next_call`, `a_pending_drive_is_covered…` (same kind refused atomically) |
| Modules created after launch work at once (Circle pending: a ClaimMinter stands in) | e2e `a_module_created_after_launch_works_in_the_next_call` |
| Recovery doesn't trust the broken code | manager `a_lying_claim_minter_is_still_recovered_after_the_deadline` |
| Pools don't starve each other | marketplace `pools::pools_reserve_their_own_share_of_the_allowance` |
| Predicted addresses can't be registered; only contracts are modules | token `only_deployed_wasm_contracts_can_be_modules` |
| Kinds | token `kinds_are_built_in_or_custom_and_unique` (a `Symbol` cannot hold other characters at all) |
| Slug stays put during a drive | manager `real_dao::a_met_drive_…`; e2e `an_assurance_drive_…` |
| Launch after a quiet drive restores an archived escrow | **not covered**: the test host has no hot archive; needs a testnet run |
| Optional modules; a custom module that holds NFTs registered by vote | e2e `a_dao_without_optional_modules_launches_and_registers_external_code`; manager `create_dao_takes_any_set_of_modules_without_repeats` |
| Renewal covers every registered module (lists, pool pages, escrow balances, the Manager's drive records) | e2e `protocol_runs_on_chain_state_only`, `a_hundred_token_pool_…`, `a_pending_drive_is_covered_by_the_renewal_inventory` (each against a full ledger scan) |
| Vote tally lifetime | governor `the_vote_tally_lives_as_long_as_the_proposal` |
| Early handoff on every contract (Manager-only, Setup-only, launch does not repeat it) | token `review::handoff_…`; governor, metadata, treasury `handoff_…`; auction, marketplace, minter `handoff_…` |
| Event shapes the indexer reads | token `registry_and_allowance_changes_are_events`; manager `create_module_deploys_…` (ModuleCreated), `real_dao::a_met_drive_…` (AssuranceOpened), `a_failed_drive_…` (SlugReleased), `dao_launched_lists_the_registered_modules`; minter `claims_emit_…`, `a_met_drive_…` (EscrowReleased, ClaimMinterLaunched), `a_missed_deadline_…` (Refunded); marketplace `pools::pool_lifecycle_events` |
| Indexer criteria | `packages/goldsky/test` (`allowlist-regex.test.mjs`, `every-event.test.mjs`) |
