# Key custody and rotation

Every secret the platform holds: what it can do, where it is stored, who uses it, and how to replace it.
What to do after a leak is in the [incident runbook](INCIDENT_RUNBOOK.md). This page describes the
repository's scripts and the intended practice; it does not record who holds which key today.

## Rules for every secret

- A secret lives in one store: Vercel (sensitive variables), the Goldsky secret store, Neon, the stellar CLI's
  key store, or a password manager. It is never committed, pasted into an issue or chat, or printed in a log.
- It never goes on a command line, where `ps` shows it to every local user. The `db/` scripts read
  `DATABASE_URL` from the environment and hand psql a service file and a password file
  ([db operations](../db/README.md)); `scripts/renew-code-ttl.mjs` does the same through `scripts/pg-env.mjs`.
- Production and dev have separate values. A production secret is set for Vercel's Production environment
  only, so preview deployments of pull requests never receive it.
- Each secret has the least power its job needs: the app reads through `app_server`, the pipeline writes
  through `goldsky_writer`, renewals are paid by a key that is not the Manager admin.
- Replace a secret when someone who could read it leaves, when it may have leaked, and at least once a year.

## Summary

| Secret | What it can do | Where it is stored | Used by |
| --- | --- | --- | --- |
| Manager admin key | Register and revoke implementations, set what new tribes deploy, approve upgrades, pause the factory, upgrade the Manager after the notice, hand over the admin | stellar CLI key store of the person who deploys | `deploy-manager.mjs`, `upgrade-contract.mjs`, `/platform` (wallet) |
| Renewal payer (`<network>-renewer`) | Pay for TTL extensions and restores; no admin rights | stellar CLI key store | `renew-code-ttl.mjs`, `renew-dao.mjs` |
| `IRON_PASSWORD` | Seal and open session cookies; sign upload tokens | Vercel, per project | the web app |
| `STELLAR_WEB_AUTH_SECRET` | Sign SEP-10 sign-in challenges as the server | Vercel, per project | the web app |
| `PINATA_JWT` | Upload and manage files on the Pinata account the key belongs to | Vercel, per project | the web app's upload routes |
| `GOLDSKY_API_TOKEN` | Read the pipeline's status (Viewer role) | Vercel, per project | `/api/health` |
| Goldsky CLI login | Deploy, stop and delete pipelines; manage Goldsky secrets | the operator's machine (`goldsky login`) | `packages/goldsky/scripts/deploy.sh` |
| Database owner (`neondb_owner`) | Everything in the database: migrations, grants, resets | Neon; the operator's password manager | `db/*.sh` |
| `goldsky_writer` | Insert into the three landing tables; create the `streamling` allowlist tables | Goldsky secret (`BUILDER_POSTGRES_SECRET`, `BUILDER_DEV_POSTGRES_SECRET`) | the pipeline |
| `app_server` | Read the app-facing views | Vercel (`APP_DATABASE_URL`) | the web app |

## Manager admin keys

### Today

The production testnet Manager and the dev Manager have the same admin, the stellar CLI identity
`testnet-admin` (`GCLGEIQB4RCG63LSIBSHQ6T67YICWKTHSORNHVXHFVVGXISZU3MQU6CO`), a single key in a plain CLI
config file. A leak of that file gives the holder both Managers.

The deploy script signs every admin call with one identity and refuses one that is not the config's
`adminAddress`. It never creates an admin key on mainnet, and on local and testnet only with
`--generate-identity` ([Manager deployment](MANAGER_DEPLOYMENT.md)).

### Where an admin key is kept

A plain identity (`stellar keys generate <name>`) keeps its seed phrase in a file under
`~/.config/stellar`, readable by anything that runs as the user. That is acceptable for throwaway local and
testnet keys only. For an admin key use one of:

- a hardware wallet: `stellar keys add <name> --ledger`, then sign with the device;
- the OS secure store (Keychain on macOS): `stellar keys generate <name> --secure-store`, or
  `stellar keys add <name> --secure-store` for an existing seed phrase.

Run the first admin call with a new identity on the dev Manager, to check the CLI signs with it as expected.

### Separate dev and production admins

These steps move the dev Manager to its own admin. They change on-chain state, so run them only when the
handover is planned. The handover is two-step: the current admin proposes, the new admin accepts, and
`cancel_pending_admin` withdraws a proposal that has not been accepted.

1. Create the dev admin in the secure store and fund it:

   ```bash
   stellar keys generate testnet-dev-admin --secure-store
   stellar keys fund testnet-dev-admin --network testnet
   ```

2. Propose it, signed by the current admin. The dev Manager address is `manager` in
   `deploys/dev-testnet-manager.json`:

   ```bash
   stellar contract invoke --id <dev Manager> --source-account testnet-admin --network testnet \
     -- propose_admin --new_admin "$(stellar keys address testnet-dev-admin)"
   ```

3. Accept it, signed by the new admin, and check the result:

   ```bash
   stellar contract invoke --id <dev Manager> --source-account testnet-dev-admin --network testnet -- accept_admin
   stellar contract invoke --id <dev Manager> --source-account testnet-dev-admin --network testnet --send no -- get_admin
   ```

4. Set `adminAddress` in `configs/testnet-dev-manager.json`, update the admin line in
   [DEV_DEPLOYMENT.md](DEV_DEPLOYMENT.md), and use `DEPLOY_IDENTITY=testnet-dev-admin` for the dev Manager's
   deploy and upgrade scripts from then on.

The production Manager keeps `testnet-admin` until it moves to a multisig admin (below). After the split,
a leak of one key no longer gives the holder the other Manager.

### A multisig admin

