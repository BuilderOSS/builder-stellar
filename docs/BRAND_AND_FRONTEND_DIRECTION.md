# Brand and frontend direction

Tribe Builder, at [tribes.build](https://tribes.build), is where people build and run tribes: independent DAOs on Stellar with a shared treasury, NFT membership and onchain votes. Platform discovery and local preparation belong outside the tribe workspace; inside it, governance and Treasury authority must remain explicit.

[DESIGN.md](../DESIGN.md) is the specification ("Warm Ink · Dusk"): brand and logo, tokens, type, navigation, density rules, motion and voice. This page is the short version, plus the frontend boundaries that copy must respect.

## Who it's for

First, people in the Stellar ecosystem and organizers new to crypto who already have people and a purpose. Second, crypto natives who know Nouns and want a fast, cheap DAO. The savings circle isn't ready, so it doesn't lead the story.

## Voice

A warm host: plain, kind, specific, quietly confident.

- **Plain word first, the DAO term one line beneath.** "Members", then "Each membership is an NFT with one vote." The home hero says "Build a tribe." and then "A DAO on Stellar: shared treasury, onchain votes, NFT membership."
- **A group is a tribe.** Your tribes, Find a tribe, Build a tribe, Switch tribe. Savings circles are circles, groups or savers, never tribes. Never call a real group of people a tribe in marketing.
- **Say what will happen before it happens**, and name the outcome on buttons: "Place 200 XLM bid", not "Submit".
- Sentence case, contractions, no exclamation marks, no "simply" or "just", no em dashes in UI copy.
- **Help sits where the question comes up:** the "What's a tribe?" sheet (home hero and footer), the wallet intro before the first Connect (reopened from the You sheet), and glossary popovers for Treasury, Proposal, Delegate, Quorum, Launch admin and Safety delay.

## Logo

"The lens is the table": three round heads around a single Nouns lens, with the seat nearest the viewer left empty for you. When you join, the seat fills in brass. Newcomers see people at a table; Nouns folks see the lens.

- **Master:** flat blue (`signal`), empty seat. Favicon, app bar, docs and the lockup. Below 32px, use the dedicated 16px drawing.
- **Dusk tile:** the app icon, home screen and social avatars. The gradient lives on the tile only; the glyph stays flat in paper with a brass seat.
- **Brass seat or brass glow:** only where the viewer has joined: your profile, your tribes, a member's share card.
- **Wordmark:** "Tribe" in Bricolage Grotesque 700, "Builder" at 500 and muted.
- **Don't** recolour the people, rotate the lens, add the noggle arm or bridge, put a gradient on the glyph, or use brass for anything that isn't the viewer's own. No tribal imagery: patterns, feathers, masks or totems.

Files: the [press kit](brand/README.md); in code, `apps/web/src/components/shell/brand-mark.tsx`, `apps/web/src/app/icon.svg` and `apps/web/src/lib/brand-tile.tsx`.

## Colour

One confident blue for actions and "here" (`primary` for filled buttons, `signal` for everything else, including the mark). Brass means "yours" and nothing else: `#9A6A22` in light, `#D9A35A` in dark and on the Dusk tile. Warm neutrals, with dark as the hero theme. The Dusk gradient (`#10213F`, `#143F86` at 60%, `#2F6FD1`) is for the app icon and share cards only, never for buttons or the glyph.

## Share cards

Every page shares as a 1200×630 card on the Dusk gradient, drawn with `next/og` in `apps/web/src/lib/og/`. The card shows the mark, a Bricolage title, status as a word plus a colour, and the tribe's or token's art, with the crest when art can't load. If the data can't load, the card falls back to the brand card. The cards for a tribe, a proposal, an auction, a token and a member each show what makes that link worth opening; see `opengraph-image.tsx` beside each route.

## Current flows

`/create` is one long form with sections: identity, membership, governance, then review. Artwork and founder minting belong to Setup after creation. The local workspace supports multiple drafts, duplication, resumption and guarded deletion. Marketplace favorites are private browser preferences, not public tags.

Marketplace discovery, sale views, approval and escrow selling, purchase, cancellation, expiry recovery and governance preparation are implemented. Proposal detail distinguishes chain state, indexed fallback, successful execution and receipt availability. Read [web behavior](../apps/web/README.md) for boundaries.

Treasury funding, holder controls, paginated members, auction history and paused settlement, and claimant signing use reviewed transaction flows. Allocation draft validation is not proposal submission. Creation uses signed-versus-accepted states and explicit identical-envelope rebroadcast; UI copy must not call signing alone a submitted transaction. Registry review does not upload or approve an upgrade.

## Authority and language

Authority language is correctness, not style, and stays exact:

- Before launch: **Launch admin**, **Setup**, and direct configuration transactions.
- After launch: **Requires DAO governance**, not unilateral administrator power.
- Queue and execute: any wallet can submit when the proposal is eligible; it pays fees.
- Preparation: **Local draft** does not mean deployed, shared or approved.
- Transactions: keep wallet review, submission, confirmation and indexed visibility distinct. An unknown confirmation is a recovery state, not evidence of failure.

The newcomer help explains these ideas; it is not a guided tour, and there is no cross-device collaboration. Document such capabilities only when they're implemented.

A rendered reference of the system lives at [design/builder-dusk-preview.html](design/builder-dusk-preview.html). The [earlier dark/blue design](archive/BRAND_AND_FRONTEND_DIRECTION.md) preserves historical rationale only.
