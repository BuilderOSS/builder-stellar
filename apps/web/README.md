# Web application

Next.js/React frontend for the selected Manager deployment. PostgreSQL/Prisma provide indexed discovery/history; RPC provides live state and transaction confirmation. Wallets sign on-chain actions. The app does not write the indexed database.

## Setup

From the repository root:

```bash
pnpm install
pnpm contracts:bindings
cp apps/web/.env.example apps/web/.env
pnpm dev
```

Configure the copied file before starting:

- `NEXT_PUBLIC_NETWORK`: `testnet`, `public`, or `local`, matching the selected artifact.
- `APP_DATABASE_URL`: read-only `app_server` connection to the migrated/indexed database.
- `APP_URL`: authentication origin; required in production.
- `IRON_PASSWORD`: private session secret, at least 32 characters.
- `STELLAR_WEB_AUTH_SECRET`, `STELLAR_HOME_DOMAIN`, `STELLAR_WEB_AUTH_DOMAIN`: SEP-10 server/domain configuration. `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` enables WalletConnect wallets.
- Optional Pinata upload flag/credentials: see [.env.example](.env.example). Server credentials must not have a `NEXT_PUBLIC_` prefix. AI image generation and `/api/artwork/generate` have been removed; images use saved URLs or upload.

The root `.env.example` contains legacy selection variables; use this app's example and `NEXT_PUBLIC_NETWORK`, not `NEXT_PUBLIC_DAO_LABEL`/`NEXT_PUBLIC_DAO_NETWORK`.

`pnpm --dir apps/web codegen` generates `src/config/deployments.generated.ts` from the newest `deploys/*-manager.json` by `deployedAt`, generates Prisma, builds all seven bindings, and generates Panda CSS. Predev/prebuild run this command. These hooks write generated files but Prisma generation does not connect to the database. The network is selected separately, so check artifact/network consistency. The dev server uses **http://localhost:4242**; `start` has no explicit 4242-port flag.

Warm Ink fonts are loaded as Instrument Serif and Inter in `src/app/layout.tsx`; a build may need access to fetch those font assets. This README does not claim an offline production build.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Deployment dashboard/discovery and local workspace |
| `/drafts` | Browser-local creation drafts |
| `/create` | Identity, Membership, Governance, Review; creates a DAO in Setup |
| `/marketplace` | Communities/offers across the selected deployment |
| `/dao/[daoId]` | DAO overview and home-DAO preference |
| `/dao/[daoId]/proposals`, `/proposals/create`, `/proposals/[proposalId]` | Governance list, composer, vote/queue/execute and receipt detail |
| `/dao/[daoId]/auctions`, `/treasury`, `/members`, `/members/[address]`, `/token/[tokenId]` | DAO operations and ownership |
| `/dao/[daoId]/marketplace` | Primary/secondary listings, history, selling and recovery |
| `/dao/[daoId]/claims`, `/dao/[daoId]/admin/claims` | Free Minter claims/history and governance allocation proposals |
| `/dao/[daoId]/admin/upgrades`, `/dao/[daoId]/admin/artwork` | Registry/transition review and artwork state/configuration |
| `/dao/[daoId]/admin` and its settings pages | Setup/launch and governance preparation; authority is each module's `admin()` (launch admin, then the Treasury); no post-launch unilateral admin power |
| `/warm-ink-preview` | Visual preview, not operational DAO state |
| `/privacy`, `/terms`, `/disclaimer` | Informational pages |

The canonical `daoId` is the Token contract address. The DAO layout also resolves a registered on-chain slug within the selected deployment, then provides the canonical ID to components/APIs. Do not assume every API accepts slugs directly. This is not the old network/label route format.

## Creation, local drafts, and recovery

Identity collects image/name/symbol and the unique DAO slug. Membership adds description, project URL, Auction settings, and Marketplace settings; Governance includes queue delay, voting delay/period, quorum, and an absolute vote threshold. There is no separate purpose step. Disabled modules still receive valid constructor configuration and are deployed.

Guest drafts can be prepared before sign-in. Multiple drafts support resume, duplicate, and guarded delete. Creation captures a normalized reviewed configuration and fingerprint, compares it with durable state after locking/rehydration, and freezes it with the nonce and predicted addresses. A changed configuration requires review again; recovery cannot silently substitute different settings.

**Signed is not submitted.** Creation/launch save the signed XDR, hash, and finite expiry with status `signed`. Only RPC PENDING/DUPLICATE acceptance marks `submitted`; rejection, chain failure, expiry, and confirmation are separate states. Recovery checks the saved hash and actual Manager state, not simulation success. Explicit rebroadcast reuses identical signed bytes while valid, without another signature, fee/sequence change, or new nonce. Chain failure/expiry must be reconciled before rebuilding; creation keeps its frozen nonce/configuration. Older receipts without envelope/expiry can be checked but not safely rebroadcast. Index delay is not deployment failure.

