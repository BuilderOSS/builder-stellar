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
   * Refuses to run while the stored layout differs from the code's
   * (`StorageVersionMismatch`; see `migrate`).
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
   * - any other target: invo
   */
  execute({ targets, functions, args, description_hash }: { targets: Array<string | Address>; functions: Array<string>; args: Array<Array<any>>; description_hash: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<Uint8Array>>;
  /**
   * Manager-only early handoff (`manager.open_assurance`): the admin
   * becomes the Treasury itself and the contract stays in Setup, so its
   * setup-only calls are frozen until launch. `treasury` must be this
   * contract (`TreasuryMismatch`); fails `AlreadyLive` once launched.
   */
  handoff({ treasury }: { treasury: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Moves the stored data to the layout this code expects (`STORAGE_VERSION`)
   * and emits `Migrated`. Fails `NothingToMigrate` unless the stored layout
   * is older than the code's.
   *
   * Anyone may call it. It runs only the migration the installed code
   * defines, which the Manager approved and the module admin installed, and
   * only once per layout.
   *
   * This is the second step of a Treasury upgrade that changes its layout.
   * The Treasury runs a proposal on the code it started with until the
   * proposal ends, so a `migrate` action after its own `upgrade` in the same
   * proposal still runs the old code, finds nothing to do and reverts the
   * whole proposal. Once the upgrade proposal has executed, `execute`
   * refuses every proposal (`StorageVersionMismatch`) until this is called,
   * which is why it must not need a proposal. For the same reason a
   * Treasury migration must be bounded and must not fail: if it did, no
   * proposal could run again to upgrade the Treasury to fixed code.
   */
  migrate(options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Setup-phase upgrade by the launch admin. After launch the admin is the
   * Treasury itself, whose auth nobody can produce externally, so this is
   * dead after launch; governance upgrades go through `execute` ->
   * `self_dispatch("upgrade")`.
   *
   * `from_hash` must be the running code's hash and the Manager must
   * approve `from_hash -> to_hash`. Not behind the storage-layout gate.
   */
  upgrade({ from_hash, to_hash }: { from_hash: Uint8Array; to_hash: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * The release of the running code, looked up in the Manager registry by
   * its hash.
   */
  version(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * The Governor whose queued proposals `execute` consumes.
   */
  governor(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * WASM hash of the running code, as recorded by the last upgrade.
   */
  wasm_hash(options?: MethodOptions): Promise<AssembledTransaction<Uint8Array>>;
  /**
   * Storage-layout version of the data held by this contract. While it
   * differs from the code's `STORAGE_VERSION`, `execute`, `launch` and
   * `handoff` fail `StorageVersionMismatch` until `migrate` brings the two
   * back in step (or, during setup only, the launch admin upgrades again).
   */
  storage_version(options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * Read-only check of the trees an `authorize` action would carry: decodes
   * them, enforces `MAX_AUTH_DEPTH` / `MAX_AUTH_NODES`, refuses a node for
   * the Governor's `consume`, and returns the node count. Anyone may call
   * it; simulate it before proposing. Panics `InvalidAuthorization` or
   * `CannotConsume` exactly as `execute` would.
   */
  check_authorization({ nodes }: { nodes: Array<AuthNode> }, options?: MethodOptions): Promise<AssembledTransaction<number>>;
}

export class Client extends ContractClient {
  constructor(public readonly options: ContractClientOptions) {
    super(
      new Spec(["AAAABAAAADlUcmVhc3VyeSBlcnJvcnMgKGJsb2NrIGBjb21tb246OmVycm9yOjpjb2Rlczo6VFJFQVNVUllgKS4AAAAAAAAAAAAADVRyZWFzdXJ5RXJyb3IAAAAAAAAHAAAAJmBsYXVuY2hgIHRyZWFzdXJ5IGlzIG5vdCB0aGlzIGNvbnRyYWN0AAAAAAAQVHJlYXN1cnlNaXNtYXRjaAAAHbEAAABMQSBwcm9wb3NhbCBhY3Rpb24gdGFyZ2V0cyB0aGUgVHJlYXN1cnkgd2l0aCBhIGZ1bmN0aW9uIG91dHNpZGUgdGhlIGFsbG93bGlzdAAAAA9Vbmtub3duU2VsZkNhbGwAAAAdsgAAAD5Xcm9uZyBudW1iZXIgb3IgdHlwZSBvZiBhcmd1bWVudHMgZm9yIGFuIGFsbG93bGlzdGVkIHNlbGYgY2FsbAAAAAAAE0ludmFsaWRTZWxmQ2FsbEFyZ3MAAAAdswAAADBgdGFyZ2V0c2AsIGBmdW5jdGlvbnNgIGFuZCBgYXJnc2AgbGVuZ3RocyBkaWZmZXIAAAAVSW52YWxpZFByb3Bvc2FsTGVuZ3RoAAAAAAAdtAAAAGJBbiBgYXV0aG9yaXplYCBhY3Rpb24gaXMgbWFsZm9ybWVkLCB0b28gbGFyZ2UsIG9yIG5vdCBmb2xsb3dlZCBieSBhbgpleHRlcm5hbCBjYWxsIGl0IGNhbiBhcHBseSB0bwAAAAAAFEludmFsaWRBdXRob3JpemF0aW9uAAAdtQAAAIlBIHByb3Bvc2FsIGFjdGlvbiwgb3IgYW4gYXV0aG9yaXphdGlvbiB0cmVlLCBjYWxscyB0aGUgR292ZXJub3IncwpgY29uc3VtZWAuIE9ubHkgYGV4ZWN1dGVgIGNvbnN1bWVzIGEgcHJvcG9zYWwsIGFuZCBvbmx5IHRoZSBvbmUgaXQgcnVucwAAAAAAAA1DYW5ub3RDb25zdW1lAAAAAAAdtgAAAJFUaGUgc3RvcmVkIGRhdGEgbGF5b3V0IGRpZmZlcnMgZnJvbSB0aGUgb25lIHRoaXMgY29kZSBleHBlY3RzOiBhCm1pZ3JhdGlvbiBpcyBkdWUgKGFueW9uZSBtYXkgY2FsbCBgbWlncmF0ZWApLCBvciB0aGUgY29kZSBpcyBvbGRlcgp0aGFuIHRoZSBkYXRhAAAAAAAAFlN0b3JhZ2VWZXJzaW9uTWlzbWF0Y2gAAAAAHbc=", "AAAABQAAAQBFbWl0dGVkIGJ5IGBleGVjdXRlYCBhZnRlciBlYWNoIHByb3Bvc2FsIGFjdGlvbiBydW5zLCBpbmNsdWRpbmcgc2VsZgpjYWxscyBhbmQgYGF1dGhvcml6ZWAgYWN0aW9ucywgaW4gb3JkZXIuIEFsbCBvZiBhIHByb3Bvc2FsJ3MgYEV4ZWN1dGVgCmV2ZW50cyBzaGFyZSBvbmUgdHJhbnNhY3Rpb24gd2l0aCB0aGUgR292ZXJub3IncyBgUHJvcG9zYWxFeGVjdXRlZGA7IGlmCmFueSBhY3Rpb24gZmFpbHMsIG5vbmUgb2YgdGhlbSBpcyBwdWJsaXNoZWQuAAAAAAAAAAdFeGVjdXRlAAAAAAEAAAAHZXhlY3V0ZQAAAAAFAAAAAAAAAAhnb3Zlcm5vcgAAABMAAAABAAAAAAAAAAZ0YXJnZXQAAAAAABMAAAABAAAAAAAAAAtwcm9wb3NhbF9pZAAAAAPuAAAAIAAAAAEAAAAAAAAACGZ1bmN0aW9uAAAAEQAAAAAAAAApUG9zaXRpb24gb2YgdGhlIGNhbGwgd2l0aGluIHRoZSBwcm9wb3NhbC4AAAAAAAAFaW5kZXgAAAAAAAAEAAAAAAAAAAI=", "AAAABQAAAERFbWl0dGVkIG9uY2Ugd2hlbiB0aGUgTWFuYWdlciBsYXVuY2hlcyB0aGUgdHJlYXN1cnkgKFNldHVwIC0+IExpdmUpLgAAAAAAAAAQVHJlYXN1cnlMYXVuY2hlZAAAAAEAAAARdHJlYXN1cnlfbGF1bmNoZWQAAAAAAAABAAAAAAAAAAh0cmVhc3VyeQAAABMAAAABAAAAAg==", "AAAABQAAAHhFbWl0dGVkIG9uY2UsIGJ5IHRoZSBjb25zdHJ1Y3RvcjogdGhlIHNldHVwLXBoYXNlIGFkbWluIGFuZCB0aGUgR292ZXJub3IKd2hvc2UgcHJvcG9zYWxzIHRoaXMgVHJlYXN1cnkgZXhlY3V0ZXMgKGZpeGVkKS4AAAAAAAAAE1RyZWFzdXJ5SW5pdGlhbGl6ZWQAAAAAAQAAABR0cmVhc3VyeV9pbml0aWFsaXplZAAAAAIAAAAAAAAABWFkbWluAAAAAAAAEwAAAAEAAAAAAAAACGdvdmVybm9yAAAAEwAAAAAAAAAC", "AAAAAQAAAnJPbmUgY29udHJhY3QgaW52b2NhdGlvbiB0aGUgVHJlYXN1cnkgcHJlLWF1dGhvcml6ZXMsIHdpdGggdGhlIGludm9jYXRpb25zCmJlbG93IGl0IHRoYXQgYWxzbyBuZWVkIHRoZSBUcmVhc3VyeSdzIGF1dGhvcml6YXRpb24uCgpBIHByb3Bvc2FsIGFjdGlvbiBhaW1lZCBhdCB0aGUgVHJlYXN1cnkgaXRzZWxmIHdpdGggZnVuY3Rpb24gYGF1dGhvcml6ZWAKYW5kIGEgc2luZ2xlIGBWZWM8QXV0aE5vZGU+YCBhcmd1bWVudCBhZGRzIHRoZXNlIHRyZWVzIHRvIHRoZSBUcmVhc3VyeSdzCmF1dGhvcml6YXRpb24gZm9yIHRoZSAqbmV4dCogYWN0aW9uLiBVc2UgaXQgd2hlbiB0aGUgbmV4dCBjYWxsIHJlYWNoZXMgYQpjb250cmFjdCB0aGF0IHJlcXVpcmVzIHRoZSBUcmVhc3VyeSdzIGF1dGggZGVlcGVyIGluIHRoZSBjYWxsIHN0YWNrIChmb3IKZXhhbXBsZSBhIHRva2VuIGB0cmFuc2ZlcmAgZnJvbSB0aGUgVHJlYXN1cnkgbWFkZSBieSBhIG1hcmtldHBsYWNlIG9yIGFuCkFNTSkuIEJlY2F1c2UgaXQgaXMgYW4gb3JkaW5hcnkgYWN0aW9uLCB0aGUgdHJlZXMgYXJlIHBhcnQgb2YgdGhlIHByb3Bvc2FsCmlkIGFuZCB2b3RlcnMgYXBwcm92ZSB0aGVtIHdpdGggdGhlIHJlc3Qgb2YgdGhlIHByb3Bvc2FsLgAAAAAAAAAAAAhBdXRoTm9kZQAAAAQAAABIVGhlIGV4YWN0IGFyZ3VtZW50cyBvZiB0aGUgY2FsbDsgYW55IG90aGVyIGFyZ3VtZW50cyBhcmUgbm90IGF1dGhvcml6ZWQuAAAABGFyZ3MAAAPqAAAAAAAAACxUaGUgY29udHJhY3QgdGhlIGF1dGhvcml6ZWQgY2FsbCBpcyBtYWRlIHRvLgAAAAhjb250cmFjdAAAABMAAAA8VGhlIGZ1bmN0aW9uIGNhbGxlZDsgaXQgbWF5IG5vdCBiZSB0aGUgR292ZXJub3IncyBgY29uc3VtZWAuAAAAB2ZuX25hbWUAAAAAEQAAAEZDYWxscyBtYWRlIGJlbG93IHRoaXMgb25lIHRoYXQgYWxzbyBuZWVkIHRoZSBUcmVhc3VyeSdzIGF1dGhvcml6YXRpb24uAAAAAAADc3ViAAAAA+oAAAfQAAAACEF1dGhOb2Rl", "AAAAAAAAAEtNb2R1bGUgYWRtaW46IHRoZSBsYXVuY2ggYWRtaW4gZHVyaW5nIHNldHVwLCB0aGUgVHJlYXN1cnkgaXRzZWxmIG9uY2UgbGl2ZS4AAAAABWFkbWluAAAAAAAAAAAAAAEAAAAT", "AAAAAAAAAOBPbmUtc2hvdCwgTWFuYWdlci1vbmx5IGxhdW5jaCBoYW5kb2ZmIChTZXR1cCAtPiBMaXZlKS4KCkhhbmRzIHRoZSBhZG1pbiB0byBgdHJlYXN1cnlgICh3aGljaCBtdXN0IGJlIHRoaXMgY29udHJhY3QncyBvd24KYWRkcmVzcyksIG1hcmtzIHRoZSBtb2R1bGUgbGl2ZSwgYW5kIGVtaXRzIGBUcmVhc3VyeUxhdW5jaGVkYC4gQSBzZWNvbmQKY2FsbCBwYW5pY3Mgd2l0aCBgQWxyZWFkeUxpdmVgLgAAAAZsYXVuY2gAAAAAAAEAAAAAAAAACHRyZWFzdXJ5AAAAEwAAAAA=", "AAAAAAAABABFeGVjdXRlcyBhIHF1ZXVlZCBwcm9wb3NhbC4gVGhlIFRyZWFzdXJ5IGlzIHRoZSB0b3AtbGV2ZWwgZXhlY3V0b3IuCgpBbnlvbmUgbWF5IGNhbGwgdGhpczsgYXV0aG9yaXR5IGNvbWVzIGZyb20gdGhlIEdvdmVybm9yJ3MgYXBwcm92YWwuClJlZnVzZXMgdG8gcnVuIHdoaWxlIHRoZSBzdG9yZWQgbGF5b3V0IGRpZmZlcnMgZnJvbSB0aGUgY29kZSdzCihgU3RvcmFnZVZlcnNpb25NaXNtYXRjaGA7IHNlZSBgbWlncmF0ZWApLgoKMS4gYGdvdmVybm9yLmNvbnN1bWUoLi4uKWAgKGEgcmV0dXJuaW5nIGNhbGwpIGNoZWNrcyB0aGUgcHJvcG9zYWwgaXMKUXVldWVkLCBwYXN0IGl0cyBFVEEgYW5kIHVuZXhwaXJlZCwgbWFya3MgaXQgRXhlY3V0ZWQsIGFuZCByZXR1cm5zIHRoZQpwcm9wb3NhbCBpZC4gVGhlIEdvdmVybm9yIHJlcXVpcmVzIHRoZSBUcmVhc3VyeSdzIGF1dGgsIHdoaWNoIGlzCnNhdGlzZmllZCBpbXBsaWNpdGx5IGJlY2F1c2UgdGhlIFRyZWFzdXJ5IGlzIHRoZSBkaXJlY3QgaW52b2tlci4gVGhlCkdvdmVybm9yIGlzIG5vIGxvbmdlciBvbiB0aGUgY2FsbCBzdGFjayBhZnRlcndhcmRzLCBzbyB0YXJnZXRzIG1heQpjYWxsIHRoZSBHb3Zlcm5vcidzIGFkbWluIHNldHRlcnMgKFNvcm9iYW4gZm9yYmlkcyByZS1lbnRyeSkuCjIuIEVhY2ggYWN0aW9uIGlzIGRpc3BhdGNoZWQgaW4gb3JkZXI6Ci0gdGFyZ2V0ID0gdGhpcyBjb250cmFjdCwgZnVuY3Rpb24gYGF1dGhvcml6ZWA6IHN0b3JlcyBleHRyYQphdXRob3JpemF0aW9uIHRyZWVzIChvbmUgYFZlYzxBdXRoTm9kZT5gIGFyZ3VtZW50KSBmb3IgdGhlIG5leHQKYWN0aW9uLCB3aGljaCBtdXN0IGJlIGFuIGV4dGVybmFsIGNhbGw7Ci0gdGFyZ2V0ID0gdGhpcyBjb250cmFjdCwgYW55IG90aGVyIGZ1bmN0aW9uOiB0aGUgaW50ZXJuYWwgYWxsb3dsaXN0CmBzZWxmX2Rpc3BhdGNoYCAobmV2ZXIgYGludm9rZV9jb250cmFjdGAsIHdoaWNoIHdvdWxkIGJlIGEKZm9yYmlkZGVuIHJlLWVudHJ5KTsKLSBhbnkgb3RoZXIgdGFyZ2V0OiBpbnZvAAAAB2V4ZWN1dGUAAAAABAAAAAAAAAAHdGFyZ2V0cwAAAAPqAAAAEwAAAAAAAAAJZnVuY3Rpb25zAAAAAAAD6gAAABEAAAAAAAAABGFyZ3MAAAPqAAAD6gAAAAAAAAAAAAAAEGRlc2NyaXB0aW9uX2hhc2gAAAPuAAAAIAAAAAEAAAPuAAAAIA==", "AAAAAAAAAQhNYW5hZ2VyLW9ubHkgZWFybHkgaGFuZG9mZiAoYG1hbmFnZXIub3Blbl9hc3N1cmFuY2VgKTogdGhlIGFkbWluCmJlY29tZXMgdGhlIFRyZWFzdXJ5IGl0c2VsZiBhbmQgdGhlIGNvbnRyYWN0IHN0YXlzIGluIFNldHVwLCBzbyBpdHMKc2V0dXAtb25seSBjYWxscyBhcmUgZnJvemVuIHVudGlsIGxhdW5jaC4gYHRyZWFzdXJ5YCBtdXN0IGJlIHRoaXMKY29udHJhY3QgKGBUcmVhc3VyeU1pc21hdGNoYCk7IGZhaWxzIGBBbHJlYWR5TGl2ZWAgb25jZSBsYXVuY2hlZC4AAAAHaGFuZG9mZgAAAAABAAAAAAAAAAh0cmVhc3VyeQAAABMAAAAA", "AAAAAAAAA7RNb3ZlcyB0aGUgc3RvcmVkIGRhdGEgdG8gdGhlIGxheW91dCB0aGlzIGNvZGUgZXhwZWN0cyAoYFNUT1JBR0VfVkVSU0lPTmApCmFuZCBlbWl0cyBgTWlncmF0ZWRgLiBGYWlscyBgTm90aGluZ1RvTWlncmF0ZWAgdW5sZXNzIHRoZSBzdG9yZWQgbGF5b3V0CmlzIG9sZGVyIHRoYW4gdGhlIGNvZGUncy4KCkFueW9uZSBtYXkgY2FsbCBpdC4gSXQgcnVucyBvbmx5IHRoZSBtaWdyYXRpb24gdGhlIGluc3RhbGxlZCBjb2RlCmRlZmluZXMsIHdoaWNoIHRoZSBNYW5hZ2VyIGFwcHJvdmVkIGFuZCB0aGUgbW9kdWxlIGFkbWluIGluc3RhbGxlZCwgYW5kCm9ubHkgb25jZSBwZXIgbGF5b3V0LgoKVGhpcyBpcyB0aGUgc2Vjb25kIHN0ZXAgb2YgYSBUcmVhc3VyeSB1cGdyYWRlIHRoYXQgY2hhbmdlcyBpdHMgbGF5b3V0LgpUaGUgVHJlYXN1cnkgcnVucyBhIHByb3Bvc2FsIG9uIHRoZSBjb2RlIGl0IHN0YXJ0ZWQgd2l0aCB1bnRpbCB0aGUKcHJvcG9zYWwgZW5kcywgc28gYSBgbWlncmF0ZWAgYWN0aW9uIGFmdGVyIGl0cyBvd24gYHVwZ3JhZGVgIGluIHRoZSBzYW1lCnByb3Bvc2FsIHN0aWxsIHJ1bnMgdGhlIG9sZCBjb2RlLCBmaW5kcyBub3RoaW5nIHRvIGRvIGFuZCByZXZlcnRzIHRoZQp3aG9sZSBwcm9wb3NhbC4gT25jZSB0aGUgdXBncmFkZSBwcm9wb3NhbCBoYXMgZXhlY3V0ZWQsIGBleGVjdXRlYApyZWZ1c2VzIGV2ZXJ5IHByb3Bvc2FsIChgU3RvcmFnZVZlcnNpb25NaXNtYXRjaGApIHVudGlsIHRoaXMgaXMgY2FsbGVkLAp3aGljaCBpcyB3aHkgaXQgbXVzdCBub3QgbmVlZCBhIHByb3Bvc2FsLiBGb3IgdGhlIHNhbWUgcmVhc29uIGEKVHJlYXN1cnkgbWlncmF0aW9uIG11c3QgYmUgYm91bmRlZCBhbmQgbXVzdCBub3QgZmFpbDogaWYgaXQgZGlkLCBubwpwcm9wb3NhbCBjb3VsZCBydW4gYWdhaW4gdG8gdXBncmFkZSB0aGUgVHJlYXN1cnkgdG8gZml4ZWQgY29kZS4AAAAHbWlncmF0ZQAAAAAAAAAAAA==", "AAAAAAAAAW1TZXR1cC1waGFzZSB1cGdyYWRlIGJ5IHRoZSBsYXVuY2ggYWRtaW4uIEFmdGVyIGxhdW5jaCB0aGUgYWRtaW4gaXMgdGhlClRyZWFzdXJ5IGl0c2VsZiwgd2hvc2UgYXV0aCBub2JvZHkgY2FuIHByb2R1Y2UgZXh0ZXJuYWxseSwgc28gdGhpcyBpcwpkZWFkIGFmdGVyIGxhdW5jaDsgZ292ZXJuYW5jZSB1cGdyYWRlcyBnbyB0aHJvdWdoIGBleGVjdXRlYCAtPgpgc2VsZl9kaXNwYXRjaCgidXBncmFkZSIpYC4KCmBmcm9tX2hhc2hgIG11c3QgYmUgdGhlIHJ1bm5pbmcgY29kZSdzIGhhc2ggYW5kIHRoZSBNYW5hZ2VyIG11c3QKYXBwcm92ZSBgZnJvbV9oYXNoIC0+IHRvX2hhc2hgLiBOb3QgYmVoaW5kIHRoZSBzdG9yYWdlLWxheW91dCBnYXRlLgAAAAAAAAd1cGdyYWRlAAAAAAIAAAAAAAAACWZyb21faGFzaAAAAAAAA+4AAAAgAAAAAAAAAAd0b19oYXNoAAAAA+4AAAAgAAAAAA==", "AAAAAAAAAE9UaGUgcmVsZWFzZSBvZiB0aGUgcnVubmluZyBjb2RlLCBsb29rZWQgdXAgaW4gdGhlIE1hbmFnZXIgcmVnaXN0cnkgYnkKaXRzIGhhc2guAAAAAAd2ZXJzaW9uAAAAAAAAAAABAAAAEA==", "AAAAAAAAADdUaGUgR292ZXJub3Igd2hvc2UgcXVldWVkIHByb3Bvc2FscyBgZXhlY3V0ZWAgY29uc3VtZXMuAAAAAAhnb3Zlcm5vcgAAAAAAAAABAAAAEw==", "AAAAAAAAAD9XQVNNIGhhc2ggb2YgdGhlIHJ1bm5pbmcgY29kZSwgYXMgcmVjb3JkZWQgYnkgdGhlIGxhc3QgdXBncmFkZS4AAAAACXdhc21faGFzaAAAAAAAAAAAAAABAAAD7gAAACA=", "AAAAAAAAAZlJbml0aWFsaXplcyB0aGUgdHJlYXN1cnkuIENhbGxlZCBvbmNlLCBhdCBkZXBsb3ltZW50LgoKKiBgYWRtaW5gIC0gc2V0dXAtcGhhc2UgYWRtaW4gKHRoZSBsYXVuY2ggYWRtaW4pOyBiZWNvbWVzIHRoZSBUcmVhc3VyeSBpdHNlbGYgYXQgbGF1bmNoCiogYGdvdmVybm9yYCAtIEdvdmVybm9yIHdob3NlIHF1ZXVlZCBwcm9wb3NhbHMgYGV4ZWN1dGVgIGNvbnN1bWVzIChmaXhlZCkKKiBgbWFuYWdlcmAgLSBNYW5hZ2VyIGNvbnRyYWN0ICh1cGdyYWRlIGFwcHJvdmFscywgbGF1bmNoKQoqIGBjdXJyZW50X2hhc2hgIC0gdGhpcyBpbXBsZW1lbnRhdGlvbidzIFdBU00gaGFzaAoKUmVjb3JkcyBgU1RPUkFHRV9WRVJTSU9OYCBhcyB0aGUgbGF5b3V0IG9mIHRoZSBkYXRhLiBFbWl0cwpgVHJlYXN1cnlJbml0aWFsaXplZGAuAAAAAAAADV9fY29uc3RydWN0b3IAAAAAAAAEAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAACGdvdmVybm9yAAAAEwAAAAAAAAAHbWFuYWdlcgAAAAATAAAAAAAAAAxjdXJyZW50X2hhc2gAAAPuAAAAIAAAAAA=", "AAAAAAAAARNTdG9yYWdlLWxheW91dCB2ZXJzaW9uIG9mIHRoZSBkYXRhIGhlbGQgYnkgdGhpcyBjb250cmFjdC4gV2hpbGUgaXQKZGlmZmVycyBmcm9tIHRoZSBjb2RlJ3MgYFNUT1JBR0VfVkVSU0lPTmAsIGBleGVjdXRlYCwgYGxhdW5jaGAgYW5kCmBoYW5kb2ZmYCBmYWlsIGBTdG9yYWdlVmVyc2lvbk1pc21hdGNoYCB1bnRpbCBgbWlncmF0ZWAgYnJpbmdzIHRoZSB0d28KYmFjayBpbiBzdGVwIChvciwgZHVyaW5nIHNldHVwIG9ubHksIHRoZSBsYXVuY2ggYWRtaW4gdXBncmFkZXMgYWdhaW4pLgAAAAAPc3RvcmFnZV92ZXJzaW9uAAAAAAAAAAABAAAABA==", "AAAAAAAAAUNSZWFkLW9ubHkgY2hlY2sgb2YgdGhlIHRyZWVzIGFuIGBhdXRob3JpemVgIGFjdGlvbiB3b3VsZCBjYXJyeTogZGVjb2Rlcwp0aGVtLCBlbmZvcmNlcyBgTUFYX0FVVEhfREVQVEhgIC8gYE1BWF9BVVRIX05PREVTYCwgcmVmdXNlcyBhIG5vZGUgZm9yCnRoZSBHb3Zlcm5vcidzIGBjb25zdW1lYCwgYW5kIHJldHVybnMgdGhlIG5vZGUgY291bnQuIEFueW9uZSBtYXkgY2FsbAppdDsgc2ltdWxhdGUgaXQgYmVmb3JlIHByb3Bvc2luZy4gUGFuaWNzIGBJbnZhbGlkQXV0aG9yaXphdGlvbmAgb3IKYENhbm5vdENvbnN1bWVgIGV4YWN0bHkgYXMgYGV4ZWN1dGVgIHdvdWxkLgAAAAATY2hlY2tfYXV0aG9yaXphdGlvbgAAAAABAAAAAAAAAAVub2RlcwAAAAAAA+oAAAfQAAAACEF1dGhOb2RlAAAAAQAAAAQ=", "AAAABQAAAKtFbWl0dGVkIGJ5IFtgaGFuZG9mZmBdLiBUaGUgZW1pdHRpbmcgY29udHJhY3QgYWRkcmVzcyBpcyB0aGUgZXZlbnQncyBjb250cmFjdCBpZC4KClNhbWUgc2hhcGUgYXMgdGhlIE1hbmFnZXIncyBvd24gYEFkbWluQ2hhbmdlZGAsIHNvIGluZGV4ZXJzIGRlY29kZSBib3RoCndpdGggb25lIHNjaGVtYS4AAAAAAAAAAAxBZG1pbkNoYW5nZWQAAAABAAAADWFkbWluX2NoYW5nZWQAAAAAAAACAAAAMFRoZSBhZG1pbiBiZWZvcmUgdGhlIGhhbmRvZmYgKHRoZSBsYXVuY2ggYWRtaW4pLgAAAAlvbGRfYWRtaW4AAAAAAAATAAAAAQAAACJUaGUgYWRtaW4gYWZ0ZXIgaXQgKHRoZSBUcmVhc3VyeSkuAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAEAAAAC", "AAAABAAAAD5FcnJvcnMgc2hhcmVkIGJ5IGFsbCBtb2R1bGUgY29udHJhY3RzIChibG9jayBgY29kZXM6OkNPTU1PTmApLgAAAAAAAAAAAAtDb21tb25FcnJvcgAAAAANAAAANE9wZXJhdGlvbiByZXF1aXJlcyB0aGUgbW9kdWxlIHRvIGJlIGxpdmUgKGxhdW5jaGVkKS4AAAAHTm90TGl2ZQAAABtZAAAAQU9wZXJhdGlvbiBpcyBvbmx5IHZhbGlkIGR1cmluZyBzZXR1cDsgdGhlIG1vZHVsZSBpcyBhbHJlYWR5IGxpdmUuAAAAAAAAC0FscmVhZHlMaXZlAAAAG1oAAAAlTWFuYWdlciBhZGRyZXNzIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAAAAA1NYW5hZ2VyTm90U2V0AAAAAAAbWwAAACNgQ3VycmVudEhhc2hgIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAARQ3VycmVudEhhc2hOb3RTZXQAAAAAABtcAAAANGBmcm9tX2hhc2hgIGRvZXMgbm90IGVxdWFsIHRoZSBzdG9yZWQgYEN1cnJlbnRIYXNoYC4AAAAMSGFzaE1pc21hdGNoAAAbXQAAACpNYW5hZ2VyIGRpZCBub3QgYXBwcm92ZSB0aGlzIHVwZ3JhZGUgcGF0aC4AAAAAABJVcGdyYWRlTm90QXBwcm92ZWQAAAAAG14AAAA1TWFuYWdlciBoYXMgbm8gcmVnaXN0cnkgZW50cnkgZm9yIHRoZSByZXF1ZXN0ZWQgaGFzaC4AAAAAAAAWSW1wbGVtZW50YXRpb25Ob3RGb3VuZAAAAAAbXwAAACJNb2R1bGUgYWRtaW4gbWlzc2luZyBmcm9tIHN0b3JhZ2UuAAAAAAALQWRtaW5Ob3RTZXQAAAAbYAAAAD9UaGUgTWFuYWdlcidzIG93biBgQ3VycmVudE1hbmFnZXJWZXJzaW9uYCBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAADVZlcnNpb25Ob3RTZXQAAAAAABthAAAAJlRyZWFzdXJ5IGFkZHJlc3MgbWlzc2luZyBmcm9tIHN0b3JhZ2UuAAAAAAAOVHJlYXN1cnlOb3RTZXQAAAAAG2IAAAAmR292ZXJub3IgYWRkcmVzcyBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAAAA5Hb3Zlcm5vck5vdFNldAAAAAAbYwAAADxgbWlncmF0ZWAgY2FsbGVkIHdoaWxlIHRoZSBzdG9yZWQgbGF5b3V0IGlzIGFscmVhZHkgY3VycmVudC4AAAAQTm90aGluZ1RvTWlncmF0ZQAAG2QAAAAmYFN0b3JhZ2VWZXJzaW9uYCBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAAABRTdG9yYWdlVmVyc2lvbk5vdFNldAAAG2U=", "AAAABQAAAHZFbWl0dGVkIGJ5IFtgbWlncmF0ZWBdIHdoZW4gdGhlIHN0b3JlZCBsYXlvdXQgbW92ZXMgZm9yd2FyZC4gVGhlIGVtaXR0aW5nCmNvbnRyYWN0IGFkZHJlc3MgaXMgdGhlIGV2ZW50J3MgY29udHJhY3QgaWQuAAAAAAAAAAAACE1pZ3JhdGVkAAAAAQAAAAhtaWdyYXRlZAAAAAIAAAAoVGhlIGxheW91dCB2ZXJzaW9uIGJlZm9yZSB0aGUgbWlncmF0aW9uLgAAABRmcm9tX3N0b3JhZ2VfdmVyc2lvbgAAAAQAAAAAAAAAO1RoZSBsYXlvdXQgdmVyc2lvbiBhZnRlciBpdCAodGhlIGNvZGUncyBgU1RPUkFHRV9WRVJTSU9OYCkuAAAAABJ0b19zdG9yYWdlX3ZlcnNpb24AAAAAAAQAAAAAAAAAAg==", "AAAABQAAAE1FbWl0dGVkIGJ5IGBhcHBseWAuIFRoZSBlbWl0dGluZyBjb250cmFjdCBhZGRyZXNzIGlzIHRoZSBldmVudCdzIGNvbnRyYWN0IGlkLgAAAAAAAAAAAAAIVXBncmFkZWQAAAABAAAACHVwZ3JhZGVkAAAAAwAAACFUaGUgY29kZSBoYXNoIGJlZm9yZSB0aGUgdXBncmFkZS4AAAAAAAAJZnJvbV9oYXNoAAAAAAAD7gAAACAAAAABAAAAF1RoZSBjb2RlIGhhc2ggYWZ0ZXIgaXQuAAAAAAd0b19oYXNoAAAAA+4AAAAgAAAAAQAAAC1UaGUgcmVnaXN0cnkncyByZWxlYXNlIHZlcnNpb24gZm9yIGB0b19oYXNoYC4AAAAAAAAHdmVyc2lvbgAAAAAQAAAAAAAAAAI="]),
      options
    );
  }

   static deploy<T = Client>({ admin, governor, manager, current_hash }: { admin: string | Address; governor: string | Address; manager: string | Address; current_hash: Uint8Array }, options: MethodOptions & Omit<ContractClientOptions, 'contractId'> & { salt?: Uint8Array; address?: string; } & ({ wasmHash: Uint8Array | string; format?: "hex" | "base64"; externalRef?: never; } | { externalRef: ExternalExecutableRef; wasmHash?: never; format?: never; })): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({ admin, governor, manager, current_hash }, options);
  }
  public readonly fromJson = {
    admin : this.txFromJson<string>,  launch : this.txFromJson<void>,  execute : this.txFromJson<Uint8Array>,  handoff : this.txFromJson<void>,  migrate : this.txFromJson<void>,  upgrade : this.txFromJson<void>,  version : this.txFromJson<string>,  governor : this.txFromJson<string>,  wasm_hash : this.txFromJson<Uint8Array>,  storage_version : this.txFromJson<number>,  check_authorization : this.txFromJson<number>
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
}