A multisig admin is a Stellar account whose signers are several keys, ideally hardware wallets held by
different people, with a threshold such as two of three. The Manager calls `require_auth` on the admin
address. When that address is also the transaction's source account, the transaction's signatures must
meet the account's threshold, so one stolen key is not enough.

These steps have not been rehearsed. Rehearse them on the dev Manager first.

1. Create and fund the account, then add the signers and set the thresholds. Each signer's public key comes
   from its own device:

   ```bash
   stellar tx new set-options --source-account <multisig account> --signer <signer 1> --signer-weight 1 --network testnet
   stellar tx new set-options --source-account <multisig account> --signer <signer 2> --signer-weight 1 --network testnet
   stellar tx new set-options --source-account <multisig account> --signer <signer 3> --signer-weight 1 --network testnet
   stellar tx new set-options --source-account <multisig account> --master-weight 0 \
     --low-threshold 2 --med-threshold 2 --high-threshold 2 --network testnet
   ```

   Check the thresholds and signers on the account before the last step: setting the master weight to 0
   removes the original key's power, and a mistake can lock the account.

2. Propose the multisig account as admin, signed by the current admin (as in step 2 above).

3. Accept, signed by enough signers. Build the transaction with the multisig account as its source,
   simulate it, sign it once per signer, then send it:

   ```bash
   stellar contract invoke --id <Manager> --source-account <multisig account> --network testnet --build-only \
     -- accept_admin > accept.xdr
   stellar tx simulate --network testnet < accept.xdr > accept.sim.xdr
   stellar tx sign --sign-with-ledger --network testnet < accept.sim.xdr > accept.1.xdr
   stellar tx sign --sign-with-ledger --network testnet < accept.1.xdr > accept.2.xdr
   stellar tx send --network testnet < accept.2.xdr
   ```

4. Every later admin call follows the same build, simulate, sign, send sequence. `deploy-manager.mjs` and
   `upgrade-contract.mjs` sign with one identity and don't support this yet: with a multisig admin, run their
   admin steps by hand.

A new mainnet Manager is deployed with a single key (the deploy script needs the admin to be the identity
it signs with), then handed to the multisig account with `propose_admin` and `accept_admin` before any
tribe is created on it.

## Renewal payer

Extending a TTL needs no admin rights, so renewals are paid by a separate low-value key. Both renewal
scripts default to the identity `<network>-renewer` (`RENEW_IDENTITY` or `--source` / `--identity`
override it), sign through the stellar CLI and never read the seed into Node. They warn when the payer is the
Manager admin.

```bash
stellar keys generate testnet-renewer --fund     # testnet: Friendbot funds it
```

On mainnet, fund it from another account with enough for the next renewal the dry run quotes
(`renew-code-ttl.mjs --dry-run`), not more. A leak costs at most its balance: replace the key and move what
is left.

## Web app secrets

All four are Vercel sensitive variables, set separately on `builder-stellar-web` (production) and
`builder-stellar-dev` (dev.tribes.build). After changing one, redeploy the project: Vercel applies a new value
only to new deployments.

- **`IRON_PASSWORD`** seals the session cookie and signs upload tokens. Generate a value of at least
  32 characters, for example with `openssl rand -base64 48`, set it and redeploy. Every session and every
  issued upload token ends at once: everyone signs in again.
- **`STELLAR_WEB_AUTH_SECRET`** is the SEP-10 server key (`dev-web-auth` on dev). A holder can issue
  challenges the server accepts as its own; signing in as an account still needs that account's signature.
  Generate a new key (`stellar keys generate <name> --secure-store`, then read its secret once with
  `stellar keys show <name>` to paste into Vercel), fund it as the old one was, set it and redeploy.
  Challenges issued before the change fail, and wallets ask again.
- **`PINATA_JWT`**: production and dev each get their own scoped key ([DEV_DEPLOYMENT.md](DEV_DEPLOYMENT.md)).
  To replace one, create a new key in the Pinata dashboard with the same scopes, set it, redeploy, upload one
  image to check it, then revoke the old key in Pinata.
- **`GOLDSKY_API_TOKEN`**: a Viewer-role token. Create a new one in the Goldsky dashboard, set it, redeploy,
  check that `/api/health` reports `pipeline.configured` true and a `pipeline_last_ledger`, then delete the
  old token.

## Database roles

Neon roles are per branch, so production (`production`) and dev (`dev`) have separate passwords.

- **Owner (`neondb_owner`)** runs migrations, grants and resets from an operator's machine. It is never set in
  Vercel or Goldsky. Replace its password in the Neon console.
- **`goldsky_writer`** writes the landing tables. A holder can insert fabricated landing rows (the tables are
  append-only, so existing rows can't be changed) and can create only the `streamling` schema
  (`grant-permissions.sh` installs the guard).
- **`app_server`** reads the app-facing views only; it has no access to `chain.*`.

To replace the writer's or the app's password:

```bash
DATABASE_URL='<owner URL for the branch>' ./db/setup-roles.sh --rotate goldsky_writer
DATABASE_URL='<owner URL for the branch>' ./db/setup-roles.sh --rotate app_server
```

psql asks for the new password twice and sends only its SCRAM hash. Then update where it is used: the
Goldsky secret for the writer, after which the pipeline reconnects (check that its position moves with
`goldsky turbo state list <pipeline>`); `APP_DATABASE_URL` in Vercel for the app, then redeploy and check
`/api/health`.
Sessions already open with the old password stay connected until they close.

The Goldsky CLI login can replace pipelines and secrets. Remove it from machines that no longer deploy, and
replace the account's API key in the Goldsky dashboard when someone with access leaves.
