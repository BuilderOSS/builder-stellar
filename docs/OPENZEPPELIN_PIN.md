# OpenZeppelin Stellar Contracts pin

The contracts use OpenZeppelin's [`stellar-contracts`](https://github.com/OpenZeppelin/stellar-contracts)
at git commit `fbfde388e1b72afa93d6b1c922067879b20e81db` (`rev = "fbfde38"` in
[`Cargo.toml`](../Cargo.toml); `Cargo.lock` records the full commit). That commit is on
OpenZeppelin's `main` branch and is not a tagged release. This page records what the contracts use
from it, how it differs from the nearest tags, why it stays pinned for now, which OpenZeppelin
audits cover it, and why it is outside the audit scope. Checked on 25 November 2026 by reading the
diffs between `fbfde38` and each tag.

## What the contracts use

| Crate | Module | Used by | What is used |
| --- | --- | --- | --- |
| `stellar-governance` | `governor` | Governor | `ProposalState`, `GovernorError` codes, `MAX_DESCRIPTION_LENGTH`, `GovernorStorageKey::ProposalVote`, and the module's storage functions |
| `stellar-governance` | `votes` | Token | `delegate`, `get_voting_units`, `VotesStorageKey`, and the checkpoint functions |
| `stellar-tokens` | `non_fungible` | Token | `Base::name`, `Base::symbol`, `Base::sequential_mint`, `Base::approve_for_all`, `NFTStorageKey::Owner`, `MAX_NAME_LEN`, `NonFungibleTokenError::NonExistentToken` |
| `stellar-contract-utils` | `pausable` | Auction | `Pausable` |
| `stellar-macros` | `when_paused`, `when_not_paused` | Auction | the two attribute macros |
| `stellar-access` | none | none | Declared in `contracts/manager/Cargo.toml` but not used by its source |

## Where `fbfde38` sits

`fbfde38` ("fix error doc links (#831)", 14 August 2026) has workspace version 0.7.1 and requires
soroban-sdk 27.0.2 with `experimental_spec_shaking_v2`. The workspace here uses soroban-sdk 27.0.6.

| Tag | Commit | soroban-sdk | Relation to `fbfde38` | Modules the contracts use, compared with `fbfde38` |
| --- | --- | --- | --- | --- |
| `v0.7.1` | `3f81125` | ^25.3.0 | Ancestor | `governor`: change A. `non_fungible`: change B. `votes`: one word of a doc comment. `pausable` and macros: identical |
| `v0.7.2` | `a9c4216` | ^26.1.0 | Release branch | As `v0.7.1` |
| `v0.7.3` | `252b35f` | ^26.1.0 | Release branch; its 5 extra commits change only `accounts` | As `v0.7.1` |
| `v0.8.0-rc.3` | `4114bb8` | ^26.1.0 | Ancestor, 37 commits earlier | `governor`: change A. `votes`: one doc line. `non_fungible`: docs and tests only. `pausable` and macros: identical |
| `v0.8.0` | `ddc327e` | 28.0.0 | Contains `fbfde38`, 49 commits later | `governor`: every `GovernorError` code renumbered from 5000–5023 to 4200–4223; logic and storage keys unchanged. `non_fungible`: `Base::sequential_mint` renamed `Base::mint`, the old `Base::mint` renamed `mint_with_id`, `get_approved` panics for a missing token, and new composition types; storage keys, events and error codes unchanged. `votes`: one doc line. `pausable` and macros: identical |

**Change A**, commit `5eeff6a` ("fix 0 voting period (#835)"). At `fbfde38`, `set_voting_period`
rejects 0 with `GovernorError::InvalidVotingPeriod` (5023). The earlier tags have neither the check
nor the variant. The Governor here checks the voting period itself (at least 300 seconds, error 7505)
before every call, so behaviour on chain is the same; the contract spec and the generated bindings
would lose variant 5023.

**Change B**, commit `8609475` ("apply fix for approve_for_all (#695)"). At `fbfde38`,
`Base::approve_for_all` rejects a `live_until_ledger` above the network's maximum with
`InvalidLiveUntilLedger`. The `v0.7.x` tags do not. The Token passes the value straight through, so
this is a behaviour difference.

