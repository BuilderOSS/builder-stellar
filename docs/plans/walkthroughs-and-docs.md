# Plan: real-app walkthroughs, docs.tribes.build, and both themes

Status: draft for review (2026-11-18). Owner: Tribe Builder core.
Reviews: `/plan-eng-review` and `/plan-design-review`. The open questions are in §11; nothing is built until they are answered.

## 0. What we are making

1. **A walkthrough suite.** Playwright drives the real web app with a real wallet connection on testnet, through every user flow: create, set up, and launch a tribe, then proposals all the way to execution, auctions, the marketplace, claims, treasury, members and delegation, Manage, renewal, the legal export, and platform operations. The waits are real chain waits. It runs on mobile, tablet, and desktop, in light and dark.
2. **A bug ledger and fix loop.** Every defect the walkthroughs (or a person) find is logged, fixed at the root cause, and pinned with a regression test before it closes.
3. **A theme audit of the app.** Light mode already exists (`panda.config.ts` semantic tokens, `lib/warm-ink-theme.ts`, and the Appearance control in the You sheet). The job is to prove both themes on every screen and state, and to fix whatever falls short.
4. **docs.tribes.build.** A user docs site with concepts (what a DAO is, tokens, NFTs, votes, modules, upgradability, and more), a guide for every flow, and reference pages. It has its own light and dark themes. Every screenshot comes from the real app, captured in the reader's theme.
5. **MIDAO alignment.** The legal export is checked line by line against docs.midao.org (§8).
6. **A process that can be repeated.** Every step above is a documented command, so any of it can be re-run, re-captured, re-reviewed, and extended for years.

## 1. Creative direction (/creative-director)

**Brief.**

| Item | Content |
|---|---|
| Product | Tribe Builder, NFT-membership DAOs on Stellar |
| Audience | Mostly people new to wallets and DAOs who want to start or join a group that owns things together. The second audience is crypto natives who know Nouns. |
| Objective | Someone can go from "what is this" to a launched tribe with a first executed proposal, without outside help |
| Constraints | The DESIGN.md voice (warm host, plain words first, the DAO term one line beneath, no em dashes), the Warm Ink · Dusk system, real screenshots only |
| Idea level | `execution`, plus a docs system that has to last for years |

**Tension.** This is a category tension. Crypto docs promise empowerment and deliver a spec. They explain the machine before the gathering.

**Insight.** People starting a tribe want to make decisions together with shared money. What stops them is the vocabulary (DAO, quorum, delegation, TTL) arriving before the reason it matters, so they feel the tool is for someone else.

**Concepts considered** (ideas 1 to 3 were warm-up):

| # | Concept | Verdict |
|---|---|---|
| 1 | Conventional docs: sidebar, concept pages, API-style reference | Expected. It fails the swap test: put in a competitor's name and nothing changes. |
| 2 | Video-first tutorials | Expensive to keep current. They can't be themed, and the app changes weekly. |
| 3 | An interactive sandbox tribe | Strong, but it's a product in its own right. Parked as a later idea. |
| 5 | **"Pull up a chair"**. Each guide opens at the table. First the human moment ("you want the group to decide how to spend 500 XLM"), then the exact screens, then "What happens on chain" folded underneath for anyone curious. The mark's empty seat is the recurring motif: the docs keep a seat for the reader. | **Recommended.** It's specific to our brand (the lens is the table), uses the voice the app already has, and scales to every flow. |
| 7 | "One tribe's story". The whole docs site follows a single example tribe (the showcase tribe, §5.6) from founding to its tenth proposal, so screenshots show continuity rather than random states. | **Adopted as the spine of #5.** Every screenshot comes from the same tribe, captured by the suite. |
| 9 | Glossary as people ("the Treasury is the tribe's wallet; no one person holds the key") | Kept as the glossary's tone, not as a concept on its own. |

**Recommendation: #5 with #7 as its spine.** In one sentence: *the docs keep a seat for you, and walk one real tribe from its first meeting to its first decision.* An honest score is about 8.1 weighted (originality 7, fit 9, emotion 8, feasibility 9, scale 8, simplicity 9). It isn't a 9 because docs are a utility. The surprise comes from continuity and craft, not novelty, and that is the right trade here.

**Pre-mortem.** The ways this could fail, and what prevents each:

- The showcase tribe drifts from what new users see. The suite re-captures every screenshot on each docs release.
- The table metaphor gets cute. It lives in one sentence per guide intro and the empty-seat motif, never in steps.
- Readers skip "on chain" sections they actually need. Authority and fee facts stay in the steps, per the DESIGN.md authority rules.

## 2. Phases and sequence

| Phase | What | Depends on | Exit |
|---|---|---|---|
| P0 | Answers to §11, and this plan reviewed | None | Decisions logged in §12 |
| P1 | Harness: Playwright workspace, test wallet, network and identities, wait helpers, fixtures, one smoke flow | P0 | Smoke flow green on 3 viewports × 2 themes |
| P2 | Walkthrough suite: all flows in §3.4 | P1 | Every flow green at least once on a real testnet run |
| P3 | Bug loop: triage and root-cause fixes, each with a regression test | runs alongside P2 | Ledger has zero open P0 or P1 defects |
| P4 | Theme and responsive audit (§4) | P2 states | Every screen × state × theme × viewport reviewed and passing the checks |
| P5 | Docs app scaffold (§5): stack, themes, IA, components | P0 | Empty site live on a preview URL in both themes |
| P6 | Capture pipeline (§5.6): the showcase tribe and themed screenshots | P2, P5 | `pnpm docs:capture` regenerates every image |
| P7 | Content: every page in §5.2 | P5, P6 | Copy and media review (§6) passed for every page |
| P8 | MIDAO alignment changes (§8) | MIDAO review | Gap table closed or explicitly deferred |
| P9 | Launch docs.tribes.build, with the process docs complete | all | §7 runbooks merged |

