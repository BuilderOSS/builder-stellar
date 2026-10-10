# Token contract

NFT governance token with one voting unit per token, delegation/checkpoints, and Metadata mint hooks.

## Minting

```text
mint(minter: Address, to: Address) -> u32
batch_mint(minter: Address, recipients: Vec<Address>, amounts: Vec<u128>) -> Vec<u32>
set_mint_authority(authority: Address, enabled: bool)
mint_authority(authority: Address) -> bool
```

Before launch, only the owner (launch admin) can mint. Mint-authority setters require Live state. Launch grants Treasury and Marketplace authority, plus Auction if started and the platform Minter if enabled. After launch Treasury owns the Token; a governance action can mint or change authorities.

Batch vectors must have matching lengths, positive amounts, and a positive total fitting `u32`. There is no 100-token-per-call or 10,000-founder contract check. CLI batching policy is narrower for resource budgeting. Large batches remain subject to transaction resource limits. The hook seeds token artwork; configure artwork before founder minting when initial traits matter.

First receipt/mint self-delegates an account without an existing delegation. Transfers move voting units between delegates and preserve an existing recipient delegation. Batch handling groups balance/checkpoint work per recipient rather than repeating it per token.

## Ownership and reads

```text
transfer(from, to, token_id)
transfer_from(spender, from, to, token_id)
approve(owner, spender, token_id, expiration_ledger)
balance(account); owner_of(token_id); owner(); get_owner()
delegate(account, delegatee); get_delegate(account)
get_votes(account); get_votes_at_checkpoint(account, ledger)
total_supply(); get_total_supply(); get_total_supply_at_checkpoint(ledger)
metadata(); set_metadata(uri, name, symbol)
is_live(); launch(treasury, minters)
upgrade(from_hash, to_hash); sync_version(); version(); wasm_hash()
```

See generated [client signatures](../../packages/token-bindings/src/client.ts) for inherited method parameter names/types. Constructor wiring includes Treasury, Metadata, and Manager. Launch is Manager-only/one-shot, checks the wired Treasury and its minter inclusion, clears pending ownership transfer, and hands ownership to Treasury.

`mint_authority` reports an explicit stored flag; owner mint permission is checked separately by the mint path. Do not infer owner permission from that getter alone.

## Tests and related

`cargo test -p token`. [Source](src/contract.rs), [Metadata](../metadata/README.md), [shared Minter](../minter/README.md), [deployment](../../docs/DAO_DEPLOYMENT.md).
