# How to deploy Manager

Manager owns the platform implementation registry and factory. It deploys each DAO's four core contracts and the modules it asks for (Auction, Marketplace, ClaimMinter), runs the assurance launch, deletes temporary pending setup state at launch, and retains persistent slug mappings. There is no shared platform contract besides the Manager.

## Inputs and commands

Run from the repository root with a funded identity on the configured network:

```bash
pnpm deploy:manager configs/testnet-manager.json
```

This submits transactions and writes `deploys/<label>-<network>-manager.json`. Contract addresses are deterministic (salt from label, network, package and WASM hash): with unchanged WASMs a rerun reattaches to the existing Manager. Set `DEPLOY_SALT_SUFFIX` for a genuinely fresh Manager (for example after a reset when the previous one already holds the slugs you need). `--force` bypasses the artifact overwrite prompt; it is not a database reset or proof of a fresh deployment. The script can resume from existing artifacts. `DEPLOY_IDENTITY` overrides the default `<network>-admin` identity; the configuration's `adminAddress` is a public account address, not a secret.

Inputs are [network configuration](../configs/testnet-manager.json), [release versions](../releases/contracts.json), and built contract sources. The configuration's `upgradeDelayLedgers` sets the Manager's upgrade notice (ledgers between an approval and the earliest Manager upgrade; 720 on testnet, 120,960 = 7 days recommended on a public network; default 7 days when unset). The admin can change it later with `set_upgrade_delay`; a reduction only applies after the notice in force. The script runs `stellar contract build`, uploads eight WASMs (Manager, Token, Metadata, Governor, Treasury, Auction, Marketplace, ClaimMinter), registers their names/versions, selects each name's latest implementation (`set_latest_implementation`; registration alone does not move it), and sets the seven current implementations `create_dao` and `create_module` deploy (`set_current_implementations --current '{…}'`, `claims` being the ClaimMinter).

Registry entries are write-once. The script checks existing/created records against expected name/version. A wrong record cannot be renamed or un-revoked. Every uploaded WASM is extended to 170 days right after upload (`EXTEND_CODE_TTL_DAYS` overrides; values at or under the contracts' 4-day code target are refused): new code is born at the network minimum of 7 days, and contracts only ever bump shared code a few days. Renew it with `node scripts/renew-code-ttl.mjs <manager-artifact> --days 170`, which reads every hash from chain. See [storage and TTL](TTL_ECONOMICS.md).

## Artifacts and consumers

Artifacts contain network, the Manager address, implementation hashes, versions, deployment ledger, and transaction metadata. They are deployment records, not live-health reports.

- Web predev/prebuild selects the newest Manager artifact by `deployedAt` and generates a deployment ID. Set the matching `NEXT_PUBLIC_NETWORK` separately.
- Goldsky uses explicit `MANAGER_DEPLOYMENT_FILE` and the artifact's starting ledger, unless overridden.
- DAO scripts find the artifact using the network config's label/network.

See [tenant boundaries](MULTITENANT_ARCHITECTURE.md) before keeping multiple network artifacts in one checkout.

## DAO creation and launch

```bash
pnpm deploy:dao --validate-only configs/testnet-builder-dao.json
pnpm deploy:dao create_dao configs/testnet-builder-dao.json configs/testnet-manager.json
pnpm deploy:dao admin_checklist configs/testnet-builder-dao.json configs/testnet-manager.json
pnpm deploy:dao launch_dao configs/testnet-builder-dao.json configs/testnet-manager.json
node scripts/renew-dao.mjs --network testnet --token <Token contract address> --days 90   # renew everything the DAO owns, slug included (permissionless)
```

These are separate phases. Prediction is `predict_addresses(creator, nonce)`, not `predict`. `create_dao` only requests the config's `slug` (4-63 chars of `[a-z0-9-]`) and fails early if a launched DAO holds it; `launch_dao` claims it, first launch wins (`SlugTaken`; rename a pending request with `update_pending_slug`). Each rehearsal run uses a fresh slug. The Manager has a slug registry (`get_dao_by_slug`, `get_slug`, launched DAOs only; `change_slug` moves a launched DAO by vote) but no DAO list API. `launch_dao` also checks the factory is not paused (`FactoryPaused`), the launch admin is still the token admin, a nonzero voting supply, and each module's payment asset unchanged since creation. See [DAO deployment](DAO_DEPLOYMENT.md) for configuration, signatures, setup, and recovery.

## Registry and upgrades

Manager admin can register/revoke implementations, select defaults, approve directional upgrades, pause the factory (creation, drives and launch), and upgrade Manager. Admin handover uses `propose_admin` / `accept_admin`; pending handover can be canceled.

DAO module upgrades require the module admin and an approved registered transition with matching source hash. Before launch the launch admin can call directly; afterward a Governor proposal executes through Treasury. Treasury's own upgrade uses self-dispatch (allowed self-calls: `upgrade`, `migrate`, `authorize`). `version()` follows the registry, so there is nothing to sync after an upgrade. A release that changes a storage layout adds a `migrate()` action right after `upgrade`. Creation also rejects a secondary marketplace fee above 2,500 bps (`InvalidFee` 7125). `get_latest_implementation` returns no fallback after revocation; security decisions use the actual current hash and `get_implementation`.

[upgrade-contract.mjs](../scripts/upgrade-contract.mjs) uploads/registers/approves implementations (`<module> <dao-config> <network-config> <from-hash>`; Manager: `manager <network-config> <from-hash>` with the verified `LEGACY_MANAGER_VERSION`; the ClaimMinter's module name is `claims`, and `MODULE_ADDRESS` names a module added with `create_module`). For Live DAOs it writes a proposal payload rather than submitting the Governor proposal. It does not move `set_latest_implementation` or `set_current_implementations`. It is not a read-only preview: it writes to the registry. The full order of operations, including the indexer, verification and rollback, is in [Contract upgrades](CONTRACT_UPGRADES.md).

Pending DAO launch checks every core contract's and registered module's current registered/non-revoked hash (`PendingDaoUsesRevokedImplementation` 7121). Revocation does not stop an already-Launched DAO's normal operation or allow Manager to force its upgrade. See [security](SECURITY_MODEL.md).

## Redeploy checklist (storage diet)

The 0.3.0 contracts changed storage layouts without a migration (pre-mainnet rule: redeploy fresh). Before pointing
the app or indexer at a deployment: no DAO created from a build before commit `f5e421d` (the `builder` namespace and
packed proposals) may remain on it; the Metadata and Governor on such a DAO would read their own entries as empty or
trap. Then: every code TTL about 170 days (`renew-code-ttl.mjs --dry-run`), `token.metadata()` and `token.name()`
answer, a rename-then-settle mints a token with artwork, a minimal `propose` simulates at well under 50 XLM, and
`renew-dao.mjs --dry-run` lists the reference classes for a launched DAO. On the indexer side, a fresh Manager means
a database reset **and** `DROP SCHEMA streamling CASCADE` with the pipeline stopped (the DAO allowlists persist
across redeploys; [DB operations](../db/README.md)), then `goldsky turbo delete` and a fresh `apply`.