P1 to P3 and P5 can run in parallel: the docs scaffold doesn't need the suite until screenshots.

## 3. Walkthrough suite

### 3.1 Harness
- **Location.** A new workspace at `apps/e2e`, with Playwright, TypeScript, and `@playwright/test` fixtures. It stays out of `apps/web` so the web build and Vitest are unaffected.
- **Target.** A local `next start` production build pointed at testnet, plus a mode for a Vercel preview URL. It is never pointed at production.
- **Reporters.** An HTML report, trace on failure, video on failure, and a JSON summary written to `apps/e2e/reports/<run-id>/`.

### 3.2 Wallet connection
The real connect modal should be exercised, but browser-extension wallets can't be automated reliably. **Proposal:** a test-only wallet module for Stellar Wallets Kit ("E2E Wallet").
- It is registered only when `NEXT_PUBLIC_E2E_WALLET=1` is set at build time, and is tree-shaken out of every other build. A build-time check fails any production build that contains it.
- It shows up in the kit's modal like any other wallet. The test clicks Connect, picks E2E Wallet, and approves.
- It signs through a local signer service on 127.0.0.1 that holds testnet identity secrets. The browser never sees a secret, and the service refuses anything but the testnet passphrase.
- It supports the same calls the app uses: `getAddress`, `signTransaction`, `signMessage` (SEP-53 auth), and `signAuthEntry`. It exercises the real SEP-53 and SEP-10 login.
- There is a "reject" switch, so declined signatures and recovery states get tested too.
- One manual smoke pass per release with Freighter on a real device stays in the checklist, because the E2E Wallet proves our code, not every wallet's.

### 3.3 Network, identities, and waits
- **Network: testnet.** It's the only network with an indexer (Goldsky), and the read model is part of what we test. A local quickstart can't index, and it has no ledger-time control.
- **Identities.** Funded testnet keys come from `stellar keys`, named `e2e-founder`, `e2e-member-a`, `e2e-member-b`, and `e2e-operator`. They are funded and topped up by Friendbot in a preflight step, and only public addresses are logged.
- **Timing.** The contract minimums are 300s each for voting delay, voting period, and queue delay, and 300s for an auction. A proposal therefore takes at least 15 minutes, plus the time for ledgers and the indexer to catch up.
- **Waits are conditions, not sleeps.** `waitForLedgerTime(t)` reads RPC `getLatestLedger`. `waitForIndexed(predicate)` polls the app's own API routes. `waitForUi(locator)` uses Playwright expectations. Each wait has a timeout written as a multiple of the governing duration and reports what it was waiting for.
- **Parallel timelines.** Long waits overlap: while proposal A's voting period runs, the auction and marketplace flows run on another tribe. A full run should take about 45 to 60 minutes of wall time, not the sum of the waits.
- **Resumable.** Run state (tribes, proposal ids, transaction hashes) is persisted like `scripts/e2e-testnet.mjs`, so a failed run resumes instead of restarting the clock.

### 3.4 Flow matrix
Each flow is a Playwright spec named for its user goal. `chain` means it signs transactions; `read` means it only reads.

| ID | Flow | Kind | Notes |
|---|---|---|---|
| W01 | Connect wallet, sign in (SEP-53), sign out, reject a signature | chain-auth | Also covers the SEP-10 fallback |
| W02 | Discover and search tribes, open a tribe, share card | read | |
| W03 | Create a tribe through the identity, membership, voting, and review steps, and deploy | chain | Every membership type, and a vote source choice when one is approved |
| W04 | Setup: artwork upload, founders, slug, contracts, then launch | chain | Includes blocker states |
| W05 | Assurance drive: open, contribute, launch when ready or fail, refunds | chain | |
| W06 | Auction: bid, outbid, refund, settle, then the next auction | chain | |
| W07 | Proposal lifecycle: compose with several actions, propose, wait, vote for, against, and abstain from three wallets, queue, wait, execute | chain | The longest timeline |
| W08 | Proposal edge cases: cancel, defeated, quorum not met, expired, threshold not met | chain | |
| W09 | One proposal per action group from `docs/PROPOSAL_ACTIONS.md`, executed and verified | chain | Batched into a few proposals to share waits |
| W10 | Marketplace: list a token (approve, then list), buy, cancel, expire, restock, comment | chain | |
| W11 | Marketplace pools and Treasury purchases through a proposal | chain | |
| W12 | Claims: create a list, publish, claim, refund | chain | |
| W13 | Treasury: balances, a draft dock proposal | read + chain | |
| W14 | Members: directory, profile, delegate, transfer, approve, revoke, members-only delegation | chain | |
| W15 | Manage: profile, token, governance, auction, and marketplace settings, all as proposals after launch | chain | Checks the authority copy (Setup versus Requires DAO governance) |
| W16 | Upgrades: notice, approve upgrade, migrate | chain | Needs an operator-approved path on testnet |
| W17 | Renewal: quote and renew (tribe tab), and the platform page | chain | |
| W18 | Legal export: all four steps, both downloads checked | read | Downloads are intercepted, never saved |
| W19 | You sheet: drafts, appearance (Dark, Light, and System), legal links | read | |
| W20 | Error and recovery states: unknown confirmation, archived entry restore, network mismatch | chain | |

### 3.5 Responsive and theme matrix
Repeating every chain flow six times would add hours of waiting and a lot of testnet churn. Instead:
- **Chain flows run once per run** at desktop, with one full rotation per week where each flow runs at mobile and tablet too.
- **Every state they reach is snapshotted** at each viewport × theme pair: mobile 375×812, tablet 768×1024, and desktop 1440×900, each in light and dark. The run records the URL and state; a read-only "state tour" replays it at every combination.
- **Interactive forms are filled at all three viewports**, up to the signing step, then cancelled. This covers sheets, ActionBar placement, and on-screen keyboards without on-chain cost.
- **Checks at every combination:**
  - no horizontal scroll at 320px or above;
  - axe accessibility with zero serious or critical issues;
  - contrast at AA or better in both themes;
  - no console errors;
  - no layout shift after load;
  - visual diffs against approved baselines, with a reviewed update flow.

