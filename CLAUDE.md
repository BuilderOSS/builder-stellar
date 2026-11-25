# Tribe Builder (Stellar)

The product is Tribe Builder (tribes.build). In user-facing copy a DAO is a tribe, with the DAO term one line beneath; code identifiers such as `CommunityCard` keep their names. See the Brand and Logo and Voice sections of `DESIGN.md`. Write authored English prose in British English with the Oxford comma.

These rules apply to every coding agent; `AGENTS.md` points other agents here and adds the detail of the placeholder check.

## Branches: work on `dev`, `main` moves by release

Branch from `dev` and open every pull request against `dev` (`gh pr create --base dev`).
`main` is what tribes.build runs and moves only by a release promotion: one `dev` → `main`
pull request, run from a release plan when the user asks for a release. Never commit or push
to `main`, never rebase `dev` onto it, and never open any other pull request into it. See
"Branches" and "Release promotion" in `docs/AGENT_WORKFLOW.md`.

## Docs ship with the change

Every code change merges with the documentation it affects, in the same pull request: the
guides and reference in `apps/docs/content`, the runbooks in `docs/`, `DESIGN.md`, `TODOS.md`, and
the QA docs. Every PR description has a **Docs** line naming the pages updated, or "None affected"
with the reason. See "Docs ship with the change" in `docs/AGENT_WORKFLOW.md`.

## Design system

Read `DESIGN.md` before visual or UI work: it defines the fonts, colours, spacing, navigation, density rules, and voice. Build UI only from `apps/web/src/components/ui` primitives and Panda tokens. No raw hex values, inline `style={{}}`, CSS modules, `<style jsx>`, or new global classes in components. Ask before departing from it. When reviewing or QA-ing UI, flag code that doesn't match `DESIGN.md`.

## Production and release preparation

When a user mentions production, prod, rollout, release, go-live, launch readiness,
finalisation, finalization, or equivalent preparation, follow the documentation
placeholder check in `docs/AGENT_WORKFLOW.md`. Proactively report unresolved
documentation links and placeholders, their source locations, and the decisions
needed to replace them. Do not silently carry placeholders into a readiness claim.
