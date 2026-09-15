import {ContractEvent, CircuitType, ComplianceHook, Claim} from './types.js';
import {Spec, AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, ExternalExecutableRef} from '@stellar/stellar-sdk/contract';
import {Address, xdr} from '@stellar/stellar-sdk';

export interface Client {
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
   */
  mint({ minter, to }: { minter: string | Address; to: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<number>>;
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
   * Mints multiple NFTs to the same address in a single transaction.
   *
   * This is more efficient than calling `mint()` multiple times when distributing
   * many tokens to one address. All tokens are sequentially numbered and the
   * recipient is auto-delegated once (not per token).
   *
   * # Arguments
   *
   * * `minter` - The address performing the mint (must be owner or have mint authority)
   * * `to` - The address receiving all the newly minted tokens
   * * `amount` - Number of tokens to mint (must be between 1 and `MAX_BATCH_MINT`)
   *
   * # Returns
   *
   * The ID of the last minted token in the batch.
   *
   * # Authorization
   *
   * Requires authentication from `minter` and validates minting authority.
   *
   * # Panics
   *
   * Panics with `TokenError::InvalidBatchMintAmount` if `amount` is 0 or exceeds
   * `MAX_BATCH_MINT` (100).
   *
   * # Events
   *
   * Emits individual `Mint` events for each token (via OpenZeppelin) plus one
   * `BatchMint` summary event with the total amount and last token ID.
   */
  batch_mint({ minter, to, amount }: { minter: string | Address; to: string | Address; amount: number }, options?: MethodOptions): Promise<AssembledTransaction<number>>;
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
   * Requires owner authentication (enforced by `#[only_owner]` macro).
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
      new Spec(["AAAABAAAAAAAAAAAAAAAClRva2VuRXJyb3IAAAAAAAMAAAAsQmF0Y2ggbWludCBhbW91bnQgaXMgaW52YWxpZCAobXVzdCBiZSAxLTEwMCkAAAAWSW52YWxpZEJhdGNoTWludEFtb3VudAAAAAAETQAAACFPd25lciBub3Qgc2V0IGluIGNvbnRyYWN0IHN0b3JhZ2UAAAAAAAALT3duZXJOb3RTZXQAAAAETgAAACdNaW50ZXIgaXMgbm90IGF1dGhvcml6ZWQgdG8gbWludCB0b2tlbnMAAAAAF01pbnRBdXRob3JpdHlOb3RBbGxvd2VkAAAABE8=", "AAAABQAAAR1FbWl0dGVkIHdoZW4gbXVsdGlwbGUgdG9rZW5zIGFyZSBtaW50ZWQgaW4gYSBzaW5nbGUgYmF0Y2ggb3BlcmF0aW9uLgoKU3VwcGxlbWVudHMgdGhlIGluZGl2aWR1YWwgTWludCBldmVudHMgKGVtaXR0ZWQgcGVyIHRva2VuKSB3aXRoIGEgc3VtbWFyeQpvZiB0aGUgYmF0Y2ggb3BlcmF0aW9uLCBpbmNsdWRpbmcgdGhlIHRvdGFsIGFtb3VudCBhbmQgZmluYWwgdG9rZW4gSUQuClVzZWZ1bCBmb3IgdHJhY2tpbmcgYnVsayBtaW50aW5nIG9wZXJhdGlvbnMgbGlrZSBpbml0aWFsIGRpc3RyaWJ1dGlvbi4AAAAAAAAAAAAACUJhdGNoTWludAAAAAAAAAEAAAAKYmF0Y2hfbWludAAAAAAABAAAAAAAAAAGbWludGVyAAAAAAATAAAAAQAAAAAAAAACdG8AAAAAABMAAAABAAAAAAAAAAZhbW91bnQAAAAAAAQAAAAAAAAAAAAAAA1sYXN0X3Rva2VuX2lkAAAAAAAABAAAAAAAAAAC", "AAAABQAAAU9DdXN0b20gZXZlbnQgdG8gdHJhY2sgbWludGVyIGluZm9ybWF0aW9uIGR1cmluZyBzaW5nbGUgdG9rZW4gbWludHMuCgpPcGVuWmVwcGVsaW4ncyBzdGFuZGFyZCBNaW50IGV2ZW50IGRvZXNuJ3QgaW5jbHVkZSB0aGUgbWludGVyIGFkZHJlc3MsIG9ubHkKdGhlIHJlY2lwaWVudC4gVGhpcyBjdXN0b20gZXZlbnQgc3VwcGxlbWVudHMgaXQgYnkgdHJhY2tpbmcgd2hvIHBlcmZvcm1lZCB0aGUgbWludCwKd2hpY2ggaXMgdXNlZnVsIGZvciBhdWRpdGluZyBhbmQgYW5hbHl0aWNzIChlLmcuLCBkaXN0aW5ndWlzaGluZyBvd25lciBtaW50cwpmcm9tIGF1Y3Rpb24gY29udHJhY3QgbWludHMpLgAAAAAAAAAADk1pbnRXaXRoTWludGVyAAAAAAABAAAAEG1pbnRfd2l0aF9taW50ZXIAAAADAAAAAAAAAAZtaW50ZXIAAAAAABMAAAABAAAAAAAAAAJ0bwAAAAAAEwAAAAEAAAAAAAAACHRva2VuX2lkAAAABAAAAAAAAAAC", "AAAABQAAALdFbWl0dGVkIHdoZW4gdGhlIHRva2VuIGNvbnRyYWN0IGlzIGluaXRpYWxpemVkLgoKQ29udGFpbnMgdGhlIGluaXRpYWwgb3duZXIgYW5kIHRva2VuIG1ldGFkYXRhLiBUaGlzIGV2ZW50IGlzIGVtaXR0ZWQgb25jZQpkdXJpbmcgY29udHJhY3QgZGVwbG95bWVudCB2aWEgdGhlIGBfX2NvbnN0cnVjdG9yYCBmdW5jdGlvbi4AAAAAAAAAABBUb2tlbkluaXRpYWxpemVkAAAAAQAAABF0b2tlbl9pbml0aWFsaXplZAAAAAAAAAQAAAAAAAAABW93bmVyAAAAAAAAEwAAAAEAAAAAAAAAA3VyaQAAAAAQAAAAAAAAAAAAAAAEbmFtZQAAABAAAAAAAAAAAAAAAAZzeW1ib2wAAAAAABAAAAAAAAAAAg==", "AAAABQAAAORFbWl0dGVkIHdoZW4gbWludGluZyBhdXRob3JpdHkgaXMgZ3JhbnRlZCBvciByZXZva2VkIGZvciBhbiBhZGRyZXNzLgoKVHJhY2tzIGNoYW5nZXMgdG8gbWludCBwZXJtaXNzaW9ucywgaW5jbHVkaW5nIHdobyBtYWRlIHRoZSBjaGFuZ2UgKGFsd2F5cyB0aGUgb3duZXIpLgpUaGUgb3duZXIgYWx3YXlzIGhhcyBpbXBsaWNpdCBtaW50aW5nIGF1dGhvcml0eSByZWdhcmRsZXNzIG9mIHRoaXMgZmxhZy4AAAAAAAAAFE1pbnRBdXRob3JpdHlDaGFuZ2VkAAAAAQAAABZtaW50X2F1dGhvcml0eV9jaGFuZ2VkAAAAAAAEAAAAAAAAAAlhdXRob3JpdHkAAAAAAAATAAAAAQAAAAAAAAALb2xkX2VuYWJsZWQAAAAAAQAAAAAAAAAAAAAAB2VuYWJsZWQAAAAAAQAAAAAAAAAAAAAACmNoYW5nZWRfYnkAAAAAABMAAAAAAAAAAg==", "AAAAAgAAANBTdG9yYWdlIGtleXMgZm9yIHRva2VuLXNwZWNpZmljIGluc3RhbmNlIGRhdGEuCgpUb2tlbiBtZXRhZGF0YSAobmFtZSwgc3ltYm9sLCBVUkkpIGFuZCBvd25lcnNoaXAgYXJlIHN0b3JlZCB2aWEgT3BlblplcHBlbGluJ3MKQmFzZSBhbmQgT3duYWJsZSB0cmFpdHMuIFRoaXMgZW51bSBvbmx5IGNvbnRhaW5zIGtleXMgZm9yIGNvbnRyYWN0LXNwZWNpZmljIGRhdGEuAAAAAAAAAAhUb2tlbktleQAAAAEAAAABAAAAwFRyYWNrcyB3aGV0aGVyIGFuIGFkZHJlc3MgaGFzIG1pbnRpbmcgYXV0aG9yaXR5LgoKTWFwcyBgQWRkcmVzcyAtPiBib29sYCB3aGVyZSBgdHJ1ZWAgbWVhbnMgdGhlIGFkZHJlc3MgY2FuIG1pbnQgdG9rZW5zLgpUaGUgb3duZXIgaGFzIGltcGxpY2l0IG1pbnRpbmcgYXV0aG9yaXR5IHdpdGhvdXQgbmVlZGluZyBhbiBlbnRyeSBoZXJlLgAAAA1NaW50QXV0aG9yaXR5AAAAAAAAAQAAABM=", "AAAAAAAAAvZNaW50cyBhIHNpbmdsZSBORlQgdG8gdGhlIHNwZWNpZmllZCBhZGRyZXNzLgoKVGhlIHRva2VuIGlzIGFzc2lnbmVkIGEgc2VxdWVudGlhbCBJRCAoc3RhcnRpbmcgZnJvbSAwKSBhbmQgdGhlIHJlY2lwaWVudAppcyBhdXRvbWF0aWNhbGx5IHNlbGYtZGVsZWdhdGVkIGlmIHRoZXkgZG9uJ3QgaGF2ZSBhbiBleGlzdGluZyBkZWxlZ2F0aW9uLAplbnN1cmluZyB0aGV5IGltbWVkaWF0ZWx5IHJlY2VpdmUgdm90aW5nIHBvd2VyLgoKIyBBcmd1bWVudHMKCiogYG1pbnRlcmAgLSBUaGUgYWRkcmVzcyBwZXJmb3JtaW5nIHRoZSBtaW50IChtdXN0IGJlIG93bmVyIG9yIGhhdmUgbWludCBhdXRob3JpdHkpCiogYHRvYCAtIFRoZSBhZGRyZXNzIHJlY2VpdmluZyB0aGUgbmV3bHkgbWludGVkIHRva2VuCgojIFJldHVybnMKClRoZSBJRCBvZiB0aGUgbmV3bHkgbWludGVkIHRva2VuLgoKIyBBdXRob3JpemF0aW9uCgpSZXF1aXJlcyBhdXRoZW50aWNhdGlvbiBmcm9tIGBtaW50ZXJgIGFuZCB2YWxpZGF0ZXMgbWludGluZyBhdXRob3JpdHkuCgojIFBhbmljcwoKUGFuaWNzIHdpdGggYFRva2VuRXJyb3I6Ok1pbnRBdXRob3JpdHlOb3RBbGxvd2VkYCBpZiB0aGUgbWludGVyIGxhY2tzIGF1dGhvcml0eS4KCiMgRXZlbnRzCgpFbWl0cyBib3RoIGEgc3RhbmRhcmQgYE1pbnRgIGV2ZW50ICh2aWEgT3BlblplcHBlbGluKSBhbmQgYSBjdXN0b20KYE1pbnRXaXRoTWludGVyYCBldmVudCB0aGF0IGluY2x1ZGVzIHRoZSBtaW50ZXIncyBhZGRyZXNzLgAAAAAABG1pbnQAAAACAAAAAAAAAAZtaW50ZXIAAAAAABMAAAAAAAAAAnRvAAAAAAATAAAAAQAAAAQ=", "AAAAAAAAAYtBcHByb3ZlcyBhbiBhZGRyZXNzIHRvIHRyYW5zZmVyIGEgc3BlY2lmaWMgdG9rZW4uCgojIEFyZ3VtZW50cwoKKiBgb3duZXJgIC0gVGhlIG93bmVyIG9mIHRoZSB0b2tlbiAobXVzdCBhdXRoZW50aWNhdGUpCiogYHNwZW5kZXJgIC0gVGhlIGFkZHJlc3MgYmVpbmcgYXBwcm92ZWQKKiBgdG9rZW5faWRgIC0gVGhlIElEIG9mIHRoZSB0b2tlbiB0byBhcHByb3ZlCiogYGV4cGlyYXRpb25fbGVkZ2VyYCAtIFRoZSBsZWRnZXIgc2VxdWVuY2Ugd2hlbiB0aGUgYXBwcm92YWwgZXhwaXJlcwoKIyBBdXRob3JpemF0aW9uCgpSZXF1aXJlcyBhdXRoZW50aWNhdGlvbiBmcm9tIGBvd25lcmAuCgojIEV2ZW50cwoKRW1pdHMgYSBzdGFuZGFyZCBgQXBwcm92ZWAgZXZlbnQgKHZpYSBPcGVuWmVwcGVsaW4pLgAAAAAHYXBwcm92ZQAAAAAEAAAAAAAAAAVvd25lcgAAAAAAABMAAAAAAAAAB3NwZW5kZXIAAAAAEwAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAAAAABFleHBpcmF0aW9uX2xlZGdlcgAAAAAAAAQAAAAA", "AAAAAAAAAJ1SZXR1cm5zIHRoZSBudW1iZXIgb2YgdG9rZW5zIG93bmVkIGJ5IGFuIGFjY291bnQuCgojIEFyZ3VtZW50cwoKKiBgYWNjb3VudGAgLSBUaGUgYWRkcmVzcyB0byBxdWVyeQoKIyBSZXR1cm5zCgpUaGUgdG90YWwgbnVtYmVyIG9mIE5GVHMgb3duZWQgYnkgdGhlIGFjY291bnQuAAAAAAAAB2JhbGFuY2UAAAAAAQAAAAAAAAAHYWNjb3VudAAAAAATAAAAAQAAAAQ=", "AAAAAAAAAqREZWxlZ2F0ZXMgdm90aW5nIHBvd2VyIGZyb20gYGFjY291bnRgIHRvIGBkZWxlZ2F0ZWVgLgoKVG8gcmVjbGFpbSB2b3RpbmcgcG93ZXIgKGkuZS4gInVuZGVsZWdhdGUiKSwgY2FsbCB0aGlzIHdpdGgKYGRlbGVnYXRlZWAgc2V0IHRvIGBhY2NvdW50YCAoc2VsZi1kZWxlZ2F0aW9uKS4gVGhlcmUgaXMgbm8Kc2VwYXJhdGUgdW5kZWxlZ2F0ZSBvcGVyYXRpb24uCgojIEFyZ3VtZW50cwoKKiBgZWAgLSBBY2Nlc3MgdG8gdGhlIFNvcm9iYW4gZW52aXJvbm1lbnQuCiogYGFjY291bnRgIC0gVGhlIGFjY291bnQgZGVsZWdhdGluZyBpdHMgdm90aW5nIHBvd2VyLgoqIGBkZWxlZ2F0ZWVgIC0gVGhlIGFjY291bnQgcmVjZWl2aW5nIHRoZSBkZWxlZ2F0ZWQgdm90aW5nIHBvd2VyLgoKIyBFdmVudHMKCiogdG9waWNzIC0gYFsiZGVsZWdhdGVfY2hhbmdlZCIsIGRlbGVnYXRvcjogQWRkcmVzc11gCiogZGF0YSAtIGBbZnJvbV9kZWxlZ2F0ZTogT3B0aW9uPEFkZHJlc3M+LCB0b19kZWxlZ2F0ZTogQWRkcmVzc11gCgoqIHRvcGljcyAtIGBbImRlbGVnYXRlX3ZvdGVzX2NoYW5nZWQiLCBkZWxlZ2F0ZTogQWRkcmVzc11gCiogZGF0YSAtIGBbcHJldmlvdXNfdm90ZXM6IHUxMjgsIG5ld192b3RlczogdTEyOF1gCgojIE5vdGVzCgpBdXRob3JpemF0aW9uIGZvciBgYWNjb3VudGAgaXMgcmVxdWlyZWQuAAAACGRlbGVnYXRlAAAAAgAAAAAAAAAHYWNjb3VudAAAAAATAAAAAAAAAAlkZWxlZ2F0ZWUAAAAAAAATAAAAAA==", "AAAAAAAAAMlSZXR1cm5zIHRoZSBvd25lciBvZiBhIHNwZWNpZmljIHRva2VuLgoKIyBBcmd1bWVudHMKCiogYHRva2VuX2lkYCAtIFRoZSBJRCBvZiB0aGUgdG9rZW4gdG8gcXVlcnkKCiMgUmV0dXJucwoKVGhlIGFkZHJlc3MgdGhhdCBvd25zIHRoZSBzcGVjaWZpZWQgdG9rZW4uCgojIFBhbmljcwoKUGFuaWNzIGlmIHRoZSB0b2tlbiBJRCBkb2VzIG5vdCBleGlzdC4AAAAAAAAIb3duZXJfb2YAAAABAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAABAAAAEw==", "AAAAAAAAAnVUcmFuc2ZlcnMgYSB0b2tlbiBmcm9tIG9uZSBhZGRyZXNzIHRvIGFub3RoZXIuCgpUaGUgcmVjaXBpZW50IGlzIGF1dG9tYXRpY2FsbHkgc2VsZi1kZWxlZ2F0ZWQgaWYgdGhleSBkb24ndCBoYXZlIGFuIGV4aXN0aW5nCmRlbGVnYXRpb24sIGFuZCB2b3RpbmcgcG93ZXIgaXMgYXV0b21hdGljYWxseSBtb3ZlZCBmcm9tIHRoZSBvbGQgb3duZXIncwpkZWxlZ2F0ZSB0byB0aGUgbmV3IG93bmVyJ3MgZGVsZWdhdGUgdmlhIHRoZSBjaGVja3BvaW50IHN5c3RlbS4KCiMgQXJndW1lbnRzCgoqIGBmcm9tYCAtIFRoZSBjdXJyZW50IG93bmVyIG9mIHRoZSB0b2tlbiAobXVzdCBhdXRoZW50aWNhdGUpCiogYHRvYCAtIFRoZSBhZGRyZXNzIHJlY2VpdmluZyB0aGUgdG9rZW4KKiBgdG9rZW5faWRgIC0gVGhlIElEIG9mIHRoZSB0b2tlbiB0byB0cmFuc2ZlcgoKIyBBdXRob3JpemF0aW9uCgpSZXF1aXJlcyBhdXRoZW50aWNhdGlvbiBmcm9tIGBmcm9tYCBhZGRyZXNzLgoKIyBFdmVudHMKCkVtaXRzIGEgc3RhbmRhcmQgYFRyYW5zZmVyYCBldmVudCAodmlhIE9wZW5aZXBwZWxpbikgYW5kIHVwZGF0ZXMgdm90aW5nCnBvd2VyIGNoZWNrcG9pbnRzIGZvciBib3RoIHNlbmRlciBhbmQgcmVjZWl2ZXIgZGVsZWdhdGVzLgAAAAAAAAh0cmFuc2ZlcgAAAAMAAAAAAAAABGZyb20AAAATAAAAAAAAAAJ0bwAAAAAAEwAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAA==", "AAAAAAAAAJBSZXR1cm5zIGBTb21lKEFkZHJlc3MpYCBpZiBvd25lcnNoaXAgaXMgc2V0LCBvciBgTm9uZWAgaWYgb3duZXJzaGlwIGhhcwpiZWVuIHJlbm91bmNlZC4KCiMgQXJndW1lbnRzCgoqIGBlYCAtIEFjY2VzcyB0byB0aGUgU29yb2JhbiBlbnZpcm9ubWVudC4AAAAJZ2V0X293bmVyAAAAAAAAAAAAAAEAAAPoAAAAEw==", "AAAAAAAAAQxSZXR1cm5zIHRoZSBjdXJyZW50IHZvdGluZyBwb3dlciAoZGVsZWdhdGVkIHZvdGVzKSBvZiBhbiBhY2NvdW50LgoKUmV0dXJucyBgMGAgaWYgdGhlIGFjY291bnQgaGFzIG5vIGRlbGVnYXRlZCB2b3RpbmcgcG93ZXIgb3IgZG9lcyBub3QKZXhpc3QgaW4gdGhlIGNvbnRyYWN0LgoKIyBBcmd1bWVudHMKCiogYGVgIC0gQWNjZXNzIHRvIHRoZSBTb3JvYmFuIGVudmlyb25tZW50LgoqIGBhY2NvdW50YCAtIFRoZSBhZGRyZXNzIHRvIHF1ZXJ5IHZvdGluZyBwb3dlciBmb3IuAAAACWdldF92b3RlcwAAAAAAAAEAAAAAAAAAB2FjY291bnQAAAAAEwAAAAEAAAAK", "AAAAAAAAA5FNaW50cyBtdWx0aXBsZSBORlRzIHRvIHRoZSBzYW1lIGFkZHJlc3MgaW4gYSBzaW5nbGUgdHJhbnNhY3Rpb24uCgpUaGlzIGlzIG1vcmUgZWZmaWNpZW50IHRoYW4gY2FsbGluZyBgbWludCgpYCBtdWx0aXBsZSB0aW1lcyB3aGVuIGRpc3RyaWJ1dGluZwptYW55IHRva2VucyB0byBvbmUgYWRkcmVzcy4gQWxsIHRva2VucyBhcmUgc2VxdWVudGlhbGx5IG51bWJlcmVkIGFuZCB0aGUKcmVjaXBpZW50IGlzIGF1dG8tZGVsZWdhdGVkIG9uY2UgKG5vdCBwZXIgdG9rZW4pLgoKIyBBcmd1bWVudHMKCiogYG1pbnRlcmAgLSBUaGUgYWRkcmVzcyBwZXJmb3JtaW5nIHRoZSBtaW50IChtdXN0IGJlIG93bmVyIG9yIGhhdmUgbWludCBhdXRob3JpdHkpCiogYHRvYCAtIFRoZSBhZGRyZXNzIHJlY2VpdmluZyBhbGwgdGhlIG5ld2x5IG1pbnRlZCB0b2tlbnMKKiBgYW1vdW50YCAtIE51bWJlciBvZiB0b2tlbnMgdG8gbWludCAobXVzdCBiZSBiZXR3ZWVuIDEgYW5kIGBNQVhfQkFUQ0hfTUlOVGApCgojIFJldHVybnMKClRoZSBJRCBvZiB0aGUgbGFzdCBtaW50ZWQgdG9rZW4gaW4gdGhlIGJhdGNoLgoKIyBBdXRob3JpemF0aW9uCgpSZXF1aXJlcyBhdXRoZW50aWNhdGlvbiBmcm9tIGBtaW50ZXJgIGFuZCB2YWxpZGF0ZXMgbWludGluZyBhdXRob3JpdHkuCgojIFBhbmljcwoKUGFuaWNzIHdpdGggYFRva2VuRXJyb3I6OkludmFsaWRCYXRjaE1pbnRBbW91bnRgIGlmIGBhbW91bnRgIGlzIDAgb3IgZXhjZWVkcwpgTUFYX0JBVENIX01JTlRgICgxMDApLgoKIyBFdmVudHMKCkVtaXRzIGluZGl2aWR1YWwgYE1pbnRgIGV2ZW50cyBmb3IgZWFjaCB0b2tlbiAodmlhIE9wZW5aZXBwZWxpbikgcGx1cyBvbmUKYEJhdGNoTWludGAgc3VtbWFyeSBldmVudCB3aXRoIHRoZSB0b3RhbCBhbW91bnQgYW5kIGxhc3QgdG9rZW4gSUQuAAAAAAAACmJhdGNoX21pbnQAAAAAAAMAAAAAAAAABm1pbnRlcgAAAAAAEwAAAAAAAAACdG8AAAAAABMAAAAAAAAABmFtb3VudAAAAAAABAAAAAEAAAAE", "AAAAAAAAAcFSZXR1cm5zIHRoZSBjdXJyZW50IGRlbGVnYXRlIGZvciBhbiBhY2NvdW50LgoKIyBBcmd1bWVudHMKCiogYGVgIC0gQWNjZXNzIHRvIHRoZSBTb3JvYmFuIGVudmlyb25tZW50LgoqIGBhY2NvdW50YCAtIFRoZSBhZGRyZXNzIHRvIHF1ZXJ5IHRoZSBkZWxlZ2F0ZSBmb3IuCgojIFJldHVybnMKCiogYFNvbWUoQWRkcmVzcylgIC0gVGhlIGRlbGVnYXRlIGFkZHJlc3MgKG1heSBiZSB0aGUgYWNjb3VudCBpdHNlbGYgaWYKc2VsZi1kZWxlZ2F0ZWQpLgoqIGBOb25lYCAtIElmIHRoZSBhY2NvdW50IGhhcyBuZXZlciBkZWxlZ2F0ZWQuIEFuIGFjY291bnQgd2hvc2UgZGVsZWdhdGUKaXMgYE5vbmVgIGhhcyAqKm5vIGFjdGl2ZSB2b3RpbmcgcG93ZXIqKjsgaXQgbXVzdCBjYWxsCltgVm90ZXM6OmRlbGVnYXRlYF0gKGV2ZW4gdG8gaXRzZWxmKSBiZWZvcmUgaXRzIHZvdGVzIGFyZSBjb3VudGVkLgAAAAAAAAxnZXRfZGVsZWdhdGUAAAABAAAAAAAAAAdhY2NvdW50AAAAABMAAAABAAAD6AAAABM=", "AAAAAAAAAZFJbml0aWFsaXplcyB0aGUgdG9rZW4gY29udHJhY3Qgd2l0aCBtZXRhZGF0YSBhbmQgb3duZXJzaGlwLgoKIyBBcmd1bWVudHMKCiogYG93bmVyYCAtIFRoZSBhZGRyZXNzIHRoYXQgd2lsbCBvd24gYW5kIGNvbnRyb2wgdGhlIGNvbnRyYWN0CiogYHVyaWAgLSBUaGUgYmFzZSBVUkkgZm9yIHRva2VuIG1ldGFkYXRhICh0eXBpY2FsbHkgYW4gSVBGUyBvciBIVFRQIGxpbmspCiogYG5hbWVgIC0gVGhlIGh1bWFuLXJlYWRhYmxlIG5hbWUgb2YgdGhlIHRva2VuIGNvbGxlY3Rpb24KKiBgc3ltYm9sYCAtIFRoZSBzaG9ydCBzeW1ib2wvdGlja2VyIGZvciB0aGUgdG9rZW4KCiMgRXZlbnRzCgpFbWl0cyBhIGBUb2tlbkluaXRpYWxpemVkYCBldmVudCB3aXRoIHRoZSBpbml0aWFsaXphdGlvbiBwYXJhbWV0ZXJzLgAAAAAAAA1fX2NvbnN0cnVjdG9yAAAAAAAABAAAAAAAAAAFb3duZXIAAAAAAAATAAAAAAAAAAN1cmkAAAAAEAAAAAAAAAAEbmFtZQAAABAAAAAAAAAABnN5bWJvbAAAAAAAEAAAAAA=", "AAAAAAAAArVUcmFuc2ZlcnMgYSB0b2tlbiBvbiBiZWhhbGYgb2YgdGhlIG93bmVyIHVzaW5nIGEgcHJldmlvdXNseSBncmFudGVkIGFwcHJvdmFsLgoKU2ltaWxhciB0byBgdHJhbnNmZXIoKWAgYnV0IGFsbG93cyBhbiBhcHByb3ZlZCBzcGVuZGVyIHRvIHRyYW5zZmVyIHRoZSB0b2tlbi4KVGhlIHJlY2lwaWVudCBpcyBhdXRvbWF0aWNhbGx5IHNlbGYtZGVsZWdhdGVkIGFuZCB2b3RpbmcgcG93ZXIgaXMgdXBkYXRlZC4KCiMgQXJndW1lbnRzCgoqIGBzcGVuZGVyYCAtIFRoZSBhZGRyZXNzIHBlcmZvcm1pbmcgdGhlIHRyYW5zZmVyIChtdXN0IGJlIGFwcHJvdmVkIG9yIG9wZXJhdG9yKQoqIGBmcm9tYCAtIFRoZSBjdXJyZW50IG93bmVyIG9mIHRoZSB0b2tlbgoqIGB0b2AgLSBUaGUgYWRkcmVzcyByZWNlaXZpbmcgdGhlIHRva2VuCiogYHRva2VuX2lkYCAtIFRoZSBJRCBvZiB0aGUgdG9rZW4gdG8gdHJhbnNmZXIKCiMgQXV0aG9yaXphdGlvbgoKUmVxdWlyZXMgYXV0aGVudGljYXRpb24gZnJvbSBgc3BlbmRlcmAgYW5kIHZhbGlkYXRlcyBhcHByb3ZhbCBmb3IgYHRva2VuX2lkYC4KCiMgRXZlbnRzCgpFbWl0cyBhIHN0YW5kYXJkIGBUcmFuc2ZlcmAgZXZlbnQgKHZpYSBPcGVuWmVwcGVsaW4pIGFuZCB1cGRhdGVzIHZvdGluZwpwb3dlciBjaGVja3BvaW50cyBmb3IgYm90aCBzZW5kZXIgYW5kIHJlY2VpdmVyIGRlbGVnYXRlcy4AAAAAAAANdHJhbnNmZXJfZnJvbQAAAAAAAAQAAAAAAAAAB3NwZW5kZXIAAAAAEwAAAAAAAAAEZnJvbQAAABMAAAAAAAAAAnRvAAAAAAATAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAAA", "AAAAAAAAAPZDaGVja3MgaWYgYW4gYWRkcmVzcyBoYXMgbWludGluZyBhdXRob3JpdHkuCgojIEFyZ3VtZW50cwoKKiBgYXV0aG9yaXR5YCAtIFRoZSBhZGRyZXNzIHRvIGNoZWNrCgojIFJldHVybnMKCmB0cnVlYCBpZiB0aGUgYWRkcmVzcyBoYXMgbWludGluZyBhdXRob3JpdHksIGBmYWxzZWAgb3RoZXJ3aXNlLgpUaGUgb3duZXIgYWx3YXlzIGhhcyBpbXBsaWNpdCBtaW50aW5nIGF1dGhvcml0eSBldmVuIGlmIG5vdCBleHBsaWNpdGx5IHNldC4AAAAAAA5taW50X2F1dGhvcml0eQAAAAAAAQAAAAAAAAAJYXV0aG9yaXR5AAAAAAAAEwAAAAEAAAAB", "AAAAAAAAATBBY2NlcHRzIGEgcGVuZGluZyBvd25lcnNoaXAgdHJhbnNmZXIuCgojIEFyZ3VtZW50cwoKKiBgZWAgLSBBY2Nlc3MgdG8gdGhlIFNvcm9iYW4gZW52aXJvbm1lbnQuCgojIEVycm9ycwoKKiBbYGNyYXRlOjpyb2xlX3RyYW5zZmVyOjpSb2xlVHJhbnNmZXJFcnJvcjo6Tm9QZW5kaW5nVHJhbnNmZXJgXSAtIElmCnRoZXJlIGlzIG5vIHBlbmRpbmcgdHJhbnNmZXIgdG8gYWNjZXB0LgoKIyBFdmVudHMKCiogdG9waWNzIC0gYFsib3duZXJzaGlwX3RyYW5zZmVyX2NvbXBsZXRlZCJdYAoqIGRhdGEgLSBgW25ld19vd25lcjogQWRkcmVzc11gAAAAEGFjY2VwdF9vd25lcnNoaXAAAAAAAAAAAA==", "AAAAAAAAAPtSZXR1cm5zIHRoZSBjdXJyZW50IHRvdGFsIHN1cHBseSBvZiB2b3RpbmcgdW5pdHMuCgpUaGlzIHRyYWNrcyBhbGwgdm90aW5nIHVuaXRzIGluIGNpcmN1bGF0aW9uIChyZWdhcmRsZXNzIG9mIGRlbGVnYXRpb24Kc3RhdHVzKSwgbm90IGp1c3QgZGVsZWdhdGVkIHZvdGVzLgoKUmV0dXJucyBgMGAgaWYgbm8gdm90aW5nIHVuaXRzIGV4aXN0LgoKIyBBcmd1bWVudHMKCiogYGVgIC0gQWNjZXNzIHRvIHRoZSBTb3JvYmFuIGVudmlyb25tZW50LgAAAAAQZ2V0X3RvdGFsX3N1cHBseQAAAAAAAAABAAAACg==", "AAAAAAAAAYVSZW5vdW5jZXMgb3duZXJzaGlwIG9mIHRoZSBjb250cmFjdC4KClBlcm1hbmVudGx5IHJlbW92ZXMgdGhlIG93bmVyLCBkaXNhYmxpbmcgYWxsIGZ1bmN0aW9ucyBnYXRlZCBieQpgI1tvbmx5X293bmVyXWAuCgojIEFyZ3VtZW50cwoKKiBgZWAgLSBBY2Nlc3MgdG8gdGhlIFNvcm9iYW4gZW52aXJvbm1lbnQuCgojIEVycm9ycwoKKiBbYE93bmFibGVFcnJvcjo6VHJhbnNmZXJJblByb2dyZXNzYF0gLSBJZiB0aGVyZSBpcyBhIHBlbmRpbmcgb3duZXJzaGlwCnRyYW5zZmVyLgoqIFtgT3duYWJsZUVycm9yOjpPd25lck5vdFNldGBdIC0gSWYgdGhlIG93bmVyIGlzIG5vdCBzZXQuCgojIE5vdGVzCgoqIEF1dGhvcml6YXRpb24gZm9yIHRoZSBjdXJyZW50IG93bmVyIGlzIHJlcXVpcmVkLgAAAAAAABJyZW5vdW5jZV9vd25lcnNoaXAAAAAAAAAAAAAA", "AAAAAAAAAhVHcmFudHMgb3IgcmV2b2tlcyBtaW50aW5nIGF1dGhvcml0eSBmb3IgYW4gYWRkcmVzcy4KCk9ubHkgdGhlIGNvbnRyYWN0IG93bmVyIGNhbiBjYWxsIHRoaXMgZnVuY3Rpb24uIFRoaXMgYWxsb3dzIGRlbGVnYXRpbmcKbWludGluZyBjYXBhYmlsaXRpZXMgdG8gb3RoZXIgY29udHJhY3RzIChlLmcuLCBhbiBhdWN0aW9uIGNvbnRyYWN0KSB3aXRob3V0CnRyYW5zZmVycmluZyBvd25lcnNoaXAuCgojIEFyZ3VtZW50cwoKKiBgYXV0aG9yaXR5YCAtIFRoZSBhZGRyZXNzIHRvIGdyYW50IG9yIHJldm9rZSBtaW50aW5nIGF1dGhvcml0eQoqIGBlbmFibGVkYCAtIGB0cnVlYCB0byBncmFudCBhdXRob3JpdHksIGBmYWxzZWAgdG8gcmV2b2tlIGl0CgojIEF1dGhvcml6YXRpb24KClJlcXVpcmVzIG93bmVyIGF1dGhlbnRpY2F0aW9uIChlbmZvcmNlZCBieSBgI1tvbmx5X293bmVyXWAgbWFjcm8pLgoKIyBFdmVudHMKCkVtaXRzIGEgYE1pbnRBdXRob3JpdHlDaGFuZ2VkYCBldmVudCB3aXRoIG9sZCBhbmQgbmV3IHBlcm1pc3Npb24gc3RhdGVzLgAAAAAAABJzZXRfbWludF9hdXRob3JpdHkAAAAAAAIAAAAAAAAACWF1dGhvcml0eQAAAAAAABMAAAAAAAAAB2VuYWJsZWQAAAAAAQAAAAA=", "AAAAAAAAA45Jbml0aWF0ZXMgYSAyLXN0ZXAgb3duZXJzaGlwIHRyYW5zZmVyIHRvIGEgbmV3IGFkZHJlc3MuCgpSZXF1aXJlcyBhdXRob3JpemF0aW9uIGZyb20gdGhlIGN1cnJlbnQgb3duZXIuIFRoZSBuZXcgb3duZXIgbXVzdCBsYXRlcgpjYWxsIGBhY2NlcHRfb3duZXJzaGlwKClgIHRvIGNvbXBsZXRlIHRoZSB0cmFuc2Zlci4KCiMgQXJndW1lbnRzCgoqIGBlYCAtIEFjY2VzcyB0byB0aGUgU29yb2JhbiBlbnZpcm9ubWVudC4KKiBgbmV3X293bmVyYCAtIFRoZSBwcm9wb3NlZCBuZXcgb3duZXIuCiogYGxpdmVfdW50aWxfbGVkZ2VyYCAtIExlZGdlciBudW1iZXIgdW50aWwgd2hpY2ggdGhlIG5ldyBvd25lciBjYW4KYWNjZXB0LiBBIHZhbHVlIG9mIGAwYCBjYW5jZWxzIGFueSBwZW5kaW5nIHRyYW5zZmVyLgoKIyBFcnJvcnMKCiogW2BPd25hYmxlRXJyb3I6Ok93bmVyTm90U2V0YF0gLSBJZiB0aGUgb3duZXIgaXMgbm90IHNldC4KKiBbYGNyYXRlOjpyb2xlX3RyYW5zZmVyOjpSb2xlVHJhbnNmZXJFcnJvcjo6Tm9QZW5kaW5nVHJhbnNmZXJgXSAtIElmCnRyeWluZyB0byBjYW5jZWwgYSB0cmFuc2ZlciB0aGF0IGRvZXNuJ3QgZXhpc3QuCiogW2BjcmF0ZTo6cm9sZV90cmFuc2Zlcjo6Um9sZVRyYW5zZmVyRXJyb3I6OkludmFsaWRMaXZlVW50aWxMZWRnZXJgXSAtCklmIHRoZSBzcGVjaWZpZWQgbGVkZ2VyIGlzIGluIHRoZSBwYXN0LgoqIFtgY3JhdGU6OnJvbGVfdHJhbnNmZXI6OlJvbGVUcmFuc2ZlckVycm9yOjpJbnZhbGlkUGVuZGluZ0FjY291bnRgXSAtCklmIHRoZSBzcGVjaWZpZWQgcGVuZGluZyBhY2NvdW50IGlzIG5vdCB0aGUgc2FtZSBhcyB0aGUgcHJvdmlkZWQgYG5ld2AKYWRkcmVzcy4KCiMgTm90ZXMKCiogQXV0aG9yaXphdGlvbiBmb3IgdGhlIGN1cnJlbnQgb3duZXIgaXMgcmVxdWlyZWQuAAAAAAASdHJhbnNmZXJfb3duZXJzaGlwAAAAAAACAAAAAAAAAAluZXdfb3duZXIAAAAAAAATAAAAAAAAABFsaXZlX3VudGlsX2xlZGdlcgAAAAAAAAQAAAAA", "AAAAAAAAAeVSZXR1cm5zIHRoZSB2b3RpbmcgcG93ZXIgKGRlbGVnYXRlZCB2b3Rlcykgb2YgYW4gYWNjb3VudCBhdCBhIHNwZWNpZmljCnBhc3QgbGVkZ2VyIHNlcXVlbmNlIG51bWJlci4KClJldHVybnMgYDBgIGlmIHRoZSBhY2NvdW50IGhhZCBubyBkZWxlZ2F0ZWQgdm90aW5nIHBvd2VyIGF0IHRoZSBnaXZlbgpsZWRnZXIgb3IgZG9lcyBub3QgZXhpc3QgaW4gdGhlIGNvbnRyYWN0LgoKIyBBcmd1bWVudHMKCiogYGVgIC0gQWNjZXNzIHRvIHRoZSBTb3JvYmFuIGVudmlyb25tZW50LgoqIGBhY2NvdW50YCAtIFRoZSBhZGRyZXNzIHRvIHF1ZXJ5IHZvdGluZyBwb3dlciBmb3IuCiogYGxlZGdlcmAgLSBUaGUgbGVkZ2VyIHNlcXVlbmNlIG51bWJlciB0byBxdWVyeSAobXVzdCBiZSBpbiB0aGUgcGFzdCkuCgojIEVycm9ycwoKKiBbYFZvdGVzRXJyb3I6OkZ1dHVyZUxvb2t1cGBdIC0gSWYgYGxlZGdlcmAgPj0gY3VycmVudCBsZWRnZXIgc2VxdWVuY2UKbnVtYmVyLgAAAAAAABdnZXRfdm90ZXNfYXRfY2hlY2twb2ludAAAAAACAAAAAAAAAAdhY2NvdW50AAAAABMAAAAAAAAABmxlZGdlcgAAAAAABAAAAAEAAAAK", "AAAAAAAAAdlSZXR1cm5zIHRoZSB0b3RhbCBzdXBwbHkgb2Ygdm90aW5nIHVuaXRzIGF0IGEgc3BlY2lmaWMgcGFzdCBsZWRnZXIKc2VxdWVuY2UgbnVtYmVyLgoKVGhpcyB0cmFja3MgYWxsIHZvdGluZyB1bml0cyBpbiBjaXJjdWxhdGlvbiAocmVnYXJkbGVzcyBvZiBkZWxlZ2F0aW9uCnN0YXR1cyksIG5vdCBqdXN0IGRlbGVnYXRlZCB2b3Rlcy4KClJldHVybnMgYDBgIGlmIHRoZXJlIHdlcmUgbm8gdm90aW5nIHVuaXRzIGF0IHRoZSBnaXZlbiBsZWRnZXIuCgojIEFyZ3VtZW50cwoKKiBgZWAgLSBBY2Nlc3MgdG8gdGhlIFNvcm9iYW4gZW52aXJvbm1lbnQuCiogYGxlZGdlcmAgLSBUaGUgbGVkZ2VyIHNlcXVlbmNlIG51bWJlciB0byBxdWVyeSAobXVzdCBiZSBpbiB0aGUgcGFzdCkuCgojIEVycm9ycwoKKiBbYFZvdGVzRXJyb3I6OkZ1dHVyZUxvb2t1cGBdIC0gSWYgYGxlZGdlcmAgPj0gY3VycmVudCBsZWRnZXIgc2VxdWVuY2UKbnVtYmVyLgAAAAAAAB5nZXRfdG90YWxfc3VwcGx5X2F0X2NoZWNrcG9pbnQAAAAAAAEAAAAAAAAABmxlZGdlcgAAAAAABAAAAAEAAAAK", "AAAABQAAAChFdmVudCBlbWl0dGVkIHdoZW4gYW4gYWNjb3VudCBpcyBmcm96ZW4uAAAAAAAAAAZGcm96ZW4AAAAAAAEAAAAGZnJvemVuAAAAAAABAAAAAAAAAAdhY2NvdW50AAAAABMAAAABAAAAAg==", "AAAABQAAACpFdmVudCBlbWl0dGVkIHdoZW4gYW4gYWNjb3VudCBpcyB1bmZyb3plbi4AAAAAAAAAAAAIVW5mcm96ZW4AAAABAAAACHVuZnJvemVuAAAAAQAAAAAAAAAHYWNjb3VudAAAAAATAAAAAQAAAAI=", "AAAABAAAAAAAAAAAAAAAD0NvbXBsaWFuY2VFcnJvcgAAAAAEAAAAb0luZGljYXRlcyBhbiBhZG1pbiBvcGVyYXRpb24gd2FzIGludm9rZWQgYmVmb3JlCltgc3RvcmFnZTo6c2V0X2NvbXBsaWFuY2VfY29uZmlnYF0gZXN0YWJsaXNoZWQgYSBjb25maWd1cmF0aW9uLgAAAAANTm90Q29uZmlndXJlZAAAAAAADhAAAAAnSW5kaWNhdGVzIHRoZSB0YXJnZXQgYWNjb3VudCBpcyBmcm96ZW4uAAAAAA1BY2NvdW50RnJvemVuAAAAAAAOEQAAAEhJbmRpY2F0ZXMgdGhlIGNvbmZpZ3VyZWQgcG9saWN5IHJldHVybmVkIGBmYWxzZWAgZm9yIHRoZSB0YXJnZXQKYWNjb3VudC4AAAAVTm90QXV0aG9yaXplZEJ5UG9saWN5AAAAAAAOEgAAAI5JbmRpY2F0ZXMgdGhlIHVuZGVybHlpbmcgU0FDJ3MgYGF1dGhvcml6ZWQoKWAgdmlldyByZXR1cm5lZCBgZmFsc2VgCmZvciB0aGUgdGFyZ2V0IGFjY291bnQgKG9ubHkgcmVhY2hhYmxlIHdoZW4gYHNhY19wYXNzdGhyb3VnaGAgaXMKZW5hYmxlZCkuAAAAAAASTm90QXV0aG9yaXplZEJ5U2FjAAAAAA4T", "AAAABQAAAEJFdmVudCBlbWl0dGVkIHdoZW4gdGhlIGNvbXBsaWFuY2UgY29uZmlndXJhdGlvbiBpcyBzZXQgb3Igcm90YXRlZC4AAAAAAAAAAAAXQ29tcGxpYW5jZUNvbmZpZ0NoYW5nZWQAAAAAAQAAABljb21wbGlhbmNlX2NvbmZpZ19jaGFuZ2VkAAAAAAAAAgAAAAAAAAAGcG9saWN5AAAAAAPoAAAAEwAAAAAAAAAAAAAAD3NhY19wYXNzdGhyb3VnaAAAAAABAAAAAAAAAAI=", "AAAAAQAAAIVDb21wbGlhbmNlIGNvbmZpZ3VyYXRpb24gd3JpdHRlbiBvbmNlIGF0IGNvbnN0cnVjdGlvbiBhbmQgcm90YXRhYmxlIHVuZGVyCmFkbWluIGF1dGggdGhlcmVhZnRlci4gU3RvcmVkIGFzIGFuIGluc3RhbmNlIHN0b3JhZ2UgZW50cnkuAAAAAAAAAAAAABBDb21wbGlhbmNlQ29uZmlnAAAAAgAAAHpPcHRpb25hbCBleHRlcm5hbCBhdXRob3JpemF0aW9uIHBvbGljeSAoc2VlCltgY3JhdGU6OmNvbmZpZGVudGlhbDo6Y29tcGxpYW5jZTo6UG9saWN5YF0pLiBgTm9uZWAgZGlzYWJsZXMgdGhlCnBvbGljeSBnYXRlLgAAAAAABnBvbGljeQAAAAAD6AAAABMAAAEhV2hlbiBgdHJ1ZWAsIHRoZSBnYXRlcyBhZGRpdGlvbmFsbHkgY29uc3VsdCB0aGUgdW5kZXJseWluZyBTQUMncwpgYXV0aG9yaXplZCgpYCB2aWV3LiBSZXF1aXJlcyB0aGUgdW5kZXJseWluZyB0b2tlbiB0byBiZSBhIFN0ZWxsYXIKQXNzZXQgQ29udHJhY3Qg4oCUIGBhdXRob3JpemVkYCBpcyBub3QgcGFydCBvZiBTRVAtNDEsIGFuZCBlbmFibGluZwp0aGlzIGZsYWcgb3ZlciBhIG5vbi1TQUMgdW5kZXJseWluZyBtYWtlcyBldmVyeSBnYXRlZCBvcGVyYXRpb24gdHJhcAooc2VlIFtgY2hlY2tfc2FjYF0pLgAAAAAAAA9zYWNfcGFzc3Rocm91Z2gAAAAAAQ==", "AAAAAgAAAD1TdG9yYWdlIGtleXMgZm9yIHRoZSBjb25maWRlbnRpYWwgdG9rZW4gY29tcGxpYW5jZSBleHRlbnNpb24uAAAAAAAAAAAAABRDb21wbGlhbmNlU3RvcmFnZUtleQAAAAIAAAAAAAAAMVNpbmdsZXRvbiBbYENvbXBsaWFuY2VDb25maWdgXS4gSW5zdGFuY2Ugc3RvcmFnZS4AAAAAAAAGQ29uZmlnAAAAAAABAAAAaFBlci1hY2NvdW50IGZyb3plbiBmbGFnLiBQZXJzaXN0ZW50IHN0b3JhZ2U7IG9ubHkgc2V0IHdoZW4gYW4gYWNjb3VudAppcyBmcm96ZW4gYW5kIHJlbW92ZWQgb24gdW5mcmVlemUuAAAABkZyb3plbgAAAAAAAQAAABM=", "AAAABQAAAGJFdmVudCBlbWl0dGVkIHdoZW4gYSBjb25maWRlbnRpYWwgYWNjb3VudCBtZXJnZXMgaXRzIHJlY2VpdmluZyBiYWxhbmNlCmludG8gaXRzIHNwZW5kYWJsZSBiYWxhbmNlLgAAAAAAAAAAAAVNZXJnZQAAAAAAAAEAAAAFbWVyZ2UAAAAAAAABAAAAAAAAAAdhY2NvdW50AAAAABMAAAABAAAAAg==", "AAAABQAAAFdFdmVudCBlbWl0dGVkIHdoZW4gYSBkZXBvc2l0IG1vdmVzIFNFUC00MSB0b2tlbnMgaW50byBhIGNvbmZpZGVudGlhbApyZWNlaXZpbmcgYmFsYW5jZS4AAAAAAAAAAAdEZXBvc2l0AAAAAAEAAAAHZGVwb3NpdAAAAAADAAAAAAAAAARmcm9tAAAAEwAAAAEAAAAAAAAAAnRvAAAAAAATAAAAAQAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAI=", "AAAABQAAADhFdmVudCBlbWl0dGVkIHdoZW4gYSBjb25maWRlbnRpYWwgYWNjb3VudCBpcyByZWdpc3RlcmVkLgAAAAAAAAAIUmVnaXN0ZXIAAAABAAAACHJlZ2lzdGVyAAAAAgAAAAAAAAAHYWNjb3VudAAAAAATAAAAAQAAAAAAAAAKYXVkaXRvcl9pZAAAAAAABAAAAAAAAAAC", "AAAABQAAAClFdmVudCBlbWl0dGVkIG9uIGEgY29uZmlkZW50aWFsIHRyYW5zZmVyLgAAAAAAAAAAAAAIVHJhbnNmZXIAAAABAAAACHRyYW5zZmVyAAAACgAAAAAAAAAEZnJvbQAAABMAAAABAAAAAAAAAAJ0bwAAAAAAEwAAAAEAAAAAAAAACXJfZV9wb2ludAAAAAAAA+4AAABAAAAAAAAAAAAAAAAHdl90aWxkZQAAAAPuAAAAIAAAAAAAAAAAAAAABXNpZ21hAAAAAAAD7gAAACAAAAAAAAAAAAAAAAdiX3RpbGRlAAAAA+4AAAAgAAAAAAAAAAAAAAANdl90aWxkZV9hdWRfcgAAAAAAA+4AAAAgAAAAAAAAAAAAAAANcl90aWxkZV9hdWRfcgAAAAAAA+4AAAAgAAAAAAAAAAAAAAANdl90aWxkZV9hdWRfcwAAAAAAA+4AAAAgAAAAAAAAAAAAAAANYl90aWxkZV9hdWRfcwAAAAAAA+4AAAAgAAAAAAAAAAI=", "AAAABQAAACtFdmVudCBlbWl0dGVkIG9uIGEgY29uZmlkZW50aWFsIHdpdGhkcmF3YWwuAAAAAAAAAAAIV2l0aGRyYXcAAAABAAAACHdpdGhkcmF3AAAABwAAAAAAAAAEZnJvbQAAABMAAAABAAAAAAAAAAJ0bwAAAAAAEwAAAAEAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAAAAAACXJfZV9wb2ludAAAAAAAA+4AAABAAAAAAAAAAAAAAAAFc2lnbWEAAAAAAAPuAAAAIAAAAAAAAAAAAAAAB2JfdGlsZGUAAAAD7gAAACAAAAAAAAAAAAAAAA1iX3RpbGRlX2F1ZF9zAAAAAAAD7gAAACAAAAAAAAAAAg==", "AAAABQAAAIZFdmVudCBlbWl0dGVkIHdoZW4gdGhlIGF1ZGl0b3IgcmVnaXN0cnkgY29udHJhY3QgYWRkcmVzcyBpcyBzZXQgb3IKcm90YXRlZC4gTWF5IGZpcmUgbW9yZSB0aGFuIG9uY2Ugb3ZlciB0aGUgbGlmZXRpbWUgb2YgdGhlIGNvbnRyYWN0LgAAAAAAAAAAAApBdWRpdG9yU2V0AAAAAAABAAAAC2F1ZGl0b3Jfc2V0AAAAAAEAAAAAAAAAB2F1ZGl0b3IAAAAAEwAAAAAAAAAC", "AAAABQAAAChFdmVudCBlbWl0dGVkIHdoZW4gYW4gc3BlbmRlciBpcyBzZXQgdXAuAAAAAAAAAApTZXRTcGVuZGVyAAAAAAABAAAAC3NldF9zcGVuZGVyAAAAAAgAAAAAAAAAB2FjY291bnQAAAAAEwAAAAEAAAAAAAAAB3NwZW5kZXIAAAAAEwAAAAEAAAAAAAAAEWxpdmVfdW50aWxfbGVkZ2VyAAAAAAAABAAAAAAAAAAAAAAACXJfZV9wb2ludAAAAAAAA+4AAABAAAAAAAAAAAAAAAAFc2lnbWEAAAAAAAPuAAAAIAAAAAAAAAAAAAAAB2JfdGlsZGUAAAAD7gAAACAAAAAAAAAAAAAAAA12X3RpbGRlX2F1ZF9zAAAAAAAD7gAAACAAAAAAAAAAAAAAAA1iX3RpbGRlX2F1ZF9zAAAAAAAD7gAAACAAAAAAAAAAAg==", "AAAABQAAAIdFdmVudCBlbWl0dGVkIHdoZW4gdGhlIHZlcmlmaWVyIHJlZ2lzdHJ5IGNvbnRyYWN0IGFkZHJlc3MgaXMgc2V0IG9yCnJvdGF0ZWQuIE1heSBmaXJlIG1vcmUgdGhhbiBvbmNlIG92ZXIgdGhlIGxpZmV0aW1lIG9mIHRoZSBjb250cmFjdC4AAAAAAAAAAAtWZXJpZmllclNldAAAAAABAAAADHZlcmlmaWVyX3NldAAAAAEAAAAAAAAACHZlcmlmaWVyAAAAEwAAAAAAAAAC", "AAAABQAAAClFdmVudCBlbWl0dGVkIHdoZW4gYW4gc3BlbmRlciBpcyByZXZva2VkLgAAAAAAAAAAAAANUmV2b2tlU3BlbmRlcgAAAAAAAAEAAAAOcmV2b2tlX3NwZW5kZXIAAAAAAAcAAAAAAAAAB2FjY291bnQAAAAAEwAAAAEAAAAAAAAAB3NwZW5kZXIAAAAAEwAAAAEAAAAAAAAACXJfZV9wb2ludAAAAAAAA+4AAABAAAAAAAAAAAAAAAAFc2lnbWEAAAAAAAPuAAAAIAAAAAAAAAAAAAAAB2JfdGlsZGUAAAAD7gAAACAAAAAAAAAAAAAAAA12X3RpbGRlX2F1ZF9zAAAAAAAD7gAAACAAAAAAAAAAAAAAAA1iX3RpbGRlX2F1ZF9zAAAAAAAD7gAAACAAAAAAAAAAAg==", "AAAABQAAACVFdmVudCBlbWl0dGVkIG9uIGFuIHNwZW5kZXIgdHJhbnNmZXIuAAAAAAAAAAAAAA9TcGVuZGVyVHJhbnNmZXIAAAAAAQAAABBzcGVuZGVyX3RyYW5zZmVyAAAACgAAAAAAAAAHc3BlbmRlcgAAAAATAAAAAQAAAAAAAAAEZnJvbQAAABMAAAABAAAAAAAAAAJ0bwAAAAAAEwAAAAEAAAAAAAAACXJfZV9wb2ludAAAAAAAA+4AAABAAAAAAAAAAAAAAAAHdl90aWxkZQAAAAPuAAAAIAAAAAAAAAAAAAAAB3NpZ21hX2EAAAAD7gAAACAAAAAAAAAAAAAAAA12X3RpbGRlX2F1ZF9yAAAAAAAD7gAAACAAAAAAAAAAAAAAAA1yX3RpbGRlX2F1ZF9yAAAAAAAD7gAAACAAAAAAAAAAAAAAAA12X3RpbGRlX2F1ZF9zAAAAAAAD7gAAACAAAAAAAAAAAAAAAA1hX3RpbGRlX2F1ZF9zAAAAAAAD7gAAACAAAAAAAAAAAg==", "AAAABQAAAJNFdmVudCBlbWl0dGVkIHdoZW4gdGhlIGNvbnRyYWN0J3MgY29tcHJlc3NlZCBgYWRkcl9mYCBmaWVsZCBpcyBjb21wdXRlZCBhbmQKc3RvcmVkLiBFeHBlY3RlZCB0byBmaXJlIGV4YWN0bHkgb25jZSwgZnJvbSB0aGUgY29udHJhY3QncyBjb25zdHJ1Y3Rvci4AAAAAAAAAABFBZGRyZXNzQXNGaWVsZFNldAAAAAAAAAEAAAAUYWRkcmVzc19hc19maWVsZF9zZXQAAAABAAAAAAAAABBhZGRyZXNzX2FzX2ZpZWxkAAAD7gAAACAAAAAAAAAAAg==", "AAAABQAAAHNFdmVudCBlbWl0dGVkIHdoZW4gdGhlIFNFUC00MSB0b2tlbiBhZGRyZXNzIGlzIHNldC4gRXhwZWN0ZWQgdG8gZmlyZQpleGFjdGx5IG9uY2UsIGZyb20gdGhlIGNvbnRyYWN0J3MgY29uc3RydWN0b3IuAAAAAAAAAAASVW5kZXJseWluZ0Fzc2V0U2V0AAAAAAABAAAAFHVuZGVybHlpbmdfYXNzZXRfc2V0AAAAAQAAAAAAAAAQdW5kZXJseWluZ19hc3NldAAAABMAAAAAAAAAAg==", "AAAABAAAAAAAAAAAAAAAFkNvbmZpZGVudGlhbFRva2VuRXJyb3IAAAAAAA8AAABCSW5kaWNhdGVzIGBhY2NvdW50YCBhbHJlYWR5IGhhcyBhIGNvbmZpZGVudGlhbCBhY2NvdW50IHJlZ2lzdGVyZWQuAAAAAAAYQWNjb3VudEFscmVhZHlSZWdpc3RlcmVkAAANrAAAAC9JbmRpY2F0ZXMgdGhlIHRhcmdldCBhY2NvdW50IGlzIG5vdCByZWdpc3RlcmVkLgAAAAAUQWNjb3VudE5vdFJlZ2lzdGVyZWQAAA2tAAAAL0luZGljYXRlcyBhIHB1YmxpYyBhbW91bnQgYXJndW1lbnQgaXMgbmVnYXRpdmUuAAAAAA5OZWdhdGl2ZUFtb3VudAAAAAANrgAAAD9JbmRpY2F0ZXMgYSBkZWxlZ2F0aW9uIGFscmVhZHkgZXhpc3RzIGZvciBgKGFjY291bnQsIHNwZW5kZXIpYC4AAAAAF0RlbGVnYXRpb25BbHJlYWR5RXhpc3RzAAAADa8AAAA4SW5kaWNhdGVzIG5vIGRlbGVnYXRpb24gZXhpc3RzIGZvciBgKGFjY291bnQsIHNwZW5kZXIpYC4AAAASRGVsZWdhdGlvbk5vdEZvdW5kAAAAAA2wAAAAT0luZGljYXRlcyB0aGUgZGVsZWdhdGlvbiBoYXMgZXhwaXJlZAooYGxlZGdlci5zZXF1ZW5jZSgpID4gbGl2ZV91bnRpbF9sZWRnZXJgKS4AAAAAEURlbGVnYXRpb25FeHBpcmVkAAAAAAANsQAAADdJbmRpY2F0ZXMgdGhlIHZlcmlmaWVyIHJlamVjdGVkIHRoZSBhY2NvbXBhbnlpbmcgcHJvb2YuAAAAAAxJbnZhbGlkUHJvb2YAAA2yAAAAWEluZGljYXRlcyB0aGUgYGRhdGFgIHBheWxvYWQgY291bGQgbm90IGJlIGRlY29kZWQgaW50byB0aGUgZXhwZWN0ZWQKYOKAplBheWxvYWRgIHN0cnVjdC4AAAALSW52YWxpZERhdGEAAAANswAAAFVJbmRpY2F0ZXMgdGhlIGNvbnRyYWN0IGhhcyBub3QgYmVlbiBjb25zdHJ1Y3RlZDogdGhlIFNFUC00MSB0b2tlbgphZGRyZXNzIGlzIG1pc3NpbmcuAAAAAAAAFVVuZGVybHlpbmdBc3NldE5vdFNldAAAAAAADbQAAABRSW5kaWNhdGVzIHRoZSBjb250cmFjdCBoYXMgbm90IGJlZW4gY29uc3RydWN0ZWQ6IHRoZSB2ZXJpZmllcgphZGRyZXNzIGlzIG1pc3NpbmcuAAAAAAAADlZlcmlmaWVyTm90U2V0AAAAAA21AAAAWUluZGljYXRlcyB0aGUgY29udHJhY3QgaGFzIG5vdCBiZWVuIGNvbnN0cnVjdGVkOiB0aGUgYXVkaXRvcgpyZWdpc3RyeSBhZGRyZXNzIGlzIG1pc3NpbmcuAAAAAAAADUF1ZGl0b3JOb3RTZXQAAAAAAA22AAAAT0luZGljYXRlcyB0aGUgY29udHJhY3QgaGFzIG5vdCBiZWVuIGNvbnN0cnVjdGVkOiB0aGUgYGFkZHJfZmAgZmllbGQgaXMKbWlzc2luZy4AAAAAFEFkZHJlc3NBc0ZpZWxkTm90U2V0AAANtwAAAFJJbmRpY2F0ZXMgdGhlIGBhZGRyX2ZgIGZpZWxkIGhhcyBhbHJlYWR5IGJlZW4gc2V0OyByZS1pbml0aWFsaXphdGlvbiBpcwpmb3JiaWRkZW4uAAAAAAAYQWRkcmVzc0FzRmllbGRBbHJlYWR5U2V0AAANuAAAAFhJbmRpY2F0ZXMgdGhlIFNFUC00MSB0b2tlbiBhZGRyZXNzIGhhcyBhbHJlYWR5IGJlZW4gc2V0OwpyZS1pbml0aWFsaXphdGlvbiBpcyBmb3JiaWRkZW4uAAAAGVVuZGVybHlpbmdBc3NldEFscmVhZHlTZXQAAAAAAA25AAABWkluZGljYXRlcyBhIHByb3Zlci1zdXBwbGllZCAzMi1ieXRlIGZpZWxkIHJlcHJlc2VudGF0aXZlIG9yIEdydW1wa2luCmNvb3JkaW5hdGUgaXMgbm90IGEgY2Fub25pY2FsIGBCbjI1NEZyYCB2YWx1ZSAoYOKJpSByYCkuIFRoZSBTb3JvYmFuCmhvc3QncyBgYm4yNTRfZnJfKmAgZGVzZXJpYWxpc2VyIHNpbGVudGx5IHJlZHVjZXMgbm9uLWNhbm9uaWNhbAplbmNvZGluZ3MsIHNvIHRoZSBjb250cmFjdCBlbmZvcmNlcyBjYW5vbmljYWxpdHkgYXQgdGhlIHZlcmlmaWVyCmJvdW5kYXJ5IHRvIGtlZXAgc3RvcmVkIHN0YXRlIGFuZCBlbWl0dGVkIGV2ZW50cyBieXRlLXVuaXF1ZSBwZXIKbG9naWNhbCB2YWx1ZS4AAAAAABROb25DYW5vbmljYWxFbmNvZGluZwAADbo=", "AAAABAAAAAAAAAAAAAAADEF1ZGl0b3JFcnJvcgAAAAQAAAAxSW5kaWNhdGVzIHRoZSBgYXVkaXRvcl9pZGAgaXMgYWxyZWFkeSByZWdpc3RlcmVkLgAAAAAAABhBdWRpdG9yQWxyZWFkeVJlZ2lzdGVyZWQAAAzkAAAAMkluZGljYXRlcyBubyBrZXkgaXMgcmVnaXN0ZXJlZCB1bmRlciBgYXVkaXRvcl9pZGAuAAAAAAAUQXVkaXRvck5vdFJlZ2lzdGVyZWQAAAzlAAAAWkluZGljYXRlcyB0aGUgcG9pbnQgaXMgdGhlIGlkZW50aXR5IGAoMCwgMClgLCB3aGljaCBpcyBmb3JiaWRkZW4gYXMgYW4KYXVkaXRvciBwdWJsaWMga2V5LgAAAAAADUlkZW50aXR5UG9pbnQAAAAAAAzmAAAAVEluZGljYXRlcyB0aGUgcG9pbnQgaXMgbm9uLWNhbm9uaWNhbCBvciBkb2VzIG5vdCBzYXRpc2Z5CmB5wrIg4omhIHjCsyAtIDE3IChtb2QgcilgLgAAAA9Qb2ludE5vdE9uQ3VydmUAAAAM5w==", "AAAABQAAAC1FdmVudCBlbWl0dGVkIHdoZW4gYW4gYXVkaXRvciBrZXkgaXMgcm90YXRlZC4AAAAAAAAAAAAADkF1ZGl0b3JSb3RhdGVkAAAAAAABAAAAD2F1ZGl0b3Jfcm90YXRlZAAAAAADAAAAAAAAAAphdWRpdG9yX2lkAAAAAAAEAAAAAQAAAAAAAAAJb2xkX3BvaW50AAAAAAAD7gAAAEAAAAAAAAAAAAAAAAluZXdfcG9pbnQAAAAAAAPuAAAAQAAAAAAAAAAC", "AAAABQAAADNFdmVudCBlbWl0dGVkIHdoZW4gYSBuZXcgYXVkaXRvciBrZXkgaXMgcmVnaXN0ZXJlZC4AAAAAAAAAABFBdWRpdG9yUmVnaXN0ZXJlZAAAAAAAAAEAAAASYXVkaXRvcl9yZWdpc3RlcmVkAAAAAAACAAAAAAAAAAphdWRpdG9yX2lkAAAAAAAEAAAAAQAAAAAAAAAFcG9pbnQAAAAAAAPuAAAAQAAAAAAAAAAC", "AAAAAgAAACZTdG9yYWdlIGtleXMgZm9yIHRoZSBhdWRpdG9yIHJlZ2lzdHJ5LgAAAAAAAAAAABFBdWRpdG9yU3RvcmFnZUtleQAAAAAAAAEAAAABAAAAQU1hcHMgYGF1ZGl0b3JfaWRgIHRvIGl0cyBHcnVtcGtpbiBwdWJsaWMga2V5IGVuY29kZWQgYXMgYCh4LCB5KWAuAAAAAAAAA0tleQAAAAABAAAABA==", "AAAAAQAAAGlFbnZlbG9wZSBkZWNvZGVkIGZyb20gdGhlIGBkYXRhOiBCeXRlc2AgYXJndW1lbnQgb2YKW2BjcmF0ZTo6Y29uZmlkZW50aWFsOjpDb25maWRlbnRpYWxUb2tlbjo6cmVnaXN0ZXJgXS4AAAAAAAAAAAAADFJlZ2lzdGVyRGF0YQAAAAIAAAAAAAAAB3BheWxvYWQAAAAH0AAAAA9SZWdpc3RlclBheWxvYWQAAAAAAAAAAAVwcm9vZgAAAAAAAA4=", "AAAAAQAAAHZFbnZlbG9wZSBkZWNvZGVkIGZyb20gdGhlIGBkYXRhOiBCeXRlc2AgYXJndW1lbnQgb2YKW2BjcmF0ZTo6Y29uZmlkZW50aWFsOjpDb25maWRlbnRpYWxUb2tlbjo6Y29uZmlkZW50aWFsX3RyYW5zZmVyYF0uAAAAAAAAAAAADFRyYW5zZmVyRGF0YQAAAAIAAAAAAAAAB3BheWxvYWQAAAAH0AAAAA9UcmFuc2ZlclBheWxvYWQAAAAAAAAAAAVwcm9vZgAAAAAAAA4=", "AAAAAQAAAGlFbnZlbG9wZSBkZWNvZGVkIGZyb20gdGhlIGBkYXRhOiBCeXRlc2AgYXJndW1lbnQgb2YKW2BjcmF0ZTo6Y29uZmlkZW50aWFsOjpDb25maWRlbnRpYWxUb2tlbjo6d2l0aGRyYXdgXS4AAAAAAAAAAAAADFdpdGhkcmF3RGF0YQAAAAIAAAAAAAAAB3BheWxvYWQAAAAH0AAAAA9XaXRoZHJhd1BheWxvYWQAAAAAAAAAAAVwcm9vZgAAAAAAAA4=", "AAAAAQAAAGxFbnZlbG9wZSBkZWNvZGVkIGZyb20gdGhlIGBkYXRhOiBCeXRlc2AgYXJndW1lbnQgb2YKW2BjcmF0ZTo6Y29uZmlkZW50aWFsOjpDb25maWRlbnRpYWxUb2tlbjo6c2V0X3NwZW5kZXJgXS4AAAAAAAAADlNldFNwZW5kZXJEYXRhAAAAAAACAAAAAAAAAAdwYXlsb2FkAAAAB9AAAAARU2V0U3BlbmRlclBheWxvYWQAAAAAAAAAAAAABXByb29mAAAAAAAADg==", "AAAAAQAAAEFQYXlsb2FkIGZvciBbYGNyYXRlOjpjb25maWRlbnRpYWw6OkNvbmZpZGVudGlhbFRva2VuOjpyZWdpc3RlcmBdLgAAAAAAAAAAAAAPUmVnaXN0ZXJQYXlsb2FkAAAAAAIAAAAAAAAAA3B2awAAAAfQAAAABVBvaW50AAAAAAAAAAAAAAF5AAAAAAAH0AAAAAVQb2ludAAAAA==", "AAAAAQAAAE5QYXlsb2FkIGZvcgpbYGNyYXRlOjpjb25maWRlbnRpYWw6OkNvbmZpZGVudGlhbFRva2VuOjpjb25maWRlbnRpYWxfdHJhbnNmZXJgXS4AAAAAAAAAAAAPVHJhbnNmZXJQYXlsb2FkAAAAAAoAAAAAAAAAB2JfdGlsZGUAAAAD7gAAACAAAAAAAAAADWJfdGlsZGVfYXVkX3MAAAAAAAPuAAAAIAAAAAAAAAALY19zcGVuZF9uZXcAAAAH0AAAAAVQb2ludAAAAAAAAAAAAAAKY190cmFuc2ZlcgAAAAAH0AAAAAVQb2ludAAAAAAAAAAAAAAJcl9lX3BvaW50AAAAAAAH0AAAAAVQb2ludAAAAAAAAAAAAAANcl90aWxkZV9hdWRfcgAAAAAAA+4AAAAgAAAAAAAAAAVzaWdtYQAAAAAAA+4AAAAgAAAAAAAAAAd2X3RpbGRlAAAAA+4AAAAgAAAAAAAAAA12X3RpbGRlX2F1ZF9yAAAAAAAD7gAAACAAAAAAAAAADXZfdGlsZGVfYXVkX3MAAAAAAAPuAAAAIA==", "AAAAAQAAAEFQYXlsb2FkIGZvciBbYGNyYXRlOjpjb25maWRlbnRpYWw6OkNvbmZpZGVudGlhbFRva2VuOjp3aXRoZHJhd2BdLgAAAAAAAAAAAAAPV2l0aGRyYXdQYXlsb2FkAAAAAAUAAAAAAAAAB2JfdGlsZGUAAAAD7gAAACAAAAAAAAAADWJfdGlsZGVfYXVkX3MAAAAAAAPuAAAAIAAAAAAAAAALY19zcGVuZF9uZXcAAAAH0AAAAAVQb2ludAAAAAAAAAAAAAAJcl9lX3BvaW50AAAAAAAH0AAAAAVQb2ludAAAAAAAAAAAAAAFc2lnbWEAAAAAAAPuAAAAIA==", "AAAAAQAAAG9FbnZlbG9wZSBkZWNvZGVkIGZyb20gdGhlIGBkYXRhOiBCeXRlc2AgYXJndW1lbnQgb2YKW2BjcmF0ZTo6Y29uZmlkZW50aWFsOjpDb25maWRlbnRpYWxUb2tlbjo6cmV2b2tlX3NwZW5kZXJgXS4AAAAAAAAAABFSZXZva2VTcGVuZGVyRGF0YQAAAAAAAAIAAAAAAAAAB3BheWxvYWQAAAAH0AAAABRSZXZva2VTcGVuZGVyUGF5bG9hZAAAAAAAAAAFcHJvb2YAAAAAAAAO", "AAAAAQAAAERQYXlsb2FkIGZvciBbYGNyYXRlOjpjb25maWRlbnRpYWw6OkNvbmZpZGVudGlhbFRva2VuOjpzZXRfc3BlbmRlcmBdLgAAAAAAAAARU2V0U3BlbmRlclBheWxvYWQAAAAAAAAKAAAAAAAAAAdhX3RpbGRlAAAAA+4AAAAgAAAAAAAAAAdiX3RpbGRlAAAAA+4AAAAgAAAAAAAAAA1iX3RpbGRlX2F1ZF9zAAAAAAAD7gAAACAAAAAAAAAAA2NfYQAAAAfQAAAABVBvaW50AAAAAAAAAAAAAAtjX3NwZW5kX25ldwAAAAfQAAAABVBvaW50AAAAAAAAAAAAAAxlc2Nyb3dlZF9kdmsAAAfQAAAABVBvaW50AAAAAAAAAAAAAAlyX2VfcG9pbnQAAAAAAAfQAAAABVBvaW50AAAAAAAAAAAAAAVzaWdtYQAAAAAAA+4AAAAgAAAAAAAAAAdzaWdtYV9hAAAAA+4AAAAgAAAAAAAAAA12X3RpbGRlX2F1ZF9zAAAAAAAD7gAAACA=", "AAAAAQAAACNPbi1jaGFpbiBzcGVuZGVyIGRlbGVnYXRpb24gcmVjb3JkLgAAAAAAAAAAEVNwZW5kZXJEZWxlZ2F0aW9uAAAAAAAABQAAAClQb3NlaWRvbi1lbmNyeXB0ZWQgYWxsb3dhbmNlIHNjYWxhciBgw6NgLgAAAAAAAAdhX3RpbGRlAAAAA+4AAAAgAAAAK0FsbG93YW5jZSBjb21taXRtZW50IGBDX2EgPSBDb20odl9hLCByX2EpYC4AAAAAFGFsbG93YW5jZV9jb21taXRtZW50AAAH0AAAAAVQb2ludAAAAAAAABtQZXItZGVsZWdhdGlvbiBzYWx0IGDPg19hYC4AAAAADmFsbG93YW5jZV9zYWx0AAAAAAPuAAAAIAAAADhFQ0RIIGVzY3JvdyBvZiBgZHZrX2lgIHVuZGVyIHRoZSBzcGVuZGVyJ3Mgc3BlbmRpbmcga2V5LgAAAAxlc2Nyb3dlZF9kdmsAAAfQAAAABVBvaW50AAAAAAAAeVRoZSBsZWRnZXIgbnVtYmVyIGF0IHdoaWNoIHRoZSBkZWxlZ2F0aW9uIGV4cGlyZXMuIFNwZW5kaW5nIGlzCmF1dGhvcml6ZWQgd2hpbGUgYGxlZGdlci5zZXF1ZW5jZSgpIDw9IGxpdmVfdW50aWxfbGVkZ2VyYC4AAAAAAAARbGl2ZV91bnRpbF9sZWRnZXIAAAAAAAAE", "AAAAAQAAACVPbi1jaGFpbiBjb25maWRlbnRpYWwgYWNjb3VudCByZWNvcmQuAAAAAAAAAAAAABNDb25maWRlbnRpYWxBY2NvdW50AAAAAAUAAAAxSW5kZXggb2YgdGhlIGF1ZGl0b3Iga2V5IGluIHRoZSBhdWRpdG9yIHJlZ2lzdHJ5LgAAAAAAAAphdWRpdG9yX2lkAAAAAAAEAAAAKVJlY2VpdmluZyBiYWxhbmNlIGNvbW1pdG1lbnQgYENfcmVjZWl2ZWAuAAAAAAAAFHJlY2VpdmluZ19jb21taXRtZW50AAAH0AAAAAVQb2ludAAAAAAAACdTcGVuZGFibGUgYmFsYW5jZSBjb21taXRtZW50IGBDX3NwZW5kYC4AAAAAFHNwZW5kYWJsZV9jb21taXRtZW50AAAH0AAAAAVQb2ludAAAAAAAADBgWSA9IHNrIMK3IEhgLCB0aGUgR3J1bXBraW4gc3BlbmRpbmcgcHVibGljIGtleS4AAAATc3BlbmRpbmdfcHVibGljX2tleQAAAAfQAAAABVBvaW50AAAAAAAAMWBQVksgPSB2ayDCtyBIYCwgdGhlIEdydW1wa2luIHZpZXdpbmcgcHVibGljIGtleS4AAAAAAAASdmlld2luZ19wdWJsaWNfa2V5AAAAAAfQAAAABVBvaW50AAAA", "AAAAAQAAAHtFbnZlbG9wZSBkZWNvZGVkIGZyb20gdGhlIGBkYXRhOiBCeXRlc2AgYXJndW1lbnQgb2YKW2BjcmF0ZTo6Y29uZmlkZW50aWFsOjpDb25maWRlbnRpYWxUb2tlbjo6Y29uZmlkZW50aWFsX3RyYW5zZmVyX2Zyb21gXS4AAAAAAAAAABNTcGVuZGVyVHJhbnNmZXJEYXRhAAAAAAIAAAAAAAAAB3BheWxvYWQAAAAH0AAAABZTcGVuZGVyVHJhbnNmZXJQYXlsb2FkAAAAAAAAAAAABXByb29mAAAAAAAADg==", "AAAAAQAAAEdQYXlsb2FkIGZvciBbYGNyYXRlOjpjb25maWRlbnRpYWw6OkNvbmZpZGVudGlhbFRva2VuOjpyZXZva2Vfc3BlbmRlcmBdLgAAAAAAAAAAFFJldm9rZVNwZW5kZXJQYXlsb2FkAAAABgAAAAAAAAAHYl90aWxkZQAAAAPuAAAAIAAAAAAAAAANYl90aWxkZV9hdWRfcwAAAAAAA+4AAAAgAAAAAAAAAAtjX3NwZW5kX25ldwAAAAfQAAAABVBvaW50AAAAAAAAAAAAAAlyX2VfcG9pbnQAAAAAAAfQAAAABVBvaW50AAAAAAAAAAAAAAVzaWdtYQAAAAAAA+4AAAAgAAAAAAAAAA12X3RpbGRlX2F1ZF9zAAAAAAAD7gAAACA=", "AAAAAQAAAFNQYXlsb2FkIGZvcgpbYGNyYXRlOjpjb25maWRlbnRpYWw6OkNvbmZpZGVudGlhbFRva2VuOjpjb25maWRlbnRpYWxfdHJhbnNmZXJfZnJvbWBdLgAAAAAAAAAAFlNwZW5kZXJUcmFuc2ZlclBheWxvYWQAAAAAAAoAAAAAAAAADWFfdGlsZGVfYXVkX3MAAAAAAAPuAAAAIAAAAAAAAAALYV90aWxkZV9uZXcAAAAD7gAAACAAAAAAAAAAB2NfYV9uZXcAAAAH0AAAAAVQb2ludAAAAAAAAAAAAAAKY190cmFuc2ZlcgAAAAAH0AAAAAVQb2ludAAAAAAAAAAAAAAJcl9lX3BvaW50AAAAAAAH0AAAAAVQb2ludAAAAAAAAAAAAAANcl90aWxkZV9hdWRfcgAAAAAAA+4AAAAgAAAAAAAAAAtzaWdtYV9hX25ldwAAAAPuAAAAIAAAAAAAAAAHdl90aWxkZQAAAAPuAAAAIAAAAAAAAAANdl90aWxkZV9hdWRfcgAAAAAAA+4AAAAgAAAAAAAAAA12X3RpbGRlX2F1ZF9zAAAAAAAD7gAAACA=", "AAAAAgAAAChTdG9yYWdlIGtleXMgZm9yIHRoZSBjb25maWRlbnRpYWwgdG9rZW4uAAAAAAAAABtDb25maWRlbnRpYWxUb2tlblN0b3JhZ2VLZXkAAAAABgAAAAAAAABAU0VQLTQxIHRva2VuIHdob3NlIGJhbGFuY2VzIGJhY2sgdGhlIGNvbnRyYWN0LiBJbnN0YW5jZSBzdG9yYWdlLgAAAA9VbmRlcmx5aW5nQXNzZXQAAAAAAAAAAElDb25maWRlbnRpYWwgdmVyaWZpZXIgY29udHJhY3QgdXNlZCBmb3IgYHZlcmlmeV9wcm9vZmAuIEluc3RhbmNlCnN0b3JhZ2UuAAAAAAAACFZlcmlmaWVyAAAAAAAAAENDb25maWRlbnRpYWwgYXVkaXRvciBjb250cmFjdCB1c2VkIGZvciBgZ2V0X2tleWAuIEluc3RhbmNlIHN0b3JhZ2UuAAAAAAdBdWRpdG9yAAAAAAAAAABgVGhlIGN1cnJlbnQgY29udHJhY3QgYWRkcmVzcyBhcyBhIDMyLWJ5dGUgYmlnLWVuZGlhbiBgQm4yNTRGcmAKcmVwcmVzZW50YXRpdmUuIEluc3RhbmNlIHN0b3JhZ2UuAAAADkFkZHJlc3NBc0ZpZWxkAAAAAAABAAAAWFBlci1hY2NvdW50IGBDb25maWRlbnRpYWxBY2NvdW50YCBlbnRyeSwga2V5ZWQgYnkgdGhlIG93bmVyIGFkZHJlc3MuClBlcnNpc3RlbnQgc3RvcmFnZS4AAAAHQWNjb3VudAAAAAABAAAAEwAAAAEAAACRUGVyLWAob3duZXIsIHNwZW5kZXIpYCBgU3BlbmRlckRlbGVnYXRpb25gIGVudHJ5LiBQZXJzaXN0ZW50IHN0b3JhZ2UuClBlcnNpc3RzIHVudGlsIGV4cGxpY2l0bHkgcmV2b2tlZCBldmVuIHdoZW4gYGxpdmVfdW50aWxfbGVkZ2VyYCBoYXMKcGFzc2VkLgAAAAAAAApEZWxlZ2F0aW9uAAAAAAACAAAAEwAAABM=", "AAAAAwAAAKNJZGVudGlmaWVyIG9mIGEgemVyby1rbm93bGVkZ2UgY2lyY3VpdCB3aG9zZSB2ZXJpZmljYXRpb24ga2V5IGlzIHN0b3JlZCBpbgp0aGUgcmVnaXN0cnkuIFRoZSBudW1lcmljIHZhbHVlcyBhcmUgcGFydCBvZiB0aGUgb24tY2hhaW4gaW50ZXJmYWNlIGFuZApNVVNUIE5PVCBjaGFuZ2UuAAAAAAAAAAALQ2lyY3VpdFR5cGUAAAAABgAAAAAAAAAIUmVnaXN0ZXIAAAAAAAAAAAAAAAhXaXRoZHJhdwAAAAEAAAAAAAAACFRyYW5zZmVyAAAAAgAAAAAAAAAPU3BlbmRlclRyYW5zZmVyAAAAAAMAAAAAAAAAClNldFNwZW5kZXIAAAAAAAQAAAAAAAAADVJldm9rZVNwZW5kZXIAAAAAAAAF", "AAAABAAAAAAAAAAAAAAADVZlcmlmaWVyRXJyb3IAAAAAAAADAAAAQ0luZGljYXRlcyBgY2lyY3VpdF90eXBlYCBhbHJlYWR5IGhhcyBhIHZlcmlmaWNhdGlvbiBrZXkgcmVnaXN0ZXJlZC4AAAAAIFZlcmlmaWNhdGlvbktleUFscmVhZHlSZWdpc3RlcmVkAAANSAAAAEFJbmRpY2F0ZXMgbm8gdmVyaWZpY2F0aW9uIGtleSBpcyByZWdpc3RlcmVkIHVuZGVyIGBjaXJjdWl0X3R5cGVgLgAAAAAAABxWZXJpZmljYXRpb25LZXlOb3RSZWdpc3RlcmVkAAANSQAAADJJbmRpY2F0ZXMgdGhlIHByb29mIGZhaWxlZCBVbHRyYUhvbmsgdmVyaWZpY2F0aW9uLgAAAAAADEludmFsaWRQcm9vZgAADUo=", "AAAABQAAADFFdmVudCBlbWl0dGVkIHdoZW4gYSB2ZXJpZmljYXRpb24ga2V5IGlzIHVwZGF0ZWQuAAAAAAAAAAAAABZWZXJpZmljYXRpb25LZXlVcGRhdGVkAAAAAAABAAAAGHZlcmlmaWNhdGlvbl9rZXlfdXBkYXRlZAAAAAMAAAAAAAAADGNpcmN1aXRfdHlwZQAAB9AAAAALQ2lyY3VpdFR5cGUAAAAAAQAAAAAAAAAUb2xkX3ZlcmlmaWNhdGlvbl9rZXkAAAAOAAAAAAAAAAAAAAAUbmV3X3ZlcmlmaWNhdGlvbl9rZXkAAAAOAAAAAAAAAAI=", "AAAABQAAADhFdmVudCBlbWl0dGVkIHdoZW4gYSBuZXcgdmVyaWZpY2F0aW9uIGtleSBpcyByZWdpc3RlcmVkLgAAAAAAAAAZVmVyaWZpY2F0aW9uS2V5UmVnaXN0ZXJlZAAAAAAAAAEAAAAbdmVyaWZpY2F0aW9uX2tleV9yZWdpc3RlcmVkAAAAAAIAAAAAAAAADGNpcmN1aXRfdHlwZQAAB9AAAAALQ2lyY3VpdFR5cGUAAAAAAQAAAAAAAAAQdmVyaWZpY2F0aW9uX2tleQAAAA4AAAAAAAAAAg==", "AAAAAgAAACdTdG9yYWdlIGtleXMgZm9yIHRoZSB2ZXJpZmllciByZWdpc3RyeS4AAAAAAAAAABJWZXJpZmllclN0b3JhZ2VLZXkAAAAAAAEAAAABAAAAQk1hcHMgW2BDaXJjdWl0VHlwZWBdIHRvIGl0cyBzZXJpYWxpemVkIFVsdHJhSG9uayB2ZXJpZmljYXRpb24ga2V5LgAAAAAAD1ZlcmlmaWNhdGlvbktleQAAAAABAAAH0AAAAAtDaXJjdWl0VHlwZQA=", "AAAAAQAAAAAAAAAAAAAADk93bmVyVG9rZW5zS2V5AAAAAAACAAAAAAAAAAVpbmRleAAAAAAAAAQAAAAAAAAABW93bmVyAAAAAAAAEw==", "AAAAAgAAAFhTdG9yYWdlIGtleXMgZm9yIHRoZSBkYXRhIGFzc29jaWF0ZWQgd2l0aCB0aGUgZW51bWVyYWJsZSBleHRlbnNpb24gb2YKYE5vbkZ1bmdpYmxlVG9rZW5gAAAAAAAAABdORlRFbnVtZXJhYmxlU3RvcmFnZUtleQAAAAAFAAAAAAAAAAAAAAALVG90YWxTdXBwbHkAAAAAAQAAAAAAAAALT3duZXJUb2tlbnMAAAAAAQAAB9AAAAAOT3duZXJUb2tlbnNLZXkAAAAAAAEAAAAAAAAAEE93bmVyVG9rZW5zSW5kZXgAAAABAAAABAAAAAEAAAAAAAAADEdsb2JhbFRva2VucwAAAAEAAAAEAAAAAQAAAAAAAAARR2xvYmFsVG9rZW5zSW5kZXgAAAAAAAABAAAABA==", "AAAABQAAADFFdmVudCBlbWl0dGVkIHdoZW4gY29uc2VjdXRpdmUgdG9rZW5zIGFyZSBtaW50ZWQuAAAAAAAAAAAAAA9Db25zZWN1dGl2ZU1pbnQAAAAAAQAAABBjb25zZWN1dGl2ZV9taW50AAAAAwAAAAAAAAACdG8AAAAAABMAAAABAAAAAAAAAA1mcm9tX3Rva2VuX2lkAAAAAAAABAAAAAAAAAAAAAAAC3RvX3Rva2VuX2lkAAAAAAQAAAAAAAAAAg==", "AAAAAgAAAFlTdG9yYWdlIGtleXMgZm9yIHRoZSBkYXRhIGFzc29jaWF0ZWQgd2l0aCB0aGUgY29uc2VjdXRpdmUgZXh0ZW5zaW9uIG9mCmBOb25GdW5naWJsZVRva2VuYAAAAAAAAAAAAAAYTkZUQ29uc2VjdXRpdmVTdG9yYWdlS2V5AAAABAAAAAEAAAAAAAAACEFwcHJvdmFsAAAAAQAAAAQAAAABAAAAAAAAAAVPd25lcgAAAAAAAAEAAAAEAAAAAQAAAAAAAAAPT3duZXJzaGlwQnVja2V0AAAAAAEAAAAEAAAAAQAAAAAAAAALQnVybmVkVG9rZW4AAAAAAQAAAAQ=", "AAAABQAAACVFdmVudCBlbWl0dGVkIHdoZW4gYSB0b2tlbiBpcyBidXJuZWQuAAAAAAAAAAAAAARCdXJuAAAAAQAAAARidXJuAAAAAgAAAAAAAAAEZnJvbQAAABMAAAABAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAAAAAAAAg==", "AAAABQAAAChFdmVudCBlbWl0dGVkIHdoZW4gdG9rZW4gcm95YWx0eSBpcyBzZXQuAAAAAAAAAA9TZXRUb2tlblJveWFsdHkAAAAAAQAAABFzZXRfdG9rZW5fcm95YWx0eQAAAAAAAAMAAAAAAAAACHJlY2VpdmVyAAAAEwAAAAEAAAAAAAAACHRva2VuX2lkAAAABAAAAAEAAAAAAAAADGJhc2lzX3BvaW50cwAAAAQAAAAAAAAAAg==", "AAAABQAAACpFdmVudCBlbWl0dGVkIHdoZW4gZGVmYXVsdCByb3lhbHR5IGlzIHNldC4AAAAAAAAAAAARU2V0RGVmYXVsdFJveWFsdHkAAAAAAAABAAAAE3NldF9kZWZhdWx0X3JveWFsdHkAAAAAAgAAAAAAAAAIcmVjZWl2ZXIAAAATAAAAAQAAAAAAAAAMYmFzaXNfcG9pbnRzAAAABAAAAAAAAAAC", "AAAABQAAACxFdmVudCBlbWl0dGVkIHdoZW4gdG9rZW4gcm95YWx0eSBpcyByZW1vdmVkLgAAAAAAAAASUmVtb3ZlVG9rZW5Sb3lhbHR5AAAAAAABAAAAFHJlbW92ZV90b2tlbl9yb3lhbHR5AAAAAQAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAQAAAAI=", "AAAAAQAAAClTdG9yYWdlIGNvbnRhaW5lciBmb3Igcm95YWx0eSBpbmZvcm1hdGlvbgAAAAAAAAAAAAALUm95YWx0eUluZm8AAAAAAgAAAAAAAAAMYmFzaXNfcG9pbnRzAAAABAAAAAAAAAAIcmVjZWl2ZXIAAAAT", "AAAAAgAAAB1TdG9yYWdlIGtleXMgZm9yIHJveWFsdHkgZGF0YQAAAAAAAAAAAAAWTkZUUm95YWx0aWVzU3RvcmFnZUtleQAAAAAAAgAAAAAAAAAAAAAADkRlZmF1bHRSb3lhbHR5AAAAAAABAAAAAAAAAAxUb2tlblJveWFsdHkAAAABAAAABA==", "AAAABQAAACVFdmVudCBlbWl0dGVkIHdoZW4gYSB0b2tlbiBpcyBtaW50ZWQuAAAAAAAAAAAAAARNaW50AAAAAQAAAARtaW50AAAAAgAAAAAAAAACdG8AAAAAABMAAAABAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAAAAAAAAg==", "AAAABQAAACpFdmVudCBlbWl0dGVkIHdoZW4gYW4gYXBwcm92YWwgaXMgZ3JhbnRlZC4AAAAAAAAAAAAHQXBwcm92ZQAAAAABAAAAB2FwcHJvdmUAAAAABAAAAAAAAAAIYXBwcm92ZXIAAAATAAAAAQAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAQAAAAAAAAAIYXBwcm92ZWQAAAATAAAAAAAAAAAAAAARbGl2ZV91bnRpbF9sZWRnZXIAAAAAAAAEAAAAAAAAAAI=", "AAAABQAAACpFdmVudCBlbWl0dGVkIHdoZW4gYSB0b2tlbiBpcyB0cmFuc2ZlcnJlZC4AAAAAAAAAAAAIVHJhbnNmZXIAAAABAAAACHRyYW5zZmVyAAAAAwAAAAAAAAAEZnJvbQAAABMAAAABAAAAAAAAAAJ0bwAAAAAAEwAAAAEAAAAAAAAACHRva2VuX2lkAAAABAAAAAAAAAAC", "AAAABQAAADZFdmVudCBlbWl0dGVkIHdoZW4gYXBwcm92YWwgZm9yIGFsbCB0b2tlbnMgaXMgZ3JhbnRlZC4AAAAAAAAAAAANQXBwcm92ZUZvckFsbAAAAAAAAAEAAAAPYXBwcm92ZV9mb3JfYWxsAAAAAAMAAAAAAAAABW93bmVyAAAAAAAAEwAAAAEAAAAAAAAACG9wZXJhdG9yAAAAEwAAAAAAAAAAAAAAEWxpdmVfdW50aWxfbGVkZ2VyAAAAAAAABAAAAAAAAAAC", "AAAABAAAAAAAAAAAAAAAFU5vbkZ1bmdpYmxlVG9rZW5FcnJvcgAAAAAAAA8AAAAkSW5kaWNhdGVzIGEgbm9uLWV4aXN0ZW50IGB0b2tlbl9pZGAuAAAAEE5vbkV4aXN0ZW50VG9rZW4AAADIAAAAV0luZGljYXRlcyBhbiBlcnJvciByZWxhdGVkIHRvIHRoZSBvd25lcnNoaXAgb3ZlciBhIHBhcnRpY3VsYXIgdG9rZW4uClVzZWQgaW4gdHJhbnNmZXJzLgAAAAAOSW5jb3JyZWN0T3duZXIAAAAAAMkAAABFSW5kaWNhdGVzIGEgZmFpbHVyZSB3aXRoIHRoZSBgb3BlcmF0b3JgcyBhcHByb3ZhbC4gVXNlZCBpbiB0cmFuc2ZlcnMuAAAAAAAAFEluc3VmZmljaWVudEFwcHJvdmFsAAAAygAAAFVJbmRpY2F0ZXMgYSBmYWlsdXJlIHdpdGggdGhlIGBhcHByb3ZlcmAgb2YgYSB0b2tlbiB0byBiZSBhcHByb3ZlZC4gVXNlZAppbiBhcHByb3ZhbHMuAAAAAAAAD0ludmFsaWRBcHByb3ZlcgAAAADLAAAASkluZGljYXRlcyBhbiBpbnZhbGlkIHZhbHVlIGZvciBgbGl2ZV91bnRpbF9sZWRnZXJgIHdoZW4gc2V0dGluZwphcHByb3ZhbHMuAAAAAAAWSW52YWxpZExpdmVVbnRpbExlZGdlcgAAAAAAzAAAAClJbmRpY2F0ZXMgb3ZlcmZsb3cgd2hlbiBhZGRpbmcgdHdvIHZhbHVlcwAAAAAAAAxNYXRoT3ZlcmZsb3cAAADNAAAANkluZGljYXRlcyBhbGwgcG9zc2libGUgYHRva2VuX2lkYHMgYXJlIGFscmVhZHkgaW4gdXNlLgAAAAAAE1Rva2VuSURzQXJlRGVwbGV0ZWQAAAAAzgAAAEVJbmRpY2F0ZXMgYW4gaW52YWxpZCBhbW91bnQgdG8gYmF0Y2ggbWludCBpbiBgY29uc2VjdXRpdmVgIGV4dGVuc2lvbi4AAAAAAAANSW52YWxpZEFtb3VudAAAAAAAAM8AAAAzSW5kaWNhdGVzIHRoZSB0b2tlbiBkb2VzIG5vdCBleGlzdCBpbiBvd25lcidzIGxpc3QuAAAAABhUb2tlbk5vdEZvdW5kSW5Pd25lckxpc3QAAADQAAAAMkluZGljYXRlcyB0aGUgdG9rZW4gZG9lcyBub3QgZXhpc3QgaW4gZ2xvYmFsIGxpc3QuAAAAAAAZVG9rZW5Ob3RGb3VuZEluR2xvYmFsTGlzdAAAAAAAANEAAAAjSW5kaWNhdGVzIGFjY2VzcyB0byB1bnNldCBtZXRhZGF0YS4AAAAADVVuc2V0TWV0YWRhdGEAAAAAAADSAAAAQUluZGljYXRlcyB0aGUgbGVuZ3RoIG9mIHRoZSBiYXNlIFVSSSBleGNlZWRzIHRoZSBtYXhpbXVtIGFsbG93ZWQuAAAAAAAAFUJhc2VVcmlNYXhMZW5FeGNlZWRlZAAAAAAAANMAAABHSW5kaWNhdGVzIHRoZSByb3lhbHR5IGFtb3VudCBpcyBoaWdoZXIgdGhhbiAxMF8wMDAgKDEwMCUpIGJhc2lzIHBvaW50cy4AAAAAFEludmFsaWRSb3lhbHR5QW1vdW50AAAA1AAAAD1JbmRpY2F0ZXMgdGhlIGxlbmd0aCBvZiB0aGUgbmFtZSBleGNlZWRzIHRoZSBtYXhpbXVtIGFsbG93ZWQuAAAAAAAAEk5hbWVNYXhMZW5FeGNlZWRlZAAAAAAA1QAAAD9JbmRpY2F0ZXMgdGhlIGxlbmd0aCBvZiB0aGUgc3ltYm9sIGV4Y2VlZHMgdGhlIG1heGltdW0gYWxsb3dlZC4AAAAAFFN5bWJvbE1heExlbkV4Y2VlZGVkAAAA1g==", "AAAAAgAAAAAAAAAAAAAAF05GVFNlcXVlbnRpYWxTdG9yYWdlS2V5AAAAAAEAAAAAAAAAAAAAAA5Ub2tlbklkQ291bnRlcgAA", "AAAAAQAAACRTdG9yYWdlIGNvbnRhaW5lciBmb3IgdG9rZW4gbWV0YWRhdGEAAAAAAAAACE1ldGFkYXRhAAAAAwAAAAAAAAAIYmFzZV91cmkAAAAQAAAAAAAAAARuYW1lAAAAEAAAAAAAAAAGc3ltYm9sAAAAAAAQ", "AAAAAQAAAHZTdG9yYWdlIGNvbnRhaW5lciBmb3IgdGhlIHRva2VuIGZvciB3aGljaCBhbiBhcHByb3ZhbCBpcyBncmFudGVkCmFuZCB0aGUgbGVkZ2VyIG51bWJlciBhdCB3aGljaCB0aGlzIGFwcHJvdmFsIGV4cGlyZXMuAAAAAAAAAAAADEFwcHJvdmFsRGF0YQAAAAIAAAAAAAAACGFwcHJvdmVkAAAAEwAAAAAAAAARbGl2ZV91bnRpbF9sZWRnZXIAAAAAAAAE", "AAAAAgAAADxTdG9yYWdlIGtleXMgZm9yIHRoZSBkYXRhIGFzc29jaWF0ZWQgd2l0aCBgTm9uRnVuZ2libGVUb2tlbmAAAAAAAAAADU5GVFN0b3JhZ2VLZXkAAAAAAAAFAAAAAQAAAAAAAAAFT3duZXIAAAAAAAABAAAABAAAAAEAAAAAAAAAB0JhbGFuY2UAAAAAAQAAABMAAAABAAAAAAAAAAhBcHByb3ZhbAAAAAEAAAAEAAAAAQAAAAAAAAAOQXBwcm92YWxGb3JBbGwAAAAAAAIAAAATAAAAEwAAAAAAAAAAAAAACE1ldGFkYXRh", "AAAABQAAADNFdmVudCBlbWl0dGVkIHdoZW4gYSBtb2R1bGUgaXMgYWRkZWQgdG8gY29tcGxpYW5jZS4AAAAAAAAAAAtNb2R1bGVBZGRlZAAAAAABAAAADG1vZHVsZV9hZGRlZAAAAAIAAAAAAAAABGhvb2sAAAfQAAAADkNvbXBsaWFuY2VIb29rAAAAAAABAAAAAAAAAAZtb2R1bGUAAAAAABMAAAAAAAAAAg==", "AAAAAgAABABEZXNjcmliZXMgd2hvIGluaXRpYXRlZCBhIHRyYW5zZmVyIGFuZCB1bmRlciB3aGF0IGF1dGhvcml0eSwgc28gZWFjaApjb21wbGlhbmNlIG1vZHVsZSBjYW4gZGVjaWRlIHdoZXRoZXIgaXRzIHBvbGljeSBhcHBsaWVzLgoKUHJpdmlsZWdlZCBvcGVyYXRpb25zIChgZm9yY2VkX3RyYW5zZmVyYCwgYHJlY292ZXJfYmFsYW5jZWApIGRlbGliZXJhdGVseQpieXBhc3MgaW52ZXN0b3ItZmFjaW5nIHBvbGljeTogYSBzYW5jdGlvbnMgcnVsZSBzaG91bGQgbm90IGJsb2NrIGEKY291cnQtb3JkZXJlZCBzZWl6dXJlIG9yIGFuIGFjY291bnQgcmVjb3ZlcnkgdGhlIGFkbWluIGlzIGNvbnNjaW91c2x5CmV4ZWN1dGluZy4gQXQgdGhlIHNhbWUgdGltZSwgYm9va2tlZXBpbmcgbW9kdWxlcyBtdXN0IHN0aWxsIG9ic2VydmUgdGhlCm1vdmVtZW50IG9yIHRoZWlyIHJlY29yZHMgZHJpZnQgZnJvbSByZWFsaXR5LiBQYXNzaW5nIHRoZSBraW5kIGludG8gdGhlCmhvb2sgbWFrZXMgdGhhdCBkZWNpc2lvbiBleHBsaWNpdCBhbmQgcGVyLW1vZHVsZTogYSBwb2xpY3kgbW9kdWxlIGV4ZW1wdHMKdGhlIHByaXZpbGVnZWQga2luZHMgZnJvbSBpdHMgY2hlY2tzLCB3aGlsZSBhbiBhY2NvdW50aW5nIG1vZHVsZSB1cGRhdGVzCml0cyBib29rcyBmb3IgZXZlcnkga2luZC4KClRoZSB0d28gcHJpdmlsZWdlZCBraW5kcyBkaWZmZXIgaW4gd2hhdCBoYXBwZW5zIHRvIHRoZSB0b2tlbnMuIEEKW2BUcmFuc2ZlcktpbmQ6OkZvcmNlZGBdIHRyYW5zZmVyIGlzIGEgc2VpenVyZTogdGhlIHRva2VucyBsZWF2ZSB0aGUKaG9sZGVyLCBzbyB3YWxsZXQtYm91bmQgbW9kdWxlIHN0YXRlIChlLmcuIGEgbG9jayBzY2hlZHVsZSkgaXMgY29uc3VtZWQKYWxvbmcgd2l0aCB0aGVtLiBBIFtgVHJhbnNmZXJLaW5kOjpSZWNvdmVyeWBdIHRyYW5zZmVyIGlzIGEgd2FsbGV0Cm1pZ3JhdGlvbjogdGhlIHNhbWUgaW52ZXN0b3IgY29udGludWVzIG9uIGEgbmV3IHdhbGxldCwgc28gd2FsbGV0LWJvdW5kCnN0YXRlIHNob3VsZCBtb3ZlIHRvIHRoAAAAAAAAAAxUcmFuc2ZlcktpbmQAAAAEAAAAAAAAACBUaGUgaG9sZGVyIG1vdmVzIGl0cyBvd24gdG9rZW5zLgAAAAhTdGFuZGFyZAAAAAEAAABhQSBkZWxlZ2F0ZSBtb3ZlcyB0aGUgaG9sZGVyJ3MgdG9rZW5zIHZpYSBgdHJhbnNmZXJfZnJvbWA7IGNhcnJpZXMgdGhlCmRlbGVnYXRlIChzcGVuZGVyKSBhZGRyZXNzLgAAAAAAAAlEZWxlZ2F0ZWQAAAAAAAABAAAAEwAAAAAAAAEHQSBwcml2aWxlZ2VkIG9wZXJhdGlvbiBzZWl6ZXMgdGhlIHRva2VucyAoYGZvcmNlZF90cmFuc2ZlcmApOiB0aGUKdG9rZW5zIGxlYXZlIHRoZSBob2xkZXIgZm9yIGFub3RoZXIgcGFydHkuIFBvbGljeSBtb2R1bGVzIHNob3VsZApnZW5lcmFsbHkgZXhlbXB0IHRoaXMga2luZDsgYm9va2tlZXBpbmcgbXVzdCBzdGlsbCBiZSBhcHBsaWVkLCBhbmQKd2FsbGV0LWJvdW5kIHJlc3RyaWN0aW9ucyBhcmUgY29uc3VtZWQgd2l0aCB0aGUgZGVwYXJ0aW5nIHRva2Vucy4AAAAABkZvcmNlZAAAAAAAAAAAARdBIHByaXZpbGVnZWQgb3BlcmF0aW9uIG1pZ3JhdGVzIGEgbG9zdCB3YWxsZXQncyBiYWxhbmNlIHRvIHRoZSBzYW1lCmludmVzdG9yJ3MgbmV3IHdhbGxldCAoYHJlY292ZXJfYmFsYW5jZWApLiBQb2xpY3kgbW9kdWxlcyBzaG91bGQKZ2VuZXJhbGx5IGV4ZW1wdCB0aGlzIGtpbmQ7IGJvb2trZWVwaW5nIG11c3Qgc3RpbGwgYmUgYXBwbGllZCwgYW5kCndhbGxldC1ib3VuZCBzdGF0ZSAoZS5nLiBsb2NrIHNjaGVkdWxlcykgc2hvdWxkIG1vdmUgdG8gdGhlCmRlc3RpbmF0aW9uIHdhbGxldC4AAAAACFJlY292ZXJ5", "AAAABQAAADdFdmVudCBlbWl0dGVkIHdoZW4gYSBtb2R1bGUgaXMgcmVtb3ZlZCBmcm9tIGNvbXBsaWFuY2UuAAAAAAAAAAANTW9kdWxlUmVtb3ZlZAAAAAAAAAEAAAAObW9kdWxlX3JlbW92ZWQAAAAAAAIAAAAAAAAABGhvb2sAAAfQAAAADkNvbXBsaWFuY2VIb29rAAAAAAABAAAAAAAAAAZtb2R1bGUAAAAAABMAAAAAAAAAAg==", "AAAAAgAAAUVIb29rIHR5cGVzIGZvciBtb2R1bGFyIGNvbXBsaWFuY2Ugc3lzdGVtLgoKT25lIGhvb2sgZXhpc3RzIHBlciB0b2tlbiBvcGVyYXRpb24sIGludm9rZWQgYWZ0ZXIgdGhlIG9wZXJhdGlvbidzIHN0YXRlCmNoYW5nZXMgYXJlIGFwcGxpZWQgYnV0IHdpdGhpbiB0aGUgc2FtZSB0cmFuc2FjdGlvbi4gQSBtb2R1bGUgZW5mb3JjZXMgaXRzCnBvbGljeSBieSBwYW5pY2tpbmcgZnJvbSB0aGUgaG9vaywgd2hpY2ggcmV2ZXJ0cyB0aGUgZW50aXJlIG9wZXJhdGlvbgphdG9taWNhbGx5LCBhbmQgcmVjb3JkcyB3aGF0ZXZlciBib29ra2VlcGluZyBpdCBuZWVkcyBvdGhlcndpc2UuAAAAAAAAAAAAAA5Db21wbGlhbmNlSG9vawAAAAAAAwAAAAAAAAC3Q2FsbGVkIHdoZW4gdG9rZW5zIGFyZSB0cmFuc2ZlcnJlZCBmcm9tIG9uZSB3YWxsZXQgdG8gYW5vdGhlci4KTW9kdWxlcyByZWdpc3RlcmVkIGZvciB0aGlzIGhvb2sgY2FuIHJlamVjdCB0aGUgdHJhbnNmZXIgKGJ5CnBhbmlja2luZykgYW5kIHVwZGF0ZSB0aGVpciBzdGF0ZSBiYXNlZCBvbiB0cmFuc2ZlciBldmVudHMuAAAAAAtUcmFuc2ZlcnJlZAAAAAAAAAAApkNhbGxlZCB3aGVuIHRva2VucyBhcmUgY3JlYXRlZC9taW50ZWQgdG8gYSB3YWxsZXQuIE1vZHVsZXMgcmVnaXN0ZXJlZApmb3IgdGhpcyBob29rIGNhbiByZWplY3QgdGhlIG1pbnQgKGJ5IHBhbmlja2luZykgYW5kIHVwZGF0ZSB0aGVpcgpzdGF0ZSBiYXNlZCBvbiBtaW50aW5nIGV2ZW50cy4AAAAAAAdDcmVhdGVkAAAAAAAAAACqQ2FsbGVkIHdoZW4gdG9rZW5zIGFyZSBkZXN0cm95ZWQvYnVybmVkIGZyb20gYSB3YWxsZXQuIE1vZHVsZXMKcmVnaXN0ZXJlZCBmb3IgdGhpcyBob29rIGNhbiByZWplY3QgdGhlIGJ1cm4gKGJ5IHBhbmlja2luZykgYW5kIHVwZGF0ZQp0aGVpciBzdGF0ZSBiYXNlZCBvbiBidXJuaW5nIGV2ZW50cy4AAAAAAAlEZXN0cm95ZWQAAAA=", "AAAAAQAAArFBIHBvaW50LWluLXRpbWUgdmlldyBvZiBvbmUgYWNjb3VudCwgY2FwdHVyZWQgYXMgb2YgKmJlZm9yZSogdGhlIG9wZXJhdGlvbgp0aGF0IHRyaWdnZXJlZCB0aGUgaG9vay4KClNvcm9iYW4gZm9yYmlkcyByZWVudHJhbmN5LCBhbmQgdGhlIHRva2VuIGNvbnRyYWN0IGlzIHN0aWxsIG9uIHRoZSBjYWxsCnN0YWNrIHdoaWxlIGEgaG9vayBydW5zLCBzbyBhIG1vZHVsZSBjYW5ub3QgY2FsbCBiYWNrIGludG8gdGhlIHRva2VuIHRvCnJlYWQgYSBiYWxhbmNlLiBUaGUgc25hcHNob3QgY2FycmllcyB0aGF0IHN0YXRlIGludG8gdGhlIGhvb2sgaW5zdGVhZCwgc28gYQptb2R1bGUgY2FuIHJlYXNvbiBhYm91dCBhIHdhbGxldCdzIGhvbGRpbmdzIHdpdGhvdXQgYSBiYWxhbmNlIG1pcnJvciBvZiBpdHMKb3duLgoKYGJhbGFuY2VgIGFuZCBgZnJvemVuYCBhcmUgbWVhc3VyZWQgYXQgdGhlIHNhbWUgaW5zdGFudCwgYmVmb3JlIHRoZQpvcGVyYXRpb24gaXMgYXBwbGllZC4gYGJhbGFuY2UgLSBmcm96ZW5gIGlzIHRoZSB3YWxsZXQncyBmcmVlIChtb3ZhYmxlKQphbW91bnQuIFRoZSBob29rcyBydW4gYWZ0ZXIgdGhlIG9wZXJhdGlvbidzIHN0YXRlIGNoYW5nZXMsIHNvIHRoZSBzbmFwc2hvdAppcyB3aGF0IGdpdmVzIGEgbW9kdWxlIGEgc3RhYmxlIHByZS1vcGVyYXRpb24gdmlldyB0byB2YWxpZGF0ZSBhZ2FpbnN0LgAAAAAAAAAAAAAPQWNjb3VudFNuYXBzaG90AAAAAAMAAAArVGhlIHdhbGxldCBhZGRyZXNzIHRoaXMgc25hcHNob3QgZGVzY3JpYmVzLgAAAAAHYWRkcmVzcwAAAAATAAAAN1RoZSB3YWxsZXQncyB0b3RhbCB0b2tlbiBiYWxhbmNlLCBiZWZvcmUgdGhlIG9wZXJhdGlvbi4AAAAAB2JhbGFuY2UAAAAACwAAAEBUaGUgcGFydGlhbGx5LWZyb3plbiBwb3J0aW9uIG9mIGBiYWxhbmNlYCwgYmVmb3JlIHRoZSBvcGVyYXRpb24uAAAABmZyb3plbgAAAAAACw==", "AAAABAAAAAAAAAAAAAAAD0NvbXBsaWFuY2VFcnJvcgAAAAAEAAAAN0luZGljYXRlcyBhIG1vZHVsZSBpcyBhbHJlYWR5IHJlZ2lzdGVyZWQgZm9yIHRoaXMgaG9vay4AAAAAF01vZHVsZUFscmVhZHlSZWdpc3RlcmVkAAAAAWgAAAAzSW5kaWNhdGVzIGEgbW9kdWxlIGlzIG5vdCByZWdpc3RlcmVkIGZvciB0aGlzIGhvb2suAAAAABNNb2R1bGVOb3RSZWdpc3RlcmVkAAAAAWkAAAAlSW5kaWNhdGVzIGEgbW9kdWxlIGJvdW5kIGlzIGV4Y2VlZGVkLgAAAAAAABNNb2R1bGVCb3VuZEV4Y2VlZGVkAAAAAWoAAAA7SW5kaWNhdGVzIGEgdG9rZW4gaXMgbm90IGJvdW5kIHRvIHRoaXMgY29tcGxpYW5jZSBjb250cmFjdC4AAAAADVRva2VuTm90Qm91bmQAAAAAAAFr", "AAAABQAAAEhFbWl0dGVkIHdoZW4gdGhlIHBlci1pZGVudGl0eSBtYXhpbXVtIGJhbGFuY2UgZm9yIGEgdG9rZW4gaXMgY29uZmlndXJlZC4AAAAAAAAADU1heEJhbGFuY2VTZXQAAAAAAAABAAAAD21heF9iYWxhbmNlX3NldAAAAAACAAAAAAAAAAV0b2tlbgAAAAAAABMAAAABAAAAAAAAAANtYXgAAAAACwAAAAAAAAAC", "AAAABQAAAFhFbWl0dGVkIHdoZW4gYSB0cmFja2VkIGlkZW50aXR5IGJhbGFuY2UgaXMgcHJlLXNlZWRlZCBkdXJpbmcgdGhlCm1pZ3JhdGlvbiBwcmVzZXQgcGhhc2UuAAAAAAAAAA9JZEJhbGFuY2VQcmVzZXQAAAAAAQAAABFpZF9iYWxhbmNlX3ByZXNldAAAAAAAAAMAAAAAAAAABXRva2VuAAAAAAAAEwAAAAEAAAAAAAAACGlkZW50aXR5AAAAEwAAAAEAAAAAAAAAB2JhbGFuY2UAAAAACwAAAAAAAAAC", "AAAABQAAADdFbWl0dGVkIHdoZW4gdGhlIHByZXNldCBwaGFzZSBmb3IgYSB0b2tlbiBpcyBmaW5hbGl6ZWQuAAAAAAAAAAAPUHJlc2V0Q29tcGxldGVkAAAAAAEAAAAQcHJlc2V0X2NvbXBsZXRlZAAAAAEAAAAAAAAABXRva2VuAAAAAAAAEwAAAAEAAAAC", "AAAAAgAAAAAAAAAAAAAAFE1heEJhbGFuY2VTdG9yYWdlS2V5AAAAAwAAAAEAAABEUGVyLXRva2VuIGNhcCBvbiB0aGUgYWdncmVnYXRlIGJhbGFuY2UgYW55IHNpbmdsZSBpZGVudGl0eSBtYXkgaG9sZC4AAAAKTWF4QmFsYW5jZQAAAAAAAQAAABMAAAABAAAAP1Blci0odG9rZW4sIGlkZW50aXR5KSBhZ2dyZWdhdGUgYmFsYW5jZSB0cmFja2VkIGJ5IHRoaXMgbW9kdWxlLgAAAAAJSWRCYWxhbmNlAAAAAAAAAgAAABMAAAATAAAAAQAAAEdQZXItdG9rZW4gZmxhZyBpbmRpY2F0aW5nIHRoYXQgdGhlIHByZXNldCBtaWdyYXRpb24gcGhhc2UgaXMgZmluYWxpemVkLgAAAAAPUHJlc2V0Q29tcGxldGVkAAAAAAEAAAAT", "AAAABQAAADRFbWl0dGVkIHdoZW4gdGhlIHBlci10b2tlbiBzdXBwbHkgY2FwIGlzIGNvbmZpZ3VyZWQuAAAAAAAAAA5TdXBwbHlMaW1pdFNldAAAAAAAAQAAABBzdXBwbHlfbGltaXRfc2V0AAAAAgAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAQAAAAAAAAAFbGltaXQAAAAAAAALAAAAAAAAAAI=", "AAAABQAAADdFbWl0dGVkIHdoZW4gdGhlIHByZXNldCBwaGFzZSBmb3IgYSB0b2tlbiBpcyBmaW5hbGl6ZWQuAAAAAAAAAAAPUHJlc2V0Q29tcGxldGVkAAAAAAEAAAAQcHJlc2V0X2NvbXBsZXRlZAAAAAEAAAAAAAAABXRva2VuAAAAAAAAEwAAAAEAAAAC", "AAAABQAAAEBFbWl0dGVkIHdoZW5ldmVyIHRoZSB0cmFja2VkIHN1cHBseSBjb3VudGVyIGZvciBhIHRva2VuIGNoYW5nZXMuAAAAAAAAABJTdXBwbHlDb3VudFVwZGF0ZWQAAAAAAAEAAAAUc3VwcGx5X2NvdW50X3VwZGF0ZWQAAAACAAAAAAAAAAV0b2tlbgAAAAAAABMAAAABAAAAAAAAAAZzdXBwbHkAAAAAAAsAAAAAAAAAAg==", "AAAAAgAAAAAAAAAAAAAAFVN1cHBseUxpbWl0U3RvcmFnZUtleQAAAAAAAAMAAAABAAAAMFBlci10b2tlbiBjYXAgb24gdGhlIHRyYWNrZWQgY2lyY3VsYXRpbmcgc3VwcGx5LgAAAAtTdXBwbHlMaW1pdAAAAAABAAAAEwAAAAEAAAA7UGVyLXRva2VuIHJ1bm5pbmcgc3VwcGx5IGNvdW50ZXIgbWFpbnRhaW5lZCBieSB0aGlzIG1vZHVsZS4AAAAAC1N1cHBseUNvdW50AAAAAAEAAAATAAAAAQAAAEdQZXItdG9rZW4gZmxhZyBpbmRpY2F0aW5nIHRoYXQgdGhlIHByZXNldCBtaWdyYXRpb24gcGhhc2UgaXMgZmluYWxpemVkLgAAAAAPUHJlc2V0Q29tcGxldGVkAAAAAAEAAAAT", "AAAABQAAADFFbWl0dGVkIHdoZW4gYSBjb3VudHJ5IGlzIGFkZGVkIHRvIHRoZSBhbGxvd2xpc3QuAAAAAAAAAAAAAA5Db3VudHJ5QWxsb3dlZAAAAAAAAQAAAA9jb3VudHJ5X2FsbG93ZWQAAAAAAgAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAQAAAAAAAAAHY291bnRyeQAAAAAEAAAAAAAAAAI=", "AAAABQAAADVFbWl0dGVkIHdoZW4gYSBjb3VudHJ5IGlzIHJlbW92ZWQgZnJvbSB0aGUgYWxsb3dsaXN0LgAAAAAAAAAAAAAQQ291bnRyeVVuYWxsb3dlZAAAAAEAAAARY291bnRyeV91bmFsbG93ZWQAAAAAAAACAAAAAAAAAAV0b2tlbgAAAAAAABMAAAABAAAAAAAAAAdjb3VudHJ5AAAAAAQAAAAAAAAAAg==", "AAAAAgAAAAAAAAAAAAAAFkNvdW50cnlBbGxvd1N0b3JhZ2VLZXkAAAAAAAEAAAABAAAAMFBlci0odG9rZW4sIGNvdW50cnkpIGFsbG93bGlzdCBtZW1iZXJzaGlwIGVudHJ5LgAAAA5BbGxvd2VkQ291bnRyeQAAAAAAAgAAABMAAAAE", "AAAABQAAADtFbWl0dGVkIHdoZW4gYW4gYWRkcmVzcyBpcyBhZGRlZCB0byB0aGUgdHJhbnNmZXIgYWxsb3dsaXN0LgAAAAAAAAAAC1VzZXJBbGxvd2VkAAAAAAEAAAAMdXNlcl9hbGxvd2VkAAAAAgAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAQAAAAAAAAAEdXNlcgAAABMAAAAAAAAAAg==", "AAAABQAAAD9FbWl0dGVkIHdoZW4gYW4gYWRkcmVzcyBpcyByZW1vdmVkIGZyb20gdGhlIHRyYW5zZmVyIGFsbG93bGlzdC4AAAAAAAAAAA5Vc2VyRGlzYWxsb3dlZAAAAAAAAQAAAA91c2VyX2Rpc2FsbG93ZWQAAAAAAgAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAQAAAAAAAAAEdXNlcgAAABMAAAAAAAAAAg==", "AAAAAgAAAAAAAAAAAAAAF1RyYW5zZmVyQWxsb3dTdG9yYWdlS2V5AAAAAAEAAAABAAAALVBlci0odG9rZW4sIHVzZXIpIGFsbG93bGlzdCBtZW1iZXJzaGlwIGVudHJ5LgAAAAAAAAtBbGxvd2VkVXNlcgAAAAACAAAAEwAAABM=", "AAAABQAAADhFbWl0dGVkIHdoZW4gYSBjb3VudHJ5IGlzIGFkZGVkIHRvIHRoZSByZXN0cmljdGlvbiBsaXN0LgAAAAAAAAARQ291bnRyeVJlc3RyaWN0ZWQAAAAAAAABAAAAEmNvdW50cnlfcmVzdHJpY3RlZAAAAAAAAgAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAQAAAAAAAAAHY291bnRyeQAAAAAEAAAAAAAAAAI=", "AAAABQAAADxFbWl0dGVkIHdoZW4gYSBjb3VudHJ5IGlzIHJlbW92ZWQgZnJvbSB0aGUgcmVzdHJpY3Rpb24gbGlzdC4AAAAAAAAAE0NvdW50cnlVbnJlc3RyaWN0ZWQAAAAAAQAAABRjb3VudHJ5X3VucmVzdHJpY3RlZAAAAAIAAAAAAAAABXRva2VuAAAAAAAAEwAAAAEAAAAAAAAAB2NvdW50cnkAAAAABAAAAAAAAAAC", "AAAAAgAAAAAAAAAAAAAAGUNvdW50cnlSZXN0cmljdFN0b3JhZ2VLZXkAAAAAAAABAAAAAQAAADJQZXItKHRva2VuLCBjb3VudHJ5KSByZXN0cmljdGlvbiBtZW1iZXJzaGlwIGVudHJ5LgAAAAAAEVJlc3RyaWN0ZWRDb3VudHJ5AAAAAAAAAgAAABMAAAAE", "AAAABQAAADlFbWl0dGVkIHdoZW4gdGhlIGxvY2t1cCBwZXJpb2QgZm9yIGEgdG9rZW4gaXMgY29uZmlndXJlZC4AAAAAAAAAAAAAD0xvY2t1cFBlcmlvZFNldAAAAAABAAAAEWxvY2t1cF9wZXJpb2Rfc2V0AAAAAAAAAgAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAQAAAAAAAAAGcGVyaW9kAAAAAAAEAAAAAAAAAAI=", "AAAABQAAADdFbWl0dGVkIHdoZW4gdGhlIHByZXNldCBwaGFzZSBmb3IgYSB0b2tlbiBpcyBmaW5hbGl6ZWQuAAAAAAAAAAAPUHJlc2V0Q29tcGxldGVkAAAAAAEAAAAQcHJlc2V0X2NvbXBsZXRlZAAAAAEAAAAAAAAABXRva2VuAAAAAAAAEwAAAAEAAAAC", "AAAABQAAAE9FbWl0dGVkIHdoZW4gYSB3YWxsZXQncyBsb2NrcyBhcmUgcHJlLXNlZWRlZCBkdXJpbmcgdGhlIG1pZ3JhdGlvbiBwcmVzZXQKcGhhc2UuAAAAAAAAAAARTG9ja3VwU3RhdGVQcmVzZXQAAAAAAAABAAAAE2xvY2t1cF9zdGF0ZV9wcmVzZXQAAAAAAwAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAQAAAAAAAAAGd2FsbGV0AAAAAAATAAAAAQAAAAAAAAAMdG90YWxfbG9ja2VkAAAACwAAAAAAAAAC", "AAAAAQAAAGtBIHNpbmdsZSBtaW50LWNyZWF0ZWQgbG9jazogYGFtb3VudGAgdG9rZW5zIHRoYXQgcmVsZWFzZSBvbmNlIHRoZQpsZWRnZXIgc2VxdWVuY2UgcmVhY2hlcyBgcmVsZWFzZV9sZWRnZXJgLgAAAAAAAAAADExvY2tlZFRva2VucwAAAAIAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAOcmVsZWFzZV9sZWRnZXIAAAAAAAQ=", "AAAAAQAAAUxUaGUgbG9jayBlbnRyaWVzIHRyYWNrZWQgZm9yIG9uZSBgKHRva2VuLCB3YWxsZXQpYCBwYWlyLCB0b2dldGhlciB3aXRoCnRoZWlyIHJ1bm5pbmcgYWdncmVnYXRlLiBgdG90YWxfbG9ja2VkYCBhbHdheXMgZXF1YWxzIHRoZSBzdW0gb2YgdGhlCmBsb2Nrc2AgYW1vdW50cywgaW5jbHVkaW5nIGVudHJpZXMgd2hvc2UgcmVsZWFzZSB0aW1lIGhhcyBhbHJlYWR5CnBhc3NlZDogZXhwaXJlZCBlbnRyaWVzIGFyZSBjb25zdW1lZCBsYXppbHkgYnkgdHJhbnNmZXJzIGFuZCBidXJucyBhbmQKcHJ1bmVkIGJ5IHN1YnNlcXVlbnQgbWludHMsIG5vdCBieSB0aGUgcGFzc2FnZSBvZiB0aW1lLgAAAAAAAAANTG9ja2VkRGV0YWlscwAAAAAAAAIAAAAAAAAABWxvY2tzAAAAAAAD6gAAB9AAAAAMTG9ja2VkVG9rZW5zAAAAAAAAAAx0b3RhbF9sb2NrZWQAAAAL", "AAAAAgAAAAAAAAAAAAAAHUluaXRpYWxMb2NrdXBQZXJpb2RTdG9yYWdlS2V5AAAAAAAAAwAAAAEAAAA+UGVyLXRva2VuIGxvY2t1cCBkdXJhdGlvbiBpbiBsZWRnZXJzIGFwcGxpZWQgdG8gbWludGVkIHRva2Vucy4AAAAAAAxMb2NrdXBQZXJpb2QAAAABAAAAEwAAAAEAAAA1UGVyLSh0b2tlbiwgd2FsbGV0KSBsb2NrIGVudHJpZXMgYW5kIHRoZWlyIGFnZ3JlZ2F0ZS4AAAAAAAANTG9ja2VkRGV0YWlscwAAAAAAAAIAAAATAAAAEwAAAAEAAABHUGVyLXRva2VuIGZsYWcgaW5kaWNhdGluZyB0aGF0IHRoZSBwcmVzZXQgbWlncmF0aW9uIHBoYXNlIGlzCmZpbmFsaXplZC4AAAAAD1ByZXNldENvbXBsZXRlZAAAAAABAAAAEw==", "AAAABQAAADVFbWl0dGVkIHdoZW4gYSB0aW1lLXdpbmRvdyBsaW1pdCBpcyBhZGRlZCBvciB1cGRhdGVkLgAAAAAAAAAAAAAUVGltZVRyYW5zZmVyTGltaXRTZXQAAAABAAAAF3RpbWVfdHJhbnNmZXJfbGltaXRfc2V0AAAAAAMAAAAAAAAABXRva2VuAAAAAAAAEwAAAAEAAAAAAAAADmxpbWl0X2R1cmF0aW9uAAAAAAAEAAAAAAAAAAAAAAALbGltaXRfdmFsdWUAAAAACwAAAAAAAAAC", "AAAABQAAACxFbWl0dGVkIHdoZW4gYSB0aW1lLXdpbmRvdyBsaW1pdCBpcyByZW1vdmVkLgAAAAAAAAAYVGltZVRyYW5zZmVyTGltaXRSZW1vdmVkAAAAAQAAABt0aW1lX3RyYW5zZmVyX2xpbWl0X3JlbW92ZWQAAAAAAgAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAQAAAAAAAAAObGltaXRfZHVyYXRpb24AAAAAAAQAAAAAAAAAAg==", "AAAAAQAAASBBIHNpbmdsZSB0aW1lLXdpbmRvdyBsaW1pdCBjb25maWd1cmVkIGZvciBhIHRva2VuOiBhdCBtb3N0IGBsaW1pdF92YWx1ZWAKdG9rZW5zIG1heSBiZSBzZW50IHdpdGhpbiBhIHdpbmRvdyBsYXN0aW5nIGBsaW1pdF9kdXJhdGlvbmAgbGVkZ2Vycy4gQQp3aW5kb3cgb3BlbnMgd2l0aCB0aGUgZmlyc3QgdHJhbnNmZXIgYWZ0ZXIgdGhlIHByZXZpb3VzIG9uZSBlbGFwc2VkOwpwZXItaWRlbnRpdHkgY29uc3VtcHRpb24gYWdhaW5zdCB0aGUgY2FwIGlzIHRyYWNrZWQgYnkKW2BUcmFuc2ZlckNvdW50ZXJgXS4AAAAAAAAADVRyYW5zZmVyTGltaXQAAAAAAAACAAAAAAAAAA5saW1pdF9kdXJhdGlvbgAAAAAABAAAAAAAAAALbGltaXRfdmFsdWUAAAAACw==", "AAAAAQAAAbZUaGUgY3VtdWxhdGl2ZSB2b2x1bWUgb25lIGlkZW50aXR5IGhhcyBzZW50IHdpdGhpbiBpdHMgY3VycmVudGx5IGFjdGl2ZQp3aW5kb3c6IGB2YWx1ZWAgYWNjdW11bGF0ZXMgYWdhaW5zdCB0aGUgbWF0Y2hpbmcgW2BUcmFuc2ZlckxpbWl0YF0ncyBjYXAKdW50aWwgdGhlIGxlZGdlciBzZXF1ZW5jZSByZWFjaGVzIGBkZWFkbGluZWAgKHRoZSBtb21lbnQgdGhlIHdpbmRvdwplbmRzKSwgYWZ0ZXIgd2hpY2ggdGhlIG5leHQgdHJhbnNmZXIgcmVzdGFydHMgdGhlIGNvdW50ZXIgZm9yIGEgZnJlc2gKd2luZG93LgoKQW4gaWRlbnRpdHkgd2lsbC9tYXkgaGF2ZSBtdWx0aXBsZSBhY3RpdmUgY291bnRlcnMgYXQgb25jZSBpZgptdWx0aXBsZSBsaW1pdHMgYXJlIGNvbmZpZ3VyZWQgZm9yIHRoZSB0b2tlbiwgb25lIGZvciBlYWNoIGRpc3RpbmN0CndpbmRvdyBkdXJhdGlvbi4AAAAAAAAAAAAPVHJhbnNmZXJDb3VudGVyAAAAAAIAAAAAAAAACGRlYWRsaW5lAAAABAAAAAAAAAAFdmFsdWUAAAAAAAAL", "AAAAAQAAAEVTdG9yYWdlIGtleSBmaWVsZHMgZm9yIGEgcGVyLSh0b2tlbiwgaWRlbnRpdHksIHdpbmRvdykgY291bnRlciBlbnRyeS4AAAAAAAAAAAAAElRyYW5zZmVyQ291bnRlcktleQAAAAAAAwAAAAAAAAAIaWRlbnRpdHkAAAATAAAAAAAAAA5saW1pdF9kdXJhdGlvbgAAAAAABAAAAAAAAAAFdG9rZW4AAAAAAAAT", "AAAAAgAAAAAAAAAAAAAAHVRpbWVUcmFuc2ZlcnNMaW1pdHNTdG9yYWdlS2V5AAAAAAAAAgAAAAEAAAAwUGVyLXRva2VuIGxpc3Qgb2YgY29uZmlndXJlZCB0aW1lLXdpbmRvdyBsaW1pdHMuAAAABkxpbWl0cwAAAAAAAQAAABMAAAABAAAAOlBlci0odG9rZW4sIGlkZW50aXR5LCB3aW5kb3cpIGN1bXVsYXRpdmUgdHJhbnNmZXIgY291bnRlci4AAAAAAAdDb3VudGVyAAAAAAEAAAfQAAAAElRyYW5zZmVyQ291bnRlcktleQAA", "AAAABAAAAAAAAAAAAAAAFUNvbXBsaWFuY2VNb2R1bGVFcnJvcgAAAAAAABEAAAA8QW4gYW1vdW50IGFyZ3VtZW50IGlzIG5lZ2F0aXZlIHdoZW4gaXQgbXVzdCBiZSBub24tbmVnYXRpdmUuAAAADUludmFsaWRBbW91bnQAAAAAAAGGAAAAKkFyaXRobWV0aWMgb3ZlcmZsb3cgaW4gYSBjaGVja2VkIGFkZGl0aW9uLgAAAAAADE1hdGhPdmVyZmxvdwAAAYcAAAAuQXJpdGhtZXRpYyB1bmRlcmZsb3cgaW4gYSBjaGVja2VkIHN1YnRyYWN0aW9uLgAAAAAADU1hdGhVbmRlcmZsb3cAAAAAAAGIAAAAW0EgdHJhbnNmZXIgb3IgbWludCB3b3VsZCBwdXNoIGFuIGlkZW50aXR5J3MgYWdncmVnYXRlIGJhbGFuY2UgYWJvdmUgdGhlCmNvbmZpZ3VyZWQgbWF4aW11bS4AAAAAEk1heEJhbGFuY2VFeGNlZWRlZAAAAAABiQAAAEBBIG1pbnQgd291bGQgcHVzaCB0aGUgdHJhY2tlZCBzdXBwbHkgYWJvdmUgdGhlIGNvbmZpZ3VyZWQgbGltaXQuAAAAE1N1cHBseUxpbWl0RXhjZWVkZWQAAAABigAAAEtBIHByZXNldCBvcGVyYXRpb24gd2FzIGF0dGVtcHRlZCBhZnRlciB0aGUgcHJlc2V0IHBoYXNlIGhhcyBiZWVuCmZpbmFsaXplZC4AAAAAFlByZXNldEFscmVhZHlDb21wbGV0ZWQAAAAAAYsAAAA+VGhlIGlkZW50aXR5IHJlZ2lzdHJ5IHN0b3JhZ2UgYWRkcmVzcyBoYXMgbm90IGJlZW4gY29uZmlndXJlZC4AAAAAABZJZGVudGl0eVJlZ2lzdHJ5Tm90U2V0AAAAAAGMAAAAP1RoZSB0d28gcGFyYWxsZWwgYXJyYXlzIGluIGEgYmF0Y2ggY2FsbCBoYXZlIGRpZmZlcmVudCBsZW5ndGhzLgAAAAARQmF0Y2hTaXplTWlzbWF0Y2gAAAAAAAGNAAAAR05vIGF1dGhvcml6ZWQgY29tcGxpYW5jZSBkaXNwYXRjaGVyIGhhcyBiZWVuIGJvdW5kIGZvciB0aGUgZ2l2ZW4KdG9rZW4uAAAAABBDb21wbGlhbmNlTm90U2V0AAABjgAAAExBIHRyYW5zZmVyIG9yIGJ1cm4gd291bGQgY29uc3VtZSBtb3JlIHVubG9ja2VkIHRva2VucyB0aGFuIHRoZSBzZW5kZXIKaG9sZHMuAAAAG0luc3VmZmljaWVudFVubG9ja2VkQmFsYW5jZQAAAAGPAAAAY0EgdHJhbnNmZXIgd291bGQgcHVzaCB0aGUgc2VuZGVyIGlkZW50aXR5J3MgY3VtdWxhdGl2ZSB2b2x1bWUgYWJvdmUgYQpjb25maWd1cmVkIHRpbWUtd2luZG93IGxpbWl0LgAAAAAVVHJhbnNmZXJMaW1pdEV4Y2VlZGVkAAAAAAABkQAAAEJBZGRpbmcgYW5vdGhlciB0aW1lLXdpbmRvdyBsaW1pdCB3b3VsZCBleGNlZWQgdGhlIHBlci10b2tlbiBib3VuZC4AAAAAABJMaW1pdEJvdW5kRXhjZWVkZWQAAAAAAZIAAAA6Tm8gdGltZS13aW5kb3cgbGltaXQgZXhpc3RzIGZvciB0aGUgZ2l2ZW4gd2luZG93IGR1cmF0aW9uLgAAAAAADUxpbWl0Tm90Rm91bmQAAAAAAAGTAAAAOVRoZSB0cmFuc2ZlciByZWNpcGllbnQncyBjb3VudHJ5IGlzIG5vdCBvbiB0aGUgYWxsb3dsaXN0LgAAAAAAABFDb3VudHJ5Tm90QWxsb3dlZAAAAAAAAZQAAAA8VGhlIHRyYW5zZmVyIHJlY2lwaWVudCdzIGNvdW50cnkgaXMgb24gdGhlIHJlc3RyaWN0aW9uIGxpc3QuAAAAEUNvdW50cnlSZXN0cmljdGVkAAAAAAABlQAAACtOZWl0aGVyIHRyYW5zZmVyIHBhcnR5IGlzIG9uIHRoZSBhbGxvd2xpc3QuAAAAAA5Vc2VyTm90QWxsb3dlZAAAAAABlgAAAE9BIG1pbnQgb3IgcHJlc2V0IHdvdWxkIHB1c2ggYSB3YWxsZXQncyBsb2NrIGVudHJpZXMgYWJvdmUgdGhlCnBlci13YWxsZXQgYm91bmQuAAAAABFMb2NrQm91bmRFeGNlZWRlZAAAAAAAAZc=", "AAAAAgAAAAAAAAAAAAAAGkNvbXBsaWFuY2VNb2R1bGVTdG9yYWdlS2V5AAAAAAACAAAAAQAAAC5UaGUgSVJTIGNvbnRyYWN0IGFkZHJlc3MgZm9yIGEgc3BlY2lmaWMgdG9rZW4uAAAAAAAIUmVnaXN0cnkAAAABAAAAEwAAAAEAAAB9VGhlIGF1dGhvcml6ZWQgY29tcGxpYW5jZSBkaXNwYXRjaGVyIGZvciBhIHNwZWNpZmljIHRva2VuLiBVc2VkIGJ5CnN0YXRlLW11dGF0aW5nIG1vZHVsZXMgdG8gYXV0aGVudGljYXRlIHRoZWlyIGhvb2sgY2FsbGVycy4AAAAAAAAKQ29tcGxpYW5jZQAAAAAAAQAAABM=", "AAAAAgAAADFTdG9yYWdlIGtleXMgZm9yIHRoZSBtb2R1bGFyIGNvbXBsaWFuY2UgY29udHJhY3QuAAAAAAAAAAAAABFDb21wbGlhbmNlRGF0YUtleQAAAAAAAAEAAAABAAAAPE1hcHMgQ29tcGxpYW5jZUhvb2sgLT4gYFZlYzxBZGRyZXNzPmAgZm9yIHJlZ2lzdGVyZWQgbW9kdWxlcwAAAAtIb29rTW9kdWxlcwAAAAABAAAH0AAAAA5Db21wbGlhbmNlSG9vawAA", "AAAABAAAAC9FcnJvciBjb2RlcyBmb3IgZG9jdW1lbnQgbWFuYWdlbWVudCBvcGVyYXRpb25zLgAAAAAAAAAADURvY3VtZW50RXJyb3IAAAAAAAADAAAAJVRoZSBzcGVjaWZpZWQgZG9jdW1lbnQgd2FzIG5vdCBmb3VuZC4AAAAAAAAQRG9jdW1lbnROb3RGb3VuZAAAAXwAAAAtTWF4aW11bSBudW1iZXIgb2YgZG9jdW1lbnRzIGhhcyBiZWVuIHJlYWNoZWQuAAAAAAAAE01heERvY3VtZW50c1JlYWNoZWQAAAABfQAAACtUaGUgVVJJIGV4Y2VlZHMgdGhlIG1heGltdW0gYWxsb3dlZCBsZW5ndGguAAAAAApVcmlUb29Mb25nAAAAAAF+", "AAAABQAAAClFdmVudCBlbWl0dGVkIHdoZW4gYSBkb2N1bWVudCBpcyByZW1vdmVkLgAAAAAAAAAAAAAPRG9jdW1lbnRSZW1vdmVkAAAAAAEAAAAQZG9jdW1lbnRfcmVtb3ZlZAAAAAEAAAAAAAAABG5hbWUAAAPuAAAAIAAAAAEAAAAC", "AAAABQAAAD1FdmVudCBlbWl0dGVkIHdoZW4gYSBkb2N1bWVudCBpcyB1cGRhdGVkIChhZGRlZCBvciBtb2RpZmllZCkuAAAAAAAAAAAAAA9Eb2N1bWVudFVwZGF0ZWQAAAAAAQAAABBkb2N1bWVudF91cGRhdGVkAAAABAAAAAAAAAAEbmFtZQAAA+4AAAAgAAAAAQAAAAAAAAADdXJpAAAAABAAAAAAAAAAAAAAAA1kb2N1bWVudF9oYXNoAAAAAAAD7gAAACAAAAAAAAAAAAAAAAl0aW1lc3RhbXAAAAAAAAAGAAAAAAAAAAI=", "AAAAAQAAAChSZXByZXNlbnRzIGEgZG9jdW1lbnQgd2l0aCBpdHMgbWV0YWRhdGEuAAAAAAAAAAhEb2N1bWVudAAAAAMAAAAiVGhlIGhhc2ggb2YgdGhlIGRvY3VtZW50IGNvbnRlbnRzLgAAAAAADWRvY3VtZW50X2hhc2gAAAAAAAPuAAAAIAAAAC5UaW1lc3RhbXAgd2hlbiB0aGUgZG9jdW1lbnQgd2FzIGxhc3QgbW9kaWZpZWQuAAAAAAAJdGltZXN0YW1wAAAAAAAABgAAACtUaGUgVVJJIHdoZXJlIHRoZSBkb2N1bWVudCBjYW4gYmUgYWNjZXNzZWQuAAAAAAN1cmkAAAAAEA==", "AAAAAgAAACVTdG9yYWdlIGtleXMgZm9yIGRvY3VtZW50IG1hbmFnZW1lbnQuAAAAAAAAAAAAABJEb2N1bWVudFN0b3JhZ2VLZXkAAAAAAAMAAAABAAAAJ01hcHMgZG9jdW1lbnQgbmFtZSB0byBpdHMgZ2xvYmFsIGluZGV4LgAAAAAFSW5kZXgAAAAAAAABAAAD7gAAACAAAAABAAAAOU1hcHMgYnVja2V0IGluZGV4IHRvIGEgdmVjdG9yIG9mIChuYW1lLCBkb2N1bWVudCkgdHVwbGVzLgAAAAAAAAZCdWNrZXQAAAAAAAEAAAAEAAAAAAAAABlUb3RhbCBjb3VudCBvZiBkb2N1bWVudHMuAAAAAAAABUNvdW50AAAA", "AAAABQAAACVFdmVudCBlbWl0dGVkIHdoZW4gdG9rZW5zIGFyZSBidXJuZWQuAAAAAAAAAAAAAARCdXJuAAAAAQAAAARidXJuAAAAAgAAAAAAAAAEZnJvbQAAABMAAAABAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAg==", "AAAABQAAACVFdmVudCBlbWl0dGVkIHdoZW4gdG9rZW5zIGFyZSBtaW50ZWQuAAAAAAAAAAAAAARNaW50AAAAAQAAAARtaW50AAAAAgAAAAAAAAACdG8AAAAAABMAAAABAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAg==", "AAAABQAAAEFFdmVudCBlbWl0dGVkIHdoZW4gYSBrZXkgaXMgYWxsb3dlZCBmb3IgYSBzY2hlbWUgYW5kIGNsYWltIHRvcGljLgAAAAAAAAAAAAAKS2V5QWxsb3dlZAAAAAAAAQAAAAtrZXlfYWxsb3dlZAAAAAAEAAAAAAAAAApwdWJsaWNfa2V5AAAAAAAOAAAAAQAAAAAAAAAIcmVnaXN0cnkAAAATAAAAAAAAAAAAAAAGc2NoZW1lAAAAAAAEAAAAAAAAAAAAAAALY2xhaW1fdG9waWMAAAAABAAAAAAAAAAC", "AAAABQAAAEJFdmVudCBlbWl0dGVkIHdoZW4gYSBrZXkgaXMgcmVtb3ZlZCBmcm9tIGEgc2NoZW1lIGFuZCBjbGFpbSB0b3BpYy4AAAAAAAAAAAAKS2V5UmVtb3ZlZAAAAAAAAQAAAAtrZXlfcmVtb3ZlZAAAAAAEAAAAAAAAAApwdWJsaWNfa2V5AAAAAAAOAAAAAQAAAAAAAAAIcmVnaXN0cnkAAAATAAAAAAAAAAAAAAAGc2NoZW1lAAAAAAAEAAAAAAAAAAAAAAALY2xhaW1fdG9waWMAAAAABAAAAAAAAAAC", "AAAABQAAACZFdmVudCBlbWl0dGVkIHdoZW4gYSBjbGFpbSBpcyByZXZva2VkLgAAAAAAAAAAAAxDbGFpbVJldm9rZWQAAAABAAAADWNsYWltX3Jldm9rZWQAAAAAAAAEAAAAAAAAAAhpZGVudGl0eQAAABMAAAABAAAAAAAAAAtjbGFpbV90b3BpYwAAAAAEAAAAAQAAAAAAAAAHcmV2b2tlZAAAAAABAAAAAQAAAAAAAAAKY2xhaW1fZGF0YQAAAAAADgAAAAAAAAAC", "AAAABAAAAAAAAAAAAAAAEENsYWltSXNzdWVyRXJyb3IAAAAKAAAAOVNpZ25hdHVyZSBkYXRhIGxlbmd0aCBkb2VzIG5vdCBtYXRjaCB0aGUgZXhwZWN0ZWQgc2NoZW1lLgAAAAAAAA9TaWdEYXRhTWlzbWF0Y2gAAAABXgAAABpUaGUgcHJvdmlkZWQga2V5IGlzIGVtcHR5LgAAAAAACktleUlzRW1wdHkAAAAAAV8AAAAzVGhlIGtleSBpcyBhbHJlYWR5IGFsbG93ZWQgZm9yIHRoZSBzcGVjaWZpZWQgdG9waWMuAAAAABFLZXlBbHJlYWR5QWxsb3dlZAAAAAAAAWAAAAA0VGhlIHNwZWNpZmllZCBrZXkgd2FzIG5vdCBmb3VuZCBpbiB0aGUgYWxsb3dlZCBrZXlzLgAAAAtLZXlOb3RGb3VuZAAAAAFhAAAAT1RoZSBjbGFpbSBpc3N1ZXIgaXMgbm90IGFsbG93ZWQgdG8gc2lnbiBjbGFpbXMgYWJvdXQgdGhlIHNwZWNpZmllZApjbGFpbSB0b3BpYy4AAAAACk5vdEFsbG93ZWQAAAAAAWIAAAA+TWF4aW11bSBsaW1pdCBleGNlZWRlZCAoa2V5cyBwZXIgdG9waWMgb3IgcmVnaXN0cmllcyBwZXIga2V5KS4AAAAAAA1MaW1pdEV4Y2VlZGVkAAAAAAABYwAAADRObyBzaWduaW5nIGtleXMgZm91bmQgZm9yIHRoZSBzcGVjaWZpZWQgY2xhaW0gdG9waWMuAAAADk5vS2V5c0ZvclRvcGljAAAAAAFkAAAAHEludmFsaWQgY2xhaW0gZGF0YSBlbmNvZGluZy4AAAAaSW52YWxpZENsYWltRGF0YUV4cGlyYXRpb24AAAAAAWUAAAAsUmVjb3Zlcnkgb2YgdGhlIFNlY3AyNTZrMSBwdWJsaWMga2V5IGZhaWxlZC4AAAAXU2VjcDI1NmsxUmVjb3ZlcnlGYWlsZWQAAAABZgAAACpJbmRpY2F0ZXMgb3ZlcmZsb3cgd2hlbiBhZGRpbmcgdHdvIHZhbHVlcy4AAAAAAAxNYXRoT3ZlcmZsb3cAAAFn", "AAAABQAAAE5FdmVudCBlbWl0dGVkIHdoZW4gY2xhaW0gc2lnbmF0dXJlcyBhcmUgaW52YWxpZGF0ZWQgYnkgaW5jcmVtZW50aW5nIHRoZQpub25jZS4AAAAAAAAAAAAVU2lnbmF0dXJlc0ludmFsaWRhdGVkAAAAAAAAAQAAABZzaWduYXR1cmVzX2ludmFsaWRhdGVkAAAAAAADAAAAAAAAAAhpZGVudGl0eQAAABMAAAABAAAAAAAAAAtjbGFpbV90b3BpYwAAAAAEAAAAAQAAAAAAAAAFbm9uY2UAAAAAAAAEAAAAAAAAAAI=", "AAAAAQAAAAAAAAAAAAAAClNpZ25pbmdLZXkAAAAAAAIAAAAAAAAACnB1YmxpY19rZXkAAAAAAA4AAAAAAAAABnNjaGVtZQAAAAAABA==", "AAAAAQAAACJTaWduYXR1cmUgZGF0YSBmb3IgRWQyNTUxOSBzY2hlbWUuAAAAAAAAAAAAFEVkMjU1MTlTaWduYXR1cmVEYXRhAAAAAgAAAAAAAAAKcHVibGljX2tleQAAAAAD7gAAACAAAAAAAAAACXNpZ25hdHVyZQAAAAAAA+4AAABA", "AAAAAgAAAC1TdG9yYWdlIGtleXMgZm9yIGNsYWltIGlzc3VlciBrZXkgbWFuYWdlbWVudC4AAAAAAAAAAAAAFUNsYWltSXNzdWVyU3RvcmFnZUtleQAAAAAAAAQAAAABAAAAH01hcHMgVG9waWMgLT4gYFZlYzxTaWduaW5nS2V5PmAAAAAABlRvcGljcwAAAAAAAQAAAAQAAAABAAAAKU1hcHMgU2lnbmluZ0tleSAtPiBWZWM8KFRvcGljLCBSZWdpc3RyeSk+AAAAAAAABVBhaXJzAAAAAAAAAQAAB9AAAAAKU2lnbmluZ0tleQAAAAAAAQAAADBUcmFja3MgZXhwbGljaXRseSByZXZva2VkIGNsYWltcyBieSBjbGFpbSBkaWdlc3QAAAAMUmV2b2tlZENsYWltAAAAAQAAA+4AAAAgAAAAAQAAAD1UcmFja3MgY3VycmVudCBub25jZSBmb3IgYSBzcGVjaWZpYyBpZGVudGl0eSBhbmQgY2xhaW0gdG9waWNzAAAAAAAACkNsYWltTm9uY2UAAAAAAAIAAAATAAAABA==", "AAAAAQAAACRTaWduYXR1cmUgZGF0YSBmb3IgU2VjcDI1NmsxIHNjaGVtZS4AAAAAAAAAFlNlY3AyNTZrMVNpZ25hdHVyZURhdGEAAAAAAAMAAAAAAAAACnB1YmxpY19rZXkAAAAAA+4AAABBAAAAAAAAAAtyZWNvdmVyeV9pZAAAAAAEAAAAAAAAAAlzaWduYXR1cmUAAAAAAAPuAAAAQA==", "AAAAAQAAACRTaWduYXR1cmUgZGF0YSBmb3IgU2VjcDI1NnIxIHNjaGVtZS4AAAAAAAAAFlNlY3AyNTZyMVNpZ25hdHVyZURhdGEAAAAAAAIAAAAAAAAACnB1YmxpY19rZXkAAAAAA+4AAABBAAAAAAAAAAlzaWduYXR1cmUAAAAAAAPuAAAAQA==", "AAAABQAAACRFdmVudCBlbWl0dGVkIHdoZW4gYSBjbGFpbSBpcyBhZGRlZC4AAAAAAAAACkNsYWltQWRkZWQAAAAAAAEAAAALY2xhaW1fYWRkZWQAAAAAAQAAAAAAAAAFY2xhaW0AAAAAAAfQAAAABUNsYWltAAAAAAAAAQAAAAI=", "AAAABAAAAAAAAAAAAAAAC0NsYWltc0Vycm9yAAAAAAIAAAAZQ2xhaW0gIElEIGRvZXMgbm90IGV4aXN0LgAAAAAAAA1DbGFpbU5vdEZvdW5kAAAAAAABVAAAAGdDbGFpbSBJc3N1ZXIgY2Fubm90IHZhbGlkYXRlIHRoZSBjbGFpbSAocmV2b2NhdGlvbiwgc2lnbmF0dXJlIG1pc21hdGNoLAp1bmF1dGhvcml6ZWQgc2lnbmluZyBrZXksIGV0Yy4pAAAAAA1DbGFpbU5vdFZhbGlkAAAAAAABVQ==", "AAAABQAAACZFdmVudCBlbWl0dGVkIHdoZW4gYSBjbGFpbSBpcyBjaGFuZ2VkLgAAAAAAAAAAAAxDbGFpbUNoYW5nZWQAAAABAAAADWNsYWltX2NoYW5nZWQAAAAAAAABAAAAAAAAAAVjbGFpbQAAAAAAB9AAAAAFQ2xhaW0AAAAAAAABAAAAAg==", "AAAABQAAACZFdmVudCBlbWl0dGVkIHdoZW4gYSBjbGFpbSBpcyByZW1vdmVkLgAAAAAAAAAAAAxDbGFpbVJlbW92ZWQAAAABAAAADWNsYWltX3JlbW92ZWQAAAAAAAABAAAAAAAAAAVjbGFpbQAAAAAAB9AAAAAFQ2xhaW0AAAAAAAABAAAAAg==", "AAAAAQAAACNSZXByZXNlbnRzIGEgY2xhaW0gc3RvcmVkIG9uLWNoYWluLgAAAAAAAAAABUNsYWltAAAAAAAABgAAAA5UaGUgY2xhaW0gZGF0YQAAAAAABGRhdGEAAAAOAAAAH1RoZSBhZGRyZXNzIG9mIHRoZSBjbGFpbSBpc3N1ZXIAAAAABmlzc3VlcgAAAAAAEwAAABlUaGUgc2lnbmF0dXJlIHNjaGVtZSB1c2VkAAAAAAAABnNjaGVtZQAAAAAABAAAABtUaGUgY3J5cHRvZ3JhcGhpYyBzaWduYXR1cmUAAAAACXNpZ25hdHVyZQAAAAAAAA4AAAAkVGhlIGNsYWltIHRvcGljIChudW1lcmljIGlkZW50aWZpZXIpAAAABXRvcGljAAAAAAAABAAAACdPcHRpb25hbCBVUkkgZm9yIGFkZGl0aW9uYWwgaW5mb3JtYXRpb24AAAAAA3VyaQAAAAAQ", "AAAAAgAAADpTdG9yYWdlIGtleXMgZm9yIHRoZSBkYXRhIGFzc29jaWF0ZWQgd2l0aCBJZGVudGl0eSBDbGFpbXMuAAAAAAAAAAAAEENsYWltc1N0b3JhZ2VLZXkAAAACAAAAAQAAABtNYXBzIGNsYWltIElEIHRvIGNsYWltIGRhdGEAAAAABUNsYWltAAAAAAAAAQAAA+4AAAAgAAAAAQAAACFNYXBzIHRvcGljIHRvIHZlY3RvciBvZiBjbGFpbSBJRHMAAAAAAAANQ2xhaW1zQnlUb3BpYwAAAAAAAAEAAAAE", "AAAABQAAACpFdmVudCBlbWl0dGVkIHdoZW4gYSBjbGFpbSB0b3BpYyBpcyBhZGRlZC4AAAAAAAAAAAAPQ2xhaW1Ub3BpY0FkZGVkAAAAAAEAAAARY2xhaW1fdG9waWNfYWRkZWQAAAAAAAABAAAAAAAAAAtjbGFpbV90b3BpYwAAAAAEAAAAAQAAAAI=", "AAAABQAAACxFdmVudCBlbWl0dGVkIHdoZW4gYSBjbGFpbSB0b3BpYyBpcyByZW1vdmVkLgAAAAAAAAARQ2xhaW1Ub3BpY1JlbW92ZWQAAAAAAAABAAAAE2NsYWltX3RvcGljX3JlbW92ZWQAAAAAAQAAAAAAAAALY2xhaW1fdG9waWMAAAAABAAAAAEAAAAC", "AAAABQAAAC1FdmVudCBlbWl0dGVkIHdoZW4gYSB0cnVzdGVkIGlzc3VlciBpcyBhZGRlZC4AAAAAAAAAAAAAElRydXN0ZWRJc3N1ZXJBZGRlZAAAAAAAAQAAABR0cnVzdGVkX2lzc3Vlcl9hZGRlZAAAAAIAAAAAAAAADnRydXN0ZWRfaXNzdWVyAAAAAAATAAAAAQAAAAAAAAAMY2xhaW1fdG9waWNzAAAD6gAAAAQAAAAAAAAAAg==", "AAAABQAAAC1FdmVudCBlbWl0dGVkIHdoZW4gaXNzdWVyIHRvcGljcyBhcmUgdXBkYXRlZC4AAAAAAAAAAAAAE0lzc3VlclRvcGljc1VwZGF0ZWQAAAAAAQAAABVpc3N1ZXJfdG9waWNzX3VwZGF0ZWQAAAAAAAACAAAAAAAAAA50cnVzdGVkX2lzc3VlcgAAAAAAEwAAAAEAAAAAAAAADGNsYWltX3RvcGljcwAAA+oAAAAEAAAAAAAAAAI=", "AAAABQAAAC9FdmVudCBlbWl0dGVkIHdoZW4gYSB0cnVzdGVkIGlzc3VlciBpcyByZW1vdmVkLgAAAAAAAAAAFFRydXN0ZWRJc3N1ZXJSZW1vdmVkAAAAAQAAABZ0cnVzdGVkX2lzc3Vlcl9yZW1vdmVkAAAAAAABAAAAAAAAAA50cnVzdGVkX2lzc3VlcgAAAAAAEwAAAAEAAAAC", "AAAABAAAAAAAAAAAAAAAGkNsYWltVG9waWNzQW5kSXNzdWVyc0Vycm9yAAAAAAAHAAAAJUluZGljYXRlcyBhIG5vbi1leGlzdGVudCBjbGFpbSB0b3BpYy4AAAAAAAAWQ2xhaW1Ub3BpY0RvZXNOb3RFeGlzdAAAAAABcgAAAChJbmRpY2F0ZXMgYSBub24tZXhpc3RlbnQgdHJ1c3RlZCBpc3N1ZXIuAAAAEklzc3VlckRvZXNOb3RFeGlzdAAAAAABcwAAACdJbmRpY2F0ZXMgYSBjbGFpbSB0b3BpYyBhbHJlYWR5IGV4aXN0cy4AAAAAF0NsYWltVG9waWNBbHJlYWR5RXhpc3RzAAAAAXQAAAAqSW5kaWNhdGVzIGEgdHJ1c3RlZCBpc3N1ZXIgYWxyZWFkeSBleGlzdHMuAAAAAAATSXNzdWVyQWxyZWFkeUV4aXN0cwAAAAF1AAAALEluZGljYXRlcyBtYXggY2xhaW0gdG9waWNzIGxpbWl0IGlzIHJlYWNoZWQuAAAAGk1heENsYWltVG9waWNzTGltaXRSZWFjaGVkAAAAAAF2AAAAL0luZGljYXRlcyBtYXggdHJ1c3RlZCBpc3N1ZXJzIGxpbWl0IGlzIHJlYWNoZWQuAAAAABZNYXhJc3N1ZXJzTGltaXRSZWFjaGVkAAAAAAF3AAAAQ0luZGljYXRlcyBjbGFpbSB0b3BpY3Mgc2V0IHByb3ZpZGVkIGZvciB0aGUgaXNzdWVyIGNhbm5vdCBiZSBlbXB0eS4AAAAAG0NsYWltVG9waWNzU2V0Q2Fubm90QmVFbXB0eQAAAAF4", "AAAAAgAAAFBTdG9yYWdlIGtleXMgZm9yIHRoZSBkYXRhIGFzc29jaWF0ZWQgd2l0aCB0aGUgY2xhaW0gdG9waWNzIGFuZCBpc3N1ZXJzCmV4dGVuc2lvbgAAAAAAAAAfQ2xhaW1Ub3BpY3NBbmRJc3N1ZXJzU3RvcmFnZUtleQAAAAAEAAAAAAAAACBTdG9yZXMgdGhlIGNsYWltIHRvcGljcyByZWdpc3RyeQAAAAtDbGFpbVRvcGljcwAAAAAAAAAAI1N0b3JlcyB0aGUgdHJ1c3RlZCBpc3N1ZXJzIHJlZ2lzdHJ5AAAAAA5UcnVzdGVkSXNzdWVycwAAAAAAAQAAAD1TdG9yZXMgdGhlIGNsYWltIHRvcGljcyBhbGxvd2VkIGZvciBhIHNwZWNpZmljIHRydXN0ZWQgaXNzdWVyAAAAAAAAEUlzc3VlckNsYWltVG9waWNzAAAAAAAAAQAAABMAAAABAAAAPVN0b3JlcyB0aGUgdHJ1c3RlZCBpc3N1ZXJzIGFsbG93ZWQgZm9yIGEgc3BlY2lmaWMgY2xhaW0gdG9waWMAAAAAAAARQ2xhaW1Ub3BpY0lzc3VlcnMAAAAAAAABAAAABA==", "AAAABAAAADVFcnJvciBjb2RlcyBmb3IgdGhlIElkZW50aXR5IFJlZ2lzdHJ5IFN0b3JhZ2Ugc3lzdGVtLgAAAAAAAAAAAAAISVJTRXJyb3IAAAAJAAAAMUFuIGlkZW50aXR5IGFscmVhZHkgZXhpc3RzIGZvciB0aGUgZ2l2ZW4gYWNjb3VudC4AAAAAAAARSWRlbnRpdHlPdmVyd3JpdGUAAAAAAAFAAAAAKE5vIGlkZW50aXR5IGZvdW5kIGZvciB0aGUgZ2l2ZW4gYWNjb3VudC4AAAAQSWRlbnRpdHlOb3RGb3VuZAAAAUEAAAAuQ291bnRyeSBkYXRhIG5vdCBmb3VuZCBhdCB0aGUgc3BlY2lmaWVkIGluZGV4LgAAAAAAE0NvdW50cnlEYXRhTm90Rm91bmQAAAABQgAAAC9JZGVudGl0eSBjYW4ndCBiZSB3aXRoIGVtcHR5IGNvdW50cnkgZGF0YSBsaXN0LgAAAAAQRW1wdHlDb3VudHJ5TGlzdAAAAUMAAAA3VGhlIG1heGltdW0gbnVtYmVyIG9mIGNvdW50cnkgZW50cmllcyBoYXMgYmVlbiByZWFjaGVkLgAAAAAYTWF4Q291bnRyeUVudHJpZXNSZWFjaGVkAAABRAAAAC5BY2NvdW50IGhhcyBiZWVuIHJlY292ZXJlZCBhbmQgY2Fubm90IGJlIHVzZWQuAAAAAAAQQWNjb3VudFJlY292ZXJlZAAAAUUAAAA9TWV0YWRhdGEgaGFzIHRvbyBtYW55IGVudHJpZXMgKGV4Y2VlZHMgTUFYX01FVEFEQVRBX0VOVFJJRVMpLgAAAAAAABZNZXRhZGF0YVRvb01hbnlFbnRyaWVzAAAAAAFGAAAARE1ldGFkYXRhIHN0cmluZyB2YWx1ZSBpcyB0b28gbG9uZyAoZXhjZWVkcyBNQVhfTUVUQURBVEFfU1RSSU5HX0xFTikuAAAAFU1ldGFkYXRhU3RyaW5nVG9vTG9uZwAAAAAAAUcAAAA0VGhlIGFjY291bnQgc3RpbGwgaG9sZHMgYSBiYWxhbmNlIGluIGEgbGlua2VkIHRva2VuLgAAABFBY2NvdW50SGFzQmFsYW5jZQAAAAAAAUg=", "AAAABQAAADhFdmVudCBlbWl0dGVkIHdoZW4gYW4gaWRlbnRpdHkgaXMgc3RvcmVkIGZvciBhbiBhY2NvdW50LgAAAAAAAAAOSWRlbnRpdHlTdG9yZWQAAAAAAAEAAAAPaWRlbnRpdHlfc3RvcmVkAAAAAAIAAAAAAAAAB2FjY291bnQAAAAAEwAAAAEAAAAAAAAACGlkZW50aXR5AAAAEwAAAAEAAAAC", "AAAABQAAACpFdmVudCBlbWl0dGVkIGZvciBjb3VudHJ5IGRhdGEgb3BlcmF0aW9ucy4AAAAAAAAAAAAQQ291bnRyeURhdGFBZGRlZAAAAAEAAAASY291bnRyeV9kYXRhX2FkZGVkAAAAAAACAAAAAAAAAAdhY2NvdW50AAAAABMAAAABAAAAAAAAAAxjb3VudHJ5X2RhdGEAAAAAAAAAAAAAAAI=", "AAAABQAAADpFdmVudCBlbWl0dGVkIHdoZW4gYW4gaWRlbnRpdHkgaXMgcmVtb3ZlZCBmcm9tIGFuIGFjY291bnQuAAAAAAAAAAAAEElkZW50aXR5VW5zdG9yZWQAAAABAAAAEWlkZW50aXR5X3Vuc3RvcmVkAAAAAAAAAgAAAAAAAAAHYWNjb3VudAAAAAATAAAAAQAAAAAAAAAIaWRlbnRpdHkAAAATAAAAAQAAAAI=", "AAAABQAAAD5FdmVudCBlbWl0dGVkIHdoZW4gYW4gaWRlbnRpdHkgaXMgcmVjb3ZlcmVkIGZvciBhIG5ldyBhY2NvdW50LgAAAAAAAAAAABFJZGVudGl0eVJlY292ZXJlZAAAAAAAAAEAAAASaWRlbnRpdHlfcmVjb3ZlcmVkAAAAAAACAAAAAAAAAAtvbGRfYWNjb3VudAAAAAATAAAAAQAAAAAAAAALbmV3X2FjY291bnQAAAAAEwAAAAEAAAAC", "AAAABQAAAAAAAAAAAAAAEkNvdW50cnlEYXRhUmVtb3ZlZAAAAAAAAQAAABRjb3VudHJ5X2RhdGFfcmVtb3ZlZAAAAAIAAAAAAAAAB2FjY291bnQAAAAAEwAAAAEAAAAAAAAADGNvdW50cnlfZGF0YQAAAAAAAAAAAAAAAg==", "AAAABQAAAAAAAAAAAAAAE0NvdW50cnlEYXRhTW9kaWZpZWQAAAAAAQAAABVjb3VudHJ5X2RhdGFfbW9kaWZpZWQAAAAAAAACAAAAAAAAAAdhY2NvdW50AAAAABMAAAABAAAAAAAAAAxjb3VudHJ5X2RhdGEAAAAAAAAAAAAAAAI=", "AAAAAQAAAEhBIGNvdW50cnkgZGF0YSBjb250YWluaW5nIHRoZSBjb3VudHJ5IHJlbGF0aW9uc2hpcCBhbmQgb3B0aW9uYWwgbWV0YWRhdGEAAAAAAAAAC0NvdW50cnlEYXRhAAAAAAIAAAAcVHlwZSBvZiBjb3VudHJ5IHJlbGF0aW9uc2hpcAAAAAdjb3VudHJ5AAAAB9AAAAAPQ291bnRyeVJlbGF0aW9uAAAAADRPcHRpb25hbCBtZXRhZGF0YSAoZS5nLiwgdmlzYSB0eXBlLCB2YWxpZGl0eSBwZXJpb2QpAAAACG1ldGFkYXRhAAAD6AAAA+wAAAARAAAAEA==", "AAAAAgAAACZSZXByZXNlbnRzIHRoZSB0eXBlIG9mIGlkZW50aXR5IGhvbGRlcgAAAAAAAAAAAAxJZGVudGl0eVR5cGUAAAACAAAAAAAAAAAAAAAKSW5kaXZpZHVhbAAAAAAAAAAAAAAAAAAMT3JnYW5pemF0aW9u", "AAAAAgAAAERTdG9yYWdlIGtleXMgZm9yIHRoZSBkYXRhIGFzc29jaWF0ZWQgd2l0aCBJZGVudGl0eSBTdG9yYWdlIFJlZ2lzdHJ5LgAAAAAAAAANSVJTU3RvcmFnZUtleQAAAAAAAAMAAAABAAAAKE1hcHMgYWNjb3VudCBhZGRyZXNzIHRvIGlkZW50aXR5IGFkZHJlc3MAAAAISWRlbnRpdHkAAAABAAAAEwAAAAEAAAAwTWFwcyBhbiBhY2NvdW50IHRvIGl0cyBjb21wbGV0ZSBpZGVudGl0eSBwcm9maWxlAAAAD0lkZW50aXR5UHJvZmlsZQAAAAABAAAAEwAAAAEAAAAuTWFwcyBvbGQgYWNjb3VudCB0byBuZXcgYWNjb3VudCBhZnRlciByZWNvdmVyeQAAAAAAC1JlY292ZXJlZFRvAAAAAAEAAAAT", "AAAAAgAAAExVbmlmaWVkIGNvdW50cnkgcmVsYXRpb25zaGlwIHRoYXQgY2FuIGJlIGVpdGhlciBpbmRpdmlkdWFsIG9yIG9yZ2FuaXphdGlvbmFsAAAAAAAAAA9Db3VudHJ5UmVsYXRpb24AAAAAAgAAAAEAAAAAAAAACkluZGl2aWR1YWwAAAAAAAEAAAfQAAAAGUluZGl2aWR1YWxDb3VudHJ5UmVsYXRpb24AAAAAAAABAAAAAAAAAAxPcmdhbml6YXRpb24AAAABAAAH0AAAABtPcmdhbml6YXRpb25Db3VudHJ5UmVsYXRpb24A", "AAAAAQAAAENDb21wbGV0ZSBpZGVudGl0eSBwcm9maWxlIGNvbnRhaW5pbmcgaWRlbnRpdHkgdHlwZSBhbmQgY291bnRyeSBkYXRhAAAAAAAAAAAPSWRlbnRpdHlQcm9maWxlAAAAAAIAAAAAAAAACWNvdW50cmllcwAAAAAAA+oAAAfQAAAAC0NvdW50cnlEYXRhAAAAAAAAAAANaWRlbnRpdHlfdHlwZQAAAAAAB9AAAAAMSWRlbnRpdHlUeXBl", "AAAAAgAAAGNSZXByZXNlbnRzIGRpZmZlcmVudCB0eXBlcyBvZiBjb3VudHJ5IHJlbGF0aW9uc2hpcHMgZm9yIGluZGl2aWR1YWxzCklTTyAzMTY2LTEgbnVtZXJpYyBjb3VudHJ5IGNvZGUAAAAAAAAAABlJbmRpdmlkdWFsQ291bnRyeVJlbGF0aW9uAAAAAAAABQAAAAEAAAAUQ291bnRyeSBvZiByZXNpZGVuY2UAAAAJUmVzaWRlbmNlAAAAAAAAAQAAAAQAAAABAAAAFkNvdW50cnkgb2YgY2l0aXplbnNoaXAAAAAAAAtDaXRpemVuc2hpcAAAAAABAAAABAAAAAEAAAAdQ291bnRyeSB3aGVyZSBmdW5kcyBvcmlnaW5hdGUAAAAAAAANU291cmNlT2ZGdW5kcwAAAAAAAAEAAAAEAAAAAQAAAClUYXggcmVzaWRlbmN5IChjYW4gZGlmZmVyIGZyb20gcmVzaWRlbmNlKQAAAAAAAAxUYXhSZXNpZGVuY3kAAAABAAAABAAAAAEAAAApQ3VzdG9tIGNvdW50cnkgdHlwZSBmb3IgZnV0dXJlIGV4dGVuc2lvbnMAAAAAAAAGQ3VzdG9tAAAAAAACAAAAEQAAAAQ=", "AAAAAgAAAEVSZXByZXNlbnRzIGRpZmZlcmVudCB0eXBlcyBvZiBjb3VudHJ5IHJlbGF0aW9uc2hpcHMgZm9yIG9yZ2FuaXphdGlvbnMAAAAAAAAAAAAAG09yZ2FuaXphdGlvbkNvdW50cnlSZWxhdGlvbgAAAAAFAAAAAQAAACVDb3VudHJ5IG9mIGluY29ycG9yYXRpb24vcmVnaXN0cmF0aW9uAAAAAAAADUluY29ycG9yYXRpb24AAAAAAAABAAAABAAAAAEAAAAlQ291bnRyaWVzIHdoZXJlIG9yZ2FuaXphdGlvbiBvcGVyYXRlcwAAAAAAABVPcGVyYXRpbmdKdXJpc2RpY3Rpb24AAAAAAAABAAAABAAAAAEAAAAQVGF4IGp1cmlzZGljdGlvbgAAAA9UYXhKdXJpc2RpY3Rpb24AAAAAAQAAAAQAAAABAAAAHUNvdW50cnkgd2hlcmUgZnVuZHMgb3JpZ2luYXRlAAAAAAAADVNvdXJjZU9mRnVuZHMAAAAAAAABAAAABAAAAAEAAAApQ3VzdG9tIGNvdW50cnkgdHlwZSBmb3IgZnV0dXJlIGV4dGVuc2lvbnMAAAAAAAAGQ3VzdG9tAAAAAAACAAAAEQAAAAQ=", "AAAAAgAAADVTdG9yYWdlIGtleXMgZm9yIHRoZSBkYXRhIGFzc29jaWF0ZWQgd2l0aCBgUldBYCB0b2tlbgAAAAAAAAAAAAAaSWRlbnRpdHlWZXJpZmllclN0b3JhZ2VLZXkAAAAAAAIAAAAAAAAAKUNsYWltIFRvcGljcyBhbmQgSXNzdWVycyBjb250cmFjdCBhZGRyZXNzAAAAAAAAFUNsYWltVG9waWNzQW5kSXNzdWVycwAAAAAAAAAAAAAqSWRlbnRpdHkgUmVnaXN0cnkgU3RvcmFnZSBjb250cmFjdCBhZGRyZXNzAAAAAAAXSWRlbnRpdHlSZWdpc3RyeVN0b3JhZ2UA", "AAAABAAAAAAAAAAAAAAACFJXQUVycm9yAAAADAAAAEVJbmRpY2F0ZXMgYW4gZXJyb3IgcmVsYXRlZCB0byBpbnN1ZmZpY2llbnQgYmFsYW5jZSBmb3IgdGhlIG9wZXJhdGlvbi4AAAAAAAATSW5zdWZmaWNpZW50QmFsYW5jZQAAAAEsAAAALkluZGljYXRlcyBhbiBlcnJvciB3aGVuIGFuIGlucHV0IG11c3QgYmUgPj0gMC4AAAAAAAxMZXNzVGhhblplcm8AAAEtAAAAPkluZGljYXRlcyB0aGUgYWRkcmVzcyBpcyBmcm96ZW4gYW5kIGNhbm5vdCBwZXJmb3JtIG9wZXJhdGlvbnMuAAAAAAANQWRkcmVzc0Zyb3plbgAAAAAAAS4AAAA9SW5kaWNhdGVzIGluc3VmZmljaWVudCBmcmVlIHRva2VucyAoZHVlIHRvIHBhcnRpYWwgZnJlZXppbmcpLgAAAAAAABZJbnN1ZmZpY2llbnRGcmVlVG9rZW5zAAAAAAEvAAAAKUluZGljYXRlcyBhbiBpZGVudGl0eSBjYW5ub3QgYmUgdmVyaWZpZWQuAAAAAAAAGklkZW50aXR5VmVyaWZpY2F0aW9uRmFpbGVkAAAAAAEwAAAALUluZGljYXRlcyB0aGUgY29tcGxpYW5jZSBjb250cmFjdCBpcyBub3Qgc2V0LgAAAAAAABBDb21wbGlhbmNlTm90U2V0AAABMwAAACRJbmRpY2F0ZXMgdGhlIG9uY2hhaW4gSUQgaXMgbm90IHNldC4AAAAPT25jaGFpbklkTm90U2V0AAAAATQAAAAhSW5kaWNhdGVzIHRoZSB2ZXJzaW9uIGlzIG5vdCBzZXQuAAAAAAAADVZlcnNpb25Ob3RTZXQAAAAAAAE1AAAAO0luZGljYXRlcyB0aGUgY2xhaW0gdG9waWNzIGFuZCBpc3N1ZXJzIGNvbnRyYWN0IGlzIG5vdCBzZXQuAAAAABtDbGFpbVRvcGljc0FuZElzc3VlcnNOb3RTZXQAAAABNgAAADxJbmRpY2F0ZXMgdGhlIGlkZW50aXR5IHJlZ2lzdHJ5IHN0b3JhZ2UgY29udHJhY3QgaXMgbm90IHNldC4AAAAdSWRlbnRpdHlSZWdpc3RyeVN0b3JhZ2VOb3RTZXQAAAAAAAE3AAAANEluZGljYXRlcyB0aGUgaWRlbnRpdHkgdmVyaWZpZXIgY29udHJhY3QgaXMgbm90IHNldC4AAAAWSWRlbnRpdHlWZXJpZmllck5vdFNldAAAAAABOAAAAERJbmRpY2F0ZXMgdGhlIG9sZCBhY2NvdW50IGFuZCBuZXcgYWNjb3VudCBoYXZlIGRpZmZlcmVudCBpZGVudGl0aWVzLgAAABBJZGVudGl0eU1pc21hdGNoAAABOQ==", "AAAABQAAACVFdmVudCBlbWl0dGVkIHdoZW4gdG9rZW5zIGFyZSBmcm96ZW4uAAAAAAAAAAAAAAxUb2tlbnNGcm96ZW4AAAABAAAADXRva2Vuc19mcm96ZW4AAAAAAAACAAAAAAAAAAx1c2VyX2FkZHJlc3MAAAATAAAAAQAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAI=", "AAAABQAAADRFdmVudCBlbWl0dGVkIHdoZW4gYW4gYWRkcmVzcyBpcyBmcm96ZW4gb3IgdW5mcm96ZW4uAAAAAAAAAA1BZGRyZXNzRnJvemVuAAAAAAAAAQAAAA5hZGRyZXNzX2Zyb3plbgAAAAAAAgAAAAAAAAAMdXNlcl9hZGRyZXNzAAAAEwAAAAEAAAAAAAAACWlzX2Zyb3plbgAAAAAAAAEAAAABAAAAAg==", "AAAABQAAAC5FdmVudCBlbWl0dGVkIHdoZW4gY29tcGxpYW5jZSBjb250cmFjdCBpcyBzZXQuAAAAAAAAAAAADUNvbXBsaWFuY2VTZXQAAAAAAAABAAAADmNvbXBsaWFuY2Vfc2V0AAAAAAABAAAAAAAAAApjb21wbGlhbmNlAAAAAAATAAAAAQAAAAI=", "AAAABQAAACdFdmVudCBlbWl0dGVkIHdoZW4gdG9rZW5zIGFyZSB1bmZyb3plbi4AAAAAAAAAAA5Ub2tlbnNVbmZyb3plbgAAAAAAAQAAAA90b2tlbnNfdW5mcm96ZW4AAAAAAgAAAAAAAAAMdXNlcl9hZGRyZXNzAAAAEwAAAAEAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAC", "AAAABQAAACxFdmVudCBlbWl0dGVkIHdoZW4gYSByZWNvdmVyeSBpcyBzdWNjZXNzZnVsLgAAAAAAAAAPUmVjb3ZlcnlTdWNjZXNzAAAAAAEAAAAQcmVjb3Zlcnlfc3VjY2VzcwAAAAIAAAAAAAAAC29sZF9hY2NvdW50AAAAABMAAAABAAAAAAAAAAtuZXdfYWNjb3VudAAAAAATAAAAAQAAAAI=", "AAAABQAAADVFdmVudCBlbWl0dGVkIHdoZW4gaWRlbnRpdHkgdmVyaWZpZXIgY29udHJhY3QgaXMgc2V0LgAAAAAAAAAAAAATSWRlbnRpdHlWZXJpZmllclNldAAAAAABAAAAFWlkZW50aXR5X3ZlcmlmaWVyX3NldAAAAAAAAAEAAAAAAAAAEWlkZW50aXR5X3ZlcmlmaWVyAAAAAAAAEwAAAAEAAAAC", "AAAABQAAAC9FdmVudCBlbWl0dGVkIHdoZW4gdG9rZW4gb25jaGFpbiBJRCBpcyB1cGRhdGVkLgAAAAAAAAAAFVRva2VuT25jaGFpbklkVXBkYXRlZAAAAAAAAAEAAAAYdG9rZW5fb25jaGFpbl9pZF91cGRhdGVkAAAAAQAAAAAAAAAKb25jaGFpbl9pZAAAAAAAEwAAAAEAAAAC", "AAAABQAAADxFdmVudCBlbWl0dGVkIHdoZW4gY2xhaW0gdG9waWNzIGFuZCBpc3N1ZXJzIGNvbnRyYWN0IGlzIHNldC4AAAAAAAAAGENsYWltVG9waWNzQW5kSXNzdWVyc1NldAAAAAEAAAAcY2xhaW1fdG9waWNzX2FuZF9pc3N1ZXJzX3NldAAAAAEAAAAAAAAAGGNsYWltX3RvcGljc19hbmRfaXNzdWVycwAAABMAAAABAAAAAg==", "AAAABQAAAD1FdmVudCBlbWl0dGVkIHdoZW4gaWRlbnRpdHkgcmVnaXN0cnkgc3RvcmFnZSBjb250cmFjdCBpcyBzZXQuAAAAAAAAAAAAABpJZGVudGl0eVJlZ2lzdHJ5U3RvcmFnZVNldAAAAAAAAQAAAB1pZGVudGl0eV9yZWdpc3RyeV9zdG9yYWdlX3NldAAAAAAAAAEAAAAAAAAAGWlkZW50aXR5X3JlZ2lzdHJ5X3N0b3JhZ2UAAAAAAAATAAAAAQAAAAI=", "AAAABQAAADRFdmVudCBlbWl0dGVkIHdoZW4gYSB0b2tlbiBpcyBib3VuZCB0byB0aGUgY29udHJhY3QuAAAAAAAAAApUb2tlbkJvdW5kAAAAAAABAAAAC3Rva2VuX2JvdW5kAAAAAAEAAAAAAAAABXRva2VuAAAAAAAAEwAAAAEAAAAC", "AAAABQAAADhFdmVudCBlbWl0dGVkIHdoZW4gYSB0b2tlbiBpcyB1bmJvdW5kIGZyb20gdGhlIGNvbnRyYWN0LgAAAAAAAAAMVG9rZW5VbmJvdW5kAAAAAQAAAA10b2tlbl91bmJvdW5kAAAAAAAAAQAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAQAAAAI=", "AAAABAAAAChFcnJvciBjb2RlcyBmb3IgdGhlIFRva2VuIEJpbmRlciBzeXN0ZW0uAAAAAAAAABBUb2tlbkJpbmRlckVycm9yAAAABAAAADtUaGUgc3BlY2lmaWVkIHRva2VuIHdhcyBub3QgZm91bmQgaW4gdGhlIGJvdW5kIHRva2VucyBsaXN0LgAAAAANVG9rZW5Ob3RGb3VuZAAAAAAAAUoAAAAwQXR0ZW1wdGVkIHRvIGJpbmQgYSB0b2tlbiB0aGF0IGlzIGFscmVhZHkgYm91bmQuAAAAEVRva2VuQWxyZWFkeUJvdW5kAAAAAAABSwAAADNUb3RhbCB0b2tlbiBjYXBhY2l0eSAoTUFYX1RPS0VOUykgaGFzIGJlZW4gcmVhY2hlZC4AAAAAEE1heFRva2Vuc1JlYWNoZWQAAAFMAAAAHlRoZSBiYXRjaCBjb250YWlucyBkdXBsaWNhdGVzLgAAAAAAE0JpbmRCYXRjaER1cGxpY2F0ZXMAAAABTg==", "AAAAAgAAAUVTdG9yYWdlIGtleXMgZm9yIHRoZSB0b2tlbiBiaW5kZXIgc3lzdGVtLgoKQWxsIGJvdW5kIHRva2VuIGFkZHJlc3NlcyBhcmUga2VwdCBpbiBhIHNpbmdsZSBgVmVjPEFkZHJlc3M+YCBlbnRyeS4gV2l0aAp0aGUgY2FwYWNpdHkgY2FwcGVkIGF0IFtgTUFYX1RPS0VOU2BdLCB0aGUgZnVsbCBsaXN0IHN0YXlzIGEgZmV3IGtpbG9ieXRlcywKZmFyIGJlbG93IHRoZSBsZWRnZXIncyBwZXItZW50cnkgc2l6ZSBsaW1pdC4gV2hlbiBhIHRva2VuIGlzIHVuYm91bmQsIHRoZQpsYXN0IHRva2VuIGlzIG1vdmVkIHRvIGZpbGwgdGhlIGdhcCAoc3dhcC1yZW1vdmUgcGF0dGVybikuAAAAAAAAAAAAABVUb2tlbkJpbmRlclN0b3JhZ2VLZXkAAAAAAAABAAAAAAAAACZUaGUgbGlzdCBvZiBhbGwgYm91bmQgdG9rZW4gYWRkcmVzc2VzLgAAAAAABlRva2VucwAA", "AAAAAgAAADVTdG9yYWdlIGtleXMgZm9yIHRoZSBkYXRhIGFzc29jaWF0ZWQgd2l0aCBgUldBYCB0b2tlbgAAAAAAAAAAAAANUldBU3RvcmFnZUtleQAAAAAAAAYAAAABAAAAP0Zyb3plbiBzdGF0dXMgb2YgYW4gYWRkcmVzcyAodHJ1ZSA9IGZyb3plbiwgZmFsc2UgPSBub3QgZnJvemVuKQAAAAANQWRkcmVzc0Zyb3plbgAAAAAAAAEAAAATAAAAAQAAAC5BbW91bnQgb2YgdG9rZW5zIGZyb3plbiBmb3IgYSBzcGVjaWZpYyBhZGRyZXNzAAAAAAAMRnJvemVuVG9rZW5zAAAAAQAAABMAAAAAAAAAG0NvbXBsaWFuY2UgY29udHJhY3QgYWRkcmVzcwAAAAAKQ29tcGxpYW5jZQAAAAAAAAAAABpPbmNoYWluSUQgY29udHJhY3QgYWRkcmVzcwAAAAAACU9uY2hhaW5JZAAAAAAAAAAAAAAUVmVyc2lvbiBvZiB0aGUgdG9rZW4AAAAHVmVyc2lvbgAAAAAAAAAAIklkZW50aXR5IFZlcmlmaWVyIGNvbnRyYWN0IGFkZHJlc3MAAAAAABBJZGVudGl0eVZlcmlmaWVy", "AAAABQAAAEJFdmVudCBlbWl0dGVkIHdoZW4gdW5kZXJseWluZyBhc3NldHMgYXJlIGRlcG9zaXRlZCBpbnRvIHRoZSB2YXVsdC4AAAAAAAAAAAAHRGVwb3NpdAAAAAABAAAAB2RlcG9zaXQAAAAABQAAAAAAAAAIb3BlcmF0b3IAAAATAAAAAQAAAAAAAAAEZnJvbQAAABMAAAABAAAAAAAAAAhyZWNlaXZlcgAAABMAAAABAAAAAAAAAAZhc3NldHMAAAAAAAsAAAAAAAAAAAAAAAZzaGFyZXMAAAAAAAsAAAAAAAAAAg==", "AAAABQAAAENFdmVudCBlbWl0dGVkIHdoZW4gc2hhcmVzIGFyZSBleGNoYW5nZWQgYmFjayBmb3IgdW5kZXJseWluZyBhc3NldHMuAAAAAAAAAAAIV2l0aGRyYXcAAAABAAAACHdpdGhkcmF3AAAABQAAAAAAAAAIb3BlcmF0b3IAAAATAAAAAQAAAAAAAAAIcmVjZWl2ZXIAAAATAAAAAQAAAAAAAAAFb3duZXIAAAAAAAATAAAAAQAAAAAAAAAGYXNzZXRzAAAAAAALAAAAAAAAAAAAAAAGc2hhcmVzAAAAAAALAAAAAAAAAAI=", "AAAABAAAAAAAAAAAAAAAD1ZhdWx0VG9rZW5FcnJvcgAAAAALAAAANkluZGljYXRlcyBhY2Nlc3MgdG8gdW5pbml0aWFsaXplZCB2YXVsdCBhc3NldCBhZGRyZXNzLgAAAAAAF1ZhdWx0QXNzZXRBZGRyZXNzTm90U2V0AAAAAZAAAAAySW5kaWNhdGVzIHRoYXQgdmF1bHQgYXNzZXQgYWRkcmVzcyBpcyBhbHJlYWR5IHNldC4AAAAAABtWYXVsdEFzc2V0QWRkcmVzc0FscmVhZHlTZXQAAAABkQAAADxJbmRpY2F0ZXMgdGhhdCB2YXVsdCB2aXJ0dWFsIGRlY2ltYWxzIG9mZnNldCBpcyBhbHJlYWR5IHNldC4AAAAkVmF1bHRWaXJ0dWFsRGVjaW1hbHNPZmZzZXRBbHJlYWR5U2V0AAABkgAAADdJbmRpY2F0ZXMgdGhlIGFtb3VudCBpcyBub3QgYSB2YWxpZCB2YXVsdCBhc3NldHMgdmFsdWUuAAAAABhWYXVsdEludmFsaWRBc3NldHNBbW91bnQAAAGTAAAAN0luZGljYXRlcyB0aGUgYW1vdW50IGlzIG5vdCBhIHZhbGlkIHZhdWx0IHNoYXJlcyB2YWx1ZS4AAAAAGFZhdWx0SW52YWxpZFNoYXJlc0Ftb3VudAAAAZQAAABBQXR0ZW1wdGVkIHRvIGRlcG9zaXQgbW9yZSBhc3NldHMgdGhhbiB0aGUgbWF4IGFtb3VudCBmb3IgYWRkcmVzcy4AAAAAAAAXVmF1bHRFeGNlZWRlZE1heERlcG9zaXQAAAABlQAAAD5BdHRlbXB0ZWQgdG8gbWludCBtb3JlIHNoYXJlcyB0aGFuIHRoZSBtYXggYW1vdW50IGZvciBhZGRyZXNzLgAAAAAAFFZhdWx0RXhjZWVkZWRNYXhNaW50AAABlgAAAEJBdHRlbXB0ZWQgdG8gd2l0aGRyYXcgbW9yZSBhc3NldHMgdGhhbiB0aGUgbWF4IGFtb3VudCBmb3IgYWRkcmVzcy4AAAAAABhWYXVsdEV4Y2VlZGVkTWF4V2l0aGRyYXcAAAGXAAAAQEF0dGVtcHRlZCB0byByZWRlZW0gbW9yZSBzaGFyZXMgdGhhbiB0aGUgbWF4IGFtb3VudCBmb3IgYWRkcmVzcy4AAAAWVmF1bHRFeGNlZWRlZE1heFJlZGVlbQAAAAABmAAAACpNYXhpbXVtIG51bWJlciBvZiBkZWNpbWFscyBvZmZzZXQgZXhjZWVkZWQAAAAAAB5WYXVsdE1heERlY2ltYWxzT2Zmc2V0RXhjZWVkZWQAAAAAAZkAAAAxSW5kaWNhdGVzIG92ZXJmbG93IGR1ZSB0byBtYXRoZW1hdGljYWwgb3BlcmF0aW9ucwAAAAAAAAxNYXRoT3ZlcmZsb3cAAAGa", "AAAAAgAAAD1TdG9yYWdlIGtleXMgZm9yIHRoZSBkYXRhIGFzc29jaWF0ZWQgd2l0aCB0aGUgdmF1bHQgZXh0ZW5zaW9uAAAAAAAAAAAAAA9WYXVsdFN0b3JhZ2VLZXkAAAAAAgAAAAAAAAAyU3RvcmVzIHRoZSBhZGRyZXNzIG9mIHRoZSB2YXVsdCdzIHVuZGVybHlpbmcgYXNzZXQAAAAAAAxBc3NldEFkZHJlc3MAAAAAAAAAL1N0b3JlcyB0aGUgdmlydHVhbCBkZWNpbWFscyBvZmZzZXQgb2YgdGhlIHZhdWx0AAAAABVWaXJ0dWFsRGVjaW1hbHNPZmZzZXQAAAA=", "AAAAAgAAAB1TdG9yYWdlIGtleSBmb3IgdGhlIGNhcCB2YWx1ZQAAAAAAAAAAAAANQ2FwU3RvcmFnZUtleQAAAAAAAAEAAAAAAAAAAAAAAANDYXAA", "AAAABQAAACVFdmVudCBlbWl0dGVkIHdoZW4gdG9rZW5zIGFyZSBidXJuZWQuAAAAAAAAAAAAAARCdXJuAAAAAQAAAARidXJuAAAAAgAAAAAAAAAEZnJvbQAAABMAAAABAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAg==", "AAAABQAAADhFdmVudCBlbWl0dGVkIHdoZW4gYSB1c2VyIGlzIGFsbG93ZWQgdG8gdHJhbnNmZXIgdG9rZW5zLgAAAAAAAAALVXNlckFsbG93ZWQAAAAAAQAAAAx1c2VyX2FsbG93ZWQAAAABAAAAAAAAAAR1c2VyAAAAEwAAAAEAAAAC", "AAAABQAAAEFFdmVudCBlbWl0dGVkIHdoZW4gYSB1c2VyIGlzIGRpc2FsbG93ZWQgZnJvbSB0cmFuc2ZlcnJpbmcgdG9rZW5zLgAAAAAAAAAAAAAOVXNlckRpc2FsbG93ZWQAAAAAAAEAAAAPdXNlcl9kaXNhbGxvd2VkAAAAAAEAAAAAAAAABHVzZXIAAAATAAAAAQAAAAI=", "AAAAAgAAAEFTdG9yYWdlIGtleXMgZm9yIHRoZSBkYXRhIGFzc29jaWF0ZWQgd2l0aCB0aGUgYWxsb3dsaXN0IGV4dGVuc2lvbgAAAAAAAAAAAAATQWxsb3dMaXN0U3RvcmFnZUtleQAAAAABAAAAAQAAACdTdG9yZXMgdGhlIGFsbG93ZWQgc3RhdHVzIG9mIGFuIGFjY291bnQAAAAAB0FsbG93ZWQAAAAAAQAAABM=", "AAAABQAAAD5FdmVudCBlbWl0dGVkIHdoZW4gYSB1c2VyIGlzIGJsb2NrZWQgZnJvbSB0cmFuc2ZlcnJpbmcgdG9rZW5zLgAAAAAAAAAAAAtVc2VyQmxvY2tlZAAAAAABAAAADHVzZXJfYmxvY2tlZAAAAAEAAAAAAAAABHVzZXIAAAATAAAAAQAAAAI=", "AAAABQAAAEZFdmVudCBlbWl0dGVkIHdoZW4gYSB1c2VyIGlzIHVuYmxvY2tlZCBhbmQgYWxsb3dlZCB0byB0cmFuc2ZlciB0b2tlbnMuAAAAAAAAAAAADVVzZXJVbmJsb2NrZWQAAAAAAAABAAAADnVzZXJfdW5ibG9ja2VkAAAAAAABAAAAAAAAAAR1c2VyAAAAEwAAAAEAAAAC", "AAAAAgAAAEFTdG9yYWdlIGtleXMgZm9yIHRoZSBkYXRhIGFzc29jaWF0ZWQgd2l0aCB0aGUgYmxvY2tsaXN0IGV4dGVuc2lvbgAAAAAAAAAAAAATQmxvY2tMaXN0U3RvcmFnZUtleQAAAAABAAAAAQAAACdTdG9yZXMgdGhlIGJsb2NrZWQgc3RhdHVzIG9mIGFuIGFjY291bnQAAAAAB0Jsb2NrZWQAAAAAAQAAABM=", "AAAABQAAACVFdmVudCBlbWl0dGVkIHdoZW4gdG9rZW5zIGFyZSBtaW50ZWQuAAAAAAAAAAAAAARNaW50AAAAAQAAAARtaW50AAAAAgAAAAAAAAACdG8AAAAAABMAAAABAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAg==", "AAAABQAAACxFdmVudCBlbWl0dGVkIHdoZW4gYW4gYWxsb3dhbmNlIGlzIGFwcHJvdmVkLgAAAAAAAAAHQXBwcm92ZQAAAAABAAAAB2FwcHJvdmUAAAAABAAAAAAAAAAFb3duZXIAAAAAAAATAAAAAQAAAAAAAAAHc3BlbmRlcgAAAAATAAAAAQAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAAAAAARbGl2ZV91bnRpbF9sZWRnZXIAAAAAAAAEAAAAAAAAAAI=", "AAAABQAAASFFdmVudCBlbWl0dGVkIHdoZW4gdG9rZW5zIGFyZSB0cmFuc2ZlcnJlZCBiZXR3ZWVuIGFkZHJlc3NlcyB3aXRob3V0IGEKbXV4ZWQgZGVzdGluYXRpb24uCgpQZXIgU0VQLTQxLCB0aGUgZXZlbnQgZGF0YSBpcyBhIGJhcmUgYGkxMjhgIHdoZW4gbm8gbXV4ZWQgYWRkcmVzcyBpcwppbnZvbHZlZC4gVGhlIGBkYXRhX2Zvcm1hdCA9ICJzaW5nbGUtdmFsdWUiYCBhdHRyaWJ1dGUgZW5zdXJlcyB0aGUKYGFtb3VudGAgZmllbGQgaXMgc2VyaWFsaXplZCBhcyBhIGJhcmUgdmFsdWUgcmF0aGVyIHRoYW4gYSBtYXAuAAAAAAAAAAAAAAhUcmFuc2ZlcgAAAAEAAAAIdHJhbnNmZXIAAAADAAAAAAAAAARmcm9tAAAAEwAAAAEAAAAAAAAAAnRvAAAAAAATAAAAAQAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAA=", "AAAABQAAAZdFdmVudCBlbWl0dGVkIHdoZW4gdG9rZW5zIGFyZSB0cmFuc2ZlcnJlZCB0byBhIG11eGVkIGFkZHJlc3MuCgpQZXIgU0VQLTQxLCB3aGVuIHRoZSBkZXN0aW5hdGlvbiBpcyBhIFtgTXV4ZWRBZGRyZXNzYF0gdGhlIGV2ZW50IGRhdGEKY2FycmllcyBib3RoIHRoZSBhbW91bnQgYW5kIHRoZSBtdXhlZCBpZGVudGlmaWVyIHNvIHRoYXQgb2ZmLWNoYWluCmNvbnN1bWVycyBjYW4gYXR0cmlidXRlIHRoZSB0cmFuc2ZlciB0byB0aGUgY29ycmVjdCBzdWItYWNjb3VudC4KClVzZXMgYHRvcGljcyA9IFsidHJhbnNmZXIiXWAgc28gdGhhdCBib3RoIFtgVHJhbnNmZXJgXSBhbmQKW2BNdXhlZFRyYW5zZmVyYF0gc2hhcmUgdGhlIHNhbWUgYCJ0cmFuc2ZlciJgIGV2ZW50IHN5bWJvbCwgYXMgcmVxdWlyZWQKYnkgU0VQLTQxLgAAAAAAAAAADU11eGVkVHJhbnNmZXIAAAAAAAABAAAACHRyYW5zZmVyAAAABAAAAAAAAAAEZnJvbQAAABMAAAABAAAAAAAAAAJ0bwAAAAAAEwAAAAEAAAAAAAAAC3RvX211eGVkX2lkAAAAA+gAAAAGAAAAAAAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAI=", "AAAABAAAAAAAAAAAAAAAEkZ1bmdpYmxlVG9rZW5FcnJvcgAAAAAADwAAAG5JbmRpY2F0ZXMgYW4gZXJyb3IgcmVsYXRlZCB0byB0aGUgY3VycmVudCBiYWxhbmNlIG9mIGFjY291bnQgZnJvbSB3aGljaAp0b2tlbnMgYXJlIGV4cGVjdGVkIHRvIGJlIHRyYW5zZmVycmVkLgAAAAAAE0luc3VmZmljaWVudEJhbGFuY2UAAAAAZAAAAGRJbmRpY2F0ZXMgYSBmYWlsdXJlIHdpdGggdGhlIGFsbG93YW5jZSBtZWNoYW5pc20gd2hlbiBhIGdpdmVuIHNwZW5kZXIKZG9lc24ndCBoYXZlIGVub3VnaCBhbGxvd2FuY2UuAAAAFUluc3VmZmljaWVudEFsbG93YW5jZQAAAAAAAGUAAABNSW5kaWNhdGVzIGFuIGludmFsaWQgdmFsdWUgZm9yIGBsaXZlX3VudGlsX2xlZGdlcmAgd2hlbiBzZXR0aW5nIGFuCmFsbG93YW5jZS4AAAAAAAAWSW52YWxpZExpdmVVbnRpbExlZGdlcgAAAAAAZgAAADJJbmRpY2F0ZXMgYW4gZXJyb3Igd2hlbiBhbiBpbnB1dCB0aGF0IG11c3QgYmUgPj0gMAAAAAAADExlc3NUaGFuWmVybwAAAGcAAAApSW5kaWNhdGVzIG92ZXJmbG93IHdoZW4gYWRkaW5nIHR3byB2YWx1ZXMAAAAAAAAMTWF0aE92ZXJmbG93AAAAaAAAACpJbmRpY2F0ZXMgYWNjZXNzIHRvIHVuaW5pdGlhbGl6ZWQgbWV0YWRhdGEAAAAAAA1VbnNldE1ldGFkYXRhAAAAAAAAaQAAAFJJbmRpY2F0ZXMgdGhhdCB0aGUgb3BlcmF0aW9uIHdvdWxkIGhhdmUgY2F1c2VkIGB0b3RhbF9zdXBwbHlgIHRvIGV4Y2VlZAp0aGUgYGNhcGAuAAAAAAALRXhjZWVkZWRDYXAAAAAAagAAADZJbmRpY2F0ZXMgdGhlIHN1cHBsaWVkIGBjYXBgIGlzIG5vdCBhIHZhbGlkIGNhcCB2YWx1ZS4AAAAAAApJbnZhbGlkQ2FwAAAAAABrAAAAHkluZGljYXRlcyB0aGUgQ2FwIHdhcyBub3Qgc2V0LgAAAAAACUNhcE5vdFNldAAAAAAAAGwAAAAmSW5kaWNhdGVzIHRoZSBTQUMgYWRkcmVzcyB3YXMgbm90IHNldC4AAAAAAAlTQUNOb3RTZXQAAAAAAABtAAAAMEluZGljYXRlcyBhIFNBQyBhZGRyZXNzIGRpZmZlcmVudCB0aGFuIGV4cGVjdGVkLgAAABJTQUNBZGRyZXNzTWlzbWF0Y2gAAAAAAG4AAABDSW5kaWNhdGVzIGEgbWlzc2luZyBmdW5jdGlvbiBwYXJhbWV0ZXIgaW4gdGhlIFNBQyBjb250cmFjdCBjb250ZXh0LgAAAAARU0FDTWlzc2luZ0ZuUGFyYW0AAAAAAABvAAAAREluZGljYXRlcyBhbiBpbnZhbGlkIGZ1bmN0aW9uIHBhcmFtZXRlciBpbiB0aGUgU0FDIGNvbnRyYWN0IGNvbnRleHQuAAAAEVNBQ0ludmFsaWRGblBhcmFtAAAAAAAAcAAAADFUaGUgdXNlciBpcyBub3QgYWxsb3dlZCB0byBwZXJmb3JtIHRoaXMgb3BlcmF0aW9uAAAAAAAADlVzZXJOb3RBbGxvd2VkAAAAAABxAAAANVRoZSB1c2VyIGlzIGJsb2NrZWQgYW5kIGNhbm5vdCBwZXJmb3JtIHRoaXMgb3BlcmF0aW9uAAAAAAAAC1VzZXJCbG9ja2VkAAAAAHI=", "AAAAAgAAAClTdG9yYWdlIGtleSBmb3IgYWNjZXNzaW5nIHRoZSBTQUMgYWRkcmVzcwAAAAAAAAAAAAAWU0FDQWRtaW5HZW5lcmljRGF0YUtleQAAAAAAAQAAAAAAAAAAAAAAA1NhYwA=", "AAAAAgAAAClTdG9yYWdlIGtleSBmb3IgYWNjZXNzaW5nIHRoZSBTQUMgYWRkcmVzcwAAAAAAAAAAAAAWU0FDQWRtaW5XcmFwcGVyRGF0YUtleQAAAAAAAQAAAAAAAAAAAAAAA1NhYwA=", "AAAAAQAAACRTdG9yYWdlIGNvbnRhaW5lciBmb3IgdG9rZW4gbWV0YWRhdGEAAAAAAAAACE1ldGFkYXRhAAAAAwAAAAAAAAAIZGVjaW1hbHMAAAAEAAAAAAAAAARuYW1lAAAAEAAAAAAAAAAGc3ltYm9sAAAAAAAQ", "AAAAAQAAACpTdG9yYWdlIGtleSB0aGF0IG1hcHMgdG8gW2BBbGxvd2FuY2VEYXRhYF0AAAAAAAAAAAAMQWxsb3dhbmNlS2V5AAAAAgAAAAAAAAAFb3duZXIAAAAAAAATAAAAAAAAAAdzcGVuZGVyAAAAABM=", "AAAAAQAAAINTdG9yYWdlIGNvbnRhaW5lciBmb3IgdGhlIGFtb3VudCBvZiB0b2tlbnMgZm9yIHdoaWNoIGFuIGFsbG93YW5jZSBpcyBncmFudGVkCmFuZCB0aGUgbGVkZ2VyIG51bWJlciBhdCB3aGljaCB0aGlzIGFsbG93YW5jZSBleHBpcmVzLgAAAAAAAAAADUFsbG93YW5jZURhdGEAAAAAAAACAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAEWxpdmVfdW50aWxfbGVkZ2VyAAAAAAAABA==", "AAAAAgAAADlTdG9yYWdlIGtleXMgZm9yIHRoZSBkYXRhIGFzc29jaWF0ZWQgd2l0aCBgRnVuZ2libGVUb2tlbmAAAAAAAAAAAAAAEkZ1bmdpYmxlU3RvcmFnZUtleQAAAAAABAAAAAAAAAAAAAAABE1ldGEAAAAAAAAAAAAAAAtUb3RhbFN1cHBseQAAAAABAAAAAAAAAAdCYWxhbmNlAAAAAAEAAAATAAAAAQAAAAAAAAAJQWxsb3dhbmNlAAAAAAAAAQAAB9AAAAAMQWxsb3dhbmNlS2V5", "AAAAAgAAAAAAAAAAAAAAFVVwZ3JhZGVhYmxlU3RvcmFnZUtleQAAAAAAAAEAAAAAAAAAAAAAAA1TY2hlbWFWZXJzaW9uAAAA", "AAAABQAAACpFdmVudCBlbWl0dGVkIHdoZW4gdGhlIG1lcmtsZSByb290IGlzIHNldC4AAAAAAAAAAAAHU2V0Um9vdAAAAAABAAAACHNldF9yb290AAAAAQAAAAAAAAAEcm9vdAAAAA4AAAAAAAAAAg==", "AAAABQAAACdFdmVudCBlbWl0dGVkIHdoZW4gYW4gaW5kZXggaXMgY2xhaW1lZC4AAAAAAAAAAApTZXRDbGFpbWVkAAAAAAABAAAAC3NldF9jbGFpbWVkAAAAAAEAAAAAAAAABWluZGV4AAAAAAAABAAAAAAAAAAC", "AAAABAAAAAAAAAAAAAAAFk1lcmtsZURpc3RyaWJ1dG9yRXJyb3IAAAAAAAMAAAAbVGhlIG1lcmtsZSByb290IGlzIG5vdCBzZXQuAAAAAApSb290Tm90U2V0AAAAAAUUAAAAJ1RoZSBwcm92aWRlZCBpbmRleCB3YXMgYWxyZWFkeSBjbGFpbWVkLgAAAAATSW5kZXhBbHJlYWR5Q2xhaW1lZAAAAAUVAAAAFVRoZSBwcm9vZiBpcyBpbnZhbGlkLgAAAAAAAAxJbnZhbGlkUHJvb2YAAAUW", "AAAAAgAAAD1TdG9yYWdlIGtleXMgZm9yIHRoZSBkYXRhIGFzc29jaWF0ZWQgd2l0aCBgTWVya2xlRGlzdHJpYnV0b3JgAAAAAAAAAAAAABtNZXJrbGVEaXN0cmlidXRvclN0b3JhZ2VLZXkAAAAAAgAAAAAAAAAoVGhlIE1lcmtsZSByb290IG9mIHRoZSBkaXN0cmlidXRpb24gdHJlZQAAAARSb290AAAAAQAAACNNYXBzIGFuIGluZGV4IHRvIGl0cyBjbGFpbWVkIHN0YXR1cwAAAAAHQ2xhaW1lZAAAAAABAAAABA==", "AAAAAgAAACpSb3VuZGluZyBkaXJlY3Rpb24gZm9yIGRpdmlzaW9uIG9wZXJhdGlvbnMAAAAAAAAAAAAIUm91bmRpbmcAAAADAAAAAAAAACVSb3VuZCB0b3dhcmQgbmVnYXRpdmUgaW5maW5pdHkgKGRvd24pAAAAAAAABUZsb29yAAAAAAAAAAAAACNSb3VuZCB0b3dhcmQgcG9zaXRpdmUgaW5maW5pdHkgKHVwKQAAAAAEQ2VpbAAAAAAAAAAeUm91bmQgdG93YXJkIHplcm8gKHRydW5jYXRpb24pAAAAAAAIVHJ1bmNhdGU=", "AAAABAAAAAAAAAAAAAAAFlNvcm9iYW5GaXhlZFBvaW50RXJyb3IAAAAAAAMAAAAcQXJpdGhtZXRpYyBvdmVyZmxvdyBvY2N1cnJlZAAAAAhPdmVyZmxvdwAABdwAAAAQRGl2aXNpb24gYnkgemVybwAAAA5EaXZpc2lvbkJ5WmVybwAAAAAF3QAAAIFCYXNlIGlzIG91dHNpZGUgdGhlIHZhbGlkIGRvbWFpbiAoZS5nLiBgbG4oeClgIGZvciBgeCA8PSAwYCwKb3IgYHBvd2YoeCwgeSlgIHdpdGggbm9uLXBvc2l0aXZlIGB4YCBjb21iaW5lZCB3aXRoIGZsb2F0IGV4cG9uZW50KS4AAAAAAAALSW52YWxpZEJhc2UAAAAF3g==", "AAAABAAAAAAAAAAAAAAAC0NyeXB0b0Vycm9yAAAAAAQAAAApVGhlIG1lcmtsZSBwcm9vZiBsZW5ndGggaXMgb3V0IG9mIGJvdW5kcy4AAAAAAAAWTWVya2xlUHJvb2ZPdXRPZkJvdW5kcwAAAAAFeAAAACdUaGUgaW5kZXggb2YgdGhlIGxlYWYgaXMgb3V0IG9mIGJvdW5kcy4AAAAAFk1lcmtsZUluZGV4T3V0T2ZCb3VuZHMAAAAABXkAAAAYTm8gZGF0YSBpbiBoYXNoZXIgc3RhdGUuAAAAEEhhc2hlckVtcHR5U3RhdGUAAAV6AAAAVFRoZSBwb2ludCBpcyBuZWl0aGVyIHRoZSBjYW5vbmljYWwgaWRlbnRpdHkgZW5jb2Rpbmcgbm9yIGEgY2Fub25pY2FsCm9uLWN1cnZlIHBvaW50LgAAAAxJbnZhbGlkUG9pbnQAAAV7", "AAAABQAAACpFdmVudCBlbWl0dGVkIHdoZW4gdGhlIGNvbnRyYWN0IGlzIHBhdXNlZC4AAAAAAAAAAAAGUGF1c2VkAAAAAAABAAAABnBhdXNlZAAAAAAAAAAAAAI=", "AAAABQAAACxFdmVudCBlbWl0dGVkIHdoZW4gdGhlIGNvbnRyYWN0IGlzIHVucGF1c2VkLgAAAAAAAAAIVW5wYXVzZWQAAAABAAAACHVucGF1c2VkAAAAAAAAAAI=", "AAAABAAAAAAAAAAAAAAADVBhdXNhYmxlRXJyb3IAAAAAAAACAAAANFRoZSBvcGVyYXRpb24gZmFpbGVkIGJlY2F1c2UgdGhlIGNvbnRyYWN0IGlzIHBhdXNlZC4AAAANRW5mb3JjZWRQYXVzZQAAAAAAA+gAAAA4VGhlIG9wZXJhdGlvbiBmYWlsZWQgYmVjYXVzZSB0aGUgY29udHJhY3QgaXMgbm90IHBhdXNlZC4AAAANRXhwZWN0ZWRQYXVzZQAAAAAAA+k=", "AAAAAgAAACJTdG9yYWdlIGtleSBmb3IgdGhlIHBhdXNhYmxlIHN0YXRlAAAAAAAAAAAAElBhdXNhYmxlU3RvcmFnZUtleQAAAAAAAQAAAAAAAAAySW5kaWNhdGVzIHdoZXRoZXIgdGhlIGNvbnRyYWN0IGlzIGluIHBhdXNlZCBzdGF0ZS4AAAAAAAZQYXVzZWQAAA==", "AAAABAAAACpFcnJvcnMgdGhhdCBjYW4gb2NjdXIgaW4gdm90ZXMgb3BlcmF0aW9ucy4AAAAAAAAAAAAKVm90ZXNFcnJvcgAAAAAABQAAABtUaGUgbGVkZ2VyIGlzIGluIHRoZSBmdXR1cmUAAAAADEZ1dHVyZUxvb2t1cAAAEAQAAAAcQXJpdGhtZXRpYyBvdmVyZmxvdyBvY2N1cnJlZAAAAAxNYXRoT3ZlcmZsb3cAABAFAAAAN0F0dGVtcHRpbmcgdG8gdHJhbnNmZXIgbW9yZSB2b3RpbmcgdW5pdHMgdGhhbiBhdmFpbGFibGUAAAAAF0luc3VmZmljaWVudFZvdGluZ1VuaXRzAAAAEAYAAAA/QXR0ZW1wdGluZyB0byBkZWxlZ2F0ZSB0byB0aGUgc2FtZSBkZWxlZ2F0ZSB0aGF0IGlzIGFscmVhZHkgc2V0AAAAAAxTYW1lRGVsZWdhdGUAABAHAAAAQEEgY2hlY2twb2ludCB0aGF0IHdhcyBleHBlY3RlZCB0byBleGlzdCB3YXMgbm90IGZvdW5kIGluIHN0b3JhZ2UAAAASQ2hlY2twb2ludE5vdEZvdW5kAAAAABAI", "AAAABQAAADNFdmVudCBlbWl0dGVkIHdoZW4gYW4gYWNjb3VudCBjaGFuZ2VzIGl0cyBkZWxlZ2F0ZS4AAAAAAAAAAA9EZWxlZ2F0ZUNoYW5nZWQAAAAAAQAAABBkZWxlZ2F0ZV9jaGFuZ2VkAAAAAwAAACVUaGUgYWNjb3VudCB0aGF0IGNoYW5nZWQgaXRzIGRlbGVnYXRlAAAAAAAACWRlbGVnYXRvcgAAAAAAABMAAAABAAAAHlRoZSBwcmV2aW91cyBkZWxlZ2F0ZSAoaWYgYW55KQAAAAAADWZyb21fZGVsZWdhdGUAAAAAAAPoAAAAEwAAAAAAAAAQVGhlIG5ldyBkZWxlZ2F0ZQAAAAt0b19kZWxlZ2F0ZQAAAAATAAAAAAAAAAI=", "AAAABQAAADVFdmVudCBlbWl0dGVkIHdoZW4gYSBkZWxlZ2F0ZSdzIHZvdGluZyBwb3dlciBjaGFuZ2VzLgAAAAAAAAAAAAAURGVsZWdhdGVWb3Rlc0NoYW5nZWQAAAABAAAAFmRlbGVnYXRlX3ZvdGVzX2NoYW5nZWQAAAAAAAMAAAAnVGhlIGRlbGVnYXRlIHdob3NlIHZvdGluZyBwb3dlciBjaGFuZ2VkAAAAAAhkZWxlZ2F0ZQAAABMAAAABAAAAGVRoZSBwcmV2aW91cyB2b3RpbmcgcG93ZXIAAAAAAAAOcHJldmlvdXNfdm90ZXMAAAAAAAoAAAAAAAAAFFRoZSBuZXcgdm90aW5nIHBvd2VyAAAACW5ld192b3RlcwAAAAAAAAoAAAAAAAAAAg==", "AAAAAQAAAElBIGNoZWNrcG9pbnQgcmVjb3JkaW5nIHZvdGluZyBwb3dlciBhdCBhIHNwZWNpZmljIGxlZGdlciBzZXF1ZW5jZSBudW1iZXIuAAAAAAAAAAAAAApDaGVja3BvaW50AAAAAAACAAAAO1RoZSBsZWRnZXIgc2VxdWVuY2UgbnVtYmVyIHdoZW4gdGhpcyBjaGVja3BvaW50IHdhcyBjcmVhdGVkAAAAAAZsZWRnZXIAAAAAAAQAAAAvVGhlIHZvdGluZyBwb3dlciBhdCB0aGlzIGxlZGdlciBzZXF1ZW5jZSBudW1iZXIAAAAABXZvdGVzAAAAAAAACg==", "AAAAAgAAAMNTZWxlY3RzIHRoZSBjaGVja3BvaW50IHRpbWVsaW5lIHRvIG9wZXJhdGUgb24uCgpFYWNoIHZhcmlhbnQgbWFwcyB0byBhIGRpZmZlcmVudCBzZXQgb2Ygc3RvcmFnZSBrZXlzIHNvIHRoYXQKcGVyLWFjY291bnQgdm90aW5nLXBvd2VyIGhpc3RvcnkgYW5kIGFnZ3JlZ2F0ZSB0b3RhbCBzdXBwbHkgaGlzdG9yeQphcmUga2VwdCBzZXBhcmF0ZS4AAAAAAAAAAA5DaGVja3BvaW50VHlwZQAAAAAAAgAAAAAAAAAjVGhlIGdsb2JhbCB0b3RhbCBzdXBwbHkgY2hlY2twb2ludC4AAAAAC1RvdGFsU3VwcGx5AAAAAAEAAAAxQSBwZXItYWNjb3VudCAoZGVsZWdhdGUpIHZvdGluZy1wb3dlciBjaGVja3BvaW50LgAAAAAAAAdBY2NvdW50AAAAAAEAAAAT", "AAAAAgAAAPdTdG9yYWdlIGtleXMgZm9yIHRoZSB2b3RlcyBtb2R1bGUuCgpPbmx5IGRlbGVnYXRlZCB2b3RpbmcgcG93ZXIgY291bnRzIGFzIHZvdGVzIChpLmUuLCBvbmx5IGRlbGVnYXRlZXMgY2FuCnZvdGUpLCBzbyB0aGUgc3RvcmFnZSBkZXNpZ24gdHJhY2tzIGRlbGVnYXRlcyBhbmQgdGhlaXIgY2hlY2twb2ludGVkCnZvdGluZyBwb3dlciBzZXBhcmF0ZWx5IGZyb20gdGhlIHJhdyB2b3RpbmcgdW5pdHMgaGVsZCBieSBlYWNoIGFjY291bnQuAAAAAAAAAAAPVm90ZXNTdG9yYWdlS2V5AAAAAAYAAAABAAAAHE1hcHMgYWNjb3VudCB0byBpdHMgZGVsZWdhdGUAAAAJRGVsZWdhdGVlAAAAAAAAAQAAABMAAAABAAAAJE51bWJlciBvZiBjaGVja3BvaW50cyBmb3IgYSBkZWxlZ2F0ZQAAAA5OdW1DaGVja3BvaW50cwAAAAAAAQAAABMAAAABAAAALUluZGl2aWR1YWwgY2hlY2twb2ludCBmb3IgYSBkZWxlZ2F0ZSBhdCBpbmRleAAAAAAAABJEZWxlZ2F0ZUNoZWNrcG9pbnQAAAAAAAIAAAATAAAABAAAAAAAAAAiTnVtYmVyIG9mIHRvdGFsIHN1cHBseSBjaGVja3BvaW50cwAAAAAAGU51bVRvdGFsU3VwcGx5Q2hlY2twb2ludHMAAAAAAAABAAAAK0luZGl2aWR1YWwgdG90YWwgc3VwcGx5IGNoZWNrcG9pbnQgYXQgaW5kZXgAAAAAFVRvdGFsU3VwcGx5Q2hlY2twb2ludAAAAAAAAAEAAAAEAAAAAQAAAERWb3RpbmcgdW5pdHMgaGVsZCBieSBhbiBhY2NvdW50ICh0cmFja2VkIHNlcGFyYXRlbHkgZnJvbSBkZWxlZ2F0aW9uKQAAAAtWb3RpbmdVbml0cwAAAAABAAAAEw==", "AAAABQAAACJFdmVudCBlbWl0dGVkIHdoZW4gYSB2b3RlIGlzIGNhc3QuAAAAAAAAAAAACFZvdGVDYXN0AAAAAQAAAAl2b3RlX2Nhc3QAAAAAAAAFAAAAAAAAAAV2b3RlcgAAAAAAABMAAAABAAAAAAAAAAtwcm9wb3NhbF9pZAAAAAPuAAAAIAAAAAEAAAAWVGhlIHR5cGUgb2Ygdm90ZSBjYXN0LgAAAAAACXZvdGVfdHlwZQAAAAAAAAQAAAAAAAAAFlRoZSB2b3RpbmcgcG93ZXIgdXNlZC4AAAAAAAZ3ZWlnaHQAAAAAAAoAAAAAAAAAJ1RoZSB2b3RlcidzIGV4cGxhbmF0aW9uIGZvciB0aGVpciB2b3RlLgAAAAAGcmVhc29uAAAAAAAQAAAAAAAAAAI=", "AAAABAAAAC1FcnJvcnMgdGhhdCBjYW4gb2NjdXIgaW4gZ292ZXJub3Igb3BlcmF0aW9ucy4AAAAAAAAAAAAADUdvdmVybm9yRXJyb3IAAAAAAAAYAAAAG1RoZSBwcm9wb3NhbCB3YXMgbm90IGZvdW5kLgAAAAAQUHJvcG9zYWxOb3RGb3VuZAAAE4gAAAAcVGhlIHByb3Bvc2FsIGFscmVhZHkgZXhpc3RzLgAAABVQcm9wb3NhbEFscmVhZHlFeGlzdHMAAAAAABOJAAAAL1RoZSBwcm9wb3NlciBkb2VzIG5vdCBoYXZlIGVub3VnaCB2b3RpbmcgcG93ZXIuAAAAABlJbnN1ZmZpY2llbnRQcm9wb3NlclZvdGVzAAAAAAATigAAACFUaGUgcHJvcG9zYWwgY29udGFpbnMgbm8gYWN0aW9ucy4AAAAAAAANRW1wdHlQcm9wb3NhbAAAAAAAE4sAAABAVGhlIHRhcmdldHMsIGZ1bmN0aW9ucywgYW5kIGFyZ3MgdmVjdG9ycyBoYXZlIGRpZmZlcmVudCBsZW5ndGhzLgAAABVJbnZhbGlkUHJvcG9zYWxMZW5ndGgAAAAAABOMAAAAKFRoZSBwcm9wb3NhbCBpcyBub3QgaW4gdGhlIGFjdGl2ZSBzdGF0ZS4AAAARUHJvcG9zYWxOb3RBY3RpdmUAAAAAABONAAAAH1RoZSBwcm9wb3NhbCBoYXMgbm90IHN1Y2NlZWRlZC4AAAAAFVByb3Bvc2FsTm90U3VjY2Vzc2Z1bAAAAAAAE44AAAAhVGhlIHByb3Bvc2FsIGhhcyBub3QgYmVlbiBxdWV1ZWQuAAAAAAAAEVByb3Bvc2FsTm90UXVldWVkAAAAAAATjwAAACdUaGUgcHJvcG9zYWwgaGFzIGFscmVhZHkgYmVlbiBleGVjdXRlZC4AAAAAF1Byb3Bvc2FsQWxyZWFkeUV4ZWN1dGVkAAAAE5AAAABSVGhlIHByb3Bvc2FsIGlzIGluIGEgbm9uLWNhbmNlbGxhYmxlIHN0YXRlIChgQ2FuY2VsZWRgLCBgRXhwaXJlZGAsIG9yCmBFeGVjdXRlZGApLgAAAAAAFlByb3Bvc2FsTm90Q2FuY2VsbGFibGUAAAAAE5EAAAAiVGhlIHZvdGluZyBkZWxheSBoYXMgbm90IGJlZW4gc2V0LgAAAAAAEVZvdGluZ0RlbGF5Tm90U2V0AAAAAAATkgAAACNUaGUgdm90aW5nIHBlcmlvZCBoYXMgbm90IGJlZW4gc2V0LgAAAAASVm90aW5nUGVyaW9kTm90U2V0AAAAABOTAAAAKFRoZSBwcm9wb3NhbCB0aHJlc2hvbGQgaGFzIG5vdCBiZWVuIHNldC4AAAAXUHJvcG9zYWxUaHJlc2hvbGROb3RTZXQAAAATlAAAABpUaGUgbmFtZSBoYXMgbm90IGJlZW4gc2V0LgAAAAAACk5hbWVOb3RTZXQAAAAAE5UAAAAdVGhlIHZlcnNpb24gaGFzIG5vdCBiZWVuIHNldC4AAAAAAAANVmVyc2lvbk5vdFNldAAAAAAAE5YAAAAdQXJpdGhtZXRpYyBvdmVyZmxvdyBvY2N1cnJlZC4AAAAAAAAMTWF0aE92ZXJmbG93AAATlwAAAC9UaGUgYWNjb3VudCBoYXMgYWxyZWFkeSB2b3RlZCBvbiB0aGlzIHByb3Bvc2FsLgAAAAAMQWxyZWFkeVZvdGVkAAATmAAAAC5UaGUgdm90ZSB0eXBlIGlzIGludmFsaWQgKG11c3QgYmUgMCwgMSwgb3IgMikuAAAAAAAPSW52YWxpZFZvdGVUeXBlAAAAE5kAAAAcVGhlIHF1b3J1bSBoYXMgbm90IGJlZW4gc2V0LgAAAAxRdW9ydW1Ob3RTZXQAABOaAAAAR1RoZSB0b2tlbiBjb250cmFjdCBoYXMgYWxyZWFkeSBiZWVuIHNldCAoY2FuIG9ubHkgYmUgaW5pdGlhbGl6ZWQgb25jZSkuAAAAABdUb2tlbkNvbnRyYWN0QWxyZWFkeVNldAAAABObAAAAJFRoZSB0b2tlbiBjb250cmFjdCBoYXMgbm90IGJlZW4gc2V0LgAAABNUb2tlbkNvbnRyYWN0Tm90U2V0AAAAE5wAAAA8VGhlIHByb3Bvc2FsIGRlc2NyaXB0aW9uIGV4Y2VlZHMgdGhlIG1heGltdW0gYWxsb3dlZCBsZW5ndGguAAAAEkRlc2NyaXB0aW9uVG9vTG9uZwAAAAATnQAAAClRdWV1aW5nIGlzIG5vdCBlbmFibGVkIGZvciB0aGlzIGdvdmVybm9yLgAAAAAAAA9RdWV1ZU5vdEVuYWJsZWQAAAATngAAAEZUaGUgdm90aW5nIHBlcmlvZCBpcyB6ZXJvLCB3aGljaCB3b3VsZCBsZWF2ZSBldmVyeSBwcm9wb3NhbCB1bnZvdGFibGUuAAAAAAATSW52YWxpZFZvdGluZ1BlcmlvZAAAABOf", "AAAAAwAABABUaGUgc3RhdGUgb2YgYSBwcm9wb3NhbCBpbiBpdHMgbGlmZWN5Y2xlLgoKU3RhdGVzIGFyZSBkaXZpZGVkIGludG8gdHdvIGNhdGVnb3JpZXM6CgojIyBUaW1lLWJhc2VkIHN0YXRlcyAoZGVyaXZlZCwgbmV2ZXIgc3RvcmVkIGV4cGxpY2l0bHkpCgpUaGVzZSBhcmUgY29tcHV0ZWQgYnkgW2BnZXRfcHJvcG9zYWxfc3RhdGUoKWBdIGZyb20gdGhlIGN1cnJlbnQgbGVkZ2VyCnJlbGF0aXZlIHRvIHRoZSBwcm9wb3NhbCdzIHZvdGluZyBzY2hlZHVsZS4gVGhleSBhcmUgb25seSByZXR1cm5lZCB3aGVuCm5vIGV4cGxpY2l0IHN0YXRlIGhhcyBiZWVuIHNldC4KCi0gW2BQZW5kaW5nYF0oUHJvcG9zYWxTdGF0ZTo6UGVuZGluZykg4oCUIHZvdGluZyBoYXMgbm90IHN0YXJ0ZWQgeWV0LgotIFtgQWN0aXZlYF0oUHJvcG9zYWxTdGF0ZTo6QWN0aXZlKSDigJQgdm90aW5nIGlzIG9uZ29pbmcuCi0gW2BEZWZlYXRlZGBdKFByb3Bvc2FsU3RhdGU6OkRlZmVhdGVkKSDigJQgdm90aW5nIGVuZGVkICoqd2l0aG91dCoqIHRoZQpjb3VudGluZyBsb2dpYyBtYXJraW5nIHRoZSBwcm9wb3NhbCBhcyBgU3VjY2VlZGVkYC4KCiMjIEV4cGxpY2l0IHN0YXRlcwoKU2V0IGV4cGxpY2l0bHkgYnkgdGhlIEdvdmVybm9yIG9yIGl0cyBleHRlbnNpb25zIGFuZCBwZXJzaXN0ZWQgaW4Kc3RvcmFnZS4gT25jZSBzZXQsIHRoZXkgdGFrZSBwcmVjZWRlbmNlIG92ZXIgYW55IHRpbWUtYmFzZWQgZGVyaXZhdGlvbi4KCi0gW2BDYW5jZWxlZGBdKFByb3Bvc2FsU3RhdGU6OkNhbmNlbGVkKSDigJQgc2V0IGJ5IHRoZSBHb3Zlcm5vci4KLSBbYFN1Y2NlZWRlZGBdKFByb3Bvc2FsU3RhdGU6OlN1Y2NlZWRlZCkg4oCUIHNldCBieSB0aGUgY291bnRpbmcgbG9naWMuCi0gW2BRdWV1ZWRgXShQcm9wb3NhbFN0YXRlOjpRdWV1ZWQpIC8gW2BFeHBpcmVkYF0oUHJvcG9zYWxTdGF0ZTo6RXhwaXJlZCkg4oCUCnNldCBieSBleHRlbnNpb25zIGxpa2UgYFRpbWVsb2NrQ29udHJvbGAuCi0gW2BFeGVjdXRlZGBdKFByb3Bvc2FsU3RhdGU6OkV4ZWN1AAAAAAAAAA1Qcm9wb3NhbFN0YXRlAAAAAAAACAAAADdUaGUgcHJvcG9zYWwgaXMgcGVuZGluZyBhbmQgdm90aW5nIGhhcyBub3Qgc3RhcnRlZCB5ZXQuAAAAAAdQZW5kaW5nAAAAAAAAAAAtVGhlIHByb3Bvc2FsIGlzIGFjdGl2ZSBhbmQgdm90aW5nIGlzIG9uZ29pbmcuAAAAAAAABkFjdGl2ZQAAAAAAAQAAAMhUaGUgcHJvcG9zYWwgd2FzIGRlZmVhdGVkIChkaWQgbm90IG1lZXQgcXVvcnVtIG9yIG1ham9yaXR5KS4gVGhpcyBpcwp0aGUgZGVmYXVsdCBvdXRjb21lIHdoZW4gdm90aW5nIGVuZHMgYW5kIHRoZSBjb3VudGluZyBsb2dpYyBoYXMKbm90IG1hcmtlZCB0aGUgcHJvcG9zYWwgYXMgW2BTdWNjZWVkZWRgXShQcm9wb3NhbFN0YXRlOjpTdWNjZWVkZWQpLgAAAAhEZWZlYXRlZAAAAAIAAAA1VGhlIHByb3Bvc2FsIGhhcyBiZWVuIGNhbmNlbGxlZC4gU2V0IGJ5IHRoZSBHb3Zlcm5vci4AAAAAAAAIQ2FuY2VsZWQAAAADAAAA3lRoZSBwcm9wb3NhbCBzdWNjZWVkZWQgYW5kIGNhbiBiZSBleGVjdXRlZC4gU2V0IGJ5IHRoZSBjb3VudGluZwpsb2dpYyB3aGVuIHRoZSBwcm9wb3NhbCBtZWV0cyB0aGUgcmVxdWlyZWQgcXVvcnVtIGFuZCB2b3RlCnRocmVzaG9sZHMuIElmIGEgcXVldWluZyBleHRlbnNpb24gaXMgZW5hYmxlZCwgdGhpcyBzdGF0ZSBtZWFucyB0aGUKcHJvcG9zYWwgaXMgcmVhZHkgdG8gYmUgcXVldWVkLgAAAAAACVN1Y2NlZWRlZAAAAAAAAAQAAABPVGhlIHByb3Bvc2FsIGlzIHF1ZXVlZCBmb3IgZXhlY3V0aW9uLiBTZXQgYnkgZXh0ZW5zaW9ucyBsaWtlCmBUaW1lbG9ja0NvbnRyb2xgLgAAAAAGUXVldWVkAAAAAAAFAAAAYVRoZSBwcm9wb3NhbCBoYXMgZXhwaXJlZCBhbmQgY2FuIG5vIGxvbmdlciBiZSBleGVjdXRlZC4gU2V0IGJ5CmV4dGVuc2lvbnMgbGlrZSBgVGltZWxvY2tDb250cm9sYC4AAAAAAAAHRXhwaXJlZAAAAAAGAAAANFRoZSBwcm9wb3NhbCBoYXMgYmVlbiBleGVjdXRlZC4gU2V0IGJ5IHRoZSBHb3Zlcm5vci4AAAAIRXhlY3V0ZWQAAAAH", "AAAABQAAAC9FdmVudCBlbWl0dGVkIHdoZW4gdGhlIHF1b3J1bSB2YWx1ZSBpcyBjaGFuZ2VkLgAAAAAAAAAADVF1b3J1bUNoYW5nZWQAAAAAAAABAAAADnF1b3J1bV9jaGFuZ2VkAAAAAAACAAAAAAAAAApvbGRfcXVvcnVtAAAAAAAKAAAAAAAAAAAAAAAKbmV3X3F1b3J1bQAAAAAACgAAAAAAAAAC", "AAAABQAAAChFdmVudCBlbWl0dGVkIHdoZW4gYSBwcm9wb3NhbCBpcyBxdWV1ZWQuAAAAAAAAAA5Qcm9wb3NhbFF1ZXVlZAAAAAAAAQAAAA9wcm9wb3NhbF9xdWV1ZWQAAAAAAgAAAAAAAAALcHJvcG9zYWxfaWQAAAAD7gAAACAAAAABAAAAAAAAAANldGEAAAAABAAAAAAAAAAC", "AAAABQAAAClFdmVudCBlbWl0dGVkIHdoZW4gYSBwcm9wb3NhbCBpcyBjcmVhdGVkLgAAAAAAAAAAAAAPUHJvcG9zYWxDcmVhdGVkAAAAAAEAAAAQcHJvcG9zYWxfY3JlYXRlZAAAAAgAAAAAAAAAC3Byb3Bvc2FsX2lkAAAAA+4AAAAgAAAAAQAAAAAAAAAIcHJvcG9zZXIAAAATAAAAAQAAAAAAAAAHdGFyZ2V0cwAAAAPqAAAAEwAAAAAAAAAAAAAACWZ1bmN0aW9ucwAAAAAAA+oAAAARAAAAAAAAAAAAAAAEYXJncwAAA+oAAAPqAAAAAAAAAAAAAAAAAAAADXZvdGVfc25hcHNob3QAAAAAAAAEAAAAAAAAAAAAAAAIdm90ZV9lbmQAAAAEAAAAAAAAAAAAAAALZGVzY3JpcHRpb24AAAAAEAAAAAAAAAAC", "AAAABQAAACpFdmVudCBlbWl0dGVkIHdoZW4gYSBwcm9wb3NhbCBpcyBleGVjdXRlZC4AAAAAAAAAAAAQUHJvcG9zYWxFeGVjdXRlZAAAAAEAAAARcHJvcG9zYWxfZXhlY3V0ZWQAAAAAAAABAAAAAAAAAAtwcm9wb3NhbF9pZAAAAAPuAAAAIAAAAAEAAAAC", "AAAABQAAACtFdmVudCBlbWl0dGVkIHdoZW4gYSBwcm9wb3NhbCBpcyBjYW5jZWxsZWQuAAAAAAAAAAARUHJvcG9zYWxDYW5jZWxsZWQAAAAAAAABAAAAEnByb3Bvc2FsX2NhbmNlbGxlZAAAAAAAAQAAAAAAAAALcHJvcG9zYWxfaWQAAAAD7gAAACAAAAABAAAAAg==", "AAAAAQAAACNDb3JlIHByb3Bvc2FsIGRhdGEgc3RvcmVkIG9uLWNoYWluLgAAAAAAAAAADFByb3Bvc2FsQ29yZQAAAAQAAAAmVGhlIGFkZHJlc3MgdGhhdCBjcmVhdGVkIHRoZSBwcm9wb3NhbC4AAAAAAAhwcm9wb3NlcgAAABMAAAAiVGhlIGN1cnJlbnQgc3RhdGUgb2YgdGhlIHByb3Bvc2FsLgAAAAAABXN0YXRlAAAAAAAH0AAAAA1Qcm9wb3NhbFN0YXRlAAAAAAAAM1RoZSBsYXN0IGxlZGdlciB3aGVyZSB2b3RpbmcgaXMgYWN0aXZlIChpbmNsdXNpdmUpLgAAAAAIdm90ZV9lbmQAAAAEAAAAZ1RoZSBsZWRnZXIgYXQgd2hpY2ggdm90aW5nIHBvd2VyIGlzIHNuYXBzaG90dGVkLiBWb3Rpbmcgb3BlbnMgb24KdGhlIG5leHQgbGVkZ2VyIChgdm90ZV9zbmFwc2hvdCArIDFgKS4AAAAADXZvdGVfc25hcHNob3QAAAAAAAAE", "AAAAAQAAAERBIHF1b3J1bSBjaGVja3BvaW50IHJlY29yZGluZyB0aGUgcXVvcnVtIHZhbHVlIGF0IGEgc3BlY2lmaWMgbGVkZ2VyLgAAAAAAAAAQUXVvcnVtQ2hlY2twb2ludAAAAAIAAAAyVGhlIGxlZGdlciBhdCB3aGljaCB0aGlzIHF1b3J1bSB2YWx1ZSB0b29rIGVmZmVjdC4AAAAAAAZsZWRnZXIAAAAAAAQAAAARVGhlIHF1b3J1bSB2YWx1ZS4AAAAAAAAGcXVvcnVtAAAAAAAK", "AAAAAgAAACdTdG9yYWdlIGtleXMgZm9yIHRoZSBHb3Zlcm5vciBjb250cmFjdC4AAAAAAAAAABJHb3Zlcm5vclN0b3JhZ2VLZXkAAAAAAAsAAAAAAAAAGVRoZSBuYW1lIG9mIHRoZSBnb3Zlcm5vci4AAAAAAAAETmFtZQAAAAAAAAAlVGhlIHZlcnNpb24gb2YgdGhlIGdvdmVybm9yIGNvbnRyYWN0LgAAAAAAAAdWZXJzaW9uAAAAAAAAAAAcVGhlIHZvdGluZyBkZWxheSBpbiBsZWRnZXJzLgAAAAtWb3RpbmdEZWxheQAAAAAAAAAAHVRoZSB2b3RpbmcgcGVyaW9kIGluIGxlZGdlcnMuAAAAAAAADFZvdGluZ1BlcmlvZAAAAAAAAAApTWluaW11bSB2b3RpbmcgcG93ZXIgcmVxdWlyZWQgdG8gcHJvcG9zZS4AAAAAAAARUHJvcG9zYWxUaHJlc2hvbGQAAAAAAAABAAAAJVByb3Bvc2FsIGRhdGEgaW5kZXhlZCBieSBwcm9wb3NhbCBJRC4AAAAAAAAIUHJvcG9zYWwAAAABAAAD7gAAACAAAAAAAAAAHU51bWJlciBvZiBxdW9ydW0gY2hlY2twb2ludHMuAAAAAAAAFE51bVF1b3J1bUNoZWNrcG9pbnRzAAAAAQAAACZJbmRpdmlkdWFsIHF1b3J1bSBjaGVja3BvaW50IGF0IGluZGV4LgAAAAAAEFF1b3J1bUNoZWNrcG9pbnQAAAABAAAABAAAAAEAAAA0Vm90ZSB0YWxsaWVzIGZvciBhIHByb3Bvc2FsLCBpbmRleGVkIGJ5IHByb3Bvc2FsIElELgAAAAxQcm9wb3NhbFZvdGUAAAABAAAD7gAAACAAAAABAAAAK1doZXRoZXIgYW4gYWNjb3VudCBoYXMgdm90ZWQgb24gYSBwcm9wb3NhbC4AAAAACEhhc1ZvdGVkAAAAAgAAA+4AAAAgAAAAEwAAAAAAAABCVGhlIGFkZHJlc3Mgb2YgdGhlIHRva2VuIGNvbnRyYWN0IHRoYXQgaW1wbGVtZW50cyB0aGUgVm90ZXMgdHJhaXQuAAAAAAANVG9rZW5Db250cmFjdAAAAA==", "AAAAAQAAABxWb3RlIHRhbGxpZXMgZm9yIGEgcHJvcG9zYWwuAAAAAAAAABJQcm9wb3NhbFZvdGVDb3VudHMAAAAAAAMAAAAjVG90YWwgdm90aW5nIHBvd2VyIGNhc3QgYXMgYWJzdGFpbi4AAAAADWFic3RhaW5fdm90ZXMAAAAAAAAKAAAALVRvdGFsIHZvdGluZyBwb3dlciBjYXN0IGFnYWluc3QgdGhlIHByb3Bvc2FsLgAAAAAAAA1hZ2FpbnN0X3ZvdGVzAAAAAAAACgAAADFUb3RhbCB2b3RpbmcgcG93ZXIgY2FzdCBpbiBmYXZvciBvZiB0aGUgcHJvcG9zYWwuAAAAAAAACWZvcl92b3RlcwAAAAAAAAo=", "AAAABAAAAC1FcnJvcnMgdGhhdCBjYW4gb2NjdXIgaW4gdGltZWxvY2sgb3BlcmF0aW9ucy4AAAAAAAAAAAAADVRpbWVsb2NrRXJyb3IAAAAAAAAHAAAAIlRoZSBvcGVyYXRpb24gaXMgYWxyZWFkeSBzY2hlZHVsZWQAAAAAABlPcGVyYXRpb25BbHJlYWR5U2NoZWR1bGVkAAAAAAAPoAAAADFUaGUgZGVsYXkgaXMgbGVzcyB0aGFuIHRoZSBtaW5pbXVtIHJlcXVpcmVkIGRlbGF5AAAAAAAAEUluc3VmZmljaWVudERlbGF5AAAAAAAPoQAAACpUaGUgb3BlcmF0aW9uIGlzIG5vdCBpbiB0aGUgZXhwZWN0ZWQgc3RhdGUAAAAAABVJbnZhbGlkT3BlcmF0aW9uU3RhdGUAAAAAAA+iAAAAMUEgcHJlZGVjZXNzb3Igb3BlcmF0aW9uIGhhcyBub3QgYmVlbiBleGVjdXRlZCB5ZXQAAAAAAAAVVW5leGVjdXRlZFByZWRlY2Vzc29yAAAAAAAPowAAADNUaGUgY2FsbGVyIGlzIG5vdCBhdXRob3JpemVkIHRvIHBlcmZvcm0gdGhpcyBhY3Rpb24AAAAADFVuYXV0aG9yaXplZAAAD6QAAAAiVGhlIG1pbmltdW0gZGVsYXkgaGFzIG5vdCBiZWVuIHNldAAAAAAADk1pbkRlbGF5Tm90U2V0AAAAAA+lAAAAJFRoZSBvcGVyYXRpb24gaGFzIG5vdCBiZWVuIHNjaGVkdWxlZAAAABVPcGVyYXRpb25Ob3RTY2hlZHVsZWQAAAAAAA+m", "AAAABQAAADBFdmVudCBlbWl0dGVkIHdoZW4gdGhlIG1pbmltdW0gZGVsYXkgaXMgY2hhbmdlZC4AAAAAAAAAD01pbkRlbGF5Q2hhbmdlZAAAAAABAAAAEW1pbl9kZWxheV9jaGFuZ2VkAAAAAAAAAgAAAAAAAAAJb2xkX2RlbGF5AAAAAAAABAAAAAAAAAAAAAAACW5ld19kZWxheQAAAAAAAAQAAAAAAAAAAg==", "AAAABQAAACxFdmVudCBlbWl0dGVkIHdoZW4gYW4gb3BlcmF0aW9uIGlzIGV4ZWN1dGVkLgAAAAAAAAART3BlcmF0aW9uRXhlY3V0ZWQAAAAAAAABAAAAEm9wZXJhdGlvbl9leGVjdXRlZAAAAAAABgAAAAAAAAACaWQAAAAAA+4AAAAgAAAAAQAAAAAAAAAGdGFyZ2V0AAAAAAATAAAAAQAAAAAAAAAIZnVuY3Rpb24AAAARAAAAAAAAAAAAAAAEYXJncwAAA+oAAAAAAAAAAAAAAAAAAAALcHJlZGVjZXNzb3IAAAAD7gAAACAAAAAAAAAAAAAAAARzYWx0AAAD7gAAACAAAAAAAAAAAg==", "AAAABQAAAC1FdmVudCBlbWl0dGVkIHdoZW4gYW4gb3BlcmF0aW9uIGlzIGNhbmNlbGxlZC4AAAAAAAAAAAAAEk9wZXJhdGlvbkNhbmNlbGxlZAAAAAAAAQAAABNvcGVyYXRpb25fY2FuY2VsbGVkAAAAAAEAAAAAAAAAAmlkAAAAAAPuAAAAIAAAAAEAAAAC", "AAAABQAAAC1FdmVudCBlbWl0dGVkIHdoZW4gYW4gb3BlcmF0aW9uIGlzIHNjaGVkdWxlZC4AAAAAAAAAAAAAEk9wZXJhdGlvblNjaGVkdWxlZAAAAAAAAQAAABNvcGVyYXRpb25fc2NoZWR1bGVkAAAAAAcAAAAAAAAAAmlkAAAAAAPuAAAAIAAAAAEAAAAAAAAABnRhcmdldAAAAAAAEwAAAAEAAAAAAAAACGZ1bmN0aW9uAAAAEQAAAAAAAAAAAAAABGFyZ3MAAAPqAAAAAAAAAAAAAAAAAAAAC3ByZWRlY2Vzc29yAAAAA+4AAAAgAAAAAAAAAAAAAAAEc2FsdAAAA+4AAAAgAAAAAAAAAAAAAAAFZGVsYXkAAAAAAAAEAAAAAAAAAAI=", "AAAAAQAAALtSZXByZXNlbnRzIGEgb3BlcmF0aW9uIHRvIGJlIGV4ZWN1dGVkIGJ5IHRoZSB0aW1lbG9jay4KCkFuIG9wZXJhdGlvbiBlbmNhcHN1bGF0ZXMgYWxsIHRoZSBpbmZvcm1hdGlvbiBuZWVkZWQgdG8gaW52b2tlIGEgZnVuY3Rpb24Kb24gYSB0YXJnZXQgY29udHJhY3QgYWZ0ZXIgdGhlIHRpbWVsb2NrIGRlbGF5IGhhcyBwYXNzZWQuAAAAAAAAAAAJT3BlcmF0aW9uAAAAAAAABQAAADBUaGUgc2VyaWFsaXplZCBhcmd1bWVudHMgdG8gcGFzcyB0byB0aGUgZnVuY3Rpb24AAAAEYXJncwAAA+oAAAAAAAAAMlRoZSBmdW5jdGlvbiBuYW1lIHRvIGludm9rZSBvbiB0aGUgdGFyZ2V0IGNvbnRyYWN0AAAAAAAIZnVuY3Rpb24AAAARAAAAeUhhc2ggb2YgYSBwcmVkZWNlc3NvciBvcGVyYXRpb24gdGhhdCBtdXN0IGJlIGV4ZWN1dGVkIGZpcnN0LgpVc2UgQnl0ZXNOOjo8MzI+Ojpmcm9tX2FycmF5KCZbMHU4OyAzMl0pIGZvciBubyBwcmVkZWNlc3Nvci4AAAAAAAALcHJlZGVjZXNzb3IAAAAD7gAAACAAAABuQSBzYWx0IHZhbHVlIGZvciBvcGVyYXRpb24gdW5pcXVlbmVzcy4KQWxsb3dzIHNjaGVkdWxpbmcgdGhlIHNhbWUgb3BlcmF0aW9uIG11bHRpcGxlIHRpbWVzIHdpdGggZGlmZmVyZW50IElEcy4AAAAAAARzYWx0AAAD7gAAACAAAAAcVGhlIGNvbnRyYWN0IGFkZHJlc3MgdG8gY2FsbAAAAAZ0YXJnZXQAAAAAABM=", "AAAAAgAAADFUaGUgc3RhdGUgb2YgYW4gb3BlcmF0aW9uIGluIHRoZSB0aW1lbG9jayBzeXN0ZW0uAAAAAAAAAAAAAA5PcGVyYXRpb25TdGF0ZQAAAAAABAAAAAAAAAAgT3BlcmF0aW9uIGhhcyBub3QgYmVlbiBzY2hlZHVsZWQAAAAFVW5zZXQAAAAAAAAAAAAAOk9wZXJhdGlvbiBpcyBzY2hlZHVsZWQgYnV0IHRoZSBkZWxheSBwZXJpb2QgaGFzIG5vdCBwYXNzZWQAAAAAAAdXYWl0aW5nAAAAAAAAAAA0T3BlcmF0aW9uIGlzIHJlYWR5IHRvIGJlIGV4ZWN1dGVkIChkZWxheSBoYXMgcGFzc2VkKQAAAAVSZWFkeQAAAAAAAAAAAAAbT3BlcmF0aW9uIGhhcyBiZWVuIGV4ZWN1dGVkAAAAAAREb25l", "AAAAAgAAACVTdG9yYWdlIGtleXMgZm9yIHRoZSB0aW1lbG9jayBtb2R1bGUuAAAAAAAAAAAAABJUaW1lbG9ja1N0b3JhZ2VLZXkAAAAAAAIAAAAAAAAAJ01pbmltdW0gZGVsYXkgaW4gbGVkZ2VycyBmb3Igb3BlcmF0aW9ucwAAAAAITWluRGVsYXkAAAABAAAAtk1hcHMgb3BlcmF0aW9uIElEIHRvIHRoZSBsZWRnZXIgc2VxdWVuY2UgbnVtYmVyIHdoZW4gaXQgd2lsbCBiZSBpbiBhCltgT3BlcmF0aW9uU3RhdGU6OlJlYWR5YF0gc3RhdGUgKE5vdGU6IHZhbHVlIGlzIDAgZm9yCltgT3BlcmF0aW9uU3RhdGU6OlVuc2V0YF0sIDEgZm9yIFtgT3BlcmF0aW9uU3RhdGU6OkRvbmVgXSkuAAAAAAAPT3BlcmF0aW9uTGVkZ2VyAAAAAAEAAAPuAAAAIA==", "AAAABAAAAAAAAAAAAAAAEVJvbGVUcmFuc2ZlckVycm9yAAAAAAAABAAAAAAAAAARTm9QZW5kaW5nVHJhbnNmZXIAAAAAAAiYAAAAAAAAABZJbnZhbGlkTGl2ZVVudGlsTGVkZ2VyAAAAAAiZAAAAAAAAABVJbnZhbGlkUGVuZGluZ0FjY291bnQAAAAAAAiaAAAAAAAAAA9UcmFuc2ZlckV4cGlyZWQAAAAImw==", "AAAAAQAAAEhTdG9yZXMgdGhlIHBlbmRpbmcgcm9sZSBob2xkZXIgYW5kIHRoZSBleHBsaWNpdCBkZWFkbGluZSBmb3IgYWNjZXB0YW5jZS4AAAAAAAAAD1BlbmRpbmdUcmFuc2ZlcgAAAAACAAAAAAAAAAdhZGRyZXNzAAAAABMAAAAAAAAAEWxpdmVfdW50aWxfbGVkZ2VyAAAAAAAABA==", "AAAABQAAACVFdmVudCBlbWl0dGVkIHdoZW4gYSByb2xlIGlzIGdyYW50ZWQuAAAAAAAAAAAAAAtSb2xlR3JhbnRlZAAAAAABAAAADHJvbGVfZ3JhbnRlZAAAAAMAAAAAAAAABHJvbGUAAAARAAAAAQAAAAAAAAAHYWNjb3VudAAAAAATAAAAAQAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAAAAAAI=", "AAAABQAAACVFdmVudCBlbWl0dGVkIHdoZW4gYSByb2xlIGlzIHJldm9rZWQuAAAAAAAAAAAAAAtSb2xlUmV2b2tlZAAAAAABAAAADHJvbGVfcmV2b2tlZAAAAAMAAAAAAAAABHJvbGUAAAARAAAAAQAAAAAAAAAHYWNjb3VudAAAAAATAAAAAQAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAAAAAAI=", "AAAABQAAAC9FdmVudCBlbWl0dGVkIHdoZW4gdGhlIGFkbWluIHJvbGUgaXMgcmVub3VuY2VkLgAAAAAAAAAADkFkbWluUmVub3VuY2VkAAAAAAABAAAAD2FkbWluX3Jlbm91bmNlZAAAAAABAAAAAAAAAAVhZG1pbgAAAAAAABMAAAABAAAAAg==", "AAAABQAAACtFdmVudCBlbWl0dGVkIHdoZW4gYSByb2xlIGFkbWluIGlzIGNoYW5nZWQuAAAAAAAAAAAQUm9sZUFkbWluQ2hhbmdlZAAAAAEAAAAScm9sZV9hZG1pbl9jaGFuZ2VkAAAAAAADAAAAAAAAAARyb2xlAAAAEQAAAAEAAAAAAAAAE3ByZXZpb3VzX2FkbWluX3JvbGUAAAAAEQAAAAAAAAAAAAAADm5ld19hZG1pbl9yb2xlAAAAAAARAAAAAAAAAAI=", "AAAABAAAAAAAAAAAAAAAEkFjY2Vzc0NvbnRyb2xFcnJvcgAAAAAACwAAAAAAAAAMVW5hdXRob3JpemVkAAAH0AAAAAAAAAALQWRtaW5Ob3RTZXQAAAAH0QAAAAAAAAAQSW5kZXhPdXRPZkJvdW5kcwAAB9IAAAAAAAAAEUFkbWluUm9sZU5vdEZvdW5kAAAAAAAH0wAAAAAAAAASUm9sZUNvdW50SXNOb3RaZXJvAAAAAAfUAAAAAAAAAAxSb2xlTm90Rm91bmQAAAfVAAAAAAAAAA9BZG1pbkFscmVhZHlTZXQAAAAH1gAAAAAAAAALUm9sZU5vdEhlbGQAAAAH1wAAAAAAAAALUm9sZUlzRW1wdHkAAAAH2AAAAAAAAAASVHJhbnNmZXJJblByb2dyZXNzAAAAAAfZAAAAAAAAABBNYXhSb2xlc0V4Y2VlZGVkAAAH2g==", "AAAABQAAADJFdmVudCBlbWl0dGVkIHdoZW4gYW4gYWRtaW4gdHJhbnNmZXIgaXMgY29tcGxldGVkLgAAAAAAAAAAABZBZG1pblRyYW5zZmVyQ29tcGxldGVkAAAAAAABAAAAGGFkbWluX3RyYW5zZmVyX2NvbXBsZXRlZAAAAAIAAAAAAAAACW5ld19hZG1pbgAAAAAAABMAAAABAAAAAAAAAA5wcmV2aW91c19hZG1pbgAAAAAAEwAAAAAAAAAC", "AAAABQAAADJFdmVudCBlbWl0dGVkIHdoZW4gYW4gYWRtaW4gdHJhbnNmZXIgaXMgaW5pdGlhdGVkLgAAAAAAAAAAABZBZG1pblRyYW5zZmVySW5pdGlhdGVkAAAAAAABAAAAGGFkbWluX3RyYW5zZmVyX2luaXRpYXRlZAAAAAMAAAAAAAAADWN1cnJlbnRfYWRtaW4AAAAAAAATAAAAAQAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAAAAAAAAAAAEWxpdmVfdW50aWxfbGVkZ2VyAAAAAAAABAAAAAAAAAAC", "AAAAAQAAADFTdG9yYWdlIGtleSBmb3IgZW51bWVyYXRpb24gb2YgYWNjb3VudHMgcGVyIHJvbGUuAAAAAAAAAAAAAA5Sb2xlQWNjb3VudEtleQAAAAAAAgAAAAAAAAAFaW5kZXgAAAAAAAAEAAAAAAAAAARyb2xlAAAAEQ==", "AAAAAgAAADxTdG9yYWdlIGtleXMgZm9yIHRoZSBkYXRhIGFzc29jaWF0ZWQgd2l0aCB0aGUgYWNjZXNzIGNvbnRyb2wAAAAAAAAAF0FjY2Vzc0NvbnRyb2xTdG9yYWdlS2V5AAAAAAcAAAAAAAAAAAAAAA1FeGlzdGluZ1JvbGVzAAAAAAAAAQAAAAAAAAAMUm9sZUFjY291bnRzAAAAAQAAB9AAAAAOUm9sZUFjY291bnRLZXkAAAAAAAEAAAAAAAAAB0hhc1JvbGUAAAAAAgAAABMAAAARAAAAAQAAAAAAAAARUm9sZUFjY291bnRzQ291bnQAAAAAAAABAAAAEQAAAAEAAAAAAAAACVJvbGVBZG1pbgAAAAAAAAEAAAARAAAAAAAAAAAAAAAFQWRtaW4AAAAAAAAAAAAAAAAAAAxQZW5kaW5nQWRtaW4=", "AAAABAAAAAAAAAAAAAAADE93bmFibGVFcnJvcgAAAAMAAAAAAAAAC093bmVyTm90U2V0AAAACDQAAAAAAAAAElRyYW5zZmVySW5Qcm9ncmVzcwAAAAAINQAAAAAAAAAPT3duZXJBbHJlYWR5U2V0AAAACDY=", "AAAABQAAADZFdmVudCBlbWl0dGVkIHdoZW4gYW4gb3duZXJzaGlwIHRyYW5zZmVyIGlzIGluaXRpYXRlZC4AAAAAAAAAAAART3duZXJzaGlwVHJhbnNmZXIAAAAAAAABAAAAEm93bmVyc2hpcF90cmFuc2ZlcgAAAAAAAwAAAAAAAAAJb2xkX293bmVyAAAAAAAAEwAAAAAAAAAAAAAACW5ld19vd25lcgAAAAAAABMAAAAAAAAAAAAAABFsaXZlX3VudGlsX2xlZGdlcgAAAAAAAAQAAAAAAAAAAg==", "AAAABQAAACpFdmVudCBlbWl0dGVkIHdoZW4gb3duZXJzaGlwIGlzIHJlbm91bmNlZC4AAAAAAAAAAAAST3duZXJzaGlwUmVub3VuY2VkAAAAAAABAAAAE293bmVyc2hpcF9yZW5vdW5jZWQAAAAAAQAAAAAAAAAJb2xkX293bmVyAAAAAAAAEwAAAAAAAAAC", "AAAABQAAADZFdmVudCBlbWl0dGVkIHdoZW4gYW4gb3duZXJzaGlwIHRyYW5zZmVyIGlzIGNvbXBsZXRlZC4AAAAAAAAAAAAaT3duZXJzaGlwVHJhbnNmZXJDb21wbGV0ZWQAAAAAAAEAAAAcb3duZXJzaGlwX3RyYW5zZmVyX2NvbXBsZXRlZAAAAAEAAAAAAAAACW5ld19vd25lcgAAAAAAABMAAAAAAAAAAg==", "AAAAAgAAACNTdG9yYWdlIGtleXMgZm9yIGBPd25hYmxlYCB1dGlsaXR5LgAAAAAAAAAAEU93bmFibGVTdG9yYWdlS2V5AAAAAAAAAgAAAAAAAAAAAAAABU93bmVyAAAAAAAAAAAAAAAAAAAMUGVuZGluZ093bmVy", "AAAAAgAAAONDb250ZXh0IG9mIGEgc2luZ2xlIGF1dGhvcml6ZWQgY2FsbCBwZXJmb3JtZWQgYnkgYW4gYWRkcmVzcy4KCkN1c3RvbSBhY2NvdW50IGNvbnRyYWN0cyB0aGF0IGltcGxlbWVudCBgX19jaGVja19hdXRoYCBzcGVjaWFsIGZ1bmN0aW9uCnJlY2VpdmUgYSBsaXN0IG9mIGBDb250ZXh0YCB2YWx1ZXMgY29ycmVzcG9uZGluZyB0byBhbGwgdGhlIGNhbGxzIHRoYXQKbmVlZCB0byBiZSBhdXRob3JpemVkLgAAAAAAAAAAB0NvbnRleHQAAAAAAwAAAAEAAAAUQ29udHJhY3QgaW52b2NhdGlvbi4AAAAIQ29udHJhY3QAAAABAAAH0AAAAA9Db250cmFjdENvbnRleHQAAAAAAQAAAD1Db250cmFjdCB0aGF0IGhhcyBhIGNvbnN0cnVjdG9yIHdpdGggbm8gYXJndW1lbnRzIGlzIGNyZWF0ZWQuAAAAAAAAFENyZWF0ZUNvbnRyYWN0SG9zdEZuAAAAAQAAB9AAAAAbQ3JlYXRlQ29udHJhY3RIb3N0Rm5Db250ZXh0AAAAAAEAAABEQ29udHJhY3QgdGhhdCBoYXMgYSBjb25zdHJ1Y3RvciB3aXRoIDEgb3IgbW9yZSBhcmd1bWVudHMgaXMgY3JlYXRlZC4AAAAcQ3JlYXRlQ29udHJhY3RXaXRoQ3Rvckhvc3RGbgAAAAEAAAfQAAAAKkNyZWF0ZUNvbnRyYWN0V2l0aENvbnN0cnVjdG9ySG9zdEZuQ29udGV4dAAA", "AAAAAQAAAL1BdXRob3JpemF0aW9uIGNvbnRleHQgb2YgYSBzaW5nbGUgY29udHJhY3QgY2FsbC4KClRoaXMgc3RydWN0IGNvcnJlc3BvbmRzIHRvIGEgYHJlcXVpcmVfYXV0aF9mb3JfYXJnc2AgY2FsbCBmb3IgYW4gYWRkcmVzcwpmcm9tIGBjb250cmFjdGAgZnVuY3Rpb24gd2l0aCBgZm5fbmFtZWAgbmFtZSBhbmQgYGFyZ3NgIGFyZ3VtZW50cy4AAAAAAAAAAAAAD0NvbnRyYWN0Q29udGV4dAAAAAADAAAAAAAAAARhcmdzAAAD6gAAAAAAAAAAAAAACGNvbnRyYWN0AAAAEwAAAAAAAAAHZm5fbmFtZQAAAAAR", "AAAAAgAAAF9Db250cmFjdCBleGVjdXRhYmxlIHVzZWQgZm9yIGNyZWF0aW5nIGEgbmV3IGNvbnRyYWN0IGFuZCB1c2VkIGluCmBDcmVhdGVDb250cmFjdEhvc3RGbkNvbnRleHRgLgAAAAAAAAAAEkNvbnRyYWN0RXhlY3V0YWJsZQAAAAAAAQAAAAEAAAAAAAAABFdhc20AAAABAAAD7gAAACA=", "AAAAAQAAADhWYWx1ZSBvZiBjb250cmFjdCBub2RlIGluIEludm9rZXJDb250cmFjdEF1dGhFbnRyeSB0cmVlLgAAAAAAAAAVU3ViQ29udHJhY3RJbnZvY2F0aW9uAAAAAAAAAgAAAAAAAAAHY29udGV4dAAAAAfQAAAAD0NvbnRyYWN0Q29udGV4dAAAAAAAAAAAD3N1Yl9pbnZvY2F0aW9ucwAAAAPqAAAH0AAAABhJbnZva2VyQ29udHJhY3RBdXRoRW50cnk=", "AAAAAgAAAS9BIG5vZGUgaW4gdGhlIHRyZWUgb2YgYXV0aG9yaXphdGlvbnMgcGVyZm9ybWVkIG9uIGJlaGFsZiBvZiB0aGUgY3VycmVudApjb250cmFjdCBhcyBpbnZva2VyIG9mIHRoZSBjb250cmFjdHMgZGVlcGVyIGluIHRoZSBjYWxsIHN0YWNrLgoKVGhpcyBpcyB1c2VkIGFzIGFuIGFyZ3VtZW50IG9mIGBhdXRob3JpemVfYXNfY3VycmVudF9jb250cmFjdGAgaG9zdCBmdW5jdGlvbi4KClRoaXMgdHJlZSBjb3JyZXNwb25kcyBgcmVxdWlyZV9hdXRoW19mb3JfYXJnc11gIGNhbGxzIG9uIGJlaGFsZiBvZiB0aGUKY3VycmVudCBjb250cmFjdC4AAAAAAAAAABhJbnZva2VyQ29udHJhY3RBdXRoRW50cnkAAAADAAAAAQAAABJJbnZva2UgYSBjb250cmFjdC4AAAAAAAhDb250cmFjdAAAAAEAAAfQAAAAFVN1YkNvbnRyYWN0SW52b2NhdGlvbgAAAAAAAAEAAAA1Q3JlYXRlIGEgY29udHJhY3QgcGFzc2luZyAwIGFyZ3VtZW50cyB0byBjb25zdHJ1Y3Rvci4AAAAAAAAUQ3JlYXRlQ29udHJhY3RIb3N0Rm4AAAABAAAH0AAAABtDcmVhdGVDb250cmFjdEhvc3RGbkNvbnRleHQAAAAAAQAAAD1DcmVhdGUgYSBjb250cmFjdCBwYXNzaW5nIDAgb3IgbW9yZSBhcmd1bWVudHMgdG8gY29uc3RydWN0b3IuAAAAAAAAHENyZWF0ZUNvbnRyYWN0V2l0aEN0b3JIb3N0Rm4AAAABAAAH0AAAACpDcmVhdGVDb250cmFjdFdpdGhDb25zdHJ1Y3Rvckhvc3RGbkNvbnRleHQAAA==", "AAAAAQAAAHZBdXRob3JpemF0aW9uIGNvbnRleHQgZm9yIGBjcmVhdGVfY29udHJhY3RgIGhvc3QgZnVuY3Rpb24gdGhhdCBjcmVhdGVzIGEKbmV3IGNvbnRyYWN0IG9uIGJlaGFsZiBvZiBhdXRob3JpemVyIGFkZHJlc3MuAAAAAAAAAAAAG0NyZWF0ZUNvbnRyYWN0SG9zdEZuQ29udGV4dAAAAAACAAAAAAAAAApleGVjdXRhYmxlAAAAAAfQAAAAEkNvbnRyYWN0RXhlY3V0YWJsZQAAAAAAAAAAAARzYWx0AAAD7gAAACA=", "AAAAAQAAANZBdXRob3JpemF0aW9uIGNvbnRleHQgZm9yIGBjcmVhdGVfY29udHJhY3RgIGhvc3QgZnVuY3Rpb24gdGhhdCBjcmVhdGVzIGEKbmV3IGNvbnRyYWN0IG9uIGJlaGFsZiBvZiBhdXRob3JpemVyIGFkZHJlc3MuClRoaXMgaXMgdGhlIHNhbWUgYXMgYENyZWF0ZUNvbnRyYWN0SG9zdEZuQ29udGV4dGAsIGJ1dCBhbHNvIGhhcwpjb250cmFjdCBjb25zdHJ1Y3RvciBhcmd1bWVudHMuAAAAAAAAAAAAKkNyZWF0ZUNvbnRyYWN0V2l0aENvbnN0cnVjdG9ySG9zdEZuQ29udGV4dAAAAAAAAwAAAAAAAAAQY29uc3RydWN0b3JfYXJncwAAA+oAAAAAAAAAAAAAAApleGVjdXRhYmxlAAAAAAfQAAAAEkNvbnRyYWN0RXhlY3V0YWJsZQAAAAAAAAAAAARzYWx0AAAD7gAAACA=", "AAAAAgAAAAAAAAAAAAAACkV4ZWN1dGFibGUAAAAAAAMAAAABAAAAAAAAAARXYXNtAAAAAQAAA+4AAAAgAAAAAAAAAAAAAAAMU3RlbGxhckFzc2V0AAAAAAAAAAAAAAAHQWNjb3VudAA="]),
      options
    );
  }

