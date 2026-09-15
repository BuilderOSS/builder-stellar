# Mercury Operations

This repo uses Mercury Retroshade programs for indexed read surfaces. Contract execution does not depend on Mercury, but the web app uses Mercury for proposal activity, votes, token inventory, member data, authority history, and program status.

Use `scripts/mercury.mjs` for day-to-day Mercury inspection. It calls the current REST endpoints directly because the local `mercury-cli` list/query paths are stale.

## Environment

The script reads these values from the shell first, then falls back to `apps/web/.env.local`:

- `MERCURY_BASE_URL`
- `MERCURY_JWT`

The JWT is required and is never printed by the script.

The web app also uses these public program values:

- `NEXT_PUBLIC_STELLAR_TOKEN_MERCURY_PROGRAM_ID`
- `NEXT_PUBLIC_STELLAR_GOVERNOR_MERCURY_PROGRAM_ID`
- `NEXT_PUBLIC_STELLAR_TREASURY_MERCURY_PROGRAM_ID`
- `NEXT_PUBLIC_STELLAR_TOKEN_MERCURY_PROJECT`
- `NEXT_PUBLIC_STELLAR_GOVERNOR_MERCURY_PROJECT`
- `NEXT_PUBLIC_STELLAR_TREASURY_MERCURY_PROJECT`

## Common Commands

List all Retroshade programs:

```bash
pnpm mercury:list
```

List all indexed tables:

```bash
pnpm mercury:tables
```

List tables for one program:

```bash
pnpm mercury:tables -- --program 15
pnpm mercury:query -- --program 15 --tables
```

Check one program status:

```bash
pnpm mercury:status -- --program 15
```

Query a table without writing SQL:

```bash
pnpm mercury:query -- --program 15 --table mint_indexed --limit 10
```

The table name can be partial. For example, if program `40` has `program_40_proposal_vote_indexed`, this works:

```bash
pnpm mercury:query -- --program 40 --table proposal_vote --limit 10
```

If a partial table name matches more than one table, the script stops and prints the matching names.

Count rows in a table:

```bash
pnpm mercury:query -- --program 40 --table proposal_vote --count
```

Show the columns available on a table:

```bash
pnpm mercury:query -- --program 40 --describe proposal_vote
```

Select specific columns:

```bash
pnpm mercury:query -- --program 40 --table proposal_vote --columns "ledger,timestamp,transaction" --limit 5
```

Filter rows:

```bash
pnpm mercury:query -- --program 40 --table proposal_vote --where "ledger > 4000000" --limit 20
```

Raw SQL is available as an escape hatch:

```bash
pnpm mercury:query -- --sql "SELECT * FROM retroshade.program_15_mint_indexed LIMIT 5"
```

Add `--json` to any command to print raw JSON:

```bash
pnpm mercury:list -- --json
pnpm mercury:query -- --program 15 --table mint_indexed --limit 5 --json
```

## Cleanup Planning

To plan deleting every program except a keep list:

```bash
pnpm mercury:delete:plan -- --keep 15
```

This command is read-only. It prints:

- programs that would be deleted
- project names
- running state
- indexed contracts
- table count
- row counts per table

No deletion is performed.

Keep multiple programs with a comma-separated list:

```bash
pnpm mercury:delete:plan -- --keep 15,39,40,41
```

## Safety Notes

Deleting a configured Mercury program breaks the web app surfaces that read from that program until the env vars are updated or the program is redeployed.

Before deleting anything in the future, capture these read-only snapshots:

```bash
pnpm mercury:list -- --json
pnpm mercury:tables -- --json
pnpm mercury:status -- --program 15 --json
pnpm mercury:delete:plan -- --keep 15 --json
```

If DAO Mercury programs are deleted, redeploy them with:

```bash
pnpm mercury:deploy:testnet
```

That deployment flow updates `apps/web/.env.local` with the new program IDs and project names.

## Endpoints Used

The utility currently uses these Mercury REST endpoints:

- `GET /retroshade/list`
- `GET /retroshade/tables`
- `GET /retroshade/{program_id}/status`
- `POST /retroshade/query`

The script intentionally does not implement deletion. Add deletion only after confirming the real destructive endpoint and adding a hard confirmation flag.
