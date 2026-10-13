# Contract upgrades: step-by-step runbook

How to ship a change to a DAO module (token, metadata, auction, governor, treasury, marketplace) to DAOs
that already exist, **without redeploying**. The rules behind each step (who may upgrade, approvals,
migrations, revocation) are in [SECURITY_MODEL.md § Upgrade path and migrations](SECURITY_MODEL.md#upgrade-path-and-migrations)
and [MANAGER_DEPLOYMENT.md § Registry and upgrades](MANAGER_DEPLOYMENT.md#registry-and-upgrades). This page is the
operator's order of operations.

Worked example throughout: **token 0.1.0 → 0.2.0** (`set_metadata` emits `MetadataUpdated`), testnet,
from `3e44c300…b9311` to `c5a5c738…4067c`.

## How an upgrade works (one paragraph)

A module swaps its code with `upgrade(from_hash, to_hash)`, called by its **admin**: the launch admin during
setup, the **Treasury** after launch (so, by proposal). The module checks `from_hash` is the code it runs
(`HashMismatch`, 7005), asks the Manager `is_upgrade_approved(from, to)` (`UpgradeNotApproved`, 7006, also false
when `to` is revoked), takes the version from the registry, emits `Upgraded`, and swaps the WASM. Storage is
kept. If the release changes a storage layout, `migrate()` runs next, in the same proposal. The Manager can
approve a path but can never force a DAO to take it.

## 0. Decide: upgrade or redeploy

Upgrade (this page) for any change to an existing module. Redeploy only for a fresh environment
(see the testnet redeploy runbook in project notes). Pre-mainnet, breaking changes are allowed, but existing
DAOs keep their addresses and history only through upgrades.

## 1. Prepare the release

1. Make the contract change. Decide whether it changes **storage layout**:
   - No (e.g. a new event, new logic over existing keys): no `migrate` step.
   - Yes: bump that module's `STORAGE_VERSION` and do the data rewrite in its `migrate()` after
     `common::upgrade::migrate`. Every proposal for this release then runs `upgrade` **then** `migrate`.
2. Bump the module in [`releases/contracts.json`](../releases/contracts.json) (e.g. `"token": "0.2.0"`). This is the
   version registered for the new hash. **Registry records are write-once**: a wrong version can never be fixed.
3. Build: `pnpm contracts:build`. Note the new hash: `shasum -a 256 target/wasm32v1-none/release/<module>.wasm`.
4. Know exactly what ships: the new code is everything since the deployed build, not just your change.
   ```sh
   C=$(jq -r .sourceCommit deploys/<label>-<network>-manager.json)
   git diff --stat $C -- contracts/<module> contracts/common Cargo.lock
   ```
5. Find the deployed hash (the `from`) and confirm a DAO really runs it (read-only):
   ```sh
   jq -r .implementations.<module> deploys/<label>-<network>-manager.json
   stellar contract invoke --id <module-address> --network <network> --source-account <any> --send no -- wasm_hash
   ```

## 2. Test the upgrade against the deployed code

1. Unit tests for the change in the module crate (`cargo test -p <module>`).
2. Fetch the **deployed** WASM as a fixture (read-only) and check its hash; record it in
   [`contracts/e2e/fixtures/README.md`](../contracts/e2e/fixtures/README.md):
   ```sh
   stellar contract fetch --wasm-hash <from-hash> --network <network> --out-file contracts/e2e/fixtures/<module>-<version>.wasm
   shasum -a 256 contracts/e2e/fixtures/<module>-<version>.wasm   # must equal <from-hash>
   ```
3. Add e2e upgrade tests in `contracts/e2e/src/test.rs` that start from the fixture (see the token examples:
   `dao_on_deployed_token`, `token_upgrade_*`). Cover at least:
   - setup-window upgrade by the launch admin: state kept (balances, owners, votes, settings), `version()` and
     `wasm_hash()` moved, the new behaviour works, launch still succeeds;
   - live upgrade by proposal through `treasury.execute` with `e.set_auths(&[])` (Treasury's own auth only),
     including a call that needs the new code **in the same proposal** if the UI will offer that;
   - rejections: unapproved target, stale `from`, revoked target;
   - with a storage change: `migrate()` in the same proposal and `storage_version()` after.
4. `cargo fmt --all && cargo test --workspace && cargo clippy --workspace --all-targets`.

## 3. Bindings and app

1. `pnpm contracts:bindings`, then rebuild **every** bindings package (the script clears all `dist/` folders):
   ```sh
   for p in $(ls packages | grep bindings); do pnpm --filter "@builder-stellar/$p" build; done
   ```
2. New callable functions: add them to `apps/web/src/lib/proposal-supported-calls.ts` (fail-closed encoder) and,
   if members propose them, a handler in `apps/web/src/lib/proposal-actions` (+ registry, labels, identity/risk).
3. Add a release note in members' words to `apps/web/src/lib/release-notes.ts`
   (`RELEASE_NOTES[module][version]`). Manage → Contract upgrades, the setup checklist and the proposal
   description show it; the registry itself only stores a version and a hash.
4. Features that need the new release must **check the version** and explain the upgrade instead of silently
   misbehaving on old modules: read the module's `version()`, lock the feature below the release, and link to
   Manage → Contract upgrades. (Token 0.2.0 renames and the 0.2.0 comments did this.) Once every deployed
   community runs the release, **delete the check and any old-call fallback** (§6), so the app only carries
   code for releases that are actually live.

## 4. Indexer and read model (if events or views change)

1. New `#[contractevent]` structs are picked up from `contracts/*/src/events.rs` automatically. Also:
   - add the event's topic names to `packages/goldsky/src/decoded-events.script.js` (`test/contract-alignment.test.mjs`
     fails on a struct the decoder does not name, and `test/every-event.test.mjs` runs every struct through the
     decoder and the feed transform);
   - if members should see it, map it in `src/activity-feed.script.js` (kind, title, summary, visibility);
   - `pnpm --filter @builder-stellar/goldsky generate && node --test packages/goldsky/test/*.test.mjs`.
2. View changes: a **new** append-only migration in `db/migrations/` (never edit an applied one; the ledger
   checksums them) plus `db/rollback/<NNNN>_<name>_rollback.sql`. Keep column names and order when replacing a
   view so dependent views survive (`CREATE OR REPLACE VIEW`). Extend
   `packages/goldsky/test/read-model.integration.test.mjs` with a scenario for the new events.
3. Run the full database cycle on a **throwaway local** database (migrate → rollback → migrate + integration):
   ```sh
   createdb -h localhost builder_migration_test
   TEST_DATABASE_URL="postgres://$(whoami)@localhost:5432/builder_migration_test" ./db/test-migrations.sh
   dropdb -h localhost builder_migration_test
   ```

Commit all of the above before touching the network.

## 5. Roll out (outward-facing: get sign-off first)

Order matters: indexer first, so the first event from upgraded code is decoded and shown; then the registry;
then each DAO.

1. **Database**: apply the migration and refresh grants.
   ```sh
   ./db/migrate.sh "$ADMIN_DATABASE_URL"
   ./db/grant-permissions.sh "$ADMIN_DATABASE_URL"
   ```
2. **Goldsky pipeline** (testnet is the Turbo pipeline `builder-stellar-testnet`, the name `pnpm generate`
   writes into `packages/goldsky/pipelines/builder-stellar-events.yaml`): apply it **in place**
   (`cd packages/goldsky && ./scripts/deploy.sh deploy`, i.e. `goldsky turbo apply`).
   No delete or replay is needed when the change only adds events.
3. **Registry** (Manager admin key, `DEPLOY_IDENTITY`, default `<network>-admin`):
   1. Upload, register and approve the path:
      ```sh
      node scripts/upgrade-contract.mjs <module> configs/<network>-<label>-dao.json configs/<network>-manager.json <from-hash>
      ```
      Argument order for DAO modules is **DAO config, then network config**. It uploads the WASM,
      `register_implementation(<Name>, <release version>, <to-hash>)` (skipped if already registered),
      `approve_upgrade(<from>, <to>)`, then upgrades the DAO named in the DAO config: directly if it is in setup,
      or, if live, writes `deploys/<label>-<network>-dao-<nonce>-<module>-upgrade.json` and prints the
      propose → vote → queue → execute commands (it never submits to the Governor).
   2. Point the app at the release. Manage → Contract upgrades offers `get_latest_implementation(<Name>)`,
      which registration does **not** move:
      ```sh
      stellar contract invoke --id <manager> --network <network> --source-account <admin> -- \
        set_latest_implementation --name <Name> --wasm_hash <to-hash>
      ```
   3. New DAOs: set the factory's current hashes (all seven, unchanged ones repeated; read them with
      `current_implementations` on the Manager or from the deploy record). `claims` is the ClaimMinter's hash:
      ```sh
      stellar contract invoke --id <manager> --network <network> --source-account <admin> -- \
        set_current_implementations --current '{"token":"<h>","metadata":"<h>","auction":"<h>","governor":"<h>","treasury":"<h>","marketplace":"<h>","claims":"<h>"}'
      ```
   4. Every other existing DAO also needs the path from **its** current hash approved (usually the same `from`).
4. **Each DAO**: once steps 3.1–3.2 are done, communities see the upgrade by themselves: Manage →
   Contract upgrades, a notice on the Manage overview and (for members of launched communities) on Home,
   and in setup the launch checklist. A withdrawn version becomes a required step that blocks launch.
   - In setup: the launch admin clicks **Apply N upgrades** (direct `upgrade` calls, one signature each), or
     uses the script.
   - Live: Manage → Contract upgrades → add the upgrade to the proposal draft (plus any follow-up action that
     needs the new code, e.g. a rename), then propose, vote, queue after `voting_period`, and execute through the
     **Treasury** after `queue_delay` (Governor.execute fails with `UseTreasuryExecute`). A succeeded proposal
     that isn't queued expires 14 days after voting ends; a queued one 14 days after its ETA.
   - Treasury and Governor upgrade themselves through the Treasury's self-call allowlist (`upgrade`, `migrate`).
     Nothing needs syncing afterwards: every module's `version()` looks its current hash up in the Manager
     registry on each read.
   - Manage puts every module upgrade in **one** proposal except the Treasury's, which goes alone: the Treasury
     runs the proposal, so later calls in the same run would still use its old code. The Governor batches safely
     (it has finished with the proposal before the Treasury makes the calls); see
     `comment_modules_upgrade_by_proposal_keeps_live_state` in `contracts/e2e/src/test.rs`.

## 6. Verify

```sh
stellar contract invoke --id <module-address> --network <network> --source-account <any> --send no -- version    # new version
stellar contract invoke --id <module-address> --network <network> --source-account <any> --send no -- wasm_hash  # <to-hash>
```

- Read model: `manager.module_versions` shows the new hash/version and `upgrade_count`; the activity feed shows
  "Contract upgraded to version …".
- Exercise the new behaviour once on the upgraded DAO (e.g. rename) and confirm it reaches the app after indexing.
- When every community is on the release, remove the version checks and old-call fallbacks from the app
  (see §3.4) and record each DAO's proposal transactions in the deploy record.
- Report every transaction hash.

## Rolling back

- **Code**: there is no downgrade button. To go back, the Manager admin approves the reverse path
  (`approve_upgrade(<new>, <old>)`; the old hash must not be revoked) and each DAO upgrades again (by proposal
  when live). If storage was migrated, the old code must still read the new layout; otherwise don't roll back.
- **Stop further adoption** of a bad release: `revoke_implementation(<to-hash>)`. Revocation blocks new upgrades
  and launches of pending DAOs on that hash; it does not change DAOs already on it.
- **Database**: `./db/rollback.sh --steps 1` runs the matching rollback file.
- Registry records cannot be edited or deleted; a mistaken version string needs a new build (new hash).

## Manager upgrades

`node scripts/upgrade-contract.mjs manager configs/<network>-manager.json <from-hash>` with
`LEGACY_MANAGER_VERSION=<active release>`: registers the old Manager hash if needed, registers and approves the
new one, then calls `upgrade_manager` (Manager admin). The Manager's own upgrade waits out its notice
(`manager.upgrade_delay()` ledgers after the approval, D39): on the first run the script approves and prints the
ledger from which the upgrade may run; rerun it then. The same latest-only rule applies (`UpgradeNotLatest`,
7131): the script announces the hash as latest for `Manager` first. Upgrade the Manager **before** modules whenever
module upgrades rely on new Manager reads (the script checks `get_implementation_version` exists).

## Module upgrades (Auction, Marketplace, ClaimMinter)

Modules are per DAO, so they upgrade exactly like the core contracts: the Manager admin registers and approves
the path, and each DAO upgrades its own module, directly in setup or by proposal once live. There is no shared
contract whose upgrade reaches every DAO (the shared Minter was removed by
[membership-models](designs/membership-models.md)). The ClaimMinter's implementation name is `ClaimMinter` and
its crate is `contracts/minter`; the script's module name is `claims`:

```sh
node scripts/upgrade-contract.mjs claims configs/<network>-<label>-dao.json configs/<network>-manager.json <from-hash>
```

A module added after creation (`create_module`) is not in the DAO artifact; pass its address in
`MODULE_ADDRESS`. A module registered from outside the Manager upgrades however its own code allows; the
registry only vouches for Manager-approved hashes.

**Failed assurance drives.** An open drive freezes its DAO's upgrades (every admin is the Treasury, which can't
act before launch). If a drive fails and the ClaimMinter's refund code is broken, the launch admin recorded in
`PendingDao` runs `manager.recover_claims(token, from_hash, to_hash)` to move that DAO's ClaimMinter to a
Manager-approved `claims` hash; it works only once the drive has failed and never on a live module
(SECURITY_MODEL, Assurance launch).

## Approving upgrade paths for DAO modules

DAO modules keep directional approvals (`approve_upgrade(from, to)`) and no latest-only rule, because a DAO's
own proposal is its notice and a migration may have to pass through intermediate versions. The rule for the
Manager admin: **approve only the paths the `migrate` code supports.** Approve v1 → v2 and v2 → v3 when v3's
`migrate` assumes the v2 layout; approve v1 → v3 directly only when v3's `migrate` handles the v1 layout. A DAO
two releases behind then chains the steps: one proposal can carry `upgrade(v1, v2)`, `migrate()`,
`upgrade(v2, v3)`, `migrate()` for any module except the Treasury, whose own upgrade goes alone (e2e
`dao_module_chains_two_upgrades_in_one_proposal`). `migrate()` refuses a no-op (`NothingToMigrate`), so include
it only for steps that change the storage version.
