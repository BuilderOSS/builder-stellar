# Design: membership token settings (locked transfers, members-only delegation, DAO recovery)

Three on/off switches on the Token, chosen at creation and changeable by vote, plus transfer agents. It shipped with
the [membership models](membership-models.md) in PR #45 (contracts) and PR #46 (web). It was written before the
build, so "today" means the Token before these switches. The owner's decisions D1 to D8 are marked inline where they
were made.

Related: the savings-circle design, `docs/designs/savings-circle.md` on the `feat/savings-circle` branch, plugs in as
a transfer agent (see "How the Circle plugs in later").

## Problem Statement

Some DAOs want membership that is fixed: a member cannot sell or give away their token, and membership changes hands only when the DAO approves. In the owner's words: "Someone shouldn't be able to sell their tokens unless DAO approves it ... this is part of dao creation config." Members must still be able to change wallets, and the DAO must be able to rescue a member who lost their keys.

Locking transfers alone leaves a gap: voting power also moves by delegation, and today any holder can delegate to any address (OpenZeppelin `Votes::delegate`, used unchanged by the Token's `#[contractimpl(contracttrait)] impl Votes for DaoTokenContract {}`). A locked DAO would control its member list but not its voter list.

## Constraints

- Builds on membership-models as implemented (Token registry and allowances, `ModuleSpec` creation, `create_module`, the early `handoff` of an assurance drive, quick-buy pools).
- Instance storage only for new settings: no new persistent keys and nothing new in the renewal sweep.
- Pre-mainnet: Token changes ship by fresh testnet redeploy; existing DAOs read absent settings as today's behaviour.
- Few settings (owner: "We shouldn't be adding TOOO many configurations"): three on/off switches (D6).

## Premises (agreed 2026-10-13)

1. Three independent on/off Token settings chosen at creation: `transfers_locked`, `members_only_delegation` and `dao_recovery` (D1, D3, D6: "lets keep it only three on/off switches. we dont need `nobody can delegate` option").
2. With `members_only_delegation` on, a holder may delegate only to themselves or to an address that holds at least one token and votes (not the Treasury, not a non-voting module) at the moment of delegating.
3. No per-delegate proxy cap. Concentration stays visible: votes are public, and the web shows how many delegations each delegate carries.
4. Defaults: all three off, so existing DAOs behave exactly as today.
5. Every switch can be flipped by proposal in either direction (D2/D3). The proposal's own voting period is the notice; there is no extra delay (owner: "Voting is already a long process that everyone agrees upon, why additional delay"). Before launch the launch admin may still change them: a creation mistake should not need a new DAO, and an assurance drive's early handoff freezes them like every other Setup setting.
6. Changes apply to new actions only. Delegations already in place stay, including delegations to someone who later stops holding a token; the contract cannot enumerate them. The web flags "your delegate is no longer a member" so the delegator can re-delegate (D8: keep as written).

## Approaches Considered

- **A: Delegation follows the lock.** Rejected (D1): cannot express a locked DAO with outside delegates.
- **B: Separate settings, each changeable by proposal.** Chosen (D1), narrowed to three on/off switches (D6).
- **C: One membership preset (Open / Closed / Strict) in the contract.** Rejected (D1); the web offers presets instead (see Web).

## Recommended Approach

### State

| Key | Class | Contents | Written by |
|---|---|---|---|
| `TokenKey::Settings` | instance | `TokenSettings { transfers_locked, members_only_delegation, dao_recovery }` (three `bool`s); absent = all false | constructor; the three setters |
| `TokenKey::TransferAgents` | instance | `Vec<Address>`, at most `MAX_MODULES` (16), every entry a registered module | `set_transfer_agent`, `unregister_module` |

Both live in instance storage and are renewed with the Token instance. `TokenSettings` is one `#[contracttype]` struct (in `common`, since the Manager passes it through): one constructor argument, one `InitialDaoConfigValues` field and one `TokenInitialized` field, so a later switch changes no signature.

### Moving tokens: one helper, one check

`move_token(from, to, token_id)` does exactly what today's `transfer` body does, minus authorization: `voting_holder(to)` → `ensure_self_delegate` (only for voting holders, never the Treasury or a non-voting module), OpenZeppelin `Base::update(Some(from), Some(to), token_id)` (owner check, balances, clears the approval), the OZ `Transfer` event, then `move_voting_unit(voting_holder(from), voting_holder(to))`.

Every public path authorizes first, then runs the lock check, then calls the helper:

| Entry point | Authorization (unchanged where it exists today) | Lock check context |
|---|---|---|
| `transfer(from, to, id)` | `from.require_auth()` | `from`, `to`, no spender |
| `transfer_from(spender, from, to, id)` | `spender.require_auth()` and OZ `Base::check_spender_approval(spender, from, id)` | `from`, `to`, `spender` |
| `agent_transfer(agent, from, to, id)` | `agent.require_auth()`, `from.require_auth()`, `agent` listed | allowed by path 5 |
| `dao_transfer(token_id, to)` | admin, Live, `dao_recovery` on | allowed by path 4 |

The lock check is one private function, `check_locked_path(from, to, spender)`, called by `transfer` and `transfer_from` only when `transfers_locked` is on. On an unlocked token nothing changes, and an unapproved spender still fails exactly as today.

### Switch 1: locked transfers

On a locked token a movement is allowed only on one of these paths; everything else fails with `TransfersLocked`:

| # | Path | Entry point | Example |
|---|---|---|---|
| 1 | Out of DAO custody: `from` is the Treasury or a registered `non_voting` module | `transfer` / `transfer_from` | auction settlement, pool sale, `sweep_pool` |
| 2 | Back to the DAO: `to` is the Treasury | `transfer` | a member gives up membership |
| 3 | DAO-approved transfer: the spender is the Treasury | `transfer_from(treasury, holder, to, id)` after the holder `approve`d the Treasury; a proposal executes it | an approved sale or gift |
| 4 | DAO move (switch 3) | `dao_transfer` | lost-key recovery; recall |
| 5 | Transfer agent | `agent_transfer` | the Circle's membership move |

Approvals on a locked token: the rule reads the token's owner (`owner_of(token_id)` for `approve`, the granting `owner` for `approve_for_all`), never the approver, because OpenZeppelin lets an operator approve on the owner's behalf. When the owner is DAO custody (the Treasury or a registered `non_voting` module), `approve` and `approve_for_all` work for any spender or operator, as today, so path 1 also works through approval-based modules. When the owner is a holder, they succeed only when the spender or operator is the Treasury; a Treasury holding operator rights over a holder's tokens still cannot approve anyone else for them. Refused: holder-to-holder transfers, `transfer_from` by any other spender, and Marketplace secondary `list` (the Token refuses the move into escrow; the Marketplace needs no change).

**DAO-approved transfers (path 3).** The holder asks in the web; the web has the holder sign `approve(holder, treasury, id, expiration)` with an expiration covering the Governor's voting delay + voting period + queue delay + the proposal's execution window (`PROPOSAL_EXPIRATION_PERIOD`, 14 days), plus a margin. That always fits one approval: the longest possible timeline is 30 + 30 + 30 + 14 = 104 days (about 1.8M ledgers), well under the maximum temporary-entry TTL of 3,110,400 ledgers (about 180 days). The web never uses `approve_for_all` here: it would hand the DAO every token the holder owns and outlive the transfer. The holder (or any member above the proposal threshold) then submits the proposal draft the web prepares. Payment, if any, is settled outside the proposal or by a later escrow agent (path 5).

`set_transfers_locked(locked)`: the admin (the launch admin in Setup, the Treasury by proposal once Live), either direction (`SettingUnchanged` if it already has that value); event `TransfersLockChanged{locked, changed_by}`; effective for the next call. Unlocking gives holders transfer, approval and listing rights at once. Locking moves no token, but it is a real power over holders: it removes every member's exit by sale, leaving only "give back to the DAO", and with recovery on a majority can lock and then recall. SECURITY_MODEL states it and the web flags every proposal containing `set_transfers_locked(true)`. Listings already escrowed in the Marketplace stay buyable and cancellable (both move out of custody, path 1); approvals a holder gave to anyone but the Treasury stop working.

**Transfer agents (the plug-in point).** `set_transfer_agent(module, enabled)` edits `TransferAgents` (`NotAModule` if unregistered). Authority follows `register_module`'s registrar rule: in Setup only the Manager, once Live only the admin (the Treasury, by proposal). The Manager calls it in exactly one place: `create_dao`, right after registering the modules in `params.initial_config.modules`, it calls `set_transfer_agent(module, true)` for every module whose kind appears in `InitialDaoConfigValues.transfer_agents: Vec<Symbol>` (each kind must match a `ModuleSpec` in the same call, else the Manager error `UnknownAgentKind`). Today's `ModuleSpec` kinds (Auction, Marketplace, Claims) are not transfer agents, so the list is empty until `ModuleSpec::Circle` lands with the Circle. Modules created later with `create_module`, in Setup or after launch, become agents only by a proposal once Live. The launch admin can never grant it. `unregister_module` also removes the module. Event `TransferAgentChanged{module, enabled, changed_by}`. `agent_transfer` works only once the Token is Live (`NotLive`), on locked and unlocked tokens alike; it emits the OZ `Transfer` plus `AgentTransfer{agent, from, to, token_id}` and does not check the recipient's consent (an agent that needs it, like the Circle, checks it itself). Granting an agent is a real power, so it happens in only two ways: the creation config (visible to every member before they join) or a proposal once Live. The create flow, the DAO page and SECURITY_MODEL list every transfer agent.

### Switch 2: members-only delegation

The Token overrides `delegate` in its `#[contractimpl(contracttrait)] impl Votes for DaoTokenContract` (`delegate` is a default method of OpenZeppelin's `Votes` trait, so the override replaces it): when `members_only_delegation` is on, `delegate(account, delegatee)` requires `delegatee == account`, or `delegatee` to hold at least one token and be a voting holder (not the Treasury, not a non-voting module); otherwise `DelegateNotMember`. Then it calls the library's `delegate`. "Holds a token" is `balance > 0`, so a member whose tokens all sit in Marketplace escrow (unlocked DAOs only) cannot be delegated to while listed; the web's delegate picker applies the same rule. The Token's automatic self-delegation of new holders (`ensure_self_delegate`) is unaffected. The check costs one balance read and one registry lookup on `delegate` only.

`set_members_only_delegation(enabled)`: the admin (the launch admin in Setup, the Treasury by proposal once Live), either direction (`SettingUnchanged` if unchanged); event `MembersOnlyDelegationChanged{enabled, changed_by}`. It governs new `delegate` calls only; existing delegations stay (premise 6). Turning it on removes members' freedom to delegate outside the DAO for the future: SECURITY_MODEL states it and the web flags the proposal.

### Switch 3: DAO recovery (owner, D3: "Some daos might want to enable it later as a safety feature for potential members losing their keys")

`dao_transfer(token_id, to)`: admin (the Treasury, by proposal), Live only, only while `dao_recovery` is on (`RecoveryOff`). It moves the token from whoever currently owns it, without their signature: lost-key recovery, and by the same power recall. Taking the current owner instead of a fixed `from` means a holder cannot dodge a recall by moving the token to another wallet during the vote. Neither the current owner nor `to` may be a registered module (`ModuleCustody`), so it never pulls a token out of an auction, an escrowed listing, a pool or the Circle, or pushes one into a module without a matching record. `to` may be any other address (D7: a recipient restriction would add logic without stopping a majority, which can always use a fresh wallet it controls). It runs through `move_token`, so votes move as on any transfer. Event `DaoTransfer{from, to, token_id, changed_by}`.

Recall is not guaranteed: a holder who lists the token on the Marketplace during the vote (unlocked DAOs only, since locked DAOs refuse holder listings) puts it in module custody, and `dao_transfer` then fails with `ModuleCustody` until the listing ends. Lost-key recovery is unaffected, since a lost key cannot act. SECURITY_MODEL states this.

`set_dao_recovery(enabled)`: the admin (the launch admin in Setup, the Treasury by proposal once Live), either direction (`SettingUnchanged`); event `DaoRecoveryChanged{enabled, changed_by}`. Turning recovery on covers every holder as soon as the proposal executes; the voting period is the notice (D3: no per-member opt-in, no extra delay). One proposal may both turn recovery on and run `dao_transfer` in the same execution (D4); the web shows such a proposal as one flagged item listing both actions and every token it moves. This is a real power: a majority can move any member's token. SECURITY_MODEL states it; the DAO page shows "Recovery: on/off"; the web flags every proposal containing `set_dao_recovery(true)` or `dao_transfer`.

### Creation

- Manager: `InitialDaoConfigValues.token_settings: TokenSettings` (all false by default), passed to the Token constructor; and `transfer_agents: Vec<Symbol>` (default empty), applied by `create_dao` right after module registration. The Token constructor grows from today's seven core arguments to eight.
- Token: the `TokenSettings` constructor argument; getters `settings()` plus `transfers_locked()`, `members_only_delegation()` and `dao_recovery()`; `TokenInitialized` gains `settings`.

### Errors

- Token (block 7200, after `AllowanceExceeded` 7215): `TransfersLocked` 7216, `SettingUnchanged` 7217, `RecoveryOff` 7218, `NotTransferAgent` 7219, `ModuleCustody` 7220, `DelegateNotMember` 7221.
- Manager (block 7100, after `AssuranceNotFailed` 7142): `UnknownAgentKind` 7143.

### Indexer, database, web

- **Goldsky:** decode `TransfersLockChanged`, `MembersOnlyDelegationChanged`, `DaoRecoveryChanged`, `TransferAgentChanged`, `AgentTransfer`, `DaoTransfer` and the new `TokenInitialized` fields, one fixture each in `test/every-event.test.mjs`.
- **Database:** the three switches on the DAO's token row (initial value plus changes), a `dao_transfers` view, the transfer-agent set, and per-delegate delegation counts in the existing token views (`db/migrations/0003_token_views.sql`, edited in place pre-mainnet).
- **Feed:** "The DAO moved membership #12 from A to B" (prominent for every `DaoTransfer`); "The DAO locked (or unlocked) membership transfers"; "The DAO turned recovery on" (prominent) and "off"; "Members can now delegate only to members" and the reverse; "The DAO made <module> a transfer agent" and "removed <module> as a transfer agent" (including by `unregister_module`).
- **Web create flow (D6):** a simple default for most users and an "Advanced" section for the rest. The default is one choice, "Open membership" (all three off) or "Members-only club" (locked, members-only delegation, recovery on), each with one line on what it means; the "Members-only club" line says the DAO can move any membership by vote, since the preset turns recovery on. "Advanced" shows the three switches individually with plain text: "Membership changes hands only with DAO approval"; "Members can hand their vote only to fellow members"; "The DAO can rescue a member who loses their keys (it can then move any membership by vote)". Each says it can be changed later by vote.
- **Web DAO pages:** a "Locked membership" badge; on locked DAOs, transfer, approve and list actions hidden and "Give back to the DAO" and "Ask the DAO to approve a transfer" shown; the delegate picker filtered when members-only; per-delegate counts on the members page; stale-delegation warnings; transfer agents listed; a "Recovery: on/off" indicator; governance actions for `dao_transfer` (flagged), `set_dao_recovery` (flagged when turning on), `set_transfers_locked` (flagged when locking), `set_members_only_delegation` (flagged when turning on), `set_transfer_agent` and the approved transfer.

## How the Circle plugs in later

| Circle need | Provided here |
|---|---|
| Members cannot sell or trade badges | `transfers_locked` (a later unlock by proposal makes badges tradeable; the Circle accepts that, since membership records stay keyed by address) |
| Member moves to a new wallet | a Circle created with the DAO is listed in `transfer_agents` and made an agent at `create_dao`; a Circle attached later is made an agent by a proposal running `set_transfer_agent(circle, true)`; `move_membership` calls `agent_transfer` |
| Lost-key recovery, recall | `dao_recovery` on, then `dao_transfer` for the badge; `dao_transfer` moves the badge only, so the same proposal also calls the Circle's `recover_membership(old, new)` to move the member's Circle record (defined in savings-circle.md) |
| Only savers carry savers' votes | `members_only_delegation` on |
| No Token change when the Circle ships | the agent hook and the three switches are generic |

## Success Criteria

- On a locked DAO, the five paths succeed and every other transfer, holder approval and Marketplace listing fails with `TransfersLocked`; on an unlocked DAO the existing Token suite passes unchanged, including an unapproved spender's `transfer_from` failing.
- On a locked DAO the Treasury can approve the Marketplace and a custody sale through `transfer_from` succeeds; a holder's approval to the Marketplace fails.
- A DAO-approved transfer (holder approval with the web's expiration, then a proposal) succeeds at execution.
- `dao_transfer` moves the token from its current owner even after the owner moved it to another wallet during the vote; it fails with `ModuleCustody` when the owner or `to` is a registered module; it fails with `RecoveryOff` while recovery is off, on locked and unlocked tokens; after `set_dao_recovery(true)` it succeeds in the next transaction; one proposal running `set_dao_recovery(true)` then `dao_transfer` succeeds in one execution.
- `set_transfer_agent` in Setup succeeds only for the Manager and fails for the launch admin; once Live only the Treasury can call it; `agent_transfer` fails before launch. At `create_dao` a kind listed in `transfer_agents` becomes an agent, an unmatched kind fails with `UnknownAgentKind`, and a module added later by `create_module` in Setup is not an agent.
- `agent_transfer` by a registered module that is not listed fails with `NotTransferAgent`; without `from`'s signature it fails; `unregister_module` of an agent removes it, emits `TransferAgentChanged{enabled: false}`, and its next `agent_transfer` fails.
- On a locked DAO, DAO custody (the Treasury, a non-voting module) can approve any spender; a holder can approve only the Treasury; a Treasury holding a holder's `approve_for_all` cannot `approve` another spender for that holder's token.
- `set_transfers_locked(false)` makes a holder-to-holder transfer succeed in the next transaction; `set_transfers_locked(true)` makes it fail again while an escrowed listing stays buyable and cancellable.
- With `members_only_delegation` on, delegating to a non-holder, the Treasury or a non-voting module fails with `DelegateNotMember`; delegating to a member and to oneself succeed; automatic self-delegation of new holders still works. Turning it off allows any delegate for the next call and leaves existing delegations in place.
- Each of the three setters fails with `SettingUnchanged` when given the current value; in Setup the launch admin can change each, and after an assurance drive's early handoff the launch admin can no longer.
- The voting-units invariant (`contracts/e2e/src/voting_invariant.rs`) stays green with lock and unlock, recovery on and off, `dao_transfer`, `agent_transfer`, give-back and members-only delegation in its random sequences, including a clause that a refused delegation moves no votes.
