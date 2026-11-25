import {ProposalInfo, ProposalState, ContractEvent} from './types.js';
import {Spec, AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, ExternalExecutableRef} from '@stellar/stellar-sdk/contract';
import {Address, xdr} from '@stellar/stellar-sdk';

export interface Client {
  /**
   * A constant, not stored (D6): OZ would keep it in an instance entry.
   */
  name(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * Module admin: the launch admin during setup, the Treasury once live.
   */
  admin(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * Queues a Succeeded proposal and returns its id. Anyone may call it;
   * `_eta` and `_operator` are ignored. Sets the ETA to now plus the queue
   * delay: `treasury.execute` can run the proposal from the ETA until 14
   * days after it (`PROPOSAL_EXPIRATION_PERIOD`). Fails
   * `ProposalNotSuccessful` in any other state, including a Succeeded
   * proposal whose 14-day queue window has passed (Expired).
   *
   * Renews the proposal's TTL to `PROPOSAL_TTL_EXTEND_TO` unconditionally,
   * so it lives through the rest of its lifecycle (at most the 30-day
   * queue delay plus the 14-day execution window) without another touch.
   * Emits `ProposalQueued`.
   */
  queue({ targets, functions, args, description_hash, eta, operator }: { targets: Array<string | Address>; functions: Array<string>; args: Array<Array<any>>; description_hash: Uint8Array; eta: number; operator: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<Uint8Array>>;
  /**
   * Cancels a Pending or Active proposal and returns its id. Only its
   * proposer, as `operator` with auth; anyone else, or any later state,
   * fails `ProposalNotCancellable`. Emits OpenZeppelin `ProposalCancelled`.
   */
  cancel({ targets, functions, args, description_hash, operator }: { targets: Array<string | Address>; functions: Array<string>; args: Array<Array<any>>; description_hash: Uint8Array; operator: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<Uint8Array>>;
  /**
   * One-shot, Manager-only launch handoff (Setup -> Live).
   *
   * Hands the admin to `treasury`, marks the module live, and emits
   * `GovernorLaunched`. A second call panics with `AlreadyLive`;
   * `treasury` must be the Treasury wired at construction
   * (`TreasuryMismatch`). Proposals can be made only after this.
   */
  launch({ treasury }: { treasury: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * For + Abstain votes a proposal snapshotted at `ledger` needs:
   * `ceil(voting_supply(ledger) * quorum_bps / 10_000)`. The voting supply
   * excludes tokens held by the Treasury, Auction and Marketplace (see the
   * token), so system-held tokens never inflate the requirement.
   *
   * A view for any past ledger. Proposals do not use it: each stores the
   * quorum it was created with. A lookup far in the past binary-searches
   * supply and quorum checkpoints, which may have archived (only the
   * latest of each is renewed by the DAO sweep); restore them to read.
   */
  quorum({ ledger }: { ledger: number }, options?: MethodOptions): Promise<AssembledTransaction<bigint>>;
  /**
   * Posts a comment on an existing proposal, in any state. Anyone may
   * comment. Event-only: emits `ProposalCommented` and writes no storage.
   */
  comment({ proposal_id, body, author }: { proposal_id: Uint8Array; body: string; author: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Marks a Queued proposal Executed and returns its id. Only callable by
   * the stored Treasury (`treasury.require_auth()`, satisfied when the
   * Treasury is the direct invoker). Called from `treasury.execute`, which
   * then dispatches the actions; if any of them fails the whole tx,
   * including this state change, reverts.
   *
   * The proposal must be Queued, unexpired and past its ETA
   * (`ProposalNotQueued`, `ProposalAlreadyExecuted`, `ProposalNotReady`).
   * A proposal can never reach this through one of its own actions:
   * `propose` refuses an action aimed at `consume` (`CannotConsume`) and
   * the Treasury refuses to dispatch or authorize one, so `ProposalExecuted`
   * is emitted only by the `treasury.execute` that runs the actions.
   *
   * Storage: one persistent proposal write (TTL re-extended). Emits the
   * existing `ProposalExecuted` event.
   */
  consume({ targets, functions, args, description_hash }: { targets: Array<string | Address>; functions: Array<string>; args: Array<Array<any>>; description_hash: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<Uint8Array>>;
  /**
   * Always fails. Execution is driven by `treasury.execute`, which calls
   * `consume` and then dispatches the actions with the Governor off the call
   * stack (Soroban forbids re-entry). Kept only to satisfy the OZ trait.
   */
  execute({ targets, functions, args, description_hash, executor }: { targets: Array<string | Address>; functions: Array<string>; args: Array<Array<any>>; description_hash: Uint8Array; executor: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<Uint8Array>>;
  /**
   * Manager-only early handoff (`manager.open_assurance`): the admin moves
   * to the Treasury and the contract stays in Setup, so the governance
   * settings are frozen until launch. `treasury` must be the Treasury
   * wired at construction (`TreasuryMismatch`); fails `AlreadyLive` once
   * launched.
   */
  handoff({ treasury }: { treasury: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Moves the stored data to the layout this code expects (`STORAGE_VERSION`)
   * and emits `Migrated`. Fails `NothingToMigrate` unless the stored layout
   * is older than the code's.
   *
   * Anyone may call it. It runs only the migration that the installed code
   * defines, which the Manager approved and the module admin installed, and
   * only once per layout. It must stay open: while the layout is out of
   * step the Governor refuses proposals (`StorageVersionMismatch`), so a
   * migration that needed a proposal could never run.
   */
  migrate(options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Creates a proposal and returns its id (the hash of its actions and
   * description). Needs `proposer`'s auth and at least
   * `votes_needed_to_propose` votes at the previous ledger
   * (`InsufficientProposerVotes`). Only once launched (`NotLive`).
   *
   * The proposal has 1 to `MAX_PROPOSAL_ACTIONS` actions
   * (`EmptyProposal`, `TooManyActions`), matching lengths
   * (`InvalidProposalLength`), a description up to OpenZeppelin's limit
   * (`DescriptionTooLong`), and an id not used before
   * (`ProposalAlreadyExists`). Its actions may not call `consume`
   * (`CannotConsume`) or mint more than one execution can publish
   * (`MintsTooLarge`); see `check_actions`.
   *
   * Votes, the quorum supply and the threshold cap are all read at the
   * previous ledger, so tokens minted in the proposing ledger count toward
   * none of them. The quorum is fixed now and stored on the proposal.
   * Voting runs from now plus the voting delay for the voting period.
   * Emits OpenZeppelin `ProposalCreated` and `ProposalScheduled`.
   */
  propose({ targets, functions, args, description, proposer }: { targets: Array<string | Address>; functions: Array<string>; args: Array<Array<any>>; description: string; proposer: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<Uint8Array>>;
  /**
   * Replaces this Governor's code with `to_hash`. Admin only: the launch
   * admin during setup, the Treasury (a passed proposal) once live.
   *
   * `from_hash` must be the running code's hash and the Manager must
   * approve `from_hash -> to_hash` (`common::upgrade::apply`). Data is not
   * touched; if the new code expects a newer layout, call `migrate` next
   * (the same proposal may do it, as its next action). Not behind the
   * storage-layout gate, so a module whose layout is out of step can still
   * move to fixed code.
   */
  upgrade({ from_hash, to_hash }: { from_hash: Uint8Array; to_hash: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * The registry version of the running code (D6), as for every module.
   * OZ would store it and need a sync after every upgrade.
   */
  version(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * The proposal's stored window, eta and sequence number, and its state
   * now. Panics `ProposalNotFound` for an unknown id.
   */
  proposal({ proposal_id }: { proposal_id: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<ProposalInfo>>;
  /**
   * The Treasury wired at construction: the only caller `consume`
   * accepts, and the admin once live. Fixed for the Governor's life.
   */
  treasury(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * Casts `voter`'s vote and returns its weight: 0 Against, 1 For,
   * 2 Abstain (`InvalidVoteType` otherwise). Needs `voter`'s auth, an
   * Active proposal (`ProposalNotActive`), nonzero weight at the
   * proposal's snapshot (`ZeroVotingWeight`), a reason up to
   * `MAX_PROPOSAL_COMMENT_LENGTH` (`CommentTooLong`), and no earlier vote
   * by `voter` on it (`AlreadyVoted`). Emits OpenZeppelin `VoteCast`.
   */
  cast_vote({ proposal_id, vote_type, reason, voter }: { proposal_id: Uint8Array; vote_type: number; reason: string; voter: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<bigint>>;
  /**
   * Returns whether an account has voted on a proposal.
   *
   * # Arguments
   *
   * * `e` - Access to the Soroban environment.
   * * `proposal_id` - The unique identifier of the proposal.
   * * `account` - The address to check.
   */
  has_voted({ proposal_id, account }: { proposal_id: Uint8Array; account: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  /**
   * WASM hash of the running code, as recorded by the last `upgrade`.
   */
  wasm_hash(options?: MethodOptions): Promise<AssembledTransaction<Uint8Array>>;
  /**
   * The quorum rate new proposals use, in basis points of the voting
   * supply. A proposal keeps the quorum fixed when it was made (`proposal`).
   */
  quorum_bps(options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * Where this Governor's voting power comes from: the DAO's Token, or an
   * adapter the Manager approved when the DAO was created. Fixed for the
   * Governor's life (OZ's token-contract slot is set once).
   *
   * Stored in OpenZeppelin's token-contract slot, so OZ's
   * `get_token_contract()` returns the same address; for an adapter DAO it
   * is the adapter, not the membership NFT (find that through the Treasury
   * or the Manager).
   */
  vote_source(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * Ids of the proposals with sequence numbers `start..start + limit`, in
   * creation order. `limit` is capped at `MAX_PROPOSAL_IDS_PAGE`; the page
   * ends early at `proposal_count()`. An id entry archived after its
   * proposal ended must be restored before it can be read.
   */
  proposal_ids({ start, limit }: { start: number; limit: number }, options?: MethodOptions): Promise<AssembledTransaction<Array<Uint8Array>>>;
  /**
   * Seconds between `propose` and the start of voting: a notice period.
   * Votes are read at the ledger before `propose`, so delegating or
   * transferring during the delay does not change that proposal's votes.
   */
  voting_delay(options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * Returns a symbol identifying the counting strategy.
   *
   * This function is expected to be used to display human-readable
   * information about the counting strategy, for example in UIs.
   *
   * For simple counting, this returns `"simple"`.
   *
   * # Arguments
   *
   * * `e` - Access to the Soroban environment.
   */
  counting_mode(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * Seconds voting stays open.
   */
  voting_period(options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * Number of proposals ever created; ids have sequence numbers
   * `0..proposal_count()`.
   */
  proposal_count(options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * The proposal's state now (Pending, Active, Defeated, Succeeded,
   * Queued, Expired, Executed or Canceled). Fails `ProposalNotFound` for
   * an unknown id.
   */
  proposal_state({ proposal_id }: { proposal_id: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<ProposalState>>;
  /**
   * Sets the quorum as basis points of the voting supply (1..=10,000).
   * Admin only. Each proposal keeps the quorum fixed when it was made.
   * Emits `QuorumBpsChanged`.
   */
  set_quorum_bps({ quorum_bps }: { quorum_bps: number }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Returns the proposal ID computed from the proposal details.
   *
   * The proposal ID is a deterministic keccak256 hash of the XDR-serialized
   * targets, functions, args, and description hash. This allows anyone to
   * compute the ID without storing the full proposal data.
   *
   * The `description_hash` is computed as
   * `keccak256(description.to_bytes())`, i.e., a keccak256 hash of the
   * raw UTF-8 bytes of the description string. Off-chain clients can
   * reproduce this by hashing the raw string bytes directly — no XDR
   * encoding is required.
   *
   * # Arguments
   *
   * * `e` - Access to the Soroban environment.
   * * `targets` - The addresses of contracts to call.
   * * `functions` - The function names to invoke on each target.
   * * `args` - The arguments for each function call.
   * * `description_hash` - The keccak256 hash of the description's raw
   * bytes.
   */
  get_proposal_id({ targets, functions, args, description_hash }: { targets: Array<string | Address>; functions: Array<string>; args: Array<Array<any>>; description_hash: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<Uint8Array>>;
  /**
   * Sets the delay between `queue` and the earliest `treasury.execute`
   * (seconds, `MIN_QUEUE_DELAY..=MAX_QUEUE_DELAY`). Admin only: the launch
   * admin during setup, a passed proposal once live. Applies to proposals
   * queued after the change. Emits `QueueDelayChanged`.
   */
  set_queue_delay({ queue_delay }: { queue_delay: number }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Storage-layout version of the data held by this contract. While it
   * differs from the code's `STORAGE_VERSION`, every gated entry point
   * fails `StorageVersionMismatch` until `migrate` (or an upgrade) brings
   * the two back in step.
   */
  storage_version(options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * Sets the notice period between `propose` and the start of voting
   * (seconds, `MIN_VOTING_DELAY..=MAX_VOTING_DELAY`). Admin only. Applies
   * to proposals made after the change. Emits `VotingDelayChanged`.
   */
  set_voting_delay({ voting_delay }: { voting_delay: number }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * When voting ends, in unix seconds (not a ledger number, as
   * OpenZeppelin documents it).
   */
  proposal_deadline({ proposal_id }: { proposal_id: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * The account that made the proposal (the only one that may cancel it).
   */
  proposal_proposer({ proposal_id }: { proposal_id: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * The ledger the proposal reads votes at: the ledger before `propose`.
   */
  proposal_snapshot({ proposal_id }: { proposal_id: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * Sets how long voting stays open (seconds,
   * `MIN_VOTING_PERIOD..=MAX_VOTING_PERIOD`). Admin only. Applies to
   * proposals made after the change. Emits `VotingPeriodChanged`.
   */
  set_voting_period({ voting_period }: { voting_period: number }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Returns the address of the token contract that implements the Votes
   * trait.
   *
   * # Arguments
   *
   * * `e` - Access to the Soroban environment.
   *
   * # Errors
   *
   * * [`GovernorError::TokenContractNotSet`] - Occurs if the token contract
   * has not been set.
   */
  get_token_contract(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * Returns the minimum voting power required to create a proposal.
   *
   * # Arguments
   *
   * * `e` - Access to the Soroban environment.
   *
   * # Errors
   *
   * * [`GovernorError::ProposalThresholdNotSet`] - Occurs if the proposal
   * threshold has not been set.
   */
  proposal_threshold(options?: MethodOptions): Promise<AssembledTransaction<bigint>>;
  /**
   * Always true: a proposal must be queued, and wait out the queue delay,
   * before `treasury.execute` can run it.
   */
  proposals_need_queuing(options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  /**
   * Sets the votes a proposer needs (nonzero, and not above the voting
   * supply once there is one). Admin only. `propose` caps it at the voting
   * supply (`votes_needed_to_propose`). Emits `ProposalThresholdChanged`.
   */
  set_proposal_threshold({ proposal_threshold }: { proposal_threshold: bigint }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * The votes a proposal made now needs: `proposal_threshold`, capped at
   * the voting supply at the previous ledger and never below 1 (the rule
   * `propose` applies). Front ends read this rather than recomputing it,
   * so a Governor without the cap (which lacks this view) is told apart.
   */
  votes_needed_to_propose(options?: MethodOptions): Promise<AssembledTransaction<bigint>>;
}

export class Client extends ContractClient {
  constructor(public readonly options: ContractClientOptions) {
    super(
      new Spec(["AAAABAAAANFHb3Zlcm5vci1zcGVjaWZpYyBlcnJvcnMgKGJsb2NrIGBjb21tb246OmVycm9yOjpjb2Rlczo6R09WRVJOT1JgKS4KTGlmZWN5Y2xlIGVycm9ycyBzaGFyZWQgd2l0aCBPcGVuWmVwcGVsaW4ncyBnb3Zlcm5vciAocHJvcG9zYWwgbm90IGZvdW5kLApub3QgYWN0aXZlLCBhbHJlYWR5IGV4ZWN1dGVkLCAuLi4pIGtlZXAgdGhlaXIgbGlicmFyeSBjb2RlcyAoNTAwMHMpLgAAAAAAAAAAAAATQ3VzdG9tR292ZXJub3JFcnJvcgAAAAASAAAAI1F1ZXVlIGRlbGF5IGJlbG93IGBNSU5fUVVFVUVfREVMQVlgAAAAABFJbnZhbGlkUXVldWVEZWxheQAAAAAAHU0AAAA3UHJvcG9zYWwgdGhyZXNob2xkIGlzIHplcm8gb3IgZXhjZWVkcyB0aGUgdm90aW5nIHN1cHBseQAAAAAYSW52YWxpZFByb3Bvc2FsVGhyZXNob2xkAAAdTgAAACVRdW9ydW0gYmFzaXMgcG9pbnRzIG91dHNpZGUgMS4uPTEwMDAwAAAAAAAAEEludmFsaWRRdW9ydW1CcHMAAB1PAAAAJVZvdGluZyBkZWxheSBiZWxvdyBgTUlOX1ZPVElOR19ERUxBWWAAAAAAAAASSW52YWxpZFZvdGluZ0RlbGF5AAAAAB1QAAAAJ1ZvdGluZyBwZXJpb2QgYmVsb3cgYE1JTl9WT1RJTkdfUEVSSU9EYAAAAAATSW52YWxpZFZvdGluZ1BlcmlvZAAAAB1RAAAAQWBsYXVuY2hgIHRyZWFzdXJ5IGRpZmZlcnMgZnJvbSB0aGUgdHJlYXN1cnkgd2lyZWQgYXQgY29uc3RydWN0aW9uAAAAAAAAEFRyZWFzdXJ5TWlzbWF0Y2gAAB1SAAAANmBleGVjdXRlYCBpcyBkaXNhYmxlZDsgY2FsbCBgdHJlYXN1cnkuZXhlY3V0ZWAgaW5zdGVhZAAAAAAAElVzZVRyZWFzdXJ5RXhlY3V0ZQAAAAAdUwAAADVQcm9wb3NhbCBoYXMgbW9yZSB0aGFuIGBNQVhfUFJPUE9TQUxfQUNUSU9OU2AgYWN0aW9ucwAAAAAAAA5Ub29NYW55QWN0aW9ucwAAAAAdVAAAAC9Wb3RpbmcgZGVsYXkgYWJvdmUgYE1BWF9WT1RJTkdfREVMQVlgICgzMCBkYXlzKQAAAAASVm90aW5nRGVsYXlUb29Mb25nAAAAAB1VAAAAMVZvdGluZyBwZXJpb2QgYWJvdmUgYE1BWF9WT1RJTkdfUEVSSU9EYCAoMzAgZGF5cykAAAAAAAATVm90aW5nUGVyaW9kVG9vTG9uZwAAAB1WAAAALVF1ZXVlIGRlbGF5IGFib3ZlIGBNQVhfUVVFVUVfREVMQVlgICgzMCBkYXlzKQAAAAAAABFRdWV1ZURlbGF5VG9vTG9uZwAAAAAAHVcAAAA2VGhlIHZvdGVyIGhhZCBubyB2b3RpbmcgcG93ZXIgYXQgdGhlIHByb3Bvc2FsIHNuYXBzaG90AAAAAAAQWmVyb1ZvdGluZ1dlaWdodAAAHVgAAAA3VGhlIHByb3Bvc2FsIGlzIHF1ZXVlZCBidXQgaXRzIEVUQSBoYXMgbm90IGJlZW4gcmVhY2hlZAAAAAAQUHJvcG9zYWxOb3RSZWFkeQAAHVkAAAAVQ29tbWVudCBib2R5IGlzIGVtcHR5AAAAAAAADENvbW1lbnRFbXB0eQAAHVoAAABBQ29tbWVudCBib2R5IG9yIHZvdGUgcmVhc29uIGV4Y2VlZHMgYE1BWF9QUk9QT1NBTF9DT01NRU5UX0xFTkdUSGAAAAAAAAAOQ29tbWVudFRvb0xvbmcAAAAAHVsAAAB4QSBwcm9wb3NhbCBhY3Rpb24gY2FsbHMgdGhpcyBHb3Zlcm5vcidzIGBjb25zdW1lYC4gT25seQpgdHJlYXN1cnkuZXhlY3V0ZWAgY29uc3VtZXMgYSBwcm9wb3NhbCwgYW5kIG9ubHkgdGhlIG9uZSBpdCBydW5zAAAADUNhbm5vdENvbnN1bWUAAAAAAB1cAAAA01RoZSBwcm9wb3NhbCdzIGBtaW50YCBhbmQgYGJhdGNoX21pbnRgIGFjdGlvbnMsIHdpdGggaXRzIG90aGVyCmFjdGlvbnMsIHdvdWxkIHB1Ymxpc2ggbW9yZSBjb250cmFjdCBldmVudHMgdGhhbiBvbmUKYHRyZWFzdXJ5LmV4ZWN1dGVgIGFsbG93cyAoYGNvbW1vbjo6RVhFQ1VUSU9OX0VWRU5UX0JVREdFVGApOyBzcGxpdAp0aGVtIG92ZXIgc2V2ZXJhbCBwcm9wb3NhbHMAAAAADU1pbnRzVG9vTGFyZ2UAAAAAAB1dAAAAkVRoZSBzdG9yZWQgZGF0YSBsYXlvdXQgZGlmZmVycyBmcm9tIHRoZSBvbmUgdGhpcyBjb2RlIGV4cGVjdHM6IGEKbWlncmF0aW9uIGlzIGR1ZSAoYW55b25lIG1heSBjYWxsIGBtaWdyYXRlYCksIG9yIHRoZSBjb2RlIGlzIG9sZGVyCnRoYW4gdGhlIGRhdGEAAAAAAAAWU3RvcmFnZVZlcnNpb25NaXNtYXRjaAAAAAAdXg==", "AAAABQAAAIBFbWl0dGVkIGJ5IGBxdWV1ZWAuIGBldGFgIGlzIHRoZSB1bml4IHRpbWUgKHNlY29uZHMpIGZyb20gd2hpY2gKYHRyZWFzdXJ5LmV4ZWN1dGVgIGNhbiBydW4gdGhlIHByb3Bvc2FsLCB1bnRpbCAxNCBkYXlzIGFmdGVyIGl0LgAAAAAAAAAOUHJvcG9zYWxRdWV1ZWQAAAAAAAEAAAAPcHJvcG9zYWxfcXVldWVkAAAAAAIAAAAAAAAAC3Byb3Bvc2FsX2lkAAAAA+4AAAAgAAAAAQAAAAAAAAADZXRhAAAAAAYAAAAAAAAAAg==", "AAAABQAAAERFbWl0dGVkIG9uY2Ugd2hlbiB0aGUgTWFuYWdlciBsYXVuY2hlcyB0aGUgZ292ZXJub3IgKFNldHVwIC0+IExpdmUpLgAAAAAAAAAQR292ZXJub3JMYXVuY2hlZAAAAAEAAAARZ292ZXJub3JfbGF1bmNoZWQAAAAAAAABAAAAAAAAAAh0cmVhc3VyeQAAABMAAAABAAAAAg==", "AAAABQAAAEZFbWl0dGVkIGJ5IGBzZXRfcXVvcnVtX2Jwc2AgKGJhc2lzIHBvaW50cykuIGBjaGFuZ2VkX2J5YCBpcyB0aGUgYWRtaW4uAAAAAAAAAAAAEFF1b3J1bUJwc0NoYW5nZWQAAAABAAAAEnF1b3J1bV9icHNfY2hhbmdlZAAAAAAAAwAAAAAAAAAKY2hhbmdlZF9ieQAAAAAAEwAAAAEAAAAAAAAACW9sZF92YWx1ZQAAAAAAAAQAAAAAAAAAAAAAAAluZXdfdmFsdWUAAAAAAAAEAAAAAAAAAAI=", "AAAABQAAAH1FbWl0dGVkIGJ5IGBjb21tZW50YDogYSBjb21tZW50IG9uIGEgcHJvcG9zYWwsIGJ5IGFuIGF1dGhvciB3aG8KYXV0aG9yaXplZCBpdC4gRXZlbnQtb25seTogdGhlIGJvZHkgaXMgbmV2ZXIgc3RvcmVkIG9uLWNoYWluLgAAAAAAAAAAAAARUHJvcG9zYWxDb21tZW50ZWQAAAAAAAABAAAAEnByb3Bvc2FsX2NvbW1lbnRlZAAAAAAAAwAAAAAAAAALcHJvcG9zYWxfaWQAAAAD7gAAACAAAAABAAAAAAAAAAZhdXRob3IAAAAAABMAAAABAAAAAAAAAARib2R5AAAAEAAAAAAAAAAC", "AAAABQAAAVpFbWl0dGVkIGJ5IGBwcm9wb3NlYCBuZXh0IHRvIE9wZW5aZXBwZWxpbidzIGBQcm9wb3NhbENyZWF0ZWRgLgoKYHZvdGVfc3RhcnRgIC8gYHZvdGVfZW5kYCBhcmUgdW5peCB0aW1lc3RhbXBzIChzZWNvbmRzKTsgYHNuYXBzaG90X2xlZGdlcmAKaXMgdGhlIGxlZGdlciB2b3RpbmcgcG93ZXIgYW5kIHZvdGluZyBzdXBwbHkgYXJlIHJlYWQgYXQ7IGBxdW9ydW1fdm90ZXNgIGlzCnRoZSBGb3IgKyBBYnN0YWluIHRvdGFsIHRoZSBwcm9wb3NhbCBuZWVkcy4gUXVvcnVtIGlzIGZ1bGx5IGRldGVybWluZWQgYXQKcHJvcG9zYWwgdGltZSBiZWNhdXNlIHRoZSBzbmFwc2hvdCBwcmVjZWRlcyB0aGUgcHJvcG9zYWwuAAAAAAAAAAAAEVByb3Bvc2FsU2NoZWR1bGVkAAAAAAAAAQAAABJwcm9wb3NhbF9zY2hlZHVsZWQAAAAAAAUAAAAAAAAAC3Byb3Bvc2FsX2lkAAAAA+4AAAAgAAAAAQAAAAAAAAAKdm90ZV9zdGFydAAAAAAABgAAAAAAAAAAAAAACHZvdGVfZW5kAAAABgAAAAAAAAAAAAAAD3NuYXBzaG90X2xlZGdlcgAAAAAEAAAAAAAAAAAAAAAMcXVvcnVtX3ZvdGVzAAAACgAAAAAAAAAC", "AAAABQAAAEJFbWl0dGVkIGJ5IGBzZXRfcXVldWVfZGVsYXlgIChzZWNvbmRzKS4gYGNoYW5nZWRfYnlgIGlzIHRoZSBhZG1pbi4AAAAAAAAAAAARUXVldWVEZWxheUNoYW5nZWQAAAAAAAABAAAAE3F1ZXVlX2RlbGF5X2NoYW5nZWQAAAAAAwAAAAAAAAAKY2hhbmdlZF9ieQAAAAAAEwAAAAEAAAAAAAAACW9sZF92YWx1ZQAAAAAAAAQAAAAAAAAAAAAAAAluZXdfdmFsdWUAAAAAAAAEAAAAAAAAAAI=", "AAAABQAAAENFbWl0dGVkIGJ5IGBzZXRfdm90aW5nX2RlbGF5YCAoc2Vjb25kcykuIGBjaGFuZ2VkX2J5YCBpcyB0aGUgYWRtaW4uAAAAAAAAAAASVm90aW5nRGVsYXlDaGFuZ2VkAAAAAAABAAAAFHZvdGluZ19kZWxheV9jaGFuZ2VkAAAAAwAAAAAAAAAKY2hhbmdlZF9ieQAAAAAAEwAAAAEAAAAAAAAACW9sZF92YWx1ZQAAAAAAAAQAAAAAAAAAAAAAAAluZXdfdmFsdWUAAAAAAAAEAAAAAAAAAAI=", "AAAABQAAAI1FbWl0dGVkIG9uY2UsIGJ5IHRoZSBjb25zdHJ1Y3Rvciwgd2l0aCBldmVyeSBzZXR0aW5nIHRoZSBHb3Zlcm5vciBzdGFydHMKd2l0aC4gYHRva2VuX2NvbnRyYWN0YCBpcyB0aGUgdm90ZSBzb3VyY2UgKHRoZSBUb2tlbiBvciBhbiBhZGFwdGVyKS4AAAAAAAAAAAAAE0dvdmVybm9ySW5pdGlhbGl6ZWQAAAAAAQAAABRnb3Zlcm5vcl9pbml0aWFsaXplZAAAAAgAAAAAAAAABWFkbWluAAAAAAAAEwAAAAEAAAAAAAAADnRva2VuX2NvbnRyYWN0AAAAAAATAAAAAAAAAAAAAAARdHJlYXN1cnlfY29udHJhY3QAAAAAAAATAAAAAAAAAAAAAAAMdm90aW5nX2RlbGF5AAAABAAAAAAAAAAAAAAADXZvdGluZ19wZXJpb2QAAAAAAAAEAAAAAAAAAAAAAAALcXVldWVfZGVsYXkAAAAABAAAAAAAAAAAAAAAEnByb3Bvc2FsX3RocmVzaG9sZAAAAAAACgAAAAAAAAAAAAAACnF1b3J1bV9icHMAAAAAAAQAAAAAAAAAAg==", "AAAABQAAAERFbWl0dGVkIGJ5IGBzZXRfdm90aW5nX3BlcmlvZGAgKHNlY29uZHMpLiBgY2hhbmdlZF9ieWAgaXMgdGhlIGFkbWluLgAAAAAAAAATVm90aW5nUGVyaW9kQ2hhbmdlZAAAAAABAAAAFXZvdGluZ19wZXJpb2RfY2hhbmdlZAAAAAAAAAMAAAAAAAAACmNoYW5nZWRfYnkAAAAAABMAAAABAAAAAAAAAAlvbGRfdmFsdWUAAAAAAAAEAAAAAAAAAAAAAAAJbmV3X3ZhbHVlAAAAAAAABAAAAAAAAAAC", "AAAABQAAAEdFbWl0dGVkIGJ5IGBzZXRfcHJvcG9zYWxfdGhyZXNob2xkYCAodm90ZXMpLiBgY2hhbmdlZF9ieWAgaXMgdGhlIGFkbWluLgAAAAAAAAAAGFByb3Bvc2FsVGhyZXNob2xkQ2hhbmdlZAAAAAEAAAAacHJvcG9zYWxfdGhyZXNob2xkX2NoYW5nZWQAAAAAAAMAAAAAAAAACmNoYW5nZWRfYnkAAAAAABMAAAABAAAAAAAAAAlvbGRfdmFsdWUAAAAAAAAKAAAAAAAAAAAAAAAJbmV3X3ZhbHVlAAAAAAAACgAAAAAAAAAC", "AAAAAQAAADxgcHJvcG9zYWwoaWQpYDogdGhlIHN0b3JlZCBjb3JlIHBsdXMgdGhlIHN0YXRlIGNvbXB1dGVkIG5vdy4AAAAAAAAADFByb3Bvc2FsSW5mbwAAAAkAAABGVW5peCBzZWNvbmRzIGZyb20gd2hpY2ggYHRyZWFzdXJ5LmV4ZWN1dGVgIGNhbiBydW4gaXQ7IDAgdW50aWwgcXVldWVkLgAAAAAAA2V0YQAAAAAGAAAAOVRoZSBwcm9wb3NhbCBpZDogdGhlIGhhc2ggb2YgaXRzIGFjdGlvbnMgYW5kIGRlc2NyaXB0aW9uLgAAAAAAAAJpZAAAAAAD7gAAACAAAAAjVGhlIGFjY291bnQgdGhhdCBtYWRlIHRoZSBwcm9wb3NhbC4AAAAACHByb3Bvc2VyAAAAEwAAADtGb3IgKyBBYnN0YWluIHZvdGVzIHRoZSBwcm9wb3NhbCBuZWVkcyAoZml4ZWQgYXQgY3JlYXRpb24pLgAAAAAGcXVvcnVtAAAAAAAKAAAALENyZWF0aW9uIG9yZGVyIChgcHJvcG9zYWxfaWRzYCBsaXN0cyBieSBpdCkuAAAAA3NlcQAAAAAEAAAAPFRoZSBzdGF0ZSBub3csIGNvbXB1dGVkIGZyb20gdGhlIHN0b3JlZCBzdGF0ZSBhbmQgdGhlIGNsb2NrLgAAAAVzdGF0ZQAAAAAAB9AAAAANUHJvcG9zYWxTdGF0ZQAAAAAAACBVbml4IHNlY29uZHMgd2hlbiB2b3RpbmcgY2xvc2VzLgAAAAh2b3RlX2VuZAAAAAYAAABGVGhlIGxlZGdlciB2b3RlcyBhbmQgdGhlIHF1b3J1bSBzdXBwbHkgYXJlIHJlYWQgYXQgKGJlZm9yZSBgcHJvcG9zZWApLgAAAAAADXZvdGVfc25hcHNob3QAAAAAAAAEAAAAH1VuaXggc2Vjb25kcyB3aGVuIHZvdGluZyBvcGVucy4AAAAACnZvdGVfc3RhcnQAAAAAAAY=", "AAAAAAAAAENBIGNvbnN0YW50LCBub3Qgc3RvcmVkIChENik6IE9aIHdvdWxkIGtlZXAgaXQgaW4gYW4gaW5zdGFuY2UgZW50cnkuAAAAAARuYW1lAAAAAAAAAAEAAAAQ", "AAAAAAAAAERNb2R1bGUgYWRtaW46IHRoZSBsYXVuY2ggYWRtaW4gZHVyaW5nIHNldHVwLCB0aGUgVHJlYXN1cnkgb25jZSBsaXZlLgAAAAVhZG1pbgAAAAAAAAAAAAABAAAAEw==", "AAAAAAAAAmVRdWV1ZXMgYSBTdWNjZWVkZWQgcHJvcG9zYWwgYW5kIHJldHVybnMgaXRzIGlkLiBBbnlvbmUgbWF5IGNhbGwgaXQ7CmBfZXRhYCBhbmQgYF9vcGVyYXRvcmAgYXJlIGlnbm9yZWQuIFNldHMgdGhlIEVUQSB0byBub3cgcGx1cyB0aGUgcXVldWUKZGVsYXk6IGB0cmVhc3VyeS5leGVjdXRlYCBjYW4gcnVuIHRoZSBwcm9wb3NhbCBmcm9tIHRoZSBFVEEgdW50aWwgMTQKZGF5cyBhZnRlciBpdCAoYFBST1BPU0FMX0VYUElSQVRJT05fUEVSSU9EYCkuIEZhaWxzCmBQcm9wb3NhbE5vdFN1Y2Nlc3NmdWxgIGluIGFueSBvdGhlciBzdGF0ZSwgaW5jbHVkaW5nIGEgU3VjY2VlZGVkCnByb3Bvc2FsIHdob3NlIDE0LWRheSBxdWV1ZSB3aW5kb3cgaGFzIHBhc3NlZCAoRXhwaXJlZCkuCgpSZW5ld3MgdGhlIHByb3Bvc2FsJ3MgVFRMIHRvIGBQUk9QT1NBTF9UVExfRVhURU5EX1RPYCB1bmNvbmRpdGlvbmFsbHksCnNvIGl0IGxpdmVzIHRocm91Z2ggdGhlIHJlc3Qgb2YgaXRzIGxpZmVjeWNsZSAoYXQgbW9zdCB0aGUgMzAtZGF5CnF1ZXVlIGRlbGF5IHBsdXMgdGhlIDE0LWRheSBleGVjdXRpb24gd2luZG93KSB3aXRob3V0IGFub3RoZXIgdG91Y2guCkVtaXRzIGBQcm9wb3NhbFF1ZXVlZGAuAAAAAAAABXF1ZXVlAAAAAAAABgAAAAAAAAAHdGFyZ2V0cwAAAAPqAAAAEwAAAAAAAAAJZnVuY3Rpb25zAAAAAAAD6gAAABEAAAAAAAAABGFyZ3MAAAPqAAAD6gAAAAAAAAAAAAAAEGRlc2NyaXB0aW9uX2hhc2gAAAPuAAAAIAAAAAAAAAADZXRhAAAAAAQAAAAAAAAACG9wZXJhdG9yAAAAEwAAAAEAAAPuAAAAIA==", "AAAAAAAAAM1DYW5jZWxzIGEgUGVuZGluZyBvciBBY3RpdmUgcHJvcG9zYWwgYW5kIHJldHVybnMgaXRzIGlkLiBPbmx5IGl0cwpwcm9wb3NlciwgYXMgYG9wZXJhdG9yYCB3aXRoIGF1dGg7IGFueW9uZSBlbHNlLCBvciBhbnkgbGF0ZXIgc3RhdGUsCmZhaWxzIGBQcm9wb3NhbE5vdENhbmNlbGxhYmxlYC4gRW1pdHMgT3BlblplcHBlbGluIGBQcm9wb3NhbENhbmNlbGxlZGAuAAAAAAAABmNhbmNlbAAAAAAABQAAAAAAAAAHdGFyZ2V0cwAAAAPqAAAAEwAAAAAAAAAJZnVuY3Rpb25zAAAAAAAD6gAAABEAAAAAAAAABGFyZ3MAAAPqAAAD6gAAAAAAAAAAAAAAEGRlc2NyaXB0aW9uX2hhc2gAAAPuAAAAIAAAAAAAAAAIb3BlcmF0b3IAAAATAAAAAQAAA+4AAAAg", "AAAAAAAAASdPbmUtc2hvdCwgTWFuYWdlci1vbmx5IGxhdW5jaCBoYW5kb2ZmIChTZXR1cCAtPiBMaXZlKS4KCkhhbmRzIHRoZSBhZG1pbiB0byBgdHJlYXN1cnlgLCBtYXJrcyB0aGUgbW9kdWxlIGxpdmUsIGFuZCBlbWl0cwpgR292ZXJub3JMYXVuY2hlZGAuIEEgc2Vjb25kIGNhbGwgcGFuaWNzIHdpdGggYEFscmVhZHlMaXZlYDsKYHRyZWFzdXJ5YCBtdXN0IGJlIHRoZSBUcmVhc3VyeSB3aXJlZCBhdCBjb25zdHJ1Y3Rpb24KKGBUcmVhc3VyeU1pc21hdGNoYCkuIFByb3Bvc2FscyBjYW4gYmUgbWFkZSBvbmx5IGFmdGVyIHRoaXMuAAAAAAZsYXVuY2gAAAAAAAEAAAAAAAAACHRyZWFzdXJ5AAAAEwAAAAA=", "AAAAAAAAAhdGb3IgKyBBYnN0YWluIHZvdGVzIGEgcHJvcG9zYWwgc25hcHNob3R0ZWQgYXQgYGxlZGdlcmAgbmVlZHM6CmBjZWlsKHZvdGluZ19zdXBwbHkobGVkZ2VyKSAqIHF1b3J1bV9icHMgLyAxMF8wMDApYC4gVGhlIHZvdGluZyBzdXBwbHkKZXhjbHVkZXMgdG9rZW5zIGhlbGQgYnkgdGhlIFRyZWFzdXJ5LCBBdWN0aW9uIGFuZCBNYXJrZXRwbGFjZSAoc2VlIHRoZQp0b2tlbiksIHNvIHN5c3RlbS1oZWxkIHRva2VucyBuZXZlciBpbmZsYXRlIHRoZSByZXF1aXJlbWVudC4KCkEgdmlldyBmb3IgYW55IHBhc3QgbGVkZ2VyLiBQcm9wb3NhbHMgZG8gbm90IHVzZSBpdDogZWFjaCBzdG9yZXMgdGhlCnF1b3J1bSBpdCB3YXMgY3JlYXRlZCB3aXRoLiBBIGxvb2t1cCBmYXIgaW4gdGhlIHBhc3QgYmluYXJ5LXNlYXJjaGVzCnN1cHBseSBhbmQgcXVvcnVtIGNoZWNrcG9pbnRzLCB3aGljaCBtYXkgaGF2ZSBhcmNoaXZlZCAob25seSB0aGUKbGF0ZXN0IG9mIGVhY2ggaXMgcmVuZXdlZCBieSB0aGUgREFPIHN3ZWVwKTsgcmVzdG9yZSB0aGVtIHRvIHJlYWQuAAAAAAZxdW9ydW0AAAAAAAEAAAAAAAAABmxlZGdlcgAAAAAABAAAAAEAAAAK", "AAAAAAAAAIdQb3N0cyBhIGNvbW1lbnQgb24gYW4gZXhpc3RpbmcgcHJvcG9zYWwsIGluIGFueSBzdGF0ZS4gQW55b25lIG1heQpjb21tZW50LiBFdmVudC1vbmx5OiBlbWl0cyBgUHJvcG9zYWxDb21tZW50ZWRgIGFuZCB3cml0ZXMgbm8gc3RvcmFnZS4AAAAAB2NvbW1lbnQAAAAAAwAAAAAAAAALcHJvcG9zYWxfaWQAAAAD7gAAACAAAAAAAAAABGJvZHkAAAAQAAAAAAAAAAZhdXRob3IAAAAAABMAAAAA", "AAAAAAAAAytNYXJrcyBhIFF1ZXVlZCBwcm9wb3NhbCBFeGVjdXRlZCBhbmQgcmV0dXJucyBpdHMgaWQuIE9ubHkgY2FsbGFibGUgYnkKdGhlIHN0b3JlZCBUcmVhc3VyeSAoYHRyZWFzdXJ5LnJlcXVpcmVfYXV0aCgpYCwgc2F0aXNmaWVkIHdoZW4gdGhlClRyZWFzdXJ5IGlzIHRoZSBkaXJlY3QgaW52b2tlcikuIENhbGxlZCBmcm9tIGB0cmVhc3VyeS5leGVjdXRlYCwgd2hpY2gKdGhlbiBkaXNwYXRjaGVzIHRoZSBhY3Rpb25zOyBpZiBhbnkgb2YgdGhlbSBmYWlscyB0aGUgd2hvbGUgdHgsCmluY2x1ZGluZyB0aGlzIHN0YXRlIGNoYW5nZSwgcmV2ZXJ0cy4KClRoZSBwcm9wb3NhbCBtdXN0IGJlIFF1ZXVlZCwgdW5leHBpcmVkIGFuZCBwYXN0IGl0cyBFVEEKKGBQcm9wb3NhbE5vdFF1ZXVlZGAsIGBQcm9wb3NhbEFscmVhZHlFeGVjdXRlZGAsIGBQcm9wb3NhbE5vdFJlYWR5YCkuCkEgcHJvcG9zYWwgY2FuIG5ldmVyIHJlYWNoIHRoaXMgdGhyb3VnaCBvbmUgb2YgaXRzIG93biBhY3Rpb25zOgpgcHJvcG9zZWAgcmVmdXNlcyBhbiBhY3Rpb24gYWltZWQgYXQgYGNvbnN1bWVgIChgQ2Fubm90Q29uc3VtZWApIGFuZAp0aGUgVHJlYXN1cnkgcmVmdXNlcyB0byBkaXNwYXRjaCBvciBhdXRob3JpemUgb25lLCBzbyBgUHJvcG9zYWxFeGVjdXRlZGAKaXMgZW1pdHRlZCBvbmx5IGJ5IHRoZSBgdHJlYXN1cnkuZXhlY3V0ZWAgdGhhdCBydW5zIHRoZSBhY3Rpb25zLgoKU3RvcmFnZTogb25lIHBlcnNpc3RlbnQgcHJvcG9zYWwgd3JpdGUgKFRUTCByZS1leHRlbmRlZCkuIEVtaXRzIHRoZQpleGlzdGluZyBgUHJvcG9zYWxFeGVjdXRlZGAgZXZlbnQuAAAAAAdjb25zdW1lAAAAAAQAAAAAAAAAB3RhcmdldHMAAAAD6gAAABMAAAAAAAAACWZ1bmN0aW9ucwAAAAAAA+oAAAARAAAAAAAAAARhcmdzAAAD6gAAA+oAAAAAAAAAAAAAABBkZXNjcmlwdGlvbl9oYXNoAAAD7gAAACAAAAABAAAD7gAAACA=", "AAAAAAAAANJBbHdheXMgZmFpbHMuIEV4ZWN1dGlvbiBpcyBkcml2ZW4gYnkgYHRyZWFzdXJ5LmV4ZWN1dGVgLCB3aGljaCBjYWxscwpgY29uc3VtZWAgYW5kIHRoZW4gZGlzcGF0Y2hlcyB0aGUgYWN0aW9ucyB3aXRoIHRoZSBHb3Zlcm5vciBvZmYgdGhlIGNhbGwKc3RhY2sgKFNvcm9iYW4gZm9yYmlkcyByZS1lbnRyeSkuIEtlcHQgb25seSB0byBzYXRpc2Z5IHRoZSBPWiB0cmFpdC4AAAAAAAdleGVjdXRlAAAAAAUAAAAAAAAAB3RhcmdldHMAAAAD6gAAABMAAAAAAAAACWZ1bmN0aW9ucwAAAAAAA+oAAAARAAAAAAAAAARhcmdzAAAD6gAAA+oAAAAAAAAAAAAAABBkZXNjcmlwdGlvbl9oYXNoAAAD7gAAACAAAAAAAAAACGV4ZWN1dG9yAAAAEwAAAAEAAAPuAAAAIA==", "AAAAAAAAARpNYW5hZ2VyLW9ubHkgZWFybHkgaGFuZG9mZiAoYG1hbmFnZXIub3Blbl9hc3N1cmFuY2VgKTogdGhlIGFkbWluIG1vdmVzCnRvIHRoZSBUcmVhc3VyeSBhbmQgdGhlIGNvbnRyYWN0IHN0YXlzIGluIFNldHVwLCBzbyB0aGUgZ292ZXJuYW5jZQpzZXR0aW5ncyBhcmUgZnJvemVuIHVudGlsIGxhdW5jaC4gYHRyZWFzdXJ5YCBtdXN0IGJlIHRoZSBUcmVhc3VyeQp3aXJlZCBhdCBjb25zdHJ1Y3Rpb24gKGBUcmVhc3VyeU1pc21hdGNoYCk7IGZhaWxzIGBBbHJlYWR5TGl2ZWAgb25jZQpsYXVuY2hlZC4AAAAAAAdoYW5kb2ZmAAAAAAEAAAAAAAAACHRyZWFzdXJ5AAAAEwAAAAA=", "AAAAAAAAAfZNb3ZlcyB0aGUgc3RvcmVkIGRhdGEgdG8gdGhlIGxheW91dCB0aGlzIGNvZGUgZXhwZWN0cyAoYFNUT1JBR0VfVkVSU0lPTmApCmFuZCBlbWl0cyBgTWlncmF0ZWRgLiBGYWlscyBgTm90aGluZ1RvTWlncmF0ZWAgdW5sZXNzIHRoZSBzdG9yZWQgbGF5b3V0CmlzIG9sZGVyIHRoYW4gdGhlIGNvZGUncy4KCkFueW9uZSBtYXkgY2FsbCBpdC4gSXQgcnVucyBvbmx5IHRoZSBtaWdyYXRpb24gdGhhdCB0aGUgaW5zdGFsbGVkIGNvZGUKZGVmaW5lcywgd2hpY2ggdGhlIE1hbmFnZXIgYXBwcm92ZWQgYW5kIHRoZSBtb2R1bGUgYWRtaW4gaW5zdGFsbGVkLCBhbmQKb25seSBvbmNlIHBlciBsYXlvdXQuIEl0IG11c3Qgc3RheSBvcGVuOiB3aGlsZSB0aGUgbGF5b3V0IGlzIG91dCBvZgpzdGVwIHRoZSBHb3Zlcm5vciByZWZ1c2VzIHByb3Bvc2FscyAoYFN0b3JhZ2VWZXJzaW9uTWlzbWF0Y2hgKSwgc28gYQptaWdyYXRpb24gdGhhdCBuZWVkZWQgYSBwcm9wb3NhbCBjb3VsZCBuZXZlciBydW4uAAAAAAAHbWlncmF0ZQAAAAAAAAAAAA==", "AAAAAAAAA75DcmVhdGVzIGEgcHJvcG9zYWwgYW5kIHJldHVybnMgaXRzIGlkICh0aGUgaGFzaCBvZiBpdHMgYWN0aW9ucyBhbmQKZGVzY3JpcHRpb24pLiBOZWVkcyBgcHJvcG9zZXJgJ3MgYXV0aCBhbmQgYXQgbGVhc3QKYHZvdGVzX25lZWRlZF90b19wcm9wb3NlYCB2b3RlcyBhdCB0aGUgcHJldmlvdXMgbGVkZ2VyCihgSW5zdWZmaWNpZW50UHJvcG9zZXJWb3Rlc2ApLiBPbmx5IG9uY2UgbGF1bmNoZWQgKGBOb3RMaXZlYCkuCgpUaGUgcHJvcG9zYWwgaGFzIDEgdG8gYE1BWF9QUk9QT1NBTF9BQ1RJT05TYCBhY3Rpb25zCihgRW1wdHlQcm9wb3NhbGAsIGBUb29NYW55QWN0aW9uc2ApLCBtYXRjaGluZyBsZW5ndGhzCihgSW52YWxpZFByb3Bvc2FsTGVuZ3RoYCksIGEgZGVzY3JpcHRpb24gdXAgdG8gT3BlblplcHBlbGluJ3MgbGltaXQKKGBEZXNjcmlwdGlvblRvb0xvbmdgKSwgYW5kIGFuIGlkIG5vdCB1c2VkIGJlZm9yZQooYFByb3Bvc2FsQWxyZWFkeUV4aXN0c2ApLiBJdHMgYWN0aW9ucyBtYXkgbm90IGNhbGwgYGNvbnN1bWVgCihgQ2Fubm90Q29uc3VtZWApIG9yIG1pbnQgbW9yZSB0aGFuIG9uZSBleGVjdXRpb24gY2FuIHB1Ymxpc2gKKGBNaW50c1Rvb0xhcmdlYCk7IHNlZSBgY2hlY2tfYWN0aW9uc2AuCgpWb3RlcywgdGhlIHF1b3J1bSBzdXBwbHkgYW5kIHRoZSB0aHJlc2hvbGQgY2FwIGFyZSBhbGwgcmVhZCBhdCB0aGUKcHJldmlvdXMgbGVkZ2VyLCBzbyB0b2tlbnMgbWludGVkIGluIHRoZSBwcm9wb3NpbmcgbGVkZ2VyIGNvdW50IHRvd2FyZApub25lIG9mIHRoZW0uIFRoZSBxdW9ydW0gaXMgZml4ZWQgbm93IGFuZCBzdG9yZWQgb24gdGhlIHByb3Bvc2FsLgpWb3RpbmcgcnVucyBmcm9tIG5vdyBwbHVzIHRoZSB2b3RpbmcgZGVsYXkgZm9yIHRoZSB2b3RpbmcgcGVyaW9kLgpFbWl0cyBPcGVuWmVwcGVsaW4gYFByb3Bvc2FsQ3JlYXRlZGAgYW5kIGBQcm9wb3NhbFNjaGVkdWxlZGAuAAAAAAAHcHJvcG9zZQAAAAAFAAAAAAAAAAd0YXJnZXRzAAAAA+oAAAATAAAAAAAAAAlmdW5jdGlvbnMAAAAAAAPqAAAAEQAAAAAAAAAEYXJncwAAA+oAAAPqAAAAAAAAAAAAAAALZGVzY3JpcHRpb24AAAAAEAAAAAAAAAAIcHJvcG9zZXIAAAATAAAAAQAAA+4AAAAg", "AAAAAAAAAe9SZXBsYWNlcyB0aGlzIEdvdmVybm9yJ3MgY29kZSB3aXRoIGB0b19oYXNoYC4gQWRtaW4gb25seTogdGhlIGxhdW5jaAphZG1pbiBkdXJpbmcgc2V0dXAsIHRoZSBUcmVhc3VyeSAoYSBwYXNzZWQgcHJvcG9zYWwpIG9uY2UgbGl2ZS4KCmBmcm9tX2hhc2hgIG11c3QgYmUgdGhlIHJ1bm5pbmcgY29kZSdzIGhhc2ggYW5kIHRoZSBNYW5hZ2VyIG11c3QKYXBwcm92ZSBgZnJvbV9oYXNoIC0+IHRvX2hhc2hgIChgY29tbW9uOjp1cGdyYWRlOjphcHBseWApLiBEYXRhIGlzIG5vdAp0b3VjaGVkOyBpZiB0aGUgbmV3IGNvZGUgZXhwZWN0cyBhIG5ld2VyIGxheW91dCwgY2FsbCBgbWlncmF0ZWAgbmV4dAoodGhlIHNhbWUgcHJvcG9zYWwgbWF5IGRvIGl0LCBhcyBpdHMgbmV4dCBhY3Rpb24pLiBOb3QgYmVoaW5kIHRoZQpzdG9yYWdlLWxheW91dCBnYXRlLCBzbyBhIG1vZHVsZSB3aG9zZSBsYXlvdXQgaXMgb3V0IG9mIHN0ZXAgY2FuIHN0aWxsCm1vdmUgdG8gZml4ZWQgY29kZS4AAAAAB3VwZ3JhZGUAAAAAAgAAAAAAAAAJZnJvbV9oYXNoAAAAAAAD7gAAACAAAAAAAAAAB3RvX2hhc2gAAAAD7gAAACAAAAAA", "AAAAAAAAAHpUaGUgcmVnaXN0cnkgdmVyc2lvbiBvZiB0aGUgcnVubmluZyBjb2RlIChENiksIGFzIGZvciBldmVyeSBtb2R1bGUuCk9aIHdvdWxkIHN0b3JlIGl0IGFuZCBuZWVkIGEgc3luYyBhZnRlciBldmVyeSB1cGdyYWRlLgAAAAAAB3ZlcnNpb24AAAAAAAAAAAEAAAAQ", "AAAAAAAAAHZUaGUgcHJvcG9zYWwncyBzdG9yZWQgd2luZG93LCBldGEgYW5kIHNlcXVlbmNlIG51bWJlciwgYW5kIGl0cyBzdGF0ZQpub3cuIFBhbmljcyBgUHJvcG9zYWxOb3RGb3VuZGAgZm9yIGFuIHVua25vd24gaWQuAAAAAAAIcHJvcG9zYWwAAAABAAAAAAAAAAtwcm9wb3NhbF9pZAAAAAPuAAAAIAAAAAEAAAfQAAAADFByb3Bvc2FsSW5mbw==", "AAAAAAAAAH5UaGUgVHJlYXN1cnkgd2lyZWQgYXQgY29uc3RydWN0aW9uOiB0aGUgb25seSBjYWxsZXIgYGNvbnN1bWVgCmFjY2VwdHMsIGFuZCB0aGUgYWRtaW4gb25jZSBsaXZlLiBGaXhlZCBmb3IgdGhlIEdvdmVybm9yJ3MgbGlmZS4AAAAAAAh0cmVhc3VyeQAAAAAAAAABAAAAEw==", "AAAAAAAAAX5DYXN0cyBgdm90ZXJgJ3Mgdm90ZSBhbmQgcmV0dXJucyBpdHMgd2VpZ2h0OiAwIEFnYWluc3QsIDEgRm9yLAoyIEFic3RhaW4gKGBJbnZhbGlkVm90ZVR5cGVgIG90aGVyd2lzZSkuIE5lZWRzIGB2b3RlcmAncyBhdXRoLCBhbgpBY3RpdmUgcHJvcG9zYWwgKGBQcm9wb3NhbE5vdEFjdGl2ZWApLCBub256ZXJvIHdlaWdodCBhdCB0aGUKcHJvcG9zYWwncyBzbmFwc2hvdCAoYFplcm9Wb3RpbmdXZWlnaHRgKSwgYSByZWFzb24gdXAgdG8KYE1BWF9QUk9QT1NBTF9DT01NRU5UX0xFTkdUSGAgKGBDb21tZW50VG9vTG9uZ2ApLCBhbmQgbm8gZWFybGllciB2b3RlCmJ5IGB2b3RlcmAgb24gaXQgKGBBbHJlYWR5Vm90ZWRgKS4gRW1pdHMgT3BlblplcHBlbGluIGBWb3RlQ2FzdGAuAAAAAAAJY2FzdF92b3RlAAAAAAAABAAAAAAAAAALcHJvcG9zYWxfaWQAAAAD7gAAACAAAAAAAAAACXZvdGVfdHlwZQAAAAAAAAQAAAAAAAAABnJlYXNvbgAAAAAAEAAAAAAAAAAFdm90ZXIAAAAAAAATAAAAAQAAAAo=", "AAAAAAAAAMlSZXR1cm5zIHdoZXRoZXIgYW4gYWNjb3VudCBoYXMgdm90ZWQgb24gYSBwcm9wb3NhbC4KCiMgQXJndW1lbnRzCgoqIGBlYCAtIEFjY2VzcyB0byB0aGUgU29yb2JhbiBlbnZpcm9ubWVudC4KKiBgcHJvcG9zYWxfaWRgIC0gVGhlIHVuaXF1ZSBpZGVudGlmaWVyIG9mIHRoZSBwcm9wb3NhbC4KKiBgYWNjb3VudGAgLSBUaGUgYWRkcmVzcyB0byBjaGVjay4AAAAAAAAJaGFzX3ZvdGVkAAAAAAAAAgAAAAAAAAALcHJvcG9zYWxfaWQAAAAD7gAAACAAAAAAAAAAB2FjY291bnQAAAAAEwAAAAEAAAAB", "AAAAAAAAAEFXQVNNIGhhc2ggb2YgdGhlIHJ1bm5pbmcgY29kZSwgYXMgcmVjb3JkZWQgYnkgdGhlIGxhc3QgYHVwZ3JhZGVgLgAAAAAAAAl3YXNtX2hhc2gAAAAAAAAAAAAAAQAAA+4AAAAg", "AAAAAAAAAIlUaGUgcXVvcnVtIHJhdGUgbmV3IHByb3Bvc2FscyB1c2UsIGluIGJhc2lzIHBvaW50cyBvZiB0aGUgdm90aW5nCnN1cHBseS4gQSBwcm9wb3NhbCBrZWVwcyB0aGUgcXVvcnVtIGZpeGVkIHdoZW4gaXQgd2FzIG1hZGUgKGBwcm9wb3NhbGApLgAAAAAAAApxdW9ydW1fYnBzAAAAAAAAAAAAAQAAAAQ=", "AAAAAAAAAZhXaGVyZSB0aGlzIEdvdmVybm9yJ3Mgdm90aW5nIHBvd2VyIGNvbWVzIGZyb206IHRoZSBEQU8ncyBUb2tlbiwgb3IgYW4KYWRhcHRlciB0aGUgTWFuYWdlciBhcHByb3ZlZCB3aGVuIHRoZSBEQU8gd2FzIGNyZWF0ZWQuIEZpeGVkIGZvciB0aGUKR292ZXJub3IncyBsaWZlIChPWidzIHRva2VuLWNvbnRyYWN0IHNsb3QgaXMgc2V0IG9uY2UpLgoKU3RvcmVkIGluIE9wZW5aZXBwZWxpbidzIHRva2VuLWNvbnRyYWN0IHNsb3QsIHNvIE9aJ3MKYGdldF90b2tlbl9jb250cmFjdCgpYCByZXR1cm5zIHRoZSBzYW1lIGFkZHJlc3M7IGZvciBhbiBhZGFwdGVyIERBTyBpdAppcyB0aGUgYWRhcHRlciwgbm90IHRoZSBtZW1iZXJzaGlwIE5GVCAoZmluZCB0aGF0IHRocm91Z2ggdGhlIFRyZWFzdXJ5Cm9yIHRoZSBNYW5hZ2VyKS4AAAALdm90ZV9zb3VyY2UAAAAAAAAAAAEAAAAT", "AAAAAAAAAQRJZHMgb2YgdGhlIHByb3Bvc2FscyB3aXRoIHNlcXVlbmNlIG51bWJlcnMgYHN0YXJ0Li5zdGFydCArIGxpbWl0YCwgaW4KY3JlYXRpb24gb3JkZXIuIGBsaW1pdGAgaXMgY2FwcGVkIGF0IGBNQVhfUFJPUE9TQUxfSURTX1BBR0VgOyB0aGUgcGFnZQplbmRzIGVhcmx5IGF0IGBwcm9wb3NhbF9jb3VudCgpYC4gQW4gaWQgZW50cnkgYXJjaGl2ZWQgYWZ0ZXIgaXRzCnByb3Bvc2FsIGVuZGVkIG11c3QgYmUgcmVzdG9yZWQgYmVmb3JlIGl0IGNhbiBiZSByZWFkLgAAAAxwcm9wb3NhbF9pZHMAAAACAAAAAAAAAAVzdGFydAAAAAAAAAQAAAAAAAAABWxpbWl0AAAAAAAABAAAAAEAAAPqAAAD7gAAACA=", "AAAAAAAAAMhTZWNvbmRzIGJldHdlZW4gYHByb3Bvc2VgIGFuZCB0aGUgc3RhcnQgb2Ygdm90aW5nOiBhIG5vdGljZSBwZXJpb2QuClZvdGVzIGFyZSByZWFkIGF0IHRoZSBsZWRnZXIgYmVmb3JlIGBwcm9wb3NlYCwgc28gZGVsZWdhdGluZyBvcgp0cmFuc2ZlcnJpbmcgZHVyaW5nIHRoZSBkZWxheSBkb2VzIG5vdCBjaGFuZ2UgdGhhdCBwcm9wb3NhbCdzIHZvdGVzLgAAAAx2b3RpbmdfZGVsYXkAAAAAAAAAAQAAAAQ=", "AAAAAAAABABJbml0aWFsaXplcyB0aGUgZ292ZXJub3IgY29udHJhY3Qgd2l0aCBnb3Zlcm5hbmNlIHBhcmFtZXRlcnMuCgpTZXRzIHVwIGFsbCBnb3Zlcm5hbmNlIHBhcmFtZXRlcnMgaW5jbHVkaW5nIHZvdGluZyBwZXJpb2RzLCBxdW9ydW0gcmVxdWlyZW1lbnRzLAphbmQgYXNzb2NpYXRlZCBjb250cmFjdHMuIEFsbCBwYXJhbWV0ZXJzIGFyZSBjb25maWd1cmFibGUgcG9zdC1kZXBsb3ltZW50IGJ5CmF1dGhvcml6ZWQgYWRkcmVzc2VzLgoKIyBBcmd1bWVudHMKCiogYGFkbWluYCAtIFNldHVwLXBoYXNlIGFkbWluICh0aGUgbGF1bmNoIGFkbWluKTsgYmVjb21lcyB0aGUgVHJlYXN1cnkgYXQgbGF1bmNoCiogYHRva2VuX2NvbnRyYWN0YCAtIFRoZSB2b3RlIHNvdXJjZTogdGhlIERBTydzIFRva2VuLCBvciBhbiBhcHByb3ZlZAphZGFwdGVyIGltcGxlbWVudGluZyBgY29tbW9uOjpjbGllbnRzOjpWb3RlU291cmNlQXBpYC4gUGVybWFuZW50LgoqIGB0cmVhc3VyeV9jb250cmFjdGAgLSBUaGUgdHJlYXN1cnkgY29udHJhY3QgdGhhdCBleGVjdXRlcyBhcHByb3ZlZCBwcm9wb3NhbHMKKiBgdm90aW5nX2RlbGF5YCAtIERlbGF5IGluIHNlY29uZHMgYmV0d2VlbiBwcm9wb3NhbCBjcmVhdGlvbiBhbmQgdm90ZSBzdGFydAoqIGB2b3RpbmdfcGVyaW9kYCAtIER1cmF0aW9uIGluIHNlY29uZHMgdGhhdCB2b3RpbmcgcmVtYWlucyBvcGVuCiogYHF1ZXVlX2RlbGF5YCAtIERlbGF5IGluIHNlY29uZHMgYmV0d2VlbiBhcHByb3ZhbCBhbmQgZXhlY3V0aW9uIChtaW5pbXVtIDUgbWludXRlcykKKiBgcHJvcG9zYWxfdGhyZXNob2xkYCAtIE1pbmltdW0gdm90aW5nIHBvd2VyIHJlcXVpcmVkIHRvIGNyZWF0ZSBwcm9wb3NhbHMKKiBgcXVvcnVtX2Jwc2AgLSBNaW5pbXVtIHBhcnRpY2lwYXRpb24gaW4gYmFzaXMgcG9pbnRzIChlLmcuLCAyNTAwID0gMjUlKQoKIyBQYW5pY3MKClBhbmljcyBpZiBgcXVvcnVtX2Jwc2AgZXhjZWVkcyBgQlBTX0RFTk9NSU5BVE9SYCAoMTAsMDAwKS4KCiMgRXZlbnRzCgpFbWl0cyBhIGBHb3ZlAAAADV9fY29uc3RydWN0b3IAAAAAAAAKAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAADnRva2VuX2NvbnRyYWN0AAAAAAATAAAAAAAAABF0cmVhc3VyeV9jb250cmFjdAAAAAAAABMAAAAAAAAADHZvdGluZ19kZWxheQAAAAQAAAAAAAAADXZvdGluZ19wZXJpb2QAAAAAAAAEAAAAAAAAAAtxdWV1ZV9kZWxheQAAAAAEAAAAAAAAABJwcm9wb3NhbF90aHJlc2hvbGQAAAAAAAoAAAAAAAAACnF1b3J1bV9icHMAAAAAAAQAAAAAAAAAB21hbmFnZXIAAAAAEwAAAAAAAAAMY3VycmVudF9oYXNoAAAD7gAAACAAAAAA", "AAAAAAAAARhSZXR1cm5zIGEgc3ltYm9sIGlkZW50aWZ5aW5nIHRoZSBjb3VudGluZyBzdHJhdGVneS4KClRoaXMgZnVuY3Rpb24gaXMgZXhwZWN0ZWQgdG8gYmUgdXNlZCB0byBkaXNwbGF5IGh1bWFuLXJlYWRhYmxlCmluZm9ybWF0aW9uIGFib3V0IHRoZSBjb3VudGluZyBzdHJhdGVneSwgZm9yIGV4YW1wbGUgaW4gVUlzLgoKRm9yIHNpbXBsZSBjb3VudGluZywgdGhpcyByZXR1cm5zIGAic2ltcGxlImAuCgojIEFyZ3VtZW50cwoKKiBgZWAgLSBBY2Nlc3MgdG8gdGhlIFNvcm9iYW4gZW52aXJvbm1lbnQuAAAADWNvdW50aW5nX21vZGUAAAAAAAAAAAAAAQAAABE=", "AAAAAAAAABpTZWNvbmRzIHZvdGluZyBzdGF5cyBvcGVuLgAAAAAADXZvdGluZ19wZXJpb2QAAAAAAAAAAAAAAQAAAAQ=", "AAAAAAAAAFJOdW1iZXIgb2YgcHJvcG9zYWxzIGV2ZXIgY3JlYXRlZDsgaWRzIGhhdmUgc2VxdWVuY2UgbnVtYmVycwpgMC4ucHJvcG9zYWxfY291bnQoKWAuAAAAAAAOcHJvcG9zYWxfY291bnQAAAAAAAAAAAABAAAABA==", "AAAAAAAAAJNUaGUgcHJvcG9zYWwncyBzdGF0ZSBub3cgKFBlbmRpbmcsIEFjdGl2ZSwgRGVmZWF0ZWQsIFN1Y2NlZWRlZCwKUXVldWVkLCBFeHBpcmVkLCBFeGVjdXRlZCBvciBDYW5jZWxlZCkuIEZhaWxzIGBQcm9wb3NhbE5vdEZvdW5kYCBmb3IKYW4gdW5rbm93biBpZC4AAAAADnByb3Bvc2FsX3N0YXRlAAAAAAABAAAAAAAAAAtwcm9wb3NhbF9pZAAAAAPuAAAAIAAAAAEAAAfQAAAADVByb3Bvc2FsU3RhdGUAAAA=", "AAAAAAAAAJ9TZXRzIHRoZSBxdW9ydW0gYXMgYmFzaXMgcG9pbnRzIG9mIHRoZSB2b3Rpbmcgc3VwcGx5ICgxLi49MTAsMDAwKS4KQWRtaW4gb25seS4gRWFjaCBwcm9wb3NhbCBrZWVwcyB0aGUgcXVvcnVtIGZpeGVkIHdoZW4gaXQgd2FzIG1hZGUuCkVtaXRzIGBRdW9ydW1CcHNDaGFuZ2VkYC4AAAAADnNldF9xdW9ydW1fYnBzAAAAAAABAAAAAAAAAApxdW9ydW1fYnBzAAAAAAAEAAAAAA==", "AAAAAAAAAyhSZXR1cm5zIHRoZSBwcm9wb3NhbCBJRCBjb21wdXRlZCBmcm9tIHRoZSBwcm9wb3NhbCBkZXRhaWxzLgoKVGhlIHByb3Bvc2FsIElEIGlzIGEgZGV0ZXJtaW5pc3RpYyBrZWNjYWsyNTYgaGFzaCBvZiB0aGUgWERSLXNlcmlhbGl6ZWQKdGFyZ2V0cywgZnVuY3Rpb25zLCBhcmdzLCBhbmQgZGVzY3JpcHRpb24gaGFzaC4gVGhpcyBhbGxvd3MgYW55b25lIHRvCmNvbXB1dGUgdGhlIElEIHdpdGhvdXQgc3RvcmluZyB0aGUgZnVsbCBwcm9wb3NhbCBkYXRhLgoKVGhlIGBkZXNjcmlwdGlvbl9oYXNoYCBpcyBjb21wdXRlZCBhcwpga2VjY2FrMjU2KGRlc2NyaXB0aW9uLnRvX2J5dGVzKCkpYCwgaS5lLiwgYSBrZWNjYWsyNTYgaGFzaCBvZiB0aGUKcmF3IFVURi04IGJ5dGVzIG9mIHRoZSBkZXNjcmlwdGlvbiBzdHJpbmcuIE9mZi1jaGFpbiBjbGllbnRzIGNhbgpyZXByb2R1Y2UgdGhpcyBieSBoYXNoaW5nIHRoZSByYXcgc3RyaW5nIGJ5dGVzIGRpcmVjdGx5IOKAlCBubyBYRFIKZW5jb2RpbmcgaXMgcmVxdWlyZWQuCgojIEFyZ3VtZW50cwoKKiBgZWAgLSBBY2Nlc3MgdG8gdGhlIFNvcm9iYW4gZW52aXJvbm1lbnQuCiogYHRhcmdldHNgIC0gVGhlIGFkZHJlc3NlcyBvZiBjb250cmFjdHMgdG8gY2FsbC4KKiBgZnVuY3Rpb25zYCAtIFRoZSBmdW5jdGlvbiBuYW1lcyB0byBpbnZva2Ugb24gZWFjaCB0YXJnZXQuCiogYGFyZ3NgIC0gVGhlIGFyZ3VtZW50cyBmb3IgZWFjaCBmdW5jdGlvbiBjYWxsLgoqIGBkZXNjcmlwdGlvbl9oYXNoYCAtIFRoZSBrZWNjYWsyNTYgaGFzaCBvZiB0aGUgZGVzY3JpcHRpb24ncyByYXcKYnl0ZXMuAAAAD2dldF9wcm9wb3NhbF9pZAAAAAAEAAAAAAAAAAd0YXJnZXRzAAAAA+oAAAATAAAAAAAAAAlmdW5jdGlvbnMAAAAAAAPqAAAAEQAAAAAAAAAEYXJncwAAA+oAAAPqAAAAAAAAAAAAAAAQZGVzY3JpcHRpb25faGFzaAAAA+4AAAAgAAAAAQAAA+4AAAAg", "AAAAAAAAAQNTZXRzIHRoZSBkZWxheSBiZXR3ZWVuIGBxdWV1ZWAgYW5kIHRoZSBlYXJsaWVzdCBgdHJlYXN1cnkuZXhlY3V0ZWAKKHNlY29uZHMsIGBNSU5fUVVFVUVfREVMQVkuLj1NQVhfUVVFVUVfREVMQVlgKS4gQWRtaW4gb25seTogdGhlIGxhdW5jaAphZG1pbiBkdXJpbmcgc2V0dXAsIGEgcGFzc2VkIHByb3Bvc2FsIG9uY2UgbGl2ZS4gQXBwbGllcyB0byBwcm9wb3NhbHMKcXVldWVkIGFmdGVyIHRoZSBjaGFuZ2UuIEVtaXRzIGBRdWV1ZURlbGF5Q2hhbmdlZGAuAAAAAA9zZXRfcXVldWVfZGVsYXkAAAAAAQAAAAAAAAALcXVldWVfZGVsYXkAAAAABAAAAAA=", "AAAAAAAAAOFTdG9yYWdlLWxheW91dCB2ZXJzaW9uIG9mIHRoZSBkYXRhIGhlbGQgYnkgdGhpcyBjb250cmFjdC4gV2hpbGUgaXQKZGlmZmVycyBmcm9tIHRoZSBjb2RlJ3MgYFNUT1JBR0VfVkVSU0lPTmAsIGV2ZXJ5IGdhdGVkIGVudHJ5IHBvaW50CmZhaWxzIGBTdG9yYWdlVmVyc2lvbk1pc21hdGNoYCB1bnRpbCBgbWlncmF0ZWAgKG9yIGFuIHVwZ3JhZGUpIGJyaW5ncwp0aGUgdHdvIGJhY2sgaW4gc3RlcC4AAAAAAAAPc3RvcmFnZV92ZXJzaW9uAAAAAAAAAAABAAAABA==", "AAAAAAAAAMZTZXRzIHRoZSBub3RpY2UgcGVyaW9kIGJldHdlZW4gYHByb3Bvc2VgIGFuZCB0aGUgc3RhcnQgb2Ygdm90aW5nCihzZWNvbmRzLCBgTUlOX1ZPVElOR19ERUxBWS4uPU1BWF9WT1RJTkdfREVMQVlgKS4gQWRtaW4gb25seS4gQXBwbGllcwp0byBwcm9wb3NhbHMgbWFkZSBhZnRlciB0aGUgY2hhbmdlLiBFbWl0cyBgVm90aW5nRGVsYXlDaGFuZ2VkYC4AAAAAABBzZXRfdm90aW5nX2RlbGF5AAAAAQAAAAAAAAAMdm90aW5nX2RlbGF5AAAABAAAAAA=", "AAAAAAAAAFZXaGVuIHZvdGluZyBlbmRzLCBpbiB1bml4IHNlY29uZHMgKG5vdCBhIGxlZGdlciBudW1iZXIsIGFzCk9wZW5aZXBwZWxpbiBkb2N1bWVudHMgaXQpLgAAAAAAEXByb3Bvc2FsX2RlYWRsaW5lAAAAAAAAAQAAAAAAAAALcHJvcG9zYWxfaWQAAAAD7gAAACAAAAABAAAABA==", "AAAAAAAAAEVUaGUgYWNjb3VudCB0aGF0IG1hZGUgdGhlIHByb3Bvc2FsICh0aGUgb25seSBvbmUgdGhhdCBtYXkgY2FuY2VsIGl0KS4AAAAAAAARcHJvcG9zYWxfcHJvcG9zZXIAAAAAAAABAAAAAAAAAAtwcm9wb3NhbF9pZAAAAAPuAAAAIAAAAAEAAAAT", "AAAAAAAAAERUaGUgbGVkZ2VyIHRoZSBwcm9wb3NhbCByZWFkcyB2b3RlcyBhdDogdGhlIGxlZGdlciBiZWZvcmUgYHByb3Bvc2VgLgAAABFwcm9wb3NhbF9zbmFwc2hvdAAAAAAAAAEAAAAAAAAAC3Byb3Bvc2FsX2lkAAAAA+4AAAAgAAAAAQAAAAQ=", "AAAAAAAAAKhTZXRzIGhvdyBsb25nIHZvdGluZyBzdGF5cyBvcGVuIChzZWNvbmRzLApgTUlOX1ZPVElOR19QRVJJT0QuLj1NQVhfVk9USU5HX1BFUklPRGApLiBBZG1pbiBvbmx5LiBBcHBsaWVzIHRvCnByb3Bvc2FscyBtYWRlIGFmdGVyIHRoZSBjaGFuZ2UuIEVtaXRzIGBWb3RpbmdQZXJpb2RDaGFuZ2VkYC4AAAARc2V0X3ZvdGluZ19wZXJpb2QAAAAAAAABAAAAAAAAAA12b3RpbmdfcGVyaW9kAAAAAAAABAAAAAA=", "AAAAAAAAAOhSZXR1cm5zIHRoZSBhZGRyZXNzIG9mIHRoZSB0b2tlbiBjb250cmFjdCB0aGF0IGltcGxlbWVudHMgdGhlIFZvdGVzCnRyYWl0LgoKIyBBcmd1bWVudHMKCiogYGVgIC0gQWNjZXNzIHRvIHRoZSBTb3JvYmFuIGVudmlyb25tZW50LgoKIyBFcnJvcnMKCiogW2BHb3Zlcm5vckVycm9yOjpUb2tlbkNvbnRyYWN0Tm90U2V0YF0gLSBPY2N1cnMgaWYgdGhlIHRva2VuIGNvbnRyYWN0CmhhcyBub3QgYmVlbiBzZXQuAAAAEmdldF90b2tlbl9jb250cmFjdAAAAAAAAAAAAAEAAAAT", "AAAAAAAAAOVSZXR1cm5zIHRoZSBtaW5pbXVtIHZvdGluZyBwb3dlciByZXF1aXJlZCB0byBjcmVhdGUgYSBwcm9wb3NhbC4KCiMgQXJndW1lbnRzCgoqIGBlYCAtIEFjY2VzcyB0byB0aGUgU29yb2JhbiBlbnZpcm9ubWVudC4KCiMgRXJyb3JzCgoqIFtgR292ZXJub3JFcnJvcjo6UHJvcG9zYWxUaHJlc2hvbGROb3RTZXRgXSAtIE9jY3VycyBpZiB0aGUgcHJvcG9zYWwKdGhyZXNob2xkIGhhcyBub3QgYmVlbiBzZXQuAAAAAAAAEnByb3Bvc2FsX3RocmVzaG9sZAAAAAAAAAAAAAEAAAAK", "AAAAAAAAAGtBbHdheXMgdHJ1ZTogYSBwcm9wb3NhbCBtdXN0IGJlIHF1ZXVlZCwgYW5kIHdhaXQgb3V0IHRoZSBxdWV1ZSBkZWxheSwKYmVmb3JlIGB0cmVhc3VyeS5leGVjdXRlYCBjYW4gcnVuIGl0LgAAAAAWcHJvcG9zYWxzX25lZWRfcXVldWluZwAAAAAAAAAAAAEAAAAB", "AAAAAAAAAM9TZXRzIHRoZSB2b3RlcyBhIHByb3Bvc2VyIG5lZWRzIChub256ZXJvLCBhbmQgbm90IGFib3ZlIHRoZSB2b3RpbmcKc3VwcGx5IG9uY2UgdGhlcmUgaXMgb25lKS4gQWRtaW4gb25seS4gYHByb3Bvc2VgIGNhcHMgaXQgYXQgdGhlIHZvdGluZwpzdXBwbHkgKGB2b3Rlc19uZWVkZWRfdG9fcHJvcG9zZWApLiBFbWl0cyBgUHJvcG9zYWxUaHJlc2hvbGRDaGFuZ2VkYC4AAAAAFnNldF9wcm9wb3NhbF90aHJlc2hvbGQAAAAAAAEAAAAAAAAAEnByb3Bvc2FsX3RocmVzaG9sZAAAAAAACgAAAAA=", "AAAAAAAAARNUaGUgdm90ZXMgYSBwcm9wb3NhbCBtYWRlIG5vdyBuZWVkczogYHByb3Bvc2FsX3RocmVzaG9sZGAsIGNhcHBlZCBhdAp0aGUgdm90aW5nIHN1cHBseSBhdCB0aGUgcHJldmlvdXMgbGVkZ2VyIGFuZCBuZXZlciBiZWxvdyAxICh0aGUgcnVsZQpgcHJvcG9zZWAgYXBwbGllcykuIEZyb250IGVuZHMgcmVhZCB0aGlzIHJhdGhlciB0aGFuIHJlY29tcHV0aW5nIGl0LApzbyBhIEdvdmVybm9yIHdpdGhvdXQgdGhlIGNhcCAod2hpY2ggbGFja3MgdGhpcyB2aWV3KSBpcyB0b2xkIGFwYXJ0LgAAAAAXdm90ZXNfbmVlZGVkX3RvX3Byb3Bvc2UAAAAAAAAAAAEAAAAK", "AAAABQAAAKtFbWl0dGVkIGJ5IFtgaGFuZG9mZmBdLiBUaGUgZW1pdHRpbmcgY29udHJhY3QgYWRkcmVzcyBpcyB0aGUgZXZlbnQncyBjb250cmFjdCBpZC4KClNhbWUgc2hhcGUgYXMgdGhlIE1hbmFnZXIncyBvd24gYEFkbWluQ2hhbmdlZGAsIHNvIGluZGV4ZXJzIGRlY29kZSBib3RoCndpdGggb25lIHNjaGVtYS4AAAAAAAAAAAxBZG1pbkNoYW5nZWQAAAABAAAADWFkbWluX2NoYW5nZWQAAAAAAAACAAAAMFRoZSBhZG1pbiBiZWZvcmUgdGhlIGhhbmRvZmYgKHRoZSBsYXVuY2ggYWRtaW4pLgAAAAlvbGRfYWRtaW4AAAAAAAATAAAAAQAAACJUaGUgYWRtaW4gYWZ0ZXIgaXQgKHRoZSBUcmVhc3VyeSkuAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAEAAAAC", "AAAABAAAAD5FcnJvcnMgc2hhcmVkIGJ5IGFsbCBtb2R1bGUgY29udHJhY3RzIChibG9jayBgY29kZXM6OkNPTU1PTmApLgAAAAAAAAAAAAtDb21tb25FcnJvcgAAAAANAAAANE9wZXJhdGlvbiByZXF1aXJlcyB0aGUgbW9kdWxlIHRvIGJlIGxpdmUgKGxhdW5jaGVkKS4AAAAHTm90TGl2ZQAAABtZAAAAQU9wZXJhdGlvbiBpcyBvbmx5IHZhbGlkIGR1cmluZyBzZXR1cDsgdGhlIG1vZHVsZSBpcyBhbHJlYWR5IGxpdmUuAAAAAAAAC0FscmVhZHlMaXZlAAAAG1oAAAAlTWFuYWdlciBhZGRyZXNzIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAAAAA1NYW5hZ2VyTm90U2V0AAAAAAAbWwAAACNgQ3VycmVudEhhc2hgIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAARQ3VycmVudEhhc2hOb3RTZXQAAAAAABtcAAAANGBmcm9tX2hhc2hgIGRvZXMgbm90IGVxdWFsIHRoZSBzdG9yZWQgYEN1cnJlbnRIYXNoYC4AAAAMSGFzaE1pc21hdGNoAAAbXQAAACpNYW5hZ2VyIGRpZCBub3QgYXBwcm92ZSB0aGlzIHVwZ3JhZGUgcGF0aC4AAAAAABJVcGdyYWRlTm90QXBwcm92ZWQAAAAAG14AAAA1TWFuYWdlciBoYXMgbm8gcmVnaXN0cnkgZW50cnkgZm9yIHRoZSByZXF1ZXN0ZWQgaGFzaC4AAAAAAAAWSW1wbGVtZW50YXRpb25Ob3RGb3VuZAAAAAAbXwAAACJNb2R1bGUgYWRtaW4gbWlzc2luZyBmcm9tIHN0b3JhZ2UuAAAAAAALQWRtaW5Ob3RTZXQAAAAbYAAAAD9UaGUgTWFuYWdlcidzIG93biBgQ3VycmVudE1hbmFnZXJWZXJzaW9uYCBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAADVZlcnNpb25Ob3RTZXQAAAAAABthAAAAJlRyZWFzdXJ5IGFkZHJlc3MgbWlzc2luZyBmcm9tIHN0b3JhZ2UuAAAAAAAOVHJlYXN1cnlOb3RTZXQAAAAAG2IAAAAmR292ZXJub3IgYWRkcmVzcyBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAAAA5Hb3Zlcm5vck5vdFNldAAAAAAbYwAAADxgbWlncmF0ZWAgY2FsbGVkIHdoaWxlIHRoZSBzdG9yZWQgbGF5b3V0IGlzIGFscmVhZHkgY3VycmVudC4AAAAQTm90aGluZ1RvTWlncmF0ZQAAG2QAAAAmYFN0b3JhZ2VWZXJzaW9uYCBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAAABRTdG9yYWdlVmVyc2lvbk5vdFNldAAAG2U=", "AAAABQAAAHZFbWl0dGVkIGJ5IFtgbWlncmF0ZWBdIHdoZW4gdGhlIHN0b3JlZCBsYXlvdXQgbW92ZXMgZm9yd2FyZC4gVGhlIGVtaXR0aW5nCmNvbnRyYWN0IGFkZHJlc3MgaXMgdGhlIGV2ZW50J3MgY29udHJhY3QgaWQuAAAAAAAAAAAACE1pZ3JhdGVkAAAAAQAAAAhtaWdyYXRlZAAAAAIAAAAoVGhlIGxheW91dCB2ZXJzaW9uIGJlZm9yZSB0aGUgbWlncmF0aW9uLgAAABRmcm9tX3N0b3JhZ2VfdmVyc2lvbgAAAAQAAAAAAAAAO1RoZSBsYXlvdXQgdmVyc2lvbiBhZnRlciBpdCAodGhlIGNvZGUncyBgU1RPUkFHRV9WRVJTSU9OYCkuAAAAABJ0b19zdG9yYWdlX3ZlcnNpb24AAAAAAAQAAAAAAAAAAg==", "AAAABQAAAE1FbWl0dGVkIGJ5IGBhcHBseWAuIFRoZSBlbWl0dGluZyBjb250cmFjdCBhZGRyZXNzIGlzIHRoZSBldmVudCdzIGNvbnRyYWN0IGlkLgAAAAAAAAAAAAAIVXBncmFkZWQAAAABAAAACHVwZ3JhZGVkAAAAAwAAACFUaGUgY29kZSBoYXNoIGJlZm9yZSB0aGUgdXBncmFkZS4AAAAAAAAJZnJvbV9oYXNoAAAAAAAD7gAAACAAAAABAAAAF1RoZSBjb2RlIGhhc2ggYWZ0ZXIgaXQuAAAAAAd0b19oYXNoAAAAA+4AAAAgAAAAAQAAAC1UaGUgcmVnaXN0cnkncyByZWxlYXNlIHZlcnNpb24gZm9yIGB0b19oYXNoYC4AAAAAAAAHdmVyc2lvbgAAAAAQAAAAAAAAAAI=", "AAAABQAAACJFdmVudCBlbWl0dGVkIHdoZW4gYSB2b3RlIGlzIGNhc3QuAAAAAAAAAAAACFZvdGVDYXN0AAAAAQAAAAl2b3RlX2Nhc3QAAAAAAAAFAAAAAAAAAAV2b3RlcgAAAAAAABMAAAABAAAAAAAAAAtwcm9wb3NhbF9pZAAAAAPuAAAAIAAAAAEAAAAWVGhlIHR5cGUgb2Ygdm90ZSBjYXN0LgAAAAAACXZvdGVfdHlwZQAAAAAAAAQAAAAAAAAAFlRoZSB2b3RpbmcgcG93ZXIgdXNlZC4AAAAAAAZ3ZWlnaHQAAAAAAAoAAAAAAAAAJ1RoZSB2b3RlcidzIGV4cGxhbmF0aW9uIGZvciB0aGVpciB2b3RlLgAAAAAGcmVhc29uAAAAAAAQAAAAAAAAAAI=", "AAAABAAAAC1FcnJvcnMgdGhhdCBjYW4gb2NjdXIgaW4gZ292ZXJub3Igb3BlcmF0aW9ucy4AAAAAAAAAAAAADUdvdmVybm9yRXJyb3IAAAAAAAAYAAAAG1RoZSBwcm9wb3NhbCB3YXMgbm90IGZvdW5kLgAAAAAQUHJvcG9zYWxOb3RGb3VuZAAAE4gAAAAcVGhlIHByb3Bvc2FsIGFscmVhZHkgZXhpc3RzLgAAABVQcm9wb3NhbEFscmVhZHlFeGlzdHMAAAAAABOJAAAAL1RoZSBwcm9wb3NlciBkb2VzIG5vdCBoYXZlIGVub3VnaCB2b3RpbmcgcG93ZXIuAAAAABlJbnN1ZmZpY2llbnRQcm9wb3NlclZvdGVzAAAAAAATigAAACFUaGUgcHJvcG9zYWwgY29udGFpbnMgbm8gYWN0aW9ucy4AAAAAAAANRW1wdHlQcm9wb3NhbAAAAAAAE4sAAABAVGhlIHRhcmdldHMsIGZ1bmN0aW9ucywgYW5kIGFyZ3MgdmVjdG9ycyBoYXZlIGRpZmZlcmVudCBsZW5ndGhzLgAAABVJbnZhbGlkUHJvcG9zYWxMZW5ndGgAAAAAABOMAAAAKFRoZSBwcm9wb3NhbCBpcyBub3QgaW4gdGhlIGFjdGl2ZSBzdGF0ZS4AAAARUHJvcG9zYWxOb3RBY3RpdmUAAAAAABONAAAAH1RoZSBwcm9wb3NhbCBoYXMgbm90IHN1Y2NlZWRlZC4AAAAAFVByb3Bvc2FsTm90U3VjY2Vzc2Z1bAAAAAAAE44AAAAhVGhlIHByb3Bvc2FsIGhhcyBub3QgYmVlbiBxdWV1ZWQuAAAAAAAAEVByb3Bvc2FsTm90UXVldWVkAAAAAAATjwAAACdUaGUgcHJvcG9zYWwgaGFzIGFscmVhZHkgYmVlbiBleGVjdXRlZC4AAAAAF1Byb3Bvc2FsQWxyZWFkeUV4ZWN1dGVkAAAAE5AAAABSVGhlIHByb3Bvc2FsIGlzIGluIGEgbm9uLWNhbmNlbGxhYmxlIHN0YXRlIChgQ2FuY2VsZWRgLCBgRXhwaXJlZGAsIG9yCmBFeGVjdXRlZGApLgAAAAAAFlByb3Bvc2FsTm90Q2FuY2VsbGFibGUAAAAAE5EAAAAiVGhlIHZvdGluZyBkZWxheSBoYXMgbm90IGJlZW4gc2V0LgAAAAAAEVZvdGluZ0RlbGF5Tm90U2V0AAAAAAATkgAAACNUaGUgdm90aW5nIHBlcmlvZCBoYXMgbm90IGJlZW4gc2V0LgAAAAASVm90aW5nUGVyaW9kTm90U2V0AAAAABOTAAAAKFRoZSBwcm9wb3NhbCB0aHJlc2hvbGQgaGFzIG5vdCBiZWVuIHNldC4AAAAXUHJvcG9zYWxUaHJlc2hvbGROb3RTZXQAAAATlAAAABpUaGUgbmFtZSBoYXMgbm90IGJlZW4gc2V0LgAAAAAACk5hbWVOb3RTZXQAAAAAE5UAAAAdVGhlIHZlcnNpb24gaGFzIG5vdCBiZWVuIHNldC4AAAAAAAANVmVyc2lvbk5vdFNldAAAAAAAE5YAAAAdQXJpdGhtZXRpYyBvdmVyZmxvdyBvY2N1cnJlZC4AAAAAAAAMTWF0aE92ZXJmbG93AAATlwAAAC9UaGUgYWNjb3VudCBoYXMgYWxyZWFkeSB2b3RlZCBvbiB0aGlzIHByb3Bvc2FsLgAAAAAMQWxyZWFkeVZvdGVkAAATmAAAAC5UaGUgdm90ZSB0eXBlIGlzIGludmFsaWQgKG11c3QgYmUgMCwgMSwgb3IgMikuAAAAAAAPSW52YWxpZFZvdGVUeXBlAAAAE5kAAAAcVGhlIHF1b3J1bSBoYXMgbm90IGJlZW4gc2V0LgAAAAxRdW9ydW1Ob3RTZXQAABOaAAAAR1RoZSB0b2tlbiBjb250cmFjdCBoYXMgYWxyZWFkeSBiZWVuIHNldCAoY2FuIG9ubHkgYmUgaW5pdGlhbGl6ZWQgb25jZSkuAAAAABdUb2tlbkNvbnRyYWN0QWxyZWFkeVNldAAAABObAAAAJFRoZSB0b2tlbiBjb250cmFjdCBoYXMgbm90IGJlZW4gc2V0LgAAABNUb2tlbkNvbnRyYWN0Tm90U2V0AAAAE5wAAAA8VGhlIHByb3Bvc2FsIGRlc2NyaXB0aW9uIGV4Y2VlZHMgdGhlIG1heGltdW0gYWxsb3dlZCBsZW5ndGguAAAAEkRlc2NyaXB0aW9uVG9vTG9uZwAAAAATnQAAAClRdWV1aW5nIGlzIG5vdCBlbmFibGVkIGZvciB0aGlzIGdvdmVybm9yLgAAAAAAAA9RdWV1ZU5vdEVuYWJsZWQAAAATngAAAEZUaGUgdm90aW5nIHBlcmlvZCBpcyB6ZXJvLCB3aGljaCB3b3VsZCBsZWF2ZSBldmVyeSBwcm9wb3NhbCB1bnZvdGFibGUuAAAAAAATSW52YWxpZFZvdGluZ1BlcmlvZAAAABOf", "AAAAAwAABABUaGUgc3RhdGUgb2YgYSBwcm9wb3NhbCBpbiBpdHMgbGlmZWN5Y2xlLgoKU3RhdGVzIGFyZSBkaXZpZGVkIGludG8gdHdvIGNhdGVnb3JpZXM6CgojIyBUaW1lLWJhc2VkIHN0YXRlcyAoZGVyaXZlZCwgbmV2ZXIgc3RvcmVkIGV4cGxpY2l0bHkpCgpUaGVzZSBhcmUgY29tcHV0ZWQgYnkgW2BnZXRfcHJvcG9zYWxfc3RhdGUoKWBdIGZyb20gdGhlIGN1cnJlbnQgbGVkZ2VyCnJlbGF0aXZlIHRvIHRoZSBwcm9wb3NhbCdzIHZvdGluZyBzY2hlZHVsZS4gVGhleSBhcmUgb25seSByZXR1cm5lZCB3aGVuCm5vIGV4cGxpY2l0IHN0YXRlIGhhcyBiZWVuIHNldC4KCi0gW2BQZW5kaW5nYF0oUHJvcG9zYWxTdGF0ZTo6UGVuZGluZykg4oCUIHZvdGluZyBoYXMgbm90IHN0YXJ0ZWQgeWV0LgotIFtgQWN0aXZlYF0oUHJvcG9zYWxTdGF0ZTo6QWN0aXZlKSDigJQgdm90aW5nIGlzIG9uZ29pbmcuCi0gW2BEZWZlYXRlZGBdKFByb3Bvc2FsU3RhdGU6OkRlZmVhdGVkKSDigJQgdm90aW5nIGVuZGVkICoqd2l0aG91dCoqIHRoZQpjb3VudGluZyBsb2dpYyBtYXJraW5nIHRoZSBwcm9wb3NhbCBhcyBgU3VjY2VlZGVkYC4KCiMjIEV4cGxpY2l0IHN0YXRlcwoKU2V0IGV4cGxpY2l0bHkgYnkgdGhlIEdvdmVybm9yIG9yIGl0cyBleHRlbnNpb25zIGFuZCBwZXJzaXN0ZWQgaW4Kc3RvcmFnZS4gT25jZSBzZXQsIHRoZXkgdGFrZSBwcmVjZWRlbmNlIG92ZXIgYW55IHRpbWUtYmFzZWQgZGVyaXZhdGlvbi4KCi0gW2BDYW5jZWxlZGBdKFByb3Bvc2FsU3RhdGU6OkNhbmNlbGVkKSDigJQgc2V0IGJ5IHRoZSBHb3Zlcm5vci4KLSBbYFN1Y2NlZWRlZGBdKFByb3Bvc2FsU3RhdGU6OlN1Y2NlZWRlZCkg4oCUIHNldCBieSB0aGUgY291bnRpbmcgbG9naWMuCi0gW2BRdWV1ZWRgXShQcm9wb3NhbFN0YXRlOjpRdWV1ZWQpIC8gW2BFeHBpcmVkYF0oUHJvcG9zYWxTdGF0ZTo6RXhwaXJlZCkg4oCUCnNldCBieSBleHRlbnNpb25zIGxpa2UgYFRpbWVsb2NrQ29udHJvbGAuCi0gW2BFeGVjdXRlZGBdKFByb3Bvc2FsU3RhdGU6OkV4ZWN1AAAAAAAAAA1Qcm9wb3NhbFN0YXRlAAAAAAAACAAAADdUaGUgcHJvcG9zYWwgaXMgcGVuZGluZyBhbmQgdm90aW5nIGhhcyBub3Qgc3RhcnRlZCB5ZXQuAAAAAAdQZW5kaW5nAAAAAAAAAAAtVGhlIHByb3Bvc2FsIGlzIGFjdGl2ZSBhbmQgdm90aW5nIGlzIG9uZ29pbmcuAAAAAAAABkFjdGl2ZQAAAAAAAQAAAMhUaGUgcHJvcG9zYWwgd2FzIGRlZmVhdGVkIChkaWQgbm90IG1lZXQgcXVvcnVtIG9yIG1ham9yaXR5KS4gVGhpcyBpcwp0aGUgZGVmYXVsdCBvdXRjb21lIHdoZW4gdm90aW5nIGVuZHMgYW5kIHRoZSBjb3VudGluZyBsb2dpYyBoYXMKbm90IG1hcmtlZCB0aGUgcHJvcG9zYWwgYXMgW2BTdWNjZWVkZWRgXShQcm9wb3NhbFN0YXRlOjpTdWNjZWVkZWQpLgAAAAhEZWZlYXRlZAAAAAIAAAA1VGhlIHByb3Bvc2FsIGhhcyBiZWVuIGNhbmNlbGxlZC4gU2V0IGJ5IHRoZSBHb3Zlcm5vci4AAAAAAAAIQ2FuY2VsZWQAAAADAAAA3lRoZSBwcm9wb3NhbCBzdWNjZWVkZWQgYW5kIGNhbiBiZSBleGVjdXRlZC4gU2V0IGJ5IHRoZSBjb3VudGluZwpsb2dpYyB3aGVuIHRoZSBwcm9wb3NhbCBtZWV0cyB0aGUgcmVxdWlyZWQgcXVvcnVtIGFuZCB2b3RlCnRocmVzaG9sZHMuIElmIGEgcXVldWluZyBleHRlbnNpb24gaXMgZW5hYmxlZCwgdGhpcyBzdGF0ZSBtZWFucyB0aGUKcHJvcG9zYWwgaXMgcmVhZHkgdG8gYmUgcXVldWVkLgAAAAAACVN1Y2NlZWRlZAAAAAAAAAQAAABPVGhlIHByb3Bvc2FsIGlzIHF1ZXVlZCBmb3IgZXhlY3V0aW9uLiBTZXQgYnkgZXh0ZW5zaW9ucyBsaWtlCmBUaW1lbG9ja0NvbnRyb2xgLgAAAAAGUXVldWVkAAAAAAAFAAAAYVRoZSBwcm9wb3NhbCBoYXMgZXhwaXJlZCBhbmQgY2FuIG5vIGxvbmdlciBiZSBleGVjdXRlZC4gU2V0IGJ5CmV4dGVuc2lvbnMgbGlrZSBgVGltZWxvY2tDb250cm9sYC4AAAAAAAAHRXhwaXJlZAAAAAAGAAAANFRoZSBwcm9wb3NhbCBoYXMgYmVlbiBleGVjdXRlZC4gU2V0IGJ5IHRoZSBHb3Zlcm5vci4AAAAIRXhlY3V0ZWQAAAAH", "AAAABQAAAC9FdmVudCBlbWl0dGVkIHdoZW4gdGhlIHF1b3J1bSB2YWx1ZSBpcyBjaGFuZ2VkLgAAAAAAAAAADVF1b3J1bUNoYW5nZWQAAAAAAAABAAAADnF1b3J1bV9jaGFuZ2VkAAAAAAACAAAAAAAAAApvbGRfcXVvcnVtAAAAAAAKAAAAAAAAAAAAAAAKbmV3X3F1b3J1bQAAAAAACgAAAAAAAAAC", "AAAABQAAAClFdmVudCBlbWl0dGVkIHdoZW4gYSBwcm9wb3NhbCBpcyBjcmVhdGVkLgAAAAAAAAAAAAAPUHJvcG9zYWxDcmVhdGVkAAAAAAEAAAAQcHJvcG9zYWxfY3JlYXRlZAAAAAgAAAAAAAAAC3Byb3Bvc2FsX2lkAAAAA+4AAAAgAAAAAQAAAAAAAAAIcHJvcG9zZXIAAAATAAAAAQAAAAAAAAAHdGFyZ2V0cwAAAAPqAAAAEwAAAAAAAAAAAAAACWZ1bmN0aW9ucwAAAAAAA+oAAAARAAAAAAAAAAAAAAAEYXJncwAAA+oAAAPqAAAAAAAAAAAAAAAAAAAADXZvdGVfc25hcHNob3QAAAAAAAAEAAAAAAAAAAAAAAAIdm90ZV9lbmQAAAAEAAAAAAAAAAAAAAALZGVzY3JpcHRpb24AAAAAEAAAAAAAAAAC", "AAAABQAAACpFdmVudCBlbWl0dGVkIHdoZW4gYSBwcm9wb3NhbCBpcyBleGVjdXRlZC4AAAAAAAAAAAAQUHJvcG9zYWxFeGVjdXRlZAAAAAEAAAARcHJvcG9zYWxfZXhlY3V0ZWQAAAAAAAABAAAAAAAAAAtwcm9wb3NhbF9pZAAAAAPuAAAAIAAAAAEAAAAC", "AAAABQAAACtFdmVudCBlbWl0dGVkIHdoZW4gYSBwcm9wb3NhbCBpcyBjYW5jZWxsZWQuAAAAAAAAAAARUHJvcG9zYWxDYW5jZWxsZWQAAAAAAAABAAAAEnByb3Bvc2FsX2NhbmNlbGxlZAAAAAAAAQAAAAAAAAALcHJvcG9zYWxfaWQAAAAD7gAAACAAAAABAAAAAg=="]),
      options
    );
  }

   static deploy<T = Client>({ admin, token_contract, treasury_contract, voting_delay, voting_period, queue_delay, proposal_threshold, quorum_bps, manager, current_hash }: { admin: string | Address; token_contract: string | Address; treasury_contract: string | Address; voting_delay: number; voting_period: number; queue_delay: number; proposal_threshold: bigint; quorum_bps: number; manager: string | Address; current_hash: Uint8Array }, options: MethodOptions & Omit<ContractClientOptions, 'contractId'> & { salt?: Uint8Array; address?: string; } & ({ wasmHash: Uint8Array | string; format?: "hex" | "base64"; externalRef?: never; } | { externalRef: ExternalExecutableRef; wasmHash?: never; format?: never; })): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({ admin, token_contract, treasury_contract, voting_delay, voting_period, queue_delay, proposal_threshold, quorum_bps, manager, current_hash }, options);
  }
  public readonly fromJson = {
    name : this.txFromJson<string>,  admin : this.txFromJson<string>,  queue : this.txFromJson<Uint8Array>,  cancel : this.txFromJson<Uint8Array>,  launch : this.txFromJson<void>,  quorum : this.txFromJson<bigint>,  comment : this.txFromJson<void>,  consume : this.txFromJson<Uint8Array>,  execute : this.txFromJson<Uint8Array>,  handoff : this.txFromJson<void>,  migrate : this.txFromJson<void>,  propose : this.txFromJson<Uint8Array>,  upgrade : this.txFromJson<void>,  version : this.txFromJson<string>,  proposal : this.txFromJson<ProposalInfo>,  treasury : this.txFromJson<string>,  cast_vote : this.txFromJson<bigint>,  has_voted : this.txFromJson<boolean>,  wasm_hash : this.txFromJson<Uint8Array>,  quorum_bps : this.txFromJson<number>,  vote_source : this.txFromJson<string>,  proposal_ids : this.txFromJson<Array<Uint8Array>>,  voting_delay : this.txFromJson<number>,  counting_mode : this.txFromJson<string>,  voting_period : this.txFromJson<number>,  proposal_count : this.txFromJson<number>,  proposal_state : this.txFromJson<ProposalState>,  set_quorum_bps : this.txFromJson<void>,  get_proposal_id : this.txFromJson<Uint8Array>,  set_queue_delay : this.txFromJson<void>,  storage_version : this.txFromJson<number>,  set_voting_delay : this.txFromJson<void>,  proposal_deadline : this.txFromJson<number>,  proposal_proposer : this.txFromJson<string>,  proposal_snapshot : this.txFromJson<number>,  set_voting_period : this.txFromJson<void>,  get_token_contract : this.txFromJson<string>,  proposal_threshold : this.txFromJson<bigint>,  proposals_need_queuing : this.txFromJson<boolean>,  set_proposal_threshold : this.txFromJson<void>,  votes_needed_to_propose : this.txFromJson<bigint>
  };

  /** @deprecated Use fromJson instead. */
  public readonly fromJSON = this.fromJson;

  /**
   * Parse a raw contract event (topics + data) into a typed {@link ContractEvent}.
   */
  parseEvent(topics: xdr.ScVal[] | string[], data: xdr.ScVal | string): ContractEvent | undefined {
    return this.spec.parseEvent(topics, data) as ContractEvent | undefined;
  }
  /**
   * Build a topics filter row for the "ProposalQueued" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  proposalQueuedEventFilter(topicValues?: { proposal_id?: Uint8Array }): string[] {
    return this.spec.eventTopicFilter("ProposalQueued", topicValues);
  }
  /**
   * Build a topics filter row for the "GovernorLaunched" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  governorLaunchedEventFilter(topicValues?: { treasury?: string | Address }): string[] {
    return this.spec.eventTopicFilter("GovernorLaunched", topicValues);
  }
  /**
   * Build a topics filter row for the "QuorumBpsChanged" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  quorumBpsChangedEventFilter(topicValues?: { changed_by?: string | Address }): string[] {
    return this.spec.eventTopicFilter("QuorumBpsChanged", topicValues);
  }
  /**
   * Build a topics filter row for the "ProposalCommented" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  proposalCommentedEventFilter(topicValues?: { proposal_id?: Uint8Array; author?: string | Address }): string[] {
    return this.spec.eventTopicFilter("ProposalCommented", topicValues);
  }
  /**
   * Build a topics filter row for the "ProposalScheduled" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  proposalScheduledEventFilter(topicValues?: { proposal_id?: Uint8Array }): string[] {
    return this.spec.eventTopicFilter("ProposalScheduled", topicValues);
  }
  /**
   * Build a topics filter row for the "QueueDelayChanged" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  queueDelayChangedEventFilter(topicValues?: { changed_by?: string | Address }): string[] {
    return this.spec.eventTopicFilter("QueueDelayChanged", topicValues);
  }
  /**
   * Build a topics filter row for the "VotingDelayChanged" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  votingDelayChangedEventFilter(topicValues?: { changed_by?: string | Address }): string[] {
    return this.spec.eventTopicFilter("VotingDelayChanged", topicValues);
  }
  /**
   * Build a topics filter row for the "GovernorInitialized" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  governorInitializedEventFilter(topicValues?: { admin?: string | Address }): string[] {
    return this.spec.eventTopicFilter("GovernorInitialized", topicValues);
  }
  /**
   * Build a topics filter row for the "VotingPeriodChanged" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  votingPeriodChangedEventFilter(topicValues?: { changed_by?: string | Address }): string[] {
    return this.spec.eventTopicFilter("VotingPeriodChanged", topicValues);
  }
  /**
   * Build a topics filter row for the "ProposalThresholdChanged" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  proposalThresholdChangedEventFilter(topicValues?: { changed_by?: string | Address }): string[] {
    return this.spec.eventTopicFilter("ProposalThresholdChanged", topicValues);
  }
  /**
   * Build a topics filter row for the "AdminChanged" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  adminChangedEventFilter(topicValues?: { old_admin?: string | Address; new_admin?: string | Address }): string[] {
    return this.spec.eventTopicFilter("AdminChanged", topicValues);
  }
  /**
   * Build a topics filter row for the "Migrated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  migratedEventFilter(): string[] {
    return this.spec.eventTopicFilter("Migrated");
  }
  /**
   * Build a topics filter row for the "Upgraded" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  upgradedEventFilter(topicValues?: { from_hash?: Uint8Array; to_hash?: Uint8Array }): string[] {
    return this.spec.eventTopicFilter("Upgraded", topicValues);
  }
  /**
   * Build a topics filter row for the "VoteCast" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  voteCastEventFilter(topicValues?: { voter?: string | Address; proposal_id?: Uint8Array }): string[] {
    return this.spec.eventTopicFilter("VoteCast", topicValues);
  }
  /**
   * Build a topics filter row for the "QuorumChanged" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  quorumChangedEventFilter(): string[] {
    return this.spec.eventTopicFilter("QuorumChanged");
  }
  /**
   * Build a topics filter row for the "ProposalCreated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  proposalCreatedEventFilter(topicValues?: { proposal_id?: Uint8Array; proposer?: string | Address }): string[] {
    return this.spec.eventTopicFilter("ProposalCreated", topicValues);
  }
  /**
   * Build a topics filter row for the "ProposalExecuted" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  proposalExecutedEventFilter(topicValues?: { proposal_id?: Uint8Array }): string[] {
    return this.spec.eventTopicFilter("ProposalExecuted", topicValues);
  }
  /**
   * Build a topics filter row for the "ProposalCancelled" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  proposalCancelledEventFilter(topicValues?: { proposal_id?: Uint8Array }): string[] {
    return this.spec.eventTopicFilter("ProposalCancelled", topicValues);
  }
}