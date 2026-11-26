import {ClaimList, ClaimRecord, AssuranceTerms, ClaimsConfig, RenewalPage, AssuranceState, ContractEvent} from './types.js';
import {Result, Spec, AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, ExternalExecutableRef} from '@stellar/stellar-sdk/contract';
import {Address, xdr} from '@stellar/stellar-sdk';

export interface Client {
  /**
   * Module admin: the launch admin in Setup, the Treasury once handed over.
   * Anyone may read it.
   */
  admin(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * Claim `mint_now` tokens of the leaf `(claimer, leaf_amount)`. Returns
   * the minted token ids.
   *
   * Only `claimer` may call it: they authorize, pay, and receive. The proof
   * covers the full leaf; a claimer may claim it in parts, at most
   * `common::MAX_BATCH_MINT` tokens per call, and never more than the leaf
   * or the list's `total` in all. Each claim pays `price × mint_now` in the
   * list's asset: into escrow on the assurance list before launch,
   * otherwise to the Treasury. `max_price` bounds the unit price the
   * claimer accepts. Claims stop at `expires_at` and when a drive fails.
   *
   * The leaf is `sha256(claimer_xdr || leaf_amount_be_u128)`; internal
   * nodes are `sha256(min(a, b) || max(a, b))`, so proofs carry no
   * direction bits (see the module docs on hashing).
   */
  claim({ list_id, claimer, leaf_amount, mint_now, proof, max_price }: { list_id: number; claimer: string | Address; leaf_amount: bigint; mint_now: number; proof: Array<Uint8Array>; max_price: bigint }, options?: MethodOptions): Promise<AssembledTransaction<Result<Array<number>, Error>>>;
  /**
   * Setup -> Live, in the launch transaction, after the Token is Live.
   *
   * Only the Manager may call it, and `treasury` must be the Treasury
   * wired at construction (`TreasuryMismatch`). It hands the admin to the
   * Treasury unless `handoff` already did, and releases the assurance
   * escrow to the Treasury, so the fees arrive with the launch (eng review
   * R4). `open` is ignored: lists have no pause. Fails if already Live.
   */
  launch({ treasury, open }: { treasury: string | Address; open: boolean }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * Return a claimer's escrow from a `Failed` list. Returns the amount.
   *
   * Anyone may call it; this code sends the funds only to `claimer`, the
   * address that paid, and to nowhere else. If that address
   * can't receive the asset (for example, its issuer deauthorized it, or an
   * account removed its trustline), the call fails and the escrow stays
   * here until a later call succeeds. The claimer keeps the tokens, which
   * carry no power because the DAO never goes Live.
   */
  refund({ list_id, claimer }: { list_id: number; claimer: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<Result<bigint, Error>>>;
  /**
   * Early handoff, in Setup: the admin moves to the Treasury and the
   * module stays in Setup.
   *
   * Only the Manager may call it (`open_assurance` freezes the DAO this
   * way), and `treasury` must be the wired Treasury. Afterwards no list can
   * be opened or closed and no upgrade applied until launch, because the
   * Treasury can't act before the DAO is Live.
   */
  handoff({ treasury }: { treasury: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * Advance the storage layout after an upgrade; it fails with
   * `NothingToMigrate` when the layout is current. Until it runs, every
   * entry point that changes state fails `StorageVersionMismatch`.
   *
   * Anyone may call it. It runs only the migration that the installed
   * code defines, which the Manager approved and the admin (or, after a
   * failed drive, the Manager's `recover_claims`) installed, and only once
   * per layout. It stays open because during a drive the admin is the
   * Treasury, which cannot act before launch: after a recovery upgrade,
   * refunds must not wait for a proposal that can never pass.
   */
  migrate(options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Move a list's escrow to the Treasury wired at construction. Returns
   * the amount moved (0 when nothing is held).
   *
   * Anyone may call it once the DAO is Live; `launch` calls it for the
   * assurance list. The destination is fixed, so a caller chooses only
   * when it runs. It moves only what `claim` recorded as escrow, never
   * other balances this contract holds.
   */
  release({ list_id }: { list_id: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<bigint, Error>>>;
  /**
   * Upgrade to a Manager-approved WASM.
   *
   * Only the admin may call it: the launch admin in Setup, the Treasury by
   * proposal once handed over. The Manager's registry must approve the
   * pair `from_hash -> to_hash`, and `from_hash` must be the running code.
   * Lists, records, and escrow are kept.
   */
  upgrade({ from_hash, to_hash }: { from_hash: Uint8Array; to_hash: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * The registry version of the running code. Anyone may read it.
   */
  version(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * A list's record, or `None` for an unknown id. Anyone may read it.
   */
  get_list({ list_id }: { list_id: number }, options?: MethodOptions): Promise<AssembledTransaction<ClaimList | null>>;
  /**
   * A claimer's progress on a list (zero before their first claim).
   * Anyone may read it.
   */
  get_claim({ list_id, claimer }: { list_id: number; claimer: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<ClaimRecord>>;
  /**
   * Open a list and return its id. Only the admin may call it.
   *
   * - **Setup:** the list uses the configured payment asset and needs
   * artwork. A list with a price or assurance terms also needs the
   * Manager's authorization, so only `manager.open_assurance` opens one
   * and the Manager always records it; the launch admin alone opens only
   * free lists. At most one assurance list.
   * - **Live:** the Treasury, by proposal, with any asset and price, and no
   * assurance terms.
   *
   * Assurance terms need a threshold from 1 to `total` and a deadline after
   * now and no later than `expires_at` (`InvalidAssurance`).
   *
   * `tree_uri` is the `ipfs://<cid>` of the full tree in the
   * `builder-stellar-merkle-v1` format. The chain cannot check it against
   * the root; consumers recompute the root from the file before claiming.
   * The list's terms never change after opening; only `close_list` moves
   * its `expires_at` earlier.
   */
  open_list({ root, tree_uri, asset, price, expires_at, total, assurance }: { root: Uint8Array; tree_uri: string; asset: string | Address; price: bigint; expires_at: bigint; total: number; assurance: AssuranceTerms | null }, options?: MethodOptions): Promise<AssembledTransaction<Result<number, Error>>>;
  /**
   * The WASM hash this contract records for its code: set at construction
   * and by each upgrade. It is self-reported; the contract's executable is
   * the authority. Anyone may read it.
   */
  wasm_hash(options?: MethodOptions): Promise<AssembledTransaction<Uint8Array>>;
  /**
   * Close a list early (the admin): claims stop at once.
   *
   * A list stays claimable until its `expires_at`, including after launch,
   * so a free list the launch admin opened in Setup can still mint once
   * the DAO is Live (up to this module's allowance). This is how the DAO,
   * by proposal, ends such a list. The assurance list can't be closed
   * before launch, since its refunds and release depend on it
   * (`AssuranceNotAllowed`); a list already past its expiry fails with
   * `ListExpired`. The list keeps its record; only `expires_at` moves to
   * now.
   */
  close_list({ list_id }: { list_id: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * The wiring fixed at construction. Anyone may read it.
   */
  get_config(options?: MethodOptions): Promise<AssembledTransaction<ClaimsConfig>>;
  /**
   * The id the next list receives (the number of lists so far). Anyone
   * may read it. A list opened by a proposal gets the id current when the
   * proposal executes, which may differ from the one read when drafting.
   */
  next_list_id(options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * One page of the persistent keys the DAO's storage sweep renews.
   *
   * Lists `List(cursor..)` up to `limit` ids below `next_list_id`, and the
   * payment asset (whose balance entry holds the escrow). `Claim(list,
   * claimer)` records belong to their claimers and are left out (holder
   * class). Anyone may read it.
   */
  renewal_keys({ cursor, limit }: { cursor: number; limit: number }, options?: MethodOptions): Promise<AssembledTransaction<RenewalPage>>;
  /**
   * The asset Setup lists are priced in (`DaoModule::payment_asset`).
   * Anyone may read it; it never changes.
   */
  payment_asset(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * The assurance list, if one was opened. Anyone may read it.
   */
  assurance_list(options?: MethodOptions): Promise<AssembledTransaction<number | null>>;
  /**
   * The assurance list's state: `Failed` once its deadline has passed
   * while the DAO is not Live, otherwise `Met` once enough distinct
   * addresses have claimed, otherwise `Open`. `NotAssurance` for any other
   * list. Anyone may read it; it is computed, never stored.
   */
  assurance_state({ list_id }: { list_id: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<AssuranceState, Error>>>;
  /**
   * Storage-layout version of the data held by this contract. Anyone may
   * read it. While it differs from the code's `STORAGE_VERSION`, every
   * entry point that changes state fails `StorageVersionMismatch`.
   */
  storage_version(options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * Manager-only upgrade of a frozen ClaimMinter, for a failed drive whose
   * refunds are broken (`manager.recover_claims`, review B2). It checks only
   * the Manager's authorization and that the module is still in Setup, not
   * this contract's own state machine, which may be the broken code; the
   * Manager decides that the drive failed. The Manager has already checked
   * the registry approval for this hash and passes `version`, because asking
   * it back from here would be contract re-entry.
   */
  recovery_upgrade({ from_hash, to_hash, version }: { from_hash: Uint8Array; to_hash: Uint8Array; version: string }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
}

export class Client extends ContractClient {
  constructor(public readonly options: ContractClientOptions) {
    super(
      new Spec(["AAAABAAAAQhDbGFpbU1pbnRlciBlcnJvcnMgKGJsb2NrIGBjb21tb246OmVycm9yOjpjb2Rlczo6TUlOVEVSYCkuIEVycm9ycyByYWlzZWQgYnkKdGhlIHRva2VuIGR1cmluZyBhIG1pbnQgKGBBbGxvd2FuY2VFeGNlZWRlZGAsIHRoZSBiYXRjaCBidWRnZXQpIHByb3BhZ2F0ZQp1bmNoYW5nZWQgd2l0aCB0aGUgdG9rZW4ncyBjb2RlLiBDb2RlcyBvZiB0aGUgcmV0aXJlZCBzaGFyZWQgTWludGVyICg3ODAyLAo3ODA0LCA3ODExLCA3ODEzLCA3ODE0KSBhcmUgbm90IHJldXNlZC4AAAAAAAAAEENsYWltTWludGVyRXJyb3IAAAAYAAAAWWBvcGVuX2xpc3RgIHdpdGggYSBgdG90YWxgIG9mIHplcm8sIG9yIGBjbGFpbWAgd2l0aCBhIGBsZWFmX2Ftb3VudGAgb3IKYG1pbnRfbm93YCBvZiB6ZXJvAAAAAAAADUludmFsaWRBbW91bnQAAAAAAB55AAAAV2BjbGFpbWAgd2l0aCBgbWludF9ub3dgIGFib3ZlIGBjb21tb246Ok1BWF9CQVRDSF9NSU5UYCAoY2xhaW0gdGhlIHJlc3QKaW4gYW5vdGhlciBjYWxsKQAAAAANQmF0Y2hUb29MYXJnZQAAAAAAHnsAAABAYGNsYWltYCB3aXRoIGBtaW50X25vd2AgYWJvdmUgd2hhdCBpcyBsZWZ0IG9mIHRoZSBjbGFpbWVyJ3MgbGVhZgAAAA5BbHJlYWR5Q2xhaW1lZAAAAAAefwAAAGlgY2xhaW1gIHdob3NlIHByb29mIGRvZXNuJ3QgbGVhZCBmcm9tIHRoZSBjbGFpbWVyJ3MgbGVhZiB0byB0aGUgbGlzdCdzCnJvb3QsIG9yIGhhcyBtb3JlIHRoYW4gMzIgc2libGluZ3MAAAAAAAASTWVya2xlUHJvb2ZJbnZhbGlkAAAAAB6AAAAAMmBjbGFpbWAgd2hvc2UgY29zdCwgYHByaWNlIMOXIG1pbnRfbm93YCwgb3ZlcmZsb3dzAAAAAAAMSW52YWxpZElucHV0AAAegQAAACBgcmVsZWFzZWAgYmVmb3JlIHRoZSBEQU8gaXMgTGl2ZQAAAAxUb2tlbk5vdExpdmUAAB6CAAAAbWBvcGVuX2xpc3RgIHdpdGggYSBgdHJlZV91cmlgIHRoYXQgaXMgZW1wdHksIGxvbmdlciB0aGFuCmBjb21tb246Ok1BWF9TVFJJTkdfTEVOR1RIYCwgb3Igbm90IGFuIGBpcGZzOi8vYCBVUkkAAAAAAAAOSW52YWxpZFRyZWVVcmkAAAAAHoQAAAAUTm8gbGlzdCB3aXRoIHRoaXMgaWQAAAAMTGlzdE5vdEZvdW5kAAAehwAAADtgY2xhaW1gIG9yIGBjbG9zZV9saXN0YCBhdCBvciBhZnRlciB0aGUgbGlzdCdzIGBleHBpcmVzX2F0YAAAAAALTGlzdEV4cGlyZWQAAAAeiAAAAC9gY2xhaW1gIHRoYXQgd291bGQgbWludCBwYXN0IHRoZSBsaXN0J3MgYHRvdGFsYAAAAAALTGlzdFNvbGRPdXQAAAAeiQAAAEBgY2xhaW1gIG9uIGEgbGlzdCB3aG9zZSBwcmljZSBpcyBhYm92ZSB0aGUgY2xhaW1lcidzIGBtYXhfcHJpY2VgAAAADVByaWNlQWJvdmVNYXgAAAAAAB6KAAAANmBjbGFpbWAgb24gYW4gYXNzdXJhbmNlIGxpc3QgdGhhdCBmYWlsZWQ6IHJlZnVuZHMgb25seQAAAAAAD0Fzc3VyYW5jZUZhaWxlZAAAAB6LAAAAP2Bhc3N1cmFuY2Vfc3RhdGVgIG9yIGByZWZ1bmRgIG9uIGEgbGlzdCB3aXRoIG5vIGFzc3VyYW5jZSB0ZXJtcwAAAAAMTm90QXNzdXJhbmNlAAAejAAAAF9gb3Blbl9saXN0YCB3aXRoIGFzc3VyYW5jZSB0ZXJtcyBvbmNlIExpdmUsIG9yIGBjbG9zZV9saXN0YCBvbiB0aGUKYXNzdXJhbmNlIGxpc3QgYmVmb3JlIGxhdW5jaAAAAAATQXNzdXJhbmNlTm90QWxsb3dlZAAAAB6NAAAAVWBvcGVuX2xpc3RgIHdpdGggYXNzdXJhbmNlIHRlcm1zIHdoZW4gdGhpcyBDbGFpbU1pbnRlciBhbHJlYWR5IGhhcyBpdHMKYXNzdXJhbmNlIGxpc3QAAAAAAAAPQXNzdXJhbmNlRXhpc3RzAAAAHo4AAAAmYHJlZnVuZGAgb24gYSBsaXN0IHRoYXQgaGFzIG5vdCBmYWlsZWQAAAAAAAlOb3RGYWlsZWQAAAAAAB6PAAAALWByZWZ1bmRgIGZvciBhIGNsYWltZXIgd2l0aCBub3RoaW5nIGluIGVzY3JvdwAAAAAAAA9Ob3RoaW5nVG9SZWZ1bmQAAAAekAAAAIZgb3Blbl9saXN0YCB3aXRoIGFzc3VyYW5jZSB0ZXJtcyB3aG9zZSB0aHJlc2hvbGQgaXMgemVybyBvciBhYm92ZQpgdG90YWxgLCBvciB3aG9zZSBkZWFkbGluZSBpcyBub3QgYWZ0ZXIgbm93IG9yIGlzIGFmdGVyIGBleHBpcmVzX2F0YAAAAAAAEEludmFsaWRBc3N1cmFuY2UAAB6RAAAAPWBvcGVuX2xpc3RgIGJlZm9yZSBsYXVuY2ggd2hpbGUgdGhlIGFydHdvcmsgaGFzIG5vIHByb3BlcnRpZXMAAAAAAAAOQXJ0d29ya01pc3NpbmcAAAAAHpIAAABDYG9wZW5fbGlzdGAgYmVmb3JlIGxhdW5jaCBpbiBhbiBhc3NldCBvdGhlciB0aGFuIHRoZSBjb25maWd1cmVkIG9uZQAAAAAUUGF5bWVudEFzc2V0TWlzbWF0Y2gAAB6TAAAAIWBvcGVuX2xpc3RgIHdpdGggYSBuZWdhdGl2ZSBwcmljZQAAAAAAAAxJbnZhbGlkUHJpY2UAAB6UAAAAMmBvcGVuX2xpc3RgIHdpdGggYW4gYGV4cGlyZXNfYXRgIG5vdCBpbiB0aGUgZnV0dXJlAAAAAAANSW52YWxpZEV4cGlyeQAAAAAAHpUAAABIYGxhdW5jaGAgLyBgaGFuZG9mZmAgdHJlYXN1cnkgZGlmZmVycyBmcm9tIHRoZSBvbmUgd2lyZWQgYXQgY29uc3RydWN0aW9uAAAAEFRyZWFzdXJ5TWlzbWF0Y2gAAB6WAAABU1RoZSBzdG9yZWQgZGF0YSBsYXlvdXQgaXMgbm90IHRoZSBvbmUgdGhpcyBjb2RlIGV4cGVjdHM6IGFuIHVwZ3JhZGUKKG9yIGEgcmVjb3ZlcnkgdXBncmFkZSkgd2hvc2UgYG1pZ3JhdGVgIGhhcyBub3QgcnVuIHlldCwgb3IgYW4gdXBncmFkZQp0byBjb2RlIHdpdGggYW4gb2xkZXIgbGF5b3V0LiBFdmVyeSBlbnRyeSBwb2ludCB0aGF0IGNoYW5nZXMgc3RhdGUsCmByZWZ1bmRgIGluY2x1ZGVkLCByZWZ1c2VzIHVudGlsIGBtaWdyYXRlYCAoYW55b25lIG1heSBjYWxsIGl0KSBvciwKZm9yIGFuIG9sZGVyIGxheW91dCwgYW5vdGhlciB1cGdyYWRlIGJyaW5ncyB0aGUgdHdvIGJhY2sgaW4gc3RlcAAAAAAWU3RvcmFnZVZlcnNpb25NaXNtYXRjaAAAAAAelw==", "AAAABQAAAItBIGNsYWltIChgY2xhaW1gKTogYGFtb3VudGAgdG9rZW5zIG1pbnRlZCB0byBgY2xhaW1lcmAsIHdpdGggY29uc2VjdXRpdmUKaWRzIGZyb20gYGZpcnN0X3Rva2VuX2lkYCwgaW4gdGhlIHNhbWUgdHJhbnNhY3Rpb24gYXMgdGhlIHBheW1lbnQuAAAAAAAAAAAHQ2xhaW1lZAAAAAABAAAAB2NsYWltZWQAAAAABwAAAAAAAAAHbGlzdF9pZAAAAAAEAAAAAQAAAAAAAAAHY2xhaW1lcgAAAAATAAAAAQAAAAAAAAAGYW1vdW50AAAAAAAEAAAAAAAAAAAAAAAOZmlyc3RfdG9rZW5faWQAAAAAAAQAAAAAAAAAKVBhaWQgZm9yIHRoaXMgY2xhaW0sIGluIHRoZSBsaXN0J3MgYXNzZXQuAAAAAAAABHBhaWQAAAALAAAAAAAAAFtXaGV0aGVyIHRoZSBwYXltZW50IHdlbnQgdG8gZXNjcm93IChhc3N1cmFuY2UgbGlzdCBiZWZvcmUgbGF1bmNoKQpyYXRoZXIgdGhhbiB0aGUgVHJlYXN1cnkuAAAAAAhlc2Nyb3dlZAAAAAEAAAAAAAAAMlRoZSBjbGFpbWVyJ3MgdG90YWwgb24gdGhpcyBsaXN0IGFmdGVyIHRoaXMgY2xhaW0uAAAAAAAHY2xhaW1lZAAAAAAEAAAAAAAAAAI=", "AAAABQAAAHVBIGZhaWxlZCBsaXN0J3MgZXNjcm93IHJldHVybmVkIHRvIHRoZSBjbGFpbWVyIHdobyBwYWlkIGl0IChgcmVmdW5kYCkuClRoZSBjbGFpbWVyJ3MgZXNjcm93IG9uIHRoaXMgbGlzdCBpcyBub3cgemVyby4AAAAAAAAAAAAACFJlZnVuZGVkAAAAAQAAAAhyZWZ1bmRlZAAAAAMAAAAAAAAAB2xpc3RfaWQAAAAABAAAAAEAAAAAAAAAB2NsYWltZXIAAAAAEwAAAAEAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAC", "AAAABQAAAJJBIGxpc3QgY2xvc2VkIGVhcmx5IGJ5IHRoZSBhZG1pbiAoYGNsb3NlX2xpc3RgKTogbm8gY2xhaW1zIGFmdGVyIHRoaXMuCmBtaW50ZWRgIG9mIGB0b3RhbGAgd2VyZSBjbGFpbWVkOyB0aGUgcmVzdCBjYW4gbm8gbG9uZ2VyIGJlIG1pbnRlZCBmcm9tIGl0LgAAAAAAAAAAAApMaXN0Q2xvc2VkAAAAAAABAAAAC2xpc3RfY2xvc2VkAAAAAAMAAAAAAAAAB2xpc3RfaWQAAAAABAAAAAEAAAAAAAAABm1pbnRlZAAAAAAABAAAAAAAAAAAAAAABXRvdGFsAAAAAAAABAAAAAAAAAAC", "AAAABQAAAPBBIGxpc3Qgb3BlbmVkIChgb3Blbl9saXN0YCk6IGl0cyByb290LCB3aGVyZSB0aGUgZnVsbCB0cmVlIGlzIHB1Ymxpc2hlZCwKYW5kIGl0cyB0ZXJtcy4gVGhlIHRlcm1zIG5ldmVyIGNoYW5nZSBhZnRlcndhcmRzLCBleGNlcHQgdGhhdApgY2xvc2VfbGlzdGAgY2FuIG1vdmUgYGV4cGlyZXNfYXRgIGVhcmxpZXIgKGBMaXN0Q2xvc2VkYCkuIGBhc3N1cmFuY2VgIGlzCnNldCBvbmx5IG9uIHRoZSBhc3N1cmFuY2UgbGlzdC4AAAAAAAAACkxpc3RPcGVuZWQAAAAAAAEAAAALbGlzdF9vcGVuZWQAAAAACAAAAAAAAAAHbGlzdF9pZAAAAAAEAAAAAQAAAAAAAAAEcm9vdAAAA+4AAAAgAAAAAAAAAAAAAAAIdHJlZV91cmkAAAAQAAAAAAAAAAAAAAAFYXNzZXQAAAAAAAATAAAAAAAAAAAAAAAFcHJpY2UAAAAAAAALAAAAAAAAAAAAAAAKZXhwaXJlc19hdAAAAAAABgAAAAAAAAAAAAAABXRvdGFsAAAAAAAABAAAAAAAAAAAAAAACWFzc3VyYW5jZQAAAAAAA+gAAAfQAAAADkFzc3VyYW5jZVRlcm1zAAAAAAAAAAAAAg==", "AAAABQAAAI9BIGxpc3QncyBlc2Nyb3cgbW92ZWQgdG8gdGhlIFRyZWFzdXJ5IChgcmVsZWFzZWAsIGFsc28gZnJvbSBgbGF1bmNoYCkuCkVtaXR0ZWQgb25seSB3aGVuIGBhbW91bnRgIGlzIGFib3ZlIHplcm87IHRoZSBsaXN0J3MgZXNjcm93IGlzIG5vdyB6ZXJvLgAAAAAAAAAADkVzY3Jvd1JlbGVhc2VkAAAAAAABAAAAD2VzY3Jvd19yZWxlYXNlZAAAAAADAAAAAAAAAAdsaXN0X2lkAAAAAAQAAAABAAAAAAAAAAh0cmVhc3VyeQAAABMAAAAAAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAg==", "AAAABQAAAGVgPE1vZHVsZT5MYXVuY2hlZGA6IHRoZSBDbGFpbU1pbnRlciB3ZW50IExpdmUgd2l0aCB0aGUgREFPIChgbGF1bmNoYCkuClRoZSBUcmVhc3VyeSBpcyBub3cgaXRzIGFkbWluLgAAAAAAAAAAAAATQ2xhaW1NaW50ZXJMYXVuY2hlZAAAAAABAAAAFWNsYWltX21pbnRlcl9sYXVuY2hlZAAAAAAAAAEAAAAAAAAACHRyZWFzdXJ5AAAAEwAAAAEAAAAC", "AAAAAQAAALBPbmUgY2xhaW0gbGlzdDogYSBtZXJrbGUgcm9vdCBvZiBgKGNsYWltZXIsIGFtb3VudClgIGxlYXZlcywgaXRzIHRlcm1zIGFuZAppdHMgcnVubmluZyB0b3RhbHMuIFRoZSB0ZXJtcyBhcmUgZml4ZWQgYXQgYG9wZW5fbGlzdGA7IG9ubHkgYGNsb3NlX2xpc3RgCm1vdmVzIGBleHBpcmVzX2F0YCBlYXJsaWVyLgAAAAAAAAAJQ2xhaW1MaXN0AAAAAAAACwAAAEdUaGUgYXNzZXQgY2xhaW1zIHBheSBpbiAodGhlIGNvbmZpZ3VyZWQgcGF5bWVudCBhc3NldCBmb3IgU2V0dXAgbGlzdHMpLgAAAAAFYXNzZXQAAAAAAAATAAAALkRpc3RpbmN0IGFkZHJlc3NlcyB0aGF0IGNsYWltZWQgYXQgbGVhc3Qgb25jZS4AAAAAAAhjbGFpbWVycwAAAAQAAABBVGhlIGFzc3VyYW5jZSBkZWFkbGluZSAobGVkZ2VyIHRpbWVzdGFtcCksIG9yIDAgZm9yIG5vIGFzc3VyYW5jZS4AAAAAAAAIZGVhZGxpbmUAAAAGAAAA2lBheW1lbnRzIGhlbGQgdW50aWwgbGF1bmNoIChhc3N1cmFuY2UgbGlzdCBpbiBTZXR1cCBvbmx5KS4gQmVmb3JlCmByZWxlYXNlYCwgdGhlIHN1bSBvZiBpdHMgY2xhaW1lcnMnIGBDbGFpbVJlY29yZDo6ZXNjcm93ZWRgOwpgcmVsZWFzZWAgc2V0cyBpdCB0byB6ZXJvIGFuZCBsZWF2ZXMgdGhlIHJlY29yZHMuIE9ubHkgdGhpcyBhbW91bnQgaXMKcmVsZWFzZWQgb3IgcmVmdW5kZWQuAAAAAAAGZXNjcm93AAAAAAALAAAAJUNsYWltcyBzdG9wIGF0IHRoaXMgbGVkZ2VyIHRpbWVzdGFtcC4AAAAAAAAKZXhwaXJlc19hdAAAAAAABgAAADVUb2tlbnMgbWludGVkIGZyb20gdGhpcyBsaXN0IHNvIGZhciwgYXQgbW9zdCBgdG90YWxgLgAAAAAAAAZtaW50ZWQAAAAAAAQAAAAuUHJpY2UgcGVyIHRva2VuIGluIGBhc3NldGAsIDAgZm9yIGEgZnJlZSBsaXN0LgAAAAAABXByaWNlAAAAAAAACwAAAE5Sb290IG9mIHRoZSBgKGNsYWltZXIsIGFtb3VudClgIHRyZWUgKHNlZSB0aGUgaGFzaGluZyBub3RlcyBpbgpgY29udHJhY3QucnNgKS4AAAAAAARyb290AAAD7gAAACAAAABXQXNzdXJhbmNlIHRlcm1zLCBmbGF0dGVuZWQ6IGEgdGhyZXNob2xkIG9mIDAgbWVhbnMgbm9uZSAoc2VlCltgQ2xhaW1MaXN0Ojphc3N1cmFuY2VgXSkuAAAAABJ0aHJlc2hvbGRfY2xhaW1lcnMAAAAAAAQAAAAwTW9zdCB0b2tlbnMgdGhpcyBsaXN0IG1pbnRzIGFjcm9zcyBhbGwgY2xhaW1lcnMuAAAABXRvdGFsAAAAAAAABAAAAIRgaXBmczovLzxjaWQ+YCBvZiB0aGUgZnVsbCB0cmVlIChgYnVpbGRlci1zdGVsbGFyLW1lcmtsZS12MWApLiBBIGhpbnQ6CmNvbnN1bWVycyByZWNvbXB1dGUgdGhlIHJvb3QgZnJvbSBpdCBiZWZvcmUgb2ZmZXJpbmcgYSBjbGFpbS4AAAAIdHJlZV91cmkAAAAQ", "AAAAAQAAAEFBIGNsYWltZXIncyBwcm9ncmVzcyBvbiBvbmUgbGlzdCAoemVybyBiZWZvcmUgdGhlaXIgZmlyc3QgY2xhaW0pLgAAAAAAAAAAAAALQ2xhaW1SZWNvcmQAAAAAAgAAAC9Ub2tlbnMgY2xhaW1lZCBzbyBmYXIsIGF0IG1vc3QgdGhlIGxlYWYgYW1vdW50LgAAAAAHY2xhaW1lZAAAAAAEAAAAQFBheW1lbnRzIGluIGVzY3JvdyBmb3IgdGhpcyBjbGFpbWVyIChyZWZ1bmRhYmxlIHdoaWxlIGBGYWlsZWRgKS4AAAAIZXNjcm93ZWQAAAAL", "AAAAAQAAADVXaXJpbmcgZml4ZWQgYXQgY29uc3RydWN0aW9uOyBubyBmdW5jdGlvbiBjaGFuZ2VzIGl0LgAAAAAAAAAAAAAMQ2xhaW1zQ29uZmlnAAAABAAAAG5SZWdpc3RyeSBmb3IgYHZlcnNpb24oKWAgYW5kIHVwZ3JhZGUgYXBwcm92YWxzOyB0aGUgb25seSBjYWxsZXIgb2YKYGxhdW5jaGAsIGBoYW5kb2ZmYCBhbmQgYHJlY292ZXJ5X3VwZ3JhZGVgLgAAAAAAB21hbmFnZXIAAAAAEwAAAJJUaGUgYXNzZXQgZXZlcnkgbGlzdCBvcGVuZWQgaW4gU2V0dXAgaXMgcHJpY2VkIGluIChgQ2xhaW1zQ29uZmlnYCBhdApgY3JlYXRlX2Rhb2AgLyBgY3JlYXRlX21vZHVsZWApLiBMaXN0cyBvcGVuZWQgYWZ0ZXIgbGF1bmNoIG1heSB1c2UgYW55CmFzc2V0LgAAAAAADXBheW1lbnRfYXNzZXQAAAAAAAATAAAARFRoZSBEQU8ncyBUb2tlbjogbWludHMgZXZlcnkgY2xhaW0gYW5kIHNheXMgd2hldGhlciB0aGUgREFPIGlzIExpdmUuAAAABXRva2VuAAAAAAAAEwAAAH9SZWNlaXZlcyBldmVyeSBwYXltZW50IG9uY2UgdGhlIERBTyBpcyBMaXZlLCBhbmQgdGhlIGFzc3VyYW5jZSBlc2Nyb3cKYXQgbGF1bmNoLiBGaXhlZCBoZXJlLCBzbyBub2JvZHkgY2FuIHJlZGlyZWN0IHRoZSBlc2Nyb3cuAAAAAAh0cmVhc3VyeQAAABM=", "AAAAAAAAAFtNb2R1bGUgYWRtaW46IHRoZSBsYXVuY2ggYWRtaW4gaW4gU2V0dXAsIHRoZSBUcmVhc3VyeSBvbmNlIGhhbmRlZCBvdmVyLgpBbnlvbmUgbWF5IHJlYWQgaXQuAAAAAAVhZG1pbgAAAAAAAAAAAAABAAAAEw==", "AAAAAAAAAuxDbGFpbSBgbWludF9ub3dgIHRva2VucyBvZiB0aGUgbGVhZiBgKGNsYWltZXIsIGxlYWZfYW1vdW50KWAuIFJldHVybnMKdGhlIG1pbnRlZCB0b2tlbiBpZHMuCgpPbmx5IGBjbGFpbWVyYCBtYXkgY2FsbCBpdDogdGhleSBhdXRob3JpemUsIHBheSwgYW5kIHJlY2VpdmUuIFRoZSBwcm9vZgpjb3ZlcnMgdGhlIGZ1bGwgbGVhZjsgYSBjbGFpbWVyIG1heSBjbGFpbSBpdCBpbiBwYXJ0cywgYXQgbW9zdApgY29tbW9uOjpNQVhfQkFUQ0hfTUlOVGAgdG9rZW5zIHBlciBjYWxsLCBhbmQgbmV2ZXIgbW9yZSB0aGFuIHRoZSBsZWFmCm9yIHRoZSBsaXN0J3MgYHRvdGFsYCBpbiBhbGwuIEVhY2ggY2xhaW0gcGF5cyBgcHJpY2Ugw5cgbWludF9ub3dgIGluIHRoZQpsaXN0J3MgYXNzZXQ6IGludG8gZXNjcm93IG9uIHRoZSBhc3N1cmFuY2UgbGlzdCBiZWZvcmUgbGF1bmNoLApvdGhlcndpc2UgdG8gdGhlIFRyZWFzdXJ5LiBgbWF4X3ByaWNlYCBib3VuZHMgdGhlIHVuaXQgcHJpY2UgdGhlCmNsYWltZXIgYWNjZXB0cy4gQ2xhaW1zIHN0b3AgYXQgYGV4cGlyZXNfYXRgIGFuZCB3aGVuIGEgZHJpdmUgZmFpbHMuCgpUaGUgbGVhZiBpcyBgc2hhMjU2KGNsYWltZXJfeGRyIHx8IGxlYWZfYW1vdW50X2JlX3UxMjgpYDsgaW50ZXJuYWwKbm9kZXMgYXJlIGBzaGEyNTYobWluKGEsIGIpIHx8IG1heChhLCBiKSlgLCBzbyBwcm9vZnMgY2Fycnkgbm8KZGlyZWN0aW9uIGJpdHMgKHNlZSB0aGUgbW9kdWxlIGRvY3Mgb24gaGFzaGluZykuAAAABWNsYWltAAAAAAAABgAAAAAAAAAHbGlzdF9pZAAAAAAEAAAAAAAAAAdjbGFpbWVyAAAAABMAAAAAAAAAC2xlYWZfYW1vdW50AAAAAAoAAAAAAAAACG1pbnRfbm93AAAABAAAAAAAAAAFcHJvb2YAAAAAAAPqAAAD7gAAACAAAAAAAAAACW1heF9wcmljZQAAAAAAAAsAAAABAAAD6QAAA+oAAAAEAAAAAw==", "AAAAAAAAAZhTZXR1cCAtPiBMaXZlLCBpbiB0aGUgbGF1bmNoIHRyYW5zYWN0aW9uLCBhZnRlciB0aGUgVG9rZW4gaXMgTGl2ZS4KCk9ubHkgdGhlIE1hbmFnZXIgbWF5IGNhbGwgaXQsIGFuZCBgdHJlYXN1cnlgIG11c3QgYmUgdGhlIFRyZWFzdXJ5CndpcmVkIGF0IGNvbnN0cnVjdGlvbiAoYFRyZWFzdXJ5TWlzbWF0Y2hgKS4gSXQgaGFuZHMgdGhlIGFkbWluIHRvIHRoZQpUcmVhc3VyeSB1bmxlc3MgYGhhbmRvZmZgIGFscmVhZHkgZGlkLCBhbmQgcmVsZWFzZXMgdGhlIGFzc3VyYW5jZQplc2Nyb3cgdG8gdGhlIFRyZWFzdXJ5LCBzbyB0aGUgZmVlcyBhcnJpdmUgd2l0aCB0aGUgbGF1bmNoIChlbmcgcmV2aWV3ClI0KS4gYG9wZW5gIGlzIGlnbm9yZWQ6IGxpc3RzIGhhdmUgbm8gcGF1c2UuIEZhaWxzIGlmIGFscmVhZHkgTGl2ZS4AAAAGbGF1bmNoAAAAAAACAAAAAAAAAAh0cmVhc3VyeQAAABMAAAAAAAAABG9wZW4AAAABAAAAAQAAA+kAAAACAAAAAw==", "AAAAAAAAAcNSZXR1cm4gYSBjbGFpbWVyJ3MgZXNjcm93IGZyb20gYSBgRmFpbGVkYCBsaXN0LiBSZXR1cm5zIHRoZSBhbW91bnQuCgpBbnlvbmUgbWF5IGNhbGwgaXQ7IHRoaXMgY29kZSBzZW5kcyB0aGUgZnVuZHMgb25seSB0byBgY2xhaW1lcmAsIHRoZQphZGRyZXNzIHRoYXQgcGFpZCwgYW5kIHRvIG5vd2hlcmUgZWxzZS4gSWYgdGhhdCBhZGRyZXNzCmNhbid0IHJlY2VpdmUgdGhlIGFzc2V0IChmb3IgZXhhbXBsZSwgaXRzIGlzc3VlciBkZWF1dGhvcml6ZWQgaXQsIG9yIGFuCmFjY291bnQgcmVtb3ZlZCBpdHMgdHJ1c3RsaW5lKSwgdGhlIGNhbGwgZmFpbHMgYW5kIHRoZSBlc2Nyb3cgc3RheXMKaGVyZSB1bnRpbCBhIGxhdGVyIGNhbGwgc3VjY2VlZHMuIFRoZSBjbGFpbWVyIGtlZXBzIHRoZSB0b2tlbnMsIHdoaWNoCmNhcnJ5IG5vIHBvd2VyIGJlY2F1c2UgdGhlIERBTyBuZXZlciBnb2VzIExpdmUuAAAAAAZyZWZ1bmQAAAAAAAIAAAAAAAAAB2xpc3RfaWQAAAAABAAAAAAAAAAHY2xhaW1lcgAAAAATAAAAAQAAA+kAAAALAAAAAw==", "AAAAAAAAAVRFYXJseSBoYW5kb2ZmLCBpbiBTZXR1cDogdGhlIGFkbWluIG1vdmVzIHRvIHRoZSBUcmVhc3VyeSBhbmQgdGhlCm1vZHVsZSBzdGF5cyBpbiBTZXR1cC4KCk9ubHkgdGhlIE1hbmFnZXIgbWF5IGNhbGwgaXQgKGBvcGVuX2Fzc3VyYW5jZWAgZnJlZXplcyB0aGUgREFPIHRoaXMKd2F5KSwgYW5kIGB0cmVhc3VyeWAgbXVzdCBiZSB0aGUgd2lyZWQgVHJlYXN1cnkuIEFmdGVyd2FyZHMgbm8gbGlzdCBjYW4KYmUgb3BlbmVkIG9yIGNsb3NlZCBhbmQgbm8gdXBncmFkZSBhcHBsaWVkIHVudGlsIGxhdW5jaCwgYmVjYXVzZSB0aGUKVHJlYXN1cnkgY2FuJ3QgYWN0IGJlZm9yZSB0aGUgREFPIGlzIExpdmUuAAAAB2hhbmRvZmYAAAAAAQAAAAAAAAAIdHJlYXN1cnkAAAATAAAAAQAAA+kAAAACAAAAAw==", "AAAAAAAAAktBZHZhbmNlIHRoZSBzdG9yYWdlIGxheW91dCBhZnRlciBhbiB1cGdyYWRlOyBpdCBmYWlscyB3aXRoCmBOb3RoaW5nVG9NaWdyYXRlYCB3aGVuIHRoZSBsYXlvdXQgaXMgY3VycmVudC4gVW50aWwgaXQgcnVucywgZXZlcnkKZW50cnkgcG9pbnQgdGhhdCBjaGFuZ2VzIHN0YXRlIGZhaWxzIGBTdG9yYWdlVmVyc2lvbk1pc21hdGNoYC4KCkFueW9uZSBtYXkgY2FsbCBpdC4gSXQgcnVucyBvbmx5IHRoZSBtaWdyYXRpb24gdGhhdCB0aGUgaW5zdGFsbGVkCmNvZGUgZGVmaW5lcywgd2hpY2ggdGhlIE1hbmFnZXIgYXBwcm92ZWQgYW5kIHRoZSBhZG1pbiAob3IsIGFmdGVyIGEKZmFpbGVkIGRyaXZlLCB0aGUgTWFuYWdlcidzIGByZWNvdmVyX2NsYWltc2ApIGluc3RhbGxlZCwgYW5kIG9ubHkgb25jZQpwZXIgbGF5b3V0LiBJdCBzdGF5cyBvcGVuIGJlY2F1c2UgZHVyaW5nIGEgZHJpdmUgdGhlIGFkbWluIGlzIHRoZQpUcmVhc3VyeSwgd2hpY2ggY2Fubm90IGFjdCBiZWZvcmUgbGF1bmNoOiBhZnRlciBhIHJlY292ZXJ5IHVwZ3JhZGUsCnJlZnVuZHMgbXVzdCBub3Qgd2FpdCBmb3IgYSBwcm9wb3NhbCB0aGF0IGNhbiBuZXZlciBwYXNzLgAAAAAHbWlncmF0ZQAAAAAAAAAAAA==", "AAAAAAAAAVxNb3ZlIGEgbGlzdCdzIGVzY3JvdyB0byB0aGUgVHJlYXN1cnkgd2lyZWQgYXQgY29uc3RydWN0aW9uLiBSZXR1cm5zCnRoZSBhbW91bnQgbW92ZWQgKDAgd2hlbiBub3RoaW5nIGlzIGhlbGQpLgoKQW55b25lIG1heSBjYWxsIGl0IG9uY2UgdGhlIERBTyBpcyBMaXZlOyBgbGF1bmNoYCBjYWxscyBpdCBmb3IgdGhlCmFzc3VyYW5jZSBsaXN0LiBUaGUgZGVzdGluYXRpb24gaXMgZml4ZWQsIHNvIGEgY2FsbGVyIGNob29zZXMgb25seQp3aGVuIGl0IHJ1bnMuIEl0IG1vdmVzIG9ubHkgd2hhdCBgY2xhaW1gIHJlY29yZGVkIGFzIGVzY3JvdywgbmV2ZXIKb3RoZXIgYmFsYW5jZXMgdGhpcyBjb250cmFjdCBob2xkcy4AAAAHcmVsZWFzZQAAAAABAAAAAAAAAAdsaXN0X2lkAAAAAAQAAAABAAAD6QAAAAsAAAAD", "AAAAAAAAARpVcGdyYWRlIHRvIGEgTWFuYWdlci1hcHByb3ZlZCBXQVNNLgoKT25seSB0aGUgYWRtaW4gbWF5IGNhbGwgaXQ6IHRoZSBsYXVuY2ggYWRtaW4gaW4gU2V0dXAsIHRoZSBUcmVhc3VyeSBieQpwcm9wb3NhbCBvbmNlIGhhbmRlZCBvdmVyLiBUaGUgTWFuYWdlcidzIHJlZ2lzdHJ5IG11c3QgYXBwcm92ZSB0aGUKcGFpciBgZnJvbV9oYXNoIC0+IHRvX2hhc2hgLCBhbmQgYGZyb21faGFzaGAgbXVzdCBiZSB0aGUgcnVubmluZyBjb2RlLgpMaXN0cywgcmVjb3JkcywgYW5kIGVzY3JvdyBhcmUga2VwdC4AAAAAAAd1cGdyYWRlAAAAAAIAAAAAAAAACWZyb21faGFzaAAAAAAAA+4AAAAgAAAAAAAAAAd0b19oYXNoAAAAA+4AAAAgAAAAAA==", "AAAAAAAAAD1UaGUgcmVnaXN0cnkgdmVyc2lvbiBvZiB0aGUgcnVubmluZyBjb2RlLiBBbnlvbmUgbWF5IHJlYWQgaXQuAAAAAAAAB3ZlcnNpb24AAAAAAAAAAAEAAAAQ", "AAAAAAAAAEFBIGxpc3QncyByZWNvcmQsIG9yIGBOb25lYCBmb3IgYW4gdW5rbm93biBpZC4gQW55b25lIG1heSByZWFkIGl0LgAAAAAAAAhnZXRfbGlzdAAAAAEAAAAAAAAAB2xpc3RfaWQAAAAABAAAAAEAAAPoAAAH0AAAAAlDbGFpbUxpc3QAAAA=", "AAAAAAAAAFNBIGNsYWltZXIncyBwcm9ncmVzcyBvbiBhIGxpc3QgKHplcm8gYmVmb3JlIHRoZWlyIGZpcnN0IGNsYWltKS4KQW55b25lIG1heSByZWFkIGl0LgAAAAAJZ2V0X2NsYWltAAAAAAAAAgAAAAAAAAAHbGlzdF9pZAAAAAAEAAAAAAAAAAdjbGFpbWVyAAAAABMAAAABAAAH0AAAAAtDbGFpbVJlY29yZAA=", "AAAAAAAAA21PcGVuIGEgbGlzdCBhbmQgcmV0dXJuIGl0cyBpZC4gT25seSB0aGUgYWRtaW4gbWF5IGNhbGwgaXQuCgotICoqU2V0dXA6KiogdGhlIGxpc3QgdXNlcyB0aGUgY29uZmlndXJlZCBwYXltZW50IGFzc2V0IGFuZCBuZWVkcwphcnR3b3JrLiBBIGxpc3Qgd2l0aCBhIHByaWNlIG9yIGFzc3VyYW5jZSB0ZXJtcyBhbHNvIG5lZWRzIHRoZQpNYW5hZ2VyJ3MgYXV0aG9yaXphdGlvbiwgc28gb25seSBgbWFuYWdlci5vcGVuX2Fzc3VyYW5jZWAgb3BlbnMgb25lCmFuZCB0aGUgTWFuYWdlciBhbHdheXMgcmVjb3JkcyBpdDsgdGhlIGxhdW5jaCBhZG1pbiBhbG9uZSBvcGVucyBvbmx5CmZyZWUgbGlzdHMuIEF0IG1vc3Qgb25lIGFzc3VyYW5jZSBsaXN0LgotICoqTGl2ZToqKiB0aGUgVHJlYXN1cnksIGJ5IHByb3Bvc2FsLCB3aXRoIGFueSBhc3NldCBhbmQgcHJpY2UsIGFuZCBubwphc3N1cmFuY2UgdGVybXMuCgpBc3N1cmFuY2UgdGVybXMgbmVlZCBhIHRocmVzaG9sZCBmcm9tIDEgdG8gYHRvdGFsYCBhbmQgYSBkZWFkbGluZSBhZnRlcgpub3cgYW5kIG5vIGxhdGVyIHRoYW4gYGV4cGlyZXNfYXRgIChgSW52YWxpZEFzc3VyYW5jZWApLgoKYHRyZWVfdXJpYCBpcyB0aGUgYGlwZnM6Ly88Y2lkPmAgb2YgdGhlIGZ1bGwgdHJlZSBpbiB0aGUKYGJ1aWxkZXItc3RlbGxhci1tZXJrbGUtdjFgIGZvcm1hdC4gVGhlIGNoYWluIGNhbm5vdCBjaGVjayBpdCBhZ2FpbnN0CnRoZSByb290OyBjb25zdW1lcnMgcmVjb21wdXRlIHRoZSByb290IGZyb20gdGhlIGZpbGUgYmVmb3JlIGNsYWltaW5nLgpUaGUgbGlzdCdzIHRlcm1zIG5ldmVyIGNoYW5nZSBhZnRlciBvcGVuaW5nOyBvbmx5IGBjbG9zZV9saXN0YCBtb3ZlcwppdHMgYGV4cGlyZXNfYXRgIGVhcmxpZXIuAAAAAAAACW9wZW5fbGlzdAAAAAAAAAcAAAAAAAAABHJvb3QAAAPuAAAAIAAAAAAAAAAIdHJlZV91cmkAAAAQAAAAAAAAAAVhc3NldAAAAAAAABMAAAAAAAAABXByaWNlAAAAAAAACwAAAAAAAAAKZXhwaXJlc19hdAAAAAAABgAAAAAAAAAFdG90YWwAAAAAAAAEAAAAAAAAAAlhc3N1cmFuY2UAAAAAAAPoAAAH0AAAAA5Bc3N1cmFuY2VUZXJtcwAAAAAAAQAAA+kAAAAEAAAAAw==", "AAAAAAAAAK9UaGUgV0FTTSBoYXNoIHRoaXMgY29udHJhY3QgcmVjb3JkcyBmb3IgaXRzIGNvZGU6IHNldCBhdCBjb25zdHJ1Y3Rpb24KYW5kIGJ5IGVhY2ggdXBncmFkZS4gSXQgaXMgc2VsZi1yZXBvcnRlZDsgdGhlIGNvbnRyYWN0J3MgZXhlY3V0YWJsZSBpcwp0aGUgYXV0aG9yaXR5LiBBbnlvbmUgbWF5IHJlYWQgaXQuAAAAAAl3YXNtX2hhc2gAAAAAAAAAAAAAAQAAA+4AAAAg", "AAAAAAAAAg9DbG9zZSBhIGxpc3QgZWFybHkgKHRoZSBhZG1pbik6IGNsYWltcyBzdG9wIGF0IG9uY2UuCgpBIGxpc3Qgc3RheXMgY2xhaW1hYmxlIHVudGlsIGl0cyBgZXhwaXJlc19hdGAsIGluY2x1ZGluZyBhZnRlciBsYXVuY2gsCnNvIGEgZnJlZSBsaXN0IHRoZSBsYXVuY2ggYWRtaW4gb3BlbmVkIGluIFNldHVwIGNhbiBzdGlsbCBtaW50IG9uY2UKdGhlIERBTyBpcyBMaXZlICh1cCB0byB0aGlzIG1vZHVsZSdzIGFsbG93YW5jZSkuIFRoaXMgaXMgaG93IHRoZSBEQU8sCmJ5IHByb3Bvc2FsLCBlbmRzIHN1Y2ggYSBsaXN0LiBUaGUgYXNzdXJhbmNlIGxpc3QgY2FuJ3QgYmUgY2xvc2VkCmJlZm9yZSBsYXVuY2gsIHNpbmNlIGl0cyByZWZ1bmRzIGFuZCByZWxlYXNlIGRlcGVuZCBvbiBpdAooYEFzc3VyYW5jZU5vdEFsbG93ZWRgKTsgYSBsaXN0IGFscmVhZHkgcGFzdCBpdHMgZXhwaXJ5IGZhaWxzIHdpdGgKYExpc3RFeHBpcmVkYC4gVGhlIGxpc3Qga2VlcHMgaXRzIHJlY29yZDsgb25seSBgZXhwaXJlc19hdGAgbW92ZXMgdG8Kbm93LgAAAAAKY2xvc2VfbGlzdAAAAAAAAQAAAAAAAAAHbGlzdF9pZAAAAAAEAAAAAQAAA+kAAAACAAAAAw==", "AAAAAAAAADVUaGUgd2lyaW5nIGZpeGVkIGF0IGNvbnN0cnVjdGlvbi4gQW55b25lIG1heSByZWFkIGl0LgAAAAAAAApnZXRfY29uZmlnAAAAAAAAAAAAAQAAB9AAAAAMQ2xhaW1zQ29uZmln", "AAAAAAAAAM1UaGUgaWQgdGhlIG5leHQgbGlzdCByZWNlaXZlcyAodGhlIG51bWJlciBvZiBsaXN0cyBzbyBmYXIpLiBBbnlvbmUKbWF5IHJlYWQgaXQuIEEgbGlzdCBvcGVuZWQgYnkgYSBwcm9wb3NhbCBnZXRzIHRoZSBpZCBjdXJyZW50IHdoZW4gdGhlCnByb3Bvc2FsIGV4ZWN1dGVzLCB3aGljaCBtYXkgZGlmZmVyIGZyb20gdGhlIG9uZSByZWFkIHdoZW4gZHJhZnRpbmcuAAAAAAAADG5leHRfbGlzdF9pZAAAAAAAAAABAAAABA==", "AAAAAAAAASpPbmUgcGFnZSBvZiB0aGUgcGVyc2lzdGVudCBrZXlzIHRoZSBEQU8ncyBzdG9yYWdlIHN3ZWVwIHJlbmV3cy4KCkxpc3RzIGBMaXN0KGN1cnNvci4uKWAgdXAgdG8gYGxpbWl0YCBpZHMgYmVsb3cgYG5leHRfbGlzdF9pZGAsIGFuZCB0aGUKcGF5bWVudCBhc3NldCAod2hvc2UgYmFsYW5jZSBlbnRyeSBob2xkcyB0aGUgZXNjcm93KS4gYENsYWltKGxpc3QsCmNsYWltZXIpYCByZWNvcmRzIGJlbG9uZyB0byB0aGVpciBjbGFpbWVycyBhbmQgYXJlIGxlZnQgb3V0IChob2xkZXIKY2xhc3MpLiBBbnlvbmUgbWF5IHJlYWQgaXQuAAAAAAAMcmVuZXdhbF9rZXlzAAAAAgAAAAAAAAAGY3Vyc29yAAAAAAAEAAAAAAAAAAVsaW1pdAAAAAAAAAQAAAABAAAH0AAAAAtSZW5ld2FsUGFnZQA=", "AAAAAAAAAeZXaXJlIHRoZSBtb2R1bGUgdG8gaXRzIERBTy4gUnVucyBvbmNlLCB3aGVuIHRoZSBNYW5hZ2VyIGRlcGxveXMgaXQuCgoqIGBhZG1pbmAgLSB0aGUgbGF1bmNoIGFkbWluIGluIFNldHVwOyB0aGUgVHJlYXN1cnkgb25jZSBMaXZlCiogYHRva2VuYCAvIGB0cmVhc3VyeWAgLSB0aGUgREFPJ3MgVG9rZW4gYW5kIFRyZWFzdXJ5IChmaXhlZCkKKiBgbWFuYWdlcmAgLSB0aGUgTWFuYWdlcjogcmVnaXN0cnksIGxhdW5jaGVyIGFuZCByZWNvdmVyeSBjYWxsZXIKKiBgcGF5bWVudF9hc3NldGAgLSB0aGUgYXNzZXQgU2V0dXAgbGlzdHMgYXJlIHByaWNlZCBpbgoqIGBjdXJyZW50X2hhc2hgIC0gdGhpcyBpbXBsZW1lbnRhdGlvbidzIFdBU00gaGFzaAoKTm8gZnVuY3Rpb24gY2hhbmdlcyB0aGUgVG9rZW4sIFRyZWFzdXJ5LCBNYW5hZ2VyLCBvciBwYXltZW50IGFzc2V0LCBzbwp0aGlzIGNvZGUgcmVsZWFzZXMgZXNjcm93IG9ubHkgdG8gdGhpcyBUcmVhc3VyeS4AAAAAAA1fX2NvbnN0cnVjdG9yAAAAAAAABgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAACHRyZWFzdXJ5AAAAEwAAAAAAAAAHbWFuYWdlcgAAAAATAAAAAAAAAA1wYXltZW50X2Fzc2V0AAAAAAAAEwAAAAAAAAAMY3VycmVudF9oYXNoAAAD7gAAACAAAAAA", "AAAAAAAAAGdUaGUgYXNzZXQgU2V0dXAgbGlzdHMgYXJlIHByaWNlZCBpbiAoYERhb01vZHVsZTo6cGF5bWVudF9hc3NldGApLgpBbnlvbmUgbWF5IHJlYWQgaXQ7IGl0IG5ldmVyIGNoYW5nZXMuAAAAAA1wYXltZW50X2Fzc2V0AAAAAAAAAAAAAAEAAAAT", "AAAAAAAAADpUaGUgYXNzdXJhbmNlIGxpc3QsIGlmIG9uZSB3YXMgb3BlbmVkLiBBbnlvbmUgbWF5IHJlYWQgaXQuAAAAAAAOYXNzdXJhbmNlX2xpc3QAAAAAAAAAAAABAAAD6AAAAAQ=", "AAAAAAAAAQBUaGUgYXNzdXJhbmNlIGxpc3QncyBzdGF0ZTogYEZhaWxlZGAgb25jZSBpdHMgZGVhZGxpbmUgaGFzIHBhc3NlZAp3aGlsZSB0aGUgREFPIGlzIG5vdCBMaXZlLCBvdGhlcndpc2UgYE1ldGAgb25jZSBlbm91Z2ggZGlzdGluY3QKYWRkcmVzc2VzIGhhdmUgY2xhaW1lZCwgb3RoZXJ3aXNlIGBPcGVuYC4gYE5vdEFzc3VyYW5jZWAgZm9yIGFueSBvdGhlcgpsaXN0LiBBbnlvbmUgbWF5IHJlYWQgaXQ7IGl0IGlzIGNvbXB1dGVkLCBuZXZlciBzdG9yZWQuAAAAD2Fzc3VyYW5jZV9zdGF0ZQAAAAABAAAAAAAAAAdsaXN0X2lkAAAAAAQAAAABAAAD6QAAB9AAAAAOQXNzdXJhbmNlU3RhdGUAAAAAAAM=", "AAAAAAAAAMZTdG9yYWdlLWxheW91dCB2ZXJzaW9uIG9mIHRoZSBkYXRhIGhlbGQgYnkgdGhpcyBjb250cmFjdC4gQW55b25lIG1heQpyZWFkIGl0LiBXaGlsZSBpdCBkaWZmZXJzIGZyb20gdGhlIGNvZGUncyBgU1RPUkFHRV9WRVJTSU9OYCwgZXZlcnkKZW50cnkgcG9pbnQgdGhhdCBjaGFuZ2VzIHN0YXRlIGZhaWxzIGBTdG9yYWdlVmVyc2lvbk1pc21hdGNoYC4AAAAAAA9zdG9yYWdlX3ZlcnNpb24AAAAAAAAAAAEAAAAE", "AAAAAAAAAdlNYW5hZ2VyLW9ubHkgdXBncmFkZSBvZiBhIGZyb3plbiBDbGFpbU1pbnRlciwgZm9yIGEgZmFpbGVkIGRyaXZlIHdob3NlCnJlZnVuZHMgYXJlIGJyb2tlbiAoYG1hbmFnZXIucmVjb3Zlcl9jbGFpbXNgLCByZXZpZXcgQjIpLiBJdCBjaGVja3Mgb25seQp0aGUgTWFuYWdlcidzIGF1dGhvcml6YXRpb24gYW5kIHRoYXQgdGhlIG1vZHVsZSBpcyBzdGlsbCBpbiBTZXR1cCwgbm90CnRoaXMgY29udHJhY3QncyBvd24gc3RhdGUgbWFjaGluZSwgd2hpY2ggbWF5IGJlIHRoZSBicm9rZW4gY29kZTsgdGhlCk1hbmFnZXIgZGVjaWRlcyB0aGF0IHRoZSBkcml2ZSBmYWlsZWQuIFRoZSBNYW5hZ2VyIGhhcyBhbHJlYWR5IGNoZWNrZWQKdGhlIHJlZ2lzdHJ5IGFwcHJvdmFsIGZvciB0aGlzIGhhc2ggYW5kIHBhc3NlcyBgdmVyc2lvbmAsIGJlY2F1c2UgYXNraW5nCml0IGJhY2sgZnJvbSBoZXJlIHdvdWxkIGJlIGNvbnRyYWN0IHJlLWVudHJ5LgAAAAAAABByZWNvdmVyeV91cGdyYWRlAAAAAwAAAAAAAAAJZnJvbV9oYXNoAAAAAAAD7gAAACAAAAAAAAAAB3RvX2hhc2gAAAAD7gAAACAAAAAAAAAAB3ZlcnNpb24AAAAAEAAAAAA=", "AAAABQAAAKtFbWl0dGVkIGJ5IFtgaGFuZG9mZmBdLiBUaGUgZW1pdHRpbmcgY29udHJhY3QgYWRkcmVzcyBpcyB0aGUgZXZlbnQncyBjb250cmFjdCBpZC4KClNhbWUgc2hhcGUgYXMgdGhlIE1hbmFnZXIncyBvd24gYEFkbWluQ2hhbmdlZGAsIHNvIGluZGV4ZXJzIGRlY29kZSBib3RoCndpdGggb25lIHNjaGVtYS4AAAAAAAAAAAxBZG1pbkNoYW5nZWQAAAABAAAADWFkbWluX2NoYW5nZWQAAAAAAAACAAAAMFRoZSBhZG1pbiBiZWZvcmUgdGhlIGhhbmRvZmYgKHRoZSBsYXVuY2ggYWRtaW4pLgAAAAlvbGRfYWRtaW4AAAAAAAATAAAAAQAAACJUaGUgYWRtaW4gYWZ0ZXIgaXQgKHRoZSBUcmVhc3VyeSkuAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAEAAAAC", "AAAABAAAAD5FcnJvcnMgc2hhcmVkIGJ5IGFsbCBtb2R1bGUgY29udHJhY3RzIChibG9jayBgY29kZXM6OkNPTU1PTmApLgAAAAAAAAAAAAtDb21tb25FcnJvcgAAAAANAAAANE9wZXJhdGlvbiByZXF1aXJlcyB0aGUgbW9kdWxlIHRvIGJlIGxpdmUgKGxhdW5jaGVkKS4AAAAHTm90TGl2ZQAAABtZAAAAQU9wZXJhdGlvbiBpcyBvbmx5IHZhbGlkIGR1cmluZyBzZXR1cDsgdGhlIG1vZHVsZSBpcyBhbHJlYWR5IGxpdmUuAAAAAAAAC0FscmVhZHlMaXZlAAAAG1oAAAAlTWFuYWdlciBhZGRyZXNzIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAAAAA1NYW5hZ2VyTm90U2V0AAAAAAAbWwAAACNgQ3VycmVudEhhc2hgIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAARQ3VycmVudEhhc2hOb3RTZXQAAAAAABtcAAAANGBmcm9tX2hhc2hgIGRvZXMgbm90IGVxdWFsIHRoZSBzdG9yZWQgYEN1cnJlbnRIYXNoYC4AAAAMSGFzaE1pc21hdGNoAAAbXQAAACpNYW5hZ2VyIGRpZCBub3QgYXBwcm92ZSB0aGlzIHVwZ3JhZGUgcGF0aC4AAAAAABJVcGdyYWRlTm90QXBwcm92ZWQAAAAAG14AAAA1TWFuYWdlciBoYXMgbm8gcmVnaXN0cnkgZW50cnkgZm9yIHRoZSByZXF1ZXN0ZWQgaGFzaC4AAAAAAAAWSW1wbGVtZW50YXRpb25Ob3RGb3VuZAAAAAAbXwAAACJNb2R1bGUgYWRtaW4gbWlzc2luZyBmcm9tIHN0b3JhZ2UuAAAAAAALQWRtaW5Ob3RTZXQAAAAbYAAAAD9UaGUgTWFuYWdlcidzIG93biBgQ3VycmVudE1hbmFnZXJWZXJzaW9uYCBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAADVZlcnNpb25Ob3RTZXQAAAAAABthAAAAJlRyZWFzdXJ5IGFkZHJlc3MgbWlzc2luZyBmcm9tIHN0b3JhZ2UuAAAAAAAOVHJlYXN1cnlOb3RTZXQAAAAAG2IAAAAmR292ZXJub3IgYWRkcmVzcyBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAAAA5Hb3Zlcm5vck5vdFNldAAAAAAbYwAAADxgbWlncmF0ZWAgY2FsbGVkIHdoaWxlIHRoZSBzdG9yZWQgbGF5b3V0IGlzIGFscmVhZHkgY3VycmVudC4AAAAQTm90aGluZ1RvTWlncmF0ZQAAG2QAAAAmYFN0b3JhZ2VWZXJzaW9uYCBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAAABRTdG9yYWdlVmVyc2lvbk5vdFNldAAAG2U=", "AAAAAQAAACZPbmUgcGFnZSBvZiBgRGFvTW9kdWxlOjpyZW5ld2FsX2tleXNgLgAAAAAAAAAAAAtSZW5ld2FsUGFnZQAAAAADAAAAmUFzc2V0IGNvbnRyYWN0cyAodGhlIERBTyB0b2tlbiBpbmNsdWRlZCkgd2hvc2UgYEJhbGFuY2UobW9kdWxlKWAgZW50cnkKdGhlIG1vZHVsZSBob2xkcy4gUmVwb3J0ZWQgb24gdGhlIGZpcnN0IHBhZ2U7IGxhdGVyIHBhZ2VzIG1heSByZXBlYXQKb3Igb21pdCB0aGVtLgAAAAAAAAZhc3NldHMAAAAAA+oAAAATAAAB9GAoa2V5LCBwZXJzaXN0ZW50KWAgZm9yIGVhY2ggc3RvcmFnZSBlbnRyeSB0aGUgbW9kdWxlIGFza3MgdGhlIHN3ZWVwCnRvIGtlZXAgYWxpdmUuIGBrZXlgIGlzIHRoZSBleGFjdCBgVmFsYCB0aGUgbW9kdWxlIHN0b3JlcyB1bmRlciwKYWxyZWFkeSBuYW1lc3BhY2VkIChgY3JhdGU6Om5zYCksIHNvIHRoZSBzd2VlcCBidWlsZHMKYExlZGdlcktleTo6Q29udHJhY3REYXRhIHsgY29udHJhY3Q6IG1vZHVsZSwga2V5LCBkdXJhYmlsaXR5IH1gIGZyb20gaXQKZGlyZWN0bHk7IGBwZXJzaXN0ZW50YCBpcyBmYWxzZSBmb3IgdGVtcG9yYXJ5IGVudHJpZXMuIEluc3RhbmNlIGVudHJpZXMKYXJlIG5vdCBsaXN0ZWQ6IHRoZSBzd2VlcCByZW5ld3MgZXZlcnkgbW9kdWxlJ3MgaW5zdGFuY2UuIEEga2V5IG1heSBuYW1lCmFuIGVudHJ5IHRoYXQgZG9lcyBub3QgZXhpc3QgKGEgbGlzdGluZyBzbG90IG5vYm9keSB1c2VkKTsgdGhlIHN3ZWVwCnJlbmV3cyBvbmx5IHdoYXQgaXQgZmluZHMuAAAABGtleXMAAAPqAAAD7QAAAAIAAAAAAAAAAQAAADBDdXJzb3Igb2YgdGhlIG5leHQgcGFnZSwgYE5vbmVgIG9uIHRoZSBsYXN0IG9uZS4AAAALbmV4dF9jdXJzb3IAAAAD6AAAAAQ=", "AAAAAgAAADJgYXNzdXJhbmNlX3N0YXRlYCBvZiBhIENsYWltTWludGVyIGFzc3VyYW5jZSBsaXN0LgAAAAAAAAAAAA5Bc3N1cmFuY2VTdGF0ZQAAAAAAAwAAAAAAAABARmV3ZXIgZGlzdGluY3QgY2xhaW1lcnMgdGhhbiB0aGUgdGhyZXNob2xkLCBkZWFkbGluZSBub3QgcGFzc2VkLgAAAARPcGVuAAAAAAAAAEBUaGUgdGhyZXNob2xkIGlzIHJlYWNoZWQ7IHRoZSBEQU8gbWF5IGxhdW5jaCB1bnRpbCB0aGUgZGVhZGxpbmUuAAAAA01ldAAAAAAAAAAAOlRoZSBkZWFkbGluZSBwYXNzZWQgYW5kIHRoZSBEQU8gaXMgbm90IExpdmU6IHJlZnVuZHMgb25seS4AAAAAAAZGYWlsZWQAAA==", "AAAAAQAAAEdXaGF0IGEgQ2xhaW1NaW50ZXIgYXNzdXJhbmNlIGxpc3QgbXVzdCByZWFjaCwgYW5kIGJ5IHdoZW4gKGRlc2lnbiDCpzMpLgAAAAAAAAAADkFzc3VyYW5jZVRlcm1zAAAAAAACAAAAQkxlZGdlciB0aW1lc3RhbXAgYWZ0ZXIgd2hpY2ggYW4gdW5sYXVuY2hlZCBEQU8ncyBsaXN0IGlzIGBGYWlsZWRgLgAAAAAACGRlYWRsaW5lAAAABgAAACNEaXN0aW5jdCBjbGFpbWVycyBuZWVkZWQgZm9yIGBNZXRgLgAAAAASdGhyZXNob2xkX2NsYWltZXJzAAAAAAAE", "AAAABQAAAHZFbWl0dGVkIGJ5IFtgbWlncmF0ZWBdIHdoZW4gdGhlIHN0b3JlZCBsYXlvdXQgbW92ZXMgZm9yd2FyZC4gVGhlIGVtaXR0aW5nCmNvbnRyYWN0IGFkZHJlc3MgaXMgdGhlIGV2ZW50J3MgY29udHJhY3QgaWQuAAAAAAAAAAAACE1pZ3JhdGVkAAAAAQAAAAhtaWdyYXRlZAAAAAIAAAAoVGhlIGxheW91dCB2ZXJzaW9uIGJlZm9yZSB0aGUgbWlncmF0aW9uLgAAABRmcm9tX3N0b3JhZ2VfdmVyc2lvbgAAAAQAAAAAAAAAO1RoZSBsYXlvdXQgdmVyc2lvbiBhZnRlciBpdCAodGhlIGNvZGUncyBgU1RPUkFHRV9WRVJTSU9OYCkuAAAAABJ0b19zdG9yYWdlX3ZlcnNpb24AAAAAAAQAAAAAAAAAAg==", "AAAABQAAAE1FbWl0dGVkIGJ5IGBhcHBseWAuIFRoZSBlbWl0dGluZyBjb250cmFjdCBhZGRyZXNzIGlzIHRoZSBldmVudCdzIGNvbnRyYWN0IGlkLgAAAAAAAAAAAAAIVXBncmFkZWQAAAABAAAACHVwZ3JhZGVkAAAAAwAAACFUaGUgY29kZSBoYXNoIGJlZm9yZSB0aGUgdXBncmFkZS4AAAAAAAAJZnJvbV9oYXNoAAAAAAAD7gAAACAAAAABAAAAF1RoZSBjb2RlIGhhc2ggYWZ0ZXIgaXQuAAAAAAd0b19oYXNoAAAAA+4AAAAgAAAAAQAAAC1UaGUgcmVnaXN0cnkncyByZWxlYXNlIHZlcnNpb24gZm9yIGB0b19oYXNoYC4AAAAAAAAHdmVyc2lvbgAAAAAQAAAAAAAAAAI="]),
      options
    );
  }

   static deploy<T = Client>({ admin, token, treasury, manager, payment_asset, current_hash }: { admin: string | Address; token: string | Address; treasury: string | Address; manager: string | Address; payment_asset: string | Address; current_hash: Uint8Array }, options: MethodOptions & Omit<ContractClientOptions, 'contractId'> & { salt?: Uint8Array; address?: string; } & ({ wasmHash: Uint8Array | string; format?: "hex" | "base64"; externalRef?: never; } | { externalRef: ExternalExecutableRef; wasmHash?: never; format?: never; })): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({ admin, token, treasury, manager, payment_asset, current_hash }, options);
  }
  public readonly fromJson = {
    admin : this.txFromJson<string>,  claim : this.txFromJson<Result<Array<number>, Error>>,  launch : this.txFromJson<Result<null, Error>>,  refund : this.txFromJson<Result<bigint, Error>>,  handoff : this.txFromJson<Result<null, Error>>,  migrate : this.txFromJson<void>,  release : this.txFromJson<Result<bigint, Error>>,  upgrade : this.txFromJson<void>,  version : this.txFromJson<string>,  get_list : this.txFromJson<ClaimList | null>,  get_claim : this.txFromJson<ClaimRecord>,  open_list : this.txFromJson<Result<number, Error>>,  wasm_hash : this.txFromJson<Uint8Array>,  close_list : this.txFromJson<Result<null, Error>>,  get_config : this.txFromJson<ClaimsConfig>,  next_list_id : this.txFromJson<number>,  renewal_keys : this.txFromJson<RenewalPage>,  payment_asset : this.txFromJson<string>,  assurance_list : this.txFromJson<number | null>,  assurance_state : this.txFromJson<Result<AssuranceState, Error>>,  storage_version : this.txFromJson<number>,  recovery_upgrade : this.txFromJson<void>
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
   * Build a topics filter row for the "Claimed" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  claimedEventFilter(topicValues?: { list_id?: number; claimer?: string | Address }): string[] {
    return this.spec.eventTopicFilter("Claimed", topicValues);
  }
  /**
   * Build a topics filter row for the "Refunded" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  refundedEventFilter(topicValues?: { list_id?: number; claimer?: string | Address }): string[] {
    return this.spec.eventTopicFilter("Refunded", topicValues);
  }
  /**
   * Build a topics filter row for the "ListClosed" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  listClosedEventFilter(topicValues?: { list_id?: number }): string[] {
    return this.spec.eventTopicFilter("ListClosed", topicValues);
  }
  /**
   * Build a topics filter row for the "ListOpened" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  listOpenedEventFilter(topicValues?: { list_id?: number }): string[] {
    return this.spec.eventTopicFilter("ListOpened", topicValues);
  }
  /**
   * Build a topics filter row for the "EscrowReleased" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  escrowReleasedEventFilter(topicValues?: { list_id?: number }): string[] {
    return this.spec.eventTopicFilter("EscrowReleased", topicValues);
  }
  /**
   * Build a topics filter row for the "ClaimMinterLaunched" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  claimMinterLaunchedEventFilter(topicValues?: { treasury?: string | Address }): string[] {
    return this.spec.eventTopicFilter("ClaimMinterLaunched", topicValues);
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
}