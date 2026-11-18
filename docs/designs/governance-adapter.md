# Design: governance adapter (the Governor's vote source)

This document covers the SCF #44 Tranche 2 deliverable "Governance adapter interface and configuration schema". Its sign-off text is: "Governance adapter interface is documented and exercised with at least one mock governor; DAO-level configuration for advanced governors is visible in the UI."

The Governor no longer assumes that its voting power is the DAO's NFT. It reads votes from a **vote source**. By default that is the DAO's Token (token-weighted voting). It can instead be an adapter the platform approved, for example a mock in tests, or Neural Quorum Governance (NQG) once an NQG adapter exists. The Token remains the DAO's identity and its membership and auction NFT either way.

Related: [`nqg-compatibility.md`](nqg-compatibility.md), on the `docs/nqg-compatibility` branch, specifies the NQG adapter that plugs into this interface.

## 1. The interface

A vote source implements `common::clients::VoteSourceApi` (`contracts/common/src/clients.rs`):

```rust
fn get_votes_at_checkpoint(e, account: Address, ledger: u32) -> u128; // weight at a past ledger
fn get_total_supply_at_checkpoint(e, ledger: u32) -> u128;           // total at a past ledger
fn get_total_supply(e) -> u128;                                       // total now
fn voting_supply_at_previous_ledger(e) -> u128;                       // total at current - 1
fn decimals(e) -> u32;                                                // decimal places of one vote
```

| Method | Who calls it | Where |
|---|---|---|
| `get_votes_at_checkpoint` | Governor | `propose` (the proposer's weight at `seq - 1`) and `cast_vote` (the voter's weight at the proposal snapshot) |
| `voting_supply_at_previous_ledger` | Governor | `propose`, which fixes the proposal's quorum (`quorum_now`) |
| `get_total_supply_at_checkpoint` | Governor | the `quorum(ledger)` view only |
| `get_total_supply` | Governor, Manager | `set_proposal_threshold` (a threshold above the supply is refused); the Manager's approval probe and its launch check |
| `decimals` | Manager, web | the approval probe; clients display power as `units / 10^decimals`. The Governor never calls it |

The first three methods are OpenZeppelin's `Votes` reads, with the same names and signatures. `voting_supply_at_previous_ledger` is the Token's own extension. That means the Token implements the interface unchanged, except for `decimals`, which nobody asks the Token for.

### Semantics an adapter must keep

1. **Ledger-keyed and past-only.** Every read describes the state at the end of `ledger`. A read at the current or a future ledger panics, as OZ `FutureLookup` does. An adapter with rounds or epochs, as NQG has, maps each ledger to the epoch active at that ledger and keeps its own snapshots for that purpose (`nqg-compatibility.md` §4).
2. **One supply.** `voting_supply_at_previous_ledger()` must equal `get_total_supply_at_checkpoint(current_ledger - 1)`. The Governor fixes a proposal's quorum from the first and weighs each voter with the second (contract review H1, D40). If the two describe different supplies, a proposal could pass a quorum that its own voters never reached.
3. **Unsigned, bounded units.** Weights and supply are `u128`. Clamp anything negative to 0 and scale fixed-point scores to `decimals()`. Thresholds and quorum are stated in these units: a threshold of `1 * 10^9` means a score of 1.0 at 9 decimals.
4. **No delegation contract.** The Governor never calls `delegate` or `get_delegate`. An adapter that has no delegation leaves it out, and the web then hides token delegation for that tribe.

**Why `voting_supply_at_previous_ledger` and not `get_total_supply_at_checkpoint(seq - 1)`.** Both give the same number (rule 2). On the Token, though, the checkpoint read binary-searches supply history, and the renewal sweep lets that history archive (D33). `voting_supply_at_previous_ledger` reads only the latest one or two checkpoints, which stay live. Keeping one call for every source means the Governor has a single code path. An adapter implements it as its own previous-ledger lookup; the NQG spec's adapter exposes both.

## 2. Configuration schema