Other differences are in modules the contracts do not use: `access` (tests and comments), the
`confidential` token, the `non_fungible` extensions, and development dependencies.

The crates are on crates.io at 0.7.1 (soroban-sdk ^25.3.0), 0.7.2 and 0.7.3 (^26.1.0), and 0.8.0
(^28.0.0). No release requires soroban-sdk 27, and no release candidate is published.

## Decision: keep `fbfde38` for the audit

No tag both works with soroban-sdk 27 and matches `fbfde38` in the modules used.

- `v0.7.1` to `v0.7.3` and `v0.8.0-rc.3` require an older soroban-sdk major version, and lack the
  voting-period check; the `v0.7.x` tags also lack the `approve_for_all` fix.
- `v0.8.0` requires soroban-sdk 28. It renames the mint call the Token makes and renumbers the
  Governor's error codes, which the Governor tests, the generated bindings, and the code ranges in
  `contracts/common/src/error.rs` rely on.

Either move changes every contract hash and needs its own release. The pin therefore stays at
`fbfde38`, and the move to `v0.8.0` is planned together with the soroban-sdk 28 upgrade.

## Audit coverage

OpenZeppelin publishes its audits in the repository's `audits/` folder. Checked on 25 November 2026
by reading the reports and `git diff` over the folders of the modules the contracts use (`governor`,
`votes`, `non_fungible`, `pausable`, and the macros).

- **v0.7.0 audit** (`audits/Stellar Contracts Library v0.7.0 Audit.pdf`): a diff audit of HEAD
  `239a2a7` (`v0.7.0-rc.1`) against base `82f9711` (`v0.6.0`). The report adds that the fixes for its
  findings were all merged at commit `d55dd37`, and names the pull request for each fix. `239a2a7` and
  `d55dd37` are both ancestors of `fbfde38`.
- **v0.8.0 audit** (`audits/Stellar Contracts Library v0.8.0 Audit.pdf`, added in `v0.8.0`): a diff
  audit of the changes "between base snapshot fbfde38 and target snapshot a5bd8cb", and a second range
  from `9c5e279` to `2128f11`. It reviews changes made after `fbfde38`; the governor and
  `non_fungible` storage files are in its scope.

### Changes the reports do not name

From `239a2a7` to `d55dd37`, the modules the contracts use change in the fix pull requests the
v0.7.0 report names (the governor's dynamic quorum, queueing, the `vote_snapshot` rename, and the
quorum fixes), and in four other commits:

- `684bb89` re-exports the governor's storage functions from its module. No behaviour changes.
- `20981b1` reformats one `match` arm in `votes`. No behaviour changes.
- `b20a206` adds `#[contracttrait]` to the `Pausable` trait. The Auction's
  `#[contractimpl(contracttrait)] impl Pausable` relies on it to export the trait's functions.
- `96a2152` hashes a proposal description with `to_bytes` instead of `to_xdr`, in the governor's
  `propose` and `cancel` and in the trait's default `get_proposal_id`. The Governor here overrides
  `propose` and `cancel` and hashes descriptions with `to_bytes` itself; it uses the default
  `get_proposal_id`.

From `d55dd37` to `fbfde38`, leaving out doc comments, tests, READMEs, and Cargo metadata, the only
source changes in those modules are change A and change B above. Both make the module reject more
inputs. `votes`, `pausable`, and the macros have no code change in that range. The `non_fungible`
extensions that changed (burnable, consecutive, royalties) are not used.

## Decision: the OpenZeppelin modules are out of the audit scope

The OpenZeppelin modules are outside the scope of the external audit. The pin stays frozen at
`fbfde38`, and the project relies on OpenZeppelin's published audits for the modules' own code. The
contracts' use of those modules stays in scope, because that is this repository's code: how the
Governor, Token, and Auction call them, and the checks they add around them, such as the Governor's
own voting-period check. The changes listed above are the ones the published reports do not name.
