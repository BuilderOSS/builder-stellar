# Builder Brand and Frontend Direction

## Decision

Builder is the civic gateway to independently owned DAO worlds on Stellar.

Builder helps a community form, find, and enter a DAO. Once someone enters a
DAO, Builder recedes: the DAO's identity, rules, treasury, membership, and
market become the product they are using. Leaving a DAO returns the person to
Builder's lobby.

**Brand idea: Enter what you own.**

This is not a generic Web3 dashboard and not a speculative NFT arcade. Builder
is the calm, high-trust place where communities create and operate durable,
on-chain institutions. Stellar gives those institutions fast, practical
financial rails; Builder gives them an understandable home.

## Product Truth

Builder deploys a DAO but does not retain ownership or an ongoing
administrative role after launch. The DAO's Treasury and Governor control its
modules; Builder's Manager is a deployment factory and implementation registry.
Goldsky provides the durable discovery and history layer.

This protocol boundary should be visible in the experience:

- Builder lobby: discovery, personal activity, DAO creation, and platform-wide
  marketplace browsing.
- DAO world: a focused, DAO-branded operational workspace for governance,
  treasury, members, auctions, and that DAO's marketplace.
- DAO control room: entitled administration and setup work, deliberately
  separate from routine member activity. A control action becomes either a
  direct launch-admin transaction before launch or a governance proposal after
  launch.

The resulting experience makes a truthful promise: Builder opens the door;
the DAO is what is behind it.

## Audience and Job

### Primary people

- **Community member:** wants to know what requires their participation now
  without first learning contract topology.
- **Founder or launch administrator:** wants to establish a DAO confidently
  through a recoverable, multi-transaction setup flow.
- **Working-group operator:** wants to prepare operational change without
  accidentally implying unilateral authority after launch.
- **Collector or buyer:** wants a clear distinction between a DAO's continuous
  auction and its fixed-price marketplace, including provenance and escrow
  guarantees.

### Insight

DAO participants want the agency of owning an institution, but most DAO tools
make that institution feel like a pile of contracts and tabs, because protocol
complexity is presented before the community's current decision.

### Experience strategy

Make the next meaningful act visible before the protocol machinery. Preserve
on-chain detail, authority boundaries, and transaction status as inspectable
evidence rather than navigation obstacles.

## Creative Exploration

Three directions were considered before selecting the system below.

### 1. Protocol control plane

An aerospace-like command center with dense telemetry, grids, and module
diagnostics. It is credible for treasury and governance work, but it makes the
DAO feel like software operated by specialists. It fails the community and
identity side of the brief.

### 2. DAO city

An illustrated city where DAOs are districts and modules are buildings. It has
discovery charm, but turns serious actions such as treasury transfers and
voting into metaphor. It also risks becoming decorative Web3 world-building.

### 3. Lobby to world (selected)

Builder is a lobby for a network of self-governing worlds. Entering a DAO
changes the spatial frame, navigation, and emphasis from platform discovery to
the DAO's own purpose and current work. This holds the tension between a shared
platform and independent DAO sovereignty rather than hiding it.

**Why it wins:** It is one sentence, maps directly to the protocol boundary,
works for guests and experienced members, and can scale from a focused mobile
view to a multi-module desktop workspace.

## Identity System

### Positioning

**Builder is the civic gateway for DAOs on Stellar.**

It gives communities a place to launch, discover, enter, and govern their own
on-chain institutions.

### Voice

- Direct and grounded: "Vote closes in 2 hours", not "Your governance journey
  awaits."
- Precise about authority: "Requires DAO approval" and "Launch admin only"
  are first-class interface language.
- Community-led: name the DAO and its purpose before naming the module.
- Calm under consequence: state what a transaction does, where funds go, and
  what is awaiting indexing without artificial urgency.

### Naming rules

- At platform scope, use **Builder Lobby**, **Discover DAOs**, **Create a DAO**,
  **My DAO worlds**, and **Marketplace**.
