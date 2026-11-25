# Incident runbook

What to do when a key or secret leaks, when a module misbehaves, or when the indexer receives an event the
views can't read. Where each secret lives and how it is replaced is in [key custody](KEY_CUSTODY.md); the
signals that should start an incident are in [monitoring](MONITORING.md#alerting-plan). The commands below
change on-chain state or production configuration: run each one deliberately and record it.

## For every incident

1. Name one person to lead and one place to record what happens, with times (UTC) and transaction hashes.
2. Keep the evidence. Landing rows are append-only, so the indexed events stay. Copy the relevant logs
   (Vercel, Goldsky) before they expire.
3. Contain first, then fix: stop the harm (pause, revoke, replace the secret), then repair, then tell the
   people affected.
4. Afterwards, write down the cause, the timeline, what worked and what changes, and update this page.

## Manager admin key compromise

**Signs.** An admin call nobody planned: `implementation_registered`, `current_implementations_updated`,
`latest_implementation_set`, `upgrade_approved`, `upgrade_delay_changed`, `admin_proposed`, `admin_changed`,
`factory_paused` or `implementation_revoked` from the Manager; or the key's file or device is lost.

**What the holder can do.** Set the code new tribes are created with; approve upgrades to any registered
hash; approve vote sources (`approve_vote_source`); register a new Manager hash, which can be applied only
after the upgrade notice (`upgrade_delay()` ledgers: 720 on testnet today; the deploy script starts a
mainnet Manager at 7 days at least, and a reduction with `set_upgrade_delay` waits out the notice in force);
pause the factory or revoke implementations, which blocks pending launches and can end assurance drives in
refunds; and hand the admin role to another key.

**What it can't do.** Mint for any tribe, spend a Treasury, or upgrade a launched tribe's contracts: those
need the tribe's own proposal. A tribe in Setup can be upgraded by its launch admin, so warn launch admins.

**Steps, in order.** `<admin>` is the compromised identity while it still controls the Manager.

1. **Pause the factory**, so no tribe is created from code the holder chose:

   ```bash
   stellar contract invoke --id <Manager> --source-account <admin> --network <network> -- pause_factory
   ```

2. **Move the admin role to a new key** before the holder does. Speed matters: whoever completes a handover
   first keeps the Manager. If `get_pending_admin` names an address you don't know, withdraw it first:

   ```bash
   stellar contract invoke --id <Manager> --source-account <admin> --network <network> -- cancel_pending_admin
   stellar contract invoke --id <Manager> --source-account <admin> --network <network> -- propose_admin --new_admin <new admin>
   stellar contract invoke --id <Manager> --source-account <new admin> --network <network> -- accept_admin
   ```

   Use a key from the secure store or a hardware wallet, or the multisig account
   ([key custody](KEY_CUSTODY.md#a-multisig-admin)). If the holder has already accepted a handover, the
   Manager can't be recovered: go to step 7.

3. **Block a hostile Manager upgrade.** For each Manager hash registered since the leak, compare it with the
   published release hashes. Revoke any hash you don't recognise: `upgrade_manager` refuses a revoked target,
   and a revocation can't be undone, so the holder can't reverse it.

   ```bash
   stellar contract invoke --id <Manager> --source-account <new admin> --network <network> --send no -- latest_pointer --name Manager
   stellar contract invoke --id <Manager> --source-account <new admin> --network <network> -- revoke_implementation --wasm_hash <hash>
   ```

4. **Clean the registry.** Revoke every other implementation the holder registered. Set the current
   implementations and each name's latest implementation back to the published hashes
   (`set_current_implementations`, `set_latest_implementation`). If `upgrade_delay_changed` shows a
   reduction, set the delay back (`set_upgrade_delay`); a reduction waits out the notice in force, so it had
   not taken effect yet.

5. **Tell the people who can act.** Launch admins of tribes in Setup: don't upgrade until the registry is
   clean. Every tribe: don't pass a proposal that upgrades to a hash that isn't in the published release
   hashes. Approvals the holder gave stay on chain, so this warning is the protection.

6. **Unpause** with `unpause_factory` once the registry is clean, and replace the key everywhere it was named:
   the network config's `adminAddress`, [DEV_DEPLOYMENT.md](DEV_DEPLOYMENT.md) and the deploy identities.

7. **If the Manager is lost**: launched tribes keep working, since their contracts don't depend on the admin.
   New tribes need a new Manager ([Manager deployment](MANAGER_DEPLOYMENT.md)), a new pipeline and an app
   pointed at it. Tell tribes on the old Manager what the holder can still do there: register and approve
   code, and pause or revoke, which blocks pending launches.

## Leaked secrets

Replace the secret first, then look for use. Removing a secret from a commit or a chat does not un-leak it.

| Secret | Contain | Then check |
| --- | --- | --- |
| Renewal payer | Move its balance to a new payer key | Its transactions since the leak |
| `IRON_PASSWORD` | Replace and redeploy; every session ends | Uploads and session-bound actions since the leak |
| `STELLAR_WEB_AUTH_SECRET` | Replace and redeploy | Sign-ins since the leak |
| `PINATA_JWT` | Revoke the key in Pinata, set a new one, redeploy | Files pinned since the leak and the account's usage |
| `GOLDSKY_API_TOKEN` | Delete the token in Goldsky, set a new one | Nothing else: the token only reads status |
| Goldsky CLI login | Replace the account's API key in Goldsky | Pipelines and secrets changed since the leak |
| `goldsky_writer` password | `setup-roles.sh --rotate goldsky_writer`, update the Goldsky secret | Landing rows from unexpected sources (below) |
| `app_server` password | `setup-roles.sh --rotate app_server`, update `APP_DATABASE_URL`, redeploy | Connections in the Neon console |
| Database owner | Replace in the Neon console | Roles, grants and schemas (`./db/debug-database.sh`) |

A leaked writer password lets the holder insert rows into the landing tables. Rows the pipeline wrote have a
matching event on chain; to check one, compare its `transaction_hash` and position with the RPC
(`getTransaction`) or a ledger explorer. The tables are append-only, so a fabricated row can't be deleted in
place. If you find one, reset and replay the database (below) after the password is replaced.

## A hostile module

A tribe can register any contract as a module by proposal. The platform does not vouch for its code: it is
role `module`, kept out of the domain views and the public feed. Since migration 0015 a tribe that registers
another tribe's module sees it as role `module` too, so it can't present that module as its own market or
claims list.

**Signs.** A module flooding its tribe's admin feed, values that look wrong, or a tribe's members reporting a
contract that moves tokens or funds they did not expect.

**Steps.**

1. The tribe removes it by vote (Manage → Modules, `unregister_module`). That ends its registration window in
   every view and revokes it as a transfer agent. Lowering its mint allowance to zero by vote
   (`decrease_mint_allowance`) stops it minting.
2. If its events still reach the indexer, the operator can stop them: delete its row from
   `streamling.dao_modules` (the only allowlist an outside contract is in) and re-apply the pipeline
   (`packages/goldsky/scripts/deploy.sh deploy`). Check that new events stop: whether a running pipeline
   notices a deleted row without the re-apply is unverified.
3. Rows already indexed stay. The views ignore its events once it is unregistered.

If its events stop a view from reading, follow the next section.

## A malformed indexer event

Any contract a tribe registers can emit any value, and the landing tables can't be edited, so the views must
read every value without raising (migrations 0012, 0013 and 0016 do this for the known cases).

**Signs.** `/api/health` reports `unhealthy` while the pipeline is current, or a page fails with a database
error such as `invalid input syntax` or `out of range`.

**Steps.**

1. Find the view and the row: the error names the cast; query `manager.module_events` for that event name
   and recent ledgers as the owner.
2. Fix it in the views, not the data: add a migration that reads the field through a safe cast
   (`chain.try_int`, `chain.u64_bigint`, `chain.try_numeric`, or a new helper of the same kind), or that
   reads it only from the roles the Manager deployed. A cast in a `WHERE` or `JOIN` condition must sit on a
   relation that has its own role condition ([Casts in conditions](DATABASE_SCHEMA.md#casts-in-conditions)).
   Add an integration test with the malformed event (see
   `packages/goldsky/test/read-model.integration.test.mjs`) and run `./db/test-migrations.sh`.
3. Apply it with `./db/migrate.sh` and `./db/grant-permissions.sh`. No replay is needed: the views change,
   the rows stay.

A reset and replay doesn't help here: the event is on chain, so the replay brings it back. A reset is for a
decoder fix that changes how rows are written, or for fabricated rows. It deletes all indexed data and asks
for the database name, typed in full ([db operations](../db/README.md#resetting-a-deployed-database-clean-start)).

## Pausing the factory

`pause_factory` and `unpause_factory` are Manager admin calls; each emits an event
(`factory_paused`, `factory_unpaused`).

**What the pause stops:** `create_dao`, `create_module`, `open_assurance`, `launch_dao`,
`launch_when_ready` and `change_slug`.

**What it does not stop:**

- anything a launched tribe does: proposals, votes and execution through its Treasury, auctions, the market,
  claims, token transfers, registering or removing modules by vote, and upgrades its members pass;
- Setup work on a pending tribe's own contracts by its launch admin;
- claims into an open assurance drive, refunds, and a failed drive's `release_slug` and `recover_claims`;
- the Manager admin's own calls: registering, approving and revoking code, and upgrading the Manager;
- renewals, the indexer and the web app.

**Side effects.** A tribe in Setup can't launch while the factory is paused. An assurance drive whose
deadline passes during the pause fails, and its refunds open: nobody loses funds, but a drive that met its
target is denied its launch. Keep a pause as short as the fix allows, and tell the launch admins of pending
tribes.

**When to pause:** the code new tribes are created with is vulnerable or hostile (until
`set_current_implementations` names safe hashes), the admin key is compromised, or a Manager defect affects
creation or launch.

**When not to pause:** one tribe or module misbehaving, an indexer or database problem, or a web app
incident. The pause does not reach any of these.
