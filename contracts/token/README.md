# Token contract

NFT governance token with one voting unit per token, delegation/checkpoints, and Metadata mint hooks.

## Voting supply

Tokens held by the DAO's Treasury and by every registered module marked `non_voting` (the Auction and Marketplace, which the Manager registers at `create_dao`) carry no votes. Moving a token into one of them burns its voting unit (it leaves the votes `TotalSupply` checkpoint); moving it out mints the unit for the receiver's delegate. Registering or unregistering a non-voting module moves the votes of whatever it already holds the same way (unregistering self-delegates the module first), so voting units always equal balances and the account checkpoints add up to `TotalSupply` ([design](../../docs/designs/membership-models.md) §1). So:

- `total_supply()` / `get_total_supply()` return the voting-capable supply, which the Governor's quorum and proposal threshold use. Unsold auction tokens and escrowed listings never raise the quorum.
- System holders are never auto-delegated and always have `get_votes == 0`, even if they call `delegate`.
- A listed token's vote leaves its holder's delegate until the token returns or is bought; the holder's delegation is unchanged.

## Minting

```text
mint(minter: Address, to: Address) -> u32
batch_mint(minter: Address, recipients: Vec<Address>, amounts: Vec<u128>) -> Vec<u32>
mint_allowance(module: Address) -> u32
increase_mint_allowance(module: Address, amount: u32)   // admin; registered modules only
decrease_mint_allowance(module: Address, amount: u32)   // admin; saturates at 0
release_mint_allowance(module: Address, amount: u32)    // the module itself
register_module(kind: Symbol, address: Address, non_voting: bool)
unregister_module(address: Address)
modules() -> Vec<ModuleEntry>; module(kind: Symbol) -> Option<Address>
```

The admin (the launch admin in Setup, the Treasury once live) mints without limit. A registered module mints against its `MintAllowance` (a persistent per-module entry; `AllowanceExceeded`); `u32::MAX` is unlimited and never spent. Before launch only the `claims` module may use its allowance, so the Auction's allowance is inert until launch. `launch` raises the allowance of each registered module in its grants.

Modules: in Setup only the Manager registers them; once live only the admin (a proposal). A module must be a deployed Wasm contract (`NotAContract`: wallets, Stellar Asset Contracts and predicted addresses are refused), its kind a built-in kind (`auction`, `marketplace`, `claims`, `circle`) or `custom_<name>` (`InvalidKind`), unique (`KindTaken`), at most 16 modules (`TooManyModules`). `increase_mint_allowance` refuses unregistered addresses (`NotAModule`); `unregister_module` zeroes the allowance. Events: `ModuleRegistered`, `ModuleUnregistered`, `MintAllowanceChanged`. Empty a module before unregistering it: tokens it still holds become its own (uncast) votes.

`batch_mint` must fit the per-call event budget (`common::batch_mint_fits`, `BatchTooLarge`): `300 × tokens + 450 × recipients ≤ 13,500`, i.e. up to 43 tokens to one recipient (`common::MAX_BATCH_MINT`) or 18 recipients with one token each (`common::MAX_BATCH_RECIPIENTS`), because a transaction may publish 16 KiB of events. It emits OpenZeppelin `Mint` per token and one `MintBatchWithMinter { minter, first_token_id, count }` for the range; single `mint` emits `MintWithMinter` per token. Mint larger founder allocations in several calls. Amounts must be positive with matching vector lengths (`InvalidInput`). Balance, delegation and checkpoint work is done once per recipient entry. Configure artwork before founder minting when initial traits matter.

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
admin(); is_live(); launch(treasury, grants: Vec<MintGrant>)
upgrade(from_hash, to_hash); migrate(); version(); wasm_hash(); storage_version()
```

The constructor takes only core wiring plus the membership switches: the admin (launch admin), Treasury, collection metadata, Metadata contract, Manager, current hash and `TokenSettings`. The Manager registers each module right after deploying it. `launch` is Manager-only and one-shot: it checks the wired Treasury, hands the admin to the Treasury (`AdminChanged`), writes each grant (registered modules only, `NotAModule`), and emits `TokenLaunched { treasury, grants }`. There is no ownership transfer or renounce.

Errors: block 7200 (`MintAuthorityNotAllowed` 7201, `InvalidInput` 7202, `TreasuryMismatch` 7203, `BatchTooLarge` 7205, `InvalidName` 7207, `MetadataNotSet` 7208, `NotAModule` 7209, `NotAContract` 7210, `InvalidKind` 7211, `KindTaken` 7212, `ModuleAlreadyRegistered` 7213, `TooManyModules` 7214, `AllowanceExceeded` 7215, `TransfersLocked` 7216, `SettingUnchanged` 7217, `RecoveryOff` 7218, `NotTransferAgent` 7219, `ModuleCustody` 7220, `DelegateNotMember` 7221; 7204 and 7206 retired).

## Membership switches ([design](../../docs/designs/locked-tokens.md))

```text
settings() -> TokenSettings { transfers_locked, members_only_delegation, dao_recovery }
set_transfers_locked(bool); set_members_only_delegation(bool); set_dao_recovery(bool)
dao_transfer(token_id, to)
transfer_agents() -> Vec<Address>; set_transfer_agent(module, bool)
agent_transfer(agent, from, to, token_id)
```

Three on/off switches, chosen at creation and changeable by the admin (the launch admin in Setup, the Treasury by proposal once Live; `SettingUnchanged` for the current value). All off reproduces an open DAO exactly.

- **Locked transfers.** A token moves only along a DAO-controlled path: out of DAO custody (the Treasury or a non-voting module), back to the Treasury, by the Treasury as an approved spender (a DAO-approved transfer), by `dao_transfer`, or by a transfer agent. Everything else fails with `TransfersLocked`. A holder's token can be approved only to the Treasury (the rule reads the token's owner, not the approver; revoking always works); custody may approve anyone. Locking moves no token but removes members' exit by sale.
- **Members-only delegation.** `delegate` to anyone but oneself requires a delegatee holding a token and votes (`DelegateNotMember`); existing delegations stay when it changes.
- **DAO recovery.** While on, `dao_transfer` (admin, Live) moves a token from its current owner, never from or into a module (`ModuleCustody`; `RecoveryOff` when off). One proposal may turn recovery on and use it.
- **Transfer agents.** `set_transfer_agent` follows `register_module`'s authority (the Manager in Setup, for the kinds `create_dao` names; the Treasury once Live). `agent_transfer` (Live) needs the agent's and `from`'s authorization and works locked or not; unregistering a module removes it as an agent.

Events: `TransfersLockChanged`, `MembersOnlyDelegationChanged`, `DaoRecoveryChanged`, `TransferAgentChanged`, `AgentTransfer`, `DaoTransfer`; `TokenInitialized` carries `settings`. Every movement emits OpenZeppelin `Transfer` and moves votes as a transfer does.

## Tests and related

`cargo test -p token` (includes `voting_supply` and `delegation_security` suites). [Source](src/contract.rs), [Metadata](../metadata/README.md), [ClaimMinter](../minter/README.md), [deployment](../../docs/DAO_DEPLOYMENT.md).
