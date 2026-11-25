# The showcase tribe: Lamplight

Every screenshot on docs.tribes.build comes from one example tribe on the dev deployment (Stellar testnet,
dev.tribes.build), so the guides read as one story, from creating the tribe to its tenth proposal
(plan `docs/plans/walkthroughs-and-docs.md` §5.6, decision 7). This page is its creative brief and its
script. The capture specs in `apps/e2e/capture/` follow the script; see "Capturing" below.

## The idea

**Lamplight is a circle of lantern makers who decide, one small proposal at a time, what to make and
light next.**

- **Insight.** Readers of DAO guides want to picture their own group running this way. The usual
  examples, a joke collection or "Example DAO", show features but not people deciding things together.
- **Why lanterns.** People make and hang paper lanterns in many cultures, so no one region owns the
  image. A lantern is one person's work and shows up best alongside others, which is how a tribe works.
  The art is warm light on paper and suits both themes: it glows in dark mode and looks like paper in light.
- **Tone.** Every proposal is small, concrete, and easy to follow: buy paper, run a workshop, set a fee.
  No proposal is about price or returns.

Discarded directions:

- **A community garden or library.** These are the obvious picks, and other docs use them.
- **A night market.** Too commercial, and it pulls the marketplace pages towards trading.
- **A stargazing club.** It has nothing to show as a token, and it clashes with the light theme.

## Identity

| Field | Value |
|---|---|
| Name | Lamplight |
| Symbol | LAMP |
| Link | `lamplight` (dev.tribes.build/lamplight) |
| Description | Lamplight is a circle of lantern makers. Each member holds a lantern token, and each token is one vote. Together we decide what to make, which workshops to run and how to use the shared treasury. This is an example tribe on Stellar testnet, used in the Tribe Builder guides. |
| Links | Guides: https://docs.tribes.build |
| Image | `apps/e2e/fixtures/showcase/art` composite: dusk, amber, round, steady, tassel |

No other domains are linked, so the example never points at a real site.

## Artwork

Drawn by `apps/e2e/fixtures/showcase/make-art.mjs` (SVG to 720px PNG, CC0, ours). There are five layers
in stacking order, giving 5 × 5 × 4 × 4 × 4 = 1,600 combinations.

| Layer | Traits |
|---|---|
| `0-backdrop` | dusk, ink, paper, moss, clay |
| `1-glow` | amber, rose, teal, indigo, saffron |
| `2-lantern` | round, faceted, tall, bell |
| `3-flame` | steady, tall, twin, ember |
| `4-detail` | plain, tassel, beads, handle |

## Members

Only testnet test identities appear (timeline `show`, keys `e2e-show-*`). They have no personal names.
Roles appear only in proposal text.

| Identity | Role | Tokens |
|---|---|---|
| `e2e-show-founder` | The founder. Creates, sets up, and launches the tribe, writes proposal 1, and votes on, queues, and executes every proposal. | 3 founder tokens |
| `e2e-show-member-a` | The workshop lead. Wins the first auction, writes the other proposals, sells on the market, and gives a lantern away. | 2 founder tokens, the first auction, and a mint |
| `e2e-show-member-b` | A new member. Buys their first lantern on the market and delegates their vote. | One bought, one minted |
| `e2e-show-operator` | A second account. Settles the first auction and receives a lantern. | One received |

## Settings

- **Membership:** Auction + resale, open membership, and claim lists on. The create-form shots show
  Daily auction and Balanced first, as the guides describe, before the story picks its own settings.
- **Voting:** token-weighted, at the Super fast testnet pace: votes open after 5 minutes, run for 10,
  and a passed proposal waits 5 more. Quorum 1% and 1 vote to propose, until proposal 7 changes them.
- **Auction:** 5-minute auctions from a 1 XLM starting price, until proposal 2 sets 10 XLM.
- **Market:** proposal 6 sets the resale fee to 2%.

## The ten proposals

They are numbered in story order. Each one names the guide pages it illustrates.

The state key is the name in `fixtures/showcase/state.json`.

| # | Key | Title | Actions | End state | Guides |
|---|---|---|---|---|---|
| 1 | `workshop` | Fund the first lantern workshop | Pay 150 XLM to the workshop lead | Executed | proposals/write, vote, queue-and-execute |
| 2 | `auction` | Lower the auction starting price | Pause, set 10 XLM, resume | Executed | manage/auction, auctions/settings |
| 3 | `mint` | Mint two lanterns for the workshop helpers | Mint 1 to the workshop lead and 1 to the new member | Executed | manage/token |
| 4 | `fee` | Set the resale fee to 2% | Change the fee | Executed | manage/marketplace |
| 5 | `rules` | Raise the quorum to 15% | Quorum 15%, safety delay 6 minutes | Executed | manage/governance |
| 6 | `profile` | Update the circle's profile | Update the profile (the rename is shown, then undone) | Executed | manage/profile |
| 7 | `pool` | Open a quick-buy pool for new makers | Open a pool and allow it to mint | Executed | marketplace/pools |
| 8 | `purchase` | Keep lantern #N for the shared collection | Treasury buys a listed token | Executed | marketplace/treasury-purchases |
| 9 | `cancel` | Buy paper for the lantern walk | Pay 40 XLM | Cancelled by the proposer | proposals/cancel |
| 10 to 12 | `walk` | Hold an evening lantern walk | Pay 60 XLM to the workshop lead | Open for votes (the latest) | home |

