---
tags: Stellar, Soroban, DAO, Governance, NFTs
title: MVP DAO Technical Plan
---

# MVP DAO Technical Plan

## 1) Overview

Build one simple test DAO on Stellar using Soroban contracts only.

The DAO consists of:

- a transferable NFT governance token
- a governor contract for proposals, voting, and execution
- a treasury contract that can execute arbitrary calls only when authorized by the governor

The goal is to prove the core governance loop with the smallest useful contract set.

## 2) Scope

In scope:

- one DAO only
- NFT governance token
- snapshot-based voting
- proposal creation, voting, execution, and cancellation
- governor-only treasury execution
- arbitrary treasury function calls authorized by governance

Out of scope:

- factory
- registry
- manager
- auctions
- metadata system
- upgrades
- timelock
- multi-DAO support

## 3) Contracts

### Token

- non-fungible governance token
- transferable
- each NFT gives 1 voting unit
- voting power uses checkpoints/snapshots
- minting defaults to self-delegation if the account has no existing delegate
- delegation is account-level and explicit
- if an account already has a delegate, transfers preserve that delegate

### Governor

- proposal creation
- voting
- quorum and success checks
- execution
- cancellation
- reads voting power from token snapshots
- proposal execution routes through treasury
- quorum is configured as basis points against total NFT supply at the proposal snapshot
- proposal threshold remains an absolute minimum voting-power requirement to create proposals

### Treasury

- holds DAO assets
- can execute arbitrary contract calls
- only callable by the governor
- does not make policy decisions

## 4) Delegation Model

Desired behavior:

- anyone who owns 1 NFT can vote with 1 vote by default
- holders can delegate their vote to another address through an explicit function call
- when an NFT is transferred, the new owner can vote with it by default
- if the recipient already has a delegate, preserve that delegate

Practical rule:

- on mint or first receipt, if the account has no delegate, set the delegate to self
- on transfer, do not clear an existing delegate
- if no delegate exists for the recipient, default to self

This keeps voting intuitive while allowing explicit delegation without extra complexity.

## 5) Governance Flow

1. user holds an NFT
2. user has voting power by default
3. user can delegate voting power to another address
4. user creates a proposal
5. governor uses snapshot voting power from the token contract
6. users vote
7. proposal succeeds if threshold and quorum are met
8. governor calls treasury
9. treasury executes the approved arbitrary call

## 6) Snapshot Rules

- voting uses historical checkpoints
- proposal snapshot is fixed when the proposal is created
- later transfers do not change voting power for that proposal
- snapshot data comes from the token voting system

## 7) Treasury Execution Rules

- treasury accepts generic target, function, and argument data
- only the governor can invoke execution
- treasury does not inspect proposal policy beyond access control
- governance decides what gets executed

## 8) MVP Acceptance Criteria

- mint NFT to a user
- user can vote with 1 NFT = 1 vote
- user can delegate to another address
- transfers preserve prior delegation
- governor can pass a proposal
- quorum scales from total supply using basis points
- governor can make treasury execute an arbitrary contract call
- unauthorized callers cannot invoke treasury execution

## 9) Mercury Read Model

- use Mercury for indexed read surfaces in the app and test harness
- keep contract execution separate from indexing concerns
- prefer direct Soroban RPC reads for authoritative contract state
- use Mercury-backed views for activity feed, account history, and governance summaries
- if a contract needs custom indexing metadata, expose it in a compact, Mercury-friendly event or struct shape

## 10) Build Order

1. NFT token with votes and delegation
2. governor with snapshot voting
3. treasury with governor-only arbitrary calls
4. end-to-end tests for mint, delegate, transfer, propose, vote, execute

## 11) Notes

- keep the system single-DAO and test-focused
- prefer minimal contract boundaries over reusable platform abstractions
- use the existing OpenZeppelin Stellar governance and NFT examples as implementation references
- keep the existing Mercury integration pattern available for read-side features, not core execution logic