After creation, Setup → Launch provides artwork setup, founder minting links, live readiness, and reviewed Auction/Marketplace/Minter choices. Upload the artwork before minting founders (traits are seeded at mint time; mint pages warn and require confirmation without artwork). Launch requires a nonzero voting supply, an unclaimed requested slug (a `SlugTaken` failure offers a rename via `update_pending_slug`) and pinned assets/minter, then hands every module's admin to the Treasury. The create form checks slug availability against launched DAOs; a request is not a reservation. Web Locks and usable browser storage are required for safe creation/launch/artwork recovery. Clearing browser data removes drafts and recovery records, not contracts.

Creation/artwork/home/launch preferences use network/Manager/wallet scope; proposal drafts use wallet/DAO scope. Home DAO only adds a local shortcut. Marketplace favorites, private labels, and preferred discovery tab use deployment-scoped browser storage, not wallet encryption. There is **no server-synced draft collaboration, public tag registry, or cross-device preference sync**.

## Wallet authentication

SEP-10 verifies the issued transaction body/domain/network and loads the account from the canonical network Horizon endpoint. Existing accounts must meet the current weighted medium threshold (at least one positive client weight even when medium threshold is zero); the server signer is excluded and disabled-master/insufficient-weight signatures cannot fall back to key-only authentication.

Only an authoritative Horizon account-not-found 404 problem response permits master-key-only proof for an uncreated address. A generic 404, read failure, or malformed account response does not establish absence; lookup failure returns `ACCOUNT_LOOKUP_UNAVAILABLE`/503. This policy allows unfunded-key sign-in, not funded transaction readiness. Source: [SEP-10 account policy](src/lib/auth/sep10-account.ts).

## Treasury, holders, and auctions

- **Treasury funding:** readiness/preparation accept verified XLM/USDC, derive sender from the session, check scoped Treasury/Governor wiring, simulate a SAC transfer to Treasury, and recheck spendable funds/reserve/fee. Preparation returns unsigned XDR; the wallet signs/submits. Funding needs no DAO proposal; spending Treasury assets still does. Treasury history is paginated execution calls from `treasury.calls`, not a complete deposit/asset-transfer ledger.
- **Members/tokens:** member and owner-filtered inventory lists return `items`, `total`, `limit`, `offset`, `hasMore`, scoped identities, and generation time. Member counts/voting power and total supply use decimal strings where specified. Pagination is limit 1–100 (default 100), nonnegative safe offset. Invalid addresses/pages return 400; unavailable reads return 503.
- **Token-holder controls:** token detail reports `ownerSource=onchain|indexed|unavailable`. Only a verified current holder can prepare transfer, single-token approve/revoke, or delegation. The server rechecks live ownership and returns unsigned XDR. Approvals expire by ledger; revoke clears single-token approval, not collection-wide permissions. Delegation moves voting units of all tokens owned by the account, not ownership and not just the selected NFT. Indexed ownership alone is not signing authority.
- **Auctions:** history pages show sold, unsold, or canceled outcomes scoped to deployment/DAO/Auction with exact amount/ID strings. History limit is 1–50 (default 12), offset ≤100,000. Live bid preparation rereads auction/config/pause state. Active expired settlement uses `settle_and_create_new`; paused settlement uses `settle_auction` without minting the next token and can run before expiry. A changed settlement mode requires review again. Deferred refund withdrawal pulls the whole pending credit with bidder authorization.

Sources: [funding](src/lib/treasury-service/funding.ts), [holder preparation](src/lib/token-holder/actions.ts), [directory queries](src/lib/member-directory/query.ts), [auction actions](src/lib/auction-history/actions.ts).

## Minter claims and allocation capability

`/claims` reads the current Manager platform Minter, Live Token/mint authority, per-method rounds, membership/claim markers, and separate indexed history. Claims are free token allocations; the wallet pays XLM network fees, not a mint price. Allowlist uses the configured fixed amount; Merkle claims require an organizer-supplied proof bound to the authenticated recipient, amount, current root and round. Proofs contain at most 32 siblings. The app does not generate the Merkle tree or distribute proofs.

The preparation API loads/checks the deployed Minter ABI, simulates eligibility, rejects restoration-required simulations, then rechecks Minter/round/root/amount/authority. The client reviews and verifies the unsigned claim envelope, rechecks wallet/session/state before signing, submits it, and distinguishes confirmation from indexed history. No body-supplied recipient or contract chooses the claim authority.

