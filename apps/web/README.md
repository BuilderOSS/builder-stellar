# Web application

The Next.js and React app for the selected Manager deployment. PostgreSQL, read through Prisma, provides indexed discovery and history; RPC provides live state and transaction confirmation. Wallets sign on-chain actions. The app does not write to the indexed database.

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
- `APP_DATABASE_URL`: read-only `app_server` connection to the migrated and indexed database.
- `APP_URL`: the origin wallet sign-in challenges are bound to; required in production. Local development falls back to the request origin.
- `NEXT_PUBLIC_SITE_URL`: the public origin. It sets the `metadataBase` for share images, the default profile image, and the `rendererBase` of new drafts. Defaults to `https://tribes.build`; set it to a preview's own origin if that preview creates test tribes. The old host `builder-stellar-web.vercel.app` keeps serving `/api` and `/images` for tribes created before the rename, and its pages redirect to tribes.build (`next.config.mjs`).
- `IRON_PASSWORD`: private session secret, at least 32 characters, or a JSON map of numbered secrets while rotating it (`{"2":"<new>","1":"<old>"}`; see [dev deployment](../../docs/DEV_DEPLOYMENT.md)).
- `UPLOAD_TOKEN_SECRET` (optional): signs upload and pin tokens, at least 32 characters. Unset, they use a key derived from `IRON_PASSWORD`.
- `TRUSTED_CLIENT_IP_HEADER` (off Vercel only): the header your proxy sets or overwrites with the client's address, used by the sign-in and API rate limits; the app reads its last address. Set it only behind a proxy. Vercel's own header is used on Vercel; client-supplied headers are otherwise ignored. Without a trusted address, production sign-in is refused with 503 and the API rate limits are not applied; local development needs none.
- `STELLAR_WEB_AUTH_SECRET`, `STELLAR_HOME_DOMAIN`, `STELLAR_WEB_AUTH_DOMAIN`: SEP-10 server account and domain configuration; the secret must belong to a funded account on the configured network. `AUTH_APP_NAME` (optional) is the name shown in the wallet signing prompt. `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` enables WalletConnect wallets.
- Optional Pinata uploads (`NEXT_PUBLIC_PINATA_UPLOADS_ENABLED`, `PINATA_JWT`, `NEXT_PUBLIC_PINATA_GATEWAY`): see [.env.example](.env.example). Server credentials must not have a `NEXT_PUBLIC_` prefix. AI image generation and `/api/artwork/generate` have been removed; images use saved URLs or upload.
- `CSP_MODE` (optional): the page Content-Security-Policy is report-only unless this is `enforce`. `next.config.mjs` reads it at build time and the middleware per request, so set it before a build.
- `GOLDSKY_API_TOKEN`, `GOLDSKY_PIPELINE_NAME` (optional): pipeline monitoring for `GET /api/health`; the name defaults to `builder-stellar-<NEXT_PUBLIC_NETWORK>`.
- Not in the example file: `NEXT_PUBLIC_DOCS_URL` (the guides site, default `https://docs.tribes.build`), `NEXT_PUBLIC_STELLAR_RPC_URL` (the RPC `GET /api/health` checks, default the testnet RPC), `NEXT_PUBLIC_E2E_WALLET=1` (builds in the test-only E2E Wallet), and `NEXT_DIST_DIR` (the build directory, default `.next`).

The root `.env.example` contains legacy selection variables; use this app's example and `NEXT_PUBLIC_NETWORK`, not `NEXT_PUBLIC_DAO_LABEL`/`NEXT_PUBLIC_DAO_NETWORK`.

`pnpm --dir apps/web codegen` generates `src/config/deployments.generated.ts` from the newest `deploys/*-manager.json` by `deployedAt` (`e2e-*` files and rehearsal artifacts are skipped; `MANAGER_DEPLOYMENT_FILE` pins one artifact instead), generates Prisma, builds all eight bindings packages, and generates Panda CSS. `predev` and `prebuild` run this command. These hooks write generated files, but Prisma generation does not connect to the database. The network is selected separately, so check that the artifact and the network match. The dev server uses **http://localhost:4242**; `start` (`next start`) sets no port. `build` runs `next build`, then `scripts/assert-e2e-wallet.mjs`, which fails if the test-only E2E Wallet is in a build made without `NEXT_PUBLIC_E2E_WALLET=1`, or missing from one made with it.

