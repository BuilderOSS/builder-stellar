# Repository agent instructions

The rules in `CLAUDE.md` apply to every coding agent, not only Claude Code. Follow it,
`DESIGN.md`, and `docs/AGENT_WORKFLOW.md`. Use British English and the Oxford comma in
authored English prose. The short version of the `CLAUDE.md` rules:

- **Branches.** Branch from `dev` and open every pull request against `dev`. `main` is what
  tribes.build runs and moves only by a release promotion (one `dev` → `main` pull request,
  from a release plan, when the user asks). Never commit or push to `main`, never rebase
  `dev` onto it, and never open any other pull request into it.
- **Docs ship with the change.** A code change and the documentation it affects merge in the
  same pull request, never later. Every PR description has a **Docs** line: the pages
  updated, or "None affected" with the reason.
- **Design system.** Read `DESIGN.md` before visual or UI work, and build UI only as the
  Design system section of `CLAUDE.md` describes.

## Documentation placeholders before production

When the user mentions production, prod, rollout, release, go-live, launch
readiness, finalisation, finalization, or equivalent preparation, proactively
check tracked source and maintained documentation for unresolved documentation
placeholders. Follow the check in `docs/AGENT_WORKFLOW.md`.

Report each unresolved documentation link with its source path, current value,
user-facing location, and the final URL or owner decision needed. Distinguish
intentional examples from unfinished documentation. Do not claim readiness while
silently retaining a placeholder, and do not invent a replacement destination.

`ARTWORK_GUIDE_URL` in `apps/web/src/lib/help-links.ts` was the artwork guide
placeholder. It now points to the artwork guide on the docs site
(https://docs.tribes.build/guides/setup/artwork/), as `docs/AGENT_WORKFLOW.md` records.
The check must work from tracked source, even when local feedback records are
absent or Git-ignored.
