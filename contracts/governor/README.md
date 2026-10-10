# Governor contract

Governor creates proposals, records checkpoint-weighted votes, evaluates quorum/majority, queues successful proposals, and consumes ready proposals for Treasury execution.

## Lifecycle and time

`Pending → Active → Succeeded/Defeated → Queued → Executed`, with cancellation/expiry where allowed. Voting windows and ETA use Unix seconds; voting weights and supply use the ledger before proposal creation, so the voting delay is a notice period, not a later snapshot.

Voting delay, voting period, and queue delay are each 300–2,592,000 seconds. Quorum is 1–10,000 bps of the **voting supply** at the snapshot (the token excludes tokens held by the Treasury, Auction and Marketplace), computed with ceiling division over For + Abstain. The proposal threshold is a positive vote count, checked against the voting supply when set. Proposals permit 1–20 actions. Unqueued successful proposals expire 14 days after vote end; queued proposals expire 14 days after ETA.

`propose` emits OpenZeppelin `ProposalCreated` and `ProposalScheduled { proposal_id, vote_start, vote_end, snapshot_ledger, quorum_votes }`; the quorum is final at proposal time.

## Main interface

```text
propose(targets, functions, args, description, proposer) -> proposal_id
cast_vote(proposal_id, vote_type, reason, voter) -> weight
queue(targets, functions, args, description_hash, eta, operator) -> proposal_id
cancel(targets, functions, args, description_hash, operator) -> proposal_id
consume(targets, functions, args, description_hash) -> proposal_id
proposal_state(id); proposal_snapshot(id); proposal_deadline(id); proposal_proposer(id)
quorum(ledger); quorum_bps(); has_voted(id, account)
set_voting_delay(v); set_voting_period(v); set_queue_delay(v)
set_proposal_threshold(v); set_quorum_bps(v)
admin(); treasury(); launch(treasury)
upgrade(from_hash, to_hash); migrate(); sync_version(); version(); wasm_hash(); storage_version()
```

`targets` is `Vec<Address>`, `functions` is `Vec<Symbol>`, `args` is `Vec<Vec<Val>>`, and `description_hash` is `BytesN<32>`. `vote_type` is 0 against, 1 for, 2 abstain.

Queue is permissionless: the inherited `eta` and `operator` arguments are ignored and ETA is now + queue delay. `consume` is only authorizable by the stored Treasury; it fails with `ProposalNotReady` (7513) before the ETA. `execute(..., executor)` always rejects with `UseTreasuryExecute` (7507). A vote with zero weight at the snapshot fails with `ZeroVotingWeight` (7512); the Treasury, Auction and Marketplace can never vote.

Setters are admin-only: the launch admin in setup, the Treasury (a passed proposal) after launch. Setter events carry the admin as the `changed_by` topic. There is no ownership transfer, renounce, or mutable Treasury/Token wiring.

Errors: block 7500 for custom errors; OpenZeppelin governor lifecycle errors keep their 5000s codes.

## Client encoding and state

Proposal vectors must preserve the exact ABI/XDR and description hash. See [web reference](../../apps/web/README.md).

## Tests

`cargo test -p governor`; [in-memory integration tests](../e2e/README.md) cover Treasury consumption, atomicity, expiry, replay, voting with system-held tokens, and Governor/Treasury upgrades. [Implementation](src/contract.rs) and [storage bounds](src/storage.rs) are authoritative.