Warm Ink · Dusk fonts (Bricolage Grotesque, Figtree, and JetBrains Mono) are loaded with `next/font` through `@builder-stellar/design-tokens/fonts`, imported in `src/app/layout.tsx`. Next fetches those font files at build time and self-hosts them, so a build may need network access.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Deployment dashboard, discovery, and local workspace |
| `/discover` | Directory of the deployment's launched tribes |
| `/drafts` | Browser-local creation drafts |
| `/create` | Identity, Membership, Voting, and Review and create; creates a DAO in Setup |
| `/marketplace` | Communities/offers across the selected deployment |
| `/dao/[daoId]` | Tribe overview |
| `/dao/[daoId]/setup` | Set up and launch, until the DAO is Live |
| `/dao/[daoId]/proposals`, `/proposals/create`, `/proposals/[proposalId]` | Governance list, composer, vote/queue/execute, and receipt detail |
| `/dao/[daoId]/auctions`, `/treasury`, `/members`, `/members/[address]`, `/token/[tokenId]` | DAO operations and ownership |
| `/dao/[daoId]/marketplace` | Quick-buy pools and resales, history, selling, and recovery |
| `/dao/[daoId]/claims`, `/dao/[daoId]/admin/claims` | Claim lists (free or priced), launch-drive progress, refunds, and launch; opening lists |
| `/dao/[daoId]/admin/owner` | Membership: the three switches, module allowances and votes, and transfer agents |
| `/dao/[daoId]/admin/renewal` | One-click storage renewal: core contracts plus each module's `renewal_keys` |
| `/dao/[daoId]/admin/upgrades`, `/dao/[daoId]/admin/artwork` | Registry/transition review and artwork state/configuration |
| `/dao/[daoId]/admin` and its settings pages | Setup/launch and governance preparation; authority is each module's `admin()` (launch admin, then the Treasury); no post-launch unilateral admin power |
| `/design` | Design catalogue of every primitive, brand asset, and token in both themes (unlisted); not operational DAO state |
| `/platform` | Operator page: shared storage, every tribe's storage, the registry, and the factory (unlisted) |
| `/privacy`, `/terms`, `/disclaimer` | Informational pages |

The canonical `daoId` is the Token contract address. The DAO layout also resolves a registered on-chain slug within the selected deployment, then provides the canonical ID to components/APIs. Do not assume every API accepts slugs directly. This is not the old network/label route format.

## Creation, local drafts, and recovery

Identity collects the image, name, symbol, unique DAO slug, Markdown description, and up to eight links (the profile is at most 4,096 bytes). Membership sets how people join (Auction, Marketplace, and Claims, each optional, each with its payment asset) and the membership rules (open, or a members-only club; the three switches under Advanced settings). Voting includes the queue delay, voting delay and period, quorum, and an absolute vote threshold. There is no separate purpose step. A module left off is not deployed (`modules: Vec<ModuleSpec>`); it can be added later with `create_module`.

Guest drafts can be prepared before sign-in. Multiple drafts support resume, duplicate, and guarded delete. Creation captures a normalised reviewed configuration and fingerprint, compares it with durable state after locking/rehydration, and freezes it with the nonce and predicted addresses. A changed configuration requires review again; recovery cannot silently substitute different settings.

**Signed is not submitted.** Creation/launch save the signed XDR, hash, and finite expiry with status `signed`. Only RPC PENDING/DUPLICATE acceptance marks `submitted`; rejection, chain failure, expiry, and confirmation are separate states. Recovery checks the saved hash and actual Manager state, not simulation success. Explicit rebroadcast reuses identical signed bytes while valid, without another signature, fee/sequence change, or new nonce. Chain failure/expiry must be reconciled before rebuilding; creation keeps its frozen nonce/configuration. Older receipts without envelope/expiry can be checked but not safely rebroadcast. Index delay is not deployment failure.