### 3.6 Bug loop
- **Ledger.** `docs/qa/BUG_LEDGER.md` (or GitHub issues labelled `walkthrough`, see §11). Each entry has an id, flow, viewport and theme, steps, expected and actual results, a trace link, severity, root cause, fix PR, and regression test.
- **Severity:**

  | Level | Meaning |
  |---|---|
  | P0 | Funds, authority, or data correctness |
  | P1 | A flow is blocked |
  | P2 | Wrong or misleading copy or state |
  | P3 | Polish |

- **Rules.** Fix the root cause, not a test workaround. Every fix lands with a test at the lowest level that catches it: a unit, component, or contract test first, a walkthrough assertion otherwise. There are no `test.skip` calls without a ledger id.
- **PRs.** Each fix is its own PR into `dev`, grouped by root cause.

## 4. Light and dark in the app

What exists already: semantic tokens for both themes, a boot script with no flash, a System preference, and transitions suppressed during the switch. A first visit is dark by design.

The work:
1. **Inventory.**
   - Every route × state from §3.4, captured in both themes by the state tour.
   - The `/design` catalogue is the reference sheet for primitives.
2. **Checks** (/better-ui and /emil-design-eng):
   - contrast for text, muted, faint, and signal-on-surface in both themes;
   - brass used only for "yours";
   - image outlines: `oklch(0 0 0 / 0.1)` in light and `oklch(1 0 0 / 0.1)` in dark;
   - concentric radii;
   - shadows for elevation and borders for structure, in both themes (light shadows need different values);
   - icon stroke matched to text weight;
   - the theme switch snaps with no smearing;
   - press `scale(0.96)` at 160ms;
   - no animation on first load.
3. **Known gaps to check.**
   - OG share cards are Dusk-only by design. Keep them that way (§11 Q9).
   - Token art can look out of place on a light canvas.
   - Third-party wallet modals (the Stellar Wallets Kit theme) need a light theme, synced to ours.
   - `themeColor` meta.
   - Charts, QR codes, and the explorer links' icons.
4. **Pass/fail rules** (decision 8A):
   - Token art always sits on its own art tile, with the image outline, and never touches the page canvas in either theme.
   - The Stellar Wallets Kit modal theme follows our `data-theme` on every switch, including System changes. The state tour checks it in both themes.
5. **Output.** `docs/qa/THEME_AUDIT.md`, a table of screen, state, issue, severity, and fix PR. Visual baselines are committed for both themes.

## 5. docs.tribes.build

### 5.1 Stack (recommendation; decided in §11 Q4)
- `apps/docs`: Next.js App Router with MDX. Styling uses the **shared Panda preset** extracted from `apps/web/panda.config.ts` into `packages/design-tokens`, so the docs and the app have identical tokens, fonts, and themes, and identical theme scripts (the same localStorage key, so a choice made in the app carries over on the same origin family).
- The docs import a small set of primitives (Callout, Chip, Disclosure, Steps) from a shared `packages/ui-docs`, or reuse `apps/web/src/components/ui` through a package export. They never copy them.
- Search uses Pagefind (static, no service) or Orama. The site is fully static and hosted on Vercel at `docs.tribes.build`.
- The alternative is Fumadocs: it's faster to start, but its Tailwind theme would have to be re-skinned to Warm Ink. That's rejected unless we choose speed over brand fidelity.

### 5.2 Information architecture

**Start here**
- What is Tribe Builder
- What's a tribe (a DAO, in plain words)
- Your first 10 minutes: get a wallet, connect, join a tribe
- Build your first tribe: a quickstart that links into the guides

**Concepts** (plain words first, then the DAO term)

| Concept | Covers |
|---|---|
| Tribes and DAOs | |
| Wallets and Stellar basics | Accounts, XLM, fees, testnet versus mainnet, signing versus submitting |
| Membership tokens (NFTs) | One token, one vote; art and traits |
| Votes and delegation | Snapshots, and why your votes count from a ledger |
| Proposals | Lifecycle (draft, pending, active, succeeded or defeated, queued, executed, cancelled, expired), threshold, quorum, voting delay and period, safety delay |
| The Treasury | Who can move funds: no one person |
| Modules | Auction, marketplace, and claims; what a module is; adding modules |
| Setup versus launched | The launch admin, and "Requires DAO governance" |
| Vote sources | Token-weighted, approved adapters, NQG (coming) |
| Upgrades | Upgradability, the Manager, upgrade notices, revocation, who decides |
| Storage and renewal | Rent and TTL in plain words: what expires and who renews it |
| Safety and security model | What the platform can and can't do |

**Guides** (one per flow, mirroring §3.4)

| Area | Pages |
|---|---|
| Create a tribe | Identity, membership choices, voting rules, review and deploy |
| Set up and launch | Artwork, founders, slug, contracts, launch, assurance drives |
| Proposals | Write a proposal, choose actions (a page per action group), vote, queue, execute, cancel |
| Auctions | Bid, settle, refunds, auction settings |
| Marketplace | Sell a token, buy, cancel, pools, Treasury purchases |
| Claims | Make a claim list, claim, refund |
| Members | Find members, delegate, transfer, approvals |
| Manage | A page per Manage section |
| Legal entity export | With MIDAO |
| Running the platform | The `/platform` page, for operators |

