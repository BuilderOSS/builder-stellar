import {MintGrant, ModuleEntry, TokenSettings, ContractEvent} from './types.js';
import {Spec, AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, ExternalExecutableRef} from '@stellar/stellar-sdk/contract';
import {Address, xdr} from '@stellar/stellar-sdk';

export interface Client {
  /**
   * Mints the next sequential token id to `to` (minter auth; the minter must
   * be the admin or a registered module with allowance, see `# Minting`). A recipient without a
   * delegate is self-delegated so it can vote immediately. Emits
   * OpenZeppelin `Mint` plus `MintWithMinter`. Returns the token id.
   */
  mint({ minter, to }: { minter: string | Address; to: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * SEP-50 collection name.
   */
  name(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * Module admin: the launch admin during setup, the Treasury once live.
   */
  admin(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * One-shot, Manager-only launch (Setup -> Live).
   *
   * Hands the admin to `treasury` (unless `handoff` already did), raises
   * each registered module's allowance by its grant (`NotAModule` for
   * anything else), marks the token live and emits `TokenLaunched`. The
   * Treasury needs no grant: as admin it mints without limit. A second call
   * panics with `AlreadyLive`, so after launch the Manager has no authority
   * over the token.
   */
  launch({ treasury, grants }: { treasury: string | Address; grants: Array<MintGrant> }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Tokens minted so far (the next id). Ids are sequential and never
   * burned, so a token exists exactly when its id is below this.
   */
  minted(options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * The registered module of `kind`, if any.
   */
  module({ kind }: { kind: string }, options?: MethodOptions): Promise<AssembledTransaction<string | null>>;
  /**
   * SEP-50 collection symbol.
   */
  symbol(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * Approves `spender` to transfer `token_id` until `expiration_ledger`
   * (`owner` auth: the owner or an operator). The approval is cleared when
   * the token moves. On a locked token a holder's token can be approved
   * only to the Treasury (`TransfersLocked`); the rule reads the token's
   * owner, never the approver, and revoking (`expiration_ledger == 0`) is
   * always allowed. Emits OpenZeppelin `Approve`.
   */
  approve({ owner, spender, token_id, expiration_ledger }: { owner: string | Address; spender: string | Address; token_id: number; expiration_ledger: number }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * The registered `auction` module (holds no voting power).
   */
  auction(options?: MethodOptions): Promise<AssembledTransaction<string | null>>;
  /**
   * Number of tokens owned by `account`.
   */
  balance({ account }: { account: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * Manager-only early handoff (`manager.open_assurance`): the admin moves
   * to the Treasury and the token stays in Setup, so founder mints,
   * settings and allowances are frozen until launch. Panics `AlreadyLive`
   * once launched.
   */
  handoff({ treasury }: { treasury: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Whether the token has been launched (Setup -> Live).
   */
  is_live(options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  /**
   * Manager that approves upgrades and performed the launch.
   */
  manager(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * Advance the storage layout after an upgrade (admin only).
   */
  migrate(options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Every registered module, in registration order.
   */
  modules(options?: MethodOptions): Promise<AssembledTransaction<Array<ModuleEntry>>>;
  upgrade({ from_hash, to_hash }: { from_hash: Uint8Array; to_hash: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Returns the release version registered for the active token WASM.
   */
  version(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * OpenZeppelin `delegate`, refused (`DelegateNotMember`) when
   * members-only delegation is on and `delegatee` is neither the account
   * itself nor a voting member (docs/designs/locked-tokens.md "Switch 2").
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
   * The three membership switches.
   */
  settings(options?: MethodOptions): Promise<AssembledTransaction<TokenSettings>>;
  /**
   * Transfers `token_id` from `from` (auth) to `to`, moving the voting unit
   * between their delegates. A recipient without a delegate is
   * self-delegated. On a locked token only a DAO-controlled path passes
   * (`TransfersLocked`, see `check_locked_path`). Emits OpenZeppelin
   * `Transfer`.
   */
  transfer({ from, to, token_id }: { from: string | Address; to: string | Address; token_id: number }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * The DAO Treasury (admin once live; holds no voting power).
   */
  treasury(options?: MethodOptions): Promise<AssembledTransaction<string>>;
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
   * SEP-50 token metadata, built on-chain by the Metadata contract (a
   * `data:application/json;base64` document). Panics if the token does not
   * exist or has no artwork yet.
   *
   * Existence is `token_id < next id` (ids are sequential and never burned),
   * not `owner_of`: OpenZeppelin renews an ownership entry for 30 days per
   * touch, so reading it would make an idle holder's token unrenderable
   * once the entry archives.
   */
  token_uri({ token_id }: { token_id: number }, options?: MethodOptions): Promise<AssembledTransaction<string>>;
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
   * The registered `marketplace` module (escrow; holds no voting power).
   */
  marketplace(options?: MethodOptions): Promise<AssembledTransaction<string | null>>;
  /**
   * The Treasury may move any member's token by proposal.
   */
  dao_recovery(options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  /**
   * Move `token_id` from whoever owns it now to `to`, without the owner's
   * signature (the admin: the Treasury, by proposal; Live only; only while
   * `dao_recovery` is on, `RecoveryOff`). Lost-key recovery, and by the
   * same power recall. Taking the current owner means a holder cannot
   * dodge a recall by moving wallets during the vote. Neither the owner
   * nor `to` may be a registered module (`ModuleCustody`): custody keeps
   * its own records. Votes move as on any transfer.
   */
  dao_transfer({ token_id, to }: { token_id: number; to: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * The live single-token approval of `token_id`, if any. Panics if the
   * token does not exist.
   */
  get_approved({ token_id }: { token_id: number }, options?: MethodOptions): Promise<AssembledTransaction<string | null>>;
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
   * Updates the collection name and symbol (admin only). Emits
   * `MetadataUpdated`. Token metadata itself is built by the Metadata
   * contract (`token_uri`).
   */
  set_metadata({ name, symbol }: { name: string; symbol: string }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Voting-capable supply: every minted token except those held by the
   * Treasury and non-voting modules. The Manager requires it to be
   * positive at launch, so a DAO can never launch without a single vote.
   */
  total_supply(options?: MethodOptions): Promise<AssembledTransaction<bigint>>;
  /**
   * Like `transfer`, by an approved `spender` (auth; OpenZeppelin's
   * approval check runs first, so an unapproved spender fails as before).
   */
  transfer_from({ spender, from, to, token_id }: { spender: string | Address; from: string | Address; to: string | Address; token_id: number }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * A transfer agent moves `token_id` from `from` to `to` (Live only;
   * `agent` and `from` both authorize; `NotTransferAgent`). Works on locked
   * and unlocked tokens alike, and does not check the recipient's consent:
   * an agent that needs it checks it itself. Emits OpenZeppelin `Transfer`
   * and `AgentTransfer`.
   */
  agent_transfer({ agent, from, to, token_id }: { agent: string | Address; from: string | Address; to: string | Address; token_id: number }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * How many more tokens `module` may mint (0 for unregistered addresses).
   */
  mint_allowance({ module }: { module: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * Lets `operator` transfer every token of `owner` until
   * `live_until_ledger` (`owner` auth; 0 revokes). Operator transfers go
   * through `transfer_from`, so votes move exactly as on a direct transfer.
   * On a locked token a holder can name only the Treasury
   * (`TransfersLocked`); revoking is always allowed. Emits OpenZeppelin
   * `ApproveForAll`.
   */
  approve_for_all({ owner, operator, live_until_ledger }: { owner: string | Address; operator: string | Address; live_until_ledger: number }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Number of vote checkpoints recorded for `account`.
   */
  num_checkpoints({ account }: { account: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * Registers `address` as a module of `kind`. In Setup only the Manager
   * may register (during `create_dao` / `create_module`); once live only
   * the admin (the Treasury, by proposal).
   *
   * `address` must be a deployed Wasm contract (`NotAContract`): wallets,
   * Stellar Asset Contracts and predicted addresses are refused, so a
   * proposal can never mark a holder's wallet non-voting. `kind` is a
   * built-in kind or `custom_<name>` (`InvalidKind`) and unique
   * (`KindTaken`). If the module is `non_voting` and already holds tokens,
   * their votes leave the supply now. Emits `ModuleRegistered`.
   */
  register_module({ kind, address, non_voting }: { kind: string; address: string | Address; non_voting: boolean }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Storage-layout version of the data held by this contract.
   */
  storage_version(options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * The modules that may call `agent_transfer`.
   */
  transfer_agents(options?: MethodOptions): Promise<AssembledTransaction<Array<string>>>;
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
   * Turn DAO recovery on or off (same authority). On, a passed proposal
   * can move any member's token with `dao_transfer`; one proposal may turn
   * it on and use it in the same execution.
   */
  set_dao_recovery({ enabled }: { enabled: boolean }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Tokens move only along DAO-controlled paths.
   */
  transfers_locked(options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  /**
   * Removes `address` from the registry (same authority as
   * `register_module`; `NotAModule` if absent). Its allowance drops to 0.
   * If it was `non_voting` and still holds tokens, it is self-delegated
   * first and their votes return to the supply under its own address, so
   * the account checkpoints keep adding up to `TotalSupply`. Empty a module
   * before unregistering it: leftover tokens become that contract's own
   * votes. Emits `ModuleUnregistered`.
   */
  unregister_module({ address }: { address: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Make a registered module a transfer agent, or stop it being one
   * (`NotAModule`; `SettingUnchanged`). Same authority as
   * `register_module`: in Setup only the Manager (at `create_dao`, for the
   * kinds the creation config names), once Live only the admin (the
   * Treasury, by proposal). The launch admin can never grant it.
   */
  set_transfer_agent({ module, enabled }: { module: string | Address; enabled: boolean }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Whether `operator` currently holds a live approval for all of `owner`'s
   * tokens.
   */
  is_approved_for_all({ owner, operator }: { owner: string | Address; operator: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  /**
   * Lock or unlock transfers (the admin: the launch admin in Setup, the
   * Treasury by proposal once Live; `SettingUnchanged` if unchanged).
   * Locking moves no token but removes every member's exit by sale, so the
   * web flags it. Applies from the next call.
   */
  set_transfers_locked({ locked }: { locked: boolean }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * A module gives back `amount` of its own allowance (module auth),
   * saturating at 0: for example a closed pool's unstocked remainder.
   * Emits `MintAllowanceChanged`. An unlimited allowance (`u32::MAX`) stays
   * unlimited: it was never spent, so there is nothing to give back.
   */
  release_mint_allowance({ module, amount }: { module: string | Address; amount: number }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Lowers `module`'s allowance by `amount`, saturating at 0 (admin only).
   * Emits `MintAllowanceChanged`.
   */
  decrease_mint_allowance({ module, amount }: { module: string | Address; amount: number }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
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
   * Raises a registered module's allowance by `amount` (admin only;
   * `NotAModule` otherwise). Adds rather than overwrites, so a grant for a
   * second list never erases the first. Emits `MintAllowanceChanged`.
   */
  increase_mint_allowance({ module, amount }: { module: string | Address; amount: number }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Holders delegate only to themselves or another voting member.
   */
  members_only_delegation(options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  /**
   * Turn members-only delegation on or off (same authority). Governs new
   * `delegate` calls only: delegations already in place stay.
   */
  set_members_only_delegation({ enabled }: { enabled: boolean }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
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
  /**
   * The voting supply at the previous ledger: the ledger a proposal's
   * votes are snapshotted at, so the Governor's quorum and the voters'
   * weights describe the same supply (contract review H1). Reads only the
   * latest checkpoint, or the one before it when the latest was written in
   * this ledger (that one was read, and so renewed, by the write). Never a
   * binary search over history that the sweep lets archive.
   */
  voting_supply_at_previous_ledger(options?: MethodOptions): Promise<AssembledTransaction<bigint>>;
}

export class Client extends ContractClient {
  constructor(public readonly options: ContractClientOptions) {
    super(
      new Spec(["AAAABAAAADNUb2tlbiBlcnJvcnMgKGJsb2NrIGBjb21tb246OmVycm9yOjpjb2Rlczo6VE9LRU5gKS4AAAAAAAAAAApUb2tlbkVycm9yAAAAAAATAAAAeFRoZSBtaW50ZXIgaXMgbmVpdGhlciB0aGUgYWRtaW4gbm9yIGEgcmVnaXN0ZXJlZCBtb2R1bGUgYWxsb3dlZCB0byBtaW50Cm5vdyAoYmVmb3JlIGxhdW5jaCBvbmx5IHRoZSBgY2xhaW1zYCBtb2R1bGUgbWF5KQAAABdNaW50QXV0aG9yaXR5Tm90QWxsb3dlZAAAABwhAAAAQUludmFsaWQgaW5wdXQgcGFyYW1ldGVycyAobWlzbWF0Y2hlZCBsZW5ndGhzLCB6ZXJvIGFtb3VudHMsIGV0Yy4pAAAAAAAADEludmFsaWRJbnB1dAAAHCIAAABBYGxhdW5jaGAgdHJlYXN1cnkgZGlmZmVycyBmcm9tIHRoZSB0cmVhc3VyeSB3aXJlZCBhdCBjb25zdHJ1Y3Rpb24AAAAAAAAQVHJlYXN1cnlNaXNtYXRjaAAAHCMAAABBYGJhdGNoX21pbnRgIGV4Y2VlZHMgdGhlIGV2ZW50IGJ1ZGdldCAoYGNvbW1vbjo6YmF0Y2hfbWludF9maXRzYCkAAAAAAAANQmF0Y2hUb29MYXJnZQAAAAAAHCUAAAA8VGhlIGNvbGxlY3Rpb24gbmFtZSBjb250YWlucyBgImAsIGBcYCBvciBhIGNvbnRyb2wgY2hhcmFjdGVyAAAAC0ludmFsaWROYW1lAAAAHCcAAAA6VGhlIG1ldGFkYXRhIGNvbnRyYWN0IGFkZHJlc3MgaXMgbWlzc2luZyBmcm9tIHRoZSBpbnN0YW5jZQAAAAAADk1ldGFkYXRhTm90U2V0AAAAABwoAAAAJlRoZSBhZGRyZXNzIGlzIG5vdCBhIHJlZ2lzdGVyZWQgbW9kdWxlAAAAAAAKTm90QU1vZHVsZQAAAAAcKQAAAGlPbmx5IGRlcGxveWVkIFdhc20gY29udHJhY3RzIGNhbiBiZSBtb2R1bGVzIChub3Qgd2FsbGV0cywgU3RlbGxhciBBc3NldApDb250cmFjdHMgb3IgcHJlZGljdGVkIGFkZHJlc3NlcykAAAAAAAAMTm90QUNvbnRyYWN0AAAcKgAAADJUaGUga2luZCBpcyBub3QgYSBidWlsdC1pbiBraW5kIG9yIGBjdXN0b21fPG5hbWU+YAAAAAAAC0ludmFsaWRLaW5kAAAAHCsAAAAkQW5vdGhlciBtb2R1bGUgYWxyZWFkeSBoYXMgdGhpcyBraW5kAAAACUtpbmRUYWtlbgAAAAAAHCwAAAAhVGhlIGFkZHJlc3MgaXMgYWxyZWFkeSByZWdpc3RlcmVkAAAAAAAAF01vZHVsZUFscmVhZHlSZWdpc3RlcmVkAAAAHC0AAABBVGhlIHJlZ2lzdHJ5IGFscmVhZHkgaG9sZHMgYGNvbW1vbjo6bW9kdWxlczo6TUFYX01PRFVMRVNgIG1vZHVsZXMAAAAAAAAOVG9vTWFueU1vZHVsZXMAAAAAHC4AAAAxVGhlIG1pbnQgZXhjZWVkcyB0aGUgbW9kdWxlJ3MgcmVtYWluaW5nIGFsbG93YW5jZQAAAAAAABFBbGxvd2FuY2VFeGNlZWRlZAAAAAAAHC8AAAB4VGhlIHRva2VuIGlzIGxvY2tlZCBhbmQgdGhpcyBtb3ZlbWVudCBvciBhcHByb3ZhbCBpcyBub3Qgb25lIG9mIHRoZQpEQU8tY29udHJvbGxlZCBwYXRocyAoZG9jcy9kZXNpZ25zL2xvY2tlZC10b2tlbnMubWQpAAAAD1RyYW5zZmVyc0xvY2tlZAAAABwwAAAAPkEgc3dpdGNoIG9yIHRyYW5zZmVyIGFnZW50IHdhcyBzZXQgdG8gdGhlIHZhbHVlIGl0IGFscmVhZHkgaGFzAAAAAAAQU2V0dGluZ1VuY2hhbmdlZAAAHDEAAAAqYGRhb190cmFuc2ZlcmAgd2hpbGUgYGRhb19yZWNvdmVyeWAgaXMgb2ZmAAAAAAALUmVjb3ZlcnlPZmYAAAAcMgAAAEJgYWdlbnRfdHJhbnNmZXJgIGJ5IGEgbW9kdWxlIHRoZSBEQU8gaGFzIG5vdCBtYWRlIGEgdHJhbnNmZXIgYWdlbnQAAAAAABBOb3RUcmFuc2ZlckFnZW50AAAcMwAAAE1gZGFvX3RyYW5zZmVyYCBmcm9tIG9yIHRvIGEgcmVnaXN0ZXJlZCBtb2R1bGUgKGN1c3RvZHkga2VlcHMgaXRzIG93bgpyZWNvcmRzKQAAAAAAAA1Nb2R1bGVDdXN0b2R5AAAAAAAcNAAAAEdNZW1iZXJzLW9ubHkgZGVsZWdhdGlvbjogdGhlIGRlbGVnYXRlZSBob2xkcyBubyB0b2tlbiBvciBob2xkcyBubyB2b3RlcwAAAAARRGVsZWdhdGVOb3RNZW1iZXIAAAAAABw1", "AAAABQAAAHNUaGUgREFPIG1vdmVkIGEgdG9rZW4gYnkgcHJvcG9zYWwgKGBkYW9fdHJhbnNmZXJgOyBuZXh0IHRvCk9wZW5aZXBwZWxpbidzIGBUcmFuc2ZlcmApOiBsb3N0LWtleSByZWNvdmVyeSBvciByZWNhbGwuAAAAAAAAAAALRGFvVHJhbnNmZXIAAAAAAQAAAAxkYW9fdHJhbnNmZXIAAAAEAAAAAAAAAARmcm9tAAAAEwAAAAEAAAAAAAAAAnRvAAAAAAATAAAAAQAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAAAAAAAAAAAKY2hhbmdlZF9ieQAAAAAAEwAAAAAAAAAC", "AAAABQAAAENBIHRyYW5zZmVyIGFnZW50IG1vdmVkIGEgdG9rZW4gKG5leHQgdG8gT3BlblplcHBlbGluJ3MgYFRyYW5zZmVyYCkuAAAAAAAAAAANQWdlbnRUcmFuc2ZlcgAAAAAAAAEAAAAOYWdlbnRfdHJhbnNmZXIAAAAAAAQAAAAAAAAABWFnZW50AAAAAAAAEwAAAAEAAAAAAAAABGZyb20AAAATAAAAAAAAAAAAAAACdG8AAAAAABMAAAAAAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAAAAAAAAg==", "AAAABQAAAEFFbWl0dGVkIG9uY2Ugd2hlbiB0aGUgTWFuYWdlciBsYXVuY2hlcyB0aGUgdG9rZW4gKFNldHVwIC0+IExpdmUpLgAAAAAAAAAAAAANVG9rZW5MYXVuY2hlZAAAAAAAAAEAAAAOdG9rZW5fbGF1bmNoZWQAAAAAAAIAAAAAAAAACHRyZWFzdXJ5AAAAEwAAAAEAAAArVGhlIGluaXRpYWwgbWludCBhbGxvd2FuY2VzIGBsYXVuY2hgIHdyb3RlLgAAAAAGZ3JhbnRzAAAAAAPqAAAH0AAAAAlNaW50R3JhbnQAAAAAAAAAAAAAAg==", "AAAABQAAALRFbWl0dGVkIGZvciBldmVyeSB0b2tlbiBtaW50ZWQgYnkgYG1pbnRgLCBuZXh0IHRvIE9wZW5aZXBwZWxpbidzIGBNaW50YCwgdG8KcmVjb3JkIHdobyBwZXJmb3JtZWQgdGhlIG1pbnQgKHRoZSBhZG1pbiBvciBhIG1vZHVsZSkuCmBiYXRjaF9taW50YCBlbWl0cyBgTWludEJhdGNoV2l0aE1pbnRlcmAgaW5zdGVhZC4AAAAAAAAADk1pbnRXaXRoTWludGVyAAAAAAABAAAAEG1pbnRfd2l0aF9taW50ZXIAAAADAAAAAAAAAAZtaW50ZXIAAAAAABMAAAABAAAAAAAAAAJ0bwAAAAAAEwAAAAEAAAAAAAAACHRva2VuX2lkAAAABAAAAAAAAAAC", "AAAABQAAAIdFbWl0dGVkIGJ5IGBzZXRfbWV0YWRhdGFgIChhZG1pbiBvbmx5KS4gT3BlblplcHBlbGluJ3MgYHNldF9tZXRhZGF0YWAKd3JpdGVzIHN0b3JhZ2Ugc2lsZW50bHk7IHRoaXMgbWFrZXMgYSByZW5hbWUgdmlzaWJsZSB0byBpbmRleGVycy4AAAAAAAAAAA9NZXRhZGF0YVVwZGF0ZWQAAAAAAQAAABBtZXRhZGF0YV91cGRhdGVkAAAAAgAAAAAAAAAEbmFtZQAAABAAAAAAAAAAAAAAAAZzeW1ib2wAAAAAABAAAAAAAAAAAg==", "AAAABQAAALZFbWl0dGVkIHdoZW4gYSBtb2R1bGUgam9pbnMgdGhlIHJlZ2lzdHJ5ICh0aGUgTWFuYWdlciBhdCBgY3JlYXRlX2Rhb2AgLwpgY3JlYXRlX21vZHVsZWAgaW4gU2V0dXAsIHRoZSBUcmVhc3VyeSBieSBwcm9wb3NhbCBvbmNlIGxpdmUpLgpUaGUgaW5kZXhlciBhbGxvd2xpc3RzIG1vZHVsZXMgZnJvbSB0aGlzIGV2ZW50LgAAAAAAAAAAABBNb2R1bGVSZWdpc3RlcmVkAAAAAQAAABFtb2R1bGVfcmVnaXN0ZXJlZAAAAAAAAAMAAAAAAAAABGtpbmQAAAARAAAAAQAAAAAAAAAHYWRkcmVzcwAAAAATAAAAAAAAAAAAAAAKbm9uX3ZvdGluZwAAAAAAAQAAAAAAAAAC", "AAAABQAAACBFbWl0dGVkIG9uY2UgYnkgdGhlIGNvbnN0cnVjdG9yLgAAAAAAAAAQVG9rZW5Jbml0aWFsaXplZAAAAAEAAAARdG9rZW5faW5pdGlhbGl6ZWQAAAAAAAAEAAAAAAAAAAVhZG1pbgAAAAAAABMAAAABAAAAAAAAAARuYW1lAAAAEAAAAAAAAAAAAAAABnN5bWJvbAAAAAAAEAAAAAAAAAArVGhlIG1lbWJlcnNoaXAgc3dpdGNoZXMgY2hvc2VuIGF0IGNyZWF0aW9uLgAAAAAIc2V0dGluZ3MAAAfQAAAADVRva2VuU2V0dGluZ3MAAAAAAAAAAAAAAg==", "AAAABQAAAEdgc2V0X2Rhb19yZWNvdmVyeWA6IERBTyByZWNvdmVyeSAoYGRhb190cmFuc2ZlcmApIHdhcyB0dXJuZWQgb24gb3Igb2ZmLgAAAAAAAAAAEkRhb1JlY292ZXJ5Q2hhbmdlZAAAAAAAAQAAABRkYW9fcmVjb3ZlcnlfY2hhbmdlZAAAAAIAAAAAAAAAB2VuYWJsZWQAAAAAAQAAAAAAAAAAAAAACmNoYW5nZWRfYnkAAAAAABMAAAAAAAAAAg==", "AAAABQAAACpFbWl0dGVkIHdoZW4gYSBtb2R1bGUgbGVhdmVzIHRoZSByZWdpc3RyeS4AAAAAAAAAAAASTW9kdWxlVW5yZWdpc3RlcmVkAAAAAAABAAAAE21vZHVsZV91bnJlZ2lzdGVyZWQAAAAAAgAAAAAAAAAEa2luZAAAABEAAAABAAAAAAAAAAdhZGRyZXNzAAAAABMAAAAAAAAAAg==", "AAAABQAAAQlFbWl0dGVkIG9uY2UgcGVyIGBiYXRjaF9taW50YCBjYWxsIGZvciB0aGUgY29udGlndW91cyByYW5nZQpgW2ZpcnN0X3Rva2VuX2lkLCBmaXJzdF90b2tlbl9pZCArIGNvdW50KWAsIGluc3RlYWQgb2Ygb25lCmBNaW50V2l0aE1pbnRlcmAgcGVyIHRva2VuIChrZWVwcyBsYXJnZSBiYXRjaGVzIHVuZGVyIHRoZSBwZXItdHJhbnNhY3Rpb24KZXZlbnQgc2l6ZSBsaW1pdCkuIFJlY2lwaWVudHMgY29tZSBmcm9tIE9wZW5aZXBwZWxpbidzIHBlci10b2tlbiBgTWludGAuAAAAAAAAAAAAABNNaW50QmF0Y2hXaXRoTWludGVyAAAAAAEAAAAWbWludF9iYXRjaF93aXRoX21pbnRlcgAAAAAAAwAAAAAAAAAGbWludGVyAAAAAAATAAAAAQAAAAAAAAAOZmlyc3RfdG9rZW5faWQAAAAAAAQAAAAAAAAAAAAAAAVjb3VudAAAAAAAAAQAAAAAAAAAAg==", "AAAABQAAAP5FbWl0dGVkIHdoZW4gYSBtb2R1bGUncyBtaW50IGFsbG93YW5jZSBpcyBzZXQgYnkgYGxhdW5jaGAsIHJhaXNlZCBvcgpsb3dlcmVkIGJ5IHRoZSBhZG1pbiwgemVyb2VkIGJ5IGB1bnJlZ2lzdGVyX21vZHVsZWAsIG9yIHJlbGVhc2VkIGJ5IHRoZQptb2R1bGUgaXRzZWxmLiBOb3QgZW1pdHRlZCB3aGVuIGEgbWludCBzcGVuZHMgYWxsb3dhbmNlICh0aGUgcmVtYWluaW5nCmFtb3VudCBpcyByZWFkYWJsZSB3aXRoIGBtaW50X2FsbG93YW5jZWApLgAAAAAAAAAAABRNaW50QWxsb3dhbmNlQ2hhbmdlZAAAAAEAAAAWbWludF9hbGxvd2FuY2VfY2hhbmdlZAAAAAAABAAAAAAAAAAGbW9kdWxlAAAAAAATAAAAAQAAAAAAAAANb2xkX2FsbG93YW5jZQAAAAAAAAQAAAAAAAAAAAAAAAlhbGxvd2FuY2UAAAAAAAAEAAAAAAAAAAAAAAAKY2hhbmdlZF9ieQAAAAAAEwAAAAAAAAAC", "AAAABQAAAGFBIG1vZHVsZSBiZWNhbWUgKG9yIHN0b3BwZWQgYmVpbmcpIGEgdHJhbnNmZXIgYWdlbnQ6IGBzZXRfdHJhbnNmZXJfYWdlbnRgCm9yIGB1bnJlZ2lzdGVyX21vZHVsZWAuAAAAAAAAAAAAABRUcmFuc2ZlckFnZW50Q2hhbmdlZAAAAAEAAAAWdHJhbnNmZXJfYWdlbnRfY2hhbmdlZAAAAAAAAwAAAAAAAAAGbW9kdWxlAAAAAAATAAAAAQAAAAAAAAAHZW5hYmxlZAAAAAABAAAAAAAAAAAAAAAKY2hhbmdlZF9ieQAAAAAAEwAAAAAAAAAC", "AAAABQAAADZgc2V0X3RyYW5zZmVyc19sb2NrZWRgOiB0aGUgbG9jayB3YXMgdHVybmVkIG9uIG9yIG9mZi4AAAAAAAAAAAAUVHJhbnNmZXJzTG9ja0NoYW5nZWQAAAABAAAAFnRyYW5zZmVyc19sb2NrX2NoYW5nZWQAAAAAAAIAAAAAAAAABmxvY2tlZAAAAAAAAQAAAAAAAAAAAAAACmNoYW5nZWRfYnkAAAAAABMAAAAAAAAAAg==", "AAAABQAAADtgc2V0X21lbWJlcnNfb25seV9kZWxlZ2F0aW9uYDogdGhlIGRlbGVnYXRpb24gcnVsZSBjaGFuZ2VkLgAAAAAAAAAAHE1lbWJlcnNPbmx5RGVsZWdhdGlvbkNoYW5nZWQAAAABAAAAH21lbWJlcnNfb25seV9kZWxlZ2F0aW9uX2NoYW5nZWQAAAAAAgAAAAAAAAAHZW5hYmxlZAAAAAABAAAAAAAAAAAAAAAKY2hhbmdlZF9ieQAAAAAAEwAAAAAAAAAC", "AAAAAAAAASJNaW50cyB0aGUgbmV4dCBzZXF1ZW50aWFsIHRva2VuIGlkIHRvIGB0b2AgKG1pbnRlciBhdXRoOyB0aGUgbWludGVyIG11c3QKYmUgdGhlIGFkbWluIG9yIGEgcmVnaXN0ZXJlZCBtb2R1bGUgd2l0aCBhbGxvd2FuY2UsIHNlZSBgIyBNaW50aW5nYCkuIEEgcmVjaXBpZW50IHdpdGhvdXQgYQpkZWxlZ2F0ZSBpcyBzZWxmLWRlbGVnYXRlZCBzbyBpdCBjYW4gdm90ZSBpbW1lZGlhdGVseS4gRW1pdHMKT3BlblplcHBlbGluIGBNaW50YCBwbHVzIGBNaW50V2l0aE1pbnRlcmAuIFJldHVybnMgdGhlIHRva2VuIGlkLgAAAAAABG1pbnQAAAACAAAAAAAAAAZtaW50ZXIAAAAAABMAAAAAAAAAAnRvAAAAAAATAAAAAQAAAAQ=", "AAAAAAAAABdTRVAtNTAgY29sbGVjdGlvbiBuYW1lLgAAAAAEbmFtZQAAAAAAAAABAAAAEA==", "AAAAAAAAAERNb2R1bGUgYWRtaW46IHRoZSBsYXVuY2ggYWRtaW4gZHVyaW5nIHNldHVwLCB0aGUgVHJlYXN1cnkgb25jZSBsaXZlLgAAAAVhZG1pbgAAAAAAAAAAAAABAAAAEw==", "AAAAAAAAAZpPbmUtc2hvdCwgTWFuYWdlci1vbmx5IGxhdW5jaCAoU2V0dXAgLT4gTGl2ZSkuCgpIYW5kcyB0aGUgYWRtaW4gdG8gYHRyZWFzdXJ5YCAodW5sZXNzIGBoYW5kb2ZmYCBhbHJlYWR5IGRpZCksIHJhaXNlcwplYWNoIHJlZ2lzdGVyZWQgbW9kdWxlJ3MgYWxsb3dhbmNlIGJ5IGl0cyBncmFudCAoYE5vdEFNb2R1bGVgIGZvcgphbnl0aGluZyBlbHNlKSwgbWFya3MgdGhlIHRva2VuIGxpdmUgYW5kIGVtaXRzIGBUb2tlbkxhdW5jaGVkYC4gVGhlClRyZWFzdXJ5IG5lZWRzIG5vIGdyYW50OiBhcyBhZG1pbiBpdCBtaW50cyB3aXRob3V0IGxpbWl0LiBBIHNlY29uZCBjYWxsCnBhbmljcyB3aXRoIGBBbHJlYWR5TGl2ZWAsIHNvIGFmdGVyIGxhdW5jaCB0aGUgTWFuYWdlciBoYXMgbm8gYXV0aG9yaXR5Cm92ZXIgdGhlIHRva2VuLgAAAAAABmxhdW5jaAAAAAAAAgAAAAAAAAAIdHJlYXN1cnkAAAATAAAAAAAAAAZncmFudHMAAAAAA+oAAAfQAAAACU1pbnRHcmFudAAAAAAAAAA=", "AAAAAAAAAH1Ub2tlbnMgbWludGVkIHNvIGZhciAodGhlIG5leHQgaWQpLiBJZHMgYXJlIHNlcXVlbnRpYWwgYW5kIG5ldmVyCmJ1cm5lZCwgc28gYSB0b2tlbiBleGlzdHMgZXhhY3RseSB3aGVuIGl0cyBpZCBpcyBiZWxvdyB0aGlzLgAAAAAAAAZtaW50ZWQAAAAAAAAAAAABAAAABA==", "AAAAAAAAAChUaGUgcmVnaXN0ZXJlZCBtb2R1bGUgb2YgYGtpbmRgLCBpZiBhbnkuAAAABm1vZHVsZQAAAAAAAQAAAAAAAAAEa2luZAAAABEAAAABAAAD6AAAABM=", "AAAAAAAAABlTRVAtNTAgY29sbGVjdGlvbiBzeW1ib2wuAAAAAAAABnN5bWJvbAAAAAAAAAAAAAEAAAAQ", "AAAAAAAAAYdBcHByb3ZlcyBgc3BlbmRlcmAgdG8gdHJhbnNmZXIgYHRva2VuX2lkYCB1bnRpbCBgZXhwaXJhdGlvbl9sZWRnZXJgCihgb3duZXJgIGF1dGg6IHRoZSBvd25lciBvciBhbiBvcGVyYXRvcikuIFRoZSBhcHByb3ZhbCBpcyBjbGVhcmVkIHdoZW4KdGhlIHRva2VuIG1vdmVzLiBPbiBhIGxvY2tlZCB0b2tlbiBhIGhvbGRlcidzIHRva2VuIGNhbiBiZSBhcHByb3ZlZApvbmx5IHRvIHRoZSBUcmVhc3VyeSAoYFRyYW5zZmVyc0xvY2tlZGApOyB0aGUgcnVsZSByZWFkcyB0aGUgdG9rZW4ncwpvd25lciwgbmV2ZXIgdGhlIGFwcHJvdmVyLCBhbmQgcmV2b2tpbmcgKGBleHBpcmF0aW9uX2xlZGdlciA9PSAwYCkgaXMKYWx3YXlzIGFsbG93ZWQuIEVtaXRzIE9wZW5aZXBwZWxpbiBgQXBwcm92ZWAuAAAAAAdhcHByb3ZlAAAAAAQAAAAAAAAABW93bmVyAAAAAAAAEwAAAAAAAAAHc3BlbmRlcgAAAAATAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAAAAAAAEWV4cGlyYXRpb25fbGVkZ2VyAAAAAAAABAAAAAA=", "AAAAAAAAADhUaGUgcmVnaXN0ZXJlZCBgYXVjdGlvbmAgbW9kdWxlIChob2xkcyBubyB2b3RpbmcgcG93ZXIpLgAAAAdhdWN0aW9uAAAAAAAAAAABAAAD6AAAABM=", "AAAAAAAAACROdW1iZXIgb2YgdG9rZW5zIG93bmVkIGJ5IGBhY2NvdW50YC4AAAAHYmFsYW5jZQAAAAABAAAAAAAAAAdhY2NvdW50AAAAABMAAAABAAAABA==", "AAAAAAAAANtNYW5hZ2VyLW9ubHkgZWFybHkgaGFuZG9mZiAoYG1hbmFnZXIub3Blbl9hc3N1cmFuY2VgKTogdGhlIGFkbWluIG1vdmVzCnRvIHRoZSBUcmVhc3VyeSBhbmQgdGhlIHRva2VuIHN0YXlzIGluIFNldHVwLCBzbyBmb3VuZGVyIG1pbnRzLApzZXR0aW5ncyBhbmQgYWxsb3dhbmNlcyBhcmUgZnJvemVuIHVudGlsIGxhdW5jaC4gUGFuaWNzIGBBbHJlYWR5TGl2ZWAKb25jZSBsYXVuY2hlZC4AAAAAB2hhbmRvZmYAAAAAAQAAAAAAAAAIdHJlYXN1cnkAAAATAAAAAA==", "AAAAAAAAADRXaGV0aGVyIHRoZSB0b2tlbiBoYXMgYmVlbiBsYXVuY2hlZCAoU2V0dXAgLT4gTGl2ZSkuAAAAB2lzX2xpdmUAAAAAAAAAAAEAAAAB", "AAAAAAAAADhNYW5hZ2VyIHRoYXQgYXBwcm92ZXMgdXBncmFkZXMgYW5kIHBlcmZvcm1lZCB0aGUgbGF1bmNoLgAAAAdtYW5hZ2VyAAAAAAAAAAABAAAAEw==", "AAAAAAAAADlBZHZhbmNlIHRoZSBzdG9yYWdlIGxheW91dCBhZnRlciBhbiB1cGdyYWRlIChhZG1pbiBvbmx5KS4AAAAAAAAHbWlncmF0ZQAAAAAAAAAAAA==", "AAAAAAAAAC9FdmVyeSByZWdpc3RlcmVkIG1vZHVsZSwgaW4gcmVnaXN0cmF0aW9uIG9yZGVyLgAAAAAHbW9kdWxlcwAAAAAAAAAAAQAAA+oAAAfQAAAAC01vZHVsZUVudHJ5AA==", "AAAAAAAAAAAAAAAHdXBncmFkZQAAAAACAAAAAAAAAAlmcm9tX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAHdG9faGFzaAAAAAPuAAAAIAAAAAA=", "AAAAAAAAAEFSZXR1cm5zIHRoZSByZWxlYXNlIHZlcnNpb24gcmVnaXN0ZXJlZCBmb3IgdGhlIGFjdGl2ZSB0b2tlbiBXQVNNLgAAAAAAAAd2ZXJzaW9uAAAAAAAAAAABAAAAEA==", "AAAAAAAAAMdPcGVuWmVwcGVsaW4gYGRlbGVnYXRlYCwgcmVmdXNlZCAoYERlbGVnYXRlTm90TWVtYmVyYCkgd2hlbgptZW1iZXJzLW9ubHkgZGVsZWdhdGlvbiBpcyBvbiBhbmQgYGRlbGVnYXRlZWAgaXMgbmVpdGhlciB0aGUgYWNjb3VudAppdHNlbGYgbm9yIGEgdm90aW5nIG1lbWJlciAoZG9jcy9kZXNpZ25zL2xvY2tlZC10b2tlbnMubWQgIlN3aXRjaCAyIikuAAAAAAhkZWxlZ2F0ZQAAAAIAAAAAAAAAB2FjY291bnQAAAAAEwAAAAAAAAAJZGVsZWdhdGVlAAAAAAAAEwAAAAA=", "AAAAAAAAADJSZXR1cm5zIHRoZSBtZXRhZGF0YSBjb250cmFjdCB1c2VkIGZvciBtaW50IGhvb2tzLgAAAAAACG1ldGFkYXRhAAAAAAAAAAEAAAPoAAAAEw==", "AAAAAAAAADhPd25lciBvZiBgdG9rZW5faWRgLiBQYW5pY3MgaWYgdGhlIHRva2VuIGRvZXMgbm90IGV4aXN0LgAAAAhvd25lcl9vZgAAAAEAAAAAAAAACHRva2VuX2lkAAAABAAAAAEAAAAT", "AAAAAAAAAB5UaGUgdGhyZWUgbWVtYmVyc2hpcCBzd2l0Y2hlcy4AAAAAAAhzZXR0aW5ncwAAAAAAAAABAAAH0AAAAA1Ub2tlblNldHRpbmdzAAAA", "AAAAAAAAARNUcmFuc2ZlcnMgYHRva2VuX2lkYCBmcm9tIGBmcm9tYCAoYXV0aCkgdG8gYHRvYCwgbW92aW5nIHRoZSB2b3RpbmcgdW5pdApiZXR3ZWVuIHRoZWlyIGRlbGVnYXRlcy4gQSByZWNpcGllbnQgd2l0aG91dCBhIGRlbGVnYXRlIGlzCnNlbGYtZGVsZWdhdGVkLiBPbiBhIGxvY2tlZCB0b2tlbiBvbmx5IGEgREFPLWNvbnRyb2xsZWQgcGF0aCBwYXNzZXMKKGBUcmFuc2ZlcnNMb2NrZWRgLCBzZWUgYGNoZWNrX2xvY2tlZF9wYXRoYCkuIEVtaXRzIE9wZW5aZXBwZWxpbgpgVHJhbnNmZXJgLgAAAAAIdHJhbnNmZXIAAAADAAAAAAAAAARmcm9tAAAAEwAAAAAAAAACdG8AAAAAABMAAAAAAAAACHRva2VuX2lkAAAABAAAAAA=", "AAAAAAAAADpUaGUgREFPIFRyZWFzdXJ5IChhZG1pbiBvbmNlIGxpdmU7IGhvbGRzIG5vIHZvdGluZyBwb3dlcikuAAAAAAAIdHJlYXN1cnkAAAAAAAAAAQAAABM=", "AAAAAAAAAQxSZXR1cm5zIHRoZSBjdXJyZW50IHZvdGluZyBwb3dlciAoZGVsZWdhdGVkIHZvdGVzKSBvZiBhbiBhY2NvdW50LgoKUmV0dXJucyBgMGAgaWYgdGhlIGFjY291bnQgaGFzIG5vIGRlbGVnYXRlZCB2b3RpbmcgcG93ZXIgb3IgZG9lcyBub3QKZXhpc3QgaW4gdGhlIGNvbnRyYWN0LgoKIyBBcmd1bWVudHMKCiogYGVgIC0gQWNjZXNzIHRvIHRoZSBTb3JvYmFuIGVudmlyb25tZW50LgoqIGBhY2NvdW50YCAtIFRoZSBhZGRyZXNzIHRvIHF1ZXJ5IHZvdGluZyBwb3dlciBmb3IuAAAACWdldF92b3RlcwAAAAAAAAEAAAAAAAAAB2FjY291bnQAAAAAEwAAAAEAAAAK", "AAAAAAAAAZNTRVAtNTAgdG9rZW4gbWV0YWRhdGEsIGJ1aWx0IG9uLWNoYWluIGJ5IHRoZSBNZXRhZGF0YSBjb250cmFjdCAoYQpgZGF0YTphcHBsaWNhdGlvbi9qc29uO2Jhc2U2NGAgZG9jdW1lbnQpLiBQYW5pY3MgaWYgdGhlIHRva2VuIGRvZXMgbm90CmV4aXN0IG9yIGhhcyBubyBhcnR3b3JrIHlldC4KCkV4aXN0ZW5jZSBpcyBgdG9rZW5faWQgPCBuZXh0IGlkYCAoaWRzIGFyZSBzZXF1ZW50aWFsIGFuZCBuZXZlciBidXJuZWQpLApub3QgYG93bmVyX29mYDogT3BlblplcHBlbGluIHJlbmV3cyBhbiBvd25lcnNoaXAgZW50cnkgZm9yIDMwIGRheXMgcGVyCnRvdWNoLCBzbyByZWFkaW5nIGl0IHdvdWxkIG1ha2UgYW4gaWRsZSBob2xkZXIncyB0b2tlbiB1bnJlbmRlcmFibGUKb25jZSB0aGUgZW50cnkgYXJjaGl2ZXMuAAAAAAl0b2tlbl91cmkAAAAAAAABAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAABAAAAEA==", "AAAAAAAAACNSZXR1cm5zIHRoZSBhY3RpdmUgdG9rZW4gV0FTTSBoYXNoLgAAAAAJd2FzbV9oYXNoAAAAAAAAAAAAAAEAAAPuAAAAIA==", "AAAAAAAAAq1NaW50cyBgYW1vdW50c1tpXWAgc2VxdWVudGlhbCB0b2tlbnMgdG8gZWFjaCBgcmVjaXBpZW50c1tpXWAgaW4gb25lIGNhbGwKKHNhbWUgYXV0aG9yaXR5IHJ1bGVzIGFzIGBtaW50YCkuIFRoZSBiYXRjaCBtdXN0IGZpdCB0aGUgZXZlbnQgYnVkZ2V0CihgY29tbW9uOjpiYXRjaF9taW50X2ZpdHNgLCBgQmF0Y2hUb29MYXJnZWApOiBhdCBtb3N0CmBjb21tb246Ok1BWF9CQVRDSF9NSU5UYCB0b2tlbnMgdG8gb25lIHJlY2lwaWVudCwgb3IKYGNvbW1vbjo6TUFYX0JBVENIX1JFQ0lQSUVOVFNgIHJlY2lwaWVudHMgb2Ygb25lIHRva2VuIGVhY2guIEVhY2ggbmV3CnJlY2lwaWVudCBhZGRzIGRlbGVnYXRpb24gZXZlbnRzIG9uIHRvcCBvZiB0aGUgcGVyLXRva2VuIGNvc3QuIFRoZSBjYXAKYWxzbyBib3VuZHMgdGhlIG1ldGFkYXRhIGhvb2suCgpEZWxlZ2F0aW9uLCBiYWxhbmNlIGFuZCB2b3RlIGNoZWNrcG9pbnRzIGFyZSB0b3VjaGVkIG9uY2UgcGVyIHJlY2lwaWVudAplbnRyeSByYXRoZXIgdGhhbiBvbmNlIHBlciB0b2tlbiwgd2hpY2gga2VlcHMgdGhlIGZvb3RwcmludCBzbWFsbC4KRW1pdHMgT3BlblplcHBlbGluIGBNaW50YCBwZXIgdG9rZW4gYW5kIG9uZSBgTWludEJhdGNoV2l0aE1pbnRlcmAgZm9yCnRoZSB3aG9sZSByYW5nZS4gUmV0dXJucyBldmVyeSBuZXcgdG9rZW4gaWQgaW4gb3JkZXIuAAAAAAAACmJhdGNoX21pbnQAAAAAAAMAAAAAAAAABm1pbnRlcgAAAAAAEwAAAAAAAAAKcmVjaXBpZW50cwAAAAAD6gAAABMAAAAAAAAAB2Ftb3VudHMAAAAD6gAAAAoAAAABAAAD6gAAAAQ=", "AAAAAAAAAERUaGUgcmVnaXN0ZXJlZCBgbWFya2V0cGxhY2VgIG1vZHVsZSAoZXNjcm93OyBob2xkcyBubyB2b3RpbmcgcG93ZXIpLgAAAAttYXJrZXRwbGFjZQAAAAAAAAAAAQAAA+gAAAAT", "AAAAAAAAADVUaGUgVHJlYXN1cnkgbWF5IG1vdmUgYW55IG1lbWJlcidzIHRva2VuIGJ5IHByb3Bvc2FsLgAAAAAAAAxkYW9fcmVjb3ZlcnkAAAAAAAAAAQAAAAE=", "AAAAAAAAActNb3ZlIGB0b2tlbl9pZGAgZnJvbSB3aG9ldmVyIG93bnMgaXQgbm93IHRvIGB0b2AsIHdpdGhvdXQgdGhlIG93bmVyJ3MKc2lnbmF0dXJlICh0aGUgYWRtaW46IHRoZSBUcmVhc3VyeSwgYnkgcHJvcG9zYWw7IExpdmUgb25seTsgb25seSB3aGlsZQpgZGFvX3JlY292ZXJ5YCBpcyBvbiwgYFJlY292ZXJ5T2ZmYCkuIExvc3Qta2V5IHJlY292ZXJ5LCBhbmQgYnkgdGhlCnNhbWUgcG93ZXIgcmVjYWxsLiBUYWtpbmcgdGhlIGN1cnJlbnQgb3duZXIgbWVhbnMgYSBob2xkZXIgY2Fubm90CmRvZGdlIGEgcmVjYWxsIGJ5IG1vdmluZyB3YWxsZXRzIGR1cmluZyB0aGUgdm90ZS4gTmVpdGhlciB0aGUgb3duZXIKbm9yIGB0b2AgbWF5IGJlIGEgcmVnaXN0ZXJlZCBtb2R1bGUgKGBNb2R1bGVDdXN0b2R5YCk6IGN1c3RvZHkga2VlcHMKaXRzIG93biByZWNvcmRzLiBWb3RlcyBtb3ZlIGFzIG9uIGFueSB0cmFuc2Zlci4AAAAADGRhb190cmFuc2ZlcgAAAAIAAAAAAAAACHRva2VuX2lkAAAABAAAAAAAAAACdG8AAAAAABMAAAAA", "AAAAAAAAAFlUaGUgbGl2ZSBzaW5nbGUtdG9rZW4gYXBwcm92YWwgb2YgYHRva2VuX2lkYCwgaWYgYW55LiBQYW5pY3MgaWYgdGhlCnRva2VuIGRvZXMgbm90IGV4aXN0LgAAAAAAAAxnZXRfYXBwcm92ZWQAAAABAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAABAAAD6AAAABM=", "AAAAAAAAAcFSZXR1cm5zIHRoZSBjdXJyZW50IGRlbGVnYXRlIGZvciBhbiBhY2NvdW50LgoKIyBBcmd1bWVudHMKCiogYGVgIC0gQWNjZXNzIHRvIHRoZSBTb3JvYmFuIGVudmlyb25tZW50LgoqIGBhY2NvdW50YCAtIFRoZSBhZGRyZXNzIHRvIHF1ZXJ5IHRoZSBkZWxlZ2F0ZSBmb3IuCgojIFJldHVybnMKCiogYFNvbWUoQWRkcmVzcylgIC0gVGhlIGRlbGVnYXRlIGFkZHJlc3MgKG1heSBiZSB0aGUgYWNjb3VudCBpdHNlbGYgaWYKc2VsZi1kZWxlZ2F0ZWQpLgoqIGBOb25lYCAtIElmIHRoZSBhY2NvdW50IGhhcyBuZXZlciBkZWxlZ2F0ZWQuIEFuIGFjY291bnQgd2hvc2UgZGVsZWdhdGUKaXMgYE5vbmVgIGhhcyAqKm5vIGFjdGl2ZSB2b3RpbmcgcG93ZXIqKjsgaXQgbXVzdCBjYWxsCltgVm90ZXM6OmRlbGVnYXRlYF0gKGV2ZW4gdG8gaXRzZWxmKSBiZWZvcmUgaXRzIHZvdGVzIGFyZSBjb3VudGVkLgAAAAAAAAxnZXRfZGVsZWdhdGUAAAABAAAAAAAAAAdhY2NvdW50AAAAABMAAAABAAAD6AAAABM=", "AAAAAAAAAJRVcGRhdGVzIHRoZSBjb2xsZWN0aW9uIG5hbWUgYW5kIHN5bWJvbCAoYWRtaW4gb25seSkuIEVtaXRzCmBNZXRhZGF0YVVwZGF0ZWRgLiBUb2tlbiBtZXRhZGF0YSBpdHNlbGYgaXMgYnVpbHQgYnkgdGhlIE1ldGFkYXRhCmNvbnRyYWN0IChgdG9rZW5fdXJpYCkuAAAADHNldF9tZXRhZGF0YQAAAAIAAAAAAAAABG5hbWUAAAAQAAAAAAAAAAZzeW1ib2wAAAAAABAAAAAA", "AAAAAAAAAMZWb3RpbmctY2FwYWJsZSBzdXBwbHk6IGV2ZXJ5IG1pbnRlZCB0b2tlbiBleGNlcHQgdGhvc2UgaGVsZCBieSB0aGUKVHJlYXN1cnkgYW5kIG5vbi12b3RpbmcgbW9kdWxlcy4gVGhlIE1hbmFnZXIgcmVxdWlyZXMgaXQgdG8gYmUKcG9zaXRpdmUgYXQgbGF1bmNoLCBzbyBhIERBTyBjYW4gbmV2ZXIgbGF1bmNoIHdpdGhvdXQgYSBzaW5nbGUgdm90ZS4AAAAAAAx0b3RhbF9zdXBwbHkAAAAAAAAAAQAAAAs=", "AAAAAAAAA1RJbml0aWFsaXplcyB0aGUgdG9rZW4uCgoqIGBhZG1pbmAgLSBzZXR1cC1waGFzZSBhZG1pbiAodGhlIGxhdW5jaCBhZG1pbik7IGJlY29tZXMgdGhlIFRyZWFzdXJ5IGF0IGxhdW5jaAoqIGB0cmVhc3VyeWAgLSBEQU8gVHJlYXN1cnk7IGBsYXVuY2hgIG11c3QgYmUgY2FsbGVkIHdpdGggZXhhY3RseSB0aGlzIGFkZHJlc3MKKiBgbmFtZWAsIGBzeW1ib2xgIC0gY29sbGVjdGlvbiBuYW1lIGFuZCBzeW1ib2wgKE9wZW5aZXBwZWxpbiBjYXBzIHRoZW0KYXQgNDAgYW5kIDEwIGJ5dGVzOyB0aGUgbmFtZSBtYXkgbm90IGNvbnRhaW4gYCJgLCBgXGAgb3IgY29udHJvbApjaGFyYWN0ZXJzIGJlY2F1c2UgdGhlIG9uLWNoYWluIHRva2VuIEpTT04gY29waWVzIGl0IHZlcmJhdGltKQoqIGBtZXRhZGF0YWAgLSBtZXRhZGF0YSBjb250cmFjdCBjYWxsZWQgb24gZXZlcnkgbWludCB0byBzZWVkIGFydHdvcmsKKiBgbWFuYWdlcmAgLSBNYW5hZ2VyIGNvbnRyYWN0ICh1cGdyYWRlIGFwcHJvdmFscywgbGF1bmNoKQoqIGBjdXJyZW50X2hhc2hgIC0gdGhpcyBpbXBsZW1lbnRhdGlvbidzIFdBU00gaGFzaCAodGhlIHJlbGVhc2UgdmVyc2lvbiBpcwpyZWFkIGZyb20gdGhlIE1hbmFnZXIgcmVnaXN0cnksIHNlZSBgdmVyc2lvbmApCgoqIGBzZXR0aW5nc2AgLSB0aGUgbWVtYmVyc2hpcCBzd2l0Y2hlcyAoZG9jcy9kZXNpZ25zL2xvY2tlZC10b2tlbnMubWQpCgpDb3JlIHdpcmluZyBvbmx5OiB0aGUgTWFuYWdlciByZWdpc3RlcnMgdGhlIERBTydzIG1vZHVsZXMgKEF1Y3Rpb24sCk1hcmtldHBsYWNlLCBDbGFpbU1pbnRlcikgd2l0aCBgcmVnaXN0ZXJfbW9kdWxlYCByaWdodCBhZnRlciBkZXBsb3lpbmcKdGhlbS4AAAANX19jb25zdHJ1Y3RvcgAAAAAAAAgAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAIdHJlYXN1cnkAAAATAAAAAAAAAARuYW1lAAAAEAAAAAAAAAAGc3ltYm9sAAAAAAAQAAAAAAAAAAhtZXRhZGF0YQAAABMAAAAAAAAAB21hbmFnZXIAAAAAEwAAAAAAAAAMY3VycmVudF9oYXNoAAAD7gAAACAAAAAAAAAACHNldHRpbmdzAAAH0AAAAA1Ub2tlblNldHRpbmdzAAAAAAAAAA==", "AAAAAAAAAIVMaWtlIGB0cmFuc2ZlcmAsIGJ5IGFuIGFwcHJvdmVkIGBzcGVuZGVyYCAoYXV0aDsgT3BlblplcHBlbGluJ3MKYXBwcm92YWwgY2hlY2sgcnVucyBmaXJzdCwgc28gYW4gdW5hcHByb3ZlZCBzcGVuZGVyIGZhaWxzIGFzIGJlZm9yZSkuAAAAAAAADXRyYW5zZmVyX2Zyb20AAAAAAAAEAAAAAAAAAAdzcGVuZGVyAAAAABMAAAAAAAAABGZyb20AAAATAAAAAAAAAAJ0bwAAAAAAEwAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAA==", "AAAAAAAAASxBIHRyYW5zZmVyIGFnZW50IG1vdmVzIGB0b2tlbl9pZGAgZnJvbSBgZnJvbWAgdG8gYHRvYCAoTGl2ZSBvbmx5OwpgYWdlbnRgIGFuZCBgZnJvbWAgYm90aCBhdXRob3JpemU7IGBOb3RUcmFuc2ZlckFnZW50YCkuIFdvcmtzIG9uIGxvY2tlZAphbmQgdW5sb2NrZWQgdG9rZW5zIGFsaWtlLCBhbmQgZG9lcyBub3QgY2hlY2sgdGhlIHJlY2lwaWVudCdzIGNvbnNlbnQ6CmFuIGFnZW50IHRoYXQgbmVlZHMgaXQgY2hlY2tzIGl0IGl0c2VsZi4gRW1pdHMgT3BlblplcHBlbGluIGBUcmFuc2ZlcmAKYW5kIGBBZ2VudFRyYW5zZmVyYC4AAAAOYWdlbnRfdHJhbnNmZXIAAAAAAAQAAAAAAAAABWFnZW50AAAAAAAAEwAAAAAAAAAEZnJvbQAAABMAAAAAAAAAAnRvAAAAAAATAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAAA", "AAAAAAAAAEZIb3cgbWFueSBtb3JlIHRva2VucyBgbW9kdWxlYCBtYXkgbWludCAoMCBmb3IgdW5yZWdpc3RlcmVkIGFkZHJlc3NlcykuAAAAAAAObWludF9hbGxvd2FuY2UAAAAAAAEAAAAAAAAABm1vZHVsZQAAAAAAEwAAAAEAAAAE", "AAAAAAAAAU1MZXRzIGBvcGVyYXRvcmAgdHJhbnNmZXIgZXZlcnkgdG9rZW4gb2YgYG93bmVyYCB1bnRpbApgbGl2ZV91bnRpbF9sZWRnZXJgIChgb3duZXJgIGF1dGg7IDAgcmV2b2tlcykuIE9wZXJhdG9yIHRyYW5zZmVycyBnbwp0aHJvdWdoIGB0cmFuc2Zlcl9mcm9tYCwgc28gdm90ZXMgbW92ZSBleGFjdGx5IGFzIG9uIGEgZGlyZWN0IHRyYW5zZmVyLgpPbiBhIGxvY2tlZCB0b2tlbiBhIGhvbGRlciBjYW4gbmFtZSBvbmx5IHRoZSBUcmVhc3VyeQooYFRyYW5zZmVyc0xvY2tlZGApOyByZXZva2luZyBpcyBhbHdheXMgYWxsb3dlZC4gRW1pdHMgT3BlblplcHBlbGluCmBBcHByb3ZlRm9yQWxsYC4AAAAAAAAPYXBwcm92ZV9mb3JfYWxsAAAAAAMAAAAAAAAABW93bmVyAAAAAAAAEwAAAAAAAAAIb3BlcmF0b3IAAAATAAAAAAAAABFsaXZlX3VudGlsX2xlZGdlcgAAAAAAAAQAAAAA", "AAAAAAAAADJOdW1iZXIgb2Ygdm90ZSBjaGVja3BvaW50cyByZWNvcmRlZCBmb3IgYGFjY291bnRgLgAAAAAAD251bV9jaGVja3BvaW50cwAAAAABAAAAAAAAAAdhY2NvdW50AAAAABMAAAABAAAABA==", "AAAAAAAAAjpSZWdpc3RlcnMgYGFkZHJlc3NgIGFzIGEgbW9kdWxlIG9mIGBraW5kYC4gSW4gU2V0dXAgb25seSB0aGUgTWFuYWdlcgptYXkgcmVnaXN0ZXIgKGR1cmluZyBgY3JlYXRlX2Rhb2AgLyBgY3JlYXRlX21vZHVsZWApOyBvbmNlIGxpdmUgb25seQp0aGUgYWRtaW4gKHRoZSBUcmVhc3VyeSwgYnkgcHJvcG9zYWwpLgoKYGFkZHJlc3NgIG11c3QgYmUgYSBkZXBsb3llZCBXYXNtIGNvbnRyYWN0IChgTm90QUNvbnRyYWN0YCk6IHdhbGxldHMsClN0ZWxsYXIgQXNzZXQgQ29udHJhY3RzIGFuZCBwcmVkaWN0ZWQgYWRkcmVzc2VzIGFyZSByZWZ1c2VkLCBzbyBhCnByb3Bvc2FsIGNhbiBuZXZlciBtYXJrIGEgaG9sZGVyJ3Mgd2FsbGV0IG5vbi12b3RpbmcuIGBraW5kYCBpcyBhCmJ1aWx0LWluIGtpbmQgb3IgYGN1c3RvbV88bmFtZT5gIChgSW52YWxpZEtpbmRgKSBhbmQgdW5pcXVlCihgS2luZFRha2VuYCkuIElmIHRoZSBtb2R1bGUgaXMgYG5vbl92b3RpbmdgIGFuZCBhbHJlYWR5IGhvbGRzIHRva2VucywKdGhlaXIgdm90ZXMgbGVhdmUgdGhlIHN1cHBseSBub3cuIEVtaXRzIGBNb2R1bGVSZWdpc3RlcmVkYC4AAAAAAA9yZWdpc3Rlcl9tb2R1bGUAAAAAAwAAAAAAAAAEa2luZAAAABEAAAAAAAAAB2FkZHJlc3MAAAAAEwAAAAAAAAAKbm9uX3ZvdGluZwAAAAAAAQAAAAA=", "AAAAAAAAADlTdG9yYWdlLWxheW91dCB2ZXJzaW9uIG9mIHRoZSBkYXRhIGhlbGQgYnkgdGhpcyBjb250cmFjdC4AAAAAAAAPc3RvcmFnZV92ZXJzaW9uAAAAAAAAAAABAAAABA==", "AAAAAAAAACtUaGUgbW9kdWxlcyB0aGF0IG1heSBjYWxsIGBhZ2VudF90cmFuc2ZlcmAuAAAAAA90cmFuc2Zlcl9hZ2VudHMAAAAAAAAAAAEAAAPqAAAAEw==", "AAAAAAAAAPtSZXR1cm5zIHRoZSBjdXJyZW50IHRvdGFsIHN1cHBseSBvZiB2b3RpbmcgdW5pdHMuCgpUaGlzIHRyYWNrcyBhbGwgdm90aW5nIHVuaXRzIGluIGNpcmN1bGF0aW9uIChyZWdhcmRsZXNzIG9mIGRlbGVnYXRpb24Kc3RhdHVzKSwgbm90IGp1c3QgZGVsZWdhdGVkIHZvdGVzLgoKUmV0dXJucyBgMGAgaWYgbm8gdm90aW5nIHVuaXRzIGV4aXN0LgoKIyBBcmd1bWVudHMKCiogYGVgIC0gQWNjZXNzIHRvIHRoZSBTb3JvYmFuIGVudmlyb25tZW50LgAAAAAQZ2V0X3RvdGFsX3N1cHBseQAAAAAAAAABAAAACg==", "AAAAAAAAALJUdXJuIERBTyByZWNvdmVyeSBvbiBvciBvZmYgKHNhbWUgYXV0aG9yaXR5KS4gT24sIGEgcGFzc2VkIHByb3Bvc2FsCmNhbiBtb3ZlIGFueSBtZW1iZXIncyB0b2tlbiB3aXRoIGBkYW9fdHJhbnNmZXJgOyBvbmUgcHJvcG9zYWwgbWF5IHR1cm4KaXQgb24gYW5kIHVzZSBpdCBpbiB0aGUgc2FtZSBleGVjdXRpb24uAAAAAAAQc2V0X2Rhb19yZWNvdmVyeQAAAAEAAAAAAAAAB2VuYWJsZWQAAAAAAQAAAAA=", "AAAAAAAAACxUb2tlbnMgbW92ZSBvbmx5IGFsb25nIERBTy1jb250cm9sbGVkIHBhdGhzLgAAABB0cmFuc2ZlcnNfbG9ja2VkAAAAAAAAAAEAAAAB", "AAAAAAAAAbRSZW1vdmVzIGBhZGRyZXNzYCBmcm9tIHRoZSByZWdpc3RyeSAoc2FtZSBhdXRob3JpdHkgYXMKYHJlZ2lzdGVyX21vZHVsZWA7IGBOb3RBTW9kdWxlYCBpZiBhYnNlbnQpLiBJdHMgYWxsb3dhbmNlIGRyb3BzIHRvIDAuCklmIGl0IHdhcyBgbm9uX3ZvdGluZ2AgYW5kIHN0aWxsIGhvbGRzIHRva2VucywgaXQgaXMgc2VsZi1kZWxlZ2F0ZWQKZmlyc3QgYW5kIHRoZWlyIHZvdGVzIHJldHVybiB0byB0aGUgc3VwcGx5IHVuZGVyIGl0cyBvd24gYWRkcmVzcywgc28KdGhlIGFjY291bnQgY2hlY2twb2ludHMga2VlcCBhZGRpbmcgdXAgdG8gYFRvdGFsU3VwcGx5YC4gRW1wdHkgYSBtb2R1bGUKYmVmb3JlIHVucmVnaXN0ZXJpbmcgaXQ6IGxlZnRvdmVyIHRva2VucyBiZWNvbWUgdGhhdCBjb250cmFjdCdzIG93bgp2b3Rlcy4gRW1pdHMgYE1vZHVsZVVucmVnaXN0ZXJlZGAuAAAAEXVucmVnaXN0ZXJfbW9kdWxlAAAAAAAAAQAAAAAAAAAHYWRkcmVzcwAAAAATAAAAAA==", "AAAAAAAAATlNYWtlIGEgcmVnaXN0ZXJlZCBtb2R1bGUgYSB0cmFuc2ZlciBhZ2VudCwgb3Igc3RvcCBpdCBiZWluZyBvbmUKKGBOb3RBTW9kdWxlYDsgYFNldHRpbmdVbmNoYW5nZWRgKS4gU2FtZSBhdXRob3JpdHkgYXMKYHJlZ2lzdGVyX21vZHVsZWA6IGluIFNldHVwIG9ubHkgdGhlIE1hbmFnZXIgKGF0IGBjcmVhdGVfZGFvYCwgZm9yIHRoZQpraW5kcyB0aGUgY3JlYXRpb24gY29uZmlnIG5hbWVzKSwgb25jZSBMaXZlIG9ubHkgdGhlIGFkbWluICh0aGUKVHJlYXN1cnksIGJ5IHByb3Bvc2FsKS4gVGhlIGxhdW5jaCBhZG1pbiBjYW4gbmV2ZXIgZ3JhbnQgaXQuAAAAAAAAEnNldF90cmFuc2Zlcl9hZ2VudAAAAAAAAgAAAAAAAAAGbW9kdWxlAAAAAAATAAAAAAAAAAdlbmFibGVkAAAAAAEAAAAA", "AAAAAAAAAE9XaGV0aGVyIGBvcGVyYXRvcmAgY3VycmVudGx5IGhvbGRzIGEgbGl2ZSBhcHByb3ZhbCBmb3IgYWxsIG9mIGBvd25lcmAncwp0b2tlbnMuAAAAABNpc19hcHByb3ZlZF9mb3JfYWxsAAAAAAIAAAAAAAAABW93bmVyAAAAAAAAEwAAAAAAAAAIb3BlcmF0b3IAAAATAAAAAQAAAAE=", "AAAAAAAAAPZMb2NrIG9yIHVubG9jayB0cmFuc2ZlcnMgKHRoZSBhZG1pbjogdGhlIGxhdW5jaCBhZG1pbiBpbiBTZXR1cCwgdGhlClRyZWFzdXJ5IGJ5IHByb3Bvc2FsIG9uY2UgTGl2ZTsgYFNldHRpbmdVbmNoYW5nZWRgIGlmIHVuY2hhbmdlZCkuCkxvY2tpbmcgbW92ZXMgbm8gdG9rZW4gYnV0IHJlbW92ZXMgZXZlcnkgbWVtYmVyJ3MgZXhpdCBieSBzYWxlLCBzbyB0aGUKd2ViIGZsYWdzIGl0LiBBcHBsaWVzIGZyb20gdGhlIG5leHQgY2FsbC4AAAAAABRzZXRfdHJhbnNmZXJzX2xvY2tlZAAAAAEAAAAAAAAABmxvY2tlZAAAAAAAAQAAAAA=", "AAAAAAAAAQtBIG1vZHVsZSBnaXZlcyBiYWNrIGBhbW91bnRgIG9mIGl0cyBvd24gYWxsb3dhbmNlIChtb2R1bGUgYXV0aCksCnNhdHVyYXRpbmcgYXQgMDogZm9yIGV4YW1wbGUgYSBjbG9zZWQgcG9vbCdzIHVuc3RvY2tlZCByZW1haW5kZXIuCkVtaXRzIGBNaW50QWxsb3dhbmNlQ2hhbmdlZGAuIEFuIHVubGltaXRlZCBhbGxvd2FuY2UgKGB1MzI6Ok1BWGApIHN0YXlzCnVubGltaXRlZDogaXQgd2FzIG5ldmVyIHNwZW50LCBzbyB0aGVyZSBpcyBub3RoaW5nIHRvIGdpdmUgYmFjay4AAAAAFnJlbGVhc2VfbWludF9hbGxvd2FuY2UAAAAAAAIAAAAAAAAABm1vZHVsZQAAAAAAEwAAAAAAAAAGYW1vdW50AAAAAAAEAAAAAA==", "AAAAAAAAAGRMb3dlcnMgYG1vZHVsZWAncyBhbGxvd2FuY2UgYnkgYGFtb3VudGAsIHNhdHVyYXRpbmcgYXQgMCAoYWRtaW4gb25seSkuCkVtaXRzIGBNaW50QWxsb3dhbmNlQ2hhbmdlZGAuAAAAF2RlY3JlYXNlX21pbnRfYWxsb3dhbmNlAAAAAAIAAAAAAAAABm1vZHVsZQAAAAAAEwAAAAAAAAAGYW1vdW50AAAAAAAEAAAAAA==", "AAAAAAAAAeVSZXR1cm5zIHRoZSB2b3RpbmcgcG93ZXIgKGRlbGVnYXRlZCB2b3Rlcykgb2YgYW4gYWNjb3VudCBhdCBhIHNwZWNpZmljCnBhc3QgbGVkZ2VyIHNlcXVlbmNlIG51bWJlci4KClJldHVybnMgYDBgIGlmIHRoZSBhY2NvdW50IGhhZCBubyBkZWxlZ2F0ZWQgdm90aW5nIHBvd2VyIGF0IHRoZSBnaXZlbgpsZWRnZXIgb3IgZG9lcyBub3QgZXhpc3QgaW4gdGhlIGNvbnRyYWN0LgoKIyBBcmd1bWVudHMKCiogYGVgIC0gQWNjZXNzIHRvIHRoZSBTb3JvYmFuIGVudmlyb25tZW50LgoqIGBhY2NvdW50YCAtIFRoZSBhZGRyZXNzIHRvIHF1ZXJ5IHZvdGluZyBwb3dlciBmb3IuCiogYGxlZGdlcmAgLSBUaGUgbGVkZ2VyIHNlcXVlbmNlIG51bWJlciB0byBxdWVyeSAobXVzdCBiZSBpbiB0aGUgcGFzdCkuCgojIEVycm9ycwoKKiBbYFZvdGVzRXJyb3I6OkZ1dHVyZUxvb2t1cGBdIC0gSWYgYGxlZGdlcmAgPj0gY3VycmVudCBsZWRnZXIgc2VxdWVuY2UKbnVtYmVyLgAAAAAAABdnZXRfdm90ZXNfYXRfY2hlY2twb2ludAAAAAACAAAAAAAAAAdhY2NvdW50AAAAABMAAAAAAAAABmxlZGdlcgAAAAAABAAAAAEAAAAK", "AAAAAAAAAMhSYWlzZXMgYSByZWdpc3RlcmVkIG1vZHVsZSdzIGFsbG93YW5jZSBieSBgYW1vdW50YCAoYWRtaW4gb25seTsKYE5vdEFNb2R1bGVgIG90aGVyd2lzZSkuIEFkZHMgcmF0aGVyIHRoYW4gb3ZlcndyaXRlcywgc28gYSBncmFudCBmb3IgYQpzZWNvbmQgbGlzdCBuZXZlciBlcmFzZXMgdGhlIGZpcnN0LiBFbWl0cyBgTWludEFsbG93YW5jZUNoYW5nZWRgLgAAABdpbmNyZWFzZV9taW50X2FsbG93YW5jZQAAAAACAAAAAAAAAAZtb2R1bGUAAAAAABMAAAAAAAAABmFtb3VudAAAAAAABAAAAAA=", "AAAAAAAAAD1Ib2xkZXJzIGRlbGVnYXRlIG9ubHkgdG8gdGhlbXNlbHZlcyBvciBhbm90aGVyIHZvdGluZyBtZW1iZXIuAAAAAAAAF21lbWJlcnNfb25seV9kZWxlZ2F0aW9uAAAAAAAAAAABAAAAAQ==", "AAAAAAAAAH5UdXJuIG1lbWJlcnMtb25seSBkZWxlZ2F0aW9uIG9uIG9yIG9mZiAoc2FtZSBhdXRob3JpdHkpLiBHb3Zlcm5zIG5ldwpgZGVsZWdhdGVgIGNhbGxzIG9ubHk6IGRlbGVnYXRpb25zIGFscmVhZHkgaW4gcGxhY2Ugc3RheS4AAAAAABtzZXRfbWVtYmVyc19vbmx5X2RlbGVnYXRpb24AAAAAAQAAAAAAAAAHZW5hYmxlZAAAAAABAAAAAA==", "AAAAAAAAAdlSZXR1cm5zIHRoZSB0b3RhbCBzdXBwbHkgb2Ygdm90aW5nIHVuaXRzIGF0IGEgc3BlY2lmaWMgcGFzdCBsZWRnZXIKc2VxdWVuY2UgbnVtYmVyLgoKVGhpcyB0cmFja3MgYWxsIHZvdGluZyB1bml0cyBpbiBjaXJjdWxhdGlvbiAocmVnYXJkbGVzcyBvZiBkZWxlZ2F0aW9uCnN0YXR1cyksIG5vdCBqdXN0IGRlbGVnYXRlZCB2b3Rlcy4KClJldHVybnMgYDBgIGlmIHRoZXJlIHdlcmUgbm8gdm90aW5nIHVuaXRzIGF0IHRoZSBnaXZlbiBsZWRnZXIuCgojIEFyZ3VtZW50cwoKKiBgZWAgLSBBY2Nlc3MgdG8gdGhlIFNvcm9iYW4gZW52aXJvbm1lbnQuCiogYGxlZGdlcmAgLSBUaGUgbGVkZ2VyIHNlcXVlbmNlIG51bWJlciB0byBxdWVyeSAobXVzdCBiZSBpbiB0aGUgcGFzdCkuCgojIEVycm9ycwoKKiBbYFZvdGVzRXJyb3I6OkZ1dHVyZUxvb2t1cGBdIC0gSWYgYGxlZGdlcmAgPj0gY3VycmVudCBsZWRnZXIgc2VxdWVuY2UKbnVtYmVyLgAAAAAAAB5nZXRfdG90YWxfc3VwcGx5X2F0X2NoZWNrcG9pbnQAAAAAAAEAAAAAAAAABmxlZGdlcgAAAAAABAAAAAEAAAAK", "AAAAAAAAAZBUaGUgdm90aW5nIHN1cHBseSBhdCB0aGUgcHJldmlvdXMgbGVkZ2VyOiB0aGUgbGVkZ2VyIGEgcHJvcG9zYWwncwp2b3RlcyBhcmUgc25hcHNob3R0ZWQgYXQsIHNvIHRoZSBHb3Zlcm5vcidzIHF1b3J1bSBhbmQgdGhlIHZvdGVycycKd2VpZ2h0cyBkZXNjcmliZSB0aGUgc2FtZSBzdXBwbHkgKGNvbnRyYWN0IHJldmlldyBIMSkuIFJlYWRzIG9ubHkgdGhlCmxhdGVzdCBjaGVja3BvaW50LCBvciB0aGUgb25lIGJlZm9yZSBpdCB3aGVuIHRoZSBsYXRlc3Qgd2FzIHdyaXR0ZW4gaW4KdGhpcyBsZWRnZXIgKHRoYXQgb25lIHdhcyByZWFkLCBhbmQgc28gcmVuZXdlZCwgYnkgdGhlIHdyaXRlKS4gTmV2ZXIgYQpiaW5hcnkgc2VhcmNoIG92ZXIgaGlzdG9yeSB0aGF0IHRoZSBzd2VlcCBsZXRzIGFyY2hpdmUuAAAAIHZvdGluZ19zdXBwbHlfYXRfcHJldmlvdXNfbGVkZ2VyAAAAAAAAAAEAAAAK", "AAAABQAAAKtFbWl0dGVkIGJ5IFtgaGFuZG9mZmBdLiBUaGUgZW1pdHRpbmcgY29udHJhY3QgYWRkcmVzcyBpcyB0aGUgZXZlbnQncyBjb250cmFjdCBpZC4KClNhbWUgc2hhcGUgYXMgdGhlIE1hbmFnZXIncyBvd24gYEFkbWluQ2hhbmdlZGAsIHNvIGluZGV4ZXJzIGRlY29kZSBib3RoCndpdGggb25lIHNjaGVtYS4AAAAAAAAAAAxBZG1pbkNoYW5nZWQAAAABAAAADWFkbWluX2NoYW5nZWQAAAAAAAACAAAAAAAAAAlvbGRfYWRtaW4AAAAAAAATAAAAAQAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAEAAAAC", "AAAABAAAAD5FcnJvcnMgc2hhcmVkIGJ5IGFsbCBtb2R1bGUgY29udHJhY3RzIChibG9jayBgY29kZXM6OkNPTU1PTmApLgAAAAAAAAAAAAtDb21tb25FcnJvcgAAAAANAAAANE9wZXJhdGlvbiByZXF1aXJlcyB0aGUgbW9kdWxlIHRvIGJlIGxpdmUgKGxhdW5jaGVkKS4AAAAHTm90TGl2ZQAAABtZAAAAQU9wZXJhdGlvbiBpcyBvbmx5IHZhbGlkIGR1cmluZyBzZXR1cDsgdGhlIG1vZHVsZSBpcyBhbHJlYWR5IGxpdmUuAAAAAAAAC0FscmVhZHlMaXZlAAAAG1oAAAAlTWFuYWdlciBhZGRyZXNzIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAAAAA1NYW5hZ2VyTm90U2V0AAAAAAAbWwAAACNgQ3VycmVudEhhc2hgIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAARQ3VycmVudEhhc2hOb3RTZXQAAAAAABtcAAAANGBmcm9tX2hhc2hgIGRvZXMgbm90IGVxdWFsIHRoZSBzdG9yZWQgYEN1cnJlbnRIYXNoYC4AAAAMSGFzaE1pc21hdGNoAAAbXQAAACpNYW5hZ2VyIGRpZCBub3QgYXBwcm92ZSB0aGlzIHVwZ3JhZGUgcGF0aC4AAAAAABJVcGdyYWRlTm90QXBwcm92ZWQAAAAAG14AAAA1TWFuYWdlciBoYXMgbm8gcmVnaXN0cnkgZW50cnkgZm9yIHRoZSByZXF1ZXN0ZWQgaGFzaC4AAAAAAAAWSW1wbGVtZW50YXRpb25Ob3RGb3VuZAAAAAAbXwAAACJNb2R1bGUgYWRtaW4gbWlzc2luZyBmcm9tIHN0b3JhZ2UuAAAAAAALQWRtaW5Ob3RTZXQAAAAbYAAAAD9UaGUgTWFuYWdlcidzIG93biBgQ3VycmVudE1hbmFnZXJWZXJzaW9uYCBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAADVZlcnNpb25Ob3RTZXQAAAAAABthAAAAJlRyZWFzdXJ5IGFkZHJlc3MgbWlzc2luZyBmcm9tIHN0b3JhZ2UuAAAAAAAOVHJlYXN1cnlOb3RTZXQAAAAAG2IAAAAmR292ZXJub3IgYWRkcmVzcyBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAAAA5Hb3Zlcm5vck5vdFNldAAAAAAbYwAAADxgbWlncmF0ZWAgY2FsbGVkIHdoaWxlIHRoZSBzdG9yZWQgbGF5b3V0IGlzIGFscmVhZHkgY3VycmVudC4AAAAQTm90aGluZ1RvTWlncmF0ZQAAG2QAAAAmYFN0b3JhZ2VWZXJzaW9uYCBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAAABRTdG9yYWdlVmVyc2lvbk5vdFNldAAAG2U=", "AAAAAQAAADpBbiBpbml0aWFsIG1pbnQgYWxsb3dhbmNlIHdyaXR0ZW4gYnkgdGhlIFRva2VuJ3MgYGxhdW5jaGAuAAAAAAAAAAAACU1pbnRHcmFudAAAAAAAAAIAAAAAAAAACWFsbG93YW5jZQAAAAAAAAQAAAAAAAAABm1vZHVsZQAAAAAAEw==", "AAAAAQAAABNPbmUgcmVnaXN0cnkgZW50cnkuAAAAAAAAAAALTW9kdWxlRW50cnkAAAAAAwAAAAAAAAAHYWRkcmVzcwAAAAATAAAAAAAAAARraW5kAAAAEQAAAEhUb2tlbnMgdGhpcyBtb2R1bGUgaG9sZHMgY2Fycnkgbm8gdm90ZXMgKGN1c3RvZHk6IEF1Y3Rpb24sIE1hcmtldHBsYWNlKS4AAAAKbm9uX3ZvdGluZwAAAAAAAQ==", "AAAAAQAAAN1BIERBTydzIG1lbWJlcnNoaXAgdG9rZW4gc3dpdGNoZXMgKGRvY3MvZGVzaWducy9sb2NrZWQtdG9rZW5zLm1kKSwgY2hvc2VuCmF0IGBjcmVhdGVfZGFvYCBhbmQgY2hhbmdlYWJsZSBieSB0aGUgVG9rZW4ncyBhZG1pbjogdGhlIGxhdW5jaCBhZG1pbiBpbgpTZXR1cCwgdGhlIFRyZWFzdXJ5IGJ5IHByb3Bvc2FsIG9uY2UgTGl2ZS4gQWxsIG9mZiByZXByb2R1Y2VzIGFuIG9wZW4gREFPLgAAAAAAAAAAAAANVG9rZW5TZXR0aW5ncwAAAAAAAAMAAABGVGhlIFRyZWFzdXJ5IG1heSBtb3ZlIGFueSBtZW1iZXIncyB0b2tlbiBieSBwcm9wb3NhbCAoYGRhb190cmFuc2ZlcmApLgAAAAAADGRhb19yZWNvdmVyeQAAAAEAAABASG9sZGVycyBkZWxlZ2F0ZSBvbmx5IHRvIHRoZW1zZWx2ZXMgb3IgdG8gYW5vdGhlciB2b3RpbmcgbWVtYmVyLgAAABdtZW1iZXJzX29ubHlfZGVsZWdhdGlvbgAAAAABAAAAQFRva2VucyBtb3ZlIG9ubHkgYWxvbmcgREFPLWNvbnRyb2xsZWQgcGF0aHMgKGBUcmFuc2ZlcnNMb2NrZWRgKS4AAAAQdHJhbnNmZXJzX2xvY2tlZAAAAAE=", "AAAABQAAABVFbWl0dGVkIGJ5IGBtaWdyYXRlYC4AAAAAAAAAAAAACE1pZ3JhdGVkAAAAAQAAAAhtaWdyYXRlZAAAAAIAAAAAAAAAFGZyb21fc3RvcmFnZV92ZXJzaW9uAAAABAAAAAAAAAAAAAAAEnRvX3N0b3JhZ2VfdmVyc2lvbgAAAAAABAAAAAAAAAAC", "AAAABQAAAE1FbWl0dGVkIGJ5IGBhcHBseWAuIFRoZSBlbWl0dGluZyBjb250cmFjdCBhZGRyZXNzIGlzIHRoZSBldmVudCdzIGNvbnRyYWN0IGlkLgAAAAAAAAAAAAAIVXBncmFkZWQAAAABAAAACHVwZ3JhZGVkAAAAAwAAAAAAAAAJZnJvbV9oYXNoAAAAAAAD7gAAACAAAAABAAAAAAAAAAd0b19oYXNoAAAAA+4AAAAgAAAAAQAAAAAAAAAHdmVyc2lvbgAAAAAQAAAAAAAAAAI=", "AAAABAAAACpFcnJvcnMgdGhhdCBjYW4gb2NjdXIgaW4gdm90ZXMgb3BlcmF0aW9ucy4AAAAAAAAAAAAKVm90ZXNFcnJvcgAAAAAABQAAABtUaGUgbGVkZ2VyIGlzIGluIHRoZSBmdXR1cmUAAAAADEZ1dHVyZUxvb2t1cAAAEAQAAAAcQXJpdGhtZXRpYyBvdmVyZmxvdyBvY2N1cnJlZAAAAAxNYXRoT3ZlcmZsb3cAABAFAAAAN0F0dGVtcHRpbmcgdG8gdHJhbnNmZXIgbW9yZSB2b3RpbmcgdW5pdHMgdGhhbiBhdmFpbGFibGUAAAAAF0luc3VmZmljaWVudFZvdGluZ1VuaXRzAAAAEAYAAAA/QXR0ZW1wdGluZyB0byBkZWxlZ2F0ZSB0byB0aGUgc2FtZSBkZWxlZ2F0ZSB0aGF0IGlzIGFscmVhZHkgc2V0AAAAAAxTYW1lRGVsZWdhdGUAABAHAAAAQEEgY2hlY2twb2ludCB0aGF0IHdhcyBleHBlY3RlZCB0byBleGlzdCB3YXMgbm90IGZvdW5kIGluIHN0b3JhZ2UAAAASQ2hlY2twb2ludE5vdEZvdW5kAAAAABAI", "AAAABQAAADNFdmVudCBlbWl0dGVkIHdoZW4gYW4gYWNjb3VudCBjaGFuZ2VzIGl0cyBkZWxlZ2F0ZS4AAAAAAAAAAA9EZWxlZ2F0ZUNoYW5nZWQAAAAAAQAAABBkZWxlZ2F0ZV9jaGFuZ2VkAAAAAwAAACVUaGUgYWNjb3VudCB0aGF0IGNoYW5nZWQgaXRzIGRlbGVnYXRlAAAAAAAACWRlbGVnYXRvcgAAAAAAABMAAAABAAAAHlRoZSBwcmV2aW91cyBkZWxlZ2F0ZSAoaWYgYW55KQAAAAAADWZyb21fZGVsZWdhdGUAAAAAAAPoAAAAEwAAAAAAAAAQVGhlIG5ldyBkZWxlZ2F0ZQAAAAt0b19kZWxlZ2F0ZQAAAAATAAAAAAAAAAI=", "AAAABQAAADVFdmVudCBlbWl0dGVkIHdoZW4gYSBkZWxlZ2F0ZSdzIHZvdGluZyBwb3dlciBjaGFuZ2VzLgAAAAAAAAAAAAAURGVsZWdhdGVWb3Rlc0NoYW5nZWQAAAABAAAAFmRlbGVnYXRlX3ZvdGVzX2NoYW5nZWQAAAAAAAMAAAAnVGhlIGRlbGVnYXRlIHdob3NlIHZvdGluZyBwb3dlciBjaGFuZ2VkAAAAAAhkZWxlZ2F0ZQAAABMAAAABAAAAGVRoZSBwcmV2aW91cyB2b3RpbmcgcG93ZXIAAAAAAAAOcHJldmlvdXNfdm90ZXMAAAAAAAoAAAAAAAAAFFRoZSBuZXcgdm90aW5nIHBvd2VyAAAACW5ld192b3RlcwAAAAAAAAoAAAAAAAAAAg==", "AAAABQAAACVFdmVudCBlbWl0dGVkIHdoZW4gYSB0b2tlbiBpcyBtaW50ZWQuAAAAAAAAAAAAAARNaW50AAAAAQAAAARtaW50AAAAAgAAAAAAAAACdG8AAAAAABMAAAABAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAAAAAAAAg==", "AAAABQAAACpFdmVudCBlbWl0dGVkIHdoZW4gYW4gYXBwcm92YWwgaXMgZ3JhbnRlZC4AAAAAAAAAAAAHQXBwcm92ZQAAAAABAAAAB2FwcHJvdmUAAAAABAAAAAAAAAAIYXBwcm92ZXIAAAATAAAAAQAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAQAAAAAAAAAIYXBwcm92ZWQAAAATAAAAAAAAAAAAAAARbGl2ZV91bnRpbF9sZWRnZXIAAAAAAAAEAAAAAAAAAAI=", "AAAABQAAACpFdmVudCBlbWl0dGVkIHdoZW4gYSB0b2tlbiBpcyB0cmFuc2ZlcnJlZC4AAAAAAAAAAAAIVHJhbnNmZXIAAAABAAAACHRyYW5zZmVyAAAAAwAAAAAAAAAEZnJvbQAAABMAAAABAAAAAAAAAAJ0bwAAAAAAEwAAAAEAAAAAAAAACHRva2VuX2lkAAAABAAAAAAAAAAC", "AAAABQAAADZFdmVudCBlbWl0dGVkIHdoZW4gYXBwcm92YWwgZm9yIGFsbCB0b2tlbnMgaXMgZ3JhbnRlZC4AAAAAAAAAAAANQXBwcm92ZUZvckFsbAAAAAAAAAEAAAAPYXBwcm92ZV9mb3JfYWxsAAAAAAMAAAAAAAAABW93bmVyAAAAAAAAEwAAAAEAAAAAAAAACG9wZXJhdG9yAAAAEwAAAAAAAAAAAAAAEWxpdmVfdW50aWxfbGVkZ2VyAAAAAAAABAAAAAAAAAAC", "AAAABAAAAAAAAAAAAAAAFU5vbkZ1bmdpYmxlVG9rZW5FcnJvcgAAAAAAAA8AAAAkSW5kaWNhdGVzIGEgbm9uLWV4aXN0ZW50IGB0b2tlbl9pZGAuAAAAEE5vbkV4aXN0ZW50VG9rZW4AAADIAAAAV0luZGljYXRlcyBhbiBlcnJvciByZWxhdGVkIHRvIHRoZSBvd25lcnNoaXAgb3ZlciBhIHBhcnRpY3VsYXIgdG9rZW4uClVzZWQgaW4gdHJhbnNmZXJzLgAAAAAOSW5jb3JyZWN0T3duZXIAAAAAAMkAAABFSW5kaWNhdGVzIGEgZmFpbHVyZSB3aXRoIHRoZSBgb3BlcmF0b3JgcyBhcHByb3ZhbC4gVXNlZCBpbiB0cmFuc2ZlcnMuAAAAAAAAFEluc3VmZmljaWVudEFwcHJvdmFsAAAAygAAAFVJbmRpY2F0ZXMgYSBmYWlsdXJlIHdpdGggdGhlIGBhcHByb3ZlcmAgb2YgYSB0b2tlbiB0byBiZSBhcHByb3ZlZC4gVXNlZAppbiBhcHByb3ZhbHMuAAAAAAAAD0ludmFsaWRBcHByb3ZlcgAAAADLAAAASkluZGljYXRlcyBhbiBpbnZhbGlkIHZhbHVlIGZvciBgbGl2ZV91bnRpbF9sZWRnZXJgIHdoZW4gc2V0dGluZwphcHByb3ZhbHMuAAAAAAAWSW52YWxpZExpdmVVbnRpbExlZGdlcgAAAAAAzAAAAClJbmRpY2F0ZXMgb3ZlcmZsb3cgd2hlbiBhZGRpbmcgdHdvIHZhbHVlcwAAAAAAAAxNYXRoT3ZlcmZsb3cAAADNAAAANkluZGljYXRlcyBhbGwgcG9zc2libGUgYHRva2VuX2lkYHMgYXJlIGFscmVhZHkgaW4gdXNlLgAAAAAAE1Rva2VuSURzQXJlRGVwbGV0ZWQAAAAAzgAAAEVJbmRpY2F0ZXMgYW4gaW52YWxpZCBhbW91bnQgdG8gYmF0Y2ggbWludCBpbiBgY29uc2VjdXRpdmVgIGV4dGVuc2lvbi4AAAAAAAANSW52YWxpZEFtb3VudAAAAAAAAM8AAAAzSW5kaWNhdGVzIHRoZSB0b2tlbiBkb2VzIG5vdCBleGlzdCBpbiBvd25lcidzIGxpc3QuAAAAABhUb2tlbk5vdEZvdW5kSW5Pd25lckxpc3QAAADQAAAAMkluZGljYXRlcyB0aGUgdG9rZW4gZG9lcyBub3QgZXhpc3QgaW4gZ2xvYmFsIGxpc3QuAAAAAAAZVG9rZW5Ob3RGb3VuZEluR2xvYmFsTGlzdAAAAAAAANEAAAAjSW5kaWNhdGVzIGFjY2VzcyB0byB1bnNldCBtZXRhZGF0YS4AAAAADVVuc2V0TWV0YWRhdGEAAAAAAADSAAAAQUluZGljYXRlcyB0aGUgbGVuZ3RoIG9mIHRoZSBiYXNlIFVSSSBleGNlZWRzIHRoZSBtYXhpbXVtIGFsbG93ZWQuAAAAAAAAFUJhc2VVcmlNYXhMZW5FeGNlZWRlZAAAAAAAANMAAABHSW5kaWNhdGVzIHRoZSByb3lhbHR5IGFtb3VudCBpcyBoaWdoZXIgdGhhbiAxMF8wMDAgKDEwMCUpIGJhc2lzIHBvaW50cy4AAAAAFEludmFsaWRSb3lhbHR5QW1vdW50AAAA1AAAAD1JbmRpY2F0ZXMgdGhlIGxlbmd0aCBvZiB0aGUgbmFtZSBleGNlZWRzIHRoZSBtYXhpbXVtIGFsbG93ZWQuAAAAAAAAEk5hbWVNYXhMZW5FeGNlZWRlZAAAAAAA1QAAAD9JbmRpY2F0ZXMgdGhlIGxlbmd0aCBvZiB0aGUgc3ltYm9sIGV4Y2VlZHMgdGhlIG1heGltdW0gYWxsb3dlZC4AAAAAFFN5bWJvbE1heExlbkV4Y2VlZGVkAAAA1g=="]),
      options
    );
  }

   static deploy<T = Client>({ admin, treasury, name, symbol, metadata, manager, current_hash, settings }: { admin: string | Address; treasury: string | Address; name: string; symbol: string; metadata: string | Address; manager: string | Address; current_hash: Uint8Array; settings: TokenSettings }, options: MethodOptions & Omit<ContractClientOptions, 'contractId'> & { salt?: Uint8Array; address?: string; } & ({ wasmHash: Uint8Array | string; format?: "hex" | "base64"; externalRef?: never; } | { externalRef: ExternalExecutableRef; wasmHash?: never; format?: never; })): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({ admin, treasury, name, symbol, metadata, manager, current_hash, settings }, options);
  }
  public readonly fromJson = {
    mint : this.txFromJson<number>,  name : this.txFromJson<string>,  admin : this.txFromJson<string>,  launch : this.txFromJson<void>,  minted : this.txFromJson<number>,  module : this.txFromJson<string | null>,  symbol : this.txFromJson<string>,  approve : this.txFromJson<void>,  auction : this.txFromJson<string | null>,  balance : this.txFromJson<number>,  handoff : this.txFromJson<void>,  is_live : this.txFromJson<boolean>,  manager : this.txFromJson<string>,  migrate : this.txFromJson<void>,  modules : this.txFromJson<Array<ModuleEntry>>,  upgrade : this.txFromJson<void>,  version : this.txFromJson<string>,  delegate : this.txFromJson<void>,  metadata : this.txFromJson<string | null>,  owner_of : this.txFromJson<string>,  settings : this.txFromJson<TokenSettings>,  transfer : this.txFromJson<void>,  treasury : this.txFromJson<string>,  get_votes : this.txFromJson<bigint>,  token_uri : this.txFromJson<string>,  wasm_hash : this.txFromJson<Uint8Array>,  batch_mint : this.txFromJson<Array<number>>,  marketplace : this.txFromJson<string | null>,  dao_recovery : this.txFromJson<boolean>,  dao_transfer : this.txFromJson<void>,  get_approved : this.txFromJson<string | null>,  get_delegate : this.txFromJson<string | null>,  set_metadata : this.txFromJson<void>,  total_supply : this.txFromJson<bigint>,  transfer_from : this.txFromJson<void>,  agent_transfer : this.txFromJson<void>,  mint_allowance : this.txFromJson<number>,  approve_for_all : this.txFromJson<void>,  num_checkpoints : this.txFromJson<number>,  register_module : this.txFromJson<void>,  storage_version : this.txFromJson<number>,  transfer_agents : this.txFromJson<Array<string>>,  get_total_supply : this.txFromJson<bigint>,  set_dao_recovery : this.txFromJson<void>,  transfers_locked : this.txFromJson<boolean>,  unregister_module : this.txFromJson<void>,  set_transfer_agent : this.txFromJson<void>,  is_approved_for_all : this.txFromJson<boolean>,  set_transfers_locked : this.txFromJson<void>,  release_mint_allowance : this.txFromJson<void>,  decrease_mint_allowance : this.txFromJson<void>,  get_votes_at_checkpoint : this.txFromJson<bigint>,  increase_mint_allowance : this.txFromJson<void>,  members_only_delegation : this.txFromJson<boolean>,  set_members_only_delegation : this.txFromJson<void>,  get_total_supply_at_checkpoint : this.txFromJson<bigint>,  voting_supply_at_previous_ledger : this.txFromJson<bigint>
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
   * Build a topics filter row for the "DaoTransfer" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  daoTransferEventFilter(topicValues?: { from?: string | Address; to?: string | Address }): string[] {
    return this.spec.eventTopicFilter("DaoTransfer", topicValues);
  }
  /**
   * Build a topics filter row for the "AgentTransfer" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  agentTransferEventFilter(topicValues?: { agent?: string | Address }): string[] {
    return this.spec.eventTopicFilter("AgentTransfer", topicValues);
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
   * Build a topics filter row for the "ModuleRegistered" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  moduleRegisteredEventFilter(topicValues?: { kind?: string }): string[] {
    return this.spec.eventTopicFilter("ModuleRegistered", topicValues);
  }
  /**
   * Build a topics filter row for the "TokenInitialized" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  tokenInitializedEventFilter(topicValues?: { admin?: string | Address }): string[] {
    return this.spec.eventTopicFilter("TokenInitialized", topicValues);
  }
  /**
   * Build a topics filter row for the "DaoRecoveryChanged" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  daoRecoveryChangedEventFilter(): string[] {
    return this.spec.eventTopicFilter("DaoRecoveryChanged");
  }
  /**
   * Build a topics filter row for the "ModuleUnregistered" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  moduleUnregisteredEventFilter(topicValues?: { kind?: string }): string[] {
    return this.spec.eventTopicFilter("ModuleUnregistered", topicValues);
  }
  /**
   * Build a topics filter row for the "MintBatchWithMinter" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  mintBatchWithMinterEventFilter(topicValues?: { minter?: string | Address }): string[] {
    return this.spec.eventTopicFilter("MintBatchWithMinter", topicValues);
  }
  /**
   * Build a topics filter row for the "MintAllowanceChanged" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  mintAllowanceChangedEventFilter(topicValues?: { module?: string | Address }): string[] {
    return this.spec.eventTopicFilter("MintAllowanceChanged", topicValues);
  }
  /**
   * Build a topics filter row for the "TransferAgentChanged" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  transferAgentChangedEventFilter(topicValues?: { module?: string | Address }): string[] {
    return this.spec.eventTopicFilter("TransferAgentChanged", topicValues);
  }
  /**
   * Build a topics filter row for the "TransfersLockChanged" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  transfersLockChangedEventFilter(): string[] {
    return this.spec.eventTopicFilter("TransfersLockChanged");
  }
  /**
   * Build a topics filter row for the "MembersOnlyDelegationChanged" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  membersOnlyDelegationChangedEventFilter(): string[] {
    return this.spec.eventTopicFilter("MembersOnlyDelegationChanged");
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
  /**
   * Build a topics filter row for the "ApproveForAll" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  approveForAllEventFilter(topicValues?: { owner?: string | Address }): string[] {
    return this.spec.eventTopicFilter("ApproveForAll", topicValues);
  }
}