After creation, Setup → Launch provides artwork setup, founder minting links, live readiness, and reviewed Auction/Marketplace choices. Upload the artwork before minting founders (traits are seeded at mint time; mint pages warn and require confirmation without artwork). Launch requires a nonzero voting supply, an unclaimed requested slug (a `SlugTaken` failure offers a rename via `update_pending_slug`), and each module's payment asset unchanged, then hands every contract's admin to the Treasury. A community can instead open a launch drive from Manage → Claim lists (`manager.open_assurance`); it then launches once enough people claim. The create form checks slug availability against launched DAOs; a request is not a reservation. Web Locks and usable browser storage are required for safe creation/launch/artwork recovery. Clearing browser data removes drafts and recovery records, not contracts.

Creation/artwork/launch preferences use network/Manager/wallet scope; proposal drafts use wallet/DAO scope. Marketplace favourites, private labels, and the preferred discovery tab use deployment-scoped browser storage, not wallet encryption. There is **no server-synced draft collaboration, public tag registry, or cross-device preference sync**.

## Wallet authentication

Sign-in asks the wallet to sign a SEP-53 message; SEP-10, a signed challenge transaction, is the fallback for wallets that cannot sign messages. Both load the account from the canonical Horizon endpoint for the network, and SEP-10 also verifies the issued transaction body, domain, and network. The signatures of an existing account must meet its current weighted medium threshold (at least one positive client weight even when the medium threshold is zero). For SEP-53 that weight must come from the address's own key; for SEP-10 the server signer is excluded. A disabled master key or insufficient weight cannot fall back to key-only authentication.

Only an authoritative Horizon account-not-found 404 problem response permits master-key-only proof for an uncreated address. A generic 404, read failure, or malformed account response does not establish absence; lookup failure returns `ACCOUNT_LOOKUP_UNAVAILABLE`/503. This policy allows unfunded-key sign-in, not funded transaction readiness. Sources: [SEP-10 account policy](src/lib/auth/sep10-account.ts), [signer weights](src/lib/auth/account-signers.ts).

## Treasury, holders, and auctions

- **Treasury funding:** readiness/preparation accept verified XLM/USDC, derive sender from the session, check scoped Treasury/Governor wiring, simulate a SAC transfer to Treasury, and recheck spendable funds/reserve/fee. Preparation returns unsigned XDR; the wallet signs/submits. Funding needs no DAO proposal; spending Treasury assets still does. Treasury history is paginated execution calls from `treasury.calls`, not a complete deposit/asset-transfer ledger.
- **Members/tokens:** member and owner-filtered inventory lists return `items`, `total`, `limit`, `offset`, `hasMore`, scoped identities, and generation time. Member counts/voting power and total supply use decimal strings where specified. Pagination is limit 1–100 (default 100), nonnegative safe offset. Invalid addresses/pages return 400; unavailable reads return 503.
- **Token-holder controls:** token detail reports `ownerSource=onchain|indexed|unavailable`. Only a verified current holder can prepare transfer, single-token approve/revoke, or delegation. The server rechecks live ownership and returns unsigned XDR. Approvals expire by ledger; revoke clears single-token approval, not collection-wide permissions. Delegation moves voting units of all tokens owned by the account, not ownership and not only the selected NFT. Indexed ownership alone is not signing authority.
- **Auctions:** history pages show sold, unsold, or cancelled outcomes scoped to deployment/DAO/Auction with exact amount/ID strings. History limit is 1–50 (default 12), offset ≤100,000. Live bid preparation rereads auction/config/pause state. Active expired settlement uses `settle_and_create_new`; paused settlement uses `settle_auction` without minting the next token and can run before expiry. A changed settlement mode requires review again. Deferred refund withdrawal pulls the whole pending credit with bidder authorization.

Sources: [funding](src/lib/treasury-service/funding.ts), [holder preparation](src/lib/token-holder/actions.ts), [directory queries](src/lib/member-directory/query.ts), [auction actions](src/lib/auction-history/actions.ts).

## Claims

