# Treasury contract

Treasury holds DAO assets, is the admin of all six modules after launch, and is the top-level executor of approved proposals. Governor decides eligibility; it does not dispatch actions.

## Interface

```text
execute(targets: Vec<Address>, functions: Vec<Symbol>,
        args: Vec<Vec<Val>>, description_hash: BytesN<32>) -> BytesN<32>
check_authorization(nodes: Vec<AuthNode>) -> u32   // read-only, simulate before proposing
governor() -> Address
admin() -> Address
launch(treasury: Address)                           // Manager only, one shot
upgrade(from_hash, to_hash); migrate(); sync_version()
version(); wasm_hash(); storage_version()
```

The constructor receives the admin (launch admin), Governor, Manager, current hash, and version. Governor wiring is immutable.

Anyone may submit `execute` once the proposal is Queued, past ETA, and unexpired:

1. Treasury calls `Governor.consume` with the exact vectors/hash. Governor requires Treasury authorization, marks Executed, emits `ProposalExecuted`, and returns the id.
2. Treasury dispatches actions in order (see below). Governor has returned, so an action can call its admin setters without re-entry.
3. Treasury emits one `Execute` per action: topics Governor, target, proposal id; data function and zero-based index.

Any failure reverts the entire transaction, including consumption and earlier actions; the proposal remains Queued until expiry.

## Actions aimed at the Treasury

- `upgrade(from_hash, to_hash)`, `migrate()`, `sync_version()`: internal dispatch (no re-entry). Anything else fails with `UnknownSelfCall` (7602); bad arguments with `InvalidSelfCallArgs` (7603).
- `authorize(nodes: Vec<AuthNode>)`: adds authorization trees to the **next** action. Use it when the next call needs the Treasury's authorization deeper than the Treasury's own call, for example `marketplace.buy(token, treasury, max_price)` (the marketplace pulls the payment from the Treasury) or a router swap. `AuthNode { contract, fn_name, args, sub }` describes one exact invocation and the invocations below it. Trees are part of the proposal, so voters approve them. A dangling, repeated, empty or malformed `authorize`, or one followed by a self call, fails with `InvalidAuthorization` (7605). Bounds: depth 4, 16 nodes.

Example: buy listing `nft` at price 1,000 with a 2.5% fee:

```text
action 0: target treasury, function authorize, args [[
  AuthNode { contract: SAC, fn_name: transfer, args: [treasury, treasury, 25],  sub: [] },
  AuthNode { contract: SAC, fn_name: transfer, args: [treasury, seller,   975], sub: [] } ]]
action 1: target marketplace, function buy, args [nft, treasury, 1000]
```

## Admin

The launch admin can upgrade/migrate/sync during setup. Launch makes the Treasury its own admin (`AdminChanged`, then `TreasuryLaunched`); direct external calls can no longer authorize those functions, so they run through proposal self-dispatch. Manager approvals and current-hash checks still apply.

Errors: block 7600.

## Evidence and tests

- [Implementation](src/contract.rs), [events](src/events.rs), [errors](src/error.rs), [storage and `AuthNode`](src/storage.rs)
- `cargo test -p treasury` (includes `nested_authorization`); [cross-contract tests](../e2e/README.md), including the Treasury buying a marketplace listing by proposal
- [Governor](../governor/README.md), [security](../../docs/SECURITY_MODEL.md)
