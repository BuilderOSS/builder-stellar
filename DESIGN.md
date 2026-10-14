---
# gstack: design-md-format=spec
name: Tribes Builder
description: A cozy, lamplit clubhouse for tribes that own things together. Warm neutrals, one confident blue, brass for what's yours.
colors:
  # Dark is the hero theme. Light values are in the Colors table below.
  canvas: "#141311"
  surface: "#1C1A18"
  raised: "#252220"
  hover: "#2D2A27"
  rule: "#393530"
  text: "#F3EDE5"
  text-muted: "#B3ABA1"
  text-faint: "#847C72"
  signal: "#0085FF"
  primary: "#0070E0"
  primary-hover: "#0062C4"
  on-primary: "#FFFFFF"
  brass: "#D9A35A"
  success: "#4FBA8B"
  warning: "#E2A94F"
  error: "#EF7B87"
typography:
  display:
    fontFamily: Bricolage Grotesque
    fontWeight: 700
    fontSize: "clamp(2rem, 5vw, 3rem)"
    letterSpacing: "-0.02em"
  title:
    fontFamily: Bricolage Grotesque
    fontWeight: 600
    fontSize: 1.5rem
    letterSpacing: "-0.015em"
  body:
    fontFamily: Figtree
    fontSize: 0.9375rem
    lineHeight: 1.5
  label:
    fontFamily: Figtree
    fontWeight: 600
    fontSize: 0.8125rem
  mono:
    fontFamily: JetBrains Mono
    fontFeature: tnum
rounded:
  sm: 6px
  control: 10px
  card: 16px
  sheet: 24px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  2xl: 32px
  3xl: 48px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.control}"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  input:
    backgroundColor: "{colors.raised}"
    borderColor: "{colors.rule}"
    rounded: "{rounded.control}"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
  nav-item-active:
    textColor: "{colors.signal}"
---

# Tribes Builder

## Overview

**Creative North Star:** Warm Ink · Dusk. A lamplit clubhouse: warm charcoal and paper, one confident blue for "act here", brass for "this is yours". Each tribe's art and people carry the personality; chrome stays quiet.

**Product context:** Tribes Builder (tribes.build) lets people discover, build and run tribes: NFT-membership DAOs on Stellar with auctions, proposals, a treasury, a marketplace and claims. Members come first, founders and admins second. Many users are new to wallets and DAOs; crypto natives who know Nouns are the second audience.

**Mode per surface:** Operate on every app screen. Persuade on the signed-out Home hero only.

**Memorable thing:** "Build a tribe." Your people, your rules, your treasury. Every screen shows whose it is and what you can do in it.

**Lineage:** Tribes Builder is built on Nouns Builder. Give it a subtle nod (the Nouns lens is the table in the mark, the 404, the footer credit "Built by Builder DAO", linking to Builder DAO on nouns.build), never a theme.

**Reference:** `docs/design/builder-dusk-preview.html` renders the system on real screens in both themes.

## Brand and Logo

**Name:** Tribes Builder, at tribes.build. Use the full name in titles and search metadata; never "Builder" or "Tribes" alone (the home-screen label, the manifest `short_name`, is the one exception). "Built by Builder DAO" credits Builder DAO, not the product.

**Wordmark:** "Tribes" in Bricolage Grotesque 700 with "Builder" at 500 in `ink.muted` (`BrandWordmark`). The lockup is the mark plus the wordmark (`BrandLockup`).

**The mark, "the lens is the table":** three round heads sit around a single Nouns lens, and the seat nearest the viewer is empty, saved for you. When you join, the seat fills in brass. Newcomers see people at a table; Nouns folks see the lens.

Construction, on a 32-unit grid (viewBox `0 0 32 32`):

- Table: `M9 9h14v14H9zM11 11v10h5V11z`, even-odd: a square frame with an open left half and a filled right half.
- Heads: r 3.25 at (16, 3.75), (28.25, 16) and (3.75, 16).
- Empty seat (default): a ring at (16, 28.25), r 3, stroke 1.5. Joined seat: a disc at (16, 28.25), r 3.75, in brass.
- The 16px drawing (`app/icon.svg`) is its own: table 6x6 at (5, 5) with a 2x4 hole at (6, 6); heads r 2 at (8, 2), (14, 8) and (2, 8); a seat ring r 1.5, stroke 1, at (8, 14). Every edge sits on whole pixels so it stays crisp.

