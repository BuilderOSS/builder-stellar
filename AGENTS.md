# Repository agent instructions

Follow `CLAUDE.md`, `DESIGN.md`, and `docs/AGENT_WORKFLOW.md`. Use British English
and the Oxford comma in authored English prose.

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
