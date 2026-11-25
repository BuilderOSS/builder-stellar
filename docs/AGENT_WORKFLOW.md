# Agent workflow

This repository provides the same project-scoped agent roster to OpenCode and Claude
Code. OpenCode definitions live in `.opencode/agent/`; Claude Code definitions live in
`.claude/agents/`. They divide ownership across the contract, indexing, database,
services, frontend, design, and documentation surfaces so changes follow the same path
as the product data: contract event to indexer to read model to API to UI.

## Branches

`dev` is where all work lands, and it deploys to dev.tribes.build. `main` is what tribes.build
runs: it holds the last promoted release and moves only by a **release promotion**. Release 1
(21 November 2026, #114) was the first.

- Start work from an up-to-date `dev`: `git fetch origin && git switch -c <branch> origin/dev`.
- Open every pull request against `dev`: `gh pr create --base dev`. Stacked pull
  requests target the branch below them, with the bottom of the stack on `dev`.
- Never commit or push to `main`, never rebase `dev` onto `main`, and never open a pull
  request into `main` except a release promotion. If a tool defaults to `main`, change the
  base to `dev`.
- A fix that tribes.build needs lands on `dev` first and reaches `main` with the next
  promotion. There are no pull requests from other branches into `main`.
- When this section changes, update the matching notes in `CLAUDE.md` and `AGENTS.md`.

### Release promotion

Only when the user asks for a release, and only from a written plan
(`docs/plans/release-main-<n>.md`; release 1 is the worked example):

1. Plan what ships: contract releases (`docs/CONTRACT_UPGRADES.md`), database migrations,
   the pipeline (`packages/goldsky/prod.env`), and Vercel variables on `builder-stellar-web`.
2. Rehearse contract upgrades on a copy of production, then run the production steps in the
   plan's order. Each outward-facing step needs the user's go-ahead when it runs.
3. Open one pull request from `dev` into `main`. `main` requires one approving review, so it
   is merged by a reviewer or by the user's admin merge, never by an agent alone.
4. Verify the production build's log ("Web deployment set to manager:CCLBJAC5…"), smoke-test
   www.tribes.build, and record the release in the plan and `deploys/release-<n>/`.

## Roles

| Agent | Ownership | Required handoff |
| --- | --- | --- |
| `contract-writer` | `contracts/**`, contract tests, bindings, deployment bridge | Event and interface impacts to indexer, services, and docs |
| `contract-reviewer` | Read-only Soroban security and correctness review | Findings to the contract writer |
| `indexer-events` | `packages/goldsky/**` and event-to-read-model coverage | Schema work to database and API work to services |
| `database-engineer` | SQL migrations, roles, grants, views, and query performance | Ingestion changes to indexer and read contracts to services |
| `frontend-services` | API routes, server data access, bindings, and client query hooks | Public data contracts to frontend and docs |
| `ui-ux-designer` | Read-only UX direction and acceptance criteria | Design specification to frontend builder |
| `frontend-builder` | Pages, components, client state, and UI integration | Missing data or interface requirements to services |
| `docs-steward` | Documentation maintenance and official-source research | Verified interface documentation from every domain owner |

`contract-writer` owns Rust contract source. `frontend-services` may update generated
TypeScript bindings and adapters, but must hand Rust changes back to the contract owner.
The web application remains read-only against the PostgreSQL read model; Goldsky owns
ingestion through its writer role.

## Commands

In OpenCode, use the project commands in `.opencode/command/` to start work with the right
ownership and guardrails (OpenCode also has project skills in `.opencode/skills/`):

- `/contract-change <task>` implements a contract change and records downstream impacts.
- `/contract-review <scope>` performs an independent read-only contract review.
- `/event-sync-audit <scope>` traces events through Goldsky, PostgreSQL, API, and UI.
- `/data-model-change <task>` applies a read-model change with isolation checks.
- `/frontend-feature <task>` implements a UI feature against documented service contracts.
- `/docs <task>` retrieves official references or reconciles documentation.

In Claude Code, invoke the same specialist with `@agent-<name>`, for example
`@agent-contract-reviewer review the governor authorisation change`. Claude Code also
routes to agents from natural-language requests using their descriptions.

## Required checks

Run the relevant checks before handing work to another agent:

| Surface | Checks |
| --- | --- |
| Contract | `pnpm contracts:test`, `cargo fmt --all --check`, and Clippy as CI runs it (`.github/workflows/ci.yml`) |
| Indexer | `pnpm indexer:test`, then pipeline generation or validation when affected |
| Scripts | `node --test scripts/*.test.mjs` |
| Walkthrough harness | `pnpm --dir apps/e2e typecheck` and `test` |
| Frontend | `pnpm lint`, `pnpm typecheck`, `pnpm --dir apps/web test`, and `pnpm build` as applicable |
| Docs site | `pnpm --dir apps/docs lint`, `typecheck`, and `test`, then `pnpm docs:build` and `pnpm docs:check` (see `docs/DOCS_SITE.md`) |
| Docs screenshots | `pnpm --dir apps/e2e build:capture`, then the capture story on testnet (`docs/qa/SHOWCASE_TRIBE.md`, "Capturing") |
| Database | `pnpm db:test` (with `TEST_DATABASE_URL` for the database tests), plus forward migration, rollback, permission, and query-plan evidence |

Checks are requirements, not a claim of a passing run. Current CI (`.github/workflows/ci.yml`)
has four jobs:

- **Rust Checks and Tests:** `cargo fmt`, Clippy, `stellar contract build --locked`, and the
  Cargo workspace tests.
- **TypeScript Checks:** web codegen, then web lint and type check, the design tokens and
  glossary type checks, docs lint, type check, and tests, web tests, Goldsky tests, the
  walkthrough harness, the script tests, and `pnpm db:test` against a Postgres service.
- **Build Web:** `pnpm build`, then the docs site build and `pnpm docs:check` on every docs
  page in both themes.
- **Secret Scan:** gitleaks over the whole history.

CodeQL runs in its own workflow, and the Contract release build workflow rebuilds release
tags (`docs/REPRODUCIBLE_BUILDS.md`). CI uses Node 24 LTS from `.nvmrc` and the Rust
toolchain from `rust-toolchain.toml`, runs Cargo with `--locked`, and installs dependencies
on every run. Configuration changes belong to implementation owners, not docs-steward.

## Docs ship with the change

A change and the documentation it affects land in the same pull request. Docs never trail
code into a later PR, because a merged change with stale docs is what users read the moment
`dev` deploys.

Before opening a PR, check each surface the change can touch and update it in the same branch:

| Change | Update |
| --- | --- |
| What a user sees or does: copy, a flow, a button, an error | The guide and reference pages in `apps/docs/content` that describe it. Search for the old wording |
| A visible screen in a captured flow | Retake the affected shots (`docs/qa/SHOWCASE_TRIBE.md`), or name them under "Docs" in the PR if testnet can't take them now |
| Contract interface, limits, errors, or events | `apps/docs/content/reference/*`, plus the internal docs that cite them (`docs/CONTRACT_UPGRADES.md`, `docs/STORAGE_DIET.md`, and so on) |
| API routes, views, indexer, or deployment | `docs/*` runbooks (`DEV_DEPLOYMENT.md`, `GOLDSKY_SETUP.md`, `MONITORING.md`) |
| A walkthrough, fixture, or how they run | `docs/qa/WALKTHROUGHS.md`; a defect also goes in `docs/qa/BUG_LEDGER.md` |
| Design primitives or tokens | `DESIGN.md` |
| Finished or new work items | `TODOS.md` |

Every PR description has a **Docs** line: the pages updated, or "None affected" with the reason
(for example, a test-only change). A reviewer treats a missing or unexplained Docs line as a
blocking finding. When a change makes a doc wrong and you can't fix it in the same PR, don't
merge it: fix the doc first.

## Documentation handoff and acceptance

After an accepted interface change, send docs-steward the changed behaviour, source
paths and revision, checks actually run with their outcomes, configuration and deployment
impact, and remaining limitations. The contract writer reviews protocol facts, services
review API and ABI behaviour, database and indexer review projections, and frontend and
design review UX.

Before marking docs current:

- Commands must exist with correct arguments and working directory; JSON examples and
  relative links must be valid. Label generation, signing, deployment, and reset side effects.
- Treasury/Governor references must match vector ABI, permissionless queue/execute,
  exact action encoding, atomicity, and scoped ordered execution events.
- Creation, Setup, and launch docs must distinguish chain confirmation, simulation,
  local recovery, and indexing. Contract limits must not be confused with CLI budgets.
- View, Prisma, and API fields and timestamp units must agree, with deployment, DAO, and
  module filters and chain or indexed state sources explicit.
- TTL docs must link actual storage policies and distinguish extension, restoration,
  signed maintenance, and unavailable/missing reports.
- UX guides must describe reachable implemented flows. Local drafts, home and other
  preferences, and marketplace favourites are not shared collaboration, public tags, or
  writable app tables.
- The binding generator preserves existing authored READMEs when the SDK overwrites a
  package; direct SDK invocations do not. Reconcile interface descriptions after generation.
- Retired plans are removed from `docs/` (git history keeps them); link readers to the
  maintained replacement from [the index](README.md).

Useful evidence: `contracts/e2e/src/test.rs`, Goldsky contract-alignment and read-model
tests, web creation, recovery, and store tests, proposal ABI, state, and receipt tests, and
marketplace scope and preparation tests. Live or scratch-database tests and network
rehearsals require their own approved environment; do not claim them from source inspection.

Event, schema, and API work must retain both deployment and DAO identity filters. An
event is not complete until it is indexed and exposed, explicitly indexed but internal,
or explicitly excluded with a reason.

## Documentation placeholders before production

Treat requests mentioning production, prod, rollout, release, go-live, launch
readiness, finalisation, finalization, or equivalent preparation as a trigger to
check for unresolved documentation placeholders. Read repository instructions and
search maintained source and documentation for placeholder links, `example.com`
documentation URLs, and comments marking documentation as pending. Inspect each
match so sample data and intentional examples are not reported as unfinished work.

Report each unresolved item with its source path, current value, user-facing
surface, and the final URL or owner decision needed. Flag these items before
claiming readiness, and ask for missing authoritative destinations rather than
inventing links. Recheck after replacements. Local ignored feedback records are
useful context when available, but the check must work from tracked source alone.

`ARTWORK_GUIDE_URL` in `apps/web/src/lib/help-links.ts` points to the artwork
guide on the docs site (https://docs.tribes.build/guides/setup/artwork/). New
documentation links in the app use `docsHref()` (`apps/web/src/lib/site.ts`) with a page path
that `apps/docs/src/lib/nav.ts` lists.

## Optional vendor skills

The agent definitions use the following vendor skills when they are installed locally:

- Stellar: `smart-contracts`, `dapp`, and `data` from `stellar/stellar-dev-skill`.
- Goldsky: `turbo-builder`, `turbo-pipelines`, `turbo-transforms`, `turbo-doctor`, and
  `datasets` from `goldsky-io/goldsky-agent`.
- Vercel: `vercel-react-best-practices`, `vercel-composition-patterns`,
  `web-design-guidelines`, and `writing-guidelines` from `vercel-labs/agent-skills`.

Install only the skills needed for the local workflow. These assets are intentionally
ignored by Git because they are third-party copies:

```bash
npx skills add https://github.com/stellar/stellar-dev-skill --skill smart-contracts --copy
npx skills add https://github.com/goldsky-io/goldsky-agent --skill turbo-builder --copy
npx skills add https://github.com/vercel-labs/agent-skills --skill vercel-react-best-practices --copy
```

Use `npx skills add <repository> --list` to review the available skills before adding
more. Restart OpenCode after changing agents, commands, skills, or configuration.
Restart Claude Code after changing agents or skills.
