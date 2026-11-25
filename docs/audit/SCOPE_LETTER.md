# Scope letter (template)

Fill in this template and send it to the audit firm with the package in this folder. Text in square brackets is for you to replace. Take the numbers from [SCOPE.md](SCOPE.md) regenerated at the frozen commit (`node scripts/audit-scope.mjs --ref <tag>`), not from an older copy, because contract changes alter them.

---

**To:** [audit firm, contact name]
**From:** [name, role], Tribe Builder
**Date:** [date]
**Subject:** Audit scope: Tribe Builder Soroban contracts

## 1. The project

Tribe Builder ([tribes.build](https://tribes.build)) is a framework and web app for creating DAOs on Stellar, called tribes in the app. Each DAO has an NFT membership token (one token, one vote), a Governor, a Treasury that executes passed proposals, and optional modules: an Auction, a Marketplace with quick-buy pools, and a ClaimMinter for Merkle claim lists and assurance drives. A shared Manager contract deploys DAOs, keeps the registry of approved implementation hashes, and launches each DAO once. The source is public: [github.com/BuilderOSS/builder-stellar](https://github.com/BuilderOSS/builder-stellar).

## 2. What we ask you to review

**Engagement:** [contracts only | contracts, then the app and indexer tier as a second engagement]

| | |
| --- | --- |
| Repository | `BuilderOSS/builder-stellar` |
| Frozen tag | [for example `audit-1-freeze`] |
| Commit | [full commit hash of the tag] |
| `contracts/` tree | [the tree hash from SCOPE.md; `git rev-parse <tag>:contracts` prints it] |
| WASM hashes | [link to `releases/hashes.json` at the tag]; `node scripts/verify-wasm.mjs <tag>` rebuilds the tag and compares |
| Build | `stellar contract build --locked` with Stellar CLI [version], Rust [toolchain from `rust-toolchain.toml`], target `wasm32v1-none`; see [SCOPE.md](SCOPE.md#build). Published hashes come from the pinned container build in [`docs/REPRODUCIBLE_BUILDS.md`](../REPRODUCIBLE_BUILDS.md) |

### Crates in scope

| Crate | Folder | Code lines |
| --- | --- | ---: |
| Manager | `contracts/manager/` | [ ] |
| Token | `contracts/token/` | [ ] |
| Governor | `contracts/governor/` | [ ] |
| Treasury | `contracts/treasury/` | [ ] |
| Metadata | `contracts/metadata/` | [ ] |
| Auction | `contracts/auction/` | [ ] |
| Marketplace | `contracts/marketplace/` | [ ] |
| ClaimMinter | `contracts/minter/` | [ ] |
| common (shared library) | `contracts/common/` | [ ] |
| **Total** | | **[ ]** |

Code lines leave out blank lines, comments, and test-only code; SCOPE.md explains the count and gives the figure a `cfg`-unaware tool such as `cloc` reports. The file-by-file list is in [SCOPE.md](SCOPE.md#files-in-scope). The unit tests ([number] in these crates) and the integration tests in `contracts/e2e` ([number]) come with the code as evidence.

### Dependencies

| | |
| --- | --- |
| soroban-sdk | [version] |
| OpenZeppelin `stellar-contracts` | [revision or tag], commit [hash] |
| OpenZeppelin modules used | `stellar_governance::governor`, `stellar_governance::votes`, `stellar_tokens::non_fungible`, `stellar_contract_utils::pausable`, `stellar_macros` (`when_paused`, `when_not_paused`); confirm against SCOPE.md at the freeze |

[Choose one, and delete the others. [`docs/OPENZEPPELIN_PIN.md`](../OPENZEPPELIN_PIN.md) records which OpenZeppelin audits cover the pinned revision; it finds that no published report covers the changes from `239a2a7` to `fbfde38`, and recommends the third option unless OpenZeppelin confirms that a published review covers them.]

- [The OpenZeppelin modules used are covered by OpenZeppelin's published audit of [release], and the revision we use is that release. They are out of scope.]
- [The revision we use differs from the audited release [release]. The difference is recorded in [`docs/OPENZEPPELIN_PIN.md`](../OPENZEPPELIN_PIN.md); please review that difference as part of the scope.]
- [Please include the OpenZeppelin modules used in the scope.]

## 3. Out of scope

- `contracts/e2e/` (integration tests) and `contracts/vote-adapter-mock/` (a test and testnet mock that must never be approved on mainnet).
- `soroban-sdk` and the Soroban host.
- [The OpenZeppelin modules, if section 2 says so.]
- The web app (`apps/web`), docs site (`apps/docs`), indexer (`packages/goldsky`), SQL read model (`db/`), generated bindings (`packages/*-bindings`), and deployment scripts. [Delete this item if the app and indexer tier is a second engagement, and describe that engagement in section 6.]
- UI styling, the documentation, and legal pages.

## 4. What we provide

- This folder: [README.md](README.md) (start here), [SCOPE.md](SCOPE.md), [STATE_MACHINES.md](STATE_MACHINES.md), [INVARIANTS.md](INVARIANTS.md), [KNOWN_ISSUES.md](KNOWN_ISSUES.md), and [THREAT_MODEL.md](THREAT_MODEL.md).
- [`docs/SECURITY_MODEL.md`](../SECURITY_MODEL.md): roles, the admin model, the lifecycle, voting supply, the execution path, upgrades, and error codes.
- The design documents in [`docs/designs/`](../designs), and each crate's README.
- [Test results and the coverage report for the frozen commit (`scripts/coverage.sh`, see [`docs/COVERAGE.md`](../COVERAGE.md)): link.]
- The reproducible build: [`docs/REPRODUCIBLE_BUILDS.md`](../REPRODUCIBLE_BUILDS.md), with the hashes the frozen tag publishes in `releases/hashes.json` [and the release workflow run for the tag: link].
- The operations documents, if the app and indexer tier is in scope: [`docs/KEY_CUSTODY.md`](../KEY_CUSTODY.md) and [`docs/INCIDENT_RUNBOOK.md`](../INCIDENT_RUNBOOK.md).

Please don't report the items in KNOWN_ISSUES.md as new findings, unless you find that one is worse than it describes.

## 5. Questions we most want answered

1. **Authority after launch.** Can a launch admin, a deployer, or the Manager admin keep, or later regain, any power over a DAO after it launches: through admin handoff, mint allowances, claim lists opened in Setup, transfer agents, modules registered in Setup, or upgrades?
2. **Funds without a proposal.** Can any path move a DAO's funds or tokens without a passed proposal, other than the permissionless paths `SECURITY_MODEL.md` lists? Do the Treasury's `authorize` trees authorize only what voters see?
3. **Escrow.** Is every escrowed amount (auction bids, listings, pool stock, ClaimMinter escrow) always either paid out once or returned once? Can anyone block refunds or settlement?
4. **Votes and quorum.** Do voting units, the voting supply, and the quorum stay correct on every transfer, mint, custody, and delegation path? Can a vote count twice, or a quorum be lowered after a proposal is created?
5. **Upgrades.** Are registry approvals, per-path upgrades, storage-version migrations, the Governor's and Treasury's storage-layout gate and recovery proposals, the Manager's notice period, and recovery upgrades of a failed drive sound?
6. **Isolation between DAOs.** Can one DAO affect another DAO's state, mints, or escrow through the Manager or shared code?
7. **Resource limits and archival.** Can a passed proposal, a claim, or a settlement become impossible to complete because of event, footprint, or CPU limits, or because an entry archives?
8. **Claims.** Are the Merkle proofs and claim checks sound?
9. [Your own questions.]

## 6. Logistics

| | |
| --- | --- |
| Start date | [ ] |
| Expected length | [ ] |
| Our contacts | [names and how to reach them] |
| How findings are shared | [a private channel, for example private GitHub security advisories on the repository] |
| Fix review | [one fix-review round per engagement, within [time] of the report] |
| Report | [published with the hashes it covers, after the fixes are reviewed] |
| Second engagement | [scope and timing, or "none"] |
