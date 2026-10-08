import {ProposalState, ContractEvent} from './types.js';
import {Spec, AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, ExternalExecutableRef} from '@stellar/stellar-sdk/contract';
import {Address, xdr} from '@stellar/stellar-sdk';

export interface Client {
  /**
   * Returns the name of the governor.
   *
   * # Arguments
   *
   * * `e` - Access to the Soroban environment.
   *
   * # Errors
   *
   * * [`GovernorError::NameNotSet`] - Occurs if the name has not been set.
   */
  name(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  queue({ targets, functions, args, description_hash, eta, operator }: { targets: Array<string | Address>; functions: Array<string>; args: Array<Array<any>>; description_hash: Uint8Array; eta: number; operator: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<Uint8Array>>;
  cancel({ targets, functions, args, description_hash, operator }: { targets: Array<string | Address>; functions: Array<string>; args: Array<Array<any>>; description_hash: Uint8Array; operator: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<Uint8Array>>;
  /**
   * One-shot, Manager-only launch handoff (Setup -> Live).
   *
   * Sets the owner to `treasury`, clears any pending two-step ownership
   * transfer, marks the module live, and emits `Launched`. A second call
   * panics with `AlreadyLive`.
   */
  launch({ treasury }: { treasury: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  quorum({ ledger }: { ledger: number }, options?: MethodOptions): Promise<AssembledTransaction<bigint>>;
  /**
   * Marks a Queued proposal Executed and returns its id. Only callable by
   * the stored Treasury (`treasury.require_auth()`, satisfied when the
   * Treasury calls via `authorize_as_current_contract`). Called from
   * `treasury.execute`, which then dispatches the actions; if any of them
   * fails the whole tx, including this state change, reverts.
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
  propose({ targets, functions, args, description, proposer }: { targets: Array<string | Address>; functions: Array<string>; args: Array<Array<any>>; description: string; proposer: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<Uint8Array>>;
  upgrade({ from_hash, to_hash }: { from_hash: Uint8Array; to_hash: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Returns the version of the governor contract.
   *
   * # Arguments
   *
   * * `e` - Access to the Soroban environment.
   *
   * # Errors
   *
   * * [`GovernorError::VersionNotSet`] - Occurs if the version has not been
   * set.
   */
  version(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  treasury(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  cast_vote({ proposal_id, vote_type, reason, voter }: { proposal_id: Uint8Array; vote_type: number; reason: string; voter: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<bigint>>;
  /**
   * Returns `Some(Address)` if ownership is set, or `None` if ownership has
   * been renounced.
   *
   * # Arguments
   *
   * * `e` - Access to the Soroban environment.
   */
  get_owner(options?: MethodOptions): Promise<AssembledTransaction<string | null>>;
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
  wasm_hash(options?: MethodOptions): Promise<AssembledTransaction<Uint8Array>>;
  quorum_bps(options?: MethodOptions): Promise<AssembledTransaction<number>>;
  sync_version(options?: MethodOptions): Promise<AssembledTransaction<void>>;
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
  voting_period(options?: MethodOptions): Promise<AssembledTransaction<number>>;
  proposal_state({ proposal_id }: { proposal_id: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<ProposalState>>;
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
  set_queue_delay({ queue_delay }: { queue_delay: number }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Accepts a pending ownership transfer.
   *
   * # Arguments
   *
   * * `e` - Access to the Soroban environment.
   *
   * # Errors
   *
   * * [`crate::role_transfer::RoleTransferError::NoPendingTransfer`] - If
   * there is no pending transfer to accept.
   *
   * # Events
   *
   * * topics - `["ownership_transfer_completed"]`
   * * data - `[new_owner: Address]`
   */
  accept_ownership(options?: MethodOptions): Promise<AssembledTransaction<void>>;
  set_voting_delay({ voting_delay }: { voting_delay: number }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  proposal_deadline({ proposal_id }: { proposal_id: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * Returns the address of the proposer for a given proposal.
   *
   * # Arguments
   *
   * * `e` - Access to the Soroban environment.
   * * `proposal_id` - The unique identifier of the proposal.
   *
   * # Errors
   *
   * * [`GovernorError::ProposalNotFound`] - If the proposal does not exist.
   */
  proposal_proposer({ proposal_id }: { proposal_id: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<string>>;
  proposal_snapshot({ proposal_id }: { proposal_id: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<number>>;
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
   * Renounces ownership of the contract.
   *
   * Permanently removes the owner, disabling all functions gated by
   * `#[only_owner]`.
   *
   * # Arguments
   *
   * * `e` - Access to the Soroban environment.
   *
   * # Errors
   *
   * * [`OwnableError::TransferInProgress`] - If there is a pending ownership
   * transfer.
   * * [`OwnableError::OwnerNotSet`] - If the owner is not set.
   *
   * # Notes
   *
   * * Authorization for the current owner is required.
   */
  renounce_ownership(options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Initiates a 2-step ownership transfer to a new address.
   *
   * Requires authorization from the current owner. The new owner must later
   * call `accept_ownership()` to complete the transfer.
   *
   * # Arguments
   *
   * * `e` - Access to the Soroban environment.
   * * `new_owner` - The proposed new owner.
   * * `live_until_ledger` - Ledger number until which the new owner can
   * accept. A value of `0` cancels any pending transfer.
   *
   * # Errors
   *
   * * [`OwnableError::OwnerNotSet`] - If the owner is not set.
   * * [`crate::role_transfer::RoleTransferError::NoPendingTransfer`] - If
   * trying to cancel a transfer that doesn't exist.
   * * [`crate::role_transfer::RoleTransferError::InvalidLiveUntilLedger`] -
   * If the specified ledger is in the past.
   * * [`crate::role_transfer::RoleTransferError::InvalidPendingAccount`] -
   * If the specified pending account is not the same as the provided `new`
   * address.
   *
   * # Notes
   *
   * * Authorization for the current owner is required.
   */
  transfer_ownership({ new_owner, live_until_ledger }: { new_owner: string | Address; live_until_ledger: number }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  proposals_need_queuing(options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  set_proposal_threshold({ proposal_threshold }: { proposal_threshold: bigint }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
}

export class Client extends ContractClient {
  constructor(public readonly options: ContractClientOptions) {
    super(
      new Spec(["AAAABAAAAAAAAAAAAAAAE0N1c3RvbUdvdmVybm9yRXJyb3IAAAAADAAAADBRdWV1ZSBkZWxheSBiZWxvdyBtaW5pbXVtIChtdXN0IGJlID49IDUgbWludXRlcykAAAARSW52YWxpZFF1ZXVlRGVsYXkAAAAAAAXcAAAALVByb3Bvc2FsIHRocmVzaG9sZCBleGNlZWRzIHRvdGFsIHRva2VuIHN1cHBseQAAAAAAABhJbnZhbGlkUHJvcG9zYWxUaHJlc2hvbGQAAAXdAAAALlF1b3J1bSBiYXNpcyBwb2ludHMgaW52YWxpZCAobXVzdCBiZSA8PSAxMDAwMCkAAAAAABBJbnZhbGlkUXVvcnVtQnBzAAAF3gAAACFPd25lciBub3Qgc2V0IGluIGNvbnRyYWN0IHN0b3JhZ2UAAAAAAAALT3duZXJOb3RTZXQAAAAF3wAAADFWb3RpbmcgZGVsYXkgYmVsb3cgbWluaW11bSAobXVzdCBiZSA+PSA1IG1pbnV0ZXMpAAAAAAAAEkludmFsaWRWb3RpbmdEZWxheQAAAAAF4QAAADJWb3RpbmcgcGVyaW9kIGJlbG93IG1pbmltdW0gKG11c3QgYmUgPj0gNSBtaW51dGVzKQAAAAAAE0ludmFsaWRWb3RpbmdQZXJpb2QAAAAF4gAAAEFgbGF1bmNoYCB0cmVhc3VyeSBkaWZmZXJzIGZyb20gdGhlIHRyZWFzdXJ5IHdpcmVkIGF0IGNvbnN0cnVjdGlvbgAAAAAAABBUcmVhc3VyeU1pc21hdGNoAAAF4wAAADZgZXhlY3V0ZWAgaXMgZGlzYWJsZWQ7IGNhbGwgYHRyZWFzdXJ5LmV4ZWN1dGVgIGluc3RlYWQAAAAAABJVc2VUcmVhc3VyeUV4ZWN1dGUAAAAABeQAAAA1UHJvcG9zYWwgaGFzIG1vcmUgdGhhbiBgTUFYX1BST1BPU0FMX0FDVElPTlNgIGFjdGlvbnMAAAAAAAAOVG9vTWFueUFjdGlvbnMAAAAABeUAAAAvVm90aW5nIGRlbGF5IGFib3ZlIGBNQVhfVk9USU5HX0RFTEFZYCAoMzAgZGF5cykAAAAAElZvdGluZ0RlbGF5VG9vTG9uZwAAAAAF5gAAADFWb3RpbmcgcGVyaW9kIGFib3ZlIGBNQVhfVk9USU5HX1BFUklPRGAgKDMwIGRheXMpAAAAAAAAE1ZvdGluZ1BlcmlvZFRvb0xvbmcAAAAF5wAAAC1RdWV1ZSBkZWxheSBhYm92ZSBgTUFYX1FVRVVFX0RFTEFZYCAoMzAgZGF5cykAAAAAAAARUXVldWVEZWxheVRvb0xvbmcAAAAAAAXo", "AAAABQAAAERFbWl0dGVkIG9uY2Ugd2hlbiB0aGUgTWFuYWdlciBsYXVuY2hlcyB0aGUgZ292ZXJub3IgKFNldHVwIC0+IExpdmUpLgAAAAAAAAAITGF1bmNoZWQAAAABAAAACGxhdW5jaGVkAAAAAQAAAAAAAAAIdHJlYXN1cnkAAAATAAAAAQAAAAI=", "AAAABQAAAAAAAAAAAAAADlByb3Bvc2FsUXVldWVkAAAAAAABAAAAD3Byb3Bvc2FsX3F1ZXVlZAAAAAACAAAAAAAAAAtwcm9wb3NhbF9pZAAAAAPuAAAAIAAAAAEAAAAAAAAAA2V0YQAAAAAGAAAAAAAAAAI=", "AAAABQAAAAAAAAAAAAAAEFF1b3J1bUJwc0NoYW5nZWQAAAABAAAAEnF1b3J1bV9icHNfY2hhbmdlZAAAAAAAAwAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAQAAAAAAAAAJb2xkX3ZhbHVlAAAAAAAABAAAAAAAAAAAAAAACW5ld192YWx1ZQAAAAAAAAQAAAAAAAAAAg==", "AAAABQAAAAAAAAAAAAAAEVF1ZXVlRGVsYXlDaGFuZ2VkAAAAAAAAAQAAABNxdWV1ZV9kZWxheV9jaGFuZ2VkAAAAAAMAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAEAAAAAAAAACW9sZF92YWx1ZQAAAAAAAAQAAAAAAAAAAAAAAAluZXdfdmFsdWUAAAAAAAAEAAAAAAAAAAI=", "AAAABQAAAAAAAAAAAAAAElZvdGluZ0RlbGF5Q2hhbmdlZAAAAAAAAQAAABR2b3RpbmdfZGVsYXlfY2hhbmdlZAAAAAMAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAEAAAAAAAAACW9sZF92YWx1ZQAAAAAAAAQAAAAAAAAAAAAAAAluZXdfdmFsdWUAAAAAAAAEAAAAAAAAAAI=", "AAAABQAAAAAAAAAAAAAAE0dvdmVybm9ySW5pdGlhbGl6ZWQAAAAAAQAAABRnb3Zlcm5vcl9pbml0aWFsaXplZAAAAAkAAAAAAAAABW93bmVyAAAAAAAAEwAAAAEAAAAAAAAADnRva2VuX2NvbnRyYWN0AAAAAAATAAAAAAAAAAAAAAARdHJlYXN1cnlfY29udHJhY3QAAAAAAAATAAAAAAAAAAAAAAAMdm90aW5nX2RlbGF5AAAABAAAAAAAAAAAAAAADXZvdGluZ19wZXJpb2QAAAAAAAAEAAAAAAAAAAAAAAALcXVldWVfZGVsYXkAAAAABAAAAAAAAAAAAAAAEnByb3Bvc2FsX3RocmVzaG9sZAAAAAAACgAAAAAAAAAAAAAACnF1b3J1bV9icHMAAAAAAAQAAAAAAAAAAAAAAAd2ZXJzaW9uAAAAABAAAAAAAAAAAg==", "AAAABQAAAAAAAAAAAAAAE1ZvdGluZ1BlcmlvZENoYW5nZWQAAAAAAQAAABV2b3RpbmdfcGVyaW9kX2NoYW5nZWQAAAAAAAADAAAAAAAAAAZjYWxsZXIAAAAAABMAAAABAAAAAAAAAAlvbGRfdmFsdWUAAAAAAAAEAAAAAAAAAAAAAAAJbmV3X3ZhbHVlAAAAAAAABAAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAAGFByb3Bvc2FsVGhyZXNob2xkQ2hhbmdlZAAAAAEAAAAacHJvcG9zYWxfdGhyZXNob2xkX2NoYW5nZWQAAAAAAAMAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAEAAAAAAAAACW9sZF92YWx1ZQAAAAAAAAoAAAAAAAAAAAAAAAluZXdfdmFsdWUAAAAAAAAKAAAAAAAAAAI=", "AAAAAAAAAKxSZXR1cm5zIHRoZSBuYW1lIG9mIHRoZSBnb3Zlcm5vci4KCiMgQXJndW1lbnRzCgoqIGBlYCAtIEFjY2VzcyB0byB0aGUgU29yb2JhbiBlbnZpcm9ubWVudC4KCiMgRXJyb3JzCgoqIFtgR292ZXJub3JFcnJvcjo6TmFtZU5vdFNldGBdIC0gT2NjdXJzIGlmIHRoZSBuYW1lIGhhcyBub3QgYmVlbiBzZXQuAAAABG5hbWUAAAAAAAAAAQAAABA=", "AAAAAAAAAAAAAAAFcXVldWUAAAAAAAAGAAAAAAAAAAd0YXJnZXRzAAAAA+oAAAATAAAAAAAAAAlmdW5jdGlvbnMAAAAAAAPqAAAAEQAAAAAAAAAEYXJncwAAA+oAAAPqAAAAAAAAAAAAAAAQZGVzY3JpcHRpb25faGFzaAAAA+4AAAAgAAAAAAAAAANldGEAAAAABAAAAAAAAAAIb3BlcmF0b3IAAAATAAAAAQAAA+4AAAAg", "AAAAAAAAAAAAAAAGY2FuY2VsAAAAAAAFAAAAAAAAAAd0YXJnZXRzAAAAA+oAAAATAAAAAAAAAAlmdW5jdGlvbnMAAAAAAAPqAAAAEQAAAAAAAAAEYXJncwAAA+oAAAPqAAAAAAAAAAAAAAAQZGVzY3JpcHRpb25faGFzaAAAA+4AAAAgAAAAAAAAAAhvcGVyYXRvcgAAABMAAAABAAAD7gAAACA=", "AAAAAAAAANtPbmUtc2hvdCwgTWFuYWdlci1vbmx5IGxhdW5jaCBoYW5kb2ZmIChTZXR1cCAtPiBMaXZlKS4KClNldHMgdGhlIG93bmVyIHRvIGB0cmVhc3VyeWAsIGNsZWFycyBhbnkgcGVuZGluZyB0d28tc3RlcCBvd25lcnNoaXAKdHJhbnNmZXIsIG1hcmtzIHRoZSBtb2R1bGUgbGl2ZSwgYW5kIGVtaXRzIGBMYXVuY2hlZGAuIEEgc2Vjb25kIGNhbGwKcGFuaWNzIHdpdGggYEFscmVhZHlMaXZlYC4AAAAABmxhdW5jaAAAAAAAAQAAAAAAAAAIdHJlYXN1cnkAAAATAAAAAA==", "AAAAAAAAAAAAAAAGcXVvcnVtAAAAAAABAAAAAAAAAAZsZWRnZXIAAAAAAAQAAAABAAAACg==", "AAAAAAAAAbFNYXJrcyBhIFF1ZXVlZCBwcm9wb3NhbCBFeGVjdXRlZCBhbmQgcmV0dXJucyBpdHMgaWQuIE9ubHkgY2FsbGFibGUgYnkKdGhlIHN0b3JlZCBUcmVhc3VyeSAoYHRyZWFzdXJ5LnJlcXVpcmVfYXV0aCgpYCwgc2F0aXNmaWVkIHdoZW4gdGhlClRyZWFzdXJ5IGNhbGxzIHZpYSBgYXV0aG9yaXplX2FzX2N1cnJlbnRfY29udHJhY3RgKS4gQ2FsbGVkIGZyb20KYHRyZWFzdXJ5LmV4ZWN1dGVgLCB3aGljaCB0aGVuIGRpc3BhdGNoZXMgdGhlIGFjdGlvbnM7IGlmIGFueSBvZiB0aGVtCmZhaWxzIHRoZSB3aG9sZSB0eCwgaW5jbHVkaW5nIHRoaXMgc3RhdGUgY2hhbmdlLCByZXZlcnRzLgoKU3RvcmFnZTogb25lIHBlcnNpc3RlbnQgcHJvcG9zYWwgd3JpdGUgKFRUTCByZS1leHRlbmRlZCkuIEVtaXRzIHRoZQpleGlzdGluZyBgUHJvcG9zYWxFeGVjdXRlZGAgZXZlbnQuAAAAAAAAB2NvbnN1bWUAAAAABAAAAAAAAAAHdGFyZ2V0cwAAAAPqAAAAEwAAAAAAAAAJZnVuY3Rpb25zAAAAAAAD6gAAABEAAAAAAAAABGFyZ3MAAAPqAAAD6gAAAAAAAAAAAAAAEGRlc2NyaXB0aW9uX2hhc2gAAAPuAAAAIAAAAAEAAAPuAAAAIA==", "AAAAAAAAANJBbHdheXMgZmFpbHMuIEV4ZWN1dGlvbiBpcyBkcml2ZW4gYnkgYHRyZWFzdXJ5LmV4ZWN1dGVgLCB3aGljaCBjYWxscwpgY29uc3VtZWAgYW5kIHRoZW4gZGlzcGF0Y2hlcyB0aGUgYWN0aW9ucyB3aXRoIHRoZSBHb3Zlcm5vciBvZmYgdGhlIGNhbGwKc3RhY2sgKFNvcm9iYW4gZm9yYmlkcyByZS1lbnRyeSkuIEtlcHQgb25seSB0byBzYXRpc2Z5IHRoZSBPWiB0cmFpdC4AAAAAAAdleGVjdXRlAAAAAAUAAAAAAAAAB3RhcmdldHMAAAAD6gAAABMAAAAAAAAACWZ1bmN0aW9ucwAAAAAAA+oAAAARAAAAAAAAAARhcmdzAAAD6gAAA+oAAAAAAAAAAAAAABBkZXNjcmlwdGlvbl9oYXNoAAAD7gAAACAAAAAAAAAACGV4ZWN1dG9yAAAAEwAAAAEAAAPuAAAAIA==", "AAAAAAAAAAAAAAAHcHJvcG9zZQAAAAAFAAAAAAAAAAd0YXJnZXRzAAAAA+oAAAATAAAAAAAAAAlmdW5jdGlvbnMAAAAAAAPqAAAAEQAAAAAAAAAEYXJncwAAA+oAAAPqAAAAAAAAAAAAAAALZGVzY3JpcHRpb24AAAAAEAAAAAAAAAAIcHJvcG9zZXIAAAATAAAAAQAAA+4AAAAg", "AAAAAAAAAAAAAAAHdXBncmFkZQAAAAACAAAAAAAAAAlmcm9tX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAHdG9faGFzaAAAAAPuAAAAIAAAAAA=", "AAAAAAAAAL5SZXR1cm5zIHRoZSB2ZXJzaW9uIG9mIHRoZSBnb3Zlcm5vciBjb250cmFjdC4KCiMgQXJndW1lbnRzCgoqIGBlYCAtIEFjY2VzcyB0byB0aGUgU29yb2JhbiBlbnZpcm9ubWVudC4KCiMgRXJyb3JzCgoqIFtgR292ZXJub3JFcnJvcjo6VmVyc2lvbk5vdFNldGBdIC0gT2NjdXJzIGlmIHRoZSB2ZXJzaW9uIGhhcyBub3QgYmVlbgpzZXQuAAAAAAAHdmVyc2lvbgAAAAAAAAAAAQAAABA=", "AAAAAAAAAAAAAAAIdHJlYXN1cnkAAAAAAAAAAQAAABM=", "AAAAAAAAAAAAAAAJY2FzdF92b3RlAAAAAAAABAAAAAAAAAALcHJvcG9zYWxfaWQAAAAD7gAAACAAAAAAAAAACXZvdGVfdHlwZQAAAAAAAAQAAAAAAAAABnJlYXNvbgAAAAAAEAAAAAAAAAAFdm90ZXIAAAAAAAATAAAAAQAAAAo=", "AAAAAAAAAJBSZXR1cm5zIGBTb21lKEFkZHJlc3MpYCBpZiBvd25lcnNoaXAgaXMgc2V0LCBvciBgTm9uZWAgaWYgb3duZXJzaGlwIGhhcwpiZWVuIHJlbm91bmNlZC4KCiMgQXJndW1lbnRzCgoqIGBlYCAtIEFjY2VzcyB0byB0aGUgU29yb2JhbiBlbnZpcm9ubWVudC4AAAAJZ2V0X293bmVyAAAAAAAAAAAAAAEAAAPoAAAAEw==", "AAAAAAAAAMlSZXR1cm5zIHdoZXRoZXIgYW4gYWNjb3VudCBoYXMgdm90ZWQgb24gYSBwcm9wb3NhbC4KCiMgQXJndW1lbnRzCgoqIGBlYCAtIEFjY2VzcyB0byB0aGUgU29yb2JhbiBlbnZpcm9ubWVudC4KKiBgcHJvcG9zYWxfaWRgIC0gVGhlIHVuaXF1ZSBpZGVudGlmaWVyIG9mIHRoZSBwcm9wb3NhbC4KKiBgYWNjb3VudGAgLSBUaGUgYWRkcmVzcyB0byBjaGVjay4AAAAAAAAJaGFzX3ZvdGVkAAAAAAAAAgAAAAAAAAALcHJvcG9zYWxfaWQAAAAD7gAAACAAAAAAAAAAB2FjY291bnQAAAAAEwAAAAEAAAAB", "AAAAAAAAAAAAAAAJd2FzbV9oYXNoAAAAAAAAAAAAAAEAAAPuAAAAIA==", "AAAAAAAAAAAAAAAKcXVvcnVtX2JwcwAAAAAAAAAAAAEAAAAE", "AAAAAAAAAAAAAAAMc3luY192ZXJzaW9uAAAAAAAAAAA=", "AAAAAAAAAAAAAAAMdm90aW5nX2RlbGF5AAAAAAAAAAEAAAAE", "AAAAAAAAA/BJbml0aWFsaXplcyB0aGUgZ292ZXJub3IgY29udHJhY3Qgd2l0aCBnb3Zlcm5hbmNlIHBhcmFtZXRlcnMuCgpTZXRzIHVwIGFsbCBnb3Zlcm5hbmNlIHBhcmFtZXRlcnMgaW5jbHVkaW5nIHZvdGluZyBwZXJpb2RzLCBxdW9ydW0gcmVxdWlyZW1lbnRzLAphbmQgYXNzb2NpYXRlZCBjb250cmFjdHMuIEFsbCBwYXJhbWV0ZXJzIGFyZSBjb25maWd1cmFibGUgcG9zdC1kZXBsb3ltZW50IGJ5CmF1dGhvcml6ZWQgYWRkcmVzc2VzLgoKIyBBcmd1bWVudHMKCiogYG93bmVyYCAtIFRoZSBhZGRyZXNzIHRoYXQgd2lsbCBvd24gYW5kIGNvbnRyb2wgdGhlIGNvbnRyYWN0CiogYHRva2VuX2NvbnRyYWN0YCAtIFRoZSBnb3Zlcm5hbmNlIHRva2VuIGNvbnRyYWN0IChtdXN0IGltcGxlbWVudCBWb3RlcyB0cmFpdCkKKiBgdHJlYXN1cnlfY29udHJhY3RgIC0gVGhlIHRyZWFzdXJ5IGNvbnRyYWN0IHRoYXQgZXhlY3V0ZXMgYXBwcm92ZWQgcHJvcG9zYWxzCiogYHZvdGluZ19kZWxheWAgLSBEZWxheSBpbiBzZWNvbmRzIGJldHdlZW4gcHJvcG9zYWwgY3JlYXRpb24gYW5kIHZvdGUgc3RhcnQKKiBgdm90aW5nX3BlcmlvZGAgLSBEdXJhdGlvbiBpbiBzZWNvbmRzIHRoYXQgdm90aW5nIHJlbWFpbnMgb3BlbgoqIGBxdWV1ZV9kZWxheWAgLSBEZWxheSBpbiBzZWNvbmRzIGJldHdlZW4gYXBwcm92YWwgYW5kIGV4ZWN1dGlvbiAobWluaW11bSA1IG1pbnV0ZXMpCiogYHByb3Bvc2FsX3RocmVzaG9sZGAgLSBNaW5pbXVtIHZvdGluZyBwb3dlciByZXF1aXJlZCB0byBjcmVhdGUgcHJvcG9zYWxzCiogYHF1b3J1bV9icHNgIC0gTWluaW11bSBwYXJ0aWNpcGF0aW9uIGluIGJhc2lzIHBvaW50cyAoZS5nLiwgMjUwMCA9IDI1JSkKCiMgUGFuaWNzCgpQYW5pY3MgaWYgYHF1b3J1bV9icHNgIGV4Y2VlZHMgYEJQU19ERU5PTUlOQVRPUmAgKDEwLDAwMCkuCgojIEV2ZW50cwoKRW1pdHMgYSBgR292ZXJub3JJbml0aWFsaXplZGAgZXZlbnQgd2l0aCBhbGwgaW5pdGlhbGl6YXRpb24gcGFyYW1ldGVycy4AAAANX19jb25zdHJ1Y3RvcgAAAAAAAAsAAAAAAAAABW93bmVyAAAAAAAAEwAAAAAAAAAOdG9rZW5fY29udHJhY3QAAAAAABMAAAAAAAAAEXRyZWFzdXJ5X2NvbnRyYWN0AAAAAAAAEwAAAAAAAAAMdm90aW5nX2RlbGF5AAAABAAAAAAAAAANdm90aW5nX3BlcmlvZAAAAAAAAAQAAAAAAAAAC3F1ZXVlX2RlbGF5AAAAAAQAAAAAAAAAEnByb3Bvc2FsX3RocmVzaG9sZAAAAAAACgAAAAAAAAAKcXVvcnVtX2JwcwAAAAAABAAAAAAAAAAHbWFuYWdlcgAAAAATAAAAAAAAAAxjdXJyZW50X2hhc2gAAAPuAAAAIAAAAAAAAAAHdmVyc2lvbgAAAAAQAAAAAA==", "AAAAAAAAARhSZXR1cm5zIGEgc3ltYm9sIGlkZW50aWZ5aW5nIHRoZSBjb3VudGluZyBzdHJhdGVneS4KClRoaXMgZnVuY3Rpb24gaXMgZXhwZWN0ZWQgdG8gYmUgdXNlZCB0byBkaXNwbGF5IGh1bWFuLXJlYWRhYmxlCmluZm9ybWF0aW9uIGFib3V0IHRoZSBjb3VudGluZyBzdHJhdGVneSwgZm9yIGV4YW1wbGUgaW4gVUlzLgoKRm9yIHNpbXBsZSBjb3VudGluZywgdGhpcyByZXR1cm5zIGAic2ltcGxlImAuCgojIEFyZ3VtZW50cwoKKiBgZWAgLSBBY2Nlc3MgdG8gdGhlIFNvcm9iYW4gZW52aXJvbm1lbnQuAAAADWNvdW50aW5nX21vZGUAAAAAAAAAAAAAAQAAABE=", "AAAAAAAAAAAAAAANdm90aW5nX3BlcmlvZAAAAAAAAAAAAAABAAAABA==", "AAAAAAAAAAAAAAAOcHJvcG9zYWxfc3RhdGUAAAAAAAEAAAAAAAAAC3Byb3Bvc2FsX2lkAAAAA+4AAAAgAAAAAQAAB9AAAAANUHJvcG9zYWxTdGF0ZQAAAA==", "AAAAAAAAAAAAAAAOc2V0X3F1b3J1bV9icHMAAAAAAAEAAAAAAAAACnF1b3J1bV9icHMAAAAAAAQAAAAA", "AAAAAAAAAyhSZXR1cm5zIHRoZSBwcm9wb3NhbCBJRCBjb21wdXRlZCBmcm9tIHRoZSBwcm9wb3NhbCBkZXRhaWxzLgoKVGhlIHByb3Bvc2FsIElEIGlzIGEgZGV0ZXJtaW5pc3RpYyBrZWNjYWsyNTYgaGFzaCBvZiB0aGUgWERSLXNlcmlhbGl6ZWQKdGFyZ2V0cywgZnVuY3Rpb25zLCBhcmdzLCBhbmQgZGVzY3JpcHRpb24gaGFzaC4gVGhpcyBhbGxvd3MgYW55b25lIHRvCmNvbXB1dGUgdGhlIElEIHdpdGhvdXQgc3RvcmluZyB0aGUgZnVsbCBwcm9wb3NhbCBkYXRhLgoKVGhlIGBkZXNjcmlwdGlvbl9oYXNoYCBpcyBjb21wdXRlZCBhcwpga2VjY2FrMjU2KGRlc2NyaXB0aW9uLnRvX2J5dGVzKCkpYCwgaS5lLiwgYSBrZWNjYWsyNTYgaGFzaCBvZiB0aGUKcmF3IFVURi04IGJ5dGVzIG9mIHRoZSBkZXNjcmlwdGlvbiBzdHJpbmcuIE9mZi1jaGFpbiBjbGllbnRzIGNhbgpyZXByb2R1Y2UgdGhpcyBieSBoYXNoaW5nIHRoZSByYXcgc3RyaW5nIGJ5dGVzIGRpcmVjdGx5IOKAlCBubyBYRFIKZW5jb2RpbmcgaXMgcmVxdWlyZWQuCgojIEFyZ3VtZW50cwoKKiBgZWAgLSBBY2Nlc3MgdG8gdGhlIFNvcm9iYW4gZW52aXJvbm1lbnQuCiogYHRhcmdldHNgIC0gVGhlIGFkZHJlc3NlcyBvZiBjb250cmFjdHMgdG8gY2FsbC4KKiBgZnVuY3Rpb25zYCAtIFRoZSBmdW5jdGlvbiBuYW1lcyB0byBpbnZva2Ugb24gZWFjaCB0YXJnZXQuCiogYGFyZ3NgIC0gVGhlIGFyZ3VtZW50cyBmb3IgZWFjaCBmdW5jdGlvbiBjYWxsLgoqIGBkZXNjcmlwdGlvbl9oYXNoYCAtIFRoZSBrZWNjYWsyNTYgaGFzaCBvZiB0aGUgZGVzY3JpcHRpb24ncyByYXcKYnl0ZXMuAAAAD2dldF9wcm9wb3NhbF9pZAAAAAAEAAAAAAAAAAd0YXJnZXRzAAAAA+oAAAATAAAAAAAAAAlmdW5jdGlvbnMAAAAAAAPqAAAAEQAAAAAAAAAEYXJncwAAA+oAAAPqAAAAAAAAAAAAAAAQZGVzY3JpcHRpb25faGFzaAAAA+4AAAAgAAAAAQAAA+4AAAAg", "AAAAAAAAAAAAAAAPc2V0X3F1ZXVlX2RlbGF5AAAAAAEAAAAAAAAAC3F1ZXVlX2RlbGF5AAAAAAQAAAAA", "AAAAAAAAATBBY2NlcHRzIGEgcGVuZGluZyBvd25lcnNoaXAgdHJhbnNmZXIuCgojIEFyZ3VtZW50cwoKKiBgZWAgLSBBY2Nlc3MgdG8gdGhlIFNvcm9iYW4gZW52aXJvbm1lbnQuCgojIEVycm9ycwoKKiBbYGNyYXRlOjpyb2xlX3RyYW5zZmVyOjpSb2xlVHJhbnNmZXJFcnJvcjo6Tm9QZW5kaW5nVHJhbnNmZXJgXSAtIElmCnRoZXJlIGlzIG5vIHBlbmRpbmcgdHJhbnNmZXIgdG8gYWNjZXB0LgoKIyBFdmVudHMKCiogdG9waWNzIC0gYFsib3duZXJzaGlwX3RyYW5zZmVyX2NvbXBsZXRlZCJdYAoqIGRhdGEgLSBgW25ld19vd25lcjogQWRkcmVzc11gAAAAEGFjY2VwdF9vd25lcnNoaXAAAAAAAAAAAA==", "AAAAAAAAAAAAAAAQc2V0X3ZvdGluZ19kZWxheQAAAAEAAAAAAAAADHZvdGluZ19kZWxheQAAAAQAAAAA", "AAAAAAAAAAAAAAARcHJvcG9zYWxfZGVhZGxpbmUAAAAAAAABAAAAAAAAAAtwcm9wb3NhbF9pZAAAAAPuAAAAIAAAAAEAAAAE", "AAAAAAAAAP5SZXR1cm5zIHRoZSBhZGRyZXNzIG9mIHRoZSBwcm9wb3NlciBmb3IgYSBnaXZlbiBwcm9wb3NhbC4KCiMgQXJndW1lbnRzCgoqIGBlYCAtIEFjY2VzcyB0byB0aGUgU29yb2JhbiBlbnZpcm9ubWVudC4KKiBgcHJvcG9zYWxfaWRgIC0gVGhlIHVuaXF1ZSBpZGVudGlmaWVyIG9mIHRoZSBwcm9wb3NhbC4KCiMgRXJyb3JzCgoqIFtgR292ZXJub3JFcnJvcjo6UHJvcG9zYWxOb3RGb3VuZGBdIC0gSWYgdGhlIHByb3Bvc2FsIGRvZXMgbm90IGV4aXN0LgAAAAAAEXByb3Bvc2FsX3Byb3Bvc2VyAAAAAAAAAQAAAAAAAAALcHJvcG9zYWxfaWQAAAAD7gAAACAAAAABAAAAEw==", "AAAAAAAAAAAAAAARcHJvcG9zYWxfc25hcHNob3QAAAAAAAABAAAAAAAAAAtwcm9wb3NhbF9pZAAAAAPuAAAAIAAAAAEAAAAE", "AAAAAAAAAAAAAAARc2V0X3ZvdGluZ19wZXJpb2QAAAAAAAABAAAAAAAAAA12b3RpbmdfcGVyaW9kAAAAAAAABAAAAAA=", "AAAAAAAAAOhSZXR1cm5zIHRoZSBhZGRyZXNzIG9mIHRoZSB0b2tlbiBjb250cmFjdCB0aGF0IGltcGxlbWVudHMgdGhlIFZvdGVzCnRyYWl0LgoKIyBBcmd1bWVudHMKCiogYGVgIC0gQWNjZXNzIHRvIHRoZSBTb3JvYmFuIGVudmlyb25tZW50LgoKIyBFcnJvcnMKCiogW2BHb3Zlcm5vckVycm9yOjpUb2tlbkNvbnRyYWN0Tm90U2V0YF0gLSBPY2N1cnMgaWYgdGhlIHRva2VuIGNvbnRyYWN0CmhhcyBub3QgYmVlbiBzZXQuAAAAEmdldF90b2tlbl9jb250cmFjdAAAAAAAAAAAAAEAAAAT", "AAAAAAAAAOVSZXR1cm5zIHRoZSBtaW5pbXVtIHZvdGluZyBwb3dlciByZXF1aXJlZCB0byBjcmVhdGUgYSBwcm9wb3NhbC4KCiMgQXJndW1lbnRzCgoqIGBlYCAtIEFjY2VzcyB0byB0aGUgU29yb2JhbiBlbnZpcm9ubWVudC4KCiMgRXJyb3JzCgoqIFtgR292ZXJub3JFcnJvcjo6UHJvcG9zYWxUaHJlc2hvbGROb3RTZXRgXSAtIE9jY3VycyBpZiB0aGUgcHJvcG9zYWwKdGhyZXNob2xkIGhhcyBub3QgYmVlbiBzZXQuAAAAAAAAEnByb3Bvc2FsX3RocmVzaG9sZAAAAAAAAAAAAAEAAAAK", "AAAAAAAAAYVSZW5vdW5jZXMgb3duZXJzaGlwIG9mIHRoZSBjb250cmFjdC4KClBlcm1hbmVudGx5IHJlbW92ZXMgdGhlIG93bmVyLCBkaXNhYmxpbmcgYWxsIGZ1bmN0aW9ucyBnYXRlZCBieQpgI1tvbmx5X293bmVyXWAuCgojIEFyZ3VtZW50cwoKKiBgZWAgLSBBY2Nlc3MgdG8gdGhlIFNvcm9iYW4gZW52aXJvbm1lbnQuCgojIEVycm9ycwoKKiBbYE93bmFibGVFcnJvcjo6VHJhbnNmZXJJblByb2dyZXNzYF0gLSBJZiB0aGVyZSBpcyBhIHBlbmRpbmcgb3duZXJzaGlwCnRyYW5zZmVyLgoqIFtgT3duYWJsZUVycm9yOjpPd25lck5vdFNldGBdIC0gSWYgdGhlIG93bmVyIGlzIG5vdCBzZXQuCgojIE5vdGVzCgoqIEF1dGhvcml6YXRpb24gZm9yIHRoZSBjdXJyZW50IG93bmVyIGlzIHJlcXVpcmVkLgAAAAAAABJyZW5vdW5jZV9vd25lcnNoaXAAAAAAAAAAAAAA", "AAAAAAAAA45Jbml0aWF0ZXMgYSAyLXN0ZXAgb3duZXJzaGlwIHRyYW5zZmVyIHRvIGEgbmV3IGFkZHJlc3MuCgpSZXF1aXJlcyBhdXRob3JpemF0aW9uIGZyb20gdGhlIGN1cnJlbnQgb3duZXIuIFRoZSBuZXcgb3duZXIgbXVzdCBsYXRlcgpjYWxsIGBhY2NlcHRfb3duZXJzaGlwKClgIHRvIGNvbXBsZXRlIHRoZSB0cmFuc2Zlci4KCiMgQXJndW1lbnRzCgoqIGBlYCAtIEFjY2VzcyB0byB0aGUgU29yb2JhbiBlbnZpcm9ubWVudC4KKiBgbmV3X293bmVyYCAtIFRoZSBwcm9wb3NlZCBuZXcgb3duZXIuCiogYGxpdmVfdW50aWxfbGVkZ2VyYCAtIExlZGdlciBudW1iZXIgdW50aWwgd2hpY2ggdGhlIG5ldyBvd25lciBjYW4KYWNjZXB0LiBBIHZhbHVlIG9mIGAwYCBjYW5jZWxzIGFueSBwZW5kaW5nIHRyYW5zZmVyLgoKIyBFcnJvcnMKCiogW2BPd25hYmxlRXJyb3I6Ok93bmVyTm90U2V0YF0gLSBJZiB0aGUgb3duZXIgaXMgbm90IHNldC4KKiBbYGNyYXRlOjpyb2xlX3RyYW5zZmVyOjpSb2xlVHJhbnNmZXJFcnJvcjo6Tm9QZW5kaW5nVHJhbnNmZXJgXSAtIElmCnRyeWluZyB0byBjYW5jZWwgYSB0cmFuc2ZlciB0aGF0IGRvZXNuJ3QgZXhpc3QuCiogW2BjcmF0ZTo6cm9sZV90cmFuc2Zlcjo6Um9sZVRyYW5zZmVyRXJyb3I6OkludmFsaWRMaXZlVW50aWxMZWRnZXJgXSAtCklmIHRoZSBzcGVjaWZpZWQgbGVkZ2VyIGlzIGluIHRoZSBwYXN0LgoqIFtgY3JhdGU6OnJvbGVfdHJhbnNmZXI6OlJvbGVUcmFuc2ZlckVycm9yOjpJbnZhbGlkUGVuZGluZ0FjY291bnRgXSAtCklmIHRoZSBzcGVjaWZpZWQgcGVuZGluZyBhY2NvdW50IGlzIG5vdCB0aGUgc2FtZSBhcyB0aGUgcHJvdmlkZWQgYG5ld2AKYWRkcmVzcy4KCiMgTm90ZXMKCiogQXV0aG9yaXphdGlvbiBmb3IgdGhlIGN1cnJlbnQgb3duZXIgaXMgcmVxdWlyZWQuAAAAAAASdHJhbnNmZXJfb3duZXJzaGlwAAAAAAACAAAAAAAAAAluZXdfb3duZXIAAAAAAAATAAAAAAAAABFsaXZlX3VudGlsX2xlZGdlcgAAAAAAAAQAAAAA", "AAAAAAAAAAAAAAAWcHJvcG9zYWxzX25lZWRfcXVldWluZwAAAAAAAAAAAAEAAAAB", "AAAAAAAAAAAAAAAWc2V0X3Byb3Bvc2FsX3RocmVzaG9sZAAAAAAAAQAAAAAAAAAScHJvcG9zYWxfdGhyZXNob2xkAAAAAAAKAAAAAA==", "AAAABAAAAJFFcnJvcnMgc2hhcmVkIGJ5IGFsbCBtb2R1bGUgY29udHJhY3RzLiBDb2RlcyBsaXZlIGluIHRoZSA5MDAwIHJhbmdlIHNvCnRoZXkgbmV2ZXIgY29sbGlkZSB3aXRoIG1vZHVsZSAoMTF4eC0xM3h4LCAzLCAzMCkgb3IgbWFuYWdlciAoMTB4eCkgY29kZXMuAAAAAAAAAAAAAAtDb21tb25FcnJvcgAAAAALAAAANE9wZXJhdGlvbiByZXF1aXJlcyB0aGUgbW9kdWxlIHRvIGJlIGxpdmUgKGxhdW5jaGVkKS4AAAAHTm90TGl2ZQAAACMpAAAAQU9wZXJhdGlvbiBpcyBvbmx5IHZhbGlkIGR1cmluZyBzZXR1cDsgdGhlIG1vZHVsZSBpcyBhbHJlYWR5IGxpdmUuAAAAAAAAC0FscmVhZHlMaXZlAAAAIyoAAAAlTWFuYWdlciBhZGRyZXNzIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAAAAA1NYW5hZ2VyTm90U2V0AAAAAAAjKwAAACNgQ3VycmVudEhhc2hgIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAARQ3VycmVudEhhc2hOb3RTZXQAAAAAACMsAAAANGBmcm9tX2hhc2hgIGRvZXMgbm90IGVxdWFsIHRoZSBzdG9yZWQgYEN1cnJlbnRIYXNoYC4AAAAMSGFzaE1pc21hdGNoAAAjLQAAACpNYW5hZ2VyIGRpZCBub3QgYXBwcm92ZSB0aGlzIHVwZ3JhZGUgcGF0aC4AAAAAABJVcGdyYWRlTm90QXBwcm92ZWQAAAAAIy4AAAA1TWFuYWdlciBoYXMgbm8gcmVnaXN0cnkgZW50cnkgZm9yIHRoZSByZXF1ZXN0ZWQgaGFzaC4AAAAAAAAWSW1wbGVtZW50YXRpb25Ob3RGb3VuZAAAAAAjLwAAABtPd25lciBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAAC093bmVyTm90U2V0AAAAIzAAAAAmYEN1cnJlbnRWZXJzaW9uYCBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAAAA1WZXJzaW9uTm90U2V0AAAAAAAjMQAAACZUcmVhc3VyeSBhZGRyZXNzIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAAADlRyZWFzdXJ5Tm90U2V0AAAAACMyAAAAJkdvdmVybm9yIGFkZHJlc3MgbWlzc2luZyBmcm9tIHN0b3JhZ2UuAAAAAAAOR292ZXJub3JOb3RTZXQAAAAAIzM=", "AAAABAAAAAAAAAAAAAAAEVJvbGVUcmFuc2ZlckVycm9yAAAAAAAABAAAAAAAAAARTm9QZW5kaW5nVHJhbnNmZXIAAAAAAAiYAAAAAAAAABZJbnZhbGlkTGl2ZVVudGlsTGVkZ2VyAAAAAAiZAAAAAAAAABVJbnZhbGlkUGVuZGluZ0FjY291bnQAAAAAAAiaAAAAAAAAAA9UcmFuc2ZlckV4cGlyZWQAAAAImw==", "AAAABAAAAAAAAAAAAAAADE93bmFibGVFcnJvcgAAAAMAAAAAAAAAC093bmVyTm90U2V0AAAACDQAAAAAAAAAElRyYW5zZmVySW5Qcm9ncmVzcwAAAAAINQAAAAAAAAAPT3duZXJBbHJlYWR5U2V0AAAACDY=", "AAAABQAAADZFdmVudCBlbWl0dGVkIHdoZW4gYW4gb3duZXJzaGlwIHRyYW5zZmVyIGlzIGluaXRpYXRlZC4AAAAAAAAAAAART3duZXJzaGlwVHJhbnNmZXIAAAAAAAABAAAAEm93bmVyc2hpcF90cmFuc2ZlcgAAAAAAAwAAAAAAAAAJb2xkX293bmVyAAAAAAAAEwAAAAAAAAAAAAAACW5ld19vd25lcgAAAAAAABMAAAAAAAAAAAAAABFsaXZlX3VudGlsX2xlZGdlcgAAAAAAAAQAAAAAAAAAAg==", "AAAABQAAACpFdmVudCBlbWl0dGVkIHdoZW4gb3duZXJzaGlwIGlzIHJlbm91bmNlZC4AAAAAAAAAAAAST3duZXJzaGlwUmVub3VuY2VkAAAAAAABAAAAE293bmVyc2hpcF9yZW5vdW5jZWQAAAAAAQAAAAAAAAAJb2xkX293bmVyAAAAAAAAEwAAAAAAAAAC", "AAAABQAAADZFdmVudCBlbWl0dGVkIHdoZW4gYW4gb3duZXJzaGlwIHRyYW5zZmVyIGlzIGNvbXBsZXRlZC4AAAAAAAAAAAAaT3duZXJzaGlwVHJhbnNmZXJDb21wbGV0ZWQAAAAAAAEAAAAcb3duZXJzaGlwX3RyYW5zZmVyX2NvbXBsZXRlZAAAAAEAAAAAAAAACW5ld19vd25lcgAAAAAAABMAAAAAAAAAAg==", "AAAABQAAACJFdmVudCBlbWl0dGVkIHdoZW4gYSB2b3RlIGlzIGNhc3QuAAAAAAAAAAAACFZvdGVDYXN0AAAAAQAAAAl2b3RlX2Nhc3QAAAAAAAAFAAAAAAAAAAV2b3RlcgAAAAAAABMAAAABAAAAAAAAAAtwcm9wb3NhbF9pZAAAAAPuAAAAIAAAAAEAAAAWVGhlIHR5cGUgb2Ygdm90ZSBjYXN0LgAAAAAACXZvdGVfdHlwZQAAAAAAAAQAAAAAAAAAFlRoZSB2b3RpbmcgcG93ZXIgdXNlZC4AAAAAAAZ3ZWlnaHQAAAAAAAoAAAAAAAAAJ1RoZSB2b3RlcidzIGV4cGxhbmF0aW9uIGZvciB0aGVpciB2b3RlLgAAAAAGcmVhc29uAAAAAAAQAAAAAAAAAAI=", "AAAABAAAAC1FcnJvcnMgdGhhdCBjYW4gb2NjdXIgaW4gZ292ZXJub3Igb3BlcmF0aW9ucy4AAAAAAAAAAAAADUdvdmVybm9yRXJyb3IAAAAAAAAYAAAAG1RoZSBwcm9wb3NhbCB3YXMgbm90IGZvdW5kLgAAAAAQUHJvcG9zYWxOb3RGb3VuZAAAE4gAAAAcVGhlIHByb3Bvc2FsIGFscmVhZHkgZXhpc3RzLgAAABVQcm9wb3NhbEFscmVhZHlFeGlzdHMAAAAAABOJAAAAL1RoZSBwcm9wb3NlciBkb2VzIG5vdCBoYXZlIGVub3VnaCB2b3RpbmcgcG93ZXIuAAAAABlJbnN1ZmZpY2llbnRQcm9wb3NlclZvdGVzAAAAAAATigAAACFUaGUgcHJvcG9zYWwgY29udGFpbnMgbm8gYWN0aW9ucy4AAAAAAAANRW1wdHlQcm9wb3NhbAAAAAAAE4sAAABAVGhlIHRhcmdldHMsIGZ1bmN0aW9ucywgYW5kIGFyZ3MgdmVjdG9ycyBoYXZlIGRpZmZlcmVudCBsZW5ndGhzLgAAABVJbnZhbGlkUHJvcG9zYWxMZW5ndGgAAAAAABOMAAAAKFRoZSBwcm9wb3NhbCBpcyBub3QgaW4gdGhlIGFjdGl2ZSBzdGF0ZS4AAAARUHJvcG9zYWxOb3RBY3RpdmUAAAAAABONAAAAH1RoZSBwcm9wb3NhbCBoYXMgbm90IHN1Y2NlZWRlZC4AAAAAFVByb3Bvc2FsTm90U3VjY2Vzc2Z1bAAAAAAAE44AAAAhVGhlIHByb3Bvc2FsIGhhcyBub3QgYmVlbiBxdWV1ZWQuAAAAAAAAEVByb3Bvc2FsTm90UXVldWVkAAAAAAATjwAAACdUaGUgcHJvcG9zYWwgaGFzIGFscmVhZHkgYmVlbiBleGVjdXRlZC4AAAAAF1Byb3Bvc2FsQWxyZWFkeUV4ZWN1dGVkAAAAE5AAAABSVGhlIHByb3Bvc2FsIGlzIGluIGEgbm9uLWNhbmNlbGxhYmxlIHN0YXRlIChgQ2FuY2VsZWRgLCBgRXhwaXJlZGAsIG9yCmBFeGVjdXRlZGApLgAAAAAAFlByb3Bvc2FsTm90Q2FuY2VsbGFibGUAAAAAE5EAAAAiVGhlIHZvdGluZyBkZWxheSBoYXMgbm90IGJlZW4gc2V0LgAAAAAAEVZvdGluZ0RlbGF5Tm90U2V0AAAAAAATkgAAACNUaGUgdm90aW5nIHBlcmlvZCBoYXMgbm90IGJlZW4gc2V0LgAAAAASVm90aW5nUGVyaW9kTm90U2V0AAAAABOTAAAAKFRoZSBwcm9wb3NhbCB0aHJlc2hvbGQgaGFzIG5vdCBiZWVuIHNldC4AAAAXUHJvcG9zYWxUaHJlc2hvbGROb3RTZXQAAAATlAAAABpUaGUgbmFtZSBoYXMgbm90IGJlZW4gc2V0LgAAAAAACk5hbWVOb3RTZXQAAAAAE5UAAAAdVGhlIHZlcnNpb24gaGFzIG5vdCBiZWVuIHNldC4AAAAAAAANVmVyc2lvbk5vdFNldAAAAAAAE5YAAAAdQXJpdGhtZXRpYyBvdmVyZmxvdyBvY2N1cnJlZC4AAAAAAAAMTWF0aE92ZXJmbG93AAATlwAAAC9UaGUgYWNjb3VudCBoYXMgYWxyZWFkeSB2b3RlZCBvbiB0aGlzIHByb3Bvc2FsLgAAAAAMQWxyZWFkeVZvdGVkAAATmAAAAC5UaGUgdm90ZSB0eXBlIGlzIGludmFsaWQgKG11c3QgYmUgMCwgMSwgb3IgMikuAAAAAAAPSW52YWxpZFZvdGVUeXBlAAAAE5kAAAAcVGhlIHF1b3J1bSBoYXMgbm90IGJlZW4gc2V0LgAAAAxRdW9ydW1Ob3RTZXQAABOaAAAAR1RoZSB0b2tlbiBjb250cmFjdCBoYXMgYWxyZWFkeSBiZWVuIHNldCAoY2FuIG9ubHkgYmUgaW5pdGlhbGl6ZWQgb25jZSkuAAAAABdUb2tlbkNvbnRyYWN0QWxyZWFkeVNldAAAABObAAAAJFRoZSB0b2tlbiBjb250cmFjdCBoYXMgbm90IGJlZW4gc2V0LgAAABNUb2tlbkNvbnRyYWN0Tm90U2V0AAAAE5wAAAA8VGhlIHByb3Bvc2FsIGRlc2NyaXB0aW9uIGV4Y2VlZHMgdGhlIG1heGltdW0gYWxsb3dlZCBsZW5ndGguAAAAEkRlc2NyaXB0aW9uVG9vTG9uZwAAAAATnQAAAClRdWV1aW5nIGlzIG5vdCBlbmFibGVkIGZvciB0aGlzIGdvdmVybm9yLgAAAAAAAA9RdWV1ZU5vdEVuYWJsZWQAAAATngAAAEZUaGUgdm90aW5nIHBlcmlvZCBpcyB6ZXJvLCB3aGljaCB3b3VsZCBsZWF2ZSBldmVyeSBwcm9wb3NhbCB1bnZvdGFibGUuAAAAAAATSW52YWxpZFZvdGluZ1BlcmlvZAAAABOf", "AAAAAwAABABUaGUgc3RhdGUgb2YgYSBwcm9wb3NhbCBpbiBpdHMgbGlmZWN5Y2xlLgoKU3RhdGVzIGFyZSBkaXZpZGVkIGludG8gdHdvIGNhdGVnb3JpZXM6CgojIyBUaW1lLWJhc2VkIHN0YXRlcyAoZGVyaXZlZCwgbmV2ZXIgc3RvcmVkIGV4cGxpY2l0bHkpCgpUaGVzZSBhcmUgY29tcHV0ZWQgYnkgW2BnZXRfcHJvcG9zYWxfc3RhdGUoKWBdIGZyb20gdGhlIGN1cnJlbnQgbGVkZ2VyCnJlbGF0aXZlIHRvIHRoZSBwcm9wb3NhbCdzIHZvdGluZyBzY2hlZHVsZS4gVGhleSBhcmUgb25seSByZXR1cm5lZCB3aGVuCm5vIGV4cGxpY2l0IHN0YXRlIGhhcyBiZWVuIHNldC4KCi0gW2BQZW5kaW5nYF0oUHJvcG9zYWxTdGF0ZTo6UGVuZGluZykg4oCUIHZvdGluZyBoYXMgbm90IHN0YXJ0ZWQgeWV0LgotIFtgQWN0aXZlYF0oUHJvcG9zYWxTdGF0ZTo6QWN0aXZlKSDigJQgdm90aW5nIGlzIG9uZ29pbmcuCi0gW2BEZWZlYXRlZGBdKFByb3Bvc2FsU3RhdGU6OkRlZmVhdGVkKSDigJQgdm90aW5nIGVuZGVkICoqd2l0aG91dCoqIHRoZQpjb3VudGluZyBsb2dpYyBtYXJraW5nIHRoZSBwcm9wb3NhbCBhcyBgU3VjY2VlZGVkYC4KCiMjIEV4cGxpY2l0IHN0YXRlcwoKU2V0IGV4cGxpY2l0bHkgYnkgdGhlIEdvdmVybm9yIG9yIGl0cyBleHRlbnNpb25zIGFuZCBwZXJzaXN0ZWQgaW4Kc3RvcmFnZS4gT25jZSBzZXQsIHRoZXkgdGFrZSBwcmVjZWRlbmNlIG92ZXIgYW55IHRpbWUtYmFzZWQgZGVyaXZhdGlvbi4KCi0gW2BDYW5jZWxlZGBdKFByb3Bvc2FsU3RhdGU6OkNhbmNlbGVkKSDigJQgc2V0IGJ5IHRoZSBHb3Zlcm5vci4KLSBbYFN1Y2NlZWRlZGBdKFByb3Bvc2FsU3RhdGU6OlN1Y2NlZWRlZCkg4oCUIHNldCBieSB0aGUgY291bnRpbmcgbG9naWMuCi0gW2BRdWV1ZWRgXShQcm9wb3NhbFN0YXRlOjpRdWV1ZWQpIC8gW2BFeHBpcmVkYF0oUHJvcG9zYWxTdGF0ZTo6RXhwaXJlZCkg4oCUCnNldCBieSBleHRlbnNpb25zIGxpa2UgYFRpbWVsb2NrQ29udHJvbGAuCi0gW2BFeGVjdXRlZGBdKFByb3Bvc2FsU3RhdGU6OkV4ZWN1AAAAAAAAAA1Qcm9wb3NhbFN0YXRlAAAAAAAACAAAADdUaGUgcHJvcG9zYWwgaXMgcGVuZGluZyBhbmQgdm90aW5nIGhhcyBub3Qgc3RhcnRlZCB5ZXQuAAAAAAdQZW5kaW5nAAAAAAAAAAAtVGhlIHByb3Bvc2FsIGlzIGFjdGl2ZSBhbmQgdm90aW5nIGlzIG9uZ29pbmcuAAAAAAAABkFjdGl2ZQAAAAAAAQAAAMhUaGUgcHJvcG9zYWwgd2FzIGRlZmVhdGVkIChkaWQgbm90IG1lZXQgcXVvcnVtIG9yIG1ham9yaXR5KS4gVGhpcyBpcwp0aGUgZGVmYXVsdCBvdXRjb21lIHdoZW4gdm90aW5nIGVuZHMgYW5kIHRoZSBjb3VudGluZyBsb2dpYyBoYXMKbm90IG1hcmtlZCB0aGUgcHJvcG9zYWwgYXMgW2BTdWNjZWVkZWRgXShQcm9wb3NhbFN0YXRlOjpTdWNjZWVkZWQpLgAAAAhEZWZlYXRlZAAAAAIAAAA1VGhlIHByb3Bvc2FsIGhhcyBiZWVuIGNhbmNlbGxlZC4gU2V0IGJ5IHRoZSBHb3Zlcm5vci4AAAAAAAAIQ2FuY2VsZWQAAAADAAAA3lRoZSBwcm9wb3NhbCBzdWNjZWVkZWQgYW5kIGNhbiBiZSBleGVjdXRlZC4gU2V0IGJ5IHRoZSBjb3VudGluZwpsb2dpYyB3aGVuIHRoZSBwcm9wb3NhbCBtZWV0cyB0aGUgcmVxdWlyZWQgcXVvcnVtIGFuZCB2b3RlCnRocmVzaG9sZHMuIElmIGEgcXVldWluZyBleHRlbnNpb24gaXMgZW5hYmxlZCwgdGhpcyBzdGF0ZSBtZWFucyB0aGUKcHJvcG9zYWwgaXMgcmVhZHkgdG8gYmUgcXVldWVkLgAAAAAACVN1Y2NlZWRlZAAAAAAAAAQAAABPVGhlIHByb3Bvc2FsIGlzIHF1ZXVlZCBmb3IgZXhlY3V0aW9uLiBTZXQgYnkgZXh0ZW5zaW9ucyBsaWtlCmBUaW1lbG9ja0NvbnRyb2xgLgAAAAAGUXVldWVkAAAAAAAFAAAAYVRoZSBwcm9wb3NhbCBoYXMgZXhwaXJlZCBhbmQgY2FuIG5vIGxvbmdlciBiZSBleGVjdXRlZC4gU2V0IGJ5CmV4dGVuc2lvbnMgbGlrZSBgVGltZWxvY2tDb250cm9sYC4AAAAAAAAHRXhwaXJlZAAAAAAGAAAANFRoZSBwcm9wb3NhbCBoYXMgYmVlbiBleGVjdXRlZC4gU2V0IGJ5IHRoZSBHb3Zlcm5vci4AAAAIRXhlY3V0ZWQAAAAH", "AAAABQAAAC9FdmVudCBlbWl0dGVkIHdoZW4gdGhlIHF1b3J1bSB2YWx1ZSBpcyBjaGFuZ2VkLgAAAAAAAAAADVF1b3J1bUNoYW5nZWQAAAAAAAABAAAADnF1b3J1bV9jaGFuZ2VkAAAAAAACAAAAAAAAAApvbGRfcXVvcnVtAAAAAAAKAAAAAAAAAAAAAAAKbmV3X3F1b3J1bQAAAAAACgAAAAAAAAAC", "AAAABQAAAClFdmVudCBlbWl0dGVkIHdoZW4gYSBwcm9wb3NhbCBpcyBjcmVhdGVkLgAAAAAAAAAAAAAPUHJvcG9zYWxDcmVhdGVkAAAAAAEAAAAQcHJvcG9zYWxfY3JlYXRlZAAAAAgAAAAAAAAAC3Byb3Bvc2FsX2lkAAAAA+4AAAAgAAAAAQAAAAAAAAAIcHJvcG9zZXIAAAATAAAAAQAAAAAAAAAHdGFyZ2V0cwAAAAPqAAAAEwAAAAAAAAAAAAAACWZ1bmN0aW9ucwAAAAAAA+oAAAARAAAAAAAAAAAAAAAEYXJncwAAA+oAAAPqAAAAAAAAAAAAAAAAAAAADXZvdGVfc25hcHNob3QAAAAAAAAEAAAAAAAAAAAAAAAIdm90ZV9lbmQAAAAEAAAAAAAAAAAAAAALZGVzY3JpcHRpb24AAAAAEAAAAAAAAAAC", "AAAABQAAACpFdmVudCBlbWl0dGVkIHdoZW4gYSBwcm9wb3NhbCBpcyBleGVjdXRlZC4AAAAAAAAAAAAQUHJvcG9zYWxFeGVjdXRlZAAAAAEAAAARcHJvcG9zYWxfZXhlY3V0ZWQAAAAAAAABAAAAAAAAAAtwcm9wb3NhbF9pZAAAAAPuAAAAIAAAAAEAAAAC", "AAAABQAAACtFdmVudCBlbWl0dGVkIHdoZW4gYSBwcm9wb3NhbCBpcyBjYW5jZWxsZWQuAAAAAAAAAAARUHJvcG9zYWxDYW5jZWxsZWQAAAAAAAABAAAAEnByb3Bvc2FsX2NhbmNlbGxlZAAAAAAAAQAAAAAAAAALcHJvcG9zYWxfaWQAAAAD7gAAACAAAAABAAAAAg=="]),
      options
    );
  }

   static deploy<T = Client>({ owner, token_contract, treasury_contract, voting_delay, voting_period, queue_delay, proposal_threshold, quorum_bps, manager, current_hash, version }: { owner: string | Address; token_contract: string | Address; treasury_contract: string | Address; voting_delay: number; voting_period: number; queue_delay: number; proposal_threshold: bigint; quorum_bps: number; manager: string | Address; current_hash: Uint8Array; version: string }, options: MethodOptions & Omit<ContractClientOptions, 'contractId'> & { salt?: Uint8Array; address?: string; } & ({ wasmHash: Uint8Array | string; format?: "hex" | "base64"; externalRef?: never; } | { externalRef: ExternalExecutableRef; wasmHash?: never; format?: never; })): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({ owner, token_contract, treasury_contract, voting_delay, voting_period, queue_delay, proposal_threshold, quorum_bps, manager, current_hash, version }, options);
  }
  public readonly fromJson = {
    name : this.txFromJson<string>,  queue : this.txFromJson<Uint8Array>,  cancel : this.txFromJson<Uint8Array>,  launch : this.txFromJson<void>,  quorum : this.txFromJson<bigint>,  consume : this.txFromJson<Uint8Array>,  execute : this.txFromJson<Uint8Array>,  propose : this.txFromJson<Uint8Array>,  upgrade : this.txFromJson<void>,  version : this.txFromJson<string>,  treasury : this.txFromJson<string>,  cast_vote : this.txFromJson<bigint>,  get_owner : this.txFromJson<string | null>,  has_voted : this.txFromJson<boolean>,  wasm_hash : this.txFromJson<Uint8Array>,  quorum_bps : this.txFromJson<number>,  sync_version : this.txFromJson<void>,  voting_delay : this.txFromJson<number>,  counting_mode : this.txFromJson<string>,  voting_period : this.txFromJson<number>,  proposal_state : this.txFromJson<ProposalState>,  set_quorum_bps : this.txFromJson<void>,  get_proposal_id : this.txFromJson<Uint8Array>,  set_queue_delay : this.txFromJson<void>,  accept_ownership : this.txFromJson<void>,  set_voting_delay : this.txFromJson<void>,  proposal_deadline : this.txFromJson<number>,  proposal_proposer : this.txFromJson<string>,  proposal_snapshot : this.txFromJson<number>,  set_voting_period : this.txFromJson<void>,  get_token_contract : this.txFromJson<string>,  proposal_threshold : this.txFromJson<bigint>,  renounce_ownership : this.txFromJson<void>,  transfer_ownership : this.txFromJson<void>,  proposals_need_queuing : this.txFromJson<boolean>,  set_proposal_threshold : this.txFromJson<void>
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
   * Build a topics filter row for the "Launched" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  launchedEventFilter(topicValues?: { treasury?: string | Address }): string[] {
    return this.spec.eventTopicFilter("Launched", topicValues);
  }
  /**
   * Build a topics filter row for the "ProposalQueued" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  proposalQueuedEventFilter(topicValues?: { proposal_id?: Uint8Array }): string[] {
    return this.spec.eventTopicFilter("ProposalQueued", topicValues);
  }
  /**
   * Build a topics filter row for the "QuorumBpsChanged" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  quorumBpsChangedEventFilter(topicValues?: { caller?: string | Address }): string[] {
    return this.spec.eventTopicFilter("QuorumBpsChanged", topicValues);
  }
  /**
   * Build a topics filter row for the "QueueDelayChanged" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  queueDelayChangedEventFilter(topicValues?: { caller?: string | Address }): string[] {
    return this.spec.eventTopicFilter("QueueDelayChanged", topicValues);
  }
  /**
   * Build a topics filter row for the "VotingDelayChanged" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  votingDelayChangedEventFilter(topicValues?: { caller?: string | Address }): string[] {
    return this.spec.eventTopicFilter("VotingDelayChanged", topicValues);
  }
  /**
   * Build a topics filter row for the "GovernorInitialized" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  governorInitializedEventFilter(topicValues?: { owner?: string | Address }): string[] {
    return this.spec.eventTopicFilter("GovernorInitialized", topicValues);
  }
  /**
   * Build a topics filter row for the "VotingPeriodChanged" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  votingPeriodChangedEventFilter(topicValues?: { caller?: string | Address }): string[] {
    return this.spec.eventTopicFilter("VotingPeriodChanged", topicValues);
  }
  /**
   * Build a topics filter row for the "ProposalThresholdChanged" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  proposalThresholdChangedEventFilter(topicValues?: { caller?: string | Address }): string[] {
    return this.spec.eventTopicFilter("ProposalThresholdChanged", topicValues);
  }
  /**
   * Build a topics filter row for the "OwnershipTransfer" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  ownershipTransferEventFilter(): string[] {
    return this.spec.eventTopicFilter("OwnershipTransfer");
  }
  /**
   * Build a topics filter row for the "OwnershipRenounced" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  ownershipRenouncedEventFilter(): string[] {
    return this.spec.eventTopicFilter("OwnershipRenounced");
  }
  /**
   * Build a topics filter row for the "OwnershipTransferCompleted" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  ownershipTransferCompletedEventFilter(): string[] {
    return this.spec.eventTopicFilter("OwnershipTransferCompleted");
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