| Use | Version | Rule |
|---|---|---|
| Favicon, app bar, docs, lockup | Master, flat blue, empty seat | Flat only. Below 32px use the 16px drawing. |
| Home screen, PWA, social avatars | Dusk tile, brass seat | The gradient lives on the tile only. The glyph stays flat. |
| Your profile, your tribes, your share images | Brass seat or brass glow | Only where the viewer has joined. Brass always means "yours". |
| Anywhere at 16 to 24px | Master, flat | Never a gradient glyph. It turns to mud at small sizes. |
| Share cards | Paper mark on the Dusk gradient | Empty seat, except on a member's card, where their tokens get a brass ring. |

**Logo colours:**

| Part | Light | Dark | Token |
|---|---|---|---|
| Mark | #0068D6 | #0085FF | `signal` |
| Joined seat | #9A6A22 | #D9A35A | `brass` |
| "Tribes" | #221E19 | #F3EDE5 | `ink` |
| "Builder" | #5E564C | #B3ABA1 | `ink.muted` |
| Dusk tile | #10213F, #143F86 at 60%, #2F6FD1, top to bottom | same | icon files only |
| Glyph on the tile | #F3EDE5, seat #D9A35A | same | icon files only |
| One colour | ink #221E19 or paper #F3EDE5 | | press kit |

The mark uses `signal`, not `primary`: it says "here", it isn't a filled button. Components colour it with tokens only; raw hex lives only in icon files (`app/icon.svg`, `lib/brand-tile.tsx`) because browser chrome and image generation can't read CSS variables.

**Clear space and size:** one head's diameter on every side. The minimum size is 16px, using the 16px drawing.

**Don'ts:** don't recolour the people, rotate the lens, add the noggle arm or bridge, put a gradient on the glyph, use brass for anything that isn't the viewer's own, or ship the mark without the lens table and the seat. No tribal imagery: patterns, feathers, masks or totems.

**Where it lives:** `components/shell/brand-mark.tsx` (`BrandMark` with `joined`, `BrandWordmark`, `BrandLockup`, `BuilderDaoCredit`), `app/icon.svg`, `lib/brand-tile.tsx` (the Dusk tile behind `app/apple-icon.tsx` and the `app/manifest.ts` icons), and the press kit in `docs/brand/`.

## Colors

**Strategy:** Restrained. One blue, warm neutrals, brass. No per-module hues; personality comes from each tribe's art and crest tint.

**Light or dark:** Dark is the hero (evening, phone in hand, with your people). Light is a fully supported equal. First visit defaults to Dark; Light, Dark and System stay selectable.

| Token | Dark | Light | Use |
|---|---|---|---|
| canvas | #141311 | #F3EFE8 | page background |
| surface | #1C1A18 | #FBF8F3 | cards, bars, sheets |
| raised | #252220 | #FFFFFF | inputs, choice tiles, popovers |
| hover | #2D2A27 | #F1ECE4 | hover and pressed fills, neutral chips |
| rule | #393530 | #DDD6CB | dividers, input edges |
| text | #F3EDE5 | #221E19 | primary text |
| text-muted | #B3ABA1 | #5E564C | secondary text (AA on surface) |
| text-faint | #847C72 | #8E8578 | decoration only, never text under 18px |
| signal | #0085FF | #0068D6 | active nav, focus ring, links, selection, live state |
| primary | #0070E0 | #0068D6 | filled button background (white text passes AA) |
| primary-hover | #0062C4 | #0059B8 | filled button hover |
| brass | #D9A35A | #9A6A22 | "yours": your tokens, your vote, your winning bid, membership |
| success / For | #4FBA8B | #2E7A57 | positive state, For votes |
| warning | #E2A94F | #8F5A12 | caution |
| error / Against | #EF7B87 | #B23A48 | errors, Against votes, destructive |

