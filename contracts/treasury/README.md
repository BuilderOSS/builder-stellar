# Treasury Contract

Governor-authorized execution boundary for DAO proposals. The treasury holds DAO assets and forwards approved contract calls; it does not create or vote on proposals.

## Main Methods

- `set_governor(governor)` - owner-only governor configuration.
- `governor()` - read the configured governor.
- `execute(target, function, args)` - execute an arbitrary contract call. Only the configured governor may call this method.

The normal flow is `Governor.execute` -> `Treasury.execute` -> target contract. This isolates proposal execution from the governor's voting state.

## Tests

```bash
cargo test -p treasury
```