`/claims` reads the ClaimMinter the Token's registry names (`token.module("claims")`), its newest lists
(`next_list_id`, `get_list`), the connected wallet's record on each (`get_claim`), a launch drive's
`assurance_state`, and separate indexed history (`claims.claims`). Each list shows its price (free, or per
token in its asset), how much is claimed, when it closes, and, for a launch drive, progress toward the number
of people it needs. The app fetches each list's published tree from `tree_uri`, rebuilds it, and offers the
connected wallet's allocation and proof only when the rebuilt root equals the chain's (a proof file is the
fallback; the app finds the open list it proves against). Proofs contain at most 32 siblings. Tree format:
`builder-stellar-merkle-v1` ([tree](src/lib/minter/tree.ts)).

One claim mints at most 43 tokens; a larger allocation is claimed again for the rest. The preparation API
simulates `claim(list_id, claimer, leaf_amount, mint_now, proof, max_price)`, rejects
restoration-required simulations, then rechecks the list's root, price, and the claimer's progress. The client
verifies the unsigned envelope (the price cap included) and rechecks the list before signing. Refunds after a
failed drive and `launch_when_ready` after a successful one are signed straight from the wallet: anyone may
call them, and a refund only ever pays the claimer.

`/admin/claims` builds a list from `address amount` lines (up to 10,000 people) in the browser and publishes it
to IPFS, then opens it: in Setup the launch admin signs it directly (a free list: the allowance grant, then
`open_list`; a launch drive: `manager.open_assurance`, which hands the community to its Treasury at once);
once Live it goes into a proposal as the allowance grant followed by `open_list`, at any price in the
community's payment asset. Adding an action does not sign or execute it. Sources:
[claim service](src/lib/minter/service.ts), [chain reads](src/lib/minter/chain.ts),
[list form](src/components/minter/allocation-draft.tsx),
[proposal adapter](src/lib/minter/allocation-proposal.ts), and [action registry](src/lib/proposal-actions/registry.ts).

## Artwork and module upgrades

Artwork administration reads Metadata's `admin()`/wired Token, supports paginated item/IPFS inspection, the renderer base setting, registered post-launch renderer/append proposals, and lists tokens minted without traits for `regenerate` (direct in setup, proposal after launch; `/api/dao/:id/tokens/unseeded`). Settings strings are capped at 256 bytes. Destructive resets are not registered in the composer. Append review includes current property counts and ordering; state can change before governance execution.

Upgrade cards read current module hash/version/storage version/admin, Manager registration, candidate hash/revocation, and exact directional approval. They can prepare a registered upgrade or `migrate` proposal after rechecking admin/approval (Metadata included), but do not upload WASM, register implementations, or grant approval. Manager latest lookup is only a candidate convenience, not approval evidence. See [upgrade cards](src/components/admin/module-version-card.tsx) and [action registry](src/lib/proposal-actions/registry.ts).

## Governance and receipts

Proposing uses previous-ledger voting power; voting uses the proposal snapshot. Queue and execute do not require membership or proposer status: an authenticated wallet submits and pays network fees. Queue runs on Governor; execute runs on Treasury with `targets`, `functions`, nested `args`, and `description_hash`.

[proposal-supported-calls.ts](src/lib/proposal-supported-calls.ts) encodes known DAO targets using generated ABI specs and known SAC transfers with explicit types. Token batch mint uses recipient/amount vectors and every call must fit the event budget (`lib/batch-mint-budget.ts`, mirroring `common::batch_mint_fits`: 43 tokens to one recipient, 18 recipients × 1). Treasury `authorize` actions carry typed `AuthNode` trees (`lib/treasury-authorize.ts`; untyped `Val` arguments fail closed) and are encoded with `check_authorization`'s input spec; the admin marketplace drafts a Treasury purchase as authorize + `buy(max_price)` after simulating `check_authorization`. Indexed argument wrappers and large integers are normalised without guessing a scalar ABI. The encoded proposal ID is checked against the indexed ID; unsupported targets/functions or unknown live state disable submission.

Detail combines indexed actions/votes with live Governor state/timing/quorum; the indexed `vote_start_seconds` and `quorum_votes` (from `ProposalScheduled`) are the labelled fallback, not sufficient for mutation buttons. The list uses the indexed state, which mirrors `Governor.proposal_state`. `Governor.execute` always rejects; Treasury consumes on Governor, then dispatches in order. Any failing action reverts execution.

