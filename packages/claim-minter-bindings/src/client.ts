import {ClaimList, ClaimRecord, AssuranceTerms, ClaimsConfig, RenewalPage, AssuranceState, ContractEvent} from './types.js';
import {Result, Spec, AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, ExternalExecutableRef} from '@stellar/stellar-sdk/contract';
import {Address, xdr} from '@stellar/stellar-sdk';

export interface Client {
  /**
   * Module admin: the launch admin in Setup, the Treasury once handed over.
   */
  admin(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * Claim `mint_now` tokens of the leaf `(claimer, leaf_amount)`.
   *
   * The proof covers the full leaf; a claimer may claim it in parts,
   * at most `common::MAX_BATCH_MINT` tokens per call. Each claim pays
   * `price × mint_now` in the list's asset: into escrow on the assurance
   * list before launch, otherwise to the Treasury. `max_price` bounds the
   * unit price the claimer accepts. Returns the minted token ids.
   *
   * The leaf is `sha256(claimer_xdr || leaf_amount_be_u128)`; internal
   * nodes are `sha256(min(a, b) || max(a, b))`, so proofs carry no
   * direction bits.
   */
  claim({ list_id, claimer, leaf_amount, mint_now, proof, max_price }: { list_id: number; claimer: string | Address; leaf_amount: bigint; mint_now: number; proof: Array<Uint8Array>; max_price: bigint }, options?: MethodOptions): Promise<AssembledTransaction<Result<Array<number>, Error>>>;
  /**
   * Setup -> Live, called by the Manager in the launch transaction, after
   * the Token is Live. Hands the admin to the Treasury unless `handoff`
   * already did, and releases the assurance escrow to the Treasury, so the
   * fees arrive with the launch (eng review R4). `open` is ignored: lists
   * have no pause.
   */
  launch({ treasury, open }: { treasury: string | Address; open: boolean }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * Return a claimer's escrow from a `Failed` list. Anyone may call it;
   * the funds go only to the claimer. The claimer keeps the tokens, which
   * carry no power because the DAO never goes Live.
   */
  refund({ list_id, claimer }: { list_id: number; claimer: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<Result<bigint, Error>>>;
  /**
   * Manager-only early handoff: the admin moves to the Treasury and the
   * module stays in Setup, so no list can be opened and no upgrade applied
   * until launch (`open_assurance` freezes the DAO this way).
   */
  handoff({ treasury }: { treasury: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * Advance the storage layout after an upgrade (admin only).
   */
  migrate(options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Move a list's escrow to the Treasury wired at construction. Anyone may
   * call it once the DAO is Live; `launch` calls it for the assurance list.
   * Returns the amount moved (0 when nothing is held).
   */
  release({ list_id }: { list_id: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<bigint, Error>>>;
  /**
   * Upgrade to a Manager-approved WASM (the admin: the launch admin in
   * Setup, the Treasury by proposal once handed over).
   */
  upgrade({ from_hash, to_hash }: { from_hash: Uint8Array; to_hash: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * The registry version of the running code.
   */
  version(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  get_list({ list_id }: { list_id: number }, options?: MethodOptions): Promise<AssembledTransaction<ClaimList | null>>;
  /**
   * A claimer's progress on a list (zero before their first claim).
   */
  get_claim({ list_id, claimer }: { list_id: number; claimer: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<ClaimRecord>>;
  /**
   * Open a list (the admin). Returns its id.
   *
   * - **Setup:** the list uses the configured payment asset and needs
   * artwork. A list with a price or assurance terms also needs the
   * Manager's authorization, so only `manager.open_assurance` opens one
   * and the Manager always records it; the launch admin alone opens only
   * free lists. At most one assurance list.
   * - **Live:** the Treasury, by proposal, with any asset and price, and no
   * assurance terms.
   *
   * `tree_uri` is the `ipfs://<cid>` of the full tree in the
   * `builder-stellar-merkle-v1` format. The chain cannot check it against
   * the root; consumers recompute the root from the file before claiming.
   */
  open_list({ root, tree_uri, asset, price, expires_at, total, assurance }: { root: Uint8Array; tree_uri: string; asset: string | Address; price: bigint; expires_at: bigint; total: number; assurance: AssuranceTerms | null }, options?: MethodOptions): Promise<AssembledTransaction<Result<number, Error>>>;
  wasm_hash(options?: MethodOptions): Promise<AssembledTransaction<Uint8Array>>;
  get_config(options?: MethodOptions): Promise<AssembledTransaction<ClaimsConfig>>;
  /**
   * The id the next list receives (the number of lists so far).
   */
  next_list_id(options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * `List(0..next_list_id)` from the instance counter, and the payment
   * asset (the escrow balance). `Claim(list, claimer)` records belong to
   * their claimers and are left out (holder class).
   */
  renewal_keys({ cursor, limit }: { cursor: number; limit: number }, options?: MethodOptions): Promise<AssembledTransaction<RenewalPage>>;
  /**
   * The asset Setup lists are priced in (`DaoModule::payment_asset`).
   */
  payment_asset(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * The assurance list, if one was opened.
   */
  assurance_list(options?: MethodOptions): Promise<AssembledTransaction<number | null>>;
  /**
   * The assurance list's state (`NotAssurance` for any other list).
   */
  assurance_state({ list_id }: { list_id: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<AssuranceState, Error>>>;
  /**
   * Storage-layout version of the data held by this contract.
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
      new Spec(["AAAABAAAAQhDbGFpbU1pbnRlciBlcnJvcnMgKGJsb2NrIGBjb21tb246OmVycm9yOjpjb2Rlczo6TUlOVEVSYCkuIEVycm9ycyByYWlzZWQgYnkKdGhlIHRva2VuIGR1cmluZyBhIG1pbnQgKGBBbGxvd2FuY2VFeGNlZWRlZGAsIHRoZSBiYXRjaCBidWRnZXQpIHByb3BhZ2F0ZQp1bmNoYW5nZWQgd2l0aCB0aGUgdG9rZW4ncyBjb2RlLiBDb2RlcyBvZiB0aGUgcmV0aXJlZCBzaGFyZWQgTWludGVyICg3ODAyLAo3ODA0LCA3ODExLCA3ODEzLCA3ODE0KSBhcmUgbm90IHJldXNlZC4AAAAAAAAAEENsYWltTWludGVyRXJyb3IAAAAXAAAALGB0b3RhbGAsIGBsZWFmX2Ftb3VudGAgb3IgYG1pbnRfbm93YCBpcyB6ZXJvAAAADUludmFsaWRBbW91bnQAAAAAAB55AAAASmBtaW50X25vd2AgYWJvdmUgYGNvbW1vbjo6TUFYX0JBVENIX01JTlRgIChjbGFpbSB0aGUgcmVzdCBpbiBhbm90aGVyIGNhbGwpAAAAAAANQmF0Y2hUb29MYXJnZQAAAAAAHnsAAAA1YG1pbnRfbm93YCBpcyBtb3JlIHRoYW4gaXMgbGVmdCBvZiB0aGUgY2xhaW1lcidzIGxlYWYAAAAAAAAOQWxyZWFkeUNsYWltZWQAAAAAHn8AAAAgTWVya2xlIHByb29mIHZlcmlmaWNhdGlvbiBmYWlsZWQAAAASTWVya2xlUHJvb2ZJbnZhbGlkAAAAAB6AAAAAIEFyaXRobWV0aWMgb3ZlcmZsb3cgaW4gdGhlIHByaWNlAAAADEludmFsaWRJbnB1dAAAHoEAAAAgYHJlbGVhc2VgIGJlZm9yZSB0aGUgREFPIGlzIExpdmUAAAAMVG9rZW5Ob3RMaXZlAAAeggAAAFVgdHJlZV91cmlgIGlzIGVtcHR5LCBsb25nZXIgdGhhbiBgY29tbW9uOjpNQVhfU1RSSU5HX0xFTkdUSGAsIG9yIG5vdAphbiBgaXBmczovL2AgVVJJAAAAAAAADkludmFsaWRUcmVlVXJpAAAAAB6EAAAAFE5vIGxpc3Qgd2l0aCB0aGlzIGlkAAAADExpc3ROb3RGb3VuZAAAHocAAAAiVGhlIGxpc3QncyBgZXhwaXJlc19hdGAgaGFzIHBhc3NlZAAAAAAAC0xpc3RFeHBpcmVkAAAAHogAAAAsVGhlIGNsYWltIHdvdWxkIG1pbnQgcGFzdCB0aGUgbGlzdCdzIGB0b3RhbGAAAAALTGlzdFNvbGRPdXQAAAAeiQAAADNUaGUgbGlzdCdzIHByaWNlIGlzIGFib3ZlIHRoZSBjbGFpbWVyJ3MgYG1heF9wcmljZWAAAAAADVByaWNlQWJvdmVNYXgAAAAAAB6KAAAAJ1RoZSBhc3N1cmFuY2UgbGlzdCBmYWlsZWQ6IHJlZnVuZHMgb25seQAAAAAPQXNzdXJhbmNlRmFpbGVkAAAAHosAAAAfVGhlIGxpc3QgaGFzIG5vIGFzc3VyYW5jZSB0ZXJtcwAAAAAMTm90QXNzdXJhbmNlAAAejAAAAC5Bc3N1cmFuY2UgdGVybXMgYXJlIG9ubHkgYWxsb3dlZCBiZWZvcmUgbGF1bmNoAAAAAAATQXNzdXJhbmNlTm90QWxsb3dlZAAAAB6NAAAAL1RoaXMgQ2xhaW1NaW50ZXIgYWxyZWFkeSBoYXMgaXRzIGFzc3VyYW5jZSBsaXN0AAAAAA9Bc3N1cmFuY2VFeGlzdHMAAAAejgAAACZgcmVmdW5kYCBvbiBhIGxpc3QgdGhhdCBoYXMgbm90IGZhaWxlZAAAAAAACU5vdEZhaWxlZAAAAAAAHo8AAAAtYHJlZnVuZGAgZm9yIGEgY2xhaW1lciB3aXRoIG5vdGhpbmcgaW4gZXNjcm93AAAAAAAAD05vdGhpbmdUb1JlZnVuZAAAAB6QAAAARFRocmVzaG9sZCBvZiB6ZXJvLCBvciBhIGRlYWRsaW5lIG5vdCBhZnRlciBub3cgb3IgYWZ0ZXIgYGV4cGlyZXNfYXRgAAAAEEludmFsaWRBc3N1cmFuY2UAAB6RAAAAQkxpc3RzIG9wZW5lZCBiZWZvcmUgbGF1bmNoIG5lZWQgYXJ0d29yayAoYHByb3BlcnRpZXNfY291bnQoKSA+IDBgKQAAAAAADkFydHdvcmtNaXNzaW5nAAAAAB6SAAAAQUEgbGlzdCBvcGVuZWQgYmVmb3JlIGxhdW5jaCBtdXN0IHVzZSB0aGUgY29uZmlndXJlZCBwYXltZW50IGFzc2V0AAAAAAAAFFBheW1lbnRBc3NldE1pc21hdGNoAAAekwAAAA5OZWdhdGl2ZSBwcmljZQAAAAAADEludmFsaWRQcmljZQAAHpQAAAAeYGV4cGlyZXNfYXRgIG5vdCBpbiB0aGUgZnV0dXJlAAAAAAANSW52YWxpZEV4cGlyeQAAAAAAHpUAAABIYGxhdW5jaGAgLyBgaGFuZG9mZmAgdHJlYXN1cnkgZGlmZmVycyBmcm9tIHRoZSBvbmUgd2lyZWQgYXQgY29uc3RydWN0aW9uAAAAEFRyZWFzdXJ5TWlzbWF0Y2gAAB6W", "AAAABQAAAENBIGNsYWltOiBgYW1vdW50YCB0b2tlbnMgbWludGVkIGZyb20gYGZpcnN0X3Rva2VuX2lkYCB0byBgY2xhaW1lcmAuAAAAAAAAAAAHQ2xhaW1lZAAAAAABAAAAB2NsYWltZWQAAAAABwAAAAAAAAAHbGlzdF9pZAAAAAAEAAAAAQAAAAAAAAAHY2xhaW1lcgAAAAATAAAAAQAAAAAAAAAGYW1vdW50AAAAAAAEAAAAAAAAAAAAAAAOZmlyc3RfdG9rZW5faWQAAAAAAAQAAAAAAAAAKVBhaWQgZm9yIHRoaXMgY2xhaW0sIGluIHRoZSBsaXN0J3MgYXNzZXQuAAAAAAAABHBhaWQAAAALAAAAAAAAAFtXaGV0aGVyIHRoZSBwYXltZW50IHdlbnQgdG8gZXNjcm93IChhc3N1cmFuY2UgbGlzdCBiZWZvcmUgbGF1bmNoKQpyYXRoZXIgdGhhbiB0aGUgVHJlYXN1cnkuAAAAAAhlc2Nyb3dlZAAAAAEAAAAAAAAAMlRoZSBjbGFpbWVyJ3MgdG90YWwgb24gdGhpcyBsaXN0IGFmdGVyIHRoaXMgY2xhaW0uAAAAAAAHY2xhaW1lZAAAAAAEAAAAAAAAAAI=", "AAAABQAAAC1BIGZhaWxlZCBsaXN0J3MgZXNjcm93IHJldHVybmVkIHRvIGEgY2xhaW1lci4AAAAAAAAAAAAACFJlZnVuZGVkAAAAAQAAAAhyZWZ1bmRlZAAAAAMAAAAAAAAAB2xpc3RfaWQAAAAABAAAAAEAAAAAAAAAB2NsYWltZXIAAAAAEwAAAAEAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAC", "AAAABQAAAElBIGxpc3Qgb3BlbmVkOiBpdHMgcm9vdCwgd2hlcmUgdGhlIGZ1bGwgdHJlZSBpcyBwdWJsaXNoZWQsIGFuZCBpdHMgdGVybXMuAAAAAAAAAAAAAApMaXN0T3BlbmVkAAAAAAABAAAAC2xpc3Rfb3BlbmVkAAAAAAgAAAAAAAAAB2xpc3RfaWQAAAAABAAAAAEAAAAAAAAABHJvb3QAAAPuAAAAIAAAAAAAAAAAAAAACHRyZWVfdXJpAAAAEAAAAAAAAAAAAAAABWFzc2V0AAAAAAAAEwAAAAAAAAAAAAAABXByaWNlAAAAAAAACwAAAAAAAAAAAAAACmV4cGlyZXNfYXQAAAAAAAYAAAAAAAAAAAAAAAV0b3RhbAAAAAAAAAQAAAAAAAAAAAAAAAlhc3N1cmFuY2UAAAAAAAPoAAAH0AAAAA5Bc3N1cmFuY2VUZXJtcwAAAAAAAAAAAAI=", "AAAABQAAADdUaGUgYXNzdXJhbmNlIGVzY3JvdyBtb3ZlZCB0byB0aGUgVHJlYXN1cnkgKGF0IGxhdW5jaCkuAAAAAAAAAAAORXNjcm93UmVsZWFzZWQAAAAAAAEAAAAPZXNjcm93X3JlbGVhc2VkAAAAAAMAAAAAAAAAB2xpc3RfaWQAAAAABAAAAAEAAAAAAAAACHRyZWFzdXJ5AAAAEwAAAAAAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAC", "AAAABQAAADtgPE1vZHVsZT5MYXVuY2hlZGA6IHRoZSBDbGFpbU1pbnRlciB3ZW50IExpdmUgd2l0aCB0aGUgREFPLgAAAAAAAAAAE0NsYWltTWludGVyTGF1bmNoZWQAAAAAAQAAABVjbGFpbV9taW50ZXJfbGF1bmNoZWQAAAAAAAABAAAAAAAAAAh0cmVhc3VyeQAAABMAAAABAAAAAg==", "AAAAAQAAADxPbmUgY2xhaW0gbGlzdDogYSBtZXJrbGUgcm9vdCBvZiBgKGNsYWltZXIsIGFtb3VudClgIGxlYXZlcy4AAAAAAAAACUNsYWltTGlzdAAAAAAAAAsAAAAAAAAABWFzc2V0AAAAAAAAEwAAAC5EaXN0aW5jdCBhZGRyZXNzZXMgdGhhdCBjbGFpbWVkIGF0IGxlYXN0IG9uY2UuAAAAAAAIY2xhaW1lcnMAAAAEAAAAAAAAAAhkZWFkbGluZQAAAAYAAAA6UGF5bWVudHMgaGVsZCB1bnRpbCBsYXVuY2ggKGFzc3VyYW5jZSBsaXN0IGluIFNldHVwIG9ubHkpLgAAAAAABmVzY3JvdwAAAAAACwAAACVDbGFpbXMgc3RvcCBhdCB0aGlzIGxlZGdlciB0aW1lc3RhbXAuAAAAAAAACmV4cGlyZXNfYXQAAAAAAAYAAAAAAAAABm1pbnRlZAAAAAAABAAAAC5QcmljZSBwZXIgdG9rZW4gaW4gYGFzc2V0YCwgMCBmb3IgYSBmcmVlIGxpc3QuAAAAAAAFcHJpY2UAAAAAAAALAAAAAAAAAARyb290AAAD7gAAACAAAABXQXNzdXJhbmNlIHRlcm1zLCBmbGF0dGVuZWQ6IGEgdGhyZXNob2xkIG9mIDAgbWVhbnMgbm9uZSAoc2VlCltgQ2xhaW1MaXN0Ojphc3N1cmFuY2VgXSkuAAAAABJ0aHJlc2hvbGRfY2xhaW1lcnMAAAAAAAQAAAAwTW9zdCB0b2tlbnMgdGhpcyBsaXN0IG1pbnRzIGFjcm9zcyBhbGwgY2xhaW1lcnMuAAAABXRvdGFsAAAAAAAABAAAAIRgaXBmczovLzxjaWQ+YCBvZiB0aGUgZnVsbCB0cmVlIChgYnVpbGRlci1zdGVsbGFyLW1lcmtsZS12MWApLiBBIGhpbnQ6CmNvbnN1bWVycyByZWNvbXB1dGUgdGhlIHJvb3QgZnJvbSBpdCBiZWZvcmUgb2ZmZXJpbmcgYSBjbGFpbS4AAAAIdHJlZV91cmkAAAAQ", "AAAAAQAAACFBIGNsYWltZXIncyBwcm9ncmVzcyBvbiBvbmUgbGlzdC4AAAAAAAAAAAAAC0NsYWltUmVjb3JkAAAAAAIAAAAvVG9rZW5zIGNsYWltZWQgc28gZmFyLCBhdCBtb3N0IHRoZSBsZWFmIGFtb3VudC4AAAAAB2NsYWltZWQAAAAABAAAAEBQYXltZW50cyBpbiBlc2Nyb3cgZm9yIHRoaXMgY2xhaW1lciAocmVmdW5kYWJsZSB3aGlsZSBgRmFpbGVkYCkuAAAACGVzY3Jvd2VkAAAACw==", "AAAAAQAAAB1XaXJpbmcgZml4ZWQgYXQgY29uc3RydWN0aW9uLgAAAAAAAAAAAAAMQ2xhaW1zQ29uZmlnAAAABAAAAG5SZWdpc3RyeSBmb3IgYHZlcnNpb24oKWAgYW5kIHVwZ3JhZGUgYXBwcm92YWxzOyB0aGUgb25seSBjYWxsZXIgb2YKYGxhdW5jaGAsIGBoYW5kb2ZmYCBhbmQgYHJlY292ZXJ5X3VwZ3JhZGVgLgAAAAAAB21hbmFnZXIAAAAAEwAAAJJUaGUgYXNzZXQgZXZlcnkgbGlzdCBvcGVuZWQgaW4gU2V0dXAgaXMgcHJpY2VkIGluIChgQ2xhaW1zQ29uZmlnYCBhdApgY3JlYXRlX2Rhb2AgLyBgY3JlYXRlX21vZHVsZWApLiBMaXN0cyBvcGVuZWQgYWZ0ZXIgbGF1bmNoIG1heSB1c2UgYW55CmFzc2V0LgAAAAAADXBheW1lbnRfYXNzZXQAAAAAAAATAAAAAAAAAAV0b2tlbgAAAAAAABMAAAB/UmVjZWl2ZXMgZXZlcnkgcGF5bWVudCBvbmNlIHRoZSBEQU8gaXMgTGl2ZSwgYW5kIHRoZSBhc3N1cmFuY2UgZXNjcm93CmF0IGxhdW5jaC4gRml4ZWQgaGVyZSwgc28gbm9ib2R5IGNhbiByZWRpcmVjdCB0aGUgZXNjcm93LgAAAAAIdHJlYXN1cnkAAAAT", "AAAAAAAAAEdNb2R1bGUgYWRtaW46IHRoZSBsYXVuY2ggYWRtaW4gaW4gU2V0dXAsIHRoZSBUcmVhc3VyeSBvbmNlIGhhbmRlZCBvdmVyLgAAAAAFYWRtaW4AAAAAAAAAAAAAAQAAABM=", "AAAAAAAAAh5DbGFpbSBgbWludF9ub3dgIHRva2VucyBvZiB0aGUgbGVhZiBgKGNsYWltZXIsIGxlYWZfYW1vdW50KWAuCgpUaGUgcHJvb2YgY292ZXJzIHRoZSBmdWxsIGxlYWY7IGEgY2xhaW1lciBtYXkgY2xhaW0gaXQgaW4gcGFydHMsCmF0IG1vc3QgYGNvbW1vbjo6TUFYX0JBVENIX01JTlRgIHRva2VucyBwZXIgY2FsbC4gRWFjaCBjbGFpbSBwYXlzCmBwcmljZSDDlyBtaW50X25vd2AgaW4gdGhlIGxpc3QncyBhc3NldDogaW50byBlc2Nyb3cgb24gdGhlIGFzc3VyYW5jZQpsaXN0IGJlZm9yZSBsYXVuY2gsIG90aGVyd2lzZSB0byB0aGUgVHJlYXN1cnkuIGBtYXhfcHJpY2VgIGJvdW5kcyB0aGUKdW5pdCBwcmljZSB0aGUgY2xhaW1lciBhY2NlcHRzLiBSZXR1cm5zIHRoZSBtaW50ZWQgdG9rZW4gaWRzLgoKVGhlIGxlYWYgaXMgYHNoYTI1NihjbGFpbWVyX3hkciB8fCBsZWFmX2Ftb3VudF9iZV91MTI4KWA7IGludGVybmFsCm5vZGVzIGFyZSBgc2hhMjU2KG1pbihhLCBiKSB8fCBtYXgoYSwgYikpYCwgc28gcHJvb2ZzIGNhcnJ5IG5vCmRpcmVjdGlvbiBiaXRzLgAAAAAABWNsYWltAAAAAAAABgAAAAAAAAAHbGlzdF9pZAAAAAAEAAAAAAAAAAdjbGFpbWVyAAAAABMAAAAAAAAAC2xlYWZfYW1vdW50AAAAAAoAAAAAAAAACG1pbnRfbm93AAAABAAAAAAAAAAFcHJvb2YAAAAAAAPqAAAD7gAAACAAAAAAAAAACW1heF9wcmljZQAAAAAAAAsAAAABAAAD6QAAA+oAAAAEAAAAAw==", "AAAAAAAAASVTZXR1cCAtPiBMaXZlLCBjYWxsZWQgYnkgdGhlIE1hbmFnZXIgaW4gdGhlIGxhdW5jaCB0cmFuc2FjdGlvbiwgYWZ0ZXIKdGhlIFRva2VuIGlzIExpdmUuIEhhbmRzIHRoZSBhZG1pbiB0byB0aGUgVHJlYXN1cnkgdW5sZXNzIGBoYW5kb2ZmYAphbHJlYWR5IGRpZCwgYW5kIHJlbGVhc2VzIHRoZSBhc3N1cmFuY2UgZXNjcm93IHRvIHRoZSBUcmVhc3VyeSwgc28gdGhlCmZlZXMgYXJyaXZlIHdpdGggdGhlIGxhdW5jaCAoZW5nIHJldmlldyBSNCkuIGBvcGVuYCBpcyBpZ25vcmVkOiBsaXN0cwpoYXZlIG5vIHBhdXNlLgAAAAAAAAZsYXVuY2gAAAAAAAIAAAAAAAAACHRyZWFzdXJ5AAAAEwAAAAAAAAAEb3BlbgAAAAEAAAABAAAD6QAAAAIAAAAD", "AAAAAAAAALlSZXR1cm4gYSBjbGFpbWVyJ3MgZXNjcm93IGZyb20gYSBgRmFpbGVkYCBsaXN0LiBBbnlvbmUgbWF5IGNhbGwgaXQ7CnRoZSBmdW5kcyBnbyBvbmx5IHRvIHRoZSBjbGFpbWVyLiBUaGUgY2xhaW1lciBrZWVwcyB0aGUgdG9rZW5zLCB3aGljaApjYXJyeSBubyBwb3dlciBiZWNhdXNlIHRoZSBEQU8gbmV2ZXIgZ29lcyBMaXZlLgAAAAAAAAZyZWZ1bmQAAAAAAAIAAAAAAAAAB2xpc3RfaWQAAAAABAAAAAAAAAAHY2xhaW1lcgAAAAATAAAAAQAAA+kAAAALAAAAAw==", "AAAAAAAAAMRNYW5hZ2VyLW9ubHkgZWFybHkgaGFuZG9mZjogdGhlIGFkbWluIG1vdmVzIHRvIHRoZSBUcmVhc3VyeSBhbmQgdGhlCm1vZHVsZSBzdGF5cyBpbiBTZXR1cCwgc28gbm8gbGlzdCBjYW4gYmUgb3BlbmVkIGFuZCBubyB1cGdyYWRlIGFwcGxpZWQKdW50aWwgbGF1bmNoIChgb3Blbl9hc3N1cmFuY2VgIGZyZWV6ZXMgdGhlIERBTyB0aGlzIHdheSkuAAAAB2hhbmRvZmYAAAAAAQAAAAAAAAAIdHJlYXN1cnkAAAATAAAAAQAAA+kAAAACAAAAAw==", "AAAAAAAAADlBZHZhbmNlIHRoZSBzdG9yYWdlIGxheW91dCBhZnRlciBhbiB1cGdyYWRlIChhZG1pbiBvbmx5KS4AAAAAAAAHbWlncmF0ZQAAAAAAAAAAAA==", "AAAAAAAAAMFNb3ZlIGEgbGlzdCdzIGVzY3JvdyB0byB0aGUgVHJlYXN1cnkgd2lyZWQgYXQgY29uc3RydWN0aW9uLiBBbnlvbmUgbWF5CmNhbGwgaXQgb25jZSB0aGUgREFPIGlzIExpdmU7IGBsYXVuY2hgIGNhbGxzIGl0IGZvciB0aGUgYXNzdXJhbmNlIGxpc3QuClJldHVybnMgdGhlIGFtb3VudCBtb3ZlZCAoMCB3aGVuIG5vdGhpbmcgaXMgaGVsZCkuAAAAAAAAB3JlbGVhc2UAAAAAAQAAAAAAAAAHbGlzdF9pZAAAAAAEAAAAAQAAA+kAAAALAAAAAw==", "AAAAAAAAAHVVcGdyYWRlIHRvIGEgTWFuYWdlci1hcHByb3ZlZCBXQVNNICh0aGUgYWRtaW46IHRoZSBsYXVuY2ggYWRtaW4gaW4KU2V0dXAsIHRoZSBUcmVhc3VyeSBieSBwcm9wb3NhbCBvbmNlIGhhbmRlZCBvdmVyKS4AAAAAAAAHdXBncmFkZQAAAAACAAAAAAAAAAlmcm9tX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAHdG9faGFzaAAAAAPuAAAAIAAAAAA=", "AAAAAAAAAClUaGUgcmVnaXN0cnkgdmVyc2lvbiBvZiB0aGUgcnVubmluZyBjb2RlLgAAAAAAAAd2ZXJzaW9uAAAAAAAAAAABAAAAEA==", "AAAAAAAAAAAAAAAIZ2V0X2xpc3QAAAABAAAAAAAAAAdsaXN0X2lkAAAAAAQAAAABAAAD6AAAB9AAAAAJQ2xhaW1MaXN0AAAA", "AAAAAAAAAD9BIGNsYWltZXIncyBwcm9ncmVzcyBvbiBhIGxpc3QgKHplcm8gYmVmb3JlIHRoZWlyIGZpcnN0IGNsYWltKS4AAAAACWdldF9jbGFpbQAAAAAAAAIAAAAAAAAAB2xpc3RfaWQAAAAABAAAAAAAAAAHY2xhaW1lcgAAAAATAAAAAQAAB9AAAAALQ2xhaW1SZWNvcmQA", "AAAAAAAAAnpPcGVuIGEgbGlzdCAodGhlIGFkbWluKS4gUmV0dXJucyBpdHMgaWQuCgotICoqU2V0dXA6KiogdGhlIGxpc3QgdXNlcyB0aGUgY29uZmlndXJlZCBwYXltZW50IGFzc2V0IGFuZCBuZWVkcwphcnR3b3JrLiBBIGxpc3Qgd2l0aCBhIHByaWNlIG9yIGFzc3VyYW5jZSB0ZXJtcyBhbHNvIG5lZWRzIHRoZQpNYW5hZ2VyJ3MgYXV0aG9yaXphdGlvbiwgc28gb25seSBgbWFuYWdlci5vcGVuX2Fzc3VyYW5jZWAgb3BlbnMgb25lCmFuZCB0aGUgTWFuYWdlciBhbHdheXMgcmVjb3JkcyBpdDsgdGhlIGxhdW5jaCBhZG1pbiBhbG9uZSBvcGVucyBvbmx5CmZyZWUgbGlzdHMuIEF0IG1vc3Qgb25lIGFzc3VyYW5jZSBsaXN0LgotICoqTGl2ZToqKiB0aGUgVHJlYXN1cnksIGJ5IHByb3Bvc2FsLCB3aXRoIGFueSBhc3NldCBhbmQgcHJpY2UsIGFuZCBubwphc3N1cmFuY2UgdGVybXMuCgpgdHJlZV91cmlgIGlzIHRoZSBgaXBmczovLzxjaWQ+YCBvZiB0aGUgZnVsbCB0cmVlIGluIHRoZQpgYnVpbGRlci1zdGVsbGFyLW1lcmtsZS12MWAgZm9ybWF0LiBUaGUgY2hhaW4gY2Fubm90IGNoZWNrIGl0IGFnYWluc3QKdGhlIHJvb3Q7IGNvbnN1bWVycyByZWNvbXB1dGUgdGhlIHJvb3QgZnJvbSB0aGUgZmlsZSBiZWZvcmUgY2xhaW1pbmcuAAAAAAAJb3Blbl9saXN0AAAAAAAABwAAAAAAAAAEcm9vdAAAA+4AAAAgAAAAAAAAAAh0cmVlX3VyaQAAABAAAAAAAAAABWFzc2V0AAAAAAAAEwAAAAAAAAAFcHJpY2UAAAAAAAALAAAAAAAAAApleHBpcmVzX2F0AAAAAAAGAAAAAAAAAAV0b3RhbAAAAAAAAAQAAAAAAAAACWFzc3VyYW5jZQAAAAAAA+gAAAfQAAAADkFzc3VyYW5jZVRlcm1zAAAAAAABAAAD6QAAAAQAAAAD", "AAAAAAAAAAAAAAAJd2FzbV9oYXNoAAAAAAAAAAAAAAEAAAPuAAAAIA==", "AAAAAAAAAAAAAAAKZ2V0X2NvbmZpZwAAAAAAAAAAAAEAAAfQAAAADENsYWltc0NvbmZpZw==", "AAAAAAAAADtUaGUgaWQgdGhlIG5leHQgbGlzdCByZWNlaXZlcyAodGhlIG51bWJlciBvZiBsaXN0cyBzbyBmYXIpLgAAAAAMbmV4dF9saXN0X2lkAAAAAAAAAAEAAAAE", "AAAAAAAAALdgTGlzdCgwLi5uZXh0X2xpc3RfaWQpYCBmcm9tIHRoZSBpbnN0YW5jZSBjb3VudGVyLCBhbmQgdGhlIHBheW1lbnQKYXNzZXQgKHRoZSBlc2Nyb3cgYmFsYW5jZSkuIGBDbGFpbShsaXN0LCBjbGFpbWVyKWAgcmVjb3JkcyBiZWxvbmcgdG8KdGhlaXIgY2xhaW1lcnMgYW5kIGFyZSBsZWZ0IG91dCAoaG9sZGVyIGNsYXNzKS4AAAAADHJlbmV3YWxfa2V5cwAAAAIAAAAAAAAABmN1cnNvcgAAAAAABAAAAAAAAAAFbGltaXQAAAAAAAAEAAAAAQAAB9AAAAALUmVuZXdhbFBhZ2UA", "AAAAAAAAASgqIGBhZG1pbmAgLSB0aGUgbGF1bmNoIGFkbWluIGluIFNldHVwOyB0aGUgVHJlYXN1cnkgb25jZSBMaXZlCiogYHRva2VuYCAvIGB0cmVhc3VyeWAgLSB0aGUgREFPJ3MgVG9rZW4gYW5kIFRyZWFzdXJ5IChmaXhlZCkKKiBgbWFuYWdlcmAgLSB0aGUgTWFuYWdlcjogcmVnaXN0cnksIGxhdW5jaGVyIGFuZCByZWNvdmVyeSBjYWxsZXIKKiBgcGF5bWVudF9hc3NldGAgLSB0aGUgYXNzZXQgU2V0dXAgbGlzdHMgYXJlIHByaWNlZCBpbgoqIGBjdXJyZW50X2hhc2hgIC0gdGhpcyBpbXBsZW1lbnRhdGlvbidzIFdBU00gaGFzaAAAAA1fX2NvbnN0cnVjdG9yAAAAAAAABgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAACHRyZWFzdXJ5AAAAEwAAAAAAAAAHbWFuYWdlcgAAAAATAAAAAAAAAA1wYXltZW50X2Fzc2V0AAAAAAAAEwAAAAAAAAAMY3VycmVudF9oYXNoAAAD7gAAACAAAAAA", "AAAAAAAAAEFUaGUgYXNzZXQgU2V0dXAgbGlzdHMgYXJlIHByaWNlZCBpbiAoYERhb01vZHVsZTo6cGF5bWVudF9hc3NldGApLgAAAAAAAA1wYXltZW50X2Fzc2V0AAAAAAAAAAAAAAEAAAAT", "AAAAAAAAACZUaGUgYXNzdXJhbmNlIGxpc3QsIGlmIG9uZSB3YXMgb3BlbmVkLgAAAAAADmFzc3VyYW5jZV9saXN0AAAAAAAAAAAAAQAAA+gAAAAE", "AAAAAAAAAD9UaGUgYXNzdXJhbmNlIGxpc3QncyBzdGF0ZSAoYE5vdEFzc3VyYW5jZWAgZm9yIGFueSBvdGhlciBsaXN0KS4AAAAAD2Fzc3VyYW5jZV9zdGF0ZQAAAAABAAAAAAAAAAdsaXN0X2lkAAAAAAQAAAABAAAD6QAAB9AAAAAOQXNzdXJhbmNlU3RhdGUAAAAAAAM=", "AAAAAAAAADlTdG9yYWdlLWxheW91dCB2ZXJzaW9uIG9mIHRoZSBkYXRhIGhlbGQgYnkgdGhpcyBjb250cmFjdC4AAAAAAAAPc3RvcmFnZV92ZXJzaW9uAAAAAAAAAAABAAAABA==", "AAAAAAAAAdlNYW5hZ2VyLW9ubHkgdXBncmFkZSBvZiBhIGZyb3plbiBDbGFpbU1pbnRlciwgZm9yIGEgZmFpbGVkIGRyaXZlIHdob3NlCnJlZnVuZHMgYXJlIGJyb2tlbiAoYG1hbmFnZXIucmVjb3Zlcl9jbGFpbXNgLCByZXZpZXcgQjIpLiBJdCBjaGVja3Mgb25seQp0aGUgTWFuYWdlcidzIGF1dGhvcml6YXRpb24gYW5kIHRoYXQgdGhlIG1vZHVsZSBpcyBzdGlsbCBpbiBTZXR1cCwgbm90CnRoaXMgY29udHJhY3QncyBvd24gc3RhdGUgbWFjaGluZSwgd2hpY2ggbWF5IGJlIHRoZSBicm9rZW4gY29kZTsgdGhlCk1hbmFnZXIgZGVjaWRlcyB0aGF0IHRoZSBkcml2ZSBmYWlsZWQuIFRoZSBNYW5hZ2VyIGhhcyBhbHJlYWR5IGNoZWNrZWQKdGhlIHJlZ2lzdHJ5IGFwcHJvdmFsIGZvciB0aGlzIGhhc2ggYW5kIHBhc3NlcyBgdmVyc2lvbmAsIGJlY2F1c2UgYXNraW5nCml0IGJhY2sgZnJvbSBoZXJlIHdvdWxkIGJlIGNvbnRyYWN0IHJlLWVudHJ5LgAAAAAAABByZWNvdmVyeV91cGdyYWRlAAAAAwAAAAAAAAAJZnJvbV9oYXNoAAAAAAAD7gAAACAAAAAAAAAAB3RvX2hhc2gAAAAD7gAAACAAAAAAAAAAB3ZlcnNpb24AAAAAEAAAAAA=", "AAAABQAAAKtFbWl0dGVkIGJ5IFtgaGFuZG9mZmBdLiBUaGUgZW1pdHRpbmcgY29udHJhY3QgYWRkcmVzcyBpcyB0aGUgZXZlbnQncyBjb250cmFjdCBpZC4KClNhbWUgc2hhcGUgYXMgdGhlIE1hbmFnZXIncyBvd24gYEFkbWluQ2hhbmdlZGAsIHNvIGluZGV4ZXJzIGRlY29kZSBib3RoCndpdGggb25lIHNjaGVtYS4AAAAAAAAAAAxBZG1pbkNoYW5nZWQAAAABAAAADWFkbWluX2NoYW5nZWQAAAAAAAACAAAAAAAAAAlvbGRfYWRtaW4AAAAAAAATAAAAAQAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAEAAAAC", "AAAABAAAAD5FcnJvcnMgc2hhcmVkIGJ5IGFsbCBtb2R1bGUgY29udHJhY3RzIChibG9jayBgY29kZXM6OkNPTU1PTmApLgAAAAAAAAAAAAtDb21tb25FcnJvcgAAAAANAAAANE9wZXJhdGlvbiByZXF1aXJlcyB0aGUgbW9kdWxlIHRvIGJlIGxpdmUgKGxhdW5jaGVkKS4AAAAHTm90TGl2ZQAAABtZAAAAQU9wZXJhdGlvbiBpcyBvbmx5IHZhbGlkIGR1cmluZyBzZXR1cDsgdGhlIG1vZHVsZSBpcyBhbHJlYWR5IGxpdmUuAAAAAAAAC0FscmVhZHlMaXZlAAAAG1oAAAAlTWFuYWdlciBhZGRyZXNzIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAAAAA1NYW5hZ2VyTm90U2V0AAAAAAAbWwAAACNgQ3VycmVudEhhc2hgIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAARQ3VycmVudEhhc2hOb3RTZXQAAAAAABtcAAAANGBmcm9tX2hhc2hgIGRvZXMgbm90IGVxdWFsIHRoZSBzdG9yZWQgYEN1cnJlbnRIYXNoYC4AAAAMSGFzaE1pc21hdGNoAAAbXQAAACpNYW5hZ2VyIGRpZCBub3QgYXBwcm92ZSB0aGlzIHVwZ3JhZGUgcGF0aC4AAAAAABJVcGdyYWRlTm90QXBwcm92ZWQAAAAAG14AAAA1TWFuYWdlciBoYXMgbm8gcmVnaXN0cnkgZW50cnkgZm9yIHRoZSByZXF1ZXN0ZWQgaGFzaC4AAAAAAAAWSW1wbGVtZW50YXRpb25Ob3RGb3VuZAAAAAAbXwAAACJNb2R1bGUgYWRtaW4gbWlzc2luZyBmcm9tIHN0b3JhZ2UuAAAAAAALQWRtaW5Ob3RTZXQAAAAbYAAAAD9UaGUgTWFuYWdlcidzIG93biBgQ3VycmVudE1hbmFnZXJWZXJzaW9uYCBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAADVZlcnNpb25Ob3RTZXQAAAAAABthAAAAJlRyZWFzdXJ5IGFkZHJlc3MgbWlzc2luZyBmcm9tIHN0b3JhZ2UuAAAAAAAOVHJlYXN1cnlOb3RTZXQAAAAAG2IAAAAmR292ZXJub3IgYWRkcmVzcyBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAAAA5Hb3Zlcm5vck5vdFNldAAAAAAbYwAAADxgbWlncmF0ZWAgY2FsbGVkIHdoaWxlIHRoZSBzdG9yZWQgbGF5b3V0IGlzIGFscmVhZHkgY3VycmVudC4AAAAQTm90aGluZ1RvTWlncmF0ZQAAG2QAAAAmYFN0b3JhZ2VWZXJzaW9uYCBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAAABRTdG9yYWdlVmVyc2lvbk5vdFNldAAAG2U=", "AAAAAQAAACZPbmUgcGFnZSBvZiBgRGFvTW9kdWxlOjpyZW5ld2FsX2tleXNgLgAAAAAAAAAAAAtSZW5ld2FsUGFnZQAAAAADAAAAmUFzc2V0IGNvbnRyYWN0cyAodGhlIERBTyB0b2tlbiBpbmNsdWRlZCkgd2hvc2UgYEJhbGFuY2UobW9kdWxlKWAgZW50cnkKdGhlIG1vZHVsZSBob2xkcy4gUmVwb3J0ZWQgb24gdGhlIGZpcnN0IHBhZ2U7IGxhdGVyIHBhZ2VzIG1heSByZXBlYXQKb3Igb21pdCB0aGVtLgAAAAAAAAZhc3NldHMAAAAAA+oAAAATAAAB9GAoa2V5LCBwZXJzaXN0ZW50KWAgZm9yIGVhY2ggc3RvcmFnZSBlbnRyeSB0aGUgbW9kdWxlIGFza3MgdGhlIHN3ZWVwCnRvIGtlZXAgYWxpdmUuIGBrZXlgIGlzIHRoZSBleGFjdCBgVmFsYCB0aGUgbW9kdWxlIHN0b3JlcyB1bmRlciwKYWxyZWFkeSBuYW1lc3BhY2VkIChgY3JhdGU6Om5zYCksIHNvIHRoZSBzd2VlcCBidWlsZHMKYExlZGdlcktleTo6Q29udHJhY3REYXRhIHsgY29udHJhY3Q6IG1vZHVsZSwga2V5LCBkdXJhYmlsaXR5IH1gIGZyb20gaXQKZGlyZWN0bHk7IGBwZXJzaXN0ZW50YCBpcyBmYWxzZSBmb3IgdGVtcG9yYXJ5IGVudHJpZXMuIEluc3RhbmNlIGVudHJpZXMKYXJlIG5vdCBsaXN0ZWQ6IHRoZSBzd2VlcCByZW5ld3MgZXZlcnkgbW9kdWxlJ3MgaW5zdGFuY2UuIEEga2V5IG1heSBuYW1lCmFuIGVudHJ5IHRoYXQgZG9lcyBub3QgZXhpc3QgKGEgbGlzdGluZyBzbG90IG5vYm9keSB1c2VkKTsgdGhlIHN3ZWVwCnJlbmV3cyBvbmx5IHdoYXQgaXQgZmluZHMuAAAABGtleXMAAAPqAAAD7QAAAAIAAAAAAAAAAQAAADBDdXJzb3Igb2YgdGhlIG5leHQgcGFnZSwgYE5vbmVgIG9uIHRoZSBsYXN0IG9uZS4AAAALbmV4dF9jdXJzb3IAAAAD6AAAAAQ=", "AAAAAgAAADJgYXNzdXJhbmNlX3N0YXRlYCBvZiBhIENsYWltTWludGVyIGFzc3VyYW5jZSBsaXN0LgAAAAAAAAAAAA5Bc3N1cmFuY2VTdGF0ZQAAAAAAAwAAAAAAAABARmV3ZXIgZGlzdGluY3QgY2xhaW1lcnMgdGhhbiB0aGUgdGhyZXNob2xkLCBkZWFkbGluZSBub3QgcGFzc2VkLgAAAARPcGVuAAAAAAAAAEBUaGUgdGhyZXNob2xkIGlzIHJlYWNoZWQ7IHRoZSBEQU8gbWF5IGxhdW5jaCB1bnRpbCB0aGUgZGVhZGxpbmUuAAAAA01ldAAAAAAAAAAAOlRoZSBkZWFkbGluZSBwYXNzZWQgYW5kIHRoZSBEQU8gaXMgbm90IExpdmU6IHJlZnVuZHMgb25seS4AAAAAAAZGYWlsZWQAAA==", "AAAAAQAAAEdXaGF0IGEgQ2xhaW1NaW50ZXIgYXNzdXJhbmNlIGxpc3QgbXVzdCByZWFjaCwgYW5kIGJ5IHdoZW4gKGRlc2lnbiDCpzMpLgAAAAAAAAAADkFzc3VyYW5jZVRlcm1zAAAAAAACAAAAQkxlZGdlciB0aW1lc3RhbXAgYWZ0ZXIgd2hpY2ggYW4gdW5sYXVuY2hlZCBEQU8ncyBsaXN0IGlzIGBGYWlsZWRgLgAAAAAACGRlYWRsaW5lAAAABgAAACNEaXN0aW5jdCBjbGFpbWVycyBuZWVkZWQgZm9yIGBNZXRgLgAAAAASdGhyZXNob2xkX2NsYWltZXJzAAAAAAAE", "AAAABQAAABVFbWl0dGVkIGJ5IGBtaWdyYXRlYC4AAAAAAAAAAAAACE1pZ3JhdGVkAAAAAQAAAAhtaWdyYXRlZAAAAAIAAAAAAAAAFGZyb21fc3RvcmFnZV92ZXJzaW9uAAAABAAAAAAAAAAAAAAAEnRvX3N0b3JhZ2VfdmVyc2lvbgAAAAAABAAAAAAAAAAC", "AAAABQAAAE1FbWl0dGVkIGJ5IGBhcHBseWAuIFRoZSBlbWl0dGluZyBjb250cmFjdCBhZGRyZXNzIGlzIHRoZSBldmVudCdzIGNvbnRyYWN0IGlkLgAAAAAAAAAAAAAIVXBncmFkZWQAAAABAAAACHVwZ3JhZGVkAAAAAwAAAAAAAAAJZnJvbV9oYXNoAAAAAAAD7gAAACAAAAABAAAAAAAAAAd0b19oYXNoAAAAA+4AAAAgAAAAAQAAAAAAAAAHdmVyc2lvbgAAAAAQAAAAAAAAAAI="]),
      options
    );
  }

   static deploy<T = Client>({ admin, token, treasury, manager, payment_asset, current_hash }: { admin: string | Address; token: string | Address; treasury: string | Address; manager: string | Address; payment_asset: string | Address; current_hash: Uint8Array }, options: MethodOptions & Omit<ContractClientOptions, 'contractId'> & { salt?: Uint8Array; address?: string; } & ({ wasmHash: Uint8Array | string; format?: "hex" | "base64"; externalRef?: never; } | { externalRef: ExternalExecutableRef; wasmHash?: never; format?: never; })): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({ admin, token, treasury, manager, payment_asset, current_hash }, options);
  }
  public readonly fromJson = {
    admin : this.txFromJson<string>,  claim : this.txFromJson<Result<Array<number>, Error>>,  launch : this.txFromJson<Result<null, Error>>,  refund : this.txFromJson<Result<bigint, Error>>,  handoff : this.txFromJson<Result<null, Error>>,  migrate : this.txFromJson<void>,  release : this.txFromJson<Result<bigint, Error>>,  upgrade : this.txFromJson<void>,  version : this.txFromJson<string>,  get_list : this.txFromJson<ClaimList | null>,  get_claim : this.txFromJson<ClaimRecord>,  open_list : this.txFromJson<Result<number, Error>>,  wasm_hash : this.txFromJson<Uint8Array>,  get_config : this.txFromJson<ClaimsConfig>,  next_list_id : this.txFromJson<number>,  renewal_keys : this.txFromJson<RenewalPage>,  payment_asset : this.txFromJson<string>,  assurance_list : this.txFromJson<number | null>,  assurance_state : this.txFromJson<Result<AssuranceState, Error>>,  storage_version : this.txFromJson<number>,  recovery_upgrade : this.txFromJson<void>
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