**Reference**
- Glossary, one source shared with the in-app `GlossaryTerm` (§5.5)
- Proposal actions (generated from `docs/PROPOSAL_ACTIONS.md` and the catalog)
- Limits and timings (generated from `contracts/common/src/lib.rs` constants)
- Error messages (generated from `lib/contract-errors.ts`)
- Contract addresses per network (generated from `deploys/*.json`)
- FAQ
- Troubleshooting
- Changelog

### 5.3 Page template
Every guide uses the same sections:
1. **Overview.** One or two plain sentences about the goal.
2. **Before you start.** Role, wallet, and what you need, for example "a member with at least 1 vote".
3. **Steps.** Numbered. Each step has one themed screenshot. A mobile variant appears where the layout differs.
4. **What happens on chain.** Folded: contracts called, fees, waits, and who can see it, and when.
5. **If something goes wrong.**
6. **Related.**

### 5.4 Docs design (/plan-design-review will grade this)
- **Mode.** Read: structure for comprehension and wayfinding. The home page is an index, not a marketing page (decision 1A). Its order, top to bottom:
  ```
  [top bar: mark + "Tribe Builder Docs" | search ⌘K | theme]
  H1 "Pull up a chair" + one line; DAO line beneath in muted
  ┌ I'm joining a tribe  → connect, bid, vote, delegate      ┐  two large ListRows,
  └ I'm starting a tribe → create, set up, launch, first vote┘  not cards
  Core ideas: What's a tribe · Votes · Proposals · Treasury · Modules · Upgrades
  Strip: "Follow one tribe from first meeting to first decision" + one framed shot
  ```
  There's no hero art, no card grid, and no CTA buttons. Each path row opens an ordered sequence of guides with "Next" links at the foot of every page.
- **Layout.**
  - Desktop has three columns: nav, content, and an on-page table of contents.
  - Tablet has two: the table of contents is folded into a Disclosure at the top.
  - Mobile has one column, with the nav in a sheet using `--ease-drawer` (240ms in, 180ms out) and a sticky "On this page" control.
- **Type.** Bricolage for headings, Figtree for body, JetBrains Mono for code and addresses.
  - **The docs body is 17px Figtree at line-height 1.6, with a 68ch measure** (decision 4A).
  - UI chrome (nav, table of contents, labels) keeps the app's `{typography.body}` at 15px and `{typography.label}` at 13px.
  - Headings use `{typography.display}` and `{typography.title}`, with more space above a heading than below it.
- **Screenshots.**
  - Each one sits in a device-agnostic frame with a 1px outline using the image outline values from §4, and concentric radius (frame radius = image radius + padding).
  - There's no drop-shadow stack in light mode.
  - Images are lazy-loaded with fixed aspect ratios, so there's no layout shift.
- **Motion.** None on page load, and none on keyboard navigation. The search dialog opens instantly. Sidebar sections use the Disclosure's standard motion, and press is `scale(0.96)`.
- **Browser surfaces** (decision 5A), the same in both themes:
  - Links are in `signal` with a 1px underline at a 0.2em offset.
  - Visited links are `signal` mixed 70/30 with `text-muted`.
  - `::selection` is `signal` at 25%.
  - Focus rings are 2px `signal` with a 2px offset.
  - Scrollbars are thin, in `rule` on `canvas`.
  - These are proposed to DESIGN.md as shared tokens, so the app can adopt them too.
- **Theme switch.** Dark, Light, and System, the same control as the app's You sheet, with transitions suppressed during the switch.

### 5.4c Accessibility (decision 6A)
- **Structure.** A "Skip to content" link comes first in the tab order. Landmarks are `header`, `nav` (labelled "Docs"), `main`, and `aside` ("On this page"). The current page in the nav has `aria-current="page"`.
- **Search.** ⌘K, Ctrl K, or `/` opens the dialog. Focus is trapped while it's open. Arrow keys move through results and Enter opens one. Escape closes it and returns focus to the trigger.
- **Touch and pointer.** Touch targets are at least 44px on mobile. Hover effects apply only under `(hover: hover) and (pointer: fine)`.
- **Text and motion.**
  - Alt text says what the state shows ("The proposal composer with two actions added"), not "screenshot".
  - Contrast is AA or better for body text and markers in both themes.
  - Reduced motion removes the sheet slide but keeps the fades.
- **Checks.** axe runs in CI on every docs page in both themes, with zero serious or critical issues allowed. A keyboard-only walkthrough of the home page, one guide, and search is in `docs/qa/DOCS_REVIEW.md`.

### 5.4b Reader journey (storyboard)
| Step | Reader does | Reader feels | What supports it |
|---|---|---|---|
| 1 | Lands on the docs home from the app or search | Unsure: "is this for me?" | Two plain paths, the warm headline, the DAO term one line down |
| 2 | Picks "I'm starting a tribe" | Committed but wary of jargon | An ordered path with a time estimate per guide; concepts linked inline, never required first |
| 3 | Follows "Create a tribe" with the app open | Focused | Each step's shot matches their theme and device; one action per step; the outcome named |
| 4 | Signs a transaction | A spike of risk | "What happens on chain" states fees, waits, and who can see it, before the step, never after |
| 5 | Waits for voting to open | Impatient | Exact durations from the generated limits; "what you can do while you wait" links |
| 6 | First proposal executes | Pride, and some ownership | The guide ends on the tribe's own page in the shot, the brass seat of "yours", and a Next link |
| 5-year | Comes back to look something up | Expects the same place | Stable URLs, a changelog, and screenshots re-captured each release |