| Where | Field | Values |
|---|---|---|
| Manager `create_dao` | `GovernanceConfig.vote_source: Option<Address>` | `None`, or the DAO's own predicted token: token-weighted. Otherwise an approved vote source |
| Governor | the OZ token-contract slot, read through `vote_source()` (and OZ `get_token_contract()`) | the token or the adapter |
| `GovernorInitialized` event | `token_contract` | the vote source (the field keeps its OZ name) |
| Read model | `governance.settings.vote_source` | the vote source; equals `dao_id` for a token-weighted tribe (migration 0011) |
| Web draft | `governance.voteSource` | `''` for the token, else the adapter's `C…` address; older drafts are token-weighted |
| CLI (`scripts/deploy-dao.mjs`) | `governance.voteSource` | optional `C…` address |

**Storage.** The source sits in the Governor's existing OpenZeppelin token-contract slot. The Manager passes `vote_source.unwrap_or(token)` as the constructor's `token_contract` argument. That gives three properties:

- No new key, no constructor change and no event change, and default tribes store nothing extra (`docs/STORAGE_DIET.md` rule 2).
- OZ's `set_token_contract` refuses a second write, so the source is permanent at no cost.
- Governors already on testnet (0.4.0) hold their token in that slot, so upgraded ones behave exactly as before. There is no storage-version bump and no `migrate` step.

The slot's OZ name now misleads, so the Governor's docs say it. For an adapter tribe `get_token_contract()` returns the adapter, and the membership NFT is found through the Manager or the Treasury. Nothing in the repository read the slot for anything except votes before this change.

## 3. Permanence: why a proposal can't change it

There is no setter, and `migrate()` takes no arguments, so only a platform release (a Manager-registered Governor implementation with an approved upgrade path) could rewrite the slot. That is deliberate:

- The technical plan fixes the governance type at creation.
- A captured majority could switch in a source that grants it permanent control. That removes the minority's exit, which today is selling or leaving before a bad proposal runs.
- Open proposals carry quorums and voter weights from the old source. Switching mid-flight would make their tallies incoherent.

A tribe that needs a different source creates a new tribe.

## 4. Who may name a source: the Manager allowlist

Because the source is permanent and is consulted on every proposal and vote, an unreviewed adapter is a single point of failure for the tribe. If its own admin can rewrite weights, that admin controls the tribe. If its code is swapped for code that panics, the tribe freezes for good: no proposal can pass, not even one to recover the Treasury. So the Manager keeps an allowlist (owner decision D3, 2026-11-18):

