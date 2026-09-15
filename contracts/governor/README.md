# Governor Contract

Timestamp-based DAO governance contract. It creates proposals, records votes from token checkpoints, enforces quorum and majority, queues successful proposals, and executes them through the treasury.

## Proposal Lifecycle

`Pending -> Active -> Succeeded/Defeated -> Queued -> Executed/Expired/Canceled`

The default minimum voting delay, voting period, and queue delay are each 300 seconds. Queueing stores an ETA and proposals expire 14 days after that ETA.

## Main Methods

- `propose(targets, functions, args, description, proposer)` - create a proposal.
- `cast_vote(proposal_id, support, reason, voter)` - vote using checkpointed voting power.
- `proposal_state(proposal_id)` - read the current lifecycle state.
- `queue(targets, functions, args, description_hash, eta, proposer)` - queue a successful proposal.
- `execute(targets, functions, args, description_hash, executor)` - execute a queued proposal through the treasury.
- `set_governor_authority(address, enabled)` - let an address manage governance settings.

Owner and authorized governance methods update voting delay, voting period, queue delay, proposal threshold, quorum, treasury, and token contract.

## Tests

```bash
cargo test -p governor
```
