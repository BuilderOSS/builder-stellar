# Governor contract

Governor creates proposals, records checkpoint-weighted votes, evaluates quorum/majority, queues successful proposals, and consumes ready proposals for Treasury execution.

## Lifecycle and time

`Pending → Active → Succeeded/Defeated → Queued → Executed`, with cancellation/expiry where allowed. Voting windows and ETA use Unix seconds; voting weights/supply use the ledger before proposal creation. The voting delay is notice, not a later weight snapshot.

Voting delay, voting period, and queue delay are each 300–2,592,000 seconds. Quorum is 1–10,000 bps; proposal threshold is an absolute positive vote count. Proposals permit 1–20 actions. Unqueued successful proposals expire 14 days after vote end; queued proposals expire 14 days after ETA.

The threshold setter also checks previous-ledger supply when nonzero; creation
does not ensure the planned distribution can meet it. CLI founder validation is
an additional tooling check, not a general on-chain founder constraint.

## Main interface

```text
propose(targets, functions, args, description, proposer) -> proposal_id
cast_vote(proposal_id, vote_type, reason, voter) -> weight
queue(targets, functions, args, description_hash, eta, operator) -> proposal_id
cancel(targets, functions, args, description_hash, operator) -> proposal_id
consume(targets, functions, args, description_hash) -> proposal_id
proposal_state(proposal_id); proposal_snapshot(proposal_id); proposal_deadline(proposal_id)
set_voting_delay(voting_delay); set_voting_period(voting_period)
set_queue_delay(queue_delay); set_proposal_threshold(proposal_threshold)
set_quorum_bps(quorum_bps)
launch(treasury); upgrade(from_hash, to_hash); sync_version(); version(); wasm_hash()
```

`targets` is `Vec<Address>`, `functions` is `Vec<Symbol>`, `args` is `Vec<Vec<Val>>`, and `description_hash` is `BytesN<32>`. `vote_type` is 0 against, 1 for, 2 abstain. The generated client uses `operator`, not a renamed `proposer`, for queue/cancel.

Queue is permissionless: the inherited `eta` and `operator` arguments are ignored, and ETA is computed from current timestamp plus configured queue delay. Treasury execution is also permissionless; wallets pay transaction fees. `consume` is **not** permissionless: only the stored Treasury may authorize it. Governor's inherited `execute(..., executor)` always rejects with `UseTreasuryExecute` (1508).

Propose/vote/cancel have their own auth and voting-power rules; permissionless queue/execute does not relax them. Owner setters are direct launch-admin operations in Setup and Treasury-authorized proposal actions after launch. There is no Governor-authority role or mutable Treasury/Token wiring setter.

## Client encoding and state

Proposal vectors must preserve the exact ABI/XDR and description hash. The web uses generated target specs, explicit known SAC transfer types, and a proposal-ID match; unsupported ABI shapes disable submission. Indexed state is incomplete, so the detail API supplements it with live state/timing and labels fallback sources. See [web reference](../../apps/web/README.md).

## Tests

`cargo test -p governor`; [in-memory integration tests](../e2e/README.md) cover Treasury consumption, atomicity, expiry, replay, and Governor/Treasury upgrades. [Implementation](src/contract.rs) and [storage bounds](src/storage.rs) are authoritative.
