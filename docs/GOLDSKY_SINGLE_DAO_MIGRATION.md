# Goldsky Single-DAO Migration

## Status

Migration guide for the current single-DAO app. This doc covers the cutover
from Mercury-backed reads to Goldsky Turbo plus PostgreSQL.

## Goal

- Replace Mercury completely.
- Keep Goldsky as the only indexer.
- Use standard Soroban events only.
- Keep the UI safe by allowing a few direct RPC reads for authoritative checks.

## Current App Scope

The app currently depends on Mercury-backed read surfaces for:

- activity feed
- proposal list/detail
- proposal votes
- token inventory / members
- mint authority history
- governor authority history
- program status

The contract write path already uses Soroban RPC and should stay separate from
indexing.

## Goldsky Shape

Goldsky should ingest:

- the active network's `stellar_<network>.events` dataset
- standard Soroban events only
- no Mercury retroshade payloads

The pipeline should:

1. filter events by the DAO contract IDs
2. decode event topics/data in Turbo TypeScript
3. write raw events into Postgres
4. write normalized domain tables and views into Postgres

## Read Model Mapping

Suggested replacements for the current Mercury helpers:

- `getMercuryActivityFeed` -> `app.activity_feed`
- `getMercuryProposalDetail` -> `app.proposal_detail`
- `getMercuryProposalVotes` -> `governance.proposal_votes` or a votes view
- `getMercuryTokenInventory` -> `token.members` or a token inventory view
- `getMercuryMintAuthorities` -> `token.mint_authorities` or a history view
- `getMercuryGovernorAuthorities` -> `governance.governor_authorities` or a history view
- `getMercuryProgramStatuses` -> Goldsky pipeline health / deployment monitoring, not chain data

## RPC Safety Reads

Goldsky is the single indexer, but the UI can still read a few critical values
directly from RPC for safety:

- proposal state
- proposal snapshot / deadline
- quorum or voting power checks
- current admin or authority checks when needed

These RPC reads are verification only. They should not be required to build the
primary read model.

## Contract Changes

When migrating fully to Goldsky:

- remove the `mercury` feature from the contracts
- stop emitting Mercury-specific custom payloads
- keep standard Soroban events as the only indexing contract surface

That means the Goldsky decoder must rely on the standard event payloads emitted
by the token, governor, treasury, and auction contracts.

## Migration Order

1. Add Goldsky pipeline for standard Soroban events.
2. Build Postgres raw event and normalized tables.
3. Add views for activity, proposals, votes, members, and authorities.
4. Switch server routes from Mercury helpers to Postgres queries.
5. Keep RPC fallbacks for critical checks in the UI.
6. Remove Mercury configuration from the app.
7. Remove the `mercury` contract feature once the new read path is stable.

## Cutover Criteria

- parity on proposal list/detail data
- parity on token inventory and member views
- parity on authority history
- stable Goldsky pipeline health
- no remaining UI dependency on Mercury endpoints
