# Architecture

Builder separates platform deployment, DAO authority, and indexed history. A Manager creates six independent DAO modules; a shared Minter is a separate platform contract. Manager cannot administer a DAO after launch, but its registry remains an upgrade-policy dependency and the source of every module's `version()`.

The protocol runs on chain state alone: a client with public RPC, the contract addresses and its own keys can create, operate, upgrade and renew a DAO. The indexer is a read cache for discovery, feeds and history. Display text (the DAO profile, proposal descriptions, comments) lives in events. See [STORAGE_DIET](STORAGE_DIET.md) and, for every storage key and its renewal, [TTL_ECONOMICS](TTL_ECONOMICS.md).

```text
Manager: implementation registry + factory + temporary PendingDao + persistent slugs
  └─ each DAO: Token, Metadata, Auction, Governor, Treasury, Marketplace
Shared Minter: every DAO's post-launch mint authority, per-token claim rounds

Wallet → Governor: propose / vote / queue
Wallet → Treasury.execute → Governor.consume (returns)
                         → ordered target calls → Execute events

Events → Goldsky dynamic allowlists and transforms
       → raw / decoded / activity landing tables
       → PostgreSQL views → Prisma/services → API → web UI
Local browser storage → creation/proposal drafts and preferences (not indexed)
```

## Modules

| Module | Responsibility |
| --- | --- |
| [Token](../contracts/token/README.md) | NFT ownership, delegation/checkpoints, voting supply (Treasury/Auction/Marketplace hold no votes), batch minting within an event budget (43 tokens to one recipient or 18 recipients), Metadata hook |
| [Metadata](../contracts/metadata/README.md) | Artwork properties/items/IPFS groups, per-token selections, the on-chain `token_uri` JSON, and the hash of the event-only DAO profile |
| [Auction](../contracts/auction/README.md) | Continuous English auction, SAC payments, settlement and refund fallback |
| [Governor](../contracts/governor/README.md) | Timestamp voting windows, snapshot weights, quorum, queue and consumption |
| [Treasury](../contracts/treasury/README.md) | Asset custody, admin of every module after launch, ordered proposal execution, `authorize` actions for nested auth |
| [Marketplace](../contracts/marketplace/README.md) | Lazy primary mint-on-purchase and escrowed secondary sales; seller fee/asset and buyer price bounds; fee ≤ 25% |
| [Manager](../contracts/manager/README.md) | Deterministic factory, implementation registration/revocation/latest selection and approvals, slug registry (launched DAOs can move by vote) |
| [Minter](../contracts/minter/README.md) | One shared Minter for every DAO: batch mints and Merkle claims (root plus a published `tree_uri`) for Live tokens |

`common` is a library; `dao-e2e` is an in-memory test crate. Neither is a DAO module. Release labels live in [the manifest](../releases/contracts.json).

## Create → Setup → Launch

1. `create_dao` requires deployer and launch-admin authorization, validates configuration/current implementations, and deploys all six modules with constructor-only wiring.
2. The launch admin is every module's `admin()` in Setup. Artwork must be added **before** founder mints: the Metadata hook seeds traits at mint time and seeds nothing without properties (`metadata.regenerate` seeds a token minted without traits). Founder mints and artwork/configuration changes are separate transactions; a later failed transaction does not undo earlier ones.
3. `launch_dao(token_address, launch_config)` checks launch-admin auth, factory not paused, the requested slug still free (`SlugTaken`), the launch admin still the Token admin, registered/non-revoked current module hashes, a nonzero voting supply, unchanged payment assets, and that the `minter` the launch admin pinned equals the registered platform Minter.
4. Launch sets every module Live and hands every module's admin to the Treasury (`AdminChanged`). Treasury and Marketplace receive mint authority; Auction receives it when started; the shared Minter always receives it, pinned on the Token (`token.minter()`).
5. Manager claims the slug (`SlugClaimed`), emits `DaoLaunched` and removes `PendingDao`. Goldsky, not Manager storage, provides the directory.

Slug-to-Token and Token-to-slug mappings remain in Manager after launch; there is
no enumeration API. Creation only requests a slug (several pending DAOs may request the same one, and `update_pending_slug` renames a request); launch claims it uniquely, and a launched DAO can later move to a new slug by vote (`change_slug`, Manager 0.2.0), which releases the old one. Slug getters resolve launched DAOs only and do not renew TTL;
the slug entries are renewed by the DAO's storage sweep ([TTL_ECONOMICS](TTL_ECONOMICS.md)). Indexed layout resolution
maps a slug to the canonical DAO Token ID before services use it.

Auction/Marketplace enablement controls opening/start at launch, not whether modules are deployed. The web uses saved local creation/launch receipts and a separate launch checklist; CLI deployment uses three explicit phases. See [deployment](DAO_DEPLOYMENT.md).

## Execution and upgrades

Queue and Treasury execution are permissionless at the contract boundary. The submitting wallet pays fees; neither requires token ownership. Proposing and voting have their own authorization/eligibility checks. Governor derives ETA from its queue delay, ignoring the inherited queue ETA/operator inputs.

Treasury execution consumes the exact action vectors and description hash on Governor, then invokes each action. Governor is off the call stack before actions run. A failing action reverts the transaction, including the Executed mark. `Governor.execute` always fails with `UseTreasuryExecute`.

Treasury-targeted actions use an internal allowlist (`upgrade`, `migrate`, plus `authorize`, which attaches a nested authorization tree to the next action) rather than re-entry. Other module upgrades require the module admin, matching current hash, and a Manager-approved registered/non-revoked destination; `migrate()` then advances the storage version. Manager approval cannot force an upgrade. `version()` is never stored: every module looks its `CurrentHash` up in the Manager registry, so versions follow upgrades without a proposal. Error codes are unique per contract (7000-7899). See [security](SECURITY_MODEL.md).

## Read and presentation layers

The database is event-derived, not a copy of contract storage. DAO reads use deployment and DAO identity; marketplace/receipt reads additionally check module identity. Indexed proposal state mirrors `Governor.proposal_state` (with `vote_start_seconds` and `quorum_votes` from `ProposalScheduled`); detail APIs still recheck live state before submission. When the indexer is down, the proposal list is rebuilt from `proposal_count`, `ProposalId(seq)` and `proposal(id)` without titles or vote totals. Submission is disabled when live state or supported ABI encoding cannot be verified.

Execution receipts come from scoped successful Treasury events or the indexed execution-call view. Confirmation and receipt/index availability are distinct. The marketplace uses indexed discovery and live preflight checks; the server prepares unsigned transactions and the wallet signs/submits them.

The web app does not write application tables. Multiple drafts, home DAO, and private marketplace labels/favorites live in browser storage only. See [web reference](../apps/web/README.md), [database catalog](DATABASE_SCHEMA.md), and [tenant boundaries](MULTITENANT_ARCHITECTURE.md).

Treasury funding and token-holder/claim APIs prepare unsigned transactions from
session-derived identity; they are not database writes or server signing. Treasury
funding targets the SAC transfer method, not Treasury execution. Live token ownership
gates holder controls; paginated indexed lists remain discovery data. Auction
history is indexed while settlement mode is selected/rechecked from live pause
state. Minter claims use the Minter pinned on the Token and its verified ABI; the claim list is fetched from `tree_uri` and checked against the root before a proof is offered;
allocation changes use registered governance actions with exact-spec encoding,
then the same Governor queue and Treasury execution lifecycle as other proposals.