- `approve_vote_source(source, approved, name)`, Manager admin only. Approving probes every read the Governor makes, plus `decimals` (the two checkpoint reads at `seq - 1`), and fails with `InvalidVoteSource` when any of them doesn't answer. Launch reads the source's `get_total_supply` through `try_`, so a source that stops answering fails launch with `InvalidVoteSource`, not a trap. Each call emits `VoteSourceApproved { #[topic] source, approved, name }`. The approval is a persistent `ApprovedVoteSource(source) -> name` record, which `scripts/renew-code-ttl.mjs` renews (with `--vote-source` or the indexer's `manager.vote_sources`).
- `is_vote_source_approved(source)` is the chain's answer.
- `create_dao` refuses an unapproved source with `VoteSourceNotApproved`.
- `launch_pending`, which every launch path goes through, re-checks approval (D6) and requires the source's `get_total_supply() > 0`, next to the Token's own supply check, which stays. A withdrawn approval therefore stops pending tribes from launching too. An assurance drive in that position fails at its deadline and refunds, as for any other launch-time revert. Tribes already launched keep their source.
- A Governor older than `vote_source()` (0.4.0) is treated as token-weighted at launch.

**Approval policy.** Approval names an address, not the code behind it. Approve only sources that meet three conditions:

1. No single party can rewrite weights arbitrarily.
2. Upgrades, if any, are gated by this Manager or by the tribe itself (its Treasury as admin).
3. The renewal story is known (§6).

The mock adapter is approved on testnet and local networks only, never on mainnet.

## 5. Writing an adapter

The reference implementation is [`contracts/vote-adapter-mock`](../../contracts/vote-adapter-mock). It holds admin-set weights with `(ledger, votes)` checkpoints per account and in total, overwriting within a ledger.

Checklist:

1. Implement the five methods with the exact signatures in §1. A `#[contractimpl]` with those names is enough, and no trait import is needed.
2. Keep ledger-keyed snapshots: a past ledger must always read the same value afterwards.
3. Meet the one-supply invariant (§1, rule 2), and test that `governor.quorum_now` equals `governor.quorum(snapshot)` when weights change in the same ledger and across ledgers (`governor` tests `adapter_quorum_matches_the_snapshot_*`).
4. Return `u128` units at your `decimals()`.
5. Make the admin the tribe's Treasury, or have none, so that configuration changes go through proposals.
6. Keep your own storage alive (§6), or document who renews it.
7. Get it approved by the Manager admin, then create tribes with `vote_source` set to it.

Tests that drive the interface end to end: the `governor` tests `adapter_*`, the `manager` tests `*vote_source*`, and `contracts/e2e/src/vote_adapter.rs`, where a tribe is created through the Manager on the built WASMs with the mock as its source and passes and executes a proposal on adapter weights alone.

## 6. Renewal

The DAO sweep (`lib/chain-reads/renewal.ts`) renews the adapter's **instance**, read from the Governor's token-contract slot, together with the DAO's own keys. Code and the `ApprovedVoteSource` record are platform state (`renew-code-ttl.mjs`). An adapter's per-voter and epoch storage is the adapter's own concern. A shared adapter serving many tribes is renewed by whoever runs it, and a per-tribe adapter may expose `renewal_keys(cursor, limit)` like an external module. For NQG this means keeping the active epoch and the previous one alive (`nqg-compatibility.md` §4.3).

## 7. Flow

```
create_dao(GovernanceConfig { vote_source })
  │  None or the predicted token ──────────────► token-weighted
  │  Some(adapter): is_vote_source_approved? ─no─► VoteSourceNotApproved
  ▼
Governor __constructor(…, token_contract = vote_source, …)   (OZ slot, set once)
  ▼
launch_pending:  token.total_supply() > 0
                 and, for an adapter: still approved and get_total_supply() > 0
  ▼
propose   ─► votes(e).get_votes_at_checkpoint(proposer, seq - 1) ≥ threshold
          ─► quorum = ceil(votes(e).voting_supply_at_previous_ledger() × bps)
cast_vote ─► votes(e).get_votes_at_checkpoint(voter, snapshot) > 0
                │
                ▼ VoteSourceClient
         Token (default)  │  approved adapter (mock, NQG)
```

## 8. Web

- **Create flow, Voting step.** "How are votes counted?" offers **Token-weighted** (the default) and **Neural Quorum Governance (NQG)**, which is shown but disabled with "Coming once NQG is available on Stellar." When the Manager has approved sources, Advanced settings lists them. The list comes from the indexer's `manager.vote_sources` and is re-checked with `is_vote_source_approved`; when nothing is approved, nothing is shown. Choosing a source shows that it is permanent, and Review names it. The `create_dao` simulation re-checks approval before signing.
- **Governance page.** A "How votes are counted" card reads `governor.vote_source()`.
- **Voting power.** `useVoteSource` feeds voting power, proposal eligibility, the vote panel, the you sheet, the membership card and the member pages. They read the source and format by its `decimals()`, and token delegation is hidden for adapter tribes. Only a Governor without `vote_source()` counts as token-weighted: any other read failure is an error, and delegation stays hidden until the source is known. The create flow takes the proposal threshold in whole votes and scales it by the chosen source's `decimals()`. The NQG spec adds two constraints for later: offer NQG only on locked Tokens, and show the epoch's age.

## 9. Rollout (testnet; get sign-off first)

The Governor's constructor is unchanged, but `GovernanceConfig` changes its XDR, so the web app and the Manager must match:

1. Apply migration 0011 to the read model before the new web app goes out (its Prisma views read `vote_source` and `manager.vote_sources`). Redeploy the Goldsky pipeline, whose decoder now names `VoteSourceApproved`'s topic.
2. Pause the factory (`pause_factory`). Upgrade the Manager, register and make current the new Governor WASM, and deploy the web app. Then unpause.
3. Upgrade existing tribes' Governors by proposal whenever convenient. They stay token-weighted.
4. To demo an adapter tribe: deploy `vote_adapter_mock` (testnet only), approve it, and create a tribe that picks it under Advanced settings.

## 10. Follow-ups

- **The NQG adapter** (`NqgVotes`, `nqg-compatibility.md` §4) and enabling the NQG choice. This is tracked in TODOS.md.
- **Approval by code hash.** Per-tribe NQG adapters would each need an address approval. A Manager-deployed adapter factory, or approval of a WASM hash, would remove that step.
