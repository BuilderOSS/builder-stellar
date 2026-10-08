import {MarketplaceConfig, Listing, PrimaryListing, ContractEvent} from './types.js';
import {Spec, AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, ExternalExecutableRef} from '@stellar/stellar-sdk/contract';
import {Address, xdr} from '@stellar/stellar-sdk';

export interface Client {
  buy({ token_id, buyer }: { token_id: number; buyer: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  list({ token_id, seller, price, expires_at }: { token_id: number; seller: string | Address; price: bigint; expires_at: bigint }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  pause(options?: MethodOptions): Promise<AssembledTransaction<void>>;
  cancel({ token_id, seller }: { token_id: number; seller: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  expire({ token_id }: { token_id: number }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * One-shot, Manager-only launch handoff (Setup -> Live).
   *
   * `treasury` must equal the treasury wired at construction (wiring is
   * immutable). After this call the param setters are gated by the treasury
   * instead of `launch_admin`. The marketplace is left unpaused when `open`
   * is true and forced paused otherwise. Panics `PaymentAssetMismatch` if the
   * payment asset differs from `expected_payment_asset`. A second call panics with `AlreadyLive`.
   */
  launch({ treasury, open, expected_payment_asset }: { treasury: string | Address; open: boolean; expected_payment_asset: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  unpause(options?: MethodOptions): Promise<AssembledTransaction<void>>;
  upgrade({ from_hash, to_hash }: { from_hash: Uint8Array; to_hash: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  version(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  wasm_hash(options?: MethodOptions): Promise<AssembledTransaction<Uint8Array>>;
  get_config(options?: MethodOptions): Promise<AssembledTransaction<MarketplaceConfig>>;
  /**
   * Buy a primary listing: pays the treasury, mints one token to `buyer`.
   */
  buy_primary({ listing_id, buyer }: { listing_id: bigint; buyer: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<number>>;
  get_listing({ token_id }: { token_id: number }, options?: MethodOptions): Promise<AssembledTransaction<Listing | null>>;
  sync_version(options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Treasury cancels an unsold primary listing (nothing is escrowed).
   */
  cancel_primary({ listing_id }: { listing_id: bigint }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Anyone may clear an expired primary listing.
   */
  expire_primary({ listing_id }: { listing_id: bigint }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Id the next primary listing will receive.
   */
  next_listing_id(options?: MethodOptions): Promise<AssembledTransaction<bigint>>;
  set_payment_asset({ payment_asset }: { payment_asset: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  get_primary_listing({ listing_id }: { listing_id: bigint }, options?: MethodOptions): Promise<AssembledTransaction<PrimaryListing | null>>;
  set_secondary_fee_bps({ fee_bps }: { fee_bps: number }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Create a primary sale listing (treasury-gated, Live, not paused).
   *
   * Nothing is minted or escrowed: the token is minted straight to the
   * buyer inside `buy_primary`. Returns the new listing id.
   */
  create_primary_listing({ price, expires_at }: { price: bigint; expires_at: bigint }, options?: MethodOptions): Promise<AssembledTransaction<bigint>>;
}

export class Client extends ContractClient {
  constructor(public readonly options: ContractClientOptions) {
    super(
      new Spec(["AAAABAAAAAAAAAAAAAAAEE1hcmtldHBsYWNlRXJyb3IAAAANAAAAAAAAAA5Ob3RJbml0aWFsaXplZAAAAAAFFQAAAAAAAAAMSW52YWxpZFByaWNlAAAFFwAAAAAAAAANSW52YWxpZEV4cGlyeQAAAAAABRgAAAAAAAAADUxpc3RpbmdFeGlzdHMAAAAAAAUZAAAAAAAAAA9MaXN0aW5nTm90Rm91bmQAAAAFGgAAAAAAAAAOTGlzdGluZ0V4cGlyZWQAAAAABRsAAAAAAAAADUxpc3RpbmdBY3RpdmUAAAAAAAUcAAAAAAAAAAlOb3RTZWxsZXIAAAAAAAUdAAAAAAAAAApJbnZhbGlkRmVlAAAAAAUeAAAAAAAAABJBcml0aG1ldGljT3ZlcmZsb3cAAAAABR8AAABCYGxhdW5jaGAgdHJlYXN1cnkgZGlmZmVycyBmcm9tIHRoZSB0cmVhc3VyeSB3aXJlZCBhdCBjb25zdHJ1Y3Rpb24uAAAAAAAQVHJlYXN1cnlNaXNtYXRjaAAABSAAAAA/YGxhdW5jaGAgZXhwZWN0ZWQgcGF5bWVudCBhc3NldCBkaWZmZXJzIGZyb20gdGhlIGNvbmZpZ3VyZWQgb25lAAAAABRQYXltZW50QXNzZXRNaXNtYXRjaAAABSEAAABEVGhlIG1hcmtldHBsYWNlIGlzIHBhdXNlZCAobmV3IGxpc3RpbmdzIGFuZCBwdXJjaGFzZXMgYXJlIHJlamVjdGVkKS4AAAAGUGF1c2VkAAAAAAUi", "AAAABQAAAEdFbWl0dGVkIG9uY2Ugd2hlbiB0aGUgTWFuYWdlciBsYXVuY2hlcyB0aGUgbWFya2V0cGxhY2UgKFNldHVwIC0+IExpdmUpLgAAAAAAAAAACExhdW5jaGVkAAAAAQAAAAhsYXVuY2hlZAAAAAIAAAAAAAAACHRyZWFzdXJ5AAAAEwAAAAEAAAAvV2hldGhlciB0aGUgbWFya2V0cGxhY2Ugd2FzIHVucGF1c2VkIGF0IGxhdW5jaC4AAAAABm9wZW5lZAAAAAAAAQAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAADkxpc3RpbmdFeHBpcmVkAAAAAAABAAAAD2xpc3RpbmdfZXhwaXJlZAAAAAACAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAABAAAAAAAAAAZzZWxsZXIAAAAAABMAAAAAAAAAAg==", "AAAABQAAAAAAAAAAAAAAEExpc3RpbmdDYW5jZWxsZWQAAAABAAAAEWxpc3RpbmdfY2FuY2VsbGVkAAAAAAAAAgAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAQAAAAAAAAAGc2VsbGVyAAAAAAATAAAAAAAAAAI=", "AAAABQAAAAAAAAAAAAAAEExpc3RpbmdQdXJjaGFzZWQAAAABAAAAEWxpc3RpbmdfcHVyY2hhc2VkAAAAAAAABgAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAQAAAAAAAAAFYnV5ZXIAAAAAAAATAAAAAQAAAAAAAAAGc2VsbGVyAAAAAAATAAAAAAAAAAAAAAAFcHJpY2UAAAAAAAALAAAAAAAAAAAAAAADZmVlAAAAAAsAAAAAAAAAAAAAAA1wYXltZW50X2Fzc2V0AAAAAAAAEwAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAAEU1hcmtldHBsYWNlUGF1c2VkAAAAAAAAAQAAABJtYXJrZXRwbGFjZV9wYXVzZWQAAAAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAAE01hcmtldHBsYWNlVW5wYXVzZWQAAAAAAQAAABRtYXJrZXRwbGFjZV91bnBhdXNlZAAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAAE1BheW1lbnRBc3NldFVwZGF0ZWQAAAAAAQAAABVwYXltZW50X2Fzc2V0X3VwZGF0ZWQAAAAAAAABAAAAAAAAAA1wYXltZW50X2Fzc2V0AAAAAAAAEwAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAAE1NlY29uZGFyeUZlZVVwZGF0ZWQAAAAAAQAAABVzZWNvbmRhcnlfZmVlX3VwZGF0ZWQAAAAAAAABAAAAAAAAAAdmZWVfYnBzAAAAAAQAAAAAAAAAAg==", "AAAABQAAAAAAAAAAAAAAFVByaW1hcnlMaXN0aW5nQ3JlYXRlZAAAAAAAAAEAAAAXcHJpbWFyeV9saXN0aW5nX2NyZWF0ZWQAAAAABAAAAAAAAAAKbGlzdGluZ19pZAAAAAAABgAAAAEAAAAAAAAABXByaWNlAAAAAAAACwAAAAAAAAAAAAAACmV4cGlyZXNfYXQAAAAAAAYAAAAAAAAAAAAAAA1wYXltZW50X2Fzc2V0AAAAAAAAEwAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAAFVByaW1hcnlMaXN0aW5nRXhwaXJlZAAAAAAAAAEAAAAXcHJpbWFyeV9saXN0aW5nX2V4cGlyZWQAAAAAAQAAAAAAAAAKbGlzdGluZ19pZAAAAAAABgAAAAEAAAAC", "AAAABQAAAAAAAAAAAAAAFk1hcmtldHBsYWNlSW5pdGlhbGl6ZWQAAAAAAAEAAAAXbWFya2V0cGxhY2VfaW5pdGlhbGl6ZWQAAAAABQAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAQAAAAAAAAAIdHJlYXN1cnkAAAATAAAAAAAAAAAAAAANcGF5bWVudF9hc3NldAAAAAAAABMAAAAAAAAAAAAAAAd2ZXJzaW9uAAAAABAAAAAAAAAAAAAAABlkZWZhdWx0X3NlY29uZGFyeV9mZWVfYnBzAAAAAAAABAAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAAF1ByaW1hcnlMaXN0aW5nQ2FuY2VsbGVkAAAAAAEAAAAZcHJpbWFyeV9saXN0aW5nX2NhbmNlbGxlZAAAAAAAAAEAAAAAAAAACmxpc3RpbmdfaWQAAAAAAAYAAAABAAAAAg==", "AAAABQAAAAAAAAAAAAAAF1ByaW1hcnlMaXN0aW5nUHVyY2hhc2VkAAAAAAEAAAAZcHJpbWFyeV9saXN0aW5nX3B1cmNoYXNlZAAAAAAAAAUAAAAAAAAACmxpc3RpbmdfaWQAAAAAAAYAAAABAAAAAAAAAAVidXllcgAAAAAAABMAAAABAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAAAAAAAAAAAAAVwcmljZQAAAAAAAAsAAAAAAAAAAAAAAA1wYXltZW50X2Fzc2V0AAAAAAAAEwAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAAF1NlY29uZGFyeUxpc3RpbmdDcmVhdGVkAAAAAAEAAAAZc2Vjb25kYXJ5X2xpc3RpbmdfY3JlYXRlZAAAAAAAAAYAAAAAAAAACHRva2VuX2lkAAAABAAAAAEAAAAAAAAABnNlbGxlcgAAAAAAEwAAAAAAAAAAAAAABXByaWNlAAAAAAAACwAAAAAAAAAAAAAACmV4cGlyZXNfYXQAAAAAAAYAAAAAAAAAAAAAAAdmZWVfYnBzAAAAAAQAAAAAAAAAAAAAAA1wYXltZW50X2Fzc2V0AAAAAAAAEwAAAAAAAAAC", "AAAAAQAAADZTZWNvbmRhcnkgKGVzY3Jvd2VkLXRva2VuKSBsaXN0aW5nLCBrZXllZCBieSB0b2tlbiBpZC4AAAAAAAAAAAAHTGlzdGluZwAAAAAFAAAAAAAAAApleHBpcmVzX2F0AAAAAAAGAAAAAAAAAAdmZWVfYnBzAAAAAAQAAABOQXNzZXQgY2FwdHVyZWQgYXQgbGlzdCB0aW1lOyBsYXRlciBgc2V0X3BheW1lbnRfYXNzZXRgIGNhbGxzIGRvIG5vdCBhZmZlY3QgaXQuAAAAAAANcGF5bWVudF9hc3NldAAAAAAAABMAAAAAAAAABXByaWNlAAAAAAAACwAAAAAAAAAGc2VsbGVyAAAAAAAT", "AAAAAQAAAEhQcmltYXJ5IHNhbGUgbGlzdGluZywga2V5ZWQgYnkgbGlzdGluZyBpZC4gTm8gdG9rZW4gZXhpc3RzIHVudGlsIGJvdWdodC4AAAAAAAAADlByaW1hcnlMaXN0aW5nAAAAAAADAAAAAAAAAApleHBpcmVzX2F0AAAAAAAGAAAAIEFzc2V0IGNhcHR1cmVkIGF0IGNyZWF0aW9uIHRpbWUuAAAADXBheW1lbnRfYXNzZXQAAAAAAAATAAAAAAAAAAVwcmljZQAAAAAAAAs=", "AAAAAQAAAAAAAAAAAAAAEU1hcmtldHBsYWNlQ29uZmlnAAAAAAAABwAAAAAAAAAZZGVmYXVsdF9zZWNvbmRhcnlfZmVlX2JwcwAAAAAAAAQAAABJU2V0dXAtcGhhc2UgYWRtaW4gb2YgdGhlIHBhcmFtIHNldHRlcnM7IHJlcGxhY2VkIGJ5IGB0cmVhc3VyeWAgb25jZSBMaXZlLgAAAAAAAAxsYXVuY2hfYWRtaW4AAAATAAAAAAAAAAdtYW5hZ2VyAAAAABMAAAAAAAAABnBhdXNlZAAAAAAAAQAAAAAAAAANcGF5bWVudF9hc3NldAAAAAAAABMAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAIdHJlYXN1cnkAAAAT", "AAAAAAAAAAAAAAADYnV5AAAAAAIAAAAAAAAACHRva2VuX2lkAAAABAAAAAAAAAAFYnV5ZXIAAAAAAAATAAAAAA==", "AAAAAAAAAAAAAAAEbGlzdAAAAAQAAAAAAAAACHRva2VuX2lkAAAABAAAAAAAAAAGc2VsbGVyAAAAAAATAAAAAAAAAAVwcmljZQAAAAAAAAsAAAAAAAAACmV4cGlyZXNfYXQAAAAAAAYAAAAA", "AAAAAAAAAAAAAAAFcGF1c2UAAAAAAAAAAAAAAA==", "AAAAAAAAAAAAAAAGY2FuY2VsAAAAAAACAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAAAAAAABnNlbGxlcgAAAAAAEwAAAAA=", "AAAAAAAAAAAAAAAGZXhwaXJlAAAAAAABAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAAA", "AAAAAAAAAbNPbmUtc2hvdCwgTWFuYWdlci1vbmx5IGxhdW5jaCBoYW5kb2ZmIChTZXR1cCAtPiBMaXZlKS4KCmB0cmVhc3VyeWAgbXVzdCBlcXVhbCB0aGUgdHJlYXN1cnkgd2lyZWQgYXQgY29uc3RydWN0aW9uICh3aXJpbmcgaXMKaW1tdXRhYmxlKS4gQWZ0ZXIgdGhpcyBjYWxsIHRoZSBwYXJhbSBzZXR0ZXJzIGFyZSBnYXRlZCBieSB0aGUgdHJlYXN1cnkKaW5zdGVhZCBvZiBgbGF1bmNoX2FkbWluYC4gVGhlIG1hcmtldHBsYWNlIGlzIGxlZnQgdW5wYXVzZWQgd2hlbiBgb3BlbmAKaXMgdHJ1ZSBhbmQgZm9yY2VkIHBhdXNlZCBvdGhlcndpc2UuIFBhbmljcyBgUGF5bWVudEFzc2V0TWlzbWF0Y2hgIGlmIHRoZQpwYXltZW50IGFzc2V0IGRpZmZlcnMgZnJvbSBgZXhwZWN0ZWRfcGF5bWVudF9hc3NldGAuIEEgc2Vjb25kIGNhbGwgcGFuaWNzIHdpdGggYEFscmVhZHlMaXZlYC4AAAAABmxhdW5jaAAAAAAAAwAAAAAAAAAIdHJlYXN1cnkAAAATAAAAAAAAAARvcGVuAAAAAQAAAAAAAAAWZXhwZWN0ZWRfcGF5bWVudF9hc3NldAAAAAAAEwAAAAA=", "AAAAAAAAAAAAAAAHdW5wYXVzZQAAAAAAAAAAAA==", "AAAAAAAAAAAAAAAHdXBncmFkZQAAAAACAAAAAAAAAAlmcm9tX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAHdG9faGFzaAAAAAPuAAAAIAAAAAA=", "AAAAAAAAAAAAAAAHdmVyc2lvbgAAAAAAAAAAAQAAABA=", "AAAAAAAAAAAAAAAJd2FzbV9oYXNoAAAAAAAAAAAAAAEAAAPuAAAAIA==", "AAAAAAAAAAAAAAAKZ2V0X2NvbmZpZwAAAAAAAAAAAAEAAAfQAAAAEU1hcmtldHBsYWNlQ29uZmlnAAAA", "AAAAAAAAAEVCdXkgYSBwcmltYXJ5IGxpc3Rpbmc6IHBheXMgdGhlIHRyZWFzdXJ5LCBtaW50cyBvbmUgdG9rZW4gdG8gYGJ1eWVyYC4AAAAAAAALYnV5X3ByaW1hcnkAAAAAAgAAAAAAAAAKbGlzdGluZ19pZAAAAAAABgAAAAAAAAAFYnV5ZXIAAAAAAAATAAAAAQAAAAQ=", "AAAAAAAAAAAAAAALZ2V0X2xpc3RpbmcAAAAAAQAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAQAAA+gAAAfQAAAAB0xpc3RpbmcA", "AAAAAAAAAAAAAAAMc3luY192ZXJzaW9uAAAAAAAAAAA=", "AAAAAAAAAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAgAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAMbGF1bmNoX2FkbWluAAAAEwAAAAAAAAAIdHJlYXN1cnkAAAATAAAAAAAAAA1wYXltZW50X2Fzc2V0AAAAAAAAEwAAAAAAAAAHbWFuYWdlcgAAAAATAAAAAAAAAAxjdXJyZW50X2hhc2gAAAPuAAAAIAAAAAAAAAAHdmVyc2lvbgAAAAAQAAAAAAAAABlkZWZhdWx0X3NlY29uZGFyeV9mZWVfYnBzAAAAAAAABAAAAAA=", "AAAAAAAAAEFUcmVhc3VyeSBjYW5jZWxzIGFuIHVuc29sZCBwcmltYXJ5IGxpc3RpbmcgKG5vdGhpbmcgaXMgZXNjcm93ZWQpLgAAAAAAAA5jYW5jZWxfcHJpbWFyeQAAAAAAAQAAAAAAAAAKbGlzdGluZ19pZAAAAAAABgAAAAA=", "AAAAAAAAACxBbnlvbmUgbWF5IGNsZWFyIGFuIGV4cGlyZWQgcHJpbWFyeSBsaXN0aW5nLgAAAA5leHBpcmVfcHJpbWFyeQAAAAAAAQAAAAAAAAAKbGlzdGluZ19pZAAAAAAABgAAAAA=", "AAAAAAAAAClJZCB0aGUgbmV4dCBwcmltYXJ5IGxpc3Rpbmcgd2lsbCByZWNlaXZlLgAAAAAAAA9uZXh0X2xpc3RpbmdfaWQAAAAAAAAAAAEAAAAG", "AAAAAAAAAAAAAAARc2V0X3BheW1lbnRfYXNzZXQAAAAAAAABAAAAAAAAAA1wYXltZW50X2Fzc2V0AAAAAAAAEwAAAAA=", "AAAAAAAAAAAAAAATZ2V0X3ByaW1hcnlfbGlzdGluZwAAAAABAAAAAAAAAApsaXN0aW5nX2lkAAAAAAAGAAAAAQAAA+gAAAfQAAAADlByaW1hcnlMaXN0aW5nAAA=", "AAAAAAAAAAAAAAAVc2V0X3NlY29uZGFyeV9mZWVfYnBzAAAAAAAAAQAAAAAAAAAHZmVlX2JwcwAAAAAEAAAAAA==", "AAAAAAAAAL1DcmVhdGUgYSBwcmltYXJ5IHNhbGUgbGlzdGluZyAodHJlYXN1cnktZ2F0ZWQsIExpdmUsIG5vdCBwYXVzZWQpLgoKTm90aGluZyBpcyBtaW50ZWQgb3IgZXNjcm93ZWQ6IHRoZSB0b2tlbiBpcyBtaW50ZWQgc3RyYWlnaHQgdG8gdGhlCmJ1eWVyIGluc2lkZSBgYnV5X3ByaW1hcnlgLiBSZXR1cm5zIHRoZSBuZXcgbGlzdGluZyBpZC4AAAAAAAAWY3JlYXRlX3ByaW1hcnlfbGlzdGluZwAAAAAAAgAAAAAAAAAFcHJpY2UAAAAAAAALAAAAAAAAAApleHBpcmVzX2F0AAAAAAAGAAAAAQAAAAY=", "AAAABAAAAJFFcnJvcnMgc2hhcmVkIGJ5IGFsbCBtb2R1bGUgY29udHJhY3RzLiBDb2RlcyBsaXZlIGluIHRoZSA5MDAwIHJhbmdlIHNvCnRoZXkgbmV2ZXIgY29sbGlkZSB3aXRoIG1vZHVsZSAoMTF4eC0xM3h4LCAzLCAzMCkgb3IgbWFuYWdlciAoMTB4eCkgY29kZXMuAAAAAAAAAAAAAAtDb21tb25FcnJvcgAAAAALAAAANE9wZXJhdGlvbiByZXF1aXJlcyB0aGUgbW9kdWxlIHRvIGJlIGxpdmUgKGxhdW5jaGVkKS4AAAAHTm90TGl2ZQAAACMpAAAAQU9wZXJhdGlvbiBpcyBvbmx5IHZhbGlkIGR1cmluZyBzZXR1cDsgdGhlIG1vZHVsZSBpcyBhbHJlYWR5IGxpdmUuAAAAAAAAC0FscmVhZHlMaXZlAAAAIyoAAAAlTWFuYWdlciBhZGRyZXNzIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAAAAA1NYW5hZ2VyTm90U2V0AAAAAAAjKwAAACNgQ3VycmVudEhhc2hgIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAARQ3VycmVudEhhc2hOb3RTZXQAAAAAACMsAAAANGBmcm9tX2hhc2hgIGRvZXMgbm90IGVxdWFsIHRoZSBzdG9yZWQgYEN1cnJlbnRIYXNoYC4AAAAMSGFzaE1pc21hdGNoAAAjLQAAACpNYW5hZ2VyIGRpZCBub3QgYXBwcm92ZSB0aGlzIHVwZ3JhZGUgcGF0aC4AAAAAABJVcGdyYWRlTm90QXBwcm92ZWQAAAAAIy4AAAA1TWFuYWdlciBoYXMgbm8gcmVnaXN0cnkgZW50cnkgZm9yIHRoZSByZXF1ZXN0ZWQgaGFzaC4AAAAAAAAWSW1wbGVtZW50YXRpb25Ob3RGb3VuZAAAAAAjLwAAABtPd25lciBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAAC093bmVyTm90U2V0AAAAIzAAAAAmYEN1cnJlbnRWZXJzaW9uYCBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAAAA1WZXJzaW9uTm90U2V0AAAAAAAjMQAAACZUcmVhc3VyeSBhZGRyZXNzIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAAADlRyZWFzdXJ5Tm90U2V0AAAAACMyAAAAJkdvdmVybm9yIGFkZHJlc3MgbWlzc2luZyBmcm9tIHN0b3JhZ2UuAAAAAAAOR292ZXJub3JOb3RTZXQAAAAAIzM=", "AAAABQAAAE1FbWl0dGVkIGJ5IGBhcHBseWAuIFRoZSBlbWl0dGluZyBjb250cmFjdCBhZGRyZXNzIGlzIHRoZSBldmVudCdzIGNvbnRyYWN0IGlkLgAAAAAAAAAAAAAIVXBncmFkZWQAAAABAAAACHVwZ3JhZGVkAAAAAwAAAAAAAAAJZnJvbV9oYXNoAAAAAAAD7gAAACAAAAABAAAAAAAAAAd0b19oYXNoAAAAA+4AAAAgAAAAAQAAAAAAAAAHdmVyc2lvbgAAAAAQAAAAAAAAAAI=", "AAAABQAAABpFbWl0dGVkIGJ5IGBzeW5jX3ZlcnNpb25gLgAAAAAAAAAAAA1WZXJzaW9uU3luY2VkAAAAAAAAAQAAAA52ZXJzaW9uX3N5bmNlZAAAAAAAAQAAAAAAAAAHdmVyc2lvbgAAAAAQAAAAAAAAAAI="]),
      options
    );
  }

   static deploy<T = Client>({ token, launch_admin, treasury, payment_asset, manager, current_hash, version, default_secondary_fee_bps }: { token: string | Address; launch_admin: string | Address; treasury: string | Address; payment_asset: string | Address; manager: string | Address; current_hash: Uint8Array; version: string; default_secondary_fee_bps: number }, options: MethodOptions & Omit<ContractClientOptions, 'contractId'> & { salt?: Uint8Array; address?: string; } & ({ wasmHash: Uint8Array | string; format?: "hex" | "base64"; externalRef?: never; } | { externalRef: ExternalExecutableRef; wasmHash?: never; format?: never; })): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({ token, launch_admin, treasury, payment_asset, manager, current_hash, version, default_secondary_fee_bps }, options);
  }
  public readonly fromJson = {
    buy : this.txFromJson<void>,  list : this.txFromJson<void>,  pause : this.txFromJson<void>,  cancel : this.txFromJson<void>,  expire : this.txFromJson<void>,  launch : this.txFromJson<void>,  unpause : this.txFromJson<void>,  upgrade : this.txFromJson<void>,  version : this.txFromJson<string>,  wasm_hash : this.txFromJson<Uint8Array>,  get_config : this.txFromJson<MarketplaceConfig>,  buy_primary : this.txFromJson<number>,  get_listing : this.txFromJson<Listing | null>,  sync_version : this.txFromJson<void>,  cancel_primary : this.txFromJson<void>,  expire_primary : this.txFromJson<void>,  next_listing_id : this.txFromJson<bigint>,  set_payment_asset : this.txFromJson<void>,  get_primary_listing : this.txFromJson<PrimaryListing | null>,  set_secondary_fee_bps : this.txFromJson<void>,  create_primary_listing : this.txFromJson<bigint>
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
   * Build a topics filter row for the "ListingExpired" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  listingExpiredEventFilter(topicValues?: { token_id?: number }): string[] {
    return this.spec.eventTopicFilter("ListingExpired", topicValues);
  }
  /**
   * Build a topics filter row for the "ListingCancelled" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  listingCancelledEventFilter(topicValues?: { token_id?: number }): string[] {
    return this.spec.eventTopicFilter("ListingCancelled", topicValues);
  }
  /**
   * Build a topics filter row for the "ListingPurchased" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  listingPurchasedEventFilter(topicValues?: { token_id?: number; buyer?: string | Address }): string[] {
    return this.spec.eventTopicFilter("ListingPurchased", topicValues);
  }
  /**
   * Build a topics filter row for the "MarketplacePaused" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  marketplacePausedEventFilter(): string[] {
    return this.spec.eventTopicFilter("MarketplacePaused");
  }
  /**
   * Build a topics filter row for the "MarketplaceUnpaused" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  marketplaceUnpausedEventFilter(): string[] {
    return this.spec.eventTopicFilter("MarketplaceUnpaused");
  }
  /**
   * Build a topics filter row for the "PaymentAssetUpdated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  paymentAssetUpdatedEventFilter(): string[] {
    return this.spec.eventTopicFilter("PaymentAssetUpdated");
  }
  /**
   * Build a topics filter row for the "SecondaryFeeUpdated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  secondaryFeeUpdatedEventFilter(): string[] {
    return this.spec.eventTopicFilter("SecondaryFeeUpdated");
  }
  /**
   * Build a topics filter row for the "PrimaryListingCreated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  primaryListingCreatedEventFilter(topicValues?: { listing_id?: bigint }): string[] {
    return this.spec.eventTopicFilter("PrimaryListingCreated", topicValues);
  }
  /**
   * Build a topics filter row for the "PrimaryListingExpired" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  primaryListingExpiredEventFilter(topicValues?: { listing_id?: bigint }): string[] {
    return this.spec.eventTopicFilter("PrimaryListingExpired", topicValues);
  }
  /**
   * Build a topics filter row for the "MarketplaceInitialized" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  marketplaceInitializedEventFilter(topicValues?: { token?: string | Address }): string[] {
    return this.spec.eventTopicFilter("MarketplaceInitialized", topicValues);
  }
  /**
   * Build a topics filter row for the "PrimaryListingCancelled" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  primaryListingCancelledEventFilter(topicValues?: { listing_id?: bigint }): string[] {
    return this.spec.eventTopicFilter("PrimaryListingCancelled", topicValues);
  }
  /**
   * Build a topics filter row for the "PrimaryListingPurchased" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  primaryListingPurchasedEventFilter(topicValues?: { listing_id?: bigint; buyer?: string | Address }): string[] {
    return this.spec.eventTopicFilter("PrimaryListingPurchased", topicValues);
  }
  /**
   * Build a topics filter row for the "SecondaryListingCreated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  secondaryListingCreatedEventFilter(topicValues?: { token_id?: number }): string[] {
    return this.spec.eventTopicFilter("SecondaryListingCreated", topicValues);
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
}