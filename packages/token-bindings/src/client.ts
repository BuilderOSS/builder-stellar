import {ContractEvent} from './types.js';
import {Spec, AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, ExternalExecutableRef} from '@stellar/stellar-sdk/contract';
import {Address, xdr} from '@stellar/stellar-sdk';

export interface Client {
  /**
   * Mints the next sequential token id to `to` (minter auth; the minter must
   * be the admin or, once live, hold mint authority). A recipient without a
   * delegate is self-delegated so it can vote immediately. Emits
   * OpenZeppelin `Mint` plus `MintWithMinter`. Returns the token id.
   */
  mint({ minter, to }: { minter: string | Address; to: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * Module admin: the launch admin during setup, the Treasury once live.
   */
  admin(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * One-shot, Manager-only launch handoff (Setup -> Live).
   *
   * Hands the admin to `treasury`, grants mint authority to exactly
   * `minters` (which must contain the treasury), marks the token live and
   * emits `TokenLaunched`. A second call panics with `AlreadyLive`, so after
   * launch the Manager has no authority over the token.
   */
  launch({ treasury, minters }: { treasury: string | Address; minters: Array<string | Address> }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Approves `spender` to transfer `token_id` until `expiration_ledger`
   * (`owner` auth). Emits OpenZeppelin `Approve`.
   */
  approve({ owner, spender, token_id, expiration_ledger }: { owner: string | Address; spender: string | Address; token_id: number; expiration_ledger: number }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Number of tokens owned by `account`.
   */
  balance({ account }: { account: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * Whether the token has been launched (Setup -> Live).
   */
  is_live(options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  /**
   * Advance the storage layout after an upgrade (admin only).
   */
  migrate(options?: MethodOptions): Promise<AssembledTransaction<void>>;
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
   * Owner of `token_id`. Panics if the token does not exist.
   */
  owner_of({ token_id }: { token_id: number }, options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * Transfers `token_id` from `from` (auth) to `to`, moving the voting unit
   * between their delegates. A recipient without a delegate is
   * self-delegated. Emits OpenZeppelin `Transfer`.
   */
  transfer({ from, to, token_id }: { from: string | Address; to: string | Address; token_id: number }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
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
   * Mints `amounts[i]` sequential tokens to each `recipients[i]` in one call
   * (same authority rules as `mint`). The batch must fit the event budget
   * (`common::batch_mint_fits`, `BatchTooLarge`): at most
   * `common::MAX_BATCH_MINT` tokens to one recipient, or
   * `common::MAX_BATCH_RECIPIENTS` recipients of one token each. Each new
   * recipient adds delegation events on top of the per-token cost. The cap
   * also bounds the metadata hook.
   *
   * Delegation, balance and vote checkpoints are touched once per recipient
   * entry rather than once per token, which keeps the footprint small.
   * Emits OpenZeppelin `Mint` per token and one `MintBatchWithMinter` for
   * the whole range. Returns every new token id in order.
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
   * Updates collection metadata (admin only). Emits `MetadataUpdated`.
   */
  set_metadata({ uri, name, symbol }: { uri: string; name: string; symbol: string }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Re-reads the version for the active WASM hash from the Manager registry.
   */
  sync_version(options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Voting-capable supply: every minted token except those held by the
   * Treasury, Auction and Marketplace. The Manager requires it to be
   * positive at launch, so a DAO can never launch without a single vote.
   */
  total_supply(options?: MethodOptions): Promise<AssembledTransaction<bigint>>;
  /**
   * Like `transfer`, by an approved `spender` (auth).
   */
  transfer_from({ spender, from, to, token_id }: { spender: string | Address; from: string | Address; to: string | Address; token_id: number }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Whether `authority` holds explicit minting authority. The admin always
   * has implicit authority without an entry.
   */
  mint_authority({ authority }: { authority: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  /**
   * Number of vote checkpoints recorded for `account`.
   */
  num_checkpoints({ account }: { account: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * Storage-layout version of the data held by this contract.
   */
  storage_version(options?: MethodOptions): Promise<AssembledTransaction<number>>;
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
   * Grants or revokes minting authority (admin only, live token only; the
   * launch writes the initial set). Emits `MintAuthorityChanged`.
   */
  set_mint_authority({ authority, enabled }: { authority: string | Address; enabled: boolean }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
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
      new Spec(["AAAABAAAADNUb2tlbiBlcnJvcnMgKGJsb2NrIGBjb21tb246OmVycm9yOjpjb2Rlczo6VE9LRU5gKS4AAAAAAAAAAApUb2tlbkVycm9yAAAAAAAFAAAAJ01pbnRlciBpcyBub3QgYXV0aG9yaXplZCB0byBtaW50IHRva2VucwAAAAAXTWludEF1dGhvcml0eU5vdEFsbG93ZWQAAAAcIQAAAEFJbnZhbGlkIGlucHV0IHBhcmFtZXRlcnMgKG1pc21hdGNoZWQgbGVuZ3RocywgemVybyBhbW91bnRzLCBldGMuKQAAAAAAAAxJbnZhbGlkSW5wdXQAABwiAAAAQWBsYXVuY2hgIHRyZWFzdXJ5IGRpZmZlcnMgZnJvbSB0aGUgdHJlYXN1cnkgd2lyZWQgYXQgY29uc3RydWN0aW9uAAAAAAAAEFRyZWFzdXJ5TWlzbWF0Y2gAABwjAAAAM2BsYXVuY2hgIG1pbnRlcnMgbGlzdCBkb2VzIG5vdCBjb250YWluIHRoZSB0cmVhc3VyeQAAAAARVHJlYXN1cnlOb3RNaW50ZXIAAAAAABwkAAAAQWBiYXRjaF9taW50YCBleGNlZWRzIHRoZSBldmVudCBidWRnZXQgKGBjb21tb246OmJhdGNoX21pbnRfZml0c2ApAAAAAAAADUJhdGNoVG9vTGFyZ2UAAAAAABwl", "AAAABQAAAEFFbWl0dGVkIG9uY2Ugd2hlbiB0aGUgTWFuYWdlciBsYXVuY2hlcyB0aGUgdG9rZW4gKFNldHVwIC0+IExpdmUpLgAAAAAAAAAAAAANVG9rZW5MYXVuY2hlZAAAAAAAAAEAAAAOdG9rZW5fbGF1bmNoZWQAAAAAAAIAAAAAAAAACHRyZWFzdXJ5AAAAEwAAAAEAAAAAAAAAB21pbnRlcnMAAAAD6gAAABMAAAAAAAAAAg==", "AAAABQAAAMJFbWl0dGVkIGZvciBldmVyeSB0b2tlbiBtaW50ZWQgYnkgYG1pbnRgLCBuZXh0IHRvIE9wZW5aZXBwZWxpbidzIGBNaW50YCwgdG8KcmVjb3JkIHdobyBwZXJmb3JtZWQgdGhlIG1pbnQgKGFkbWluLCBhdWN0aW9uLCBtYXJrZXRwbGFjZSwgbWludGVyKS4KYGJhdGNoX21pbnRgIGVtaXRzIGBNaW50QmF0Y2hXaXRoTWludGVyYCBpbnN0ZWFkLgAAAAAAAAAAAA5NaW50V2l0aE1pbnRlcgAAAAAAAQAAABBtaW50X3dpdGhfbWludGVyAAAAAwAAAAAAAAAGbWludGVyAAAAAAATAAAAAQAAAAAAAAACdG8AAAAAABMAAAABAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAAAAAAAAg==", "AAAABQAAAIdFbWl0dGVkIGJ5IGBzZXRfbWV0YWRhdGFgIChhZG1pbiBvbmx5KS4gT3BlblplcHBlbGluJ3MgYHNldF9tZXRhZGF0YWAKd3JpdGVzIHN0b3JhZ2Ugc2lsZW50bHk7IHRoaXMgbWFrZXMgYSByZW5hbWUgdmlzaWJsZSB0byBpbmRleGVycy4AAAAAAAAAAA9NZXRhZGF0YVVwZGF0ZWQAAAAAAQAAABBtZXRhZGF0YV91cGRhdGVkAAAAAwAAAAAAAAAEbmFtZQAAABAAAAAAAAAAAAAAAAZzeW1ib2wAAAAAABAAAAAAAAAAAAAAAAN1cmkAAAAAEAAAAAAAAAAC", "AAAABQAAACBFbWl0dGVkIG9uY2UgYnkgdGhlIGNvbnN0cnVjdG9yLgAAAAAAAAAQVG9rZW5Jbml0aWFsaXplZAAAAAEAAAARdG9rZW5faW5pdGlhbGl6ZWQAAAAAAAAFAAAAAAAAAAVhZG1pbgAAAAAAABMAAAABAAAAAAAAAAN1cmkAAAAAEAAAAAAAAAAAAAAABG5hbWUAAAAQAAAAAAAAAAAAAAAGc3ltYm9sAAAAAAAQAAAAAAAAAAAAAAAHdmVyc2lvbgAAAAAQAAAAAAAAAAI=", "AAAABQAAAQlFbWl0dGVkIG9uY2UgcGVyIGBiYXRjaF9taW50YCBjYWxsIGZvciB0aGUgY29udGlndW91cyByYW5nZQpgW2ZpcnN0X3Rva2VuX2lkLCBmaXJzdF90b2tlbl9pZCArIGNvdW50KWAsIGluc3RlYWQgb2Ygb25lCmBNaW50V2l0aE1pbnRlcmAgcGVyIHRva2VuIChrZWVwcyBsYXJnZSBiYXRjaGVzIHVuZGVyIHRoZSBwZXItdHJhbnNhY3Rpb24KZXZlbnQgc2l6ZSBsaW1pdCkuIFJlY2lwaWVudHMgY29tZSBmcm9tIE9wZW5aZXBwZWxpbidzIHBlci10b2tlbiBgTWludGAuAAAAAAAAAAAAABNNaW50QmF0Y2hXaXRoTWludGVyAAAAAAEAAAAWbWludF9iYXRjaF93aXRoX21pbnRlcgAAAAAAAwAAAAAAAAAGbWludGVyAAAAAAATAAAAAQAAAAAAAAAOZmlyc3RfdG9rZW5faWQAAAAAAAQAAAAAAAAAAAAAAAVjb3VudAAAAAAAAAQAAAAAAAAAAg==", "AAAABQAAAERFbWl0dGVkIHdoZW4gbWludGluZyBhdXRob3JpdHkgaXMgZ3JhbnRlZCBvciByZXZva2VkIGZvciBhbiBhZGRyZXNzLgAAAAAAAAAUTWludEF1dGhvcml0eUNoYW5nZWQAAAABAAAAFm1pbnRfYXV0aG9yaXR5X2NoYW5nZWQAAAAAAAQAAAAAAAAACWF1dGhvcml0eQAAAAAAABMAAAABAAAAAAAAAAtvbGRfZW5hYmxlZAAAAAABAAAAAAAAAAAAAAAHZW5hYmxlZAAAAAABAAAAAAAAAAAAAAAKY2hhbmdlZF9ieQAAAAAAEwAAAAAAAAAC", "AAAAAAAAAQ5NaW50cyB0aGUgbmV4dCBzZXF1ZW50aWFsIHRva2VuIGlkIHRvIGB0b2AgKG1pbnRlciBhdXRoOyB0aGUgbWludGVyIG11c3QKYmUgdGhlIGFkbWluIG9yLCBvbmNlIGxpdmUsIGhvbGQgbWludCBhdXRob3JpdHkpLiBBIHJlY2lwaWVudCB3aXRob3V0IGEKZGVsZWdhdGUgaXMgc2VsZi1kZWxlZ2F0ZWQgc28gaXQgY2FuIHZvdGUgaW1tZWRpYXRlbHkuIEVtaXRzCk9wZW5aZXBwZWxpbiBgTWludGAgcGx1cyBgTWludFdpdGhNaW50ZXJgLiBSZXR1cm5zIHRoZSB0b2tlbiBpZC4AAAAAAARtaW50AAAAAgAAAAAAAAAGbWludGVyAAAAAAATAAAAAAAAAAJ0bwAAAAAAEwAAAAEAAAAE", "AAAAAAAAAERNb2R1bGUgYWRtaW46IHRoZSBsYXVuY2ggYWRtaW4gZHVyaW5nIHNldHVwLCB0aGUgVHJlYXN1cnkgb25jZSBsaXZlLgAAAAVhZG1pbgAAAAAAAAAAAAABAAAAEw==", "AAAAAAAAATpPbmUtc2hvdCwgTWFuYWdlci1vbmx5IGxhdW5jaCBoYW5kb2ZmIChTZXR1cCAtPiBMaXZlKS4KCkhhbmRzIHRoZSBhZG1pbiB0byBgdHJlYXN1cnlgLCBncmFudHMgbWludCBhdXRob3JpdHkgdG8gZXhhY3RseQpgbWludGVyc2AgKHdoaWNoIG11c3QgY29udGFpbiB0aGUgdHJlYXN1cnkpLCBtYXJrcyB0aGUgdG9rZW4gbGl2ZSBhbmQKZW1pdHMgYFRva2VuTGF1bmNoZWRgLiBBIHNlY29uZCBjYWxsIHBhbmljcyB3aXRoIGBBbHJlYWR5TGl2ZWAsIHNvIGFmdGVyCmxhdW5jaCB0aGUgTWFuYWdlciBoYXMgbm8gYXV0aG9yaXR5IG92ZXIgdGhlIHRva2VuLgAAAAAABmxhdW5jaAAAAAAAAgAAAAAAAAAIdHJlYXN1cnkAAAATAAAAAAAAAAdtaW50ZXJzAAAAA+oAAAATAAAAAA==", "AAAAAAAAAHFBcHByb3ZlcyBgc3BlbmRlcmAgdG8gdHJhbnNmZXIgYHRva2VuX2lkYCB1bnRpbCBgZXhwaXJhdGlvbl9sZWRnZXJgCihgb3duZXJgIGF1dGgpLiBFbWl0cyBPcGVuWmVwcGVsaW4gYEFwcHJvdmVgLgAAAAAAAAdhcHByb3ZlAAAAAAQAAAAAAAAABW93bmVyAAAAAAAAEwAAAAAAAAAHc3BlbmRlcgAAAAATAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAAAAAAAEWV4cGlyYXRpb25fbGVkZ2VyAAAAAAAABAAAAAA=", "AAAAAAAAACROdW1iZXIgb2YgdG9rZW5zIG93bmVkIGJ5IGBhY2NvdW50YC4AAAAHYmFsYW5jZQAAAAABAAAAAAAAAAdhY2NvdW50AAAAABMAAAABAAAABA==", "AAAAAAAAADRXaGV0aGVyIHRoZSB0b2tlbiBoYXMgYmVlbiBsYXVuY2hlZCAoU2V0dXAgLT4gTGl2ZSkuAAAAB2lzX2xpdmUAAAAAAAAAAAEAAAAB", "AAAAAAAAADlBZHZhbmNlIHRoZSBzdG9yYWdlIGxheW91dCBhZnRlciBhbiB1cGdyYWRlIChhZG1pbiBvbmx5KS4AAAAAAAAHbWlncmF0ZQAAAAAAAAAAAA==", "AAAAAAAAAAAAAAAHdXBncmFkZQAAAAACAAAAAAAAAAlmcm9tX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAHdG9faGFzaAAAAAPuAAAAIAAAAAA=", "AAAAAAAAAEFSZXR1cm5zIHRoZSByZWxlYXNlIHZlcnNpb24gcmVnaXN0ZXJlZCBmb3IgdGhlIGFjdGl2ZSB0b2tlbiBXQVNNLgAAAAAAAAd2ZXJzaW9uAAAAAAAAAAABAAAAEA==", "AAAAAAAAAqREZWxlZ2F0ZXMgdm90aW5nIHBvd2VyIGZyb20gYGFjY291bnRgIHRvIGBkZWxlZ2F0ZWVgLgoKVG8gcmVjbGFpbSB2b3RpbmcgcG93ZXIgKGkuZS4gInVuZGVsZWdhdGUiKSwgY2FsbCB0aGlzIHdpdGgKYGRlbGVnYXRlZWAgc2V0IHRvIGBhY2NvdW50YCAoc2VsZi1kZWxlZ2F0aW9uKS4gVGhlcmUgaXMgbm8Kc2VwYXJhdGUgdW5kZWxlZ2F0ZSBvcGVyYXRpb24uCgojIEFyZ3VtZW50cwoKKiBgZWAgLSBBY2Nlc3MgdG8gdGhlIFNvcm9iYW4gZW52aXJvbm1lbnQuCiogYGFjY291bnRgIC0gVGhlIGFjY291bnQgZGVsZWdhdGluZyBpdHMgdm90aW5nIHBvd2VyLgoqIGBkZWxlZ2F0ZWVgIC0gVGhlIGFjY291bnQgcmVjZWl2aW5nIHRoZSBkZWxlZ2F0ZWQgdm90aW5nIHBvd2VyLgoKIyBFdmVudHMKCiogdG9waWNzIC0gYFsiZGVsZWdhdGVfY2hhbmdlZCIsIGRlbGVnYXRvcjogQWRkcmVzc11gCiogZGF0YSAtIGBbZnJvbV9kZWxlZ2F0ZTogT3B0aW9uPEFkZHJlc3M+LCB0b19kZWxlZ2F0ZTogQWRkcmVzc11gCgoqIHRvcGljcyAtIGBbImRlbGVnYXRlX3ZvdGVzX2NoYW5nZWQiLCBkZWxlZ2F0ZTogQWRkcmVzc11gCiogZGF0YSAtIGBbcHJldmlvdXNfdm90ZXM6IHUxMjgsIG5ld192b3RlczogdTEyOF1gCgojIE5vdGVzCgpBdXRob3JpemF0aW9uIGZvciBgYWNjb3VudGAgaXMgcmVxdWlyZWQuAAAACGRlbGVnYXRlAAAAAgAAAAAAAAAHYWNjb3VudAAAAAATAAAAAAAAAAlkZWxlZ2F0ZWUAAAAAAAATAAAAAA==", "AAAAAAAAADJSZXR1cm5zIHRoZSBtZXRhZGF0YSBjb250cmFjdCB1c2VkIGZvciBtaW50IGhvb2tzLgAAAAAACG1ldGFkYXRhAAAAAAAAAAEAAAPoAAAAEw==", "AAAAAAAAADhPd25lciBvZiBgdG9rZW5faWRgLiBQYW5pY3MgaWYgdGhlIHRva2VuIGRvZXMgbm90IGV4aXN0LgAAAAhvd25lcl9vZgAAAAEAAAAAAAAACHRva2VuX2lkAAAABAAAAAEAAAAT", "AAAAAAAAALFUcmFuc2ZlcnMgYHRva2VuX2lkYCBmcm9tIGBmcm9tYCAoYXV0aCkgdG8gYHRvYCwgbW92aW5nIHRoZSB2b3RpbmcgdW5pdApiZXR3ZWVuIHRoZWlyIGRlbGVnYXRlcy4gQSByZWNpcGllbnQgd2l0aG91dCBhIGRlbGVnYXRlIGlzCnNlbGYtZGVsZWdhdGVkLiBFbWl0cyBPcGVuWmVwcGVsaW4gYFRyYW5zZmVyYC4AAAAAAAAIdHJhbnNmZXIAAAADAAAAAAAAAARmcm9tAAAAEwAAAAAAAAACdG8AAAAAABMAAAAAAAAACHRva2VuX2lkAAAABAAAAAA=", "AAAAAAAAAQxSZXR1cm5zIHRoZSBjdXJyZW50IHZvdGluZyBwb3dlciAoZGVsZWdhdGVkIHZvdGVzKSBvZiBhbiBhY2NvdW50LgoKUmV0dXJucyBgMGAgaWYgdGhlIGFjY291bnQgaGFzIG5vIGRlbGVnYXRlZCB2b3RpbmcgcG93ZXIgb3IgZG9lcyBub3QKZXhpc3QgaW4gdGhlIGNvbnRyYWN0LgoKIyBBcmd1bWVudHMKCiogYGVgIC0gQWNjZXNzIHRvIHRoZSBTb3JvYmFuIGVudmlyb25tZW50LgoqIGBhY2NvdW50YCAtIFRoZSBhZGRyZXNzIHRvIHF1ZXJ5IHZvdGluZyBwb3dlciBmb3IuAAAACWdldF92b3RlcwAAAAAAAAEAAAAAAAAAB2FjY291bnQAAAAAEwAAAAEAAAAK", "AAAAAAAAACNSZXR1cm5zIHRoZSBhY3RpdmUgdG9rZW4gV0FTTSBoYXNoLgAAAAAJd2FzbV9oYXNoAAAAAAAAAAAAAAEAAAPuAAAAIA==", "AAAAAAAAAq1NaW50cyBgYW1vdW50c1tpXWAgc2VxdWVudGlhbCB0b2tlbnMgdG8gZWFjaCBgcmVjaXBpZW50c1tpXWAgaW4gb25lIGNhbGwKKHNhbWUgYXV0aG9yaXR5IHJ1bGVzIGFzIGBtaW50YCkuIFRoZSBiYXRjaCBtdXN0IGZpdCB0aGUgZXZlbnQgYnVkZ2V0CihgY29tbW9uOjpiYXRjaF9taW50X2ZpdHNgLCBgQmF0Y2hUb29MYXJnZWApOiBhdCBtb3N0CmBjb21tb246Ok1BWF9CQVRDSF9NSU5UYCB0b2tlbnMgdG8gb25lIHJlY2lwaWVudCwgb3IKYGNvbW1vbjo6TUFYX0JBVENIX1JFQ0lQSUVOVFNgIHJlY2lwaWVudHMgb2Ygb25lIHRva2VuIGVhY2guIEVhY2ggbmV3CnJlY2lwaWVudCBhZGRzIGRlbGVnYXRpb24gZXZlbnRzIG9uIHRvcCBvZiB0aGUgcGVyLXRva2VuIGNvc3QuIFRoZSBjYXAKYWxzbyBib3VuZHMgdGhlIG1ldGFkYXRhIGhvb2suCgpEZWxlZ2F0aW9uLCBiYWxhbmNlIGFuZCB2b3RlIGNoZWNrcG9pbnRzIGFyZSB0b3VjaGVkIG9uY2UgcGVyIHJlY2lwaWVudAplbnRyeSByYXRoZXIgdGhhbiBvbmNlIHBlciB0b2tlbiwgd2hpY2gga2VlcHMgdGhlIGZvb3RwcmludCBzbWFsbC4KRW1pdHMgT3BlblplcHBlbGluIGBNaW50YCBwZXIgdG9rZW4gYW5kIG9uZSBgTWludEJhdGNoV2l0aE1pbnRlcmAgZm9yCnRoZSB3aG9sZSByYW5nZS4gUmV0dXJucyBldmVyeSBuZXcgdG9rZW4gaWQgaW4gb3JkZXIuAAAAAAAACmJhdGNoX21pbnQAAAAAAAMAAAAAAAAABm1pbnRlcgAAAAAAEwAAAAAAAAAKcmVjaXBpZW50cwAAAAAD6gAAABMAAAAAAAAAB2Ftb3VudHMAAAAD6gAAAAoAAAABAAAD6gAAAAQ=", "AAAAAAAAAcFSZXR1cm5zIHRoZSBjdXJyZW50IGRlbGVnYXRlIGZvciBhbiBhY2NvdW50LgoKIyBBcmd1bWVudHMKCiogYGVgIC0gQWNjZXNzIHRvIHRoZSBTb3JvYmFuIGVudmlyb25tZW50LgoqIGBhY2NvdW50YCAtIFRoZSBhZGRyZXNzIHRvIHF1ZXJ5IHRoZSBkZWxlZ2F0ZSBmb3IuCgojIFJldHVybnMKCiogYFNvbWUoQWRkcmVzcylgIC0gVGhlIGRlbGVnYXRlIGFkZHJlc3MgKG1heSBiZSB0aGUgYWNjb3VudCBpdHNlbGYgaWYKc2VsZi1kZWxlZ2F0ZWQpLgoqIGBOb25lYCAtIElmIHRoZSBhY2NvdW50IGhhcyBuZXZlciBkZWxlZ2F0ZWQuIEFuIGFjY291bnQgd2hvc2UgZGVsZWdhdGUKaXMgYE5vbmVgIGhhcyAqKm5vIGFjdGl2ZSB2b3RpbmcgcG93ZXIqKjsgaXQgbXVzdCBjYWxsCltgVm90ZXM6OmRlbGVnYXRlYF0gKGV2ZW4gdG8gaXRzZWxmKSBiZWZvcmUgaXRzIHZvdGVzIGFyZSBjb3VudGVkLgAAAAAAAAxnZXRfZGVsZWdhdGUAAAABAAAAAAAAAAdhY2NvdW50AAAAABMAAAABAAAD6AAAABM=", "AAAAAAAAAEJVcGRhdGVzIGNvbGxlY3Rpb24gbWV0YWRhdGEgKGFkbWluIG9ubHkpLiBFbWl0cyBgTWV0YWRhdGFVcGRhdGVkYC4AAAAAAAxzZXRfbWV0YWRhdGEAAAADAAAAAAAAAAN1cmkAAAAAEAAAAAAAAAAEbmFtZQAAABAAAAAAAAAABnN5bWJvbAAAAAAAEAAAAAA=", "AAAAAAAAAEhSZS1yZWFkcyB0aGUgdmVyc2lvbiBmb3IgdGhlIGFjdGl2ZSBXQVNNIGhhc2ggZnJvbSB0aGUgTWFuYWdlciByZWdpc3RyeS4AAAAMc3luY192ZXJzaW9uAAAAAAAAAAA=", "AAAAAAAAAMhWb3RpbmctY2FwYWJsZSBzdXBwbHk6IGV2ZXJ5IG1pbnRlZCB0b2tlbiBleGNlcHQgdGhvc2UgaGVsZCBieSB0aGUKVHJlYXN1cnksIEF1Y3Rpb24gYW5kIE1hcmtldHBsYWNlLiBUaGUgTWFuYWdlciByZXF1aXJlcyBpdCB0byBiZQpwb3NpdGl2ZSBhdCBsYXVuY2gsIHNvIGEgREFPIGNhbiBuZXZlciBsYXVuY2ggd2l0aG91dCBhIHNpbmdsZSB2b3RlLgAAAAx0b3RhbF9zdXBwbHkAAAAAAAAAAQAAAAs=", "AAAAAAAAAihJbml0aWFsaXplcyB0aGUgdG9rZW4uCgoqIGBhZG1pbmAgLSBzZXR1cC1waGFzZSBhZG1pbiAodGhlIGxhdW5jaCBhZG1pbik7IGJlY29tZXMgdGhlIFRyZWFzdXJ5IGF0IGxhdW5jaAoqIGB0cmVhc3VyeWAgLSBEQU8gVHJlYXN1cnk7IGBsYXVuY2hgIG11c3QgYmUgY2FsbGVkIHdpdGggZXhhY3RseSB0aGlzIGFkZHJlc3MKKiBgYXVjdGlvbmAgLSBEQU8gQXVjdGlvbiAoaG9sZHMgdGhlIHRva2VuIGJlaW5nIGF1Y3Rpb25lZCkKKiBgbWFya2V0cGxhY2VgIC0gREFPIE1hcmtldHBsYWNlIChlc2Nyb3dzIGxpc3RlZCB0b2tlbnMpCiogYHVyaWAsIGBuYW1lYCwgYHN5bWJvbGAgLSBjb2xsZWN0aW9uIG1ldGFkYXRhCiogYG1ldGFkYXRhYCAtIG1ldGFkYXRhIGNvbnRyYWN0IGNhbGxlZCBvbiBldmVyeSBtaW50IHRvIHNlZWQgYXJ0d29yawoqIGBtYW5hZ2VyYCAtIE1hbmFnZXIgY29udHJhY3QgKHVwZ3JhZGUgYXBwcm92YWxzLCBsYXVuY2gpCiogYGN1cnJlbnRfaGFzaGAsIGB2ZXJzaW9uYCAtIHRoaXMgaW1wbGVtZW50YXRpb24ncyBXQVNNIGhhc2ggYW5kIHJlbGVhc2UAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAsAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAIdHJlYXN1cnkAAAATAAAAAAAAAAdhdWN0aW9uAAAAABMAAAAAAAAAC21hcmtldHBsYWNlAAAAABMAAAAAAAAAA3VyaQAAAAAQAAAAAAAAAARuYW1lAAAAEAAAAAAAAAAGc3ltYm9sAAAAAAAQAAAAAAAAAAhtZXRhZGF0YQAAABMAAAAAAAAAB21hbmFnZXIAAAAAEwAAAAAAAAAMY3VycmVudF9oYXNoAAAD7gAAACAAAAAAAAAAB3ZlcnNpb24AAAAAEAAAAAA=", "AAAAAAAAADFMaWtlIGB0cmFuc2ZlcmAsIGJ5IGFuIGFwcHJvdmVkIGBzcGVuZGVyYCAoYXV0aCkuAAAAAAAADXRyYW5zZmVyX2Zyb20AAAAAAAAEAAAAAAAAAAdzcGVuZGVyAAAAABMAAAAAAAAABGZyb20AAAATAAAAAAAAAAJ0bwAAAAAAEwAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAA==", "AAAAAAAAAG9XaGV0aGVyIGBhdXRob3JpdHlgIGhvbGRzIGV4cGxpY2l0IG1pbnRpbmcgYXV0aG9yaXR5LiBUaGUgYWRtaW4gYWx3YXlzCmhhcyBpbXBsaWNpdCBhdXRob3JpdHkgd2l0aG91dCBhbiBlbnRyeS4AAAAADm1pbnRfYXV0aG9yaXR5AAAAAAABAAAAAAAAAAlhdXRob3JpdHkAAAAAAAATAAAAAQAAAAE=", "AAAAAAAAADJOdW1iZXIgb2Ygdm90ZSBjaGVja3BvaW50cyByZWNvcmRlZCBmb3IgYGFjY291bnRgLgAAAAAAD251bV9jaGVja3BvaW50cwAAAAABAAAAAAAAAAdhY2NvdW50AAAAABMAAAABAAAABA==", "AAAAAAAAADlTdG9yYWdlLWxheW91dCB2ZXJzaW9uIG9mIHRoZSBkYXRhIGhlbGQgYnkgdGhpcyBjb250cmFjdC4AAAAAAAAPc3RvcmFnZV92ZXJzaW9uAAAAAAAAAAABAAAABA==", "AAAAAAAAAPtSZXR1cm5zIHRoZSBjdXJyZW50IHRvdGFsIHN1cHBseSBvZiB2b3RpbmcgdW5pdHMuCgpUaGlzIHRyYWNrcyBhbGwgdm90aW5nIHVuaXRzIGluIGNpcmN1bGF0aW9uIChyZWdhcmRsZXNzIG9mIGRlbGVnYXRpb24Kc3RhdHVzKSwgbm90IGp1c3QgZGVsZWdhdGVkIHZvdGVzLgoKUmV0dXJucyBgMGAgaWYgbm8gdm90aW5nIHVuaXRzIGV4aXN0LgoKIyBBcmd1bWVudHMKCiogYGVgIC0gQWNjZXNzIHRvIHRoZSBTb3JvYmFuIGVudmlyb25tZW50LgAAAAAQZ2V0X3RvdGFsX3N1cHBseQAAAAAAAAABAAAACg==", "AAAAAAAAAINHcmFudHMgb3IgcmV2b2tlcyBtaW50aW5nIGF1dGhvcml0eSAoYWRtaW4gb25seSwgbGl2ZSB0b2tlbiBvbmx5OyB0aGUKbGF1bmNoIHdyaXRlcyB0aGUgaW5pdGlhbCBzZXQpLiBFbWl0cyBgTWludEF1dGhvcml0eUNoYW5nZWRgLgAAAAASc2V0X21pbnRfYXV0aG9yaXR5AAAAAAACAAAAAAAAAAlhdXRob3JpdHkAAAAAAAATAAAAAAAAAAdlbmFibGVkAAAAAAEAAAAA", "AAAAAAAAAeVSZXR1cm5zIHRoZSB2b3RpbmcgcG93ZXIgKGRlbGVnYXRlZCB2b3Rlcykgb2YgYW4gYWNjb3VudCBhdCBhIHNwZWNpZmljCnBhc3QgbGVkZ2VyIHNlcXVlbmNlIG51bWJlci4KClJldHVybnMgYDBgIGlmIHRoZSBhY2NvdW50IGhhZCBubyBkZWxlZ2F0ZWQgdm90aW5nIHBvd2VyIGF0IHRoZSBnaXZlbgpsZWRnZXIgb3IgZG9lcyBub3QgZXhpc3QgaW4gdGhlIGNvbnRyYWN0LgoKIyBBcmd1bWVudHMKCiogYGVgIC0gQWNjZXNzIHRvIHRoZSBTb3JvYmFuIGVudmlyb25tZW50LgoqIGBhY2NvdW50YCAtIFRoZSBhZGRyZXNzIHRvIHF1ZXJ5IHZvdGluZyBwb3dlciBmb3IuCiogYGxlZGdlcmAgLSBUaGUgbGVkZ2VyIHNlcXVlbmNlIG51bWJlciB0byBxdWVyeSAobXVzdCBiZSBpbiB0aGUgcGFzdCkuCgojIEVycm9ycwoKKiBbYFZvdGVzRXJyb3I6OkZ1dHVyZUxvb2t1cGBdIC0gSWYgYGxlZGdlcmAgPj0gY3VycmVudCBsZWRnZXIgc2VxdWVuY2UKbnVtYmVyLgAAAAAAABdnZXRfdm90ZXNfYXRfY2hlY2twb2ludAAAAAACAAAAAAAAAAdhY2NvdW50AAAAABMAAAAAAAAABmxlZGdlcgAAAAAABAAAAAEAAAAK", "AAAAAAAAAdlSZXR1cm5zIHRoZSB0b3RhbCBzdXBwbHkgb2Ygdm90aW5nIHVuaXRzIGF0IGEgc3BlY2lmaWMgcGFzdCBsZWRnZXIKc2VxdWVuY2UgbnVtYmVyLgoKVGhpcyB0cmFja3MgYWxsIHZvdGluZyB1bml0cyBpbiBjaXJjdWxhdGlvbiAocmVnYXJkbGVzcyBvZiBkZWxlZ2F0aW9uCnN0YXR1cyksIG5vdCBqdXN0IGRlbGVnYXRlZCB2b3Rlcy4KClJldHVybnMgYDBgIGlmIHRoZXJlIHdlcmUgbm8gdm90aW5nIHVuaXRzIGF0IHRoZSBnaXZlbiBsZWRnZXIuCgojIEFyZ3VtZW50cwoKKiBgZWAgLSBBY2Nlc3MgdG8gdGhlIFNvcm9iYW4gZW52aXJvbm1lbnQuCiogYGxlZGdlcmAgLSBUaGUgbGVkZ2VyIHNlcXVlbmNlIG51bWJlciB0byBxdWVyeSAobXVzdCBiZSBpbiB0aGUgcGFzdCkuCgojIEVycm9ycwoKKiBbYFZvdGVzRXJyb3I6OkZ1dHVyZUxvb2t1cGBdIC0gSWYgYGxlZGdlcmAgPj0gY3VycmVudCBsZWRnZXIgc2VxdWVuY2UKbnVtYmVyLgAAAAAAAB5nZXRfdG90YWxfc3VwcGx5X2F0X2NoZWNrcG9pbnQAAAAAAAEAAAAAAAAABmxlZGdlcgAAAAAABAAAAAEAAAAK", "AAAABQAAAKtFbWl0dGVkIGJ5IFtgaGFuZG9mZmBdLiBUaGUgZW1pdHRpbmcgY29udHJhY3QgYWRkcmVzcyBpcyB0aGUgZXZlbnQncyBjb250cmFjdCBpZC4KClNhbWUgc2hhcGUgYXMgdGhlIE1hbmFnZXIncyBvd24gYEFkbWluQ2hhbmdlZGAsIHNvIGluZGV4ZXJzIGRlY29kZSBib3RoCndpdGggb25lIHNjaGVtYS4AAAAAAAAAAAxBZG1pbkNoYW5nZWQAAAABAAAADWFkbWluX2NoYW5nZWQAAAAAAAACAAAAAAAAAAlvbGRfYWRtaW4AAAAAAAATAAAAAQAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAEAAAAC", "AAAABAAAAD5FcnJvcnMgc2hhcmVkIGJ5IGFsbCBtb2R1bGUgY29udHJhY3RzIChibG9jayBgY29kZXM6OkNPTU1PTmApLgAAAAAAAAAAAAtDb21tb25FcnJvcgAAAAANAAAANE9wZXJhdGlvbiByZXF1aXJlcyB0aGUgbW9kdWxlIHRvIGJlIGxpdmUgKGxhdW5jaGVkKS4AAAAHTm90TGl2ZQAAABtZAAAAQU9wZXJhdGlvbiBpcyBvbmx5IHZhbGlkIGR1cmluZyBzZXR1cDsgdGhlIG1vZHVsZSBpcyBhbHJlYWR5IGxpdmUuAAAAAAAAC0FscmVhZHlMaXZlAAAAG1oAAAAlTWFuYWdlciBhZGRyZXNzIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAAAAA1NYW5hZ2VyTm90U2V0AAAAAAAbWwAAACNgQ3VycmVudEhhc2hgIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAARQ3VycmVudEhhc2hOb3RTZXQAAAAAABtcAAAANGBmcm9tX2hhc2hgIGRvZXMgbm90IGVxdWFsIHRoZSBzdG9yZWQgYEN1cnJlbnRIYXNoYC4AAAAMSGFzaE1pc21hdGNoAAAbXQAAACpNYW5hZ2VyIGRpZCBub3QgYXBwcm92ZSB0aGlzIHVwZ3JhZGUgcGF0aC4AAAAAABJVcGdyYWRlTm90QXBwcm92ZWQAAAAAG14AAAA1TWFuYWdlciBoYXMgbm8gcmVnaXN0cnkgZW50cnkgZm9yIHRoZSByZXF1ZXN0ZWQgaGFzaC4AAAAAAAAWSW1wbGVtZW50YXRpb25Ob3RGb3VuZAAAAAAbXwAAACJNb2R1bGUgYWRtaW4gbWlzc2luZyBmcm9tIHN0b3JhZ2UuAAAAAAALQWRtaW5Ob3RTZXQAAAAbYAAAACZgQ3VycmVudFZlcnNpb25gIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAAADVZlcnNpb25Ob3RTZXQAAAAAABthAAAAJlRyZWFzdXJ5IGFkZHJlc3MgbWlzc2luZyBmcm9tIHN0b3JhZ2UuAAAAAAAOVHJlYXN1cnlOb3RTZXQAAAAAG2IAAAAmR292ZXJub3IgYWRkcmVzcyBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAAAA5Hb3Zlcm5vck5vdFNldAAAAAAbYwAAADxgbWlncmF0ZWAgY2FsbGVkIHdoaWxlIHRoZSBzdG9yZWQgbGF5b3V0IGlzIGFscmVhZHkgY3VycmVudC4AAAAQTm90aGluZ1RvTWlncmF0ZQAAG2QAAAAmYFN0b3JhZ2VWZXJzaW9uYCBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAAABRTdG9yYWdlVmVyc2lvbk5vdFNldAAAG2U=", "AAAABQAAABVFbWl0dGVkIGJ5IGBtaWdyYXRlYC4AAAAAAAAAAAAACE1pZ3JhdGVkAAAAAQAAAAhtaWdyYXRlZAAAAAIAAAAAAAAAFGZyb21fc3RvcmFnZV92ZXJzaW9uAAAABAAAAAAAAAAAAAAAEnRvX3N0b3JhZ2VfdmVyc2lvbgAAAAAABAAAAAAAAAAC", "AAAABQAAAE1FbWl0dGVkIGJ5IGBhcHBseWAuIFRoZSBlbWl0dGluZyBjb250cmFjdCBhZGRyZXNzIGlzIHRoZSBldmVudCdzIGNvbnRyYWN0IGlkLgAAAAAAAAAAAAAIVXBncmFkZWQAAAABAAAACHVwZ3JhZGVkAAAAAwAAAAAAAAAJZnJvbV9oYXNoAAAAAAAD7gAAACAAAAABAAAAAAAAAAd0b19oYXNoAAAAA+4AAAAgAAAAAQAAAAAAAAAHdmVyc2lvbgAAAAAQAAAAAAAAAAI=", "AAAABQAAABpFbWl0dGVkIGJ5IGBzeW5jX3ZlcnNpb25gLgAAAAAAAAAAAA1WZXJzaW9uU3luY2VkAAAAAAAAAQAAAA52ZXJzaW9uX3N5bmNlZAAAAAAAAQAAAAAAAAAHdmVyc2lvbgAAAAAQAAAAAAAAAAI=", "AAAABAAAACpFcnJvcnMgdGhhdCBjYW4gb2NjdXIgaW4gdm90ZXMgb3BlcmF0aW9ucy4AAAAAAAAAAAAKVm90ZXNFcnJvcgAAAAAABQAAABtUaGUgbGVkZ2VyIGlzIGluIHRoZSBmdXR1cmUAAAAADEZ1dHVyZUxvb2t1cAAAEAQAAAAcQXJpdGhtZXRpYyBvdmVyZmxvdyBvY2N1cnJlZAAAAAxNYXRoT3ZlcmZsb3cAABAFAAAAN0F0dGVtcHRpbmcgdG8gdHJhbnNmZXIgbW9yZSB2b3RpbmcgdW5pdHMgdGhhbiBhdmFpbGFibGUAAAAAF0luc3VmZmljaWVudFZvdGluZ1VuaXRzAAAAEAYAAAA/QXR0ZW1wdGluZyB0byBkZWxlZ2F0ZSB0byB0aGUgc2FtZSBkZWxlZ2F0ZSB0aGF0IGlzIGFscmVhZHkgc2V0AAAAAAxTYW1lRGVsZWdhdGUAABAHAAAAQEEgY2hlY2twb2ludCB0aGF0IHdhcyBleHBlY3RlZCB0byBleGlzdCB3YXMgbm90IGZvdW5kIGluIHN0b3JhZ2UAAAASQ2hlY2twb2ludE5vdEZvdW5kAAAAABAI", "AAAABQAAADNFdmVudCBlbWl0dGVkIHdoZW4gYW4gYWNjb3VudCBjaGFuZ2VzIGl0cyBkZWxlZ2F0ZS4AAAAAAAAAAA9EZWxlZ2F0ZUNoYW5nZWQAAAAAAQAAABBkZWxlZ2F0ZV9jaGFuZ2VkAAAAAwAAACVUaGUgYWNjb3VudCB0aGF0IGNoYW5nZWQgaXRzIGRlbGVnYXRlAAAAAAAACWRlbGVnYXRvcgAAAAAAABMAAAABAAAAHlRoZSBwcmV2aW91cyBkZWxlZ2F0ZSAoaWYgYW55KQAAAAAADWZyb21fZGVsZWdhdGUAAAAAAAPoAAAAEwAAAAAAAAAQVGhlIG5ldyBkZWxlZ2F0ZQAAAAt0b19kZWxlZ2F0ZQAAAAATAAAAAAAAAAI=", "AAAABQAAADVFdmVudCBlbWl0dGVkIHdoZW4gYSBkZWxlZ2F0ZSdzIHZvdGluZyBwb3dlciBjaGFuZ2VzLgAAAAAAAAAAAAAURGVsZWdhdGVWb3Rlc0NoYW5nZWQAAAABAAAAFmRlbGVnYXRlX3ZvdGVzX2NoYW5nZWQAAAAAAAMAAAAnVGhlIGRlbGVnYXRlIHdob3NlIHZvdGluZyBwb3dlciBjaGFuZ2VkAAAAAAhkZWxlZ2F0ZQAAABMAAAABAAAAGVRoZSBwcmV2aW91cyB2b3RpbmcgcG93ZXIAAAAAAAAOcHJldmlvdXNfdm90ZXMAAAAAAAoAAAAAAAAAFFRoZSBuZXcgdm90aW5nIHBvd2VyAAAACW5ld192b3RlcwAAAAAAAAoAAAAAAAAAAg==", "AAAABQAAACVFdmVudCBlbWl0dGVkIHdoZW4gYSB0b2tlbiBpcyBtaW50ZWQuAAAAAAAAAAAAAARNaW50AAAAAQAAAARtaW50AAAAAgAAAAAAAAACdG8AAAAAABMAAAABAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAAAAAAAAg==", "AAAABQAAACpFdmVudCBlbWl0dGVkIHdoZW4gYW4gYXBwcm92YWwgaXMgZ3JhbnRlZC4AAAAAAAAAAAAHQXBwcm92ZQAAAAABAAAAB2FwcHJvdmUAAAAABAAAAAAAAAAIYXBwcm92ZXIAAAATAAAAAQAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAQAAAAAAAAAIYXBwcm92ZWQAAAATAAAAAAAAAAAAAAARbGl2ZV91bnRpbF9sZWRnZXIAAAAAAAAEAAAAAAAAAAI=", "AAAABQAAACpFdmVudCBlbWl0dGVkIHdoZW4gYSB0b2tlbiBpcyB0cmFuc2ZlcnJlZC4AAAAAAAAAAAAIVHJhbnNmZXIAAAABAAAACHRyYW5zZmVyAAAAAwAAAAAAAAAEZnJvbQAAABMAAAABAAAAAAAAAAJ0bwAAAAAAEwAAAAEAAAAAAAAACHRva2VuX2lkAAAABAAAAAAAAAAC", "AAAABAAAAAAAAAAAAAAAFU5vbkZ1bmdpYmxlVG9rZW5FcnJvcgAAAAAAAA8AAAAkSW5kaWNhdGVzIGEgbm9uLWV4aXN0ZW50IGB0b2tlbl9pZGAuAAAAEE5vbkV4aXN0ZW50VG9rZW4AAADIAAAAV0luZGljYXRlcyBhbiBlcnJvciByZWxhdGVkIHRvIHRoZSBvd25lcnNoaXAgb3ZlciBhIHBhcnRpY3VsYXIgdG9rZW4uClVzZWQgaW4gdHJhbnNmZXJzLgAAAAAOSW5jb3JyZWN0T3duZXIAAAAAAMkAAABFSW5kaWNhdGVzIGEgZmFpbHVyZSB3aXRoIHRoZSBgb3BlcmF0b3JgcyBhcHByb3ZhbC4gVXNlZCBpbiB0cmFuc2ZlcnMuAAAAAAAAFEluc3VmZmljaWVudEFwcHJvdmFsAAAAygAAAFVJbmRpY2F0ZXMgYSBmYWlsdXJlIHdpdGggdGhlIGBhcHByb3ZlcmAgb2YgYSB0b2tlbiB0byBiZSBhcHByb3ZlZC4gVXNlZAppbiBhcHByb3ZhbHMuAAAAAAAAD0ludmFsaWRBcHByb3ZlcgAAAADLAAAASkluZGljYXRlcyBhbiBpbnZhbGlkIHZhbHVlIGZvciBgbGl2ZV91bnRpbF9sZWRnZXJgIHdoZW4gc2V0dGluZwphcHByb3ZhbHMuAAAAAAAWSW52YWxpZExpdmVVbnRpbExlZGdlcgAAAAAAzAAAAClJbmRpY2F0ZXMgb3ZlcmZsb3cgd2hlbiBhZGRpbmcgdHdvIHZhbHVlcwAAAAAAAAxNYXRoT3ZlcmZsb3cAAADNAAAANkluZGljYXRlcyBhbGwgcG9zc2libGUgYHRva2VuX2lkYHMgYXJlIGFscmVhZHkgaW4gdXNlLgAAAAAAE1Rva2VuSURzQXJlRGVwbGV0ZWQAAAAAzgAAAEVJbmRpY2F0ZXMgYW4gaW52YWxpZCBhbW91bnQgdG8gYmF0Y2ggbWludCBpbiBgY29uc2VjdXRpdmVgIGV4dGVuc2lvbi4AAAAAAAANSW52YWxpZEFtb3VudAAAAAAAAM8AAAAzSW5kaWNhdGVzIHRoZSB0b2tlbiBkb2VzIG5vdCBleGlzdCBpbiBvd25lcidzIGxpc3QuAAAAABhUb2tlbk5vdEZvdW5kSW5Pd25lckxpc3QAAADQAAAAMkluZGljYXRlcyB0aGUgdG9rZW4gZG9lcyBub3QgZXhpc3QgaW4gZ2xvYmFsIGxpc3QuAAAAAAAZVG9rZW5Ob3RGb3VuZEluR2xvYmFsTGlzdAAAAAAAANEAAAAjSW5kaWNhdGVzIGFjY2VzcyB0byB1bnNldCBtZXRhZGF0YS4AAAAADVVuc2V0TWV0YWRhdGEAAAAAAADSAAAAQUluZGljYXRlcyB0aGUgbGVuZ3RoIG9mIHRoZSBiYXNlIFVSSSBleGNlZWRzIHRoZSBtYXhpbXVtIGFsbG93ZWQuAAAAAAAAFUJhc2VVcmlNYXhMZW5FeGNlZWRlZAAAAAAAANMAAABHSW5kaWNhdGVzIHRoZSByb3lhbHR5IGFtb3VudCBpcyBoaWdoZXIgdGhhbiAxMF8wMDAgKDEwMCUpIGJhc2lzIHBvaW50cy4AAAAAFEludmFsaWRSb3lhbHR5QW1vdW50AAAA1AAAAD1JbmRpY2F0ZXMgdGhlIGxlbmd0aCBvZiB0aGUgbmFtZSBleGNlZWRzIHRoZSBtYXhpbXVtIGFsbG93ZWQuAAAAAAAAEk5hbWVNYXhMZW5FeGNlZWRlZAAAAAAA1QAAAD9JbmRpY2F0ZXMgdGhlIGxlbmd0aCBvZiB0aGUgc3ltYm9sIGV4Y2VlZHMgdGhlIG1heGltdW0gYWxsb3dlZC4AAAAAFFN5bWJvbE1heExlbkV4Y2VlZGVkAAAA1g=="]),
      options
    );
  }

   static deploy<T = Client>({ admin, treasury, auction, marketplace, uri, name, symbol, metadata, manager, current_hash, version }: { admin: string | Address; treasury: string | Address; auction: string | Address; marketplace: string | Address; uri: string; name: string; symbol: string; metadata: string | Address; manager: string | Address; current_hash: Uint8Array; version: string }, options: MethodOptions & Omit<ContractClientOptions, 'contractId'> & { salt?: Uint8Array; address?: string; } & ({ wasmHash: Uint8Array | string; format?: "hex" | "base64"; externalRef?: never; } | { externalRef: ExternalExecutableRef; wasmHash?: never; format?: never; })): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({ admin, treasury, auction, marketplace, uri, name, symbol, metadata, manager, current_hash, version }, options);
  }
  public readonly fromJson = {
    mint : this.txFromJson<number>,  admin : this.txFromJson<string>,  launch : this.txFromJson<void>,  approve : this.txFromJson<void>,  balance : this.txFromJson<number>,  is_live : this.txFromJson<boolean>,  migrate : this.txFromJson<void>,  upgrade : this.txFromJson<void>,  version : this.txFromJson<string>,  delegate : this.txFromJson<void>,  metadata : this.txFromJson<string | null>,  owner_of : this.txFromJson<string>,  transfer : this.txFromJson<void>,  get_votes : this.txFromJson<bigint>,  wasm_hash : this.txFromJson<Uint8Array>,  batch_mint : this.txFromJson<Array<number>>,  get_delegate : this.txFromJson<string | null>,  set_metadata : this.txFromJson<void>,  sync_version : this.txFromJson<void>,  total_supply : this.txFromJson<bigint>,  transfer_from : this.txFromJson<void>,  mint_authority : this.txFromJson<boolean>,  num_checkpoints : this.txFromJson<number>,  storage_version : this.txFromJson<number>,  get_total_supply : this.txFromJson<bigint>,  set_mint_authority : this.txFromJson<void>,  get_votes_at_checkpoint : this.txFromJson<bigint>,  get_total_supply_at_checkpoint : this.txFromJson<bigint>
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
   * Build a topics filter row for the "TokenLaunched" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  tokenLaunchedEventFilter(topicValues?: { treasury?: string | Address }): string[] {
    return this.spec.eventTopicFilter("TokenLaunched", topicValues);
  }
  /**
   * Build a topics filter row for the "MintWithMinter" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  mintWithMinterEventFilter(topicValues?: { minter?: string | Address; to?: string | Address }): string[] {
    return this.spec.eventTopicFilter("MintWithMinter", topicValues);
  }
  /**
   * Build a topics filter row for the "MetadataUpdated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  metadataUpdatedEventFilter(): string[] {
    return this.spec.eventTopicFilter("MetadataUpdated");
  }
  /**
   * Build a topics filter row for the "TokenInitialized" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  tokenInitializedEventFilter(topicValues?: { admin?: string | Address }): string[] {
    return this.spec.eventTopicFilter("TokenInitialized", topicValues);
  }
  /**
   * Build a topics filter row for the "MintBatchWithMinter" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  mintBatchWithMinterEventFilter(topicValues?: { minter?: string | Address }): string[] {
    return this.spec.eventTopicFilter("MintBatchWithMinter", topicValues);
  }
  /**
   * Build a topics filter row for the "MintAuthorityChanged" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  mintAuthorityChangedEventFilter(topicValues?: { authority?: string | Address }): string[] {
    return this.spec.eventTopicFilter("MintAuthorityChanged", topicValues);
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
   * Build a topics filter row for the "VersionSynced" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  versionSyncedEventFilter(): string[] {
    return this.spec.eventTopicFilter("VersionSynced");
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