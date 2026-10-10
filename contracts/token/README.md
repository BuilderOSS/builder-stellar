# Token contract

NFT governance token with one voting unit per token, delegation/checkpoints, and Metadata mint hooks.

## Voting supply

Tokens held by the DAO's Treasury, Auction and Marketplace carry no votes. Their addresses are wired at construction (immutable). Moving a token into one of them burns its voting unit (it leaves the votes `TotalSupply` checkpoint); moving it out mints the unit for the receiver's delegate. So:

- `total_supply()` / `get_total_supply()` return the voting-capable supply, which the Governor's quorum and proposal threshold use. Unsold auction tokens and escrowed listings never raise the quorum.
- System holders are never auto-delegated and always have `get_votes == 0`, even if they call `delegate`.
- A listed token's vote leaves its holder's delegate until the token returns or is bought; the holder's delegation is unchanged.

## Minting

```text
mint(minter: Address, to: Address) -> u32
batch_mint(minter: Address, recipients: Vec<Address>, amounts: Vec<u128>) -> Vec<u32>
set_mint_authority(authority: Address, enabled: bool)
mint_authority(authority: Address) -> bool
```

Before launch only the admin (launch admin) can mint. `set_mint_authority` requires Live state and the admin (the Treasury, i.e. a proposal). Launch grants Treasury and Marketplace authority, plus Auction if started and the platform Minter if enabled. Mint authorities are persistent per-address entries.

`batch_mint` mints at most 20 tokens per call (`common::MAX_BATCH_MINT`, `BatchTooLarge`): each token emits about 630 bytes of events (OpenZeppelin `Mint`, `MintWithMinter`, metadata `SeedGenerated`) and a transaction may publish 16 KiB. Mint larger founder allocations in several calls. Amounts must be positive with matching vector lengths (`InvalidInput`). Balance, delegation and checkpoint work is done once per recipient entry. Configure artwork before founder minting when initial traits matter.

A first-time recipient without a delegate is self-delegated. Transfers move voting units between delegates and preserve an existing recipient delegation.

## Admin, transfers and reads

```text
transfer(from, to, token_id)
transfer_from(spender, from, to, token_id)
approve(owner, spender, token_id, expiration_ledger)
balance(account); owner_of(token_id)
delegate(account, delegatee); get_delegate(account)
get_votes(account); get_votes_at_checkpoint(account, ledger)
total_supply(); get_total_supply(); get_total_supply_at_checkpoint(ledger)
num_checkpoints(account); metadata(); set_metadata(uri, name, symbol)
admin(); is_live(); launch(treasury, minters)
upgrade(from_hash, to_hash); migrate(); sync_version(); version(); wasm_hash(); storage_version()
```

The constructor takes the admin (launch admin), Treasury, Auction, Marketplace, collection metadata, Metadata contract, Manager, current hash and version. `launch` is Manager-only and one-shot: it checks the wired Treasury and that it is among the minters, hands the admin to the Treasury (`AdminChanged`), and emits `TokenLaunched`. There is no ownership transfer or renounce.

`mint_authority` reports the explicit stored flag; the admin's implicit mint permission is checked separately by the mint path.

Errors: block 7200 (`MintAuthorityNotAllowed` 7201, `InvalidInput` 7202, `TreasuryMismatch` 7203, `TreasuryNotMinter` 7204, `BatchTooLarge` 7205).

## Tests and related

`cargo test -p token` (includes `voting_supply` and `delegation_security` suites). [Source](src/contract.rs), [Metadata](../metadata/README.md), [shared Minter](../minter/README.md), [deployment](../../docs/DAO_DEPLOYMENT.md).
