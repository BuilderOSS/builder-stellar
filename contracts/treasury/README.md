# Treasury contract

Treasury holds DAO assets, owns all six modules after launch, and is the top-level executor of approved proposals. Governor decides eligibility; it does not dispatch actions.

## Interface

```text
execute(targets: Vec<Address>, functions: Vec<Symbol>,
        args: Vec<Vec<Val>>, description_hash: BytesN<32>) -> BytesN<32>
governor() -> Address
launch(treasury: Address)                 // Manager only, one shot
upgrade(from_hash: BytesN<32>, to_hash: BytesN<32>)
sync_version(); version(); wasm_hash()
```

The constructor receives owner, Governor, Manager, current hash, and version. Governor wiring is immutable; there is no `set_governor`.

Anyone may submit `execute` once the proposal is Queued, past ETA, and unexpired. No membership or executor authorization is required by the contract; a submitting wallet still signs/pays the network transaction.

1. Treasury calls `Governor.consume` with the exact vectors/hash. Governor requires Treasury authorization, marks Executed, emits `ProposalExecuted`, and returns the ID.
2. Treasury dispatches actions in order with authorization for each target call. Governor has returned, so an action can call its owner setters without re-entry.
3. Treasury emits one `Execute` per action: topics Governor, target, proposal ID; data function and zero-based index.

Any failure reverts the entire transaction, including consumption and earlier actions. The proposal remains Queued until expiry. Governor's inherited `execute` always fails with `UseTreasuryExecute` (1508).

## Self-calls and ownership

Treasury-targeted actions use internal dispatch, limited to `upgrade(from_hash, to_hash)` and `sync_version()`. Unknown self-calls or invalid arguments reject. A transfer of held assets normally targets the asset contract's transfer method, not an invented Treasury transfer method.

Setup upgrades/version sync require the launch admin as owner. Launch makes Treasury its own owner and clears pending ownership transfer. Direct external calls cannot supply self-owner authorization afterward; Treasury upgrade/sync occurs through proposal self-dispatch. Manager approvals and current hash checks still apply.

## Evidence and tests

- [Implementation](src/contract.rs), [events](src/events.rs), [errors](src/error.rs)
- `cargo test -p treasury`; [cross-contract tests](../e2e/README.md)
- [Governor](../governor/README.md), [security](../../docs/SECURITY_MODEL.md), [web receipts](../../apps/web/README.md)
