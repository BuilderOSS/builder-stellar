---
# gstack: design-md-format=spec
name: Builder
description: A cozy, lamplit clubhouse for communities that own things together. Warm neutrals, one confident blue, brass for what's yours.
colors:
  # Dark is the hero theme. Light values are in the Colors table below.
  canvas: "#15120F"
  surface: "#1D1915"
  raised: "#26211C"
  hover: "#2E2822"
  rule: "#3A322A"
  text: "#F3EDE5"
  text-muted: "#B6AA9C"
  text-faint: "#857A6D"
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

# Builder

## Overview

**Creative North Star:** Warm Ink · Dusk. A lamplit clubhouse: warm charcoal and paper, one confident blue for "act here", brass for "this is yours". Community art and people carry the personality; chrome stays quiet.

**Product context:** Discover, create and govern NFT-membership DAOs on Stellar: auctions, proposals, treasury, marketplace, claims. Members come first, founders and admins second. Users may be new to wallets and DAOs.

**Mode per surface:** Operate on every app screen. Persuade on the signed-out Home hero only.

**Memorable thing:** "Our community, our rules, our treasury." Every screen shows whose it is and what you can do in it.

**Lineage:** Builder is built on Nouns Builder. Give it a subtle nod (a noggles-inspired detail in the mark, the 404, the footer credit "Built on Nouns Builder"), never a theme.

**Reference:** `docs/design/builder-dusk-preview.html` renders the system on real screens in both themes.

## Colors

**Strategy:** Restrained. One blue, warm neutrals, brass. No per-module hues; personality comes from each community's art and crest tint.

**Light or dark:** Dark is the hero (evening, phone in hand, community use). Light is a fully supported equal. First visit defaults to Dark; Light, Dark and System stay selectable.

| Token | Dark | Light | Use |
|---|---|---|---|
| canvas | #15120F | #F3EFE8 | page background |
| surface | #1D1915 | #FBF8F3 | cards, bars, sheets |
| raised | #26211C | #FFFFFF | inputs, choice tiles, popovers |
| hover | #2E2822 | #F1ECE4 | hover and pressed fills, neutral chips |
| rule | #3A322A | #DDD6CB | dividers, input edges |
| text | #F3EDE5 | #221E19 | primary text |
| text-muted | #B6AA9C | #5E564C | secondary text (AA on surface) |
| text-faint | #857A6D | #8E8578 | decoration only, never text under 18px |
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

- **Bricolage Grotesque** (optical sizes 12-96, weights 500-800) is the community's voice: page titles, community names, hero numbers. The signed-out hero may go to 800.
- **Figtree** (400-700) does all interface work.
- **JetBrains Mono** (400-500, tabular figures) holds anything you might copy or compare: addresses, ids, amounts, hashes.

Scale: 12 / 13 / 15 / 17 / 20 / 24 / 32 / 40 / 48. Headings differ from body by size, not only weight. No italics for emphasis. No uppercase tracked kickers above headings.

## Layout

Mobile first. Breakpoints: sm 480, md 768 (rail replaces tab bar), lg 1024, xl 1280 (context panel appears). Components respond with container queries; pages respond with breakpoints. Content max width 1120px. Gutter `clamp(16px, 4vw, 40px)`. Rail 72px. Tab bar 64px plus safe area.

### Navigation

- Outside a community: Home, Discover, Market, You. "Start a DAO" is an action, not a tab.
- Inside a community: Home, Vote, [slot 3], Treasury, More. Slot 3 shows Auction when the community runs auctions, else Market when its marketplace is enabled, else Members.
- Mobile shows a bottom tab bar. From md the same destinations become a left icon rail with tooltips, and Members and Manage get their own rail items.
- The community switcher lives in the top bar on every screen.

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
- **The one authored moment:** your vote lands. The tally bar fills to the new split and your brass avatar drops into the voters row (420ms ease-out).

## Voice

Warm, plain, specific. Say "Vote", "Treasury", "Members", "Your membership". Explain consequences: "2,400 XLM moves to mira.xlm after a 2-day safety delay." Name the outcome on buttons: "Cast 3 votes For", "Place 200 XLM bid". Sentence case. No em dashes in UI copy. Communities are "communities" in copy; "DAO" is the technical noun.

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