- Inside a DAO, use its name first and action-oriented module labels:
  **Overview**, **Governance**, **Treasury**, **Members**, **Market**.
- Reserve **Manage** and **Control room** for entitled setup or administrative
  work. Do not label governance-authorized actions as "Admin" after launch.
- Say **Exit [DAO name]** when returning to Builder. This gives the boundary a
  clear, intentional action without suggesting the user is leaving ownership.

### Visual language: Civic nightshift

The existing dark, technical visual base is appropriate and should evolve into
an editorial operations environment rather than a neon crypto interface.

- **Canvas:** graphite and near-black surfaces, restrained depth, thin
  structural dividers, and high-contrast text.
- **Builder accent:** Stellar blue is used for platform navigation, focus, and
  the single primary action.
- **DAO accent:** a DAO's artwork or selected color appears in the identity
  panel, entry transition, and sparse highlights. It never changes semantic
  state colors or reduces contrast.
- **Type:** Inter for legible civic information; monospace only for addresses,
  ledger data, hashes, and numeric controls. DAO names may use a larger,
  compact display treatment, but the workspace remains utilitarian.
- **Imagery:** DAO art represents membership and culture. It is cropped and
  framed as a signal, never used as low-contrast background decoration.
- **State colors:** blue for action/focus, green for confirmed/success, amber
  for attention/recoverable waits, red for blocked or failed actions. These
  colors never carry meaning alone.

### Motion

Entering a DAO is a short spatial transition: the Builder lobby identity
compresses into an exit affordance while the DAO mark anchors the new left
workspace rail. Use 160ms property-specific transitions and no ornamental
loops. Respect reduced-motion preferences; transitions must never conceal a
route or transaction state change.

## Information Architecture

### Builder Lobby

`/` is the platform lobby, not a generic dashboard with equal tabs.

1. **Now**: wallet-specific attention queue. Active votes, auctions ending,
   pending launch work, completed transactions awaiting indexing, and actionable
   marketplace events appear in deadline/consequence order.
2. **My DAO worlds**: compact DAO switcher/list with membership, voting power,
   and the single most important open action for each DAO.
3. **Discover**: public directory with search, DAO identity, mission, status,
   membership signals, and a clear Enter action.
4. **Marketplace**: cross-DAO browsing for active listings, with DAO provenance
   visible on every item. This is discovery, not a replacement for a DAO's own
   market.
5. **Create a DAO**: a persistent but visually secondary platform action.
6. **Launch queue**: visible only to the connected launch administrator and
   framed as resumable work, not a public directory category.

Guests see Discover and Marketplace first, plus the creation invitation. A
connected wallet enriches the same lobby with Now and My DAO worlds rather than
switching the person into an unrelated interface.

### DAO World

Entering `/dao/[daoId]` replaces platform navigation with one labeled DAO
workspace rail on desktop. Remove the competing horizontal DAO navigation and
dash-only global rail.

The rail contains:

1. DAO identity, artwork, current status, and an **Exit to Builder** control.
2. Overview.
3. Governance, with an urgent vote count where applicable.
4. Treasury.
5. Members.
6. Market, containing Auctions and Marketplace.
7. Manage, visible only to wallets with the necessary membership or role.

The desktop overview starts with **Now in [DAO]**, one prioritized action that
has a clear owner and deadline. Module summaries and history sit below it.
Examples: vote on a live proposal, bid before an auction ends, complete a
launch task, recover an expired listing, or review a queued execution.

On mobile, show a fixed bottom navigation for Overview, Governance, Market,
Members, and More. The header retains the DAO switcher/exit control. Every
destination remains visibly named; important navigation must not depend on
icon-only rail tooltips.

### Control Room

The control room is entered through **Manage** or the launch queue, not mixed
into a member's daily workspace.

