# Agent Workflow

This repository provides project-scoped OpenCode agents in `.opencode/agent/`.
They divide ownership across the contract, indexing, database, services, frontend,
design, and documentation surfaces so changes follow the same path as the product
data: contract event to indexer to read model to API to UI.

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

Use the project commands to start work with the right ownership and guardrails:

- `/contract-change <task>` implements a contract change and records downstream impacts.
- `/contract-review <scope>` performs an independent read-only contract review.
- `/event-sync-audit <scope>` traces events through Goldsky, PostgreSQL, API, and UI.
- `/data-model-change <task>` applies a read-model change with isolation checks.
- `/frontend-feature <task>` implements a UI feature against documented service contracts.
- `/docs <task>` retrieves official references or reconciles documentation.

## Required Checks

Run the relevant checks before handing work to another agent:

| Surface | Checks |
| --- | --- |
| Contract | `pnpm contracts:test`, `cargo fmt --all --check` |
| Indexer | `pnpm indexer:test`, then pipeline generation or validation when affected |
| Frontend | `pnpm lint`, `pnpm typecheck`, `pnpm --dir apps/web test`, and `pnpm build` as applicable |
| Database | Forward migration, rollback, permission, and query-plan evidence |

Event, schema, and API work must retain both deployment and DAO identity filters. An
event is not complete until it is indexed and exposed, explicitly indexed but internal,
or explicitly excluded with a reason.

## Optional Vendor Skills

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
