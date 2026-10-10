# How to deploy Manager

Manager owns the platform implementation registry and factory. It deploys six modules per DAO, deletes temporary pending setup state at launch, and retains persistent slug mappings. The deployment script also deploys/registers a shared Minter.

## Inputs and commands

Run from the repository root with a funded identity on the configured network:

```bash
pnpm deploy:manager configs/testnet-manager.json
```

This submits transactions and writes `deploys/<label>-<network>-manager.json`. Contract addresses are deterministic (salt from label, network, package and WASM hash): with unchanged WASMs a rerun reattaches to the existing Manager. Set `DEPLOY_SALT_SUFFIX` for a genuinely fresh Manager (for example after a reset when the previous one already holds the slugs you need). `--force` bypasses the artifact overwrite prompt; it is not a database reset or proof of a fresh deployment. The script can resume from existing artifacts. `DEPLOY_IDENTITY` overrides the default `<network>-admin` identity; the configuration's `adminAddress` is a public account address, not a secret.

Inputs are [network configuration](../configs/testnet-manager.json), [release versions](../releases/contracts.json), and built contract sources. The script runs `stellar contract build`, uploads eight WASMs (Manager, six modules, Minter), registers their names/versions, selects each name's latest implementation (`set_latest_implementation`; registration alone does not move it) and the six current module implementations, deploys the shared Minter, and calls `set_platform_minter`.

Registry entries are write-once. The script checks existing/created records against expected name/version. A wrong record cannot be renamed or un-revoked. Optional `EXTEND_CODE_TTL_DAYS` prepays code rent; the default is no opt-in extension. See [TTL maintenance](TTL_ECONOMICS.md).

## Artifacts and consumers

Artifacts contain network, Manager/Minter addresses, implementation hashes, versions, deployment ledger, and transaction metadata. They are deployment records, not live-health reports.

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
pnpm deploy:dao bump_slug_ttl configs/testnet-builder-dao.json configs/testnet-manager.json   # renew the slug registry TTL (permissionless, repeat periodically)
```

These are separate phases. Prediction is `predict_addresses(creator, nonce)`, not `predict`. `create_dao` only requests the config's `slug` (4-63 chars of `[a-z0-9-]`) and fails early if a launched DAO holds it; `launch_dao` claims it permanently, first launch wins (`SlugTaken`; rename a pending request with `update_pending_slug`). Each rehearsal run uses a fresh slug. The Manager has a permanent slug registry (`get_dao_by_slug`, `get_slug`, launched DAOs only) but no DAO list API. `launch_dao` also checks the factory is not paused (`FactoryPaused`), the launch admin is still the token admin, a nonzero voting supply, unchanged payment assets and, with `enable_minter`, the registered platform Minter (`PlatformMinterNotSet` 7108). See [DAO deployment](DAO_DEPLOYMENT.md) for configuration, signatures, setup, and recovery.

## Registry and upgrades

Manager admin can register/revoke implementations, select defaults, approve directional upgrades, pause creation, set the platform Minter, and upgrade Manager. Admin handover uses `propose_admin` / `accept_admin`; pending handover can be canceled.

DAO module upgrades require the module admin and an approved registered transition with matching source hash. Before launch the launch admin can call directly; afterward a Governor proposal executes through Treasury. Treasury's own upgrade uses self-dispatch (allowed self-calls: `upgrade`, `migrate`, `sync_version`, `authorize`). A release that changes a storage layout adds a `migrate()` action right after `upgrade`. Creation also rejects a secondary marketplace fee above 2,500 bps (`InvalidFee` 7125). `get_latest_implementation` returns no fallback after revocation; security decisions use the actual current hash and `get_implementation`.

[upgrade-contract.mjs](../scripts/upgrade-contract.mjs) uploads/registers/approves implementations. For Live DAOs it writes a proposal payload rather than submitting the Governor proposal. Read its actual argument parsing before use: DAO-module inputs are DAO config, network config, and source hash. Manager upgrades additionally require the verified `LEGACY_MANAGER_VERSION`. Do not treat this script as a read-only proposal preview.

Pending DAO launch checks every module's current registered/non-revoked hash (`PendingDaoUsesRevokedImplementation` 7121). Revocation does not stop an already-Launched DAO's normal operation or allow Manager to force its upgrade. See [security](SECURITY_MODEL.md).