### 5.4a Docs states (decision 2A)
| Surface | Loading | Empty / none | Error | Notes |
|---|---|---|---|---|
| Search (⌘K dialog) | Results appear as you type, with no spinner (static index) | "No pages match "…". Try the glossary, or one of these:" then 3 popular guides | Index failed to load: "Search isn't available right now. Browse the guides instead." with a link to Guides | Opens instantly; Escape closes |
| 404 | n/a | "This page has moved or never existed." with both paths (joining or starting) and a search field | n/a | Same chrome as every page |
| Screenshot | A fixed-aspect placeholder in the `raised` token, with no shimmer, so there is no layout shift | Missing image: the frame shows "Screenshot coming" in muted text; the step text stays complete on its own | A stale image (manifest commit older than the docs release) fails `pnpm docs:check` and never ships | Every step must read correctly with no image |
| Mobile nav sheet | n/a | n/a | n/a | Opens at the current section, current page marked; closes on navigation |
| Theme | The boot script sets the theme before paint, so there is no flash | n/a | Cookie unreadable: falls back to localStorage, then System | |

### 5.5 One source for terms
`packages/glossary` holds each term's plain definition, its DAO term, and a link slug. The app's `GlossaryTerm`, the docs glossary, and the guide tooltips all read it, so the copy can't drift.

### 5.6 Screenshot capture pipeline
- **The showcase tribe.** A dedicated testnet tribe (working name "Lamplight", §11 Q7) with designed art and believable members, proposals, and auctions. The suite creates and advances it, so every screenshot is a real state.
- **Capture.** `pnpm docs:capture` runs Playwright capture specs, one per guide step, each with an id like `create/identity/01`.
  - Every image is taken at desktop and mobile × light and dark.
  - The app's own theme is set through `builder.warm-ink.theme.v1` before load, so each image is the app in that theme, never a recolouring.
  - Before capture, the spec waits for fonts, settled network, and no animations (reduced motion forced on, then a frame wait).
- **Output.**
  - Files go to `apps/docs/public/shots/<id>/{desktop,mobile}-{light,dark}.webp`, with a `manifest.json` holding the app commit, testnet ledger, capture time, and viewport.
  - **Device match (decision 7A).** Readers under 768px see the mobile capture; tablet and desktop readers see desktop. Each figure has a quiet "Show desktop / Show mobile" toggle, a two-option SegmentedControl that remembers the choice for the session.
  - The docs `<Shot id>` component renders a `<picture>` that follows the docs theme, `data-theme` first and then `prefers-color-scheme`.
  - Any image whose manifest commit is older than the release it documents is flagged in review.
- **Markers (decision 3A).**
  - Each capture spec names its target locator. The manifest stores that element's bounding box per variant, as fractions of the image.
  - `<Shot>` draws a 2px `signal` ring, at the control radius plus 4px, and a numbered marker (a 20px disc in `signal` with `on-primary` digits) over the untouched image. The overlay follows the docs theme.
  - The marker has text for assistive technology: "Step 2: the New proposal button".
  - A box that falls outside the image fails capture.
- **Privacy.** Only testnet test identities appear. Personal data is never typed. Wallet addresses are test addresses, and an allowlist check fails capture on any address it doesn't know.

## 6. Copy and media review (double-checked)
Every page passes two independent checks before merge:
1. **Copy.**
   - The DESIGN.md voice: sentence case, no em dashes in UI copy, no "simply" or "just", the DAO term one line beneath, and exact authority language.
   - British English and the Oxford comma, per `AGENTS.md`.
   - Terms match `packages/glossary`.
   - Numbers, limits, and timings come from the generated reference, never hand-typed.
   - Lint: Vale with a house style package (`docs/style/`) for voice rules, plus a script that flags em dashes and banned words.
2. **Facts.** A reviewer runs the guide's steps on testnet, or checks the walkthrough spec that already does, and ticks each step.
3. **Media.** Each screenshot is checked against its step's text:
   - its manifest commit is current;
   - the theme pair is present;
   - the alt text describes the state, not the picture;
   - no unknown addresses appear;
   - no stale copy is visible in the image.
4. **A sign-off table** per page lives in `docs/qa/DOCS_REVIEW.md`, recording the reviewer, date, app commit, and result.

## 7. Process and reproducibility
New documents. Each is a runbook with exact commands.

| Doc | Covers |
|---|---|
| `docs/qa/WALKTHROUGHS.md` | Run the suite locally, against a preview, or resume a run; identities; costs; how to add a flow |
| `docs/qa/BUG_LEDGER.md` | Ledger format, severity, triage cadence, closure rules |
| `docs/qa/THEME_AUDIT.md` | Matrix, checks, baseline update procedure |
| `docs/qa/DOCS_REVIEW.md` | Copy, fact, and media checklists, and sign-offs |
| `docs/DOCS_SITE.md` | Docs app architecture, content model, generated reference, capture pipeline, deploy |
| `docs/AGENT_WORKFLOW.md` | New commands: `pnpm e2e`, `pnpm e2e:tour`, `pnpm docs:capture`, `pnpm docs:check`, and which agent owns what |

Every run writes a dated report (`apps/e2e/reports/`) with the app commit, network, run id, and results, so runs can be compared over time.

## 8. MIDAO alignment
This section comes from a page-by-page read of docs.midao.org (about 35 pages, on 2026-11-18), compared with `lib/legal-export/bundle.ts`, `components/admin/legal-export.tsx`, and `docs/LEGAL_EXPORT.md`. MIDAO publishes no API and doesn't mention Stellar anywhere. Its onboarding portal fields aren't public.

### 8.1 What MIDAO requires (source pages under docs.midao.org)