- **Before launch:** the launch administrator follows a persistent checklist:
  identity and artwork, token ownership, founder allocations, module
  configuration, launch preferences, and final launch. Each task is completed,
  blocked, pending confirmation, or retryable. The system never loses a
  recoverable setup state after a partial transaction.
- **After launch:** direct settings pages become proposal preparation surfaces.
  The interface states the authority route before the user edits anything:
  `Governor proposal -> Treasury execution -> module change`.
- **Working groups:** if the DAO recognizes an operational address or role in a
  future capability model, display its mandate and explicit authority. Never
  infer autonomous authority from a connected EOA.
- **Platform administration:** Manager implementation registry and factory work
  remains outside every DAO world and is never presented as DAO management.

## Core Flows

### Enter a DAO

1. In Builder Lobby, a person discovers a DAO or selects one from My DAO worlds.
2. The entry card communicates purpose, operational status, membership context,
   and the strongest available reason to enter.
3. Selecting **Enter [DAO]** loads the DAO shell with its identity anchored in
   the rail.
4. Overview immediately shows what the connected person can or should do next.
5. **Exit to Builder** returns to the lobby with retained discover/search state.

### Vote and governance

1. Overview calls out an eligible live vote with time remaining and voting
   power.
2. Governance lists proposals by live state, not merely by creation order.
3. Proposal detail states outcome conditions, execution target, action summary,
   and transaction/indexing status.
4. Proposal creation is a workspace with a plain-language action preview and a
   machine-readable call detail available for inspection.

### Buy or list an NFT

1. A person enters Market from the DAO world or opens a platform listing from
   Builder Lobby.
2. Marketplace separates `Primary`, `Secondary`, `My listings`, `Sold`, and
   `Expired`; continuous auction remains a distinct sibling destination.
3. Listing detail shows token provenance, price/payment asset, expiry, seller,
   and DAO fee before a CTA.
4. Checkout confirms the transfer path: payment goes to Treasury for primary
   sales; secondary payment splits to seller and Treasury. The NFT moves from
   Marketplace escrow to buyer.
5. Seller flow is explicitly staged: approve token, escrow it, publish the
   listing. Cancellation and permissionless expiry recovery remain available
   even when the marketplace is paused.
6. Receipts preserve transaction hash, confirmation state, and an
   "awaiting index" state without claiming the read model is immediately final.

### Launch a DAO

1. Create uses a deliberate, saveable flow: identity, purpose and membership,
   governance, market defaults, auction defaults, artwork/founders where
   supported, then review.
2. Creation deploys the pending DAO. The user is taken to its private Control
   Room, never a public-looking DAO dashboard.
3. The launch checklist makes the ownership handoff, supply requirement, and
   module configuration concrete.
4. Launch preferences explicitly control whether Auction and Marketplace are
   unpaused. The final confirmation says control transfers to the DAO Treasury.

## System Requirements

### Trust and transaction states

Every on-chain action has a visible lifecycle: draft, wallet approval,
submitted, confirmed, awaiting index, indexed, rejected, or failed. Prevent
double-submission and retain the user's input on recoverable error.

Data-derived screens must show an unobtrusive last-indexed ledger/time and
explain index lag where it affects a just-completed action. Contract addresses,
hashes, and explorer links are available as evidence but never dominate a
community-facing screen.

### Authority states

The UI must distinguish public visibility, membership, voting power, launch
admin authority, direct owner authority before finalization, and
governance-only authority after finalization. These are product states, not
just permission guards.

### Accessibility

- Use one primary navigation model per breakpoint with persistent text labels.
- Make tabs keyboard operable with arrow keys, Home/End, `aria-controls`, and
  announced selection changes.
- Use 44px minimum mobile targets and keyboard-reachable network remediation.
- Announce transaction and loading updates once through appropriate live
  regions; reserve space with skeletons.
- Gate hover-only behavior behind fine-pointer media queries and honor reduced
  motion.

## Delivery Plan

### Phase 0: Reconcile product contracts