The action-picker tour in proposals/actions is a draft that is never submitted. Testnet stalled twice
during the first run, and both times the walk's ten-minute vote closed unseen, so it was proposed
again with one more sentence of reason (identical text makes the same proposal id). Spec 08 does that
by itself. The home shot shows whichever one is open.

Each proposal's reason is two or three plain sentences. For example, proposal 1: "We would like to run a
first workshop where members make their own lanterns. This pays the workshop lead for paper, frames
and candles for twelve people. Anything left over stays with the workshop lead for the next session."

## Sibling tribes

Three states can't happen in Lamplight's own story, so each gets a sibling tribe with the same art.
They use their own test keys (timeline `showb`) and state files.

| Tribe | Shows | Spec |
|---|---|---|
| Lamplight Paper Studio | A launch drive that reaches its goal (setup/assurance-drives), and the create panel shots | `10-drives` |
| Lamplight Lantern Walk | A launch drive that fails, so a member takes back their 30 XLM (claims/refund) | `10-drives` |
| Lamplight Workshop Guests | A free claim list of 7 tokens, 5 of them for the new member (claims/create, claims/claim) | `11-claims` |

```bash
E2E_TIMELINE=showb E2E_SKIP_PREFLIGHT=1 pnpm --dir apps/e2e capture capture/10-drives.capture.ts capture/11-claims.capture.ts
```

## Capturing

```bash
pnpm --dir apps/e2e build:capture                 # once: the capture build, with real IPFS uploads
node apps/e2e/fixtures/showcase/make-art.mjs      # only if the art changes
node apps/e2e/fixtures/showcase/pin-art.mjs       # pins the art folder, records its CID
E2E_SKIP_PREFLIGHT=1 pnpm --dir apps/e2e capture capture/90-drive.capture.ts   # the founder, in its own terminal
bash apps/e2e/scripts/capture-story.sh            # the story, in order
```

- **The build.** `E2E_CAPTURE=1` builds into `apps/web/.next-capture` with uploads on. It needs
  `PINATA_JWT` and `NEXT_PUBLIC_PINATA_GATEWAY` in `apps/e2e/.env.local` (gitignored). The gateway is
  `gateway.pinata.cloud`, because the dedicated gateway refuses files this key pinned.
- **The art.** The folder upload asks the server for a short-lived Pinata key, and this key can't
  make one. `pin-art.mjs` pins the same folder from Node, and the spec answers the browser's upload
  with that CID. The app's own pin check still runs. The tribe image goes through the normal
  upload.
- **Two processes.** A proposal's vote is open for only 10 minutes, so the founder votes, queues, and
  executes from `90-drive` while the story keeps drafting as the workshop lead. They sign from
  different accounts.
- **Resuming.** `fixtures/showcase/state.json` records each step, and `drive-state.json` records the
  driver's. Each spec skips what is done, so the story can be run again from where it stopped. A
  fresh story needs a new slug (a launched one is claimed for good) and a state file removed.
- **Shots.** `snap` (`apps/e2e/src/capture.ts`) photographs the page as it is at desktop and mobile,
  in light and dark, by resizing the same page and switching the theme the app's own way. It waits
  for loading placeholders to clear and hides toasts. A full account address that isn't a test key,
  the platform key, or an asset issuer fails the capture.
- **Retakes.** `13-retakes` photographs pages again without changing anything on chain (with
  `E2E_TIMELINE=showb` for the siblings' pages).
- **The server.** Run `pnpm --dir apps/e2e serve:app` with `E2E_CAPTURE=1 E2E_APP_PORT=4545` in its own
  terminal for a long run; otherwise the spec that started it stops it when it ends.

## Not captured

These figures are taken out of the guides; the steps read without them. Add a `<Shot>` back when its
state can be made:

| Shot | Why it can't be captured now |
|---|---|
| auctions/bid/04, auctions/settle/03, start/first-10-minutes/02 | They show the wallet's own window. The capture build signs through the test wallet, which has none. |
| auctions/refunds/01 to 03 | With XLM the Auction pays an outbid bidder back at once; it holds a refund only when that payment fails, which a test account can't arrange. |
| setup/contracts/01, 03, 04 | They need a newer release than the platform offers. Lamplight's setup had no Contract upgrades row. |
| setup/artwork/04 | A second artwork batch needs more than 30 traits; the lanterns have 22. |
| setup/slug/04 | It needs another tribe to launch first with the same link. |
| platform/operators/01 | Needs attention appears only when something does; nothing did. |
| platform/operators/03 | Renewal actions show only to the platform admin wallet. |
