import {ContractEvent} from './types.js';
import {Spec, AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, ExternalExecutableRef} from '@stellar/stellar-sdk/contract';
import {Address, xdr} from '@stellar/stellar-sdk';

export interface Client {
  mint({ minter, to }: { minter: string | Address; to: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * Returns the token contract owner used during the launch setup window.
   */
  owner(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * One-shot, Manager-only launch handoff (Setup -> Live).
   *
   * Requires the Manager's authorization and that the token is not yet live.
   * Sets the owner to `treasury` (clearing any pending two-step ownership
   * transfer), writes `MintAuthority` for exactly `minters`, marks the token
   * live, and emits `Launched`. A second call panics with `AlreadyLive`, so
   * after launch the Manager has no authority over the token.
   *
   * # Storage impact
   *
   * One instance key per minter (the Manager passes at most 4) plus the `Live` flag.
   */
  launch({ treasury, minters }: { treasury: string | Address; minters: Array<string | Address> }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Approves an address to transfer a specific token.
   *
   * # Arguments
   *
   * * `owner` - The owner of the token (must authenticate)
   * * `spender` - The address being approved
   * * `token_id` - The ID of the token to approve
   * * `expiration_ledger` - The ledger sequence when the approval expires
   *
   * # Authorization
   *
   * Requires authentication from `owner`.
   *
   * # Events
   *
   * Emits a standard `Approve` event (via OpenZeppelin).
   */
  approve({ owner, spender, token_id, expiration_ledger }: { owner: string | Address; spender: string | Address; token_id: number; expiration_ledger: number }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Returns the number of tokens owned by an account.
   *
   * # Arguments
   *
   * * `account` - The address to query
   *
   * # Returns
   *
   * The total number of NFTs owned by the account.
   */
  balance({ account }: { account: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * Whether the token has been launched (Setup -> Live). Used by the Minter
   * to refuse setup-window configuration.
   */
  is_live(options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  upgrade({ from_hash, to_hash }: { from_hash: Uint8Array; to_hash: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Returns the release version registered for the active token WASM.
   */
  version(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * Delegates voting power from `account` to `delegatee`.
   *
   * To reclaim voting power (i.e. "undelegate"), call this with
   * `delegatee` set to `account` (self-delegation). There is no
   * separate undelegate operation.
   *
   * # Arguments
   *
   * * `e` - Access to the Soroban environment.
   * * `account` - The account delegating its voting power.
   * * `delegatee` - The account receiving the delegated voting power.
   *
   * # Events
   *
   * * topics - `["delegate_changed", delegator: Address]`
   * * data - `[from_delegate: Option<Address>, to_delegate: Address]`
   *
   * * topics - `["delegate_votes_changed", delegate: Address]`
   * * data - `[previous_votes: u128, new_votes: u128]`
   *
   * # Notes
   *
   * Authorization for `account` is required.
   */
  delegate({ account, delegatee }: { account: string | Address; delegatee: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Returns the metadata contract used for mint hooks.
   */
  metadata(options?: MethodOptions): Promise<AssembledTransaction<string | null>>;
  /**
   * Returns the owner of a specific token.
   *
   * # Arguments
   *
   * * `token_id` - The ID of the token to query
   *
   * # Returns
   *
   * The address that owns the specified token.
   *
   * # Panics
   *
   * Panics if the token ID does not exist.
   */
  owner_of({ token_id }: { token_id: number }, options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * Transfers a token from one address to another.
   *
   * The recipient is automatically self-delegated if they don't have an existing
   * delegation, and voting power is automatically moved from the old owner's
   * delegate to the new owner's delegate via the checkpoint system.
   *
   * # Arguments
   *
   * * `from` - The current owner of the token (must authenticate)
   * * `to` - The address receiving the token
   * * `token_id` - The ID of the token to transfer
   *
   * # Authorization
   *
   * Requires authentication from `from` address.
   *
   * # Events
   *
   * Emits a standard `Transfer` event (via OpenZeppelin) and updates voting
   * power checkpoints for both sender and receiver delegates.
   */
  transfer({ from, to, token_id }: { from: string | Address; to: string | Address; token_id: number }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
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
   * Returns the current voting power (delegated votes) of an account.
   *
   * Returns `0` if the account has no delegated voting power or does not
   * exist in the contract.
   *
   * # Arguments
   *
   * * `e` - Access to the Soroban environment.
   * * `account` - The address to query voting power for.
   */
  get_votes({ account }: { account: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<bigint>>;
  /**
   * Returns the active token WASM hash.
   */
  wasm_hash(options?: MethodOptions): Promise<AssembledTransaction<Uint8Array>>;
  /**
   * Batch mints multiple NFTs to multiple recipients with optimized checkpoint handling.
   *
   * This function is designed to efficiently mint many tokens in a single transaction
   * by grouping operations per recipient. It addresses two critical inefficiencies:
   * 1. Delegation checks are performed once per unique recipient (not per token)
   * 2. Voting checkpoints are created once per recipient (not per token)
   *
   * This optimization is essential for Stellar's storage footprint prediction during
   * CLI simulation. Without batching, the second and subsequent mints fail with
   * "trying to access contract data key outside of the footprint" errors.
   *
   * # Arguments
   *
   * * `minter` - The address performing the mint (must be owner or have mint authority)
   * * `recipients` - Vector of addresses receiving tokens
   * * `amounts` - Vector of token counts, one per recipient (must match recipients length)
   *
   * # Returns
   *
   * A vector of all newly minted token IDs in sequential order.
   *
   * # Authorization
   *
   * Requires authentication from `minter` and validates minting authority.
   *
   * #
   */
  batch_mint({ minter, recipients, amounts }: { minter: string | Address; recipients: Array<string | Address>; amounts: Array<bigint> }, options?: MethodOptions): Promise<AssembledTransaction<Array<number>>>;
  /**
   * Returns the current delegate for an account.
   *
   * # Arguments
   *
   * * `e` - Access to the Soroban environment.
   * * `account` - The address to query the delegate for.
   *
   * # Returns
   *
   * * `Some(Address)` - The delegate address (may be the account itself if
   * self-delegated).
   * * `None` - If the account has never delegated. An account whose delegate
   * is `None` has **no active voting power**; it must call
   * [`Votes::delegate`] (even to itself) before its votes are counted.
   */
  get_delegate({ account }: { account: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<string | null>>;
  /**
   * Updates collection metadata during the launch-admin setup window or
   * later through the module owner.
   */
  set_metadata({ uri, name, symbol }: { uri: string; name: string; symbol: string }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Re-reads the version for the active WASM hash from the Manager registry.
   */
  sync_version(options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Mints a single NFT to the specified address.
   *
   * The token is assigned a sequential ID (starting from 0) and the recipient
   * is automatically self-delegated if they don't have an existing delegation,
   * ensuring they immediately receive voting power.
   *
   * # Arguments
   *
   * * `minter` - The address performing the mint (must be owner or have mint authority)
   * * `to` - The address receiving the newly minted token
   *
   * # Returns
   *
   * The ID of the newly minted token.
   *
   * # Authorization
   *
   * Requires authentication from `minter` and validates minting authority.
   *
   * # Panics
   *
   * Panics with `TokenError::MintAuthorityNotAllowed` if the minter lacks authority.
   *
   * # Events
   *
   * Emits both a standard `Mint` event (via OpenZeppelin) and a custom
   * `MintWithMinter` event that includes the minter's address.
   * Returns total minted voting units for manager launch validation.
   */
  total_supply(options?: MethodOptions): Promise<AssembledTransaction<bigint>>;
  /**
   * Transfers a token on behalf of the owner using a previously granted approval.
   *
   * Similar to `transfer()` but allows an approved spender to transfer the token.
   * The recipient is automatically self-delegated and voting power is updated.
   *
   * # Arguments
   *
   * * `spender` - The address performing the transfer (must be approved or operator)
   * * `from` - The current owner of the token
   * * `to` - The address receiving the token
   * * `token_id` - The ID of the token to transfer
   *
   * # Authorization
   *
   * Requires authentication from `spender` and validates approval for `token_id`.
   *
   * # Events
   *
   * Emits a standard `Transfer` event (via OpenZeppelin) and updates voting
   * power checkpoints for both sender and receiver delegates.
   */
  transfer_from({ spender, from, to, token_id }: { spender: string | Address; from: string | Address; to: string | Address; token_id: number }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Checks if an address has minting authority.
   *
   * # Arguments
   *
   * * `authority` - The address to check
   *
   * # Returns
   *
   * `true` if the address has minting authority, `false` otherwise.
   * The owner always has implicit minting authority even if not explicitly set.
   */
  mint_authority({ authority }: { authority: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  /**
   * Returns the number of checkpoints for an account.
   *
   * # Arguments
   *
   * * `account` - The address to query
   *
   * # Returns
   *
   * The number of checkpoints recorded for this account
   */
  num_checkpoints({ account }: { account: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<number>>;
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
  /**
   * Returns the current total supply of voting units.
   *
   * This tracks all voting units in circulation (regardless of delegation
   * status), not just delegated votes.
   *
   * Returns `0` if no voting units exist.
   *
   * # Arguments
   *
   * * `e` - Access to the Soroban environment.
   */
  get_total_supply(options?: MethodOptions): Promise<AssembledTransaction<bigint>>;
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
   * Grants or revokes minting authority for an address.
   *
   * Only the contract owner can call this function. This allows delegating
   * minting capabilities to other contracts (e.g., an auction contract) without
   * transferring ownership.
   *
   * # Arguments
   *
   * * `authority` - The address to grant or revoke minting authority
   * * `enabled` - `true` to grant authority, `false` to revoke it
   *
   * # Authorization
   *
   * Requires owner authentication (enforced by `#[only_owner]` macro) and a
   * live token (`NotLive` before launch).
   *
   * # Events
   *
   * Emits a `MintAuthorityChanged` event with old and new permission states.
   */
  set_mint_authority({ authority, enabled }: { authority: string | Address; enabled: boolean }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
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
  /**
   * Returns the voting power (delegated votes) of an account at a specific
   * past ledger sequence number.
   *
   * Returns `0` if the account had no delegated voting power at the given
   * ledger or does not exist in the contract.
   *
   * # Arguments
   *
   * * `e` - Access to the Soroban environment.
   * * `account` - The address to query voting power for.
   * * `ledger` - The ledger sequence number to query (must be in the past).
   *
   * # Errors
   *
   * * [`VotesError::FutureLookup`] - If `ledger` >= current ledger sequence
   * number.
   */
  get_votes_at_checkpoint({ account, ledger }: { account: string | Address; ledger: number }, options?: MethodOptions): Promise<AssembledTransaction<bigint>>;
  /**
   * Returns the total supply of voting units at a specific past ledger
   * sequence number.
   *
   * This tracks all voting units in circulation (regardless of delegation
   * status), not just delegated votes.
   *
   * Returns `0` if there were no voting units at the given ledger.
   *
   * # Arguments
   *
   * * `e` - Access to the Soroban environment.
   * * `ledger` - The ledger sequence number to query (must be in the past).
   *
   * # Errors
   *
   * * [`VotesError::FutureLookup`] - If `ledger` >= current ledger sequence
   * number.
   */
  get_total_supply_at_checkpoint({ ledger }: { ledger: number }, options?: MethodOptions): Promise<AssembledTransaction<bigint>>;
}

export class Client extends ContractClient {
  constructor(public readonly options: ContractClientOptions) {
    super(
      new Spec(["AAAABAAAAAAAAAAAAAAAClRva2VuRXJyb3IAAAAAAAUAAAAhT3duZXIgbm90IHNldCBpbiBjb250cmFjdCBzdG9yYWdlAAAAAAAAC093bmVyTm90U2V0AAAABE4AAAAnTWludGVyIGlzIG5vdCBhdXRob3JpemVkIHRvIG1pbnQgdG9rZW5zAAAAABdNaW50QXV0aG9yaXR5Tm90QWxsb3dlZAAAAARPAAAAQUludmFsaWQgaW5wdXQgcGFyYW1ldGVycyAobWlzbWF0Y2hlZCBsZW5ndGhzLCB6ZXJvIGFtb3VudHMsIGV0Yy4pAAAAAAAADEludmFsaWRJbnB1dAAABFAAAABBYGxhdW5jaGAgdHJlYXN1cnkgZGlmZmVycyBmcm9tIHRoZSB0cmVhc3VyeSB3aXJlZCBhdCBjb25zdHJ1Y3Rpb24AAAAAAAAQVHJlYXN1cnlNaXNtYXRjaAAABFEAAAAzYGxhdW5jaGAgbWludGVycyBsaXN0IGRvZXMgbm90IGNvbnRhaW4gdGhlIHRyZWFzdXJ5AAAAABFUcmVhc3VyeU5vdE1pbnRlcgAAAAAABFI=", "AAAABQAAAEFFbWl0dGVkIG9uY2Ugd2hlbiB0aGUgTWFuYWdlciBsYXVuY2hlcyB0aGUgdG9rZW4gKFNldHVwIC0+IExpdmUpLgAAAAAAAAAAAAAITGF1bmNoZWQAAAABAAAACGxhdW5jaGVkAAAAAgAAAAAAAAAIdHJlYXN1cnkAAAATAAAAAQAAAAAAAAAHbWludGVycwAAAAPqAAAAEwAAAAAAAAAC", "AAAABQAAAU9DdXN0b20gZXZlbnQgdG8gdHJhY2sgbWludGVyIGluZm9ybWF0aW9uIGR1cmluZyBzaW5nbGUgdG9rZW4gbWludHMuCgpPcGVuWmVwcGVsaW4ncyBzdGFuZGFyZCBNaW50IGV2ZW50IGRvZXNuJ3QgaW5jbHVkZSB0aGUgbWludGVyIGFkZHJlc3MsIG9ubHkKdGhlIHJlY2lwaWVudC4gVGhpcyBjdXN0b20gZXZlbnQgc3VwcGxlbWVudHMgaXQgYnkgdHJhY2tpbmcgd2hvIHBlcmZvcm1lZCB0aGUgbWludCwKd2hpY2ggaXMgdXNlZnVsIGZvciBhdWRpdGluZyBhbmQgYW5hbHl0aWNzIChlLmcuLCBkaXN0aW5ndWlzaGluZyBvd25lciBtaW50cwpmcm9tIGF1Y3Rpb24gY29udHJhY3QgbWludHMpLgAAAAAAAAAADk1pbnRXaXRoTWludGVyAAAAAAABAAAAEG1pbnRfd2l0aF9taW50ZXIAAAADAAAAAAAAAAZtaW50ZXIAAAAAABMAAAABAAAAAAAAAAJ0bwAAAAAAEwAAAAEAAAAAAAAACHRva2VuX2lkAAAABAAAAAAAAAAC", "AAAABQAAALdFbWl0dGVkIHdoZW4gdGhlIHRva2VuIGNvbnRyYWN0IGlzIGluaXRpYWxpemVkLgoKQ29udGFpbnMgdGhlIGluaXRpYWwgb3duZXIgYW5kIHRva2VuIG1ldGFkYXRhLiBUaGlzIGV2ZW50IGlzIGVtaXR0ZWQgb25jZQpkdXJpbmcgY29udHJhY3QgZGVwbG95bWVudCB2aWEgdGhlIGBfX2NvbnN0cnVjdG9yYCBmdW5jdGlvbi4AAAAAAAAAABBUb2tlbkluaXRpYWxpemVkAAAAAQAAABF0b2tlbl9pbml0aWFsaXplZAAAAAAAAAUAAAAAAAAABW93bmVyAAAAAAAAEwAAAAEAAAAAAAAAA3VyaQAAAAAQAAAAAAAAAAAAAAAEbmFtZQAAABAAAAAAAAAAAAAAAAZzeW1ib2wAAAAAABAAAAAAAAAAAAAAAAd2ZXJzaW9uAAAAABAAAAAAAAAAAg==", "AAAABQAAAORFbWl0dGVkIHdoZW4gbWludGluZyBhdXRob3JpdHkgaXMgZ3JhbnRlZCBvciByZXZva2VkIGZvciBhbiBhZGRyZXNzLgoKVHJhY2tzIGNoYW5nZXMgdG8gbWludCBwZXJtaXNzaW9ucywgaW5jbHVkaW5nIHdobyBtYWRlIHRoZSBjaGFuZ2UgKGFsd2F5cyB0aGUgb3duZXIpLgpUaGUgb3duZXIgYWx3YXlzIGhhcyBpbXBsaWNpdCBtaW50aW5nIGF1dGhvcml0eSByZWdhcmRsZXNzIG9mIHRoaXMgZmxhZy4AAAAAAAAAFE1pbnRBdXRob3JpdHlDaGFuZ2VkAAAAAQAAABZtaW50X2F1dGhvcml0eV9jaGFuZ2VkAAAAAAAEAAAAAAAAAAlhdXRob3JpdHkAAAAAAAATAAAAAQAAAAAAAAALb2xkX2VuYWJsZWQAAAAAAQAAAAAAAAAAAAAAB2VuYWJsZWQAAAAAAQAAAAAAAAAAAAAACmNoYW5nZWRfYnkAAAAAABMAAAAAAAAAAg==", "AAAAAAAAAAAAAAAEbWludAAAAAIAAAAAAAAABm1pbnRlcgAAAAAAEwAAAAAAAAACdG8AAAAAABMAAAABAAAABA==", "AAAAAAAAAEVSZXR1cm5zIHRoZSB0b2tlbiBjb250cmFjdCBvd25lciB1c2VkIGR1cmluZyB0aGUgbGF1bmNoIHNldHVwIHdpbmRvdy4AAAAAAAAFb3duZXIAAAAAAAAAAAAAAQAAABM=", "AAAAAAAAAfVPbmUtc2hvdCwgTWFuYWdlci1vbmx5IGxhdW5jaCBoYW5kb2ZmIChTZXR1cCAtPiBMaXZlKS4KClJlcXVpcmVzIHRoZSBNYW5hZ2VyJ3MgYXV0aG9yaXphdGlvbiBhbmQgdGhhdCB0aGUgdG9rZW4gaXMgbm90IHlldCBsaXZlLgpTZXRzIHRoZSBvd25lciB0byBgdHJlYXN1cnlgIChjbGVhcmluZyBhbnkgcGVuZGluZyB0d28tc3RlcCBvd25lcnNoaXAKdHJhbnNmZXIpLCB3cml0ZXMgYE1pbnRBdXRob3JpdHlgIGZvciBleGFjdGx5IGBtaW50ZXJzYCwgbWFya3MgdGhlIHRva2VuCmxpdmUsIGFuZCBlbWl0cyBgTGF1bmNoZWRgLiBBIHNlY29uZCBjYWxsIHBhbmljcyB3aXRoIGBBbHJlYWR5TGl2ZWAsIHNvCmFmdGVyIGxhdW5jaCB0aGUgTWFuYWdlciBoYXMgbm8gYXV0aG9yaXR5IG92ZXIgdGhlIHRva2VuLgoKIyBTdG9yYWdlIGltcGFjdAoKT25lIGluc3RhbmNlIGtleSBwZXIgbWludGVyICh0aGUgTWFuYWdlciBwYXNzZXMgYXQgbW9zdCA0KSBwbHVzIHRoZSBgTGl2ZWAgZmxhZy4AAAAAAAAGbGF1bmNoAAAAAAACAAAAAAAAAAh0cmVhc3VyeQAAABMAAAAAAAAAB21pbnRlcnMAAAAD6gAAABMAAAAA", "AAAAAAAAAYtBcHByb3ZlcyBhbiBhZGRyZXNzIHRvIHRyYW5zZmVyIGEgc3BlY2lmaWMgdG9rZW4uCgojIEFyZ3VtZW50cwoKKiBgb3duZXJgIC0gVGhlIG93bmVyIG9mIHRoZSB0b2tlbiAobXVzdCBhdXRoZW50aWNhdGUpCiogYHNwZW5kZXJgIC0gVGhlIGFkZHJlc3MgYmVpbmcgYXBwcm92ZWQKKiBgdG9rZW5faWRgIC0gVGhlIElEIG9mIHRoZSB0b2tlbiB0byBhcHByb3ZlCiogYGV4cGlyYXRpb25fbGVkZ2VyYCAtIFRoZSBsZWRnZXIgc2VxdWVuY2Ugd2hlbiB0aGUgYXBwcm92YWwgZXhwaXJlcwoKIyBBdXRob3JpemF0aW9uCgpSZXF1aXJlcyBhdXRoZW50aWNhdGlvbiBmcm9tIGBvd25lcmAuCgojIEV2ZW50cwoKRW1pdHMgYSBzdGFuZGFyZCBgQXBwcm92ZWAgZXZlbnQgKHZpYSBPcGVuWmVwcGVsaW4pLgAAAAAHYXBwcm92ZQAAAAAEAAAAAAAAAAVvd25lcgAAAAAAABMAAAAAAAAAB3NwZW5kZXIAAAAAEwAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAAAAABFleHBpcmF0aW9uX2xlZGdlcgAAAAAAAAQAAAAA", "AAAAAAAAAJ1SZXR1cm5zIHRoZSBudW1iZXIgb2YgdG9rZW5zIG93bmVkIGJ5IGFuIGFjY291bnQuCgojIEFyZ3VtZW50cwoKKiBgYWNjb3VudGAgLSBUaGUgYWRkcmVzcyB0byBxdWVyeQoKIyBSZXR1cm5zCgpUaGUgdG90YWwgbnVtYmVyIG9mIE5GVHMgb3duZWQgYnkgdGhlIGFjY291bnQuAAAAAAAAB2JhbGFuY2UAAAAAAQAAAAAAAAAHYWNjb3VudAAAAAATAAAAAQAAAAQ=", "AAAAAAAAAG1XaGV0aGVyIHRoZSB0b2tlbiBoYXMgYmVlbiBsYXVuY2hlZCAoU2V0dXAgLT4gTGl2ZSkuIFVzZWQgYnkgdGhlIE1pbnRlcgp0byByZWZ1c2Ugc2V0dXAtd2luZG93IGNvbmZpZ3VyYXRpb24uAAAAAAAAB2lzX2xpdmUAAAAAAAAAAAEAAAAB", "AAAAAAAAAAAAAAAHdXBncmFkZQAAAAACAAAAAAAAAAlmcm9tX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAHdG9faGFzaAAAAAPuAAAAIAAAAAA=", "AAAAAAAAAEFSZXR1cm5zIHRoZSByZWxlYXNlIHZlcnNpb24gcmVnaXN0ZXJlZCBmb3IgdGhlIGFjdGl2ZSB0b2tlbiBXQVNNLgAAAAAAAAd2ZXJzaW9uAAAAAAAAAAABAAAAEA==", "AAAAAAAAAqREZWxlZ2F0ZXMgdm90aW5nIHBvd2VyIGZyb20gYGFjY291bnRgIHRvIGBkZWxlZ2F0ZWVgLgoKVG8gcmVjbGFpbSB2b3RpbmcgcG93ZXIgKGkuZS4gInVuZGVsZWdhdGUiKSwgY2FsbCB0aGlzIHdpdGgKYGRlbGVnYXRlZWAgc2V0IHRvIGBhY2NvdW50YCAoc2VsZi1kZWxlZ2F0aW9uKS4gVGhlcmUgaXMgbm8Kc2VwYXJhdGUgdW5kZWxlZ2F0ZSBvcGVyYXRpb24uCgojIEFyZ3VtZW50cwoKKiBgZWAgLSBBY2Nlc3MgdG8gdGhlIFNvcm9iYW4gZW52aXJvbm1lbnQuCiogYGFjY291bnRgIC0gVGhlIGFjY291bnQgZGVsZWdhdGluZyBpdHMgdm90aW5nIHBvd2VyLgoqIGBkZWxlZ2F0ZWVgIC0gVGhlIGFjY291bnQgcmVjZWl2aW5nIHRoZSBkZWxlZ2F0ZWQgdm90aW5nIHBvd2VyLgoKIyBFdmVudHMKCiogdG9waWNzIC0gYFsiZGVsZWdhdGVfY2hhbmdlZCIsIGRlbGVnYXRvcjogQWRkcmVzc11gCiogZGF0YSAtIGBbZnJvbV9kZWxlZ2F0ZTogT3B0aW9uPEFkZHJlc3M+LCB0b19kZWxlZ2F0ZTogQWRkcmVzc11gCgoqIHRvcGljcyAtIGBbImRlbGVnYXRlX3ZvdGVzX2NoYW5nZWQiLCBkZWxlZ2F0ZTogQWRkcmVzc11gCiogZGF0YSAtIGBbcHJldmlvdXNfdm90ZXM6IHUxMjgsIG5ld192b3RlczogdTEyOF1gCgojIE5vdGVzCgpBdXRob3JpemF0aW9uIGZvciBgYWNjb3VudGAgaXMgcmVxdWlyZWQuAAAACGRlbGVnYXRlAAAAAgAAAAAAAAAHYWNjb3VudAAAAAATAAAAAAAAAAlkZWxlZ2F0ZWUAAAAAAAATAAAAAA==", "AAAAAAAAADJSZXR1cm5zIHRoZSBtZXRhZGF0YSBjb250cmFjdCB1c2VkIGZvciBtaW50IGhvb2tzLgAAAAAACG1ldGFkYXRhAAAAAAAAAAEAAAPoAAAAEw==", "AAAAAAAAAMlSZXR1cm5zIHRoZSBvd25lciBvZiBhIHNwZWNpZmljIHRva2VuLgoKIyBBcmd1bWVudHMKCiogYHRva2VuX2lkYCAtIFRoZSBJRCBvZiB0aGUgdG9rZW4gdG8gcXVlcnkKCiMgUmV0dXJucwoKVGhlIGFkZHJlc3MgdGhhdCBvd25zIHRoZSBzcGVjaWZpZWQgdG9rZW4uCgojIFBhbmljcwoKUGFuaWNzIGlmIHRoZSB0b2tlbiBJRCBkb2VzIG5vdCBleGlzdC4AAAAAAAAIb3duZXJfb2YAAAABAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAABAAAAEw==", "AAAAAAAAAnVUcmFuc2ZlcnMgYSB0b2tlbiBmcm9tIG9uZSBhZGRyZXNzIHRvIGFub3RoZXIuCgpUaGUgcmVjaXBpZW50IGlzIGF1dG9tYXRpY2FsbHkgc2VsZi1kZWxlZ2F0ZWQgaWYgdGhleSBkb24ndCBoYXZlIGFuIGV4aXN0aW5nCmRlbGVnYXRpb24sIGFuZCB2b3RpbmcgcG93ZXIgaXMgYXV0b21hdGljYWxseSBtb3ZlZCBmcm9tIHRoZSBvbGQgb3duZXIncwpkZWxlZ2F0ZSB0byB0aGUgbmV3IG93bmVyJ3MgZGVsZWdhdGUgdmlhIHRoZSBjaGVja3BvaW50IHN5c3RlbS4KCiMgQXJndW1lbnRzCgoqIGBmcm9tYCAtIFRoZSBjdXJyZW50IG93bmVyIG9mIHRoZSB0b2tlbiAobXVzdCBhdXRoZW50aWNhdGUpCiogYHRvYCAtIFRoZSBhZGRyZXNzIHJlY2VpdmluZyB0aGUgdG9rZW4KKiBgdG9rZW5faWRgIC0gVGhlIElEIG9mIHRoZSB0b2tlbiB0byB0cmFuc2ZlcgoKIyBBdXRob3JpemF0aW9uCgpSZXF1aXJlcyBhdXRoZW50aWNhdGlvbiBmcm9tIGBmcm9tYCBhZGRyZXNzLgoKIyBFdmVudHMKCkVtaXRzIGEgc3RhbmRhcmQgYFRyYW5zZmVyYCBldmVudCAodmlhIE9wZW5aZXBwZWxpbikgYW5kIHVwZGF0ZXMgdm90aW5nCnBvd2VyIGNoZWNrcG9pbnRzIGZvciBib3RoIHNlbmRlciBhbmQgcmVjZWl2ZXIgZGVsZWdhdGVzLgAAAAAAAAh0cmFuc2ZlcgAAAAMAAAAAAAAABGZyb20AAAATAAAAAAAAAAJ0bwAAAAAAEwAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAA==", "AAAAAAAAAJBSZXR1cm5zIGBTb21lKEFkZHJlc3MpYCBpZiBvd25lcnNoaXAgaXMgc2V0LCBvciBgTm9uZWAgaWYgb3duZXJzaGlwIGhhcwpiZWVuIHJlbm91bmNlZC4KCiMgQXJndW1lbnRzCgoqIGBlYCAtIEFjY2VzcyB0byB0aGUgU29yb2JhbiBlbnZpcm9ubWVudC4AAAAJZ2V0X293bmVyAAAAAAAAAAAAAAEAAAPoAAAAEw==", "AAAAAAAAAQxSZXR1cm5zIHRoZSBjdXJyZW50IHZvdGluZyBwb3dlciAoZGVsZWdhdGVkIHZvdGVzKSBvZiBhbiBhY2NvdW50LgoKUmV0dXJucyBgMGAgaWYgdGhlIGFjY291bnQgaGFzIG5vIGRlbGVnYXRlZCB2b3RpbmcgcG93ZXIgb3IgZG9lcyBub3QKZXhpc3QgaW4gdGhlIGNvbnRyYWN0LgoKIyBBcmd1bWVudHMKCiogYGVgIC0gQWNjZXNzIHRvIHRoZSBTb3JvYmFuIGVudmlyb25tZW50LgoqIGBhY2NvdW50YCAtIFRoZSBhZGRyZXNzIHRvIHF1ZXJ5IHZvdGluZyBwb3dlciBmb3IuAAAACWdldF92b3RlcwAAAAAAAAEAAAAAAAAAB2FjY291bnQAAAAAEwAAAAEAAAAK", "AAAAAAAAACNSZXR1cm5zIHRoZSBhY3RpdmUgdG9rZW4gV0FTTSBoYXNoLgAAAAAJd2FzbV9oYXNoAAAAAAAAAAAAAAEAAAPuAAAAIA==", "AAAAAAAABABCYXRjaCBtaW50cyBtdWx0aXBsZSBORlRzIHRvIG11bHRpcGxlIHJlY2lwaWVudHMgd2l0aCBvcHRpbWl6ZWQgY2hlY2twb2ludCBoYW5kbGluZy4KClRoaXMgZnVuY3Rpb24gaXMgZGVzaWduZWQgdG8gZWZmaWNpZW50bHkgbWludCBtYW55IHRva2VucyBpbiBhIHNpbmdsZSB0cmFuc2FjdGlvbgpieSBncm91cGluZyBvcGVyYXRpb25zIHBlciByZWNpcGllbnQuIEl0IGFkZHJlc3NlcyB0d28gY3JpdGljYWwgaW5lZmZpY2llbmNpZXM6CjEuIERlbGVnYXRpb24gY2hlY2tzIGFyZSBwZXJmb3JtZWQgb25jZSBwZXIgdW5pcXVlIHJlY2lwaWVudCAobm90IHBlciB0b2tlbikKMi4gVm90aW5nIGNoZWNrcG9pbnRzIGFyZSBjcmVhdGVkIG9uY2UgcGVyIHJlY2lwaWVudCAobm90IHBlciB0b2tlbikKClRoaXMgb3B0aW1pemF0aW9uIGlzIGVzc2VudGlhbCBmb3IgU3RlbGxhcidzIHN0b3JhZ2UgZm9vdHByaW50IHByZWRpY3Rpb24gZHVyaW5nCkNMSSBzaW11bGF0aW9uLiBXaXRob3V0IGJhdGNoaW5nLCB0aGUgc2Vjb25kIGFuZCBzdWJzZXF1ZW50IG1pbnRzIGZhaWwgd2l0aAoidHJ5aW5nIHRvIGFjY2VzcyBjb250cmFjdCBkYXRhIGtleSBvdXRzaWRlIG9mIHRoZSBmb290cHJpbnQiIGVycm9ycy4KCiMgQXJndW1lbnRzCgoqIGBtaW50ZXJgIC0gVGhlIGFkZHJlc3MgcGVyZm9ybWluZyB0aGUgbWludCAobXVzdCBiZSBvd25lciBvciBoYXZlIG1pbnQgYXV0aG9yaXR5KQoqIGByZWNpcGllbnRzYCAtIFZlY3RvciBvZiBhZGRyZXNzZXMgcmVjZWl2aW5nIHRva2VucwoqIGBhbW91bnRzYCAtIFZlY3RvciBvZiB0b2tlbiBjb3VudHMsIG9uZSBwZXIgcmVjaXBpZW50IChtdXN0IG1hdGNoIHJlY2lwaWVudHMgbGVuZ3RoKQoKIyBSZXR1cm5zCgpBIHZlY3RvciBvZiBhbGwgbmV3bHkgbWludGVkIHRva2VuIElEcyBpbiBzZXF1ZW50aWFsIG9yZGVyLgoKIyBBdXRob3JpemF0aW9uCgpSZXF1aXJlcyBhdXRoZW50aWNhdGlvbiBmcm9tIGBtaW50ZXJgIGFuZCB2YWxpZGF0ZXMgbWludGluZyBhdXRob3JpdHkuCgojAAAACmJhdGNoX21pbnQAAAAAAAMAAAAAAAAABm1pbnRlcgAAAAAAEwAAAAAAAAAKcmVjaXBpZW50cwAAAAAD6gAAABMAAAAAAAAAB2Ftb3VudHMAAAAD6gAAAAoAAAABAAAD6gAAAAQ=", "AAAAAAAAAcFSZXR1cm5zIHRoZSBjdXJyZW50IGRlbGVnYXRlIGZvciBhbiBhY2NvdW50LgoKIyBBcmd1bWVudHMKCiogYGVgIC0gQWNjZXNzIHRvIHRoZSBTb3JvYmFuIGVudmlyb25tZW50LgoqIGBhY2NvdW50YCAtIFRoZSBhZGRyZXNzIHRvIHF1ZXJ5IHRoZSBkZWxlZ2F0ZSBmb3IuCgojIFJldHVybnMKCiogYFNvbWUoQWRkcmVzcylgIC0gVGhlIGRlbGVnYXRlIGFkZHJlc3MgKG1heSBiZSB0aGUgYWNjb3VudCBpdHNlbGYgaWYKc2VsZi1kZWxlZ2F0ZWQpLgoqIGBOb25lYCAtIElmIHRoZSBhY2NvdW50IGhhcyBuZXZlciBkZWxlZ2F0ZWQuIEFuIGFjY291bnQgd2hvc2UgZGVsZWdhdGUKaXMgYE5vbmVgIGhhcyAqKm5vIGFjdGl2ZSB2b3RpbmcgcG93ZXIqKjsgaXQgbXVzdCBjYWxsCltgVm90ZXM6OmRlbGVnYXRlYF0gKGV2ZW4gdG8gaXRzZWxmKSBiZWZvcmUgaXRzIHZvdGVzIGFyZSBjb3VudGVkLgAAAAAAAAxnZXRfZGVsZWdhdGUAAAABAAAAAAAAAAdhY2NvdW50AAAAABMAAAABAAAD6AAAABM=", "AAAAAAAAAGNVcGRhdGVzIGNvbGxlY3Rpb24gbWV0YWRhdGEgZHVyaW5nIHRoZSBsYXVuY2gtYWRtaW4gc2V0dXAgd2luZG93IG9yCmxhdGVyIHRocm91Z2ggdGhlIG1vZHVsZSBvd25lci4AAAAADHNldF9tZXRhZGF0YQAAAAMAAAAAAAAAA3VyaQAAAAAQAAAAAAAAAARuYW1lAAAAEAAAAAAAAAAGc3ltYm9sAAAAAAAQAAAAAA==", "AAAAAAAAAEhSZS1yZWFkcyB0aGUgdmVyc2lvbiBmb3IgdGhlIGFjdGl2ZSBXQVNNIGhhc2ggZnJvbSB0aGUgTWFuYWdlciByZWdpc3RyeS4AAAAMc3luY192ZXJzaW9uAAAAAAAAAAA=", "AAAAAAAAAzdNaW50cyBhIHNpbmdsZSBORlQgdG8gdGhlIHNwZWNpZmllZCBhZGRyZXNzLgoKVGhlIHRva2VuIGlzIGFzc2lnbmVkIGEgc2VxdWVudGlhbCBJRCAoc3RhcnRpbmcgZnJvbSAwKSBhbmQgdGhlIHJlY2lwaWVudAppcyBhdXRvbWF0aWNhbGx5IHNlbGYtZGVsZWdhdGVkIGlmIHRoZXkgZG9uJ3QgaGF2ZSBhbiBleGlzdGluZyBkZWxlZ2F0aW9uLAplbnN1cmluZyB0aGV5IGltbWVkaWF0ZWx5IHJlY2VpdmUgdm90aW5nIHBvd2VyLgoKIyBBcmd1bWVudHMKCiogYG1pbnRlcmAgLSBUaGUgYWRkcmVzcyBwZXJmb3JtaW5nIHRoZSBtaW50IChtdXN0IGJlIG93bmVyIG9yIGhhdmUgbWludCBhdXRob3JpdHkpCiogYHRvYCAtIFRoZSBhZGRyZXNzIHJlY2VpdmluZyB0aGUgbmV3bHkgbWludGVkIHRva2VuCgojIFJldHVybnMKClRoZSBJRCBvZiB0aGUgbmV3bHkgbWludGVkIHRva2VuLgoKIyBBdXRob3JpemF0aW9uCgpSZXF1aXJlcyBhdXRoZW50aWNhdGlvbiBmcm9tIGBtaW50ZXJgIGFuZCB2YWxpZGF0ZXMgbWludGluZyBhdXRob3JpdHkuCgojIFBhbmljcwoKUGFuaWNzIHdpdGggYFRva2VuRXJyb3I6Ok1pbnRBdXRob3JpdHlOb3RBbGxvd2VkYCBpZiB0aGUgbWludGVyIGxhY2tzIGF1dGhvcml0eS4KCiMgRXZlbnRzCgpFbWl0cyBib3RoIGEgc3RhbmRhcmQgYE1pbnRgIGV2ZW50ICh2aWEgT3BlblplcHBlbGluKSBhbmQgYSBjdXN0b20KYE1pbnRXaXRoTWludGVyYCBldmVudCB0aGF0IGluY2x1ZGVzIHRoZSBtaW50ZXIncyBhZGRyZXNzLgpSZXR1cm5zIHRvdGFsIG1pbnRlZCB2b3RpbmcgdW5pdHMgZm9yIG1hbmFnZXIgbGF1bmNoIHZhbGlkYXRpb24uAAAAAAx0b3RhbF9zdXBwbHkAAAAAAAAAAQAAAAs=", "AAAAAAAAAuVJbml0aWFsaXplcyB0aGUgdG9rZW4gY29udHJhY3Qgd2l0aCBtZXRhZGF0YSBhbmQgb3duZXJzaGlwLgoKIyBBcmd1bWVudHMKCiogYG93bmVyYCAtIFRoZSBhZGRyZXNzIHRoYXQgd2lsbCBvd24gYW5kIGNvbnRyb2wgdGhlIGNvbnRyYWN0CiogYHRyZWFzdXJ5YCAtIFRoZSBEQU8gdHJlYXN1cnk7IGBsYXVuY2hgIG11c3QgYmUgY2FsbGVkIHdpdGggZXhhY3RseSB0aGlzIGFkZHJlc3MKKiBgdXJpYCAtIFRoZSBiYXNlIFVSSSBmb3IgdG9rZW4gbWV0YWRhdGEgKHR5cGljYWxseSBhbiBJUEZTIG9yIEhUVFAgbGluaykKKiBgbmFtZWAgLSBUaGUgaHVtYW4tcmVhZGFibGUgbmFtZSBvZiB0aGUgdG9rZW4gY29sbGVjdGlvbgoqIGBzeW1ib2xgIC0gVGhlIHNob3J0IHN5bWJvbC90aWNrZXIgZm9yIHRoZSB0b2tlbgoqIGBtZXRhZGF0YWAgLSBUaGUgbWV0YWRhdGEgY29udHJhY3QgYWRkcmVzcyBmb3IgYXJ0d29yayBnZW5lcmF0aW9uCiogYG1hbmFnZXJgIC0gVGhlIE1hbmFnZXIgY29udHJhY3QgYWRkcmVzcyBmb3IgdXBncmFkZSB2YWxpZGF0aW9uCiogYGN1cnJlbnRfaGFzaGAgLSBUaGUgV0FTTSBoYXNoIG9mIHRoaXMgY29udHJhY3QgaW1wbGVtZW50YXRpb24KKiBgdmVyc2lvbmAgLSBUaGUgc2VtYW50aWMgdmVyc2lvbiBzdHJpbmcgKGUuZy4sICIwLjEuMCIpCgojIEV2ZW50cwoKRW1pdHMgYSBgVG9rZW5Jbml0aWFsaXplZGAgZXZlbnQgd2l0aCB0aGUgaW5pdGlhbGl6YXRpb24gcGFyYW1ldGVycy4AAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAkAAAAAAAAABW93bmVyAAAAAAAAEwAAAAAAAAAIdHJlYXN1cnkAAAATAAAAAAAAAAN1cmkAAAAAEAAAAAAAAAAEbmFtZQAAABAAAAAAAAAABnN5bWJvbAAAAAAAEAAAAAAAAAAIbWV0YWRhdGEAAAATAAAAAAAAAAdtYW5hZ2VyAAAAABMAAAAAAAAADGN1cnJlbnRfaGFzaAAAA+4AAAAgAAAAAAAAAAd2ZXJzaW9uAAAAABAAAAAA", "AAAAAAAAArVUcmFuc2ZlcnMgYSB0b2tlbiBvbiBiZWhhbGYgb2YgdGhlIG93bmVyIHVzaW5nIGEgcHJldmlvdXNseSBncmFudGVkIGFwcHJvdmFsLgoKU2ltaWxhciB0byBgdHJhbnNmZXIoKWAgYnV0IGFsbG93cyBhbiBhcHByb3ZlZCBzcGVuZGVyIHRvIHRyYW5zZmVyIHRoZSB0b2tlbi4KVGhlIHJlY2lwaWVudCBpcyBhdXRvbWF0aWNhbGx5IHNlbGYtZGVsZWdhdGVkIGFuZCB2b3RpbmcgcG93ZXIgaXMgdXBkYXRlZC4KCiMgQXJndW1lbnRzCgoqIGBzcGVuZGVyYCAtIFRoZSBhZGRyZXNzIHBlcmZvcm1pbmcgdGhlIHRyYW5zZmVyIChtdXN0IGJlIGFwcHJvdmVkIG9yIG9wZXJhdG9yKQoqIGBmcm9tYCAtIFRoZSBjdXJyZW50IG93bmVyIG9mIHRoZSB0b2tlbgoqIGB0b2AgLSBUaGUgYWRkcmVzcyByZWNlaXZpbmcgdGhlIHRva2VuCiogYHRva2VuX2lkYCAtIFRoZSBJRCBvZiB0aGUgdG9rZW4gdG8gdHJhbnNmZXIKCiMgQXV0aG9yaXphdGlvbgoKUmVxdWlyZXMgYXV0aGVudGljYXRpb24gZnJvbSBgc3BlbmRlcmAgYW5kIHZhbGlkYXRlcyBhcHByb3ZhbCBmb3IgYHRva2VuX2lkYC4KCiMgRXZlbnRzCgpFbWl0cyBhIHN0YW5kYXJkIGBUcmFuc2ZlcmAgZXZlbnQgKHZpYSBPcGVuWmVwcGVsaW4pIGFuZCB1cGRhdGVzIHZvdGluZwpwb3dlciBjaGVja3BvaW50cyBmb3IgYm90aCBzZW5kZXIgYW5kIHJlY2VpdmVyIGRlbGVnYXRlcy4AAAAAAAANdHJhbnNmZXJfZnJvbQAAAAAAAAQAAAAAAAAAB3NwZW5kZXIAAAAAEwAAAAAAAAAEZnJvbQAAABMAAAAAAAAAAnRvAAAAAAATAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAAA", "AAAAAAAAAPZDaGVja3MgaWYgYW4gYWRkcmVzcyBoYXMgbWludGluZyBhdXRob3JpdHkuCgojIEFyZ3VtZW50cwoKKiBgYXV0aG9yaXR5YCAtIFRoZSBhZGRyZXNzIHRvIGNoZWNrCgojIFJldHVybnMKCmB0cnVlYCBpZiB0aGUgYWRkcmVzcyBoYXMgbWludGluZyBhdXRob3JpdHksIGBmYWxzZWAgb3RoZXJ3aXNlLgpUaGUgb3duZXIgYWx3YXlzIGhhcyBpbXBsaWNpdCBtaW50aW5nIGF1dGhvcml0eSBldmVuIGlmIG5vdCBleHBsaWNpdGx5IHNldC4AAAAAAA5taW50X2F1dGhvcml0eQAAAAAAAQAAAAAAAAAJYXV0aG9yaXR5AAAAAAAAEwAAAAEAAAAB", "AAAAAAAAAKJSZXR1cm5zIHRoZSBudW1iZXIgb2YgY2hlY2twb2ludHMgZm9yIGFuIGFjY291bnQuCgojIEFyZ3VtZW50cwoKKiBgYWNjb3VudGAgLSBUaGUgYWRkcmVzcyB0byBxdWVyeQoKIyBSZXR1cm5zCgpUaGUgbnVtYmVyIG9mIGNoZWNrcG9pbnRzIHJlY29yZGVkIGZvciB0aGlzIGFjY291bnQAAAAAAA9udW1fY2hlY2twb2ludHMAAAAAAQAAAAAAAAAHYWNjb3VudAAAAAATAAAAAQAAAAQ=", "AAAAAAAAATBBY2NlcHRzIGEgcGVuZGluZyBvd25lcnNoaXAgdHJhbnNmZXIuCgojIEFyZ3VtZW50cwoKKiBgZWAgLSBBY2Nlc3MgdG8gdGhlIFNvcm9iYW4gZW52aXJvbm1lbnQuCgojIEVycm9ycwoKKiBbYGNyYXRlOjpyb2xlX3RyYW5zZmVyOjpSb2xlVHJhbnNmZXJFcnJvcjo6Tm9QZW5kaW5nVHJhbnNmZXJgXSAtIElmCnRoZXJlIGlzIG5vIHBlbmRpbmcgdHJhbnNmZXIgdG8gYWNjZXB0LgoKIyBFdmVudHMKCiogdG9waWNzIC0gYFsib3duZXJzaGlwX3RyYW5zZmVyX2NvbXBsZXRlZCJdYAoqIGRhdGEgLSBgW25ld19vd25lcjogQWRkcmVzc11gAAAAEGFjY2VwdF9vd25lcnNoaXAAAAAAAAAAAA==", "AAAAAAAAAPtSZXR1cm5zIHRoZSBjdXJyZW50IHRvdGFsIHN1cHBseSBvZiB2b3RpbmcgdW5pdHMuCgpUaGlzIHRyYWNrcyBhbGwgdm90aW5nIHVuaXRzIGluIGNpcmN1bGF0aW9uIChyZWdhcmRsZXNzIG9mIGRlbGVnYXRpb24Kc3RhdHVzKSwgbm90IGp1c3QgZGVsZWdhdGVkIHZvdGVzLgoKUmV0dXJucyBgMGAgaWYgbm8gdm90aW5nIHVuaXRzIGV4aXN0LgoKIyBBcmd1bWVudHMKCiogYGVgIC0gQWNjZXNzIHRvIHRoZSBTb3JvYmFuIGVudmlyb25tZW50LgAAAAAQZ2V0X3RvdGFsX3N1cHBseQAAAAAAAAABAAAACg==", "AAAAAAAAAYVSZW5vdW5jZXMgb3duZXJzaGlwIG9mIHRoZSBjb250cmFjdC4KClBlcm1hbmVudGx5IHJlbW92ZXMgdGhlIG93bmVyLCBkaXNhYmxpbmcgYWxsIGZ1bmN0aW9ucyBnYXRlZCBieQpgI1tvbmx5X293bmVyXWAuCgojIEFyZ3VtZW50cwoKKiBgZWAgLSBBY2Nlc3MgdG8gdGhlIFNvcm9iYW4gZW52aXJvbm1lbnQuCgojIEVycm9ycwoKKiBbYE93bmFibGVFcnJvcjo6VHJhbnNmZXJJblByb2dyZXNzYF0gLSBJZiB0aGVyZSBpcyBhIHBlbmRpbmcgb3duZXJzaGlwCnRyYW5zZmVyLgoqIFtgT3duYWJsZUVycm9yOjpPd25lck5vdFNldGBdIC0gSWYgdGhlIG93bmVyIGlzIG5vdCBzZXQuCgojIE5vdGVzCgoqIEF1dGhvcml6YXRpb24gZm9yIHRoZSBjdXJyZW50IG93bmVyIGlzIHJlcXVpcmVkLgAAAAAAABJyZW5vdW5jZV9vd25lcnNoaXAAAAAAAAAAAAAA", "AAAAAAAAAkBHcmFudHMgb3IgcmV2b2tlcyBtaW50aW5nIGF1dGhvcml0eSBmb3IgYW4gYWRkcmVzcy4KCk9ubHkgdGhlIGNvbnRyYWN0IG93bmVyIGNhbiBjYWxsIHRoaXMgZnVuY3Rpb24uIFRoaXMgYWxsb3dzIGRlbGVnYXRpbmcKbWludGluZyBjYXBhYmlsaXRpZXMgdG8gb3RoZXIgY29udHJhY3RzIChlLmcuLCBhbiBhdWN0aW9uIGNvbnRyYWN0KSB3aXRob3V0CnRyYW5zZmVycmluZyBvd25lcnNoaXAuCgojIEFyZ3VtZW50cwoKKiBgYXV0aG9yaXR5YCAtIFRoZSBhZGRyZXNzIHRvIGdyYW50IG9yIHJldm9rZSBtaW50aW5nIGF1dGhvcml0eQoqIGBlbmFibGVkYCAtIGB0cnVlYCB0byBncmFudCBhdXRob3JpdHksIGBmYWxzZWAgdG8gcmV2b2tlIGl0CgojIEF1dGhvcml6YXRpb24KClJlcXVpcmVzIG93bmVyIGF1dGhlbnRpY2F0aW9uIChlbmZvcmNlZCBieSBgI1tvbmx5X293bmVyXWAgbWFjcm8pIGFuZCBhCmxpdmUgdG9rZW4gKGBOb3RMaXZlYCBiZWZvcmUgbGF1bmNoKS4KCiMgRXZlbnRzCgpFbWl0cyBhIGBNaW50QXV0aG9yaXR5Q2hhbmdlZGAgZXZlbnQgd2l0aCBvbGQgYW5kIG5ldyBwZXJtaXNzaW9uIHN0YXRlcy4AAAASc2V0X21pbnRfYXV0aG9yaXR5AAAAAAACAAAAAAAAAAlhdXRob3JpdHkAAAAAAAATAAAAAAAAAAdlbmFibGVkAAAAAAEAAAAA", "AAAAAAAAA45Jbml0aWF0ZXMgYSAyLXN0ZXAgb3duZXJzaGlwIHRyYW5zZmVyIHRvIGEgbmV3IGFkZHJlc3MuCgpSZXF1aXJlcyBhdXRob3JpemF0aW9uIGZyb20gdGhlIGN1cnJlbnQgb3duZXIuIFRoZSBuZXcgb3duZXIgbXVzdCBsYXRlcgpjYWxsIGBhY2NlcHRfb3duZXJzaGlwKClgIHRvIGNvbXBsZXRlIHRoZSB0cmFuc2Zlci4KCiMgQXJndW1lbnRzCgoqIGBlYCAtIEFjY2VzcyB0byB0aGUgU29yb2JhbiBlbnZpcm9ubWVudC4KKiBgbmV3X293bmVyYCAtIFRoZSBwcm9wb3NlZCBuZXcgb3duZXIuCiogYGxpdmVfdW50aWxfbGVkZ2VyYCAtIExlZGdlciBudW1iZXIgdW50aWwgd2hpY2ggdGhlIG5ldyBvd25lciBjYW4KYWNjZXB0LiBBIHZhbHVlIG9mIGAwYCBjYW5jZWxzIGFueSBwZW5kaW5nIHRyYW5zZmVyLgoKIyBFcnJvcnMKCiogW2BPd25hYmxlRXJyb3I6Ok93bmVyTm90U2V0YF0gLSBJZiB0aGUgb3duZXIgaXMgbm90IHNldC4KKiBbYGNyYXRlOjpyb2xlX3RyYW5zZmVyOjpSb2xlVHJhbnNmZXJFcnJvcjo6Tm9QZW5kaW5nVHJhbnNmZXJgXSAtIElmCnRyeWluZyB0byBjYW5jZWwgYSB0cmFuc2ZlciB0aGF0IGRvZXNuJ3QgZXhpc3QuCiogW2BjcmF0ZTo6cm9sZV90cmFuc2Zlcjo6Um9sZVRyYW5zZmVyRXJyb3I6OkludmFsaWRMaXZlVW50aWxMZWRnZXJgXSAtCklmIHRoZSBzcGVjaWZpZWQgbGVkZ2VyIGlzIGluIHRoZSBwYXN0LgoqIFtgY3JhdGU6OnJvbGVfdHJhbnNmZXI6OlJvbGVUcmFuc2ZlckVycm9yOjpJbnZhbGlkUGVuZGluZ0FjY291bnRgXSAtCklmIHRoZSBzcGVjaWZpZWQgcGVuZGluZyBhY2NvdW50IGlzIG5vdCB0aGUgc2FtZSBhcyB0aGUgcHJvdmlkZWQgYG5ld2AKYWRkcmVzcy4KCiMgTm90ZXMKCiogQXV0aG9yaXphdGlvbiBmb3IgdGhlIGN1cnJlbnQgb3duZXIgaXMgcmVxdWlyZWQuAAAAAAASdHJhbnNmZXJfb3duZXJzaGlwAAAAAAACAAAAAAAAAAluZXdfb3duZXIAAAAAAAATAAAAAAAAABFsaXZlX3VudGlsX2xlZGdlcgAAAAAAAAQAAAAA", "AAAAAAAAAeVSZXR1cm5zIHRoZSB2b3RpbmcgcG93ZXIgKGRlbGVnYXRlZCB2b3Rlcykgb2YgYW4gYWNjb3VudCBhdCBhIHNwZWNpZmljCnBhc3QgbGVkZ2VyIHNlcXVlbmNlIG51bWJlci4KClJldHVybnMgYDBgIGlmIHRoZSBhY2NvdW50IGhhZCBubyBkZWxlZ2F0ZWQgdm90aW5nIHBvd2VyIGF0IHRoZSBnaXZlbgpsZWRnZXIgb3IgZG9lcyBub3QgZXhpc3QgaW4gdGhlIGNvbnRyYWN0LgoKIyBBcmd1bWVudHMKCiogYGVgIC0gQWNjZXNzIHRvIHRoZSBTb3JvYmFuIGVudmlyb25tZW50LgoqIGBhY2NvdW50YCAtIFRoZSBhZGRyZXNzIHRvIHF1ZXJ5IHZvdGluZyBwb3dlciBmb3IuCiogYGxlZGdlcmAgLSBUaGUgbGVkZ2VyIHNlcXVlbmNlIG51bWJlciB0byBxdWVyeSAobXVzdCBiZSBpbiB0aGUgcGFzdCkuCgojIEVycm9ycwoKKiBbYFZvdGVzRXJyb3I6OkZ1dHVyZUxvb2t1cGBdIC0gSWYgYGxlZGdlcmAgPj0gY3VycmVudCBsZWRnZXIgc2VxdWVuY2UKbnVtYmVyLgAAAAAAABdnZXRfdm90ZXNfYXRfY2hlY2twb2ludAAAAAACAAAAAAAAAAdhY2NvdW50AAAAABMAAAAAAAAABmxlZGdlcgAAAAAABAAAAAEAAAAK", "AAAAAAAAAdlSZXR1cm5zIHRoZSB0b3RhbCBzdXBwbHkgb2Ygdm90aW5nIHVuaXRzIGF0IGEgc3BlY2lmaWMgcGFzdCBsZWRnZXIKc2VxdWVuY2UgbnVtYmVyLgoKVGhpcyB0cmFja3MgYWxsIHZvdGluZyB1bml0cyBpbiBjaXJjdWxhdGlvbiAocmVnYXJkbGVzcyBvZiBkZWxlZ2F0aW9uCnN0YXR1cyksIG5vdCBqdXN0IGRlbGVnYXRlZCB2b3Rlcy4KClJldHVybnMgYDBgIGlmIHRoZXJlIHdlcmUgbm8gdm90aW5nIHVuaXRzIGF0IHRoZSBnaXZlbiBsZWRnZXIuCgojIEFyZ3VtZW50cwoKKiBgZWAgLSBBY2Nlc3MgdG8gdGhlIFNvcm9iYW4gZW52aXJvbm1lbnQuCiogYGxlZGdlcmAgLSBUaGUgbGVkZ2VyIHNlcXVlbmNlIG51bWJlciB0byBxdWVyeSAobXVzdCBiZSBpbiB0aGUgcGFzdCkuCgojIEVycm9ycwoKKiBbYFZvdGVzRXJyb3I6OkZ1dHVyZUxvb2t1cGBdIC0gSWYgYGxlZGdlcmAgPj0gY3VycmVudCBsZWRnZXIgc2VxdWVuY2UKbnVtYmVyLgAAAAAAAB5nZXRfdG90YWxfc3VwcGx5X2F0X2NoZWNrcG9pbnQAAAAAAAEAAAAAAAAABmxlZGdlcgAAAAAABAAAAAEAAAAK", "AAAABAAAAJFFcnJvcnMgc2hhcmVkIGJ5IGFsbCBtb2R1bGUgY29udHJhY3RzLiBDb2RlcyBsaXZlIGluIHRoZSA5MDAwIHJhbmdlIHNvCnRoZXkgbmV2ZXIgY29sbGlkZSB3aXRoIG1vZHVsZSAoMTF4eC0xM3h4LCAzLCAzMCkgb3IgbWFuYWdlciAoMTB4eCkgY29kZXMuAAAAAAAAAAAAAAtDb21tb25FcnJvcgAAAAALAAAANE9wZXJhdGlvbiByZXF1aXJlcyB0aGUgbW9kdWxlIHRvIGJlIGxpdmUgKGxhdW5jaGVkKS4AAAAHTm90TGl2ZQAAACMpAAAAQU9wZXJhdGlvbiBpcyBvbmx5IHZhbGlkIGR1cmluZyBzZXR1cDsgdGhlIG1vZHVsZSBpcyBhbHJlYWR5IGxpdmUuAAAAAAAAC0FscmVhZHlMaXZlAAAAIyoAAAAlTWFuYWdlciBhZGRyZXNzIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAAAAA1NYW5hZ2VyTm90U2V0AAAAAAAjKwAAACNgQ3VycmVudEhhc2hgIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAARQ3VycmVudEhhc2hOb3RTZXQAAAAAACMsAAAANGBmcm9tX2hhc2hgIGRvZXMgbm90IGVxdWFsIHRoZSBzdG9yZWQgYEN1cnJlbnRIYXNoYC4AAAAMSGFzaE1pc21hdGNoAAAjLQAAACpNYW5hZ2VyIGRpZCBub3QgYXBwcm92ZSB0aGlzIHVwZ3JhZGUgcGF0aC4AAAAAABJVcGdyYWRlTm90QXBwcm92ZWQAAAAAIy4AAAA1TWFuYWdlciBoYXMgbm8gcmVnaXN0cnkgZW50cnkgZm9yIHRoZSByZXF1ZXN0ZWQgaGFzaC4AAAAAAAAWSW1wbGVtZW50YXRpb25Ob3RGb3VuZAAAAAAjLwAAABtPd25lciBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAAC093bmVyTm90U2V0AAAAIzAAAAAmYEN1cnJlbnRWZXJzaW9uYCBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAAAA1WZXJzaW9uTm90U2V0AAAAAAAjMQAAACZUcmVhc3VyeSBhZGRyZXNzIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAAADlRyZWFzdXJ5Tm90U2V0AAAAACMyAAAAJkdvdmVybm9yIGFkZHJlc3MgbWlzc2luZyBmcm9tIHN0b3JhZ2UuAAAAAAAOR292ZXJub3JOb3RTZXQAAAAAIzM=", "AAAABAAAAAAAAAAAAAAAEVJvbGVUcmFuc2ZlckVycm9yAAAAAAAABAAAAAAAAAARTm9QZW5kaW5nVHJhbnNmZXIAAAAAAAiYAAAAAAAAABZJbnZhbGlkTGl2ZVVudGlsTGVkZ2VyAAAAAAiZAAAAAAAAABVJbnZhbGlkUGVuZGluZ0FjY291bnQAAAAAAAiaAAAAAAAAAA9UcmFuc2ZlckV4cGlyZWQAAAAImw==", "AAAABAAAAAAAAAAAAAAADE93bmFibGVFcnJvcgAAAAMAAAAAAAAAC093bmVyTm90U2V0AAAACDQAAAAAAAAAElRyYW5zZmVySW5Qcm9ncmVzcwAAAAAINQAAAAAAAAAPT3duZXJBbHJlYWR5U2V0AAAACDY=", "AAAABQAAADZFdmVudCBlbWl0dGVkIHdoZW4gYW4gb3duZXJzaGlwIHRyYW5zZmVyIGlzIGluaXRpYXRlZC4AAAAAAAAAAAART3duZXJzaGlwVHJhbnNmZXIAAAAAAAABAAAAEm93bmVyc2hpcF90cmFuc2ZlcgAAAAAAAwAAAAAAAAAJb2xkX293bmVyAAAAAAAAEwAAAAAAAAAAAAAACW5ld19vd25lcgAAAAAAABMAAAAAAAAAAAAAABFsaXZlX3VudGlsX2xlZGdlcgAAAAAAAAQAAAAAAAAAAg==", "AAAABQAAACpFdmVudCBlbWl0dGVkIHdoZW4gb3duZXJzaGlwIGlzIHJlbm91bmNlZC4AAAAAAAAAAAAST3duZXJzaGlwUmVub3VuY2VkAAAAAAABAAAAE293bmVyc2hpcF9yZW5vdW5jZWQAAAAAAQAAAAAAAAAJb2xkX293bmVyAAAAAAAAEwAAAAAAAAAC", "AAAABQAAADZFdmVudCBlbWl0dGVkIHdoZW4gYW4gb3duZXJzaGlwIHRyYW5zZmVyIGlzIGNvbXBsZXRlZC4AAAAAAAAAAAAaT3duZXJzaGlwVHJhbnNmZXJDb21wbGV0ZWQAAAAAAAEAAAAcb3duZXJzaGlwX3RyYW5zZmVyX2NvbXBsZXRlZAAAAAEAAAAAAAAACW5ld19vd25lcgAAAAAAABMAAAAAAAAAAg==", "AAAABAAAACpFcnJvcnMgdGhhdCBjYW4gb2NjdXIgaW4gdm90ZXMgb3BlcmF0aW9ucy4AAAAAAAAAAAAKVm90ZXNFcnJvcgAAAAAABQAAABtUaGUgbGVkZ2VyIGlzIGluIHRoZSBmdXR1cmUAAAAADEZ1dHVyZUxvb2t1cAAAEAQAAAAcQXJpdGhtZXRpYyBvdmVyZmxvdyBvY2N1cnJlZAAAAAxNYXRoT3ZlcmZsb3cAABAFAAAAN0F0dGVtcHRpbmcgdG8gdHJhbnNmZXIgbW9yZSB2b3RpbmcgdW5pdHMgdGhhbiBhdmFpbGFibGUAAAAAF0luc3VmZmljaWVudFZvdGluZ1VuaXRzAAAAEAYAAAA/QXR0ZW1wdGluZyB0byBkZWxlZ2F0ZSB0byB0aGUgc2FtZSBkZWxlZ2F0ZSB0aGF0IGlzIGFscmVhZHkgc2V0AAAAAAxTYW1lRGVsZWdhdGUAABAHAAAAQEEgY2hlY2twb2ludCB0aGF0IHdhcyBleHBlY3RlZCB0byBleGlzdCB3YXMgbm90IGZvdW5kIGluIHN0b3JhZ2UAAAASQ2hlY2twb2ludE5vdEZvdW5kAAAAABAI", "AAAABQAAADNFdmVudCBlbWl0dGVkIHdoZW4gYW4gYWNjb3VudCBjaGFuZ2VzIGl0cyBkZWxlZ2F0ZS4AAAAAAAAAAA9EZWxlZ2F0ZUNoYW5nZWQAAAAAAQAAABBkZWxlZ2F0ZV9jaGFuZ2VkAAAAAwAAACVUaGUgYWNjb3VudCB0aGF0IGNoYW5nZWQgaXRzIGRlbGVnYXRlAAAAAAAACWRlbGVnYXRvcgAAAAAAABMAAAABAAAAHlRoZSBwcmV2aW91cyBkZWxlZ2F0ZSAoaWYgYW55KQAAAAAADWZyb21fZGVsZWdhdGUAAAAAAAPoAAAAEwAAAAAAAAAQVGhlIG5ldyBkZWxlZ2F0ZQAAAAt0b19kZWxlZ2F0ZQAAAAATAAAAAAAAAAI=", "AAAABQAAADVFdmVudCBlbWl0dGVkIHdoZW4gYSBkZWxlZ2F0ZSdzIHZvdGluZyBwb3dlciBjaGFuZ2VzLgAAAAAAAAAAAAAURGVsZWdhdGVWb3Rlc0NoYW5nZWQAAAABAAAAFmRlbGVnYXRlX3ZvdGVzX2NoYW5nZWQAAAAAAAMAAAAnVGhlIGRlbGVnYXRlIHdob3NlIHZvdGluZyBwb3dlciBjaGFuZ2VkAAAAAAhkZWxlZ2F0ZQAAABMAAAABAAAAGVRoZSBwcmV2aW91cyB2b3RpbmcgcG93ZXIAAAAAAAAOcHJldmlvdXNfdm90ZXMAAAAAAAoAAAAAAAAAFFRoZSBuZXcgdm90aW5nIHBvd2VyAAAACW5ld192b3RlcwAAAAAAAAoAAAAAAAAAAg==", "AAAABQAAACVFdmVudCBlbWl0dGVkIHdoZW4gYSB0b2tlbiBpcyBtaW50ZWQuAAAAAAAAAAAAAARNaW50AAAAAQAAAARtaW50AAAAAgAAAAAAAAACdG8AAAAAABMAAAABAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAAAAAAAAg==", "AAAABQAAACpFdmVudCBlbWl0dGVkIHdoZW4gYW4gYXBwcm92YWwgaXMgZ3JhbnRlZC4AAAAAAAAAAAAHQXBwcm92ZQAAAAABAAAAB2FwcHJvdmUAAAAABAAAAAAAAAAIYXBwcm92ZXIAAAATAAAAAQAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAQAAAAAAAAAIYXBwcm92ZWQAAAATAAAAAAAAAAAAAAARbGl2ZV91bnRpbF9sZWRnZXIAAAAAAAAEAAAAAAAAAAI=", "AAAABQAAACpFdmVudCBlbWl0dGVkIHdoZW4gYSB0b2tlbiBpcyB0cmFuc2ZlcnJlZC4AAAAAAAAAAAAIVHJhbnNmZXIAAAABAAAACHRyYW5zZmVyAAAAAwAAAAAAAAAEZnJvbQAAABMAAAABAAAAAAAAAAJ0bwAAAAAAEwAAAAEAAAAAAAAACHRva2VuX2lkAAAABAAAAAAAAAAC", "AAAABAAAAAAAAAAAAAAAFU5vbkZ1bmdpYmxlVG9rZW5FcnJvcgAAAAAAAA8AAAAkSW5kaWNhdGVzIGEgbm9uLWV4aXN0ZW50IGB0b2tlbl9pZGAuAAAAEE5vbkV4aXN0ZW50VG9rZW4AAADIAAAAV0luZGljYXRlcyBhbiBlcnJvciByZWxhdGVkIHRvIHRoZSBvd25lcnNoaXAgb3ZlciBhIHBhcnRpY3VsYXIgdG9rZW4uClVzZWQgaW4gdHJhbnNmZXJzLgAAAAAOSW5jb3JyZWN0T3duZXIAAAAAAMkAAABFSW5kaWNhdGVzIGEgZmFpbHVyZSB3aXRoIHRoZSBgb3BlcmF0b3JgcyBhcHByb3ZhbC4gVXNlZCBpbiB0cmFuc2ZlcnMuAAAAAAAAFEluc3VmZmljaWVudEFwcHJvdmFsAAAAygAAAFVJbmRpY2F0ZXMgYSBmYWlsdXJlIHdpdGggdGhlIGBhcHByb3ZlcmAgb2YgYSB0b2tlbiB0byBiZSBhcHByb3ZlZC4gVXNlZAppbiBhcHByb3ZhbHMuAAAAAAAAD0ludmFsaWRBcHByb3ZlcgAAAADLAAAASkluZGljYXRlcyBhbiBpbnZhbGlkIHZhbHVlIGZvciBgbGl2ZV91bnRpbF9sZWRnZXJgIHdoZW4gc2V0dGluZwphcHByb3ZhbHMuAAAAAAAWSW52YWxpZExpdmVVbnRpbExlZGdlcgAAAAAAzAAAAClJbmRpY2F0ZXMgb3ZlcmZsb3cgd2hlbiBhZGRpbmcgdHdvIHZhbHVlcwAAAAAAAAxNYXRoT3ZlcmZsb3cAAADNAAAANkluZGljYXRlcyBhbGwgcG9zc2libGUgYHRva2VuX2lkYHMgYXJlIGFscmVhZHkgaW4gdXNlLgAAAAAAE1Rva2VuSURzQXJlRGVwbGV0ZWQAAAAAzgAAAEVJbmRpY2F0ZXMgYW4gaW52YWxpZCBhbW91bnQgdG8gYmF0Y2ggbWludCBpbiBgY29uc2VjdXRpdmVgIGV4dGVuc2lvbi4AAAAAAAANSW52YWxpZEFtb3VudAAAAAAAAM8AAAAzSW5kaWNhdGVzIHRoZSB0b2tlbiBkb2VzIG5vdCBleGlzdCBpbiBvd25lcidzIGxpc3QuAAAAABhUb2tlbk5vdEZvdW5kSW5Pd25lckxpc3QAAADQAAAAMkluZGljYXRlcyB0aGUgdG9rZW4gZG9lcyBub3QgZXhpc3QgaW4gZ2xvYmFsIGxpc3QuAAAAAAAZVG9rZW5Ob3RGb3VuZEluR2xvYmFsTGlzdAAAAAAAANEAAAAjSW5kaWNhdGVzIGFjY2VzcyB0byB1bnNldCBtZXRhZGF0YS4AAAAADVVuc2V0TWV0YWRhdGEAAAAAAADSAAAAQUluZGljYXRlcyB0aGUgbGVuZ3RoIG9mIHRoZSBiYXNlIFVSSSBleGNlZWRzIHRoZSBtYXhpbXVtIGFsbG93ZWQuAAAAAAAAFUJhc2VVcmlNYXhMZW5FeGNlZWRlZAAAAAAAANMAAABHSW5kaWNhdGVzIHRoZSByb3lhbHR5IGFtb3VudCBpcyBoaWdoZXIgdGhhbiAxMF8wMDAgKDEwMCUpIGJhc2lzIHBvaW50cy4AAAAAFEludmFsaWRSb3lhbHR5QW1vdW50AAAA1AAAAD1JbmRpY2F0ZXMgdGhlIGxlbmd0aCBvZiB0aGUgbmFtZSBleGNlZWRzIHRoZSBtYXhpbXVtIGFsbG93ZWQuAAAAAAAAEk5hbWVNYXhMZW5FeGNlZWRlZAAAAAAA1QAAAD9JbmRpY2F0ZXMgdGhlIGxlbmd0aCBvZiB0aGUgc3ltYm9sIGV4Y2VlZHMgdGhlIG1heGltdW0gYWxsb3dlZC4AAAAAFFN5bWJvbE1heExlbkV4Y2VlZGVkAAAA1g=="]),
      options
    );
  }

   static deploy<T = Client>({ owner, treasury, uri, name, symbol, metadata, manager, current_hash, version }: { owner: string | Address; treasury: string | Address; uri: string; name: string; symbol: string; metadata: string | Address; manager: string | Address; current_hash: Uint8Array; version: string }, options: MethodOptions & Omit<ContractClientOptions, 'contractId'> & { salt?: Uint8Array; address?: string; } & ({ wasmHash: Uint8Array | string; format?: "hex" | "base64"; externalRef?: never; } | { externalRef: ExternalExecutableRef; wasmHash?: never; format?: never; })): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({ owner, treasury, uri, name, symbol, metadata, manager, current_hash, version }, options);
  }
  public readonly fromJson = {
    mint : this.txFromJson<number>,  owner : this.txFromJson<string>,  launch : this.txFromJson<void>,  approve : this.txFromJson<void>,  balance : this.txFromJson<number>,  is_live : this.txFromJson<boolean>,  upgrade : this.txFromJson<void>,  version : this.txFromJson<string>,  delegate : this.txFromJson<void>,  metadata : this.txFromJson<string | null>,  owner_of : this.txFromJson<string>,  transfer : this.txFromJson<void>,  get_owner : this.txFromJson<string | null>,  get_votes : this.txFromJson<bigint>,  wasm_hash : this.txFromJson<Uint8Array>,  batch_mint : this.txFromJson<Array<number>>,  get_delegate : this.txFromJson<string | null>,  set_metadata : this.txFromJson<void>,  sync_version : this.txFromJson<void>,  total_supply : this.txFromJson<bigint>,  transfer_from : this.txFromJson<void>,  mint_authority : this.txFromJson<boolean>,  num_checkpoints : this.txFromJson<number>,  accept_ownership : this.txFromJson<void>,  get_total_supply : this.txFromJson<bigint>,  renounce_ownership : this.txFromJson<void>,  set_mint_authority : this.txFromJson<void>,  transfer_ownership : this.txFromJson<void>,  get_votes_at_checkpoint : this.txFromJson<bigint>,  get_total_supply_at_checkpoint : this.txFromJson<bigint>
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
   * Build a topics filter row for the "MintWithMinter" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  mintWithMinterEventFilter(topicValues?: { minter?: string | Address; to?: string | Address }): string[] {
    return this.spec.eventTopicFilter("MintWithMinter", topicValues);
  }
  /**
   * Build a topics filter row for the "TokenInitialized" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  tokenInitializedEventFilter(topicValues?: { owner?: string | Address }): string[] {
    return this.spec.eventTopicFilter("TokenInitialized", topicValues);
  }
  /**
   * Build a topics filter row for the "MintAuthorityChanged" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  mintAuthorityChangedEventFilter(topicValues?: { authority?: string | Address }): string[] {
    return this.spec.eventTopicFilter("MintAuthorityChanged", topicValues);
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
   * Build a topics filter row for the "DelegateChanged" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  delegateChangedEventFilter(topicValues?: { delegator?: string | Address }): string[] {
    return this.spec.eventTopicFilter("DelegateChanged", topicValues);
  }
  /**
   * Build a topics filter row for the "DelegateVotesChanged" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  delegateVotesChangedEventFilter(topicValues?: { delegate?: string | Address }): string[] {
    return this.spec.eventTopicFilter("DelegateVotesChanged", topicValues);
  }
  /**
   * Build a topics filter row for the "Mint" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  mintEventFilter(topicValues?: { to?: string | Address }): string[] {
    return this.spec.eventTopicFilter("Mint", topicValues);
  }
  /**
   * Build a topics filter row for the "Approve" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  approveEventFilter(topicValues?: { approver?: string | Address; token_id?: number }): string[] {
    return this.spec.eventTopicFilter("Approve", topicValues);
  }
  /**
   * Build a topics filter row for the "Transfer" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  transferEventFilter(topicValues?: { from?: string | Address; to?: string | Address }): string[] {
    return this.spec.eventTopicFilter("Transfer", topicValues);
  }
}