Successful Treasury `Execute` events yield an ordered receipt scoped to Treasury, Governor, proposal, target/function, and call index. After refresh, the API can reconstruct it from `treasury.calls`, requiring complete matching calls in one transaction/ledger. Confirmed execution with pending/unavailable receipt is shown separately; missing indexed events do not mean execution failed.

## Marketplace

Global discovery searches communities and filters indexed capabilities. DAO views include quick-buy pools, resale listings, and sales. A pool sells new tokens from stock the Marketplace minted into custody (anyone can `restock` it within its allowance); a purchase picks a stocked token on chain (`buy_from_pool(pool_id, page, token_id, buyer, max_price)`) and pays the Treasury. Opening, closing, and sweeping a pool use governance, and the community home page shows the open pool. A resale escrows an existing NFT and splits proceeds according to its snapshotted fee; cancellation requires the seller; expired listing recovery is permissionless. On a locked DAO resales are refused before simulation.

Selling is approval → escrow/list, not one atomic cross-transaction operation. Approval alone transfers no NFT. `list` carries the reviewed fee and payment asset as limits and purchases carry `max_price`, so a governance or price change before confirmation fails the transaction (7712/7714/7715) instead of applying new terms. While listed, a token's vote leaves the seller's delegate. The UI supports verified XLM/USDC SACs from its asset registry; that is narrower than the contract's configurable asset address.

The preparation API derives the actor from the authenticated session, checks origin/network, scoped listing identity, live configuration, ownership/terms, balances, and applicable trustline readiness. It returns unsigned XDR and fee/summary; the server has no trade signer and does not submit it. The wallet checks account/network/source/expiry and unchanged envelope before signing/submission. A timeout requires checking the same hash before retrying. Index refresh is separate from chain confirmation.

## Reads, RPC, and caching

Pages read the indexed database first. RPC is reserved for data the index lacks
or for live checks right before signing. `lib/server-cache.ts` is a process-local
TTL cache with in-flight de-duplication:
- DAO config (30 s);
- artwork collection names (5 min per Metadata contract) and token traits, read
  from `metadata.token_seeds` (RPC fallback only for unindexed tokens);
- rendered token images (keyed by the exact layer set), plus long `Cache-Control`
  on render and metadata responses.

The auction route serves the open auction, its bids, and its extended end time
from the index, with a cached RPC fallback. Bidding, settlement, and trades still
recheck live state when prepared.

Some reads come from chain on purpose ([`lib/chain-reads`](src/lib/chain-reads)):
- the community profile is the indexed `ProfileUpdated` JSON, shown only when its
  sha256 equals Metadata's `profile_hash()` (cached 60 s per contract and seq);
  otherwise the page says "Profile unavailable right now";