   static deploy<T = Client>({ owner, uri, name, symbol }: { owner: string | Address; uri: string; name: string; symbol: string }, options: MethodOptions & Omit<ContractClientOptions, 'contractId'> & { salt?: Uint8Array; address?: string; } & ({ wasmHash: Uint8Array | string; format?: "hex" | "base64"; externalRef?: never; } | { externalRef: ExternalExecutableRef; wasmHash?: never; format?: never; })): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({ owner, uri, name, symbol }, options);
  }
  public readonly fromJson = {
    mint : this.txFromJson<number>,  approve : this.txFromJson<void>,  balance : this.txFromJson<number>,  delegate : this.txFromJson<void>,  owner_of : this.txFromJson<string>,  transfer : this.txFromJson<void>,  get_owner : this.txFromJson<string | null>,  get_votes : this.txFromJson<bigint>,  batch_mint : this.txFromJson<number>,  get_delegate : this.txFromJson<string | null>,  transfer_from : this.txFromJson<void>,  mint_authority : this.txFromJson<boolean>,  accept_ownership : this.txFromJson<void>,  get_total_supply : this.txFromJson<bigint>,  renounce_ownership : this.txFromJson<void>,  set_mint_authority : this.txFromJson<void>,  transfer_ownership : this.txFromJson<void>,  get_votes_at_checkpoint : this.txFromJson<bigint>,  get_total_supply_at_checkpoint : this.txFromJson<bigint>
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
   * Build a topics filter row for the "BatchMint" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  batchMintEventFilter(topicValues?: { minter?: string | Address; to?: string | Address }): string[] {
    return this.spec.eventTopicFilter("BatchMint", topicValues);
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
   * Build a topics filter row for the "Frozen" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  frozenEventFilter(topicValues?: { account?: string | Address }): string[] {
    return this.spec.eventTopicFilter("Frozen", topicValues);
  }
  /**
   * Build a topics filter row for the "Unfrozen" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  unfrozenEventFilter(topicValues?: { account?: string | Address }): string[] {
    return this.spec.eventTopicFilter("Unfrozen", topicValues);
  }
  /**
   * Build a topics filter row for the "ComplianceConfigChanged" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  complianceConfigChangedEventFilter(): string[] {
    return this.spec.eventTopicFilter("ComplianceConfigChanged");
  }
  /**
   * Build a topics filter row for the "Merge" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  mergeEventFilter(topicValues?: { account?: string | Address }): string[] {
    return this.spec.eventTopicFilter("Merge", topicValues);
  }
  /**
   * Build a topics filter row for the "Deposit" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  depositEventFilter(topicValues?: { from?: string | Address; to?: string | Address }): string[] {
    return this.spec.eventTopicFilter("Deposit", topicValues);
  }
  /**
   * Build a topics filter row for the "Register" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  registerEventFilter(topicValues?: { account?: string | Address }): string[] {
    return this.spec.eventTopicFilter("Register", topicValues);
  }
  /**
   * Build a topics filter row for the "Transfer" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  transferEventFilter(topicValues?: { from?: string | Address; to?: string | Address }): string[] {
    return this.spec.eventTopicFilter("Transfer", topicValues);
  }
  /**
   * Build a topics filter row for the "Withdraw" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  withdrawEventFilter(topicValues?: { from?: string | Address; to?: string | Address }): string[] {
    return this.spec.eventTopicFilter("Withdraw", topicValues);
  }
  /**
   * Build a topics filter row for the "AuditorSet" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  auditorSetEventFilter(): string[] {
    return this.spec.eventTopicFilter("AuditorSet");
  }
  /**
   * Build a topics filter row for the "SetSpender" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  setSpenderEventFilter(topicValues?: { account?: string | Address; spender?: string | Address }): string[] {
    return this.spec.eventTopicFilter("SetSpender", topicValues);
  }
  /**
   * Build a topics filter row for the "VerifierSet" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  verifierSetEventFilter(): string[] {
    return this.spec.eventTopicFilter("VerifierSet");
  }
  /**
   * Build a topics filter row for the "RevokeSpender" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  revokeSpenderEventFilter(topicValues?: { account?: string | Address; spender?: string | Address }): string[] {
    return this.spec.eventTopicFilter("RevokeSpender", topicValues);
  }
  /**
   * Build a topics filter row for the "SpenderTransfer" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  spenderTransferEventFilter(topicValues?: { spender?: string | Address; from?: string | Address; to?: string | Address }): string[] {
    return this.spec.eventTopicFilter("SpenderTransfer", topicValues);
  }
  /**
   * Build a topics filter row for the "AddressAsFieldSet" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  addressAsFieldSetEventFilter(): string[] {
    return this.spec.eventTopicFilter("AddressAsFieldSet");
  }
  /**
   * Build a topics filter row for the "UnderlyingAssetSet" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  underlyingAssetSetEventFilter(): string[] {
    return this.spec.eventTopicFilter("UnderlyingAssetSet");
  }
  /**
   * Build a topics filter row for the "AuditorRotated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  auditorRotatedEventFilter(topicValues?: { auditor_id?: number }): string[] {
    return this.spec.eventTopicFilter("AuditorRotated", topicValues);
  }
  /**
   * Build a topics filter row for the "AuditorRegistered" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  auditorRegisteredEventFilter(topicValues?: { auditor_id?: number }): string[] {
    return this.spec.eventTopicFilter("AuditorRegistered", topicValues);
  }
  /**
   * Build a topics filter row for the "VerificationKeyUpdated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  verificationKeyUpdatedEventFilter(topicValues?: { circuit_type?: CircuitType }): string[] {
    return this.spec.eventTopicFilter("VerificationKeyUpdated", topicValues);
  }
  /**
   * Build a topics filter row for the "VerificationKeyRegistered" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  verificationKeyRegisteredEventFilter(topicValues?: { circuit_type?: CircuitType }): string[] {
    return this.spec.eventTopicFilter("VerificationKeyRegistered", topicValues);
  }
  /**
   * Build a topics filter row for the "ConsecutiveMint" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  consecutiveMintEventFilter(topicValues?: { to?: string | Address }): string[] {
    return this.spec.eventTopicFilter("ConsecutiveMint", topicValues);
  }
  /**
   * Build a topics filter row for the "Burn" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  burnEventFilter(topicValues?: { from?: string | Address }): string[] {
    return this.spec.eventTopicFilter("Burn", topicValues);
  }
  /**
   * Build a topics filter row for the "SetTokenRoyalty" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  setTokenRoyaltyEventFilter(topicValues?: { receiver?: string | Address; token_id?: number }): string[] {
    return this.spec.eventTopicFilter("SetTokenRoyalty", topicValues);
  }
  /**
   * Build a topics filter row for the "SetDefaultRoyalty" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  setDefaultRoyaltyEventFilter(topicValues?: { receiver?: string | Address }): string[] {
    return this.spec.eventTopicFilter("SetDefaultRoyalty", topicValues);
  }
  /**
   * Build a topics filter row for the "RemoveTokenRoyalty" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  removeTokenRoyaltyEventFilter(topicValues?: { token_id?: number }): string[] {
    return this.spec.eventTopicFilter("RemoveTokenRoyalty", topicValues);
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
   * Build a topics filter row for the "Transfer" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value. This targets declaration 2 of the "Transfer" event in the contract spec. Note: renamed from "transferEventFilter" to avoid a collision with another generated name.
   */
  transferEventFilter2(topicValues?: { from?: string | Address; to?: string | Address }): string[] {
    return this.spec.eventTopicFilter("Transfer", topicValues, 1);
  }
  /**
   * Build a topics filter row for the "ApproveForAll" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  approveForAllEventFilter(topicValues?: { owner?: string | Address }): string[] {
    return this.spec.eventTopicFilter("ApproveForAll", topicValues);
  }
  /**
   * Build a topics filter row for the "ModuleAdded" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  moduleAddedEventFilter(topicValues?: { hook?: ComplianceHook }): string[] {
    return this.spec.eventTopicFilter("ModuleAdded", topicValues);
  }
  /**
   * Build a topics filter row for the "ModuleRemoved" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  moduleRemovedEventFilter(topicValues?: { hook?: ComplianceHook }): string[] {
    return this.spec.eventTopicFilter("ModuleRemoved", topicValues);
  }
  /**
   * Build a topics filter row for the "MaxBalanceSet" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  maxBalanceSetEventFilter(topicValues?: { token?: string | Address }): string[] {
    return this.spec.eventTopicFilter("MaxBalanceSet", topicValues);
  }
  /**
   * Build a topics filter row for the "IdBalancePreset" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  idBalancePresetEventFilter(topicValues?: { token?: string | Address; identity?: string | Address }): string[] {
    return this.spec.eventTopicFilter("IdBalancePreset", topicValues);
  }
  /**
   * Build a topics filter row for the "PresetCompleted" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  presetCompletedEventFilter(topicValues?: { token?: string | Address }): string[] {
    return this.spec.eventTopicFilter("PresetCompleted", topicValues);
  }
  /**
   * Build a topics filter row for the "SupplyLimitSet" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  supplyLimitSetEventFilter(topicValues?: { token?: string | Address }): string[] {
    return this.spec.eventTopicFilter("SupplyLimitSet", topicValues);
  }
  /**
   * Build a topics filter row for the "PresetCompleted" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value. This targets declaration 2 of the "PresetCompleted" event in the contract spec. Note: renamed from "presetCompletedEventFilter" to avoid a collision with another generated name.
   */
  presetCompletedEventFilter2(topicValues?: { token?: string | Address }): string[] {
    return this.spec.eventTopicFilter("PresetCompleted", topicValues, 1);
  }
  /**
   * Build a topics filter row for the "SupplyCountUpdated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  supplyCountUpdatedEventFilter(topicValues?: { token?: string | Address }): string[] {
    return this.spec.eventTopicFilter("SupplyCountUpdated", topicValues);
  }
  /**
   * Build a topics filter row for the "CountryAllowed" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  countryAllowedEventFilter(topicValues?: { token?: string | Address }): string[] {
    return this.spec.eventTopicFilter("CountryAllowed", topicValues);
  }
  /**
   * Build a topics filter row for the "CountryUnallowed" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  countryUnallowedEventFilter(topicValues?: { token?: string | Address }): string[] {
    return this.spec.eventTopicFilter("CountryUnallowed", topicValues);
  }
  /**
   * Build a topics filter row for the "UserAllowed" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  userAllowedEventFilter(topicValues?: { token?: string | Address }): string[] {
    return this.spec.eventTopicFilter("UserAllowed", topicValues);
  }
  /**
   * Build a topics filter row for the "UserDisallowed" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  userDisallowedEventFilter(topicValues?: { token?: string | Address }): string[] {
    return this.spec.eventTopicFilter("UserDisallowed", topicValues);
  }
  /**
   * Build a topics filter row for the "CountryRestricted" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  countryRestrictedEventFilter(topicValues?: { token?: string | Address }): string[] {
    return this.spec.eventTopicFilter("CountryRestricted", topicValues);
  }
  /**
   * Build a topics filter row for the "CountryUnrestricted" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  countryUnrestrictedEventFilter(topicValues?: { token?: string | Address }): string[] {
    return this.spec.eventTopicFilter("CountryUnrestricted", topicValues);
  }
  /**
   * Build a topics filter row for the "LockupPeriodSet" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  lockupPeriodSetEventFilter(topicValues?: { token?: string | Address }): string[] {
    return this.spec.eventTopicFilter("LockupPeriodSet", topicValues);
  }
  /**
   * Build a topics filter row for the "PresetCompleted" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value. This targets declaration 3 of the "PresetCompleted" event in the contract spec. Note: renamed from "presetCompletedEventFilter" to avoid a collision with another generated name.
   */
  presetCompletedEventFilter3(topicValues?: { token?: string | Address }): string[] {
    return this.spec.eventTopicFilter("PresetCompleted", topicValues, 2);
  }
  /**
   * Build a topics filter row for the "LockupStatePreset" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  lockupStatePresetEventFilter(topicValues?: { token?: string | Address; wallet?: string | Address }): string[] {
    return this.spec.eventTopicFilter("LockupStatePreset", topicValues);
  }
  /**
   * Build a topics filter row for the "TimeTransferLimitSet" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  timeTransferLimitSetEventFilter(topicValues?: { token?: string | Address }): string[] {
    return this.spec.eventTopicFilter("TimeTransferLimitSet", topicValues);
  }
  /**
   * Build a topics filter row for the "TimeTransferLimitRemoved" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  timeTransferLimitRemovedEventFilter(topicValues?: { token?: string | Address }): string[] {
    return this.spec.eventTopicFilter("TimeTransferLimitRemoved", topicValues);
  }
  /**
   * Build a topics filter row for the "DocumentRemoved" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  documentRemovedEventFilter(topicValues?: { name?: Uint8Array }): string[] {
    return this.spec.eventTopicFilter("DocumentRemoved", topicValues);
  }
  /**
   * Build a topics filter row for the "DocumentUpdated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  documentUpdatedEventFilter(topicValues?: { name?: Uint8Array }): string[] {
    return this.spec.eventTopicFilter("DocumentUpdated", topicValues);
  }
  /**
   * Build a topics filter row for the "Burn" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value. This targets declaration 2 of the "Burn" event in the contract spec. Note: renamed from "burnEventFilter" to avoid a collision with another generated name.
   */
  burnEventFilter2(topicValues?: { from?: string | Address }): string[] {
    return this.spec.eventTopicFilter("Burn", topicValues, 1);
  }
  /**
   * Build a topics filter row for the "Mint" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value. This targets declaration 2 of the "Mint" event in the contract spec. Note: renamed from "mintEventFilter" to avoid a collision with another generated name.
   */
  mintEventFilter2(topicValues?: { to?: string | Address }): string[] {
    return this.spec.eventTopicFilter("Mint", topicValues, 1);
  }
  /**
   * Build a topics filter row for the "KeyAllowed" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  keyAllowedEventFilter(topicValues?: { public_key?: Uint8Array }): string[] {
    return this.spec.eventTopicFilter("KeyAllowed", topicValues);
  }
  /**
   * Build a topics filter row for the "KeyRemoved" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  keyRemovedEventFilter(topicValues?: { public_key?: Uint8Array }): string[] {
    return this.spec.eventTopicFilter("KeyRemoved", topicValues);
  }
  /**
   * Build a topics filter row for the "ClaimRevoked" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  claimRevokedEventFilter(topicValues?: { identity?: string | Address; claim_topic?: number; revoked?: boolean }): string[] {
    return this.spec.eventTopicFilter("ClaimRevoked", topicValues);
  }
  /**
   * Build a topics filter row for the "SignaturesInvalidated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  signaturesInvalidatedEventFilter(topicValues?: { identity?: string | Address; claim_topic?: number }): string[] {
    return this.spec.eventTopicFilter("SignaturesInvalidated", topicValues);
  }
  /**
   * Build a topics filter row for the "ClaimAdded" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  claimAddedEventFilter(topicValues?: { claim?: Claim }): string[] {
    return this.spec.eventTopicFilter("ClaimAdded", topicValues);
  }
  /**
   * Build a topics filter row for the "ClaimChanged" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  claimChangedEventFilter(topicValues?: { claim?: Claim }): string[] {
    return this.spec.eventTopicFilter("ClaimChanged", topicValues);
  }
  /**
   * Build a topics filter row for the "ClaimRemoved" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  claimRemovedEventFilter(topicValues?: { claim?: Claim }): string[] {
    return this.spec.eventTopicFilter("ClaimRemoved", topicValues);
  }
  /**
   * Build a topics filter row for the "ClaimTopicAdded" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  claimTopicAddedEventFilter(topicValues?: { claim_topic?: number }): string[] {
    return this.spec.eventTopicFilter("ClaimTopicAdded", topicValues);
  }
  /**
   * Build a topics filter row for the "ClaimTopicRemoved" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  claimTopicRemovedEventFilter(topicValues?: { claim_topic?: number }): string[] {
    return this.spec.eventTopicFilter("ClaimTopicRemoved", topicValues);
  }
  /**
   * Build a topics filter row for the "TrustedIssuerAdded" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  trustedIssuerAddedEventFilter(topicValues?: { trusted_issuer?: string | Address }): string[] {
    return this.spec.eventTopicFilter("TrustedIssuerAdded", topicValues);
  }
  /**
   * Build a topics filter row for the "IssuerTopicsUpdated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  issuerTopicsUpdatedEventFilter(topicValues?: { trusted_issuer?: string | Address }): string[] {
    return this.spec.eventTopicFilter("IssuerTopicsUpdated", topicValues);
  }
  /**
   * Build a topics filter row for the "TrustedIssuerRemoved" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  trustedIssuerRemovedEventFilter(topicValues?: { trusted_issuer?: string | Address }): string[] {
    return this.spec.eventTopicFilter("TrustedIssuerRemoved", topicValues);
  }
  /**
   * Build a topics filter row for the "IdentityStored" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  identityStoredEventFilter(topicValues?: { account?: string | Address; identity?: string | Address }): string[] {
    return this.spec.eventTopicFilter("IdentityStored", topicValues);
  }
  /**
   * Build a topics filter row for the "CountryDataAdded" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  countryDataAddedEventFilter(topicValues?: { account?: string | Address }): string[] {
    return this.spec.eventTopicFilter("CountryDataAdded", topicValues);
  }
  /**
   * Build a topics filter row for the "IdentityUnstored" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  identityUnstoredEventFilter(topicValues?: { account?: string | Address; identity?: string | Address }): string[] {
    return this.spec.eventTopicFilter("IdentityUnstored", topicValues);
  }
  /**
   * Build a topics filter row for the "IdentityRecovered" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  identityRecoveredEventFilter(topicValues?: { old_account?: string | Address; new_account?: string | Address }): string[] {
    return this.spec.eventTopicFilter("IdentityRecovered", topicValues);
  }
  /**
   * Build a topics filter row for the "CountryDataRemoved" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  countryDataRemovedEventFilter(topicValues?: { account?: string | Address }): string[] {
    return this.spec.eventTopicFilter("CountryDataRemoved", topicValues);
  }
  /**
   * Build a topics filter row for the "CountryDataModified" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  countryDataModifiedEventFilter(topicValues?: { account?: string | Address }): string[] {
    return this.spec.eventTopicFilter("CountryDataModified", topicValues);
  }
  /**
   * Build a topics filter row for the "TokensFrozen" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  tokensFrozenEventFilter(topicValues?: { user_address?: string | Address }): string[] {
    return this.spec.eventTopicFilter("TokensFrozen", topicValues);
  }
  /**
   * Build a topics filter row for the "AddressFrozen" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  addressFrozenEventFilter(topicValues?: { user_address?: string | Address; is_frozen?: boolean }): string[] {
    return this.spec.eventTopicFilter("AddressFrozen", topicValues);
  }
  /**
   * Build a topics filter row for the "ComplianceSet" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  complianceSetEventFilter(topicValues?: { compliance?: string | Address }): string[] {
    return this.spec.eventTopicFilter("ComplianceSet", topicValues);
  }
  /**
   * Build a topics filter row for the "TokensUnfrozen" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  tokensUnfrozenEventFilter(topicValues?: { user_address?: string | Address }): string[] {
    return this.spec.eventTopicFilter("TokensUnfrozen", topicValues);
  }
  /**
   * Build a topics filter row for the "RecoverySuccess" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  recoverySuccessEventFilter(topicValues?: { old_account?: string | Address; new_account?: string | Address }): string[] {
    return this.spec.eventTopicFilter("RecoverySuccess", topicValues);
  }
  /**
   * Build a topics filter row for the "IdentityVerifierSet" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  identityVerifierSetEventFilter(topicValues?: { identity_verifier?: string | Address }): string[] {
    return this.spec.eventTopicFilter("IdentityVerifierSet", topicValues);
  }
  /**
   * Build a topics filter row for the "TokenOnchainIdUpdated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  tokenOnchainIdUpdatedEventFilter(topicValues?: { onchain_id?: string | Address }): string[] {
    return this.spec.eventTopicFilter("TokenOnchainIdUpdated", topicValues);
  }
  /**
   * Build a topics filter row for the "ClaimTopicsAndIssuersSet" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  claimTopicsAndIssuersSetEventFilter(topicValues?: { claim_topics_and_issuers?: string | Address }): string[] {
    return this.spec.eventTopicFilter("ClaimTopicsAndIssuersSet", topicValues);
  }
  /**
   * Build a topics filter row for the "IdentityRegistryStorageSet" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  identityRegistryStorageSetEventFilter(topicValues?: { identity_registry_storage?: string | Address }): string[] {
    return this.spec.eventTopicFilter("IdentityRegistryStorageSet", topicValues);
  }
  /**
   * Build a topics filter row for the "TokenBound" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  tokenBoundEventFilter(topicValues?: { token?: string | Address }): string[] {
    return this.spec.eventTopicFilter("TokenBound", topicValues);
  }
  /**
   * Build a topics filter row for the "TokenUnbound" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  tokenUnboundEventFilter(topicValues?: { token?: string | Address }): string[] {
    return this.spec.eventTopicFilter("TokenUnbound", topicValues);
  }
  /**
   * Build a topics filter row for the "Deposit" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value. This targets declaration 2 of the "Deposit" event in the contract spec. Note: renamed from "depositEventFilter" to avoid a collision with another generated name.
   */
  depositEventFilter2(topicValues?: { operator?: string | Address; from?: string | Address; receiver?: string | Address }): string[] {
    return this.spec.eventTopicFilter("Deposit", topicValues, 1);
  }
  /**
   * Build a topics filter row for the "Withdraw" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value. This targets declaration 2 of the "Withdraw" event in the contract spec. Note: renamed from "withdrawEventFilter" to avoid a collision with another generated name.
   */
  withdrawEventFilter2(topicValues?: { operator?: string | Address; receiver?: string | Address; owner?: string | Address }): string[] {
    return this.spec.eventTopicFilter("Withdraw", topicValues, 1);
  }
  /**
   * Build a topics filter row for the "Burn" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value. This targets declaration 3 of the "Burn" event in the contract spec. Note: renamed from "burnEventFilter" to avoid a collision with another generated name.
   */
  burnEventFilter3(topicValues?: { from?: string | Address }): string[] {
    return this.spec.eventTopicFilter("Burn", topicValues, 2);
  }
  /**
   * Build a topics filter row for the "UserAllowed" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value. This targets declaration 2 of the "UserAllowed" event in the contract spec. Note: renamed from "userAllowedEventFilter" to avoid a collision with another generated name.
   */
  userAllowedEventFilter2(topicValues?: { user?: string | Address }): string[] {
    return this.spec.eventTopicFilter("UserAllowed", topicValues, 1);
  }
  /**
   * Build a topics filter row for the "UserDisallowed" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value. This targets declaration 2 of the "UserDisallowed" event in the contract spec. Note: renamed from "userDisallowedEventFilter" to avoid a collision with another generated name.
   */
  userDisallowedEventFilter2(topicValues?: { user?: string | Address }): string[] {
    return this.spec.eventTopicFilter("UserDisallowed", topicValues, 1);
  }
  /**
   * Build a topics filter row for the "UserBlocked" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  userBlockedEventFilter(topicValues?: { user?: string | Address }): string[] {
    return this.spec.eventTopicFilter("UserBlocked", topicValues);
  }
  /**
   * Build a topics filter row for the "UserUnblocked" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  userUnblockedEventFilter(topicValues?: { user?: string | Address }): string[] {
    return this.spec.eventTopicFilter("UserUnblocked", topicValues);
  }
  /**
   * Build a topics filter row for the "Mint" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value. This targets declaration 3 of the "Mint" event in the contract spec. Note: renamed from "mintEventFilter" to avoid a collision with another generated name.
   */
  mintEventFilter3(topicValues?: { to?: string | Address }): string[] {
    return this.spec.eventTopicFilter("Mint", topicValues, 2);
  }
  /**
   * Build a topics filter row for the "Approve" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value. This targets declaration 2 of the "Approve" event in the contract spec. Note: renamed from "approveEventFilter" to avoid a collision with another generated name.
   */
  approveEventFilter2(topicValues?: { owner?: string | Address; spender?: string | Address }): string[] {
    return this.spec.eventTopicFilter("Approve", topicValues, 1);
  }
  /**
   * Build a topics filter row for the "Transfer" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value. This targets declaration 3 of the "Transfer" event in the contract spec. Note: renamed from "transferEventFilter" to avoid a collision with another generated name.
   */
  transferEventFilter3(topicValues?: { from?: string | Address; to?: string | Address }): string[] {
    return this.spec.eventTopicFilter("Transfer", topicValues, 2);
  }
  /**
   * Build a topics filter row for the "MuxedTransfer" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  muxedTransferEventFilter(topicValues?: { from?: string | Address; to?: string | Address }): string[] {
    return this.spec.eventTopicFilter("MuxedTransfer", topicValues);
  }
  /**
   * Build a topics filter row for the "SetRoot" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  setRootEventFilter(): string[] {
    return this.spec.eventTopicFilter("SetRoot");
  }
  /**
   * Build a topics filter row for the "SetClaimed" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  setClaimedEventFilter(): string[] {
    return this.spec.eventTopicFilter("SetClaimed");
  }
  /**
   * Build a topics filter row for the "Paused" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  pausedEventFilter(): string[] {
    return this.spec.eventTopicFilter("Paused");
  }
  /**
   * Build a topics filter row for the "Unpaused" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  unpausedEventFilter(): string[] {
    return this.spec.eventTopicFilter("Unpaused");
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
   * Build a topics filter row for the "ProposalQueued" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  proposalQueuedEventFilter(topicValues?: { proposal_id?: Uint8Array }): string[] {
    return this.spec.eventTopicFilter("ProposalQueued", topicValues);
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
  /**
   * Build a topics filter row for the "MinDelayChanged" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  minDelayChangedEventFilter(): string[] {
    return this.spec.eventTopicFilter("MinDelayChanged");
  }
  /**
   * Build a topics filter row for the "OperationExecuted" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  operationExecutedEventFilter(topicValues?: { id?: Uint8Array; target?: string | Address }): string[] {
    return this.spec.eventTopicFilter("OperationExecuted", topicValues);
  }
  /**
   * Build a topics filter row for the "OperationCancelled" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  operationCancelledEventFilter(topicValues?: { id?: Uint8Array }): string[] {
    return this.spec.eventTopicFilter("OperationCancelled", topicValues);
  }
  /**
   * Build a topics filter row for the "OperationScheduled" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  operationScheduledEventFilter(topicValues?: { id?: Uint8Array; target?: string | Address }): string[] {
    return this.spec.eventTopicFilter("OperationScheduled", topicValues);
  }
  /**
   * Build a topics filter row for the "RoleGranted" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  roleGrantedEventFilter(topicValues?: { role?: string; account?: string | Address }): string[] {
    return this.spec.eventTopicFilter("RoleGranted", topicValues);
  }
  /**
   * Build a topics filter row for the "RoleRevoked" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  roleRevokedEventFilter(topicValues?: { role?: string; account?: string | Address }): string[] {
    return this.spec.eventTopicFilter("RoleRevoked", topicValues);
  }
  /**
   * Build a topics filter row for the "AdminRenounced" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  adminRenouncedEventFilter(topicValues?: { admin?: string | Address }): string[] {
    return this.spec.eventTopicFilter("AdminRenounced", topicValues);
  }
  /**
   * Build a topics filter row for the "RoleAdminChanged" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  roleAdminChangedEventFilter(topicValues?: { role?: string }): string[] {
    return this.spec.eventTopicFilter("RoleAdminChanged", topicValues);
  }
  /**
   * Build a topics filter row for the "AdminTransferCompleted" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  adminTransferCompletedEventFilter(topicValues?: { new_admin?: string | Address }): string[] {
    return this.spec.eventTopicFilter("AdminTransferCompleted", topicValues);
  }
  /**
   * Build a topics filter row for the "AdminTransferInitiated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  adminTransferInitiatedEventFilter(topicValues?: { current_admin?: string | Address }): string[] {
    return this.spec.eventTopicFilter("AdminTransferInitiated", topicValues);
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
}