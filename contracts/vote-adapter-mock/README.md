# Mock vote adapter (test and testnet only)

A vote source for the Governor with weights set by an admin. It is the reference implementation of
`common::clients::VoteSourceApi`, which is specified in [docs/designs/governance-adapter.md](../../docs/designs/governance-adapter.md).

**Never approve it on mainnet.** Its admin can give anyone any weight at any time, so it controls every tribe that
votes through it.

```text
__constructor(admin, decimals)
set_votes(account, votes)            admin only; from this ledger on
get_votes(account)                   current votes
get_votes_at_checkpoint(account, ledger)
get_total_supply(); get_total_supply_at_checkpoint(ledger)
voting_supply_at_previous_ledger()   = get_total_supply_at_checkpoint(current - 1)
decimals(); admin()
```

Each `set_votes` appends a `(ledger, votes)` checkpoint for the account and for the total, or overwrites the last one
when that was written in the same ledger. Reads at a past ledger therefore see the value the ledger closed with, as
OpenZeppelin `Votes` does. A read at the current or a future ledger fails with `FutureLookup` (1). It emits no
events, so the indexer needs no role for it.

Tests: `cargo test -p vote-adapter-mock`. The Governor, Manager and e2e adapter tests drive tribes through it.
