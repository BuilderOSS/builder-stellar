# Warm Ink and frontend direction

Builder is a gateway to independent DAO communities. Platform discovery and local preparation belong outside the DAO workspace; inside it, governance and Treasury authority must remain explicit.

## Implemented visual system

- Warm Ink uses warm light surfaces, dark ink surfaces, and restrained green action accents.
- Appearance offers **Light**, **Dark**, and **System**. The saved browser preference is resolved before body paint and follows OS changes in System mode.
- Instrument Serif (normal/italic, weight 400) is loaded for display type; Inter is loaded for interface/body type through `next/font/google` in [layout.tsx](../apps/web/src/app/layout.tsx). Pretendard is not installed or loaded.
- CSS variables in [globals.css](../apps/web/src/app/globals.css) and Panda recipes define surfaces, text, controls, focus, and semantic states. Appearance does not change contract permissions.

Use serif for editorial headings, not dense controls or addresses. Body copy and numeric controls need readable spacing and clear contrast in both themes. Semantic success/warning/error states must be named, not conveyed only by color.

## Current flows

`/create` is a compact Identity → Membership → Governance → Review workspace. Identity starts with image, name, and symbol; Membership adds description and Auction/Marketplace economics. Artwork and founder minting belong to post-creation Setup. There is no separate purpose step.

The local workspace supports multiple drafts, duplication, resumption, and guarded deletion. Home DAO is a browser preference scoped to network/deployment/wallet, not an on-chain role. Marketplace labels/favorites are private browser preferences, not public community tags.

Marketplace discovery, DAO listing/sale views, approval/escrow selling, purchase, cancellation, expiry recovery, and governance preparation are implemented. Proposal detail distinguishes chain state, indexed fallback, successful execution, and receipt availability. Read [web behavior](../apps/web/README.md) for boundaries.

Treasury funding, holder controls, paginated members, auction history/paused
settlement, and claimant signing use reviewed transaction flows. Allocation draft
validation is not proposal submission. Creation uses signed-versus-accepted states
and explicit identical-envelope rebroadcast; UI copy must not call signing alone
a submitted transaction. Registry review does not upload or approve an upgrade.

## Authority and language

- Before launch: **Launch admin**, **Setup**, and direct configuration transactions.
- After launch: **Requires DAO governance**, not unilateral administrator power.
- Queue/execute: any wallet can submit when the proposal is eligible; it pays fees.
- Preparation: **Local draft** does not mean deployed, shared, or approved.
- Transactions: keep wallet review, submission, confirmation, and indexed visibility distinct. Unknown confirmation is a recovery state, not failure evidence.

The current source is not evidence of a complete onboarding tour or cross-device collaboration. Document such capabilities only when implemented. The [earlier dark/blue design](archive/BRAND_AND_FRONTEND_DIRECTION.md) preserves historical rationale but is no longer the visual specification.