| Topic | Rule | Page |
|---|---|---|
| Process | Service agreement and fee, then the onboarding portal, then an operating agreement template, then KYC/KYB and a Beneficial Owner Information Report (BOIR), then three formation documents: FIBL, Certificate of Formation, and Form 1 (Representative Agent), then the Registrar. Takes 21 to 28 days. | `/rmi-dao-llc-registration-and-compliance/registration-process` |
| Name | Must end in "DAO LLC". The optional space is between the project name and "DAO LLC" ("MIDAO LLC" or "MI DAO LLC"). A name can be reserved for $1,000 for 6 months. A DBA is allowed. | `/…/naming-your-dao-llc-and-dba-doing-business-as` |
| Operating agreement template | Picks a profile on four choices: for-profit or non-profit; membership on paper or on a blockchain; one member one vote or one token one vote; governance by smart contract or elsewhere. Also: purpose, any multisig committee, managing members, and initial contributions. The agreement overrides the contracts. On-chain votes count as amendment evidence. | `/dao-llc-structuring/dao-llc-operating-agreements-and-amendments`, `/use-of-smart-contracts` |
| Beneficial ownership | Category A is anyone who *owns* 25% or more of the governance rights. If there's no one in A, B is every manager. If there are no managers, C is any member. C members are *not* beneficial owners, but are still reported and KYC'd. A company that qualifies goes through KYB with a look-through to its owners. KYC is renewed every year. | `/…/kyc-kyb-and-beneficial-ownership-reporting`, `/entities-as-members-or-subsidiaries` |
| Entity type | Non-profit (a good-works purpose, no distributions, tax-free) or for-profit (3% gross revenue tax). **The choice can't be converted later.** | `/dao-llc-structuring/non-profit-vs.-for-profit` |
| Fees and annual filing | Registration costs $9,500, or $3,000 under $250k of treasury plus funding. The annual fee is $2k, $3k, or $5k by treasury tier, due 31 January. The annual filing includes the BOIR and the operating agreement. | `/midao-pricing-and-services/…`, `/…/annual-filings` |
| Members and managers | No minimum number of members. Managers are optional, though banks expect them. Don't present contracts as live before they are. | `/dao-llc-structuring/members-membership-interests-managing-members` |

### 8.2 Gaps and changes (one PR, bundle schema v2)

| # | Our current behaviour | Change |
|---|---|---|
| M1 | **Bug.** `LEGAL_NAME_RE = /\bDAO ?LLC$/i` rejects "MIDAO LLC" and accepts "DAOLLC" | Change it to `/DAO LLC$/i`, and fix the hint and `LEGAL_EXPORT.md` |
| M2 | Category A uses delegated voting power | Report shares by token *ownership* (undelegated balance) as the main basis, with voting power as a second figure, and state the denominator |
| M3 | Category C appears under beneficial owners | Say C members aren't beneficial owners, but still need KYC and the BOIR |
| M4 | Treats owners as plain addresses | Mark each owner as an account (G…) or a contract (C…), and flag contracts with "entity or contract: confirm KYB" |
| M5 | No operating agreement profile | Add an `operatingAgreementProfile` block with: blockchain membership, one token one vote, smart-contract governance, and governance by proposal only, with no multisig committee |
| M6 | "Undecided" entity type with no warning | Warn that the choice is permanent. A non-profit asks for its good-works purpose category. |
| M7 | "Management: Algorithmic" | Replace with "governance delegated to the smart contracts, under the operating agreement" |
| M8 | No Representative Agent | Add an optional nominee, or a note that MIDAO requires one (Form 1) |
| M9 | No initial contributions | Add an optional exhibit, with the Treasury address prefilled plus domains, socials, and IP |
| M10 | No fee-tier input | Add an optional USD estimate of treasury plus funding |
| M11 | For-profit needs nothing extra | Add a profit-allocation note and a "US members?" yes/no (Form 8832) |
| M12 | A pending tribe's contracts read as live | Label them "deployed, not yet live" |
| M13 | Cites MIDAO only generically | Link each rule to its exact source page |

The deck and the MIDAO team update use the wording "space optional" and present our reading of Category A as MIDAO's rule. Both get corrected, wherever they state the rule, in the same change.

### 8.3 Questions for MIDAO
1. What fields does the onboarding portal ask for? Can a bundle be attached?
2. For Category A: is "owns 25% or more" measured by token balance or by voting power? Against minted or circulating supply? At what date?
3. Does a contract or treasury holding 25% or more trigger KYB, or is it disregarded?
4. For Category C: does one member complete KYC, or all of them?
5. Does the operating agreement need code hashes, versions, and the network beside the addresses? Is a contract upgrade an amendment?
6. Are Stellar and Soroban acceptable for token-tracked membership and smart-contract governance? Can fees be paid in USDC on Stellar?
7. Who can act as the Representative Agent?
8. How should Stellar assets be valued for fee tiers?
9. Would a signed or hashed bundle help, and is there a partner intake path?
10. Is an initial contributions exhibit useful, and in what format?

## 9. CI and costs
- **PR CI is unchanged**, plus the Vitest additions from bug fixes. The suite is too slow and stateful for PR CI.
- **A nightly or manual GitHub workflow** (`workflow_dispatch`) runs the full suite against testnet with funded identities held as repo secrets. The read-only state tour and visual diffs can run on PRs against fixtures if they are cheap enough.
- **Costs.** Testnet XLM through Friendbot is free. The real cost is time: about 1 hour of wall time per full run.

## 10. Risks
- **Testnet resets** wipe tribes. Mitigation: the suite recreates everything from scratch; nothing depends on old state except a resumable run.
- **Goldsky lag or outages** make indexer waits flaky. Mitigation: generous condition timeouts, and a clear "indexer late" failure class instead of a generic timeout.
- **The test wallet diverges from real wallets.** Mitigation: a manual Freighter smoke pass per release, and the module implements the kit's interface exactly.
- **Screenshot churn** makes docs PRs noisy. Mitigation: deterministic data (the showcase tribe), with fonts, time, and animations frozen.
- **Scope.** About 20 flows, around 60 docs pages, and roughly 240 images per capture. Mitigation: the phased exits in §2, and docs pages ship by area.