- token JSON is the on-chain `token_uri`, and images are composited from the
  on-chain layer registry (`/api/render?contract=&token=` is the renderer base a
  DAO's `token_uri` points at);
- the proposal list falls back to `proposal_count` / `ProposalId(seq)` /
  `proposal(id)` when the indexer is down (no titles or vote totals);
- Manage → Storage renewal builds the DAO's whole key inventory from RPC, quotes
  the sweep by simulation, and renews it in one transaction
  ([TTL_ECONOMICS](../../docs/TTL_ECONOMICS.md)).

Every transaction signature goes through `src/lib/wallet-sign.ts` (`signWithWallet`, or
`signSep10Challenge` for the sign-in fallback), which refuses a transaction able to
charge more than 50 XLM, or whose fee it can't read ([fee guard](src/lib/fee/fee-guard.ts)). stellar-sdk 17.4.0
includes the upstream fix for `AssembledTransaction.sign` counting the resource
fee twice; `src/lib/fee/sdk-sign-fee.test.ts` fails if a new SDK version brings
it back.

The activity feed shows curated public/governance rows only (see
`docs/DATABASE_SCHEMA.md`), formatted by `lib/activity-feed.ts` into a category,
a plain sentence, a relative time, and a link.

## API map

All DAO reads are deployment-scoped. Private trading helpers require a session.

| Endpoint | Interface |
| --- | --- |
| `GET /api/dao/[daoId]` | `{ daoId, status, indexedAt }`; 404 absent, 503 unavailable |
| `GET /api/dao/[daoId]/proposals/[proposalId]` | Chain/indexed state sources, timing, quorum, action vectors, receipt/status; no-store |
| DAO `proposals`, proposal `votes` and `comments`, `activity-feed`, `tokens`, `tokens/unseeded`, `members`, `auctions`, auction `bids`, `governance/settings` | Existing scoped read surfaces; bounds live in route handlers |
| Treasury `GET history?page=0`, `GET readiness?assetCode=XLM`, `POST prepare` | 12 execution calls/page (0–1000); funding request `{ assetCode: "XLM" | "USDC", amount: "decimal" }`; same-origin/session-derived unsigned transfer |
| `GET /api/dao/[daoId]/tokens/[tokenId]`, `POST /tokens/prepare` | Current/indexed holder source; strict transfer/approve/revoke/delegate requests, session-derived actor |
| `GET /api/dao/[daoId]/auctions/history` | Scoped terminal history with limit/offset and optional matching network |
| Claims `GET`, `GET lists`, `GET history`, `POST prepare` | Live allocation state, the open lists, separate indexed claims, unsigned Merkle claim preparation; not allocation writes |
| `GET /api/marketplace` | Community directory |
| `GET /api/marketplace/offers` | Pool and resale offers across scoped communities, not bid/offer-making support |
| `GET /api/dao/[daoId]/marketplace` | DAO listings, sales, and verified live config |
| Marketplace `GET listing`, `GET comments` | `kind`, `id`, `eventId` identify a specific scoped listing; `comments` takes `kind` and `id` |
| Marketplace `GET inventory`, `GET readiness`, `GET approval` | Session-derived inventory, asset readiness, and the holder's live approval for one token |
| Marketplace `POST prepare` | Strict action request: buy/cancel/expire, approve/list/revoke, or trustline; returns unsigned transaction |
| `POST /api/auth/challenge`, `/verify`; `GET /api/auth/session`; `POST /api/auth/logout` | SEP-53 message proof, then a signer-weight check on Horizon; encrypted cookie session (24-hour idle limit, 3-day absolute limit) |
| `POST /api/auth/sep10/challenge`, `POST /api/auth/sep10/verify` | Transaction-proof fallback; unsupported-message signing differs from wallet rejection. The challenge takes `{ address }` and is POST only |
| `GET /api/health`, `/api/goldsky/health` | Different health semantics; see [monitoring](../../docs/MONITORING.md) |
| `/api/uploads/*`, `/api/pinata/*` | Upload services; feature flags and server credentials apply; no AI generation endpoint |
| `GET /api/render/[daoId]/[tokenId]`, `GET /api/render?contract=&token=` | Token artwork renderer; the query form is the `renderer_base` on-chain `token_uri` points at |
| `POST /api/csp-report` | Content-Security-Policy violation reports from browsers; logged as `[csp-report]`, never stored |
| `GET /api/dao/[daoId]/token/[tokenId]` | The decoded on-chain `token_uri` JSON |
| `GET /api/slugs/[slug]` | Slug availability from the index: the DAO holding it and the number of pending requests |
| `GET /api/dashboard` | The signed-in account's dashboard; requires a session |
| `GET /api/platform/registry`, `/tribes`, `/vote-sources` | The indexed implementation registry and the hashes tribes run, every tribe with the contracts its storage check reads, and the approved vote sources |

Rendering, transaction preparation, claims, health, and CSP reports are rate limited per client (429 with `Retry-After`), and unexpected failures answer with a short message while the detail goes to the server log; see "API errors and rate limits" in [SECURITY_MODEL.md](../../docs/SECURITY_MODEL.md#api-errors-and-rate-limits). Response headers and the page Content-Security-Policy are described under "Response headers" there.

The member directory accepts `order=asc|desc` (descending votes by default); ordering is applied before pagination and includes an address tie-breaker. `GET /api/dao/[daoId]/initial-allocations` returns paginated original mint recipients before launch from `token.transfers` and `manager.dao_launches`, scoped to the deployment and Token contract. These records include any launch-drive claims and are not a list of current holders.

Marketplace query filters are `search` (≤120 characters), `page` (0–500), `kind=all|pool|secondary`, `status=all|open|purchased|cancelled|expired|closed` (default `open`), `capability=all|marketplace|auction|metadata`, and `seller` (a `G…` account, for that seller's resales). Community pages use 24 rows; combined offers page each kind independently (12 per kind, or 24 for one kind). Expired open rows can display `awaiting-expiry` until recovery is indexed. Successful responses are private/no-store. Route handlers and `src/lib/marketplace` are the full request/response authority.

## Agentation (optional, dev only)

A visual feedback toolbar for annotating the running app. It renders only when `NODE_ENV=development` and `NEXT_PUBLIC_AGENTATION_ENABLED=true` (set in `.env.local`). Global keyboard shortcuts are disabled so it can't intercept app keys.

For Codex, register the server once in Terminal:

```sh
codex mcp add agentation -- npx -y agentation-mcp server
codex mcp list
```

Restart the Codex client after configuration. It starts the configured server when
it connects; a separate Agentation server terminal is not normally needed. For
Claude Code, the equivalent registration is
`claude mcp add agentation -- npx -y agentation-mcp server`.

For each review session:

1. Keep `NEXT_PUBLIC_AGENTATION_ENABLED=true` in `apps/web/.env.local`, and run
   `pnpm dev` from the repository root.
2. Open the app at the same local address and port, click the feedback toolbar,
   select an element, enter a note, and choose Add.
3. Ask the connected agent to read pending Agentation feedback for this app and
   summarise it before changing code. It can use `agentation_get_all_pending`.
4. If the connection fails, run `npx -y agentation-mcp doctor`, confirm the server
   is reachable on port 4747, and restart the client after correcting its setup.
   The toolbar's Copy control also exports structured Markdown to paste into chat.

The component already uses `http://localhost:4747`. Agentation's default server
store is SQLite at `~/.agentation/store.db`; this is local machine storage, not
team synchronisation. Each teammate configures their own client, or receives an
export through the team's chosen shared channel.

If the service on port 4747 is unavailable, the toolbar can fall back to the
browser's localStorage. Those notes belong to that browser profile and exact
origin, including its port. They do not enter Git or automatically reach the
team's agents. Clearing site data can remove them; another browser, profile, or
port will not show the same notes.

For a reliable handoff, export the feedback and keep a copy in the team's chosen
shared location. Date-stamped feedback, bug, and feedback-record Markdown files
are Git-ignored in this checkout, so they will not accompany a commit or PR. To
let a connected agent consume annotations directly, use the MCP setup above. The
production build does not render the toolbar.

Setup references: [Agentation installation](https://www.agentation.com/install),
[Agentation storage](https://www.agentation.com/api), and
[Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

## Checks and limits

```bash
# From repository root
pnpm --dir apps/web codegen
pnpm --dir apps/web test
pnpm lint
pnpm typecheck
pnpm build
```

Run after generation prerequisites. Tests cover creation envelope acceptance/rebroadcast/frozen review, local stores, artwork, theme, proposal ABI/receipts, marketplace, Treasury funding, holder controls, member pagination, auction state/history, claim proof/tree/envelope, renewal inventory (module `renewal_keys` included), holder lock and members-only rules, fee guard, and weighted SEP-10 accounts. Do not point tests at live services without reviewing their environment gates. No full-suite passing count or live UX verification is asserted here. CI runs web codegen before lint/typecheck/tests and a separate Build Web job; it no longer uses the old DAO build/bindings aliases.

Read model availability, RPC, wallet, supported assets, and upload configuration are separate dependencies. Browser-local storage is not an access-control boundary on a shared browser. Submission can be confirmed before discovery/receipts appear. TTL reporting/renewal is limited to the implemented code/artwork paths; see [TTL maintenance](../../docs/TTL_ECONOMICS.md).
