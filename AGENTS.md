# Repository agent instructions

Follow `CLAUDE.md`, `DESIGN.md`, and `docs/AGENT_WORKFLOW.md`. Use British English
and the Oxford comma in authored English prose.

## Branches: work on `dev`, `main` moves by release

Branch from `dev` and open every pull request against `dev`. `main` is what
tribes.build runs and moves only by a release promotion (one `dev` → `main` pull
request, from a release plan, when the user asks). Never commit or push to `main`,
and never open any other pull request into it. See `docs/AGENT_WORKFLOW.md`.

## Docs ship with the change

A code change and the documentation it affects merge in the same pull request, never
later. Every PR description has a **Docs** line: the pages updated, or "None affected"
with the reason. See `docs/AGENT_WORKFLOW.md`.

## Documentation placeholders before production

When the user mentions production, prod, rollout, release, go-live, launch
readiness, finalisation, finalization, or equivalent preparation, proactively
check tracked source and maintained documentation for unresolved documentation
placeholders. Follow the check in `docs/AGENT_WORKFLOW.md`.

Report each unresolved documentation link with its source path, current value,
user-facing location, and the final URL or owner decision needed. Distinguish
intentional examples from unfinished documentation. Do not claim readiness while
silently retaining a placeholder, and do not invent a replacement destination.

The current artwork guide placeholder is `ARTWORK_GUIDE_URL` in
`apps/web/src/lib/help-links.ts`. Flag it until the team supplies the final URL.
The check must work from tracked source, even when local feedback records are
absent or Git-ignored.
