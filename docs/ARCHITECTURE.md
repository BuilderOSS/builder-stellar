# Architecture

Builder separates platform deployment, DAO authority, and indexed history. A Manager creates six independent DAO modules; a shared Minter is a separate platform contract. Manager cannot administer a DAO after launch, but its registry remains an upgrade-policy dependency.

```text
Manager: implementation registry + factory + temporary PendingDao + persistent slugs
  └─ each DAO: Token, Metadata, Auction, Governor, Treasury, Marketplace
Shared Minter: optional post-launch mint authority, per-token allocations

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
| [Token](../contracts/token/README.md) | NFT ownership, delegation/checkpoints, vector minting, Metadata hook |
| [Metadata](../contracts/metadata/README.md) | Artwork properties/items/IPFS groups and per-token selections |
| [Auction](../contracts/auction/README.md) | Continuous English auction, SAC payments, settlement and refund fallback |
| [Governor](../contracts/governor/README.md) | Timestamp voting windows, snapshot weights, quorum, queue and consumption |
| [Treasury](../contracts/treasury/README.md) | Asset custody, module ownership, ordered proposal execution |
| [Marketplace](../contracts/marketplace/README.md) | Lazy primary mint-on-purchase and escrowed secondary sales |
| [Manager](../contracts/manager/README.md) | Deterministic factory, implementation registration/revocation and approvals |
| [Minter](../contracts/minter/README.md) | Shared batch, Merkle and allowlist minting for Live tokens |

`common` is a library; `dao-e2e` is an in-memory test crate. Neither is a DAO module. Release labels live in [the manifest](../releases/contracts.json).

## Create → Setup → Launch

1. `create_dao` requires deployer and launch-admin authorization, validates configuration/current implementations, and deploys all six modules with constructor-only wiring.
2. The launch admin owns the modules in Setup. Founder mints and artwork/configuration changes are separate transactions. A later failed transaction does not undo earlier setup transactions.
3. `launch_dao(token_address, launch_config)` checks Token ownership, nonzero supply, registered/non-revoked current module hashes, unchanged payment assets, and the optional reviewed platform minter.
4. Launch sets every module Live and hands ownership to Treasury, clearing pending ownership transfers. Treasury and Marketplace receive mint authority; Auction receives it when started; the platform Minter receives it when enabled.
5. Manager emits `DaoLaunched` and removes `PendingDao`. Goldsky, not Manager storage, provides the directory.

Slug-to-Token and Token-to-slug mappings remain in Manager after launch; there is
no enumeration API. Creation claims a unique slug. Slug getters do not renew TTL;
permissionless `bump_slug_ttl` is separate maintenance. Indexed layout resolution
maps a slug to the canonical DAO Token ID before services use it.

Auction/Marketplace enablement controls opening/start at launch, not whether modules are deployed. The web uses saved local creation/launch receipts and a separate launch checklist; CLI deployment uses three explicit phases. See [deployment](DAO_DEPLOYMENT.md).

## Execution and upgrades

Queue and Treasury execution are permissionless at the contract boundary. The submitting wallet pays fees; neither requires token ownership. Proposing and voting have their own authorization/eligibility checks. Governor derives ETA from its queue delay, ignoring the inherited queue ETA/operator inputs.

Treasury execution consumes the exact action vectors and description hash on Governor, then invokes each action. Governor is off the call stack before actions run. A failing action reverts the transaction, including the Executed mark. `Governor.execute` always fails with `UseTreasuryExecute`.

Treasury-targeted actions use an internal allowlist (`upgrade`, `sync_version`) rather than re-entry. Other module upgrades require owner authorization, matching current hash, and a Manager-approved registered/non-revoked destination. Manager approval cannot force an upgrade. See [security](SECURITY_MODEL.md).

## Read and presentation layers

The database is event-derived, not a copy of contract storage. DAO reads use deployment and DAO identity; marketplace/receipt reads additionally check module identity. Indexed proposal state is incomplete, so detail APIs supplement it with chain reads. Submission is disabled when live state or supported ABI encoding cannot be verified.

Execution receipts come from scoped successful Treasury events or the indexed execution-call view. Confirmation and receipt/index availability are distinct. The marketplace uses indexed discovery and live preflight checks; the server prepares unsigned transactions and the wallet signs/submits them.

The web app does not write application tables. Multiple drafts, home DAO, and private marketplace labels/favorites live in browser storage only. See [web reference](../apps/web/README.md), [database catalog](DATABASE_SCHEMA.md), and [tenant boundaries](MULTITENANT_ARCHITECTURE.md).

Treasury funding and token-holder/claim APIs prepare unsigned transactions from
session-derived identity; they are not database writes or server signing. Treasury
funding targets the SAC transfer method, not Treasury execution. Live ownership
gates holder controls; paginated indexed lists remain discovery data. Auction
history is indexed while settlement mode is selected/rechecked from live pause
state. Minter claims use the current registered contract and verified ABI;
allocation changes use registered governance actions with exact-spec encoding,
then the same Governor queue and Treasury execution lifecycle as other proposals.