Abstain uses `text-faint` and is always labelled. Washes and edges derive from tokens with `color-mix(in srgb, <token> 10-12%, transparent)`. Components never contain raw hex values.

Why two blues: `#0085FF` reads beautifully on dark surfaces (5.5:1) but white text on it only reaches 3.6:1. Filled buttons use the deeper `primary` so labels pass AA; everything else that signals "here" uses `signal`.

## Typography

- **Bricolage Grotesque** (optical sizes 12-96, weights 500-800) is the tribe's voice: page titles, tribe names, hero numbers. The signed-out hero may go to 800.
- **Figtree** (400-700) does all interface work.
- **JetBrains Mono** (400-500, tabular figures) holds anything you might copy or compare: addresses, ids, amounts, hashes.

Scale: 12 / 13 / 15 / 17 / 20 / 24 / 32 / 40 / 48. Headings differ from body by size, not only weight. No italics for emphasis. No uppercase tracked kickers above headings.

## Layout

Mobile first. Breakpoints: sm 480, md 768 (rail replaces tab bar), lg 1024, xl 1280 (context panel appears). Components respond with container queries; pages respond with breakpoints. Content max width 1120px. Gutter `clamp(16px, 4vw, 40px)`. Rail 72px. Tab bar 64px plus safe area.

### Navigation

- Outside a tribe: Home, Discover, Market, You. "Build a tribe" is an action, not a tab.
- Inside a tribe: Home, Proposals, [slot 3], Treasury, More. Slot 3 shows Auction when the tribe runs auctions, else Market when its marketplace is enabled, else Members.
- Mobile shows a bottom tab bar. From md the same destinations become a left icon rail, and Members and Manage get their own rail items. On a deliberate hover (pointer devices, 120ms intent delay) or keyboard focus, the rail widens over the page to 232px and shows labels; it never reflows content and never opens on tap.
- The tribe switcher lives in the top bar on every screen.

### Density rules

1. Under md the top bar holds at most three items: switcher (truncates), one icon action, avatar. Network shows as a dot on the avatar; a mismatch becomes a full-width banner, never a chip.
2. A page's primary action never sits in the top bar under md. It goes in the sticky action bar above the tab bar.
3. Under a 560px container, button labels collapse to icon plus `aria-label`. They never wrap.
4. Choice groups with three or more options stack as full-width 52px rows under a 480px container.
5. One row of chips at most on mobile; overflow becomes "+N".
6. Tables become stacked list rows under md.
7. No horizontal page scroll at 320px.

## Elevation & Depth

Surfaces separate by tone first (canvas, then surface, then raised), then one soft offset shadow for floating layers: sheets, popovers, toasts. Borders are for structure only: dividers, inputs, selected state. No glows and no zero-offset halos. Images get a 1px outline: black at 10% in light, white at 10% in dark.

## Shapes

control 10, card 16, sheet 24, chips and avatars full. Nested radii are concentric: inner radius = outer radius minus padding. Never put a card inside a card; use a list row or a divider.

## Components

All primitives live in `apps/web/src/components/ui` and are styled with Panda recipes over Ark UI. Every component handles default, hover, focus-visible, active, disabled, loading, empty and error. The dev-only `/design` route renders each one in both themes.

- **Actions:** Button (primary, secondary, ghost, danger), IconButton, ConfirmAction, ActionBar.
- **Surfaces:** Card, ListRow, Section, PageHeader, Sheet, Dialog, Popover, Tooltip, Menu, Disclosure.
- **Inputs:** Field, Input, Textarea, Select, AmountInput, DurationInput, Checkbox, Switch, ChoiceGroup, SegmentedControl, SearchInput, FilterRail.
- **Feedback:** Callout, Toast, Skeleton, EmptyState, ErrorState, Spinner, ProgressSteps.
- **Identity and data:** CommunityCard, Avatar, Crest, Address, Amount, Countdown, Chip, StatusBadge, VoteTally, MembershipCard, Pagination, DataList.
- **Help for newcomers** (`components/help`, `components/shell/wallet-intro.tsx`): `WhatsATribe` (a Sheet from the home hero and footer), `WalletIntro` (before the first Connect, once per browser, reopened from the You sheet) and `GlossaryTerm` (a Popover, so it works on touch) for Treasury, Proposal, Delegate, Quorum, Launch admin and Safety delay. Each explains in plain words with the DAO term beneath.
- **Share cards** (`lib/og`): one 1200x630 `next/og` card on the Dusk gradient, with an `opengraph-image.tsx` beside each shared route. Satori reads inline styles only, so these files take colours from `lib/brand-colors.ts` instead of Panda tokens.