`/admin/claims` reviews Merkle-root updates, allowlist replacement, and batch allocations before adding registered actions to the scoped governance draft. The current Manager registration and RPC-validated Minter spec establish the trusted target; Token Live state, Treasury as Token admin, and Minter mint authority are rechecked. Batch allocations take at most 18 recipients and must fit the batch-mint event budget. Adding an action does not sign or execute it: proposal creation, voting, queueing, and Treasury execution remain separate. Sources: [claim service](src/lib/minter/service.ts), [allocation review](src/components/minter/allocation-draft.tsx), [allocation action adapter](src/lib/minter/allocation-proposal.ts), and [action registry](src/lib/proposal-actions/registry.ts).

## Artwork and module upgrades

Artwork administration reads Metadata's `admin()`/wired Token, supports paginated item/IPFS inspection, direct setup settings, registered post-launch setting/append proposals, and lists tokens minted without traits for `regenerate` (direct in setup, proposal after launch; `/api/dao/:id/tokens/unseeded`). Settings strings are capped at 256 bytes. Destructive resets are not registered in the composer. Append review includes current property counts and ordering; state can change before governance execution.

Upgrade cards read current module hash/version/storage version/admin, Manager registration, candidate hash/revocation, and exact directional approval. They can prepare a registered upgrade or `migrate` proposal after rechecking admin/approval (Metadata included), but do not upload WASM, register implementations, or grant approval. Manager latest lookup is only a candidate convenience, not approval evidence. See [upgrade cards](src/components/admin/module-version-card.tsx) and [action registry](src/lib/proposal-actions/registry.ts).

## Governance and receipts

Proposing uses previous-ledger voting power; voting uses the proposal snapshot. Queue and execute do not require membership or proposer status: an authenticated wallet submits and pays network fees. Queue runs on Governor; execute runs on Treasury with `targets`, `functions`, nested `args`, and `description_hash`.

[proposal-supported-calls.ts](src/lib/proposal-supported-calls.ts) encodes known DAO targets using generated ABI specs and known SAC transfers with explicit types. Token batch mint uses recipient/amount vectors and every call must fit the event budget (`lib/batch-mint-budget.ts`, mirroring `common::batch_mint_fits`: 43 tokens to one recipient, 18 recipients × 1). Treasury `authorize` actions carry typed `AuthNode` trees (`lib/treasury-authorize.ts`; untyped `Val` arguments fail closed) and are encoded with `check_authorization`'s input spec; the admin marketplace drafts a Treasury purchase as authorize + `buy(max_price)` after simulating `check_authorization`. Indexed argument wrappers and large integers are normalized without guessing a scalar ABI. The encoded proposal ID is checked against the indexed ID; unsupported targets/functions or unknown live state disable submission.

Detail combines indexed actions/votes with live Governor state/timing/quorum; the indexed `vote_start_seconds` and `quorum_votes` (from `ProposalScheduled`) are the labeled fallback, not sufficient for mutation buttons. The list uses the indexed state, which mirrors `Governor.proposal_state`. `Governor.execute` always rejects; Treasury consumes on Governor, then dispatches in order. Any failing action reverts execution.

Successful Treasury `Execute` events yield an ordered receipt scoped to Treasury, Governor, proposal, target/function, and call index. After refresh, the API can reconstruct it from `governance.proposal_execution_calls`, requiring complete matching calls in one transaction/ledger. Confirmed execution with pending/unavailable receipt is shown separately; missing indexed events do not mean execution failed.

## Marketplace

Global discovery searches communities and filters indexed capabilities. DAO views include primary/secondary listing history and sales. A primary purchase mints to the buyer and pays Treasury; a secondary sale escrows an existing NFT and splits proceeds according to its snapshotted fee. Primary cancellation/listing creation use governance; secondary cancellation requires the seller; expired listing recovery is permissionless.

Selling is approval → escrow/list, not one atomic cross-transaction operation. Approval alone transfers no NFT. `list` carries the reviewed fee and payment asset as limits and purchases carry `max_price`, so a governance or price change before confirmation fails the transaction (7712/7714/7715) instead of applying new terms. While listed, a token's vote leaves the seller's delegate. The UI supports verified XLM/USDC SACs from its asset registry; that is narrower than the contract's configurable asset address.

The preparation API derives the actor from the authenticated session, checks origin/network, scoped listing identity, live configuration, ownership/terms, balances and applicable trustline readiness. It returns unsigned XDR and fee/summary; the server has no trade signer and does not submit it. The wallet checks account/network/source/expiry and unchanged envelope before signing/submission. A timeout requires checking the same hash before retrying. Index refresh is separate from chain confirmation.

## Reads, RPC and caching

Pages read the indexed database first. RPC is reserved for data the index lacks
or for live checks right before signing. `lib/server-cache.ts` is a process-local
TTL cache with in-flight de-duplication:
- DAO config (30 s) and the Minter registration (10 min);
- artwork collection names (5 min per Metadata contract) and token traits, read
  from `metadata.token_seeds` (RPC fallback only for unindexed tokens);
