# Governor contract

Governor creates proposals, records checkpoint-weighted votes, evaluates quorum and majority, queues successful proposals, and consumes ready proposals for Treasury execution.

## Lifecycle and time

`Pending → Active → Succeeded/Defeated → Queued → Executed`, with cancellation and expiry where allowed. Voting windows and ETA use Unix seconds; voting weights and supply use the ledger before proposal creation, so the voting delay is a notice period, not a later snapshot.

Voting delay, voting period, and queue delay are each 300–2,592,000 seconds. Quorum is 1–10,000 bps of the **voting supply** at the snapshot (the token excludes tokens held by the Treasury, Auction, and Marketplace), computed with ceiling division over For + Abstain. The proposal threshold is a positive vote count, checked against the voting supply when set (once there is one). `propose` caps it at the voting supply at the previous ledger and never below 1, so a DAO whose supply is below its threshold can still propose; `votes_needed_to_propose()` returns that figure. Unqueued successful proposals expire 14 days after vote end; queued proposals expire 14 days after ETA.

A proposal has 1–20 actions. `propose` refuses an action that calls this Governor's `consume` (`CannotConsume`, 7516), and `mint` and `batch_mint` actions whose events could not all fit one `treasury.execute` (`MintsTooLarge`, 7517; see `common::EXECUTION_EVENT_BUDGET`).

`propose` emits OpenZeppelin `ProposalCreated` and `ProposalScheduled { proposal_id, vote_start, vote_end, snapshot_ledger, quorum_votes }`; the quorum is final at proposal time: `ceil(voting_supply * quorum_bps / 10_000)` from the voting supply at the previous ledger (`token.voting_supply_at_previous_ledger`, the ledger votes are snapshotted at) and the current rate, stored on the proposal (`proposal(id).quorum`). `proposal_state`, `queue`, and `consume` use the stored value and never read historical checkpoints, so only the latest supply and quorum checkpoints need to stay live ([storage design](../../docs/STORAGE_DIET.md) D33). Tokens minted or escrowed in the proposing ledger change neither the quorum nor anyone's weight (both use the previous ledger), so escrowing tokens while proposing cannot lower the bar (D40). `quorum(ledger)` remains as a view for any past ledger.

## Vote source

Voting power comes from the Governor's **vote source**. That is the DAO's Token unless the DAO was created with an adapter the Manager approved ([governance adapter design](../../docs/designs/governance-adapter.md)). Every vote read goes through `common::clients::VoteSourceApi`:

- `get_votes_at_checkpoint` at propose and vote;
- `voting_supply_at_previous_ledger` for the quorum fixed at propose and the threshold cap;
- `get_total_supply_at_checkpoint` for the `quorum(ledger)` view;
- `get_total_supply` for the threshold check in `set_proposal_threshold`.

The source is stored in OpenZeppelin's token-contract slot, which is set once, so it is fixed for the Governor's life. `vote_source()` returns it, and for an adapter DAO OZ's `get_token_contract()` returns the adapter, not the membership NFT. Thresholds and quorum are in the source's units.

## Main interface

```text
propose(targets, functions, args, description, proposer) -> proposal_id
cast_vote(proposal_id, vote_type, reason, voter) -> weight
queue(targets, functions, args, description_hash, eta, operator) -> proposal_id
cancel(targets, functions, args, description_hash, operator) -> proposal_id
consume(targets, functions, args, description_hash) -> proposal_id
comment(proposal_id, body, author)
proposal_state(id); proposal_snapshot(id); proposal_deadline(id); proposal_proposer(id)
proposal_count(); proposal_ids(start, limit) -> Vec<id>; proposal(id) -> ProposalInfo
quorum(ledger); quorum_bps(); has_voted(id, account); vote_source(); votes_needed_to_propose()
set_voting_delay(v); set_voting_period(v); set_queue_delay(v)
set_proposal_threshold(v); set_quorum_bps(v)
admin(); treasury(); launch(treasury); handoff(treasury)
upgrade(from_hash, to_hash); migrate(); version(); wasm_hash(); storage_version()
```

`targets` is `Vec<Address>`, `functions` is `Vec<Symbol>`, `args` is `Vec<Vec<Val>>`, and `description_hash` is `BytesN<32>`, the keccak-256 hash of the description bytes. `vote_type` is 0 against, 1 for, and 2 abstain.

Queue is permissionless: the inherited `eta` and `operator` arguments are ignored and ETA is now + queue delay. Only the proposer can `cancel`, while the proposal is Pending or Active. `consume` is only authorizable by the stored Treasury; it fails with `ProposalNotReady` (7513) before the ETA. `execute(..., executor)` always rejects with `UseTreasuryExecute` (7507). A vote with zero weight at the snapshot fails with `ZeroVotingWeight` (7512); the Treasury, Auction, and Marketplace can never vote. `comment` is open to anyone and event-only (`ProposalCommented`); a comment body and a vote reason are each at most 8,192 bytes (`CommentTooLong`, 7515).

Setters are admin-only: the launch admin in setup, the Treasury (a passed proposal) after launch. Setter events carry the admin as the `changed_by` topic. Manager-only `launch(treasury)` hands the admin to the Treasury and marks the Governor Live; proposals can be made only after it. Manager-only `handoff(treasury)` (from `open_assurance`) hands the admin over early and stays in Setup, which freezes the settings until launch. Both fail `TreasuryMismatch` (7506) unless `treasury` is the one wired at construction. There is no ownership transfer, no renounce, and no mutable Treasury or vote-source wiring.

Proposals can be listed from chain state alone. `propose` writes `ProposalId(seq) -> id` (about 60 bytes, proposer-paid) and bumps an instance counter; the entry renews with the proposal core on every lifecycle call. `proposal_ids` returns at most 50 ids per call (`MAX_PROPOSAL_IDS_PAGE`). `proposal(id)` returns the stored window, eta, and sequence number with the state computed now. The payload is never stored: the proposer and indexer keep the preimage (docs/STORAGE_DIET.md D10). `name()` is a constant and `version()` is read from the Manager registry, so OpenZeppelin's `Name` and `Version` entries are never written.

## Upgrades and migration

`upgrade` is admin-only and needs the Manager's approval of `from_hash -> to_hash`. A proposal can run `upgrade` then `migrate` as consecutive actions. `migrate` is open to anyone. While the stored layout differs from the code's `STORAGE_VERSION`, gated entry points fail `StorageVersionMismatch` (7518), and only a recovery proposal (every action an `upgrade` or `migrate` on this Governor or its Treasury) can be proposed, queued, and consumed. Votes are accepted only on a recovery proposal made while the migration is due. A release whose migration fails can therefore be replaced by fixed code. `upgrade`, `migrate`, and the views stay outside the gate.

Errors: block 7500 for custom errors; OpenZeppelin governor lifecycle errors keep their 5000s codes.

## Client encoding and state

Proposal vectors must preserve the exact ABI/XDR and description hash. See [web reference](../../apps/web/README.md#governance-and-receipts).

## Tests

`cargo test -p governor`; [in-memory integration tests](../e2e/README.md) cover Treasury consumption, atomicity, expiry, replay, voting with system-held tokens, Governor/Treasury upgrades, and migration recovery. [Implementation](src/contract.rs) and [storage bounds](src/storage.rs) are authoritative.
