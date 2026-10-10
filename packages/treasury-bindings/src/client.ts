import {AuthNode, ContractEvent} from './types.js';
import {Spec, AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, ExternalExecutableRef} from '@stellar/stellar-sdk/contract';
import {Address, xdr} from '@stellar/stellar-sdk';

export interface Client {
  /**
   * Module admin: the launch admin during setup, the Treasury itself once live.
   */
  admin(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * One-shot, Manager-only launch handoff (Setup -> Live).
   *
   * Hands the admin to `treasury` (which must be this contract's own
   * address), marks the module live, and emits `TreasuryLaunched`. A second
   * call panics with `AlreadyLive`.
   */
  launch({ treasury }: { treasury: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Executes a queued proposal. The Treasury is the top-level executor.
   *
   * Anyone may call this; authority comes from the Governor's approval.
   *
   * 1. `governor.consume(...)` (a returning call) checks the proposal is
   * Queued, past its ETA and unexpired, marks it Executed, and returns the
   * proposal id. The Governor requires the Treasury's auth, which is
   * satisfied implicitly because the Treasury is the direct invoker. The
   * Governor is no longer on the call stack afterwards, so targets may
   * call the Governor's admin setters (Soroban forbids re-entry).
   * 2. Each action is dispatched in order:
   * - target = this contract, function `authorize`: stores extra
   * authorization trees (one `Vec<AuthNode>` argument) for the next
   * action, which must be an external call;
   * - target = this contract, any other function: the internal allowlist
   * `self_dispatch` (never `invoke_contract`, which would be a
   * forbidden re-entry);
   * - any other target: invoked with the Treasury authorizing exactly
   * that call, plus the trees of a preceding `authorize` action.
   *
   * An
   */
  execute({ targets, functions, args, description_hash }: { targets: Array<string | Address>; functions: Array<string>; args: Array<Array<any>>; description_hash: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<Uint8Array>>;
  /**
   * Setup-phase only in practice, see `upgrade`.
   */
  migrate(options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Setup-phase upgrade by the launch admin. After launch the admin is the
   * Treasury itself, whose auth nobody can produce externally, so this is
   * dead after launch; governance upgrades go through `execute` ->
   * `self_dispatch("upgrade")`.
   */
  upgrade({ from_hash, to_hash }: { from_hash: Uint8Array; to_hash: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  version(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * The Governor whose queued proposals `execute` consumes.
   */
  governor(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  wasm_hash(options?: MethodOptions): Promise<AssembledTransaction<Uint8Array>>;
  /**
   * Setup-phase only in practice, see `upgrade`.
   */
  sync_version(options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Storage-layout version of the data held by this contract.
   */
  storage_version(options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * Read-only check of the trees an `authorize` action would carry: decodes
   * them, enforces `MAX_AUTH_DEPTH` / `MAX_AUTH_NODES`, and returns the node
   * count. Simulate it before proposing; panics `InvalidAuthorization`
   * exactly as `execute` would.
   */
  check_authorization({ nodes }: { nodes: Array<AuthNode> }, options?: MethodOptions): Promise<AssembledTransaction<number>>;
}

export class Client extends ContractClient {
  constructor(public readonly options: ContractClientOptions) {
    super(
      new Spec(["AAAABAAAADlUcmVhc3VyeSBlcnJvcnMgKGJsb2NrIGBjb21tb246OmVycm9yOjpjb2Rlczo6VFJFQVNVUllgKS4AAAAAAAAAAAAADVRyZWFzdXJ5RXJyb3IAAAAAAAAFAAAAJmBsYXVuY2hgIHRyZWFzdXJ5IGlzIG5vdCB0aGlzIGNvbnRyYWN0AAAAAAAQVHJlYXN1cnlNaXNtYXRjaAAAHbEAAABMQSBwcm9wb3NhbCBhY3Rpb24gdGFyZ2V0cyB0aGUgVHJlYXN1cnkgd2l0aCBhIGZ1bmN0aW9uIG91dHNpZGUgdGhlIGFsbG93bGlzdAAAAA9Vbmtub3duU2VsZkNhbGwAAAAdsgAAAD5Xcm9uZyBudW1iZXIgb3IgdHlwZSBvZiBhcmd1bWVudHMgZm9yIGFuIGFsbG93bGlzdGVkIHNlbGYgY2FsbAAAAAAAE0ludmFsaWRTZWxmQ2FsbEFyZ3MAAAAdswAAADBgdGFyZ2V0c2AsIGBmdW5jdGlvbnNgIGFuZCBgYXJnc2AgbGVuZ3RocyBkaWZmZXIAAAAVSW52YWxpZFByb3Bvc2FsTGVuZ3RoAAAAAAAdtAAAAGJBbiBgYXV0aG9yaXplYCBhY3Rpb24gaXMgbWFsZm9ybWVkLCB0b28gbGFyZ2UsIG9yIG5vdCBmb2xsb3dlZCBieSBhbgpleHRlcm5hbCBjYWxsIGl0IGNhbiBhcHBseSB0bwAAAAAAFEludmFsaWRBdXRob3JpemF0aW9uAAAdtQ==", "AAAABQAAAFlFbWl0dGVkIGZvciBldmVyeSBleGVjdXRlZCBwcm9wb3NhbCBhY3Rpb24sIGluY2x1ZGluZyBzZWxmIGNhbGxzIGFuZApgYXV0aG9yaXplYCBhY3Rpb25zLgAAAAAAAAAAAAAHRXhlY3V0ZQAAAAABAAAAB2V4ZWN1dGUAAAAABQAAAAAAAAAIZ292ZXJub3IAAAATAAAAAQAAAAAAAAAGdGFyZ2V0AAAAAAATAAAAAQAAAAAAAAALcHJvcG9zYWxfaWQAAAAD7gAAACAAAAABAAAAAAAAAAhmdW5jdGlvbgAAABEAAAAAAAAAKVBvc2l0aW9uIG9mIHRoZSBjYWxsIHdpdGhpbiB0aGUgcHJvcG9zYWwuAAAAAAAABWluZGV4AAAAAAAABAAAAAAAAAAC", "AAAABQAAAERFbWl0dGVkIG9uY2Ugd2hlbiB0aGUgTWFuYWdlciBsYXVuY2hlcyB0aGUgdHJlYXN1cnkgKFNldHVwIC0+IExpdmUpLgAAAAAAAAAQVHJlYXN1cnlMYXVuY2hlZAAAAAEAAAARdHJlYXN1cnlfbGF1bmNoZWQAAAAAAAABAAAAAAAAAAh0cmVhc3VyeQAAABMAAAABAAAAAg==", "AAAABQAAAAAAAAAAAAAAE1RyZWFzdXJ5SW5pdGlhbGl6ZWQAAAAAAQAAABR0cmVhc3VyeV9pbml0aWFsaXplZAAAAAMAAAAAAAAABWFkbWluAAAAAAAAEwAAAAEAAAAAAAAACGdvdmVybm9yAAAAEwAAAAAAAAAAAAAAB3ZlcnNpb24AAAAAEAAAAAAAAAAC", "AAAAAQAAAnJPbmUgY29udHJhY3QgaW52b2NhdGlvbiB0aGUgVHJlYXN1cnkgcHJlLWF1dGhvcml6ZXMsIHdpdGggdGhlIGludm9jYXRpb25zCmJlbG93IGl0IHRoYXQgYWxzbyBuZWVkIHRoZSBUcmVhc3VyeSdzIGF1dGhvcml6YXRpb24uCgpBIHByb3Bvc2FsIGFjdGlvbiBhaW1lZCBhdCB0aGUgVHJlYXN1cnkgaXRzZWxmIHdpdGggZnVuY3Rpb24gYGF1dGhvcml6ZWAKYW5kIGEgc2luZ2xlIGBWZWM8QXV0aE5vZGU+YCBhcmd1bWVudCBhZGRzIHRoZXNlIHRyZWVzIHRvIHRoZSBUcmVhc3VyeSdzCmF1dGhvcml6YXRpb24gZm9yIHRoZSAqbmV4dCogYWN0aW9uLiBVc2UgaXQgd2hlbiB0aGUgbmV4dCBjYWxsIHJlYWNoZXMgYQpjb250cmFjdCB0aGF0IHJlcXVpcmVzIHRoZSBUcmVhc3VyeSdzIGF1dGggZGVlcGVyIGluIHRoZSBjYWxsIHN0YWNrIChmb3IKZXhhbXBsZSBhIHRva2VuIGB0cmFuc2ZlcmAgZnJvbSB0aGUgVHJlYXN1cnkgbWFkZSBieSBhIG1hcmtldHBsYWNlIG9yIGFuCkFNTSkuIEJlY2F1c2UgaXQgaXMgYW4gb3JkaW5hcnkgYWN0aW9uLCB0aGUgdHJlZXMgYXJlIHBhcnQgb2YgdGhlIHByb3Bvc2FsCmlkIGFuZCB2b3RlcnMgYXBwcm92ZSB0aGVtIHdpdGggdGhlIHJlc3Qgb2YgdGhlIHByb3Bvc2FsLgAAAAAAAAAAAAhBdXRoTm9kZQAAAAQAAAAAAAAABGFyZ3MAAAPqAAAAAAAAAAAAAAAIY29udHJhY3QAAAATAAAAAAAAAAdmbl9uYW1lAAAAABEAAAAAAAAAA3N1YgAAAAPqAAAH0AAAAAhBdXRoTm9kZQ==", "AAAAAAAAAEtNb2R1bGUgYWRtaW46IHRoZSBsYXVuY2ggYWRtaW4gZHVyaW5nIHNldHVwLCB0aGUgVHJlYXN1cnkgaXRzZWxmIG9uY2UgbGl2ZS4AAAAABWFkbWluAAAAAAAAAAAAAAEAAAAT", "AAAAAAAAAOBPbmUtc2hvdCwgTWFuYWdlci1vbmx5IGxhdW5jaCBoYW5kb2ZmIChTZXR1cCAtPiBMaXZlKS4KCkhhbmRzIHRoZSBhZG1pbiB0byBgdHJlYXN1cnlgICh3aGljaCBtdXN0IGJlIHRoaXMgY29udHJhY3QncyBvd24KYWRkcmVzcyksIG1hcmtzIHRoZSBtb2R1bGUgbGl2ZSwgYW5kIGVtaXRzIGBUcmVhc3VyeUxhdW5jaGVkYC4gQSBzZWNvbmQKY2FsbCBwYW5pY3Mgd2l0aCBgQWxyZWFkeUxpdmVgLgAAAAZsYXVuY2gAAAAAAAEAAAAAAAAACHRyZWFzdXJ5AAAAEwAAAAA=", "AAAAAAAABABFeGVjdXRlcyBhIHF1ZXVlZCBwcm9wb3NhbC4gVGhlIFRyZWFzdXJ5IGlzIHRoZSB0b3AtbGV2ZWwgZXhlY3V0b3IuCgpBbnlvbmUgbWF5IGNhbGwgdGhpczsgYXV0aG9yaXR5IGNvbWVzIGZyb20gdGhlIEdvdmVybm9yJ3MgYXBwcm92YWwuCgoxLiBgZ292ZXJub3IuY29uc3VtZSguLi4pYCAoYSByZXR1cm5pbmcgY2FsbCkgY2hlY2tzIHRoZSBwcm9wb3NhbCBpcwpRdWV1ZWQsIHBhc3QgaXRzIEVUQSBhbmQgdW5leHBpcmVkLCBtYXJrcyBpdCBFeGVjdXRlZCwgYW5kIHJldHVybnMgdGhlCnByb3Bvc2FsIGlkLiBUaGUgR292ZXJub3IgcmVxdWlyZXMgdGhlIFRyZWFzdXJ5J3MgYXV0aCwgd2hpY2ggaXMKc2F0aXNmaWVkIGltcGxpY2l0bHkgYmVjYXVzZSB0aGUgVHJlYXN1cnkgaXMgdGhlIGRpcmVjdCBpbnZva2VyLiBUaGUKR292ZXJub3IgaXMgbm8gbG9uZ2VyIG9uIHRoZSBjYWxsIHN0YWNrIGFmdGVyd2FyZHMsIHNvIHRhcmdldHMgbWF5CmNhbGwgdGhlIEdvdmVybm9yJ3MgYWRtaW4gc2V0dGVycyAoU29yb2JhbiBmb3JiaWRzIHJlLWVudHJ5KS4KMi4gRWFjaCBhY3Rpb24gaXMgZGlzcGF0Y2hlZCBpbiBvcmRlcjoKLSB0YXJnZXQgPSB0aGlzIGNvbnRyYWN0LCBmdW5jdGlvbiBgYXV0aG9yaXplYDogc3RvcmVzIGV4dHJhCmF1dGhvcml6YXRpb24gdHJlZXMgKG9uZSBgVmVjPEF1dGhOb2RlPmAgYXJndW1lbnQpIGZvciB0aGUgbmV4dAphY3Rpb24sIHdoaWNoIG11c3QgYmUgYW4gZXh0ZXJuYWwgY2FsbDsKLSB0YXJnZXQgPSB0aGlzIGNvbnRyYWN0LCBhbnkgb3RoZXIgZnVuY3Rpb246IHRoZSBpbnRlcm5hbCBhbGxvd2xpc3QKYHNlbGZfZGlzcGF0Y2hgIChuZXZlciBgaW52b2tlX2NvbnRyYWN0YCwgd2hpY2ggd291bGQgYmUgYQpmb3JiaWRkZW4gcmUtZW50cnkpOwotIGFueSBvdGhlciB0YXJnZXQ6IGludm9rZWQgd2l0aCB0aGUgVHJlYXN1cnkgYXV0aG9yaXppbmcgZXhhY3RseQp0aGF0IGNhbGwsIHBsdXMgdGhlIHRyZWVzIG9mIGEgcHJlY2VkaW5nIGBhdXRob3JpemVgIGFjdGlvbi4KCkFuAAAAB2V4ZWN1dGUAAAAABAAAAAAAAAAHdGFyZ2V0cwAAAAPqAAAAEwAAAAAAAAAJZnVuY3Rpb25zAAAAAAAD6gAAABEAAAAAAAAABGFyZ3MAAAPqAAAD6gAAAAAAAAAAAAAAEGRlc2NyaXB0aW9uX2hhc2gAAAPuAAAAIAAAAAEAAAPuAAAAIA==", "AAAAAAAAACxTZXR1cC1waGFzZSBvbmx5IGluIHByYWN0aWNlLCBzZWUgYHVwZ3JhZGVgLgAAAAdtaWdyYXRlAAAAAAAAAAAA", "AAAAAAAAAOdTZXR1cC1waGFzZSB1cGdyYWRlIGJ5IHRoZSBsYXVuY2ggYWRtaW4uIEFmdGVyIGxhdW5jaCB0aGUgYWRtaW4gaXMgdGhlClRyZWFzdXJ5IGl0c2VsZiwgd2hvc2UgYXV0aCBub2JvZHkgY2FuIHByb2R1Y2UgZXh0ZXJuYWxseSwgc28gdGhpcyBpcwpkZWFkIGFmdGVyIGxhdW5jaDsgZ292ZXJuYW5jZSB1cGdyYWRlcyBnbyB0aHJvdWdoIGBleGVjdXRlYCAtPgpgc2VsZl9kaXNwYXRjaCgidXBncmFkZSIpYC4AAAAAB3VwZ3JhZGUAAAAAAgAAAAAAAAAJZnJvbV9oYXNoAAAAAAAD7gAAACAAAAAAAAAAB3RvX2hhc2gAAAAD7gAAACAAAAAA", "AAAAAAAAAAAAAAAHdmVyc2lvbgAAAAAAAAAAAQAAABA=", "AAAAAAAAADdUaGUgR292ZXJub3Igd2hvc2UgcXVldWVkIHByb3Bvc2FscyBgZXhlY3V0ZWAgY29uc3VtZXMuAAAAAAhnb3Zlcm5vcgAAAAAAAAABAAAAEw==", "AAAAAAAAAAAAAAAJd2FzbV9oYXNoAAAAAAAAAAAAAAEAAAPuAAAAIA==", "AAAAAAAAACxTZXR1cC1waGFzZSBvbmx5IGluIHByYWN0aWNlLCBzZWUgYHVwZ3JhZGVgLgAAAAxzeW5jX3ZlcnNpb24AAAAAAAAAAA==", "AAAAAAAAATlJbml0aWFsaXplcyB0aGUgdHJlYXN1cnkuCgoqIGBhZG1pbmAgLSBzZXR1cC1waGFzZSBhZG1pbiAodGhlIGxhdW5jaCBhZG1pbik7IGJlY29tZXMgdGhlIFRyZWFzdXJ5IGl0c2VsZiBhdCBsYXVuY2gKKiBgZ292ZXJub3JgIC0gR292ZXJub3Igd2hvc2UgcXVldWVkIHByb3Bvc2FscyBgZXhlY3V0ZWAgY29uc3VtZXMKKiBgbWFuYWdlcmAgLSBNYW5hZ2VyIGNvbnRyYWN0ICh1cGdyYWRlIGFwcHJvdmFscywgbGF1bmNoKQoqIGBjdXJyZW50X2hhc2hgLCBgdmVyc2lvbmAgLSB0aGlzIGltcGxlbWVudGF0aW9uJ3MgV0FTTSBoYXNoIGFuZCByZWxlYXNlAAAAAAAADV9fY29uc3RydWN0b3IAAAAAAAAFAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAACGdvdmVybm9yAAAAEwAAAAAAAAAHbWFuYWdlcgAAAAATAAAAAAAAAAxjdXJyZW50X2hhc2gAAAPuAAAAIAAAAAAAAAAHdmVyc2lvbgAAAAAQAAAAAA==", "AAAAAAAAADlTdG9yYWdlLWxheW91dCB2ZXJzaW9uIG9mIHRoZSBkYXRhIGhlbGQgYnkgdGhpcyBjb250cmFjdC4AAAAAAAAPc3RvcmFnZV92ZXJzaW9uAAAAAAAAAAABAAAABA==", "AAAAAAAAAO9SZWFkLW9ubHkgY2hlY2sgb2YgdGhlIHRyZWVzIGFuIGBhdXRob3JpemVgIGFjdGlvbiB3b3VsZCBjYXJyeTogZGVjb2Rlcwp0aGVtLCBlbmZvcmNlcyBgTUFYX0FVVEhfREVQVEhgIC8gYE1BWF9BVVRIX05PREVTYCwgYW5kIHJldHVybnMgdGhlIG5vZGUKY291bnQuIFNpbXVsYXRlIGl0IGJlZm9yZSBwcm9wb3Npbmc7IHBhbmljcyBgSW52YWxpZEF1dGhvcml6YXRpb25gCmV4YWN0bHkgYXMgYGV4ZWN1dGVgIHdvdWxkLgAAAAATY2hlY2tfYXV0aG9yaXphdGlvbgAAAAABAAAAAAAAAAVub2RlcwAAAAAAA+oAAAfQAAAACEF1dGhOb2RlAAAAAQAAAAQ=", "AAAABQAAAKtFbWl0dGVkIGJ5IFtgaGFuZG9mZmBdLiBUaGUgZW1pdHRpbmcgY29udHJhY3QgYWRkcmVzcyBpcyB0aGUgZXZlbnQncyBjb250cmFjdCBpZC4KClNhbWUgc2hhcGUgYXMgdGhlIE1hbmFnZXIncyBvd24gYEFkbWluQ2hhbmdlZGAsIHNvIGluZGV4ZXJzIGRlY29kZSBib3RoCndpdGggb25lIHNjaGVtYS4AAAAAAAAAAAxBZG1pbkNoYW5nZWQAAAABAAAADWFkbWluX2NoYW5nZWQAAAAAAAACAAAAAAAAAAlvbGRfYWRtaW4AAAAAAAATAAAAAQAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAEAAAAC", "AAAABAAAAD5FcnJvcnMgc2hhcmVkIGJ5IGFsbCBtb2R1bGUgY29udHJhY3RzIChibG9jayBgY29kZXM6OkNPTU1PTmApLgAAAAAAAAAAAAtDb21tb25FcnJvcgAAAAANAAAANE9wZXJhdGlvbiByZXF1aXJlcyB0aGUgbW9kdWxlIHRvIGJlIGxpdmUgKGxhdW5jaGVkKS4AAAAHTm90TGl2ZQAAABtZAAAAQU9wZXJhdGlvbiBpcyBvbmx5IHZhbGlkIGR1cmluZyBzZXR1cDsgdGhlIG1vZHVsZSBpcyBhbHJlYWR5IGxpdmUuAAAAAAAAC0FscmVhZHlMaXZlAAAAG1oAAAAlTWFuYWdlciBhZGRyZXNzIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAAAAA1NYW5hZ2VyTm90U2V0AAAAAAAbWwAAACNgQ3VycmVudEhhc2hgIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAARQ3VycmVudEhhc2hOb3RTZXQAAAAAABtcAAAANGBmcm9tX2hhc2hgIGRvZXMgbm90IGVxdWFsIHRoZSBzdG9yZWQgYEN1cnJlbnRIYXNoYC4AAAAMSGFzaE1pc21hdGNoAAAbXQAAACpNYW5hZ2VyIGRpZCBub3QgYXBwcm92ZSB0aGlzIHVwZ3JhZGUgcGF0aC4AAAAAABJVcGdyYWRlTm90QXBwcm92ZWQAAAAAG14AAAA1TWFuYWdlciBoYXMgbm8gcmVnaXN0cnkgZW50cnkgZm9yIHRoZSByZXF1ZXN0ZWQgaGFzaC4AAAAAAAAWSW1wbGVtZW50YXRpb25Ob3RGb3VuZAAAAAAbXwAAACJNb2R1bGUgYWRtaW4gbWlzc2luZyBmcm9tIHN0b3JhZ2UuAAAAAAALQWRtaW5Ob3RTZXQAAAAbYAAAACZgQ3VycmVudFZlcnNpb25gIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAAADVZlcnNpb25Ob3RTZXQAAAAAABthAAAAJlRyZWFzdXJ5IGFkZHJlc3MgbWlzc2luZyBmcm9tIHN0b3JhZ2UuAAAAAAAOVHJlYXN1cnlOb3RTZXQAAAAAG2IAAAAmR292ZXJub3IgYWRkcmVzcyBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAAAA5Hb3Zlcm5vck5vdFNldAAAAAAbYwAAADxgbWlncmF0ZWAgY2FsbGVkIHdoaWxlIHRoZSBzdG9yZWQgbGF5b3V0IGlzIGFscmVhZHkgY3VycmVudC4AAAAQTm90aGluZ1RvTWlncmF0ZQAAG2QAAAAmYFN0b3JhZ2VWZXJzaW9uYCBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAAABRTdG9yYWdlVmVyc2lvbk5vdFNldAAAG2U=", "AAAABQAAABVFbWl0dGVkIGJ5IGBtaWdyYXRlYC4AAAAAAAAAAAAACE1pZ3JhdGVkAAAAAQAAAAhtaWdyYXRlZAAAAAIAAAAAAAAAFGZyb21fc3RvcmFnZV92ZXJzaW9uAAAABAAAAAAAAAAAAAAAEnRvX3N0b3JhZ2VfdmVyc2lvbgAAAAAABAAAAAAAAAAC", "AAAABQAAAE1FbWl0dGVkIGJ5IGBhcHBseWAuIFRoZSBlbWl0dGluZyBjb250cmFjdCBhZGRyZXNzIGlzIHRoZSBldmVudCdzIGNvbnRyYWN0IGlkLgAAAAAAAAAAAAAIVXBncmFkZWQAAAABAAAACHVwZ3JhZGVkAAAAAwAAAAAAAAAJZnJvbV9oYXNoAAAAAAAD7gAAACAAAAABAAAAAAAAAAd0b19oYXNoAAAAA+4AAAAgAAAAAQAAAAAAAAAHdmVyc2lvbgAAAAAQAAAAAAAAAAI=", "AAAABQAAABpFbWl0dGVkIGJ5IGBzeW5jX3ZlcnNpb25gLgAAAAAAAAAAAA1WZXJzaW9uU3luY2VkAAAAAAAAAQAAAA52ZXJzaW9uX3N5bmNlZAAAAAAAAQAAAAAAAAAHdmVyc2lvbgAAAAAQAAAAAAAAAAI="]),
      options
    );
  }

   static deploy<T = Client>({ admin, governor, manager, current_hash, version }: { admin: string | Address; governor: string | Address; manager: string | Address; current_hash: Uint8Array; version: string }, options: MethodOptions & Omit<ContractClientOptions, 'contractId'> & { salt?: Uint8Array; address?: string; } & ({ wasmHash: Uint8Array | string; format?: "hex" | "base64"; externalRef?: never; } | { externalRef: ExternalExecutableRef; wasmHash?: never; format?: never; })): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({ admin, governor, manager, current_hash, version }, options);
  }
  public readonly fromJson = {
    admin : this.txFromJson<string>,  launch : this.txFromJson<void>,  execute : this.txFromJson<Uint8Array>,  migrate : this.txFromJson<void>,  upgrade : this.txFromJson<void>,  version : this.txFromJson<string>,  governor : this.txFromJson<string>,  wasm_hash : this.txFromJson<Uint8Array>,  sync_version : this.txFromJson<void>,  storage_version : this.txFromJson<number>,  check_authorization : this.txFromJson<number>
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
   * Build a topics filter row for the "Execute" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  executeEventFilter(topicValues?: { governor?: string | Address; target?: string | Address; proposal_id?: Uint8Array }): string[] {
    return this.spec.eventTopicFilter("Execute", topicValues);
  }
  /**
   * Build a topics filter row for the "TreasuryLaunched" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  treasuryLaunchedEventFilter(topicValues?: { treasury?: string | Address }): string[] {
    return this.spec.eventTopicFilter("TreasuryLaunched", topicValues);
  }
  /**
   * Build a topics filter row for the "TreasuryInitialized" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  treasuryInitializedEventFilter(topicValues?: { admin?: string | Address }): string[] {
    return this.spec.eventTopicFilter("TreasuryInitialized", topicValues);
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
}