- rendered token images (keyed by the exact layer set), plus long `Cache-Control`
  on render and metadata responses.

The auction route serves the open auction, its bids and its extended end time
from the index, with a cached RPC fallback. Bidding, settlement and trades still
recheck live state when prepared.

The activity feed shows curated public/governance rows only (see
`docs/DATABASE_SCHEMA.md`), formatted by `lib/activity-feed.ts` into a category,
a plain sentence, a relative time and a link.

## API map

All DAO reads are deployment-scoped. Private trading helpers require a session.

| Endpoint | Interface |
| --- | --- |
| `GET /api/dao/[daoId]` | `{ daoId, status, indexedAt }`; 404 absent, 503 unavailable |
| `GET /api/dao/[daoId]/proposals/[proposalId]` | Chain/indexed state sources, timing, quorum, action vectors, receipt/status; no-store |
| DAO `proposals`, proposal `votes`, `activity-feed`, `tokens`, `members`, `auctions`, auction `bids`, `authorities/mint` | Existing scoped read surfaces; bounds live in route handlers |
| Treasury `GET history?page=0`, `GET readiness?assetCode=XLM`, `POST prepare` | 12 execution calls/page (0–1000); funding request `{ assetCode: "XLM" | "USDC", amount: "decimal" }`; same-origin/session-derived unsigned transfer |
| `GET /api/dao/[daoId]/tokens/[tokenId]`, `POST /tokens/prepare` | Current/indexed holder source; strict transfer/approve/revoke/delegate requests, session-derived actor |
| `GET /api/dao/[daoId]/auctions/history` | Scoped terminal history with limit/offset and optional matching network |
| Claims `GET`, `GET history`, `POST prepare` | Live allocation state, separate indexed claims, unsigned allowlist/Merkle claim preparation; not allocation writes |
| `GET /api/marketplace` | Community directory |
| `GET /api/marketplace/offers` | Primary/secondary offers across scoped communities, not bid/offer-making support |
| `GET /api/dao/[daoId]/marketplace` | DAO listings, sales and verified live config |
| Marketplace `GET listing` | `kind`, `id`, `eventId` identify a specific scoped listing |
| Marketplace `GET inventory`, `GET readiness` | Session-derived inventory and asset readiness |
| Marketplace `POST prepare` | Strict action request: buy/cancel/expire, approve/list/revoke, or trustline; returns unsigned transaction |
| `POST /api/auth/challenge`, `/verify`; `GET /api/auth/session`; `POST /api/auth/logout` | SEP-53 message proof and encrypted cookie session |
| `GET /api/auth/sep10/challenge`, `POST /api/auth/sep10/verify` | Transaction-proof fallback; unsupported-message signing differs from wallet rejection |
| `GET /api/health`, `/api/goldsky/health` | Different health semantics; see [monitoring](../../docs/MONITORING.md) |
| `/api/uploads/*`, `/api/pinata/*` | Upload services; feature flags and server credentials apply; no AI generation endpoint |
| `GET /api/render/[daoId]/[tokenId]` | Token artwork renderer |

Marketplace query filters are `search` (≤120 characters), `page` (0–500), `kind=all|primary|secondary`, `status=all|open|purchased|cancelled|expired`, and `capability=all|marketplace|auction|metadata`. Community pages use 24 rows; combined offers page each kind independently (12 per kind, or 24 for one kind). Expired open rows can display `awaiting-expiry` until recovery is indexed. Successful responses are private/no-store. Route handlers and `src/lib/marketplace` are the full request/response authority.

## Checks and limits

```bash
# From repository root
pnpm --dir apps/web codegen
pnpm --dir apps/web test
pnpm lint
pnpm typecheck
pnpm build
```

Run after generation prerequisites. Tests cover creation envelope acceptance/rebroadcast/frozen review, local stores, artwork, theme, proposal ABI/receipts, marketplace, Treasury funding, holder controls, member pagination, auction state/history, Minter proof/spec/storage, and weighted SEP-10 accounts. The TTL live test is opt-in; do not point tests at live services without reviewing their environment gates. No full-suite passing count or live UX verification is asserted here. CI runs web codegen before lint/typecheck/tests and a separate Build Web job; it no longer uses the old DAO build/bindings aliases.

Read model availability, RPC, wallet, supported assets, and upload configuration are separate dependencies. Browser-local storage is not an access-control boundary on a shared browser. Submission can be confirmed before discovery/receipts appear. TTL reporting/renewal is limited to the implemented code/artwork paths; see [TTL maintenance](../../docs/TTL_ECONOMICS.md).