## Do's and Don'ts

- Do: one filled primary button per view.
- Do: pair every status colour with a label or icon (votes, states, network).
- Do: keep technical data (contract ids, transaction hashes, ledgers) inside "Technical details" disclosures or the `Address` component.
- Do: use brass only for things the viewer owns or did.
- Do: write durations as "2d 4h", never raw seconds; show amounts with units and grouping.
- Don't: raw hex, inline `style={{}}`, CSS modules, `<style jsx>`, or new global classes in components.
- Don't: cards in cards, coloured left borders, icon-in-circle decoration, gradient buttons, kickers above headings, emoji in UI.
- Don't: block reading behind a network mismatch. Block only transactions.
- Don't: say "world", "lobby", "envelope", "nonce", "SAC" or "ledger" in member-facing copy.

## Motion

- **Approach:** intentional.
- **Easing:** `--ease-out cubic-bezier(.23,1,.32,1)` for enter and press, `--ease-in-out cubic-bezier(.77,0,.175,1)` for on-screen movement, `--ease-drawer cubic-bezier(.32,.72,0,1)` for sheets.
- **Press:** `scale(.96)` over 160ms on every pressable. Hover effects only under `(hover: hover) and (pointer: fine)`.
- **Duration:** colour and opacity 150ms or less; popovers and tooltips 150-200ms from their trigger; sheets 240ms in, 180ms out; toasts 300ms.
- Never animate keyboard-initiated actions or the first page load. Use transitions, not keyframes, for interruptible UI. Theme switches suppress transitions.
- Reduced motion drops movement and keeps opacity and colour changes.
- **Two authored moments, and only two:**
  - **Your vote lands.** The tally bar fills to the new split and your brass avatar drops into the voters row (420ms ease-out).
  - **Your seat fills.** Used only when someone joins a tribe: the mark's empty seat ring fades out while a brass disc grows from 60% to full size over 420ms with `--ease-out`, and shrinks back in 200ms. Only transform and opacity animate. With reduced motion it only fades.

## Voice

Warm, plain, specific. Say "Proposals", "Treasury", "Members", "Your membership". A proposal is what members vote on; "vote" is the act, never the page. Explain consequences: "2,400 XLM moves to mira.xlm after a 2-day safety delay." Name the outcome on buttons: "Cast 3 votes For", "Place 200 XLM bid". Sentence case, contractions, no exclamation marks, no "simply" or "just". No em dashes in UI copy.

The voice is a warm host: plain words first, the DAO term one line beneath.

- **Tribes are tribes in copy; DAO sits one line beneath.** Name a group "tribe" everywhere: Your tribes, Find a tribe, Build a tribe, Switch tribe. Crypto natives find the DAO term on a quiet line under the plain one: the home supporting line ("A DAO on Stellar: shared treasury, onchain votes, NFT membership."), the Members subtitle ("Each membership is an NFT with one vote."), the Treasury subtitle and the footer ("Tribes Builder · DAOs on Stellar · Built by Builder DAO").
- Savings circles are "circles", "groups" or "savers", never tribes.
- Never call a real group of people a tribe in marketing.
- Code identifiers (`CommunityCard`, `components/community`) keep their names; only visible copy says tribe.

Authority language is correctness, not style, and stays exact:

- Before launch: **Launch admin**, **Setup**, and direct configuration transactions.
- After launch: **Requires DAO governance**, not unilateral administrator power.
- Queue and execute: any wallet can submit once a proposal is eligible; it pays fees.
- **Local draft** does not mean deployed, shared or approved.
- Keep wallet review, submission, confirmation and indexed visibility distinct. Signing alone is not "submitted". An unknown confirmation is a recovery state, not a failure.

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-10-10 | Warm Ink · Dusk system created | /design-consultation: newcomer audience, dark hero, #0085FF signal, First Draft navigation patterns |
| 2026-10-10 | Art-first community cards, subtle Nouns nod, no module hues | nouns.build review: community art is the strongest brand asset; chrome stays restrained |
| 2026-10-10 | Create a DAO is one long form with sections, not a stepper | Everything is visible and editable in one pass; an "On this page" outline (lg+) shows progress and jumps between sections; Create validates the whole form and focuses the first problem |
| 2026-10-10 | Rail expands on hover with labels; marketplace private labels removed | Labels beat tooltips for newcomers; private labels added a field per card with no trading value |
| 2026-10-10 | Create asks for a DAO type, not numbers | Membership is four join types (Daily auction, Auction + resale, Fixed-price sales, Invite only); Voting is a pace (Super fast on testnet, Fast, Balanced, Deliberate). Numbers live in Advanced settings and can all change later by vote. ChoiceGroup gains a card variant for these picks |
| 2026-10-10 | Launch setup is its own page with real step status | /dao/[id]/setup lists required steps (artwork, founder tokens, a free link) with live done/to-do status, optional reviews, then launch with consequences and a confirm. Manage marks what launch needs and links back. Artwork lives only in Manage |
| 2026-10-10 | Community profile in Manage; everything the DAO owns is changeable | Name, symbol, image, description and website in one place (direct in setup, one proposal after launch). Token 0.2.0 makes renames visible; treasury-held tokens can be given by vote. Artwork keeps only layers and the renderer |
| 2026-10-12 | Dark neutrals lose some yellow; warmth stays | UX walkthrough: menus and sign-in read too yellow in Dark. Canvas, surface, raised, hover, rules and muted text keep a warm hue at about half the chroma. Light theme and blue unchanged |
| 2026-10-14 | Renamed to Tribes Builder on tribes.build; "tribe" names a group | A plain, warm noun for people with a purpose; "Builder" alone was generic and crowded. Full name in titles and metadata. The footer keeps "Built by Builder DAO" |
| 2026-10-14 | Voice: a warm host, plain words first, the DAO term one line beneath | Newcomers lead; crypto natives still find NFT membership, onchain votes and the treasury one line down. Savings circles stay "circles" |
| 2026-10-14 | Logo: the lens is the table | Three people around a Nouns lens, with an empty seat that turns brass when you join. Flat blue (`signal`) is the master, the Dusk tile is the app icon, no gradient on the glyph, and a dedicated 16px drawing |
| 2026-10-14 | Brass on the Dusk tile is #D9A35A in both themes | It already stands out on deep blue, so no new token |
| 2026-10-14 | Terms, privacy and the disclaimer are rewritten in the brand voice | Each opens with "The short version", then numbered sections that match what the code does. Builder DAO is the operator, the governing law stays generic, and Discord is the contact |
| 2026-10-14 | Brass in the light theme stays the `brass` token (#9A6A22), on the logo too | It passes 3:1 on paper and keeps one meaning for brass; no logo-only brass |
| 2026-10-14 | The seat fill is the second authored motion moment, only when someone joins | It is the brand's own moment ("your seat"); used anywhere else it would stop meaning "you're in" |
| 2026-10-14 | tribes.build is the only public origin; the old vercel.app host's pages redirect permanently | Old share links keep working. Its /api and /images stay up for testnet tribes whose on-chain renderer and image still point there |
| 2026-10-14 | Signed-out home: one primary (Build a tribe), "How it works" in three steps, an "Under the hood" strip | A newcomer can say what a tribe is in five seconds; a Nouns builder can see it's a real DAO after one scroll. No audit or mainnet claims |
| 2026-10-14 | Newcomer help lives in place: a "What's a tribe?" sheet, a wallet intro before the first Connect, glossary popovers | Explains wallets, signing and DAO words at the moment they come up, without a tour |
| 2026-10-14 | Share cards for every page on the Dusk gradient, with a brand-card fallback | Links shared in WhatsApp, X and Discord show the tribe, proposal or auction; a broken data source still shows the brand |