1. Fix the creation parameter mismatch before expanding its UI: the current
   client form no longer supplies legacy auction inputs required by the
   deprecated deployment adapter.
2. Complete the Marketplace read model before presenting any active marketplace
   UI: DAO-scoped active listings, terminal listing/sale history, listing
   detail, payment asset, fee snapshot, expiry, and pause state. Expose
   Marketplace module address and enabled state in `DaoConfig` rather than
   dropping those deployment facts at the database boundary.
3. Add a wallet-scoped action-queue API that ranks eligible votes, deadlines,
   pending launch steps, relevant transaction/indexing waits, and marketplace
   recovery work. The existing DAO-wide activity feed is history, not a
   personal attention model.
4. Expose a DAO/module-scoped indexed-ledger or indexed-at watermark alongside
   data-derived responses. A deployment-global health timestamp cannot prove
   whether a particular listing, vote, or receipt is awaiting projection.
5. Define the capabilities contract for launch admin, member, proposer, and
   governance-only control surfaces. Do not infer post-launch authority from
   token ownership alone.
6. Wire user-controlled Auction and Marketplace launch preferences before
   describing them as a creator choice. The current launch flow always enables
   both modules.

### Phase 1: App shell and lobby

1. Replace the current dashboard-tab model with a Builder Lobby page organized
   around Now, My DAO worlds, Discover, Marketplace, and Launch queue.
2. Create the DAO world shell with one desktop left rail, a labeled mobile
   navigation model, DAO identity theme tokens, and an explicit exit action.
3. Remove the duplicated horizontal DAO navigation and retire the global
   dash-only navigation rail from DAO routes.
4. Repair the existing invalid auction navigation path while consolidating
   navigation.

### Phase 2: DAO workspace

1. Rebuild DAO Overview around ranked urgent work, then module summaries and
   history.
2. Group Auctions and Marketplace beneath Market without blurring their
   distinct sale mechanics.
3. Add shared transaction-state and index-lag components so every DAO module
   communicates confirmation consistently.

### Phase 3: Marketplace

1. Deliver active listing browse/detail/history views backed by DAO-scoped
   Goldsky data.
2. Deliver primary listing proposal creation and secondary approve/escrow/list
   workflow.
3. Deliver checkout, cancel, expiry recovery, paused-market behavior, and
   transaction receipts.
4. Surface global marketplace discovery in Builder Lobby while preserving the
   DAO provenance and DAO-scoped return path.

### Phase 4: Control Room and creation

1. Turn pending launch into a structured, resumable private checklist.
2. Move post-launch settings into proposal-oriented change flows with authority
   explanation and execution previews.
3. Restore artwork/founder creation capabilities only once their deployment
   data contract is real and tested; do not design a false-complete wizard.

## Acceptance Criteria

- A guest understands Builder is a place to discover and enter independent
  DAOs, not the owner of those DAOs.
- A connected member can identify their most consequential next action within
  one screen after opening Builder or entering a DAO.
- A DAO route uses one coherent navigation system and visibly identifies the
  current DAO at every viewport size.
- Every management action communicates whether it is direct setup authority or
  requires DAO governance.
- Marketplace screens truthfully represent primary/secondary, escrow, fees,
  expiry, pause, confirmation, and index-lag states specified by the protocol.
- A launch administrator can resume setup after any partial transaction without
  reconstructing state manually.

## Source Constraints

This direction is constrained by the approved Manager and Marketplace designs:

- `docs/MANAGER_REDESIGN.md`
- `docs/MARKETPLACE_PLAN.md`
- `docs/DAO_DEPLOYMENT.md`
- `docs/MULTITENANT_ARCHITECTURE.md`

Current frontend evidence and migration targets:

- `apps/web/src/components/dashboard/dashboard-shell.tsx`
- `apps/web/src/components/dao-shell.tsx`
- `apps/web/src/app/dao/[daoId]/page.tsx`
- `apps/web/src/app/create/page.tsx`