## 11. Open questions (answer before P1)
1. **Wallet approach.** Do you accept a test-only E2E Wallet module in the app build (flag-gated and stripped from production), or must the suite drive a real extension such as Freighter, which is slower and flakier?
2. **Network.** Testnet with the real indexer, as recommended? Or invest in a local network plus a local indexer for speed? The local path is weeks of work.
3. **Responsive depth.** Is "chain flows once per run, full rotation weekly, plus a state tour at every viewport × theme" enough? Or must every chain flow run at every viewport on every run, which is about six times the time?
4. **Docs stack.** A custom Next.js MDX site on the shared Panda preset (recommended, brand-exact), or Fumadocs or Starlight (faster, needs re-skinning)?
5. **Docs domain and hosting.** `docs.tribes.build` on Vercel under the same team as the app?
6. **Bug tracking.** A markdown ledger in the repo, or GitHub issues with a `walkthrough` label? Issues are better for assignment; the ledger is better for agents.
7. **The showcase tribe.** Name, art, and believable members: do you have art or a brief, or should we design a small trait set?
8. **Audience scope.** Should the docs cover the platform operator page and NQG (coming), or stay member and founder only for v1?
9. **OG cards.** Keep share cards Dusk-only in both themes, as designed?
10. **Upgrades flow (W16).** Do you have an operator-approved upgrade path on testnet for the walkthrough, or should the suite register a test implementation through the platform admin key?
11. **The nightly workflow.** Can we add funded testnet secrets to GitHub Actions, or should the suite run only from a maintainer's machine?

