# Token Contract

Transferable NFT governance token for the DAO. Each token contributes one voting unit and uses checkpointed voting power for proposal thresholds and votes.

## Behavior

- The owner controls mint authorities.
- Minted tokens self-delegate by default.
- A first receipt self-delegates the token unless delegation already exists.
- Transfers preserve existing delegation.
- `batch_mint` mints 1 to 100 tokens in one call.

## Main Methods

- `mint(minter, to)` and `batch_mint(minter, to, amount)` - mint governance NFTs for an authorized minter.
- `set_mint_authority(authority, enabled)` / `mint_authority(authority)` - manage minters.
- `balance(account)`, `owner_of(token_id)`, and `get_votes(account)` - inspect ownership and voting power.
- `transfer(from, to, token_id)` and `transfer_from(spender, from, to, token_id)` - transfer NFTs.
- `approve(spender, token_id, expiration_ledger)` - authorize a token transfer.

## Tests

```bash
cargo test -p token
```
