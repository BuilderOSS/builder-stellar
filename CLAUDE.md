# Tribe Builder (Stellar)

The product is Tribe Builder (tribes.build). In user-facing copy a DAO is a tribe, with the DAO term one line beneath; code identifiers such as `CommunityCard` keep their names. See the Brand and Logo and Voice sections of `DESIGN.md`.

## Design System

Read `DESIGN.md` before visual or UI work: it defines the fonts, colors, spacing, navigation, density rules and voice. Build UI only from `apps/web/src/components/ui` primitives and Panda tokens. No raw hex values, inline `style={{}}`, CSS modules, `<style jsx>` or new global classes in components. Ask before departing from it. When reviewing or QA-ing UI, flag code that doesn't match `DESIGN.md`.

## Production and release preparation

When a user mentions production, prod, rollout, release, go-live, launch readiness,
finalisation, finalization, or equivalent preparation, follow the documentation
placeholder check in `docs/AGENT_WORKFLOW.md`. Proactively report unresolved
documentation links and placeholders, their source locations, and the decisions
needed to replace them. Do not silently carry placeholders into a readiness claim.