## 12. Decisions log
| Date | Decision | By |
|---|---|---|
| 2026-11-18 | Plan drafted | Claude |
| 2026-11-18 | Q1: a test-only E2E Wallet module, flag-gated with a production build assertion, plus one manual Freighter smoke pass per release | User |
| 2026-11-18 | E1: a separate testnet e2e Manager with its own indexer pipeline and deployment id | User |
| 2026-11-19 | E1 revised: walkthroughs run on the dev deployment (dev.tribes.build's Manager, pipeline, and database) instead of a separate e2e Manager; walkthrough tribes are prefixed `E2E ` | User |
| 2026-11-18 | Q4: the docs are a custom Next.js MDX site on a Panda preset shared with the app | User |
| 2026-11-18 | Q3: hybrid responsive coverage. Chain flows run at desktop on each run, with a full mobile and tablet rotation weekly. The state and form tour covers 3 viewports × 2 themes. | User |
| 2026-11-18 | Defaults, pending override: E2 signs in-process through `exposeBinding`; E3 uses a shared theme cookie on `.tribes.build`; Q5 hosts the docs on Vercel at docs.tribes.build; Q6 keeps a ledger in the repo plus GitHub issues for P0 and P1; Q7 the showcase art is designed by us; Q8 covers members and founders, with a short operator page and NQG shown as coming; Q9 keeps share cards Dusk-only; Q10 registers a test implementation with the platform admin key; Q11 puts funded testnet secrets in GitHub Actions | Claude, stated to the user |

## 13. Engineering review (/plan-eng-review, 2026-11-18)

Target: this plan. Scope Challenge: the complexity gate trips (one new workspace, a new docs app, two new packages, and a test wallet module), so the arrangement goes to the decisions in §11 and §13.6. Evidence is static reads of the current repo; nothing here was built.

### 13.1 Architecture
- **[P1] (confidence 9/10) `packages/goldsky/pipelines/builder-stellar-events.yaml:41`.** The indexer is wired to a single Manager: `WHERE contract_id = 'CCLBJAC5…72ZD'`. Tribes the suite creates under that Manager appear in the public testnet Discover, Marketplace, and the platform page. A separate e2e Manager would not be indexed at all unless we add a second pipeline. **Decision E1.**
- **[P1] (8/10) Testnet has to run `dev`'s contracts.** #76 changes the Manager, the Governor, and the bindings. A walkthrough against an older testnet Manager tests the wrong code. **Add:** a preflight that compares the on-chain `wasm_hash` of the Manager and the current implementations against `stellar contract build` output, and refuses to run on a mismatch. Add a runbook step for upgrading testnet to `dev`.
- **[P2] (8/10) A smaller signer arrangement.** Instead of a signer service on 127.0.0.1, Playwright's `page.exposeBinding('__e2eSign', …)` can sign inside the test process. That means no port, no extra process, and the secrets never reach the browser. Stellar Wallets Kit 2.6 supports custom modules (`ModuleInterface` in `esm/types/mod.d.ts`). **Decision E2.**
- **[P2] (9/10) §5.1 claims the theme carries from app to docs, but localStorage is per origin.** `docs.tribes.build` can't read the key `tribes.build` set. The fix is a `theme` cookie on `.tribes.build`, written by both sites, with the localStorage key kept as a fallback. Otherwise drop the claim. **Decision E3.**
- **[P1] (8/10) Parallel timelines collide on sequence numbers.** Two flows submitting from one account at the same time fail with `tx_bad_seq`. **Add:** one funded identity per concurrent timeline (founder, member, and bidder accounts per tribe), and a per-account lock in the signer.

### 13.2 Code quality
- **[P2] (8/10)** Moving the Panda preset into `packages/design-tokens` touches every web build. It lands as its own PR before any docs work, and is proven a no-op by the state tour's visual baselines: zero pixel diffs on the `/design` catalogue in both themes.
- **[P2] (9/10)** `scripts/local-up.mjs:51` writes `http://localhost:8000/soroban/rpc`, while `apps/web/src/config/networks.ts:37` uses `http://localhost:8000/rpc`. This is the first bug-ledger entry. It isn't on the walkthrough path (testnet), but local dev hits it.
- **[P3] (7/10)** The generated reference pages (limits, errors, actions, addresses) need small generators with tests that fail when the source changes shape. Otherwise the docs drift quietly.
- **[P2] (8/10)** The production strip check for the E2E Wallet should be a build assertion: grep `.next` for the module id and fail. A comment saying it's stripped isn't enough.

### 13.3 Tests
```
FLOWS (W01-W20)                         STATE TOUR / VISUAL
[+] chain flows on testnet               [+] every reached state x 3 viewports x 2 themes
  ├── [GAP→E2E] all of W01-W20 (new)       ├── [GAP] URL replay cannot reach transient
  ├── [GAP] signer per-account lock        │   states (open sheets, confirm dialogs,
  └── [GAP] preflight wasm-hash check      │   unknown confirmation): use per-state
                                           │   "drive to" helpers, not URLs
[+] E2E Wallet module                      ├── [GAP] dynamic regions (times, balances,
  ├── [GAP unit] reject path, auth entry   │   countdowns) must be masked or frozen
  └── [GAP build] absent from prod build   └── [GAP] axe + contrast per combination
[+] docs generators (limits/errors/...)  [+] capture pipeline
  └── [GAP unit] shape-change tests          └── [GAP] unknown-address allowlist test
COVERAGE: 0 of about 30 new paths (all proposed) | the existing Vitest, contract e2e and script e2e are untouched
```
Every proposed test carries the plan's purpose: each catches a real regression in a user flow, the release build, or the docs' accuracy.

### 13.4 Performance
- **[P2] (7/10)** A full run is about 1 hour of wall time, with about 240 images per capture. Capture runs on read-only states after the chain flows, in parallel by viewport.
- **[P2] (6/10, medium confidence)** Indexer lag on testnet is unknown under load. Measure it in P1 and set the wait timeouts from the measurement, not a guess.

### 13.5 Failure modes
| Path | Realistic failure | Handling |
|---|---|---|
| Chain flow | Testnet reset mid-run | Resumable state detects missing contracts and restarts that timeline |
| Indexer wait | Goldsky down | A distinct "indexer late" failure class, never a generic timeout |
| Signer | Concurrent submits from one account | A per-account lock (added above) |
| Capture | A stale image ships | Manifest commit check in docs review |
| Prod build | The E2E Wallet leaks into production | Build assertion (added above). **Critical without it.** |

### 13.6 Engineering decisions (asked with §11)
- **E1.** How walkthrough tribes stay out of public testnet listings.
- **E2.** The in-process signer through `exposeBinding` versus a localhost signer service.
- **E3.** A shared theme cookie on `.tribes.build`, or no carryover between the app and the docs.

### 13.7 Not in scope
A local indexer; mainnet runs; automating real extension wallets beyond the one manual smoke pass per release; a video tutorial pipeline.

### 13.8 What already exists
- `scripts/e2e-testnet.mjs`: its phases, resumable state, and identities are a reference for the Playwright fixtures.
- `contracts/e2e`: contract-level coverage stays as it is.
- The `/design` catalogue is the visual baseline sheet.
- `components/help/glossary.tsx` is the seed content for `packages/glossary`.
- `lib/warm-ink-theme.ts` and `components/warm-ink-theme.tsx` are the theme runtime the docs reuse.

### 13.9 Parallel lanes
| Step | Modules | Depends on |
|---|---|---|
| Panda preset extraction | `apps/web` config, `packages/design-tokens` | None |
| Harness and E2E Wallet | `apps/e2e`, `apps/web/src/lib/wallet-kit.ts` | E1, E2 |
| Docs scaffold | `apps/docs`, `packages/glossary` | Preset extraction |
| MIDAO v2 | `apps/web/src/lib/legal-export`, `docs/LEGAL_EXPORT.md` | None |

Lane A runs the preset extraction, then the docs scaffold. Lane B runs the harness. Lane C runs MIDAO v2. Lanes A and B touch different modules; both reach the web app, but in different files.

Outside voice: Codex is not installed, so no outside review ran. This is missing coverage.

## 14. Design review (/plan-design-review, 2026-11-18)

No mockups: the gstack designer has no OpenAI key configured, so this review is text only. No outside design voices ran (Codex is not installed).

| Pass | Before | After | Change, and what's still missing |
|---|---|---|---|
| 1. Information architecture | 6 | 9 | 1A: the home page is a Read-mode index with two paths. Missing: a per-guide time estimate, to be measured in P7 |
| 2. States | 4 | 9 | 2A: states table for search, 404, screenshots, nav sheet, and theme |
| 3. Journey | 7 | 9 | Storyboard added (§5.4b) |
| 4. AI slop | 7 | 9 | 3A: markers drawn by the docs. Hard rejections: none. Litmus: brand in the first screen yes; one anchor (headline plus two paths) yes; scannable yes; one job per section yes; cards not used; motion limited to sheets and dialogs; nothing relies on shadows |
| 5. Design system | 7 | 9 | 4A: 17px docs body. 5A: browser surfaces, proposed as shared DESIGN.md tokens |
| 6. Responsive and accessibility | 6 | 9 | 6A: full accessibility spec. 7A: screenshots match the device |
| 7. Unresolved | n/a | n/a | 8A: app theme pass rules for art tiles and wallet-modal sync. No open design decisions remain |

Overall: 6/10 before, 9/10 after. It isn't a 10 because none of it has been seen as pixels: no mockups exist. The first docs preview build (P5) is the visual check, reviewed in both themes at 3 viewports.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | not run (user excluded) | n/a |
| Outside Review | codex | Independent 2nd opinion | 0 | unavailable (codex not installed) | n/a |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | issues_open | 12 issues, 1 critical gap; E1, Q1, Q3, and Q4 decided, other defaults stated |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | clean | score: 6/10 → 9/10, 8 decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | not run (user excluded) | n/a |

- **OUTSIDE COVERAGE:** codex unavailable for eng and design; design mockups unavailable (no OpenAI key).
- **VERDICT:** DESIGN CLEARED. The eng review has its key decisions answered; E2, E3, and Q5 to Q11 run on stated defaults until you override them.

**UNRESOLVED DECISIONS:**
- E2, E3, and Q5 to Q11 are on defaults stated to the user and need confirmation or an override
