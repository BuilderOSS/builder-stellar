#!/usr/bin/env node
/**
 * End-to-end TESTNET rehearsal of the 0.4.0 membership flows: assurance launch drives (claim lists with a
 * threshold and a deadline) and the token switches (transfers_locked, members_only_delegation, dao_recovery).
 * Companion of scripts/e2e-testnet.mjs (the auction / governance / marketplace rehearsal); it reuses that
 * script's helpers, state file format, PASS/FAIL assertions and phase loop.
 *
 * Usage:
 *   node scripts/e2e-membership.mjs <phase|all> [--state .e2e/membership-state.json] [--keep-going] [--redo]
 *                                   [--manager-artifact deploys/builder-testnet-manager.json]
 *   phases: preflight(0) failed-drive(1) launched-drive(2) switches(3) report(4)
 *
 *   preflight       sends nothing: checks the CLI, keys, balances, the Manager artifact, builds both DAO configs
 *                   (validated with deploy-dao.mjs --validate-only) and smoke-tests the claim tree builder.
 *   failed-drive    create_dao + admin_checklist (deploy-dao.mjs), manager.open_assurance (threshold 2, short
 *                   deadline), one claim, the pre-deadline guards (7140, 7142, 7823), after the deadline (7819,
 *                   7141), a refund by a third party with an exact balance delta, a second refund (7824),
 *                   release_slug, then get_dao_by_slug -> 7128.
 *   launched-drive  a second DAO: two claimers meet the threshold, launch_when_ready by a non-admin, the escrow
 *                   reaches the Treasury, claims.release returns 0, a claim after launch pays the Treasury.
 *   switches        on the launched DAO, three proposals (voted, queued and executed on one clock): P1 DAO
 *                   recovery on + dao_transfer, P2 transfers_locked and members_only_delegation off, P3 relock
 *                   (both switches back on, DAO recovery off: the DAO ends as it started).
 *                   Settings, owner_of, votes and 7216 / 7221 are checked before and after each.
 *   report          prints assertions and transactions; writes .e2e/membership-report.json.
 *
 * Resumable: addresses, tx hashes, deadlines and observations live in the state file; a phase recorded as done
 * is skipped (--redo forces it), and the sub-steps inside a phase are guarded by state (a drive already opened
 * is never opened twice, a proposal already proposed is never proposed twice). Observations that only hold at one
 * moment (the guards before the deadline, the state right after launch) are taken once and kept in the state file.
 * A crash between a transaction and the state save repeats that transaction on resume; the contract then refuses it
 * (AlreadyClaimed, NothingToRefund ...), so check the state file and the explorer before editing it by hand.
 *
 * Needs a Manager that already runs the membership contracts. By default the Manager of
 * deploys/builder-testnet-manager.json (or --manager-artifact / E2E_MANAGER_ARTIFACT); its artifact is copied to
 * deploys/e2e-membership-<nonce>-testnet-manager.json so the rehearsal DAOs' artifacts land in the gitignored
 * deploys/e2e-* files and no existing deploys/ file is touched.
 *
 * Identities (local `stellar keys` names; env overrides). Only public addresses are read or printed.
 *   E2E_LAUNCH_ADMIN (testnet-admin)  deployer + launch admin of both DAOs; founder; proposer and voter
 *   E2E_CLAIMER_A    (alice)          claimer; calls launch_when_ready (not the launch admin); voter
 *   E2E_CLAIMER_B    (testnet-dev)    claimer; the third party that refunds and releases the slug; queues and executes
 * The three must differ. Never run this next to another script that signs with the same identities (TxBadSeq).
 *
 * Timing (env, seconds): E2E_FAIL_WINDOW_S (300) how long the failed drive stays open; E2E_LIVE_WINDOW_S (600) the
 * launched drive. Governance uses the claims config's 300s delay / period / queue delay: expect about 30 minutes in all.
 * E2E_NON_MEMBER overrides the address used as a delegation target that holds no token.
 *
 * Costs testnet XLM: 1 XLM per claimed token (refunded, or moved to the throwaway DAO's Treasury) plus fees.
 * The tree_uri of both lists is a placeholder (the chain only checks the ipfs:// prefix); the web claim page cannot
 * load a tree for these DAOs.
 *
 * Safety: hard-refuses any network other than `testnet` (see e2e-testnet.mjs). Never run it in CI.
 * Test seams (as in e2e-testnet.mjs): E2E_POLL_MS, E2E_ROOT, E2E_SCRIPTS_DIR.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runQuiet, run } from './lib.mjs';
import {
  ADDRESS_RE, EXPLORER_TX, HEX32_RE, MIN_BALANCE_STROOPS, NETWORK, TESTNET_PASSPHRASE,
  artifactTxs, big, cli, descriptionHash, encodeActions, expectFailure, nativeBalance, nativeSac, normalizeState,
  nowS, readJson, redact, refuseWrongNetwork, replacer, runPhases, runScript, val, view, waitFor, write
} from './e2e-testnet.mjs';

export const MEMBERSHIP_PHASES = ['preflight', 'failed-drive', 'launched-drive', 'switches', 'report'];

/** 1 XLM per token on the native SAC (7 decimals). */
export const PRICE = 10_000_000n;
/** Tokens each claimer's leaf allows. */
export const LEAVES = { CLAIMER_A: 2, CLAIMER_B: 1 };
export const THRESHOLD_CLAIMERS = 2;
/** The Stellar zero account: valid, never holds a token, so it is "not a member". */
export const DEFAULT_NON_MEMBER = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
/** One claim may pay more than the price in fees; the fee tolerance for "paid at least the price" checks (100 XLM). */
const FEE_TOLERANCE = 1_000_000_000n;

/**
 * Contract error codes the rehearsal expects. The unit test reads the Rust enums and fails when a code drifts.
 * Manager 71xx, Token 72xx, ClaimMinter 78xx (contracts/common error blocks).
 */
export const ERR = {
  manager: { SlugNotFound: 7128, DeadlineTooFar: 7137, AssuranceNotMet: 7140, AssuranceFailed: 7141, AssuranceNotFailed: 7142 },
  token: { TransfersLocked: 7216, DelegateNotMember: 7221 },
  claims: { AssuranceFailed: 7819, NotFailed: 7823, NothingToRefund: 7824, InvalidAssurance: 7825 }
};
export const ERR_SOURCES = {
  manager: 'contracts/manager/src/error.rs',
  token: 'contracts/token/src/error.rs',
  claims: 'contracts/minter/src/errors.rs'
};

// ---------------------------------------------------------------------------------------------
// Pure helpers (no network; unit tested in e2e-membership.test.mjs)
// ---------------------------------------------------------------------------------------------

/** The `stellar keys` name per role, from env overrides. */
export function roleNames(env = process.env) {
  return {
    LAUNCH_ADMIN: env.E2E_LAUNCH_ADMIN || 'testnet-admin',
    CLAIMER_A: env.E2E_CLAIMER_A || 'alice',
    CLAIMER_B: env.E2E_CLAIMER_B || 'testnet-dev'
  };
}

/** A drive window in seconds from env: an integer of at least 60 (open + claim + guard simulations need room). */
export function windowSeconds(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 60) throw new Error(`${name} must be an integer of at least 60 seconds, got ${raw}`);
  return n;
}

const KINDS = {
  fail: { slug: 'e2e-fail', name: 'E2E Failed Drive', symbol: 'EFD', founderTokens: 1, blurb: 'a failed assurance drive' },
  live: { slug: 'e2e-live', name: 'E2E Launched Drive', symbol: 'ELD', founderTokens: 4, blurb: 'a launched assurance drive and the token switches' }
};

/**
 * The DAO config for one rehearsal DAO, derived from the claims profile (configs/testnet-builder-claims-dao.json):
 * a ClaimMinter and nothing else, locked and members-only, DAO recovery OFF so a proposal can turn it on. `nonce`
 * must differ per DAO of one deployer; `owner` is both deployer and launch admin (deploy-dao.mjs signs with one key).
 */
export function membershipDaoConfig(template, { kind, nonce, owner, sac, runId }) {
  const spec = KINDS[kind];
  if (!spec) throw new Error(`unknown DAO kind ${kind}`);
  const config = {
    ...template,
    deployer: owner,
    launchAdmin: owner,
    nonce,
    // Slugs are reserved per Manager (permanently once launched), so every run needs fresh ones.
    slug: `${spec.slug}-${nonce}`,
    token: { name: `${spec.name} ${nonce}`, symbol: spec.symbol },
    metadata: {
      ...template.metadata,
      profile: { ...template.metadata.profile, description: `Rehearsal DAO for ${spec.blurb} (run ${runId}). Safe to ignore.` }
    },
    claims: { ...template.claims, paymentAsset: sac },
    founders: [{ address: owner, amount: spec.founderTokens }],
    launch: { launchAuction: false, launchMarketplace: false },
    tokenSettings: { transfersLocked: true, membersOnlyDelegation: true, daoRecovery: false }
  };
  delete config.$comment;
  return config;
}

export const LAUNCH_CONFIG = { launch_auction: false, launch_marketplace: false };

/**
 * The `list` argument of manager.open_assurance. u64, i128 and BytesN fields take ScVal-JSON; plain strings are
 * rejected by the CLI with "unknown variant". Same convention as scripts/deploy-dao.mjs.
 */
export function assuranceListParams({ root, treeUri, price, total, thresholdClaimers, expiresAt, deadline }) {
  if (!HEX32_RE.test(root ?? '')) throw new Error(`root must be 64 lowercase hex chars: ${String(root)}`);
  if (!/^ipfs:\/\/\S+$/.test(treeUri ?? '')) throw new Error(`tree_uri must be an ipfs:// URI: ${String(treeUri)}`);
  for (const [name, value] of Object.entries({ total, thresholdClaimers })) {
    if (!Number.isInteger(value) || value < 0 || value > 4_294_967_295) throw new Error(`${name} must be a u32: ${String(value)}`);
  }
  return {
    root: { bytes: root },
    tree_uri: treeUri,
    price: { i128: String(price) },
    expires_at: { u64: String(expiresAt) },
    total,
    threshold_claimers: thresholdClaimers,
    deadline: { u64: String(deadline) }
  };
}

/** ClaimMinter.claim arguments (plain strings for the scalars, a JSON array of hex strings for the proof). */
export function claimParams({ listId, claimer, leafAmount, mintNow, proof, maxPrice }) {
  if (!Array.isArray(proof) || !proof.every((p) => HEX32_RE.test(p))) throw new Error('proof must be an array of 64-char lowercase hex nodes');
  if (!ADDRESS_RE.test(claimer ?? '')) throw new Error(`claimer is not a valid address: ${String(claimer)}`);
  return { list_id: String(listId), claimer, leaf_amount: String(leafAmount), mint_now: String(mintNow), proof, max_price: String(maxPrice) };
}

/** The spec file apps/web's tree builder reads (scripts/e2e-membership-tree.ts). */
export function treeSpec({ network, token, list, entries }) {
  return { network, token, list, entries: entries.map(({ address, amount }) => ({ address, amount: String(amount) })) };
}

/** The tree builder prints its JSON summary as the last stdout line; vite-node may print other lines first. */
export function parseTreeOutput(stdout) {
  const line = String(stdout ?? '').trim().split('\n').filter(Boolean).pop() ?? '';
  let parsed;
  try { parsed = JSON.parse(line); } catch { throw new Error(`tree builder printed no JSON summary: ${line.slice(0, 200)}`); }
  if (!HEX32_RE.test(parsed?.root ?? '') || typeof parsed.claims !== 'object' || parsed.claims === null) {
    throw new Error(`tree builder summary is malformed: ${line.slice(0, 200)}`);
  }
  return { root: parsed.root, total: String(parsed.total), claims: parsed.claims };
}

/** A unit enum as the CLI prints it: "Failed", ["Failed"] or {"Failed": null}. (Not the numeric Governor states.) */
export function enumName(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return enumName(value[0]);
  if (value && typeof value === 'object') return Object.keys(value)[0];
  return undefined;
}

export const SWITCH_STEPS = ['P1', 'P2', 'P3'];
const SWITCH_TEXT = {
  P1: 'turn on DAO recovery and recover one member token',
  P2: 'unlock transfers and open delegation',
  P3: 'relock transfers and delegation, turn DAO recovery off'
};

export const switchDescription = (runId, step) => `Membership switches ${runId} ${step}: ${SWITCH_TEXT[step]}`;

/**
 * The governance actions of one switch proposal, all on the Token (the Treasury is its admin after launch).
 * P1 must order set_dao_recovery before dao_transfer (RecoveryOff otherwise).
 */
export function switchActions(step, { token, recoverTokenId, recoverTo }) {
  const act = (fn, ...args) => ({ target: token, fn, args });
  switch (step) {
    case 'P1':
      return [act('set_dao_recovery', val.bool(true)), act('dao_transfer', val.u32(recoverTokenId), val.address(recoverTo))];
    case 'P2':
      return [act('set_transfers_locked', val.bool(false)), act('set_members_only_delegation', val.bool(false))];
    case 'P3':
      return [act('set_transfers_locked', val.bool(true)), act('set_members_only_delegation', val.bool(true)), act('set_dao_recovery', val.bool(false))];
    default:
      throw new Error(`unknown switch step ${step}`);
  }
}

/** The switch values `token.settings` must show after each step. */
export const SWITCH_EXPECTED = {
  start: { transfers_locked: true, members_only_delegation: true, dao_recovery: false },
  P1: { transfers_locked: true, members_only_delegation: true, dao_recovery: true },
  P2: { transfers_locked: false, members_only_delegation: false, dao_recovery: true },
  P3: { transfers_locked: true, members_only_delegation: true, dao_recovery: false }
};

export const sameSettings = (got, want) => Object.entries(want).every(([k, v]) => got?.[k] === v);

// ---------------------------------------------------------------------------------------------
// Chain access shorthands. Every role is explicit: the state's identities are this script's roles.
// ---------------------------------------------------------------------------------------------
const read = (ctx, id, method, params = {}) => view(ctx, id, method, params);
const simulate = (ctx, id, method, params, role) => expectFailure(ctx, id, method, params, role);
const num = (v) => Number(v);

/** A simulation that must fail with `code`; the recorded outcome keeps the unexpected-success case visible. */
function expectCode(ctx, id, method, params, role) {
  const r = simulate(ctx, id, method, params, role);
  return { code: r.unexpectedSuccess ? 'unexpected-success' : r.code, detail: r.unexpectedSuccess ? '' : r.text.slice(0, 200) };
}

/** Run `fn` once and keep its (JSON-safe) result in `bag[key]`, so a re-run reports without repeating the step. */
async function observe(ctx, bag, key, fn) {
  if (bag[key] === undefined) {
    bag[key] = await fn();
    ctx.save();
  }
  return bag[key];
}

const codeIs = (got, want) => got === want;
const codeDetail = (got) => (typeof got === 'number' ? `code ${got}` : String(got));

// ---------------------------------------------------------------------------------------------
// Preflight
// ---------------------------------------------------------------------------------------------
const TREE_SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'e2e-membership-tree.ts');

function buildTree(ctx, key, token, listId) {
  const s = ctx.state;
  const entries = ['CLAIMER_A', 'CLAIMER_B'].map((role) => ({ address: ctx.id(role), amount: LEAVES[role] }));
  const specRel = join('.e2e', `membership-${s.nonce}-${key}-spec.json`);
  const treeRel = join('.e2e', `membership-${s.nonce}-${key}-tree.json`);
  mkdirSync(join(ctx.root, '.e2e'), { recursive: true });
  writeFileSync(join(ctx.root, specRel), JSON.stringify(treeSpec({ network: TESTNET_PASSPHRASE, token, list: listId, entries })));
  const result = runQuiet('pnpm', ['exec', 'vite-node', '--config', 'vitest.config.ts', TREE_SCRIPT, join(ctx.root, specRel), join(ctx.root, treeRel)], {
    cwd: join(ctx.root, 'apps/web'), timeout: 180_000
  });
  if (!result.ok) throw new Error(`claim tree build failed: ${redact(result.stderr || result.stdout).slice(0, 600)}`);
  return { ...parseTreeOutput(result.stdout), path: treeRel };
}

function resolveRoles(ctx) {
  ctx.state.identities = ctx.state.identities ?? {};
  for (const [role, name] of Object.entries(roleNames())) {
    const result = cli(['keys', 'address', name], { timeout: 30_000 });
    const address = result.stdout.trim();
    const ok = result.ok && ADDRESS_RE.test(address);
    ctx.check(`identity ${role}=${name} resolves to a public address`, ok, ok ? address : redact(result.stderr).slice(0, 200));
    if (ok) ctx.state.identities[role] = { name, address };
  }
  ctx.save();
}

function prepareManager(ctx) {
  const s = ctx.state;
  const managerTemplate = readJson(join(ctx.root, 'configs/testnet-manager.json'));
  refuseWrongNetwork(managerTemplate);
  const sourceRel = ctx.options.managerArtifact || process.env.E2E_MANAGER_ARTIFACT || `deploys/${managerTemplate.label}-${NETWORK}-manager.json`;
  const sourcePath = resolve(ctx.root, sourceRel);
  if (!ctx.check('Manager artifact present', existsSync(sourcePath), sourceRel)) return false;
  const artifact = readJson(sourcePath);
  const valid = artifact.network === NETWORK && ADDRESS_RE.test(artifact.manager ?? '') && !!artifact.implementations && !!artifact.versions;
  if (!ctx.check('Manager artifact is a testnet Manager with implementations and versions', valid, `${artifact.network} ${artifact.manager}`)) return false;
  s.manager = artifact.manager;
  s.managerSource = sourceRel;
  // deploy-dao.mjs reads deploys/<label>-testnet-manager.json: a relabelled copy keeps the DAO artifacts in deploys/e2e-*.
  const copyRel = join('deploys', `${s.label}-${NETWORK}-manager.json`);
  writeFileSync(join(ctx.root, copyRel), `${JSON.stringify({ ...artifact, label: s.label, rehearsalOf: sourceRel }, null, 2)}\n`);
  s.networkConfigPath = join('.e2e', `membership-network-${s.nonce}.json`);
  mkdirSync(join(ctx.root, '.e2e'), { recursive: true });
  writeFileSync(join(ctx.root, s.networkConfigPath), `${JSON.stringify({
    ...managerTemplate, network: NETWORK, label: s.label, adminAddress: artifact.config?.adminAddress ?? managerTemplate.adminAddress,
    rpcUrl: managerTemplate.rpcUrl, networkPassphrase: TESTNET_PASSPHRASE
  }, null, 2)}\n`);
  ctx.save();
  return true;
}

function prepareConfigs(ctx) {
  const s = ctx.state;
  const template = readJson(join(ctx.root, 'configs/testnet-builder-claims-dao.json'));
  const sac = nativeSac(ctx);
  s.configs = {};
  s.daoConfigs = {};
  s.daos = s.daos ?? {};
  for (const [kind, nonce] of [['fail', s.nonce], ['live', s.nonce + 1]]) {
    const config = membershipDaoConfig(template, { kind, nonce, owner: ctx.id('LAUNCH_ADMIN'), sac, runId: s.runId });
    s.configs[kind] = join('.e2e', `membership-${kind}-dao-${nonce}.json`);
    s.daoConfigs[kind] = config;
    writeFileSync(join(ctx.root, s.configs[kind]), `${JSON.stringify(config, null, 2)}\n`);
    s.daos[kind] = s.daos[kind] ?? { nonce, steps: {} };
  }
  ctx.save();
}

async function preflight(ctx) {
  const s = ctx.state;
  const version = cli(['--version'], { timeout: 30_000 });
  if (!ctx.check('stellar CLI present', version.ok, version.stdout.split('\n')[0])) return;
  const pnpm = runQuiet('pnpm', ['--version'], { timeout: 30_000 });
  ctx.check('pnpm present (the claim tree is built by the web app code through vite-node)', pnpm.ok, pnpm.stdout.trim());
  const nets = cli(['network', 'ls', '--long'], { timeout: 30_000 });
  ctx.check('`testnet` network alias uses the testnet passphrase', nets.ok && (nets.stdout + nets.stderr).includes(TESTNET_PASSPHRASE),
    nets.ok ? '' : redact(nets.stderr).slice(0, 200));

  resolveRoles(ctx);
  if (Object.keys(s.identities).length < 3) return;
  const addresses = Object.values(s.identities).map((i) => i.address);
  ctx.check('the three roles are three different accounts', new Set(addresses).size === 3,
    'launch_when_ready must come from a non-admin and the refund from a third party');

  if (!prepareManager(ctx)) return;
  const sac = nativeSac(ctx);
  ctx.check('native XLM SAC resolved offline', true, sac);
  prepareConfigs(ctx);

  for (const role of Object.keys(roleNames())) {
    try {
      const balance = nativeBalance(ctx, ctx.id(role));
      ctx.check(`${role} balance > 100 XLM`, balance > MIN_BALANCE_STROOPS, `${Number(balance) / 1e7} XLM`);
    } catch (e) {
      ctx.check(`${role} balance readable (fund the key with friendbot)`, false, e.message);
    }
  }

  try {
    const admin = read(ctx, s.manager, 'get_admin');
    ctx.check('manager.get_admin readable', ADDRESS_RE.test(String(admin)), String(admin));
    const current = read(ctx, s.manager, 'current_implementations');
    ctx.check('manager.current_implementations.claims is set (DAOs get a ClaimMinter)', typeof current?.claims === 'string' && HEX32_RE.test(current.claims), String(current?.claims));
  } catch (e) {
    ctx.check('Manager readable on testnet', false, e.message);
  }

  for (const kind of Object.keys(s.configs)) {
    try {
      run('node', [join(ctx.scriptsDir, 'deploy-dao.mjs'), '--validate-only', s.configs[kind]], { cwd: ctx.root, stdio: 'pipe' });
      ctx.check(`deploy-dao.mjs --validate-only on the ${kind} DAO config`, true, s.configs[kind]);
    } catch (e) {
      ctx.check(`deploy-dao.mjs --validate-only on the ${kind} DAO config`, false, redact(e.stderr || e.message).slice(0, 400));
    }
  }

  try {
    const tree = buildTree(ctx, 'smoke', sac, 0);
    const claims = Object.keys(tree.claims);
    ctx.check('claim tree builds and verifies through apps/web/src/lib/minter/tree.ts (vite-node)',
      claims.length === 2 && claims.every((a) => tree.claims[a].proof.length >= 1) && tree.total === String(LEAVES.CLAIMER_A + LEAVES.CLAIMER_B), tree.root);
  } catch (e) {
    ctx.check('claim tree builds and verifies through apps/web/src/lib/minter/tree.ts (vite-node)', false, e.message);
  }
}

// ---------------------------------------------------------------------------------------------
// DAO deployment (create_dao + admin_checklist) and the drive
// ---------------------------------------------------------------------------------------------
const daoArtifactPath = (ctx, kind) => join(ctx.root, 'deploys', `${ctx.state.label}-${NETWORK}-dao-${ctx.state.daos[kind].nonce}.json`);

function loadDao(ctx, kind) {
  const artifact = readJson(daoArtifactPath(ctx, kind));
  ctx.state.daos[kind].addr = artifact.addresses;
  for (const [k, h] of Object.entries(artifactTxs(artifact))) ctx.tx(`${kind}.dao.${k}`, h);
  ctx.save();
  return artifact.addresses;
}

/** Deploy one rehearsal DAO into Setup (create_dao + admin_checklist) and assert what Setup should look like. */
async function deployDao(ctx, kind) {
  const s = ctx.state;
  if (!s.configs?.[kind] || !s.manager) throw new Error('no DAO config or Manager recorded: run preflight first');
  const dao = s.daos[kind];
  const config = s.daoConfigs[kind];
  if (!dao.steps.created) {
    runScript(ctx, 'deploy-dao.mjs', ['create_dao', s.configs[kind], s.networkConfigPath], 'LAUNCH_ADMIN');
    loadDao(ctx, kind);
    dao.steps.created = true;
    ctx.save();
  }
  if (!dao.steps.setup) {
    runScript(ctx, 'deploy-dao.mjs', ['admin_checklist', s.configs[kind], s.networkConfigPath], 'LAUNCH_ADMIN');
    loadDao(ctx, kind);
    dao.steps.setup = true;
    ctx.save();
  }
  const a = dao.addr;
  const tag = `${kind} DAO`;
  const founders = BigInt(config.founders.reduce((n, f) => n + f.amount, 0));
  // Observed once, right after Setup: the launched DAO's state moves on (live, switches) in later phases.
  const setup = await observe(ctx, dao.steps, 'setupState', () => ({
    settings: read(ctx, a.token, 'settings'),
    registry: read(ctx, a.token, 'modules'),
    pending: read(ctx, s.manager, 'get_pending_dao', { token_address: a.token }),
    live: read(ctx, a.token, 'is_live'),
    supply: String(big(read(ctx, a.token, 'total_supply'))),
    properties: num(read(ctx, a.metadata, 'properties_count'))
  }));
  const core = ['token', 'treasury', 'governor', 'metadata', 'claims'];
  ctx.check(`${tag}: core + ClaimMinter addresses recorded, no auction or marketplace`,
    core.every((m) => ADDRESS_RE.test(a?.[m] ?? '')) && !a.auction && !a.marketplace, core.map((m) => `${m}=${a?.[m]}`).join(' '));
  ctx.check(`${tag}: token switches start locked + members-only, DAO recovery off`, sameSettings(setup.settings, SWITCH_EXPECTED.start), JSON.stringify(setup.settings));
  ctx.check(`${tag}: token.modules lists the ClaimMinter`, Array.isArray(setup.registry) && setup.registry.some((m) => m.address === a.claims), JSON.stringify(setup.registry));
  ctx.check(`${tag}: manager.get_pending_dao has the launch admin, the requested slug and the native SAC claims asset`,
    !!setup.pending && setup.pending.launch_admin === ctx.id('LAUNCH_ADMIN') && setup.pending.slug === config.slug && setup.pending.claims_payment_asset === s.nativeSac, config.slug);
  ctx.check(`${tag}: token.is_live == false after Setup`, setup.live === false);
  ctx.check(`${tag}: token.total_supply == ${founders} (the founder mint)`, big(setup.supply) === founders, setup.supply);
  ctx.check(`${tag}: metadata artwork present (a Setup list needs it)`, setup.properties > 0, String(setup.properties));
  return dao;
}

/**
 * Open the DAO's assurance drive (manager.open_assurance) and assert the freeze it applies. With `negatives`, first
 * simulate the two refusals: a deadline beyond the 90-day window (7137) and a zero threshold (7825).
 */
async function openDrive(ctx, kind, { windowS, negatives }) {
  const s = ctx.state;
  const dao = s.daos[kind];
  const a = dao.addr;
  s.drives = s.drives ?? {};
  const drive = (s.drives[kind] ??= { steps: {} });
  const tag = `${kind} drive`;

  if (!drive.tree) {
    const planned = num(read(ctx, a.claims, 'next_list_id'));
    const built = buildTree(ctx, kind, a.token, planned);
    drive.plannedList = planned;
    drive.tree = { path: built.path, root: built.root, total: Number(built.total) };
    ctx.save();
  }
  ctx.check(`${tag}: claim tree built by the web app code, root recorded`, HEX32_RE.test(drive.tree.root) && drive.tree.total === 3, `${drive.tree.root} total ${drive.tree.total}`);

  const listArg = (over) => assuranceListParams({
    root: drive.tree.root, treeUri: `ipfs://bafkreie2e${s.nonce}${kind}/tree.json`, price: PRICE, total: drive.tree.total,
    thresholdClaimers: THRESHOLD_CLAIMERS, expiresAt: nowS() + 7 * 86_400, deadline: nowS() + windowS, ...over
  });
  const openArgs = (over) => ({ token_address: a.token, list: listArg(over), launch_config: LAUNCH_CONFIG });

  if (negatives) {
    const neg = await observe(ctx, drive.steps, 'negatives', () => {
      const now = nowS();
      return {
        deadlineTooFar: expectCode(ctx, s.manager, 'open_assurance', openArgs({ deadline: now + 91 * 86_400, expiresAt: now + 92 * 86_400 }), 'LAUNCH_ADMIN'),
        zeroThreshold: expectCode(ctx, s.manager, 'open_assurance', openArgs({ thresholdClaimers: 0 }), 'LAUNCH_ADMIN')
      };
    });
    ctx.check(`${tag}: open_assurance with a deadline over 90 days fails with DeadlineTooFar (${ERR.manager.DeadlineTooFar})`,
      codeIs(neg.deadlineTooFar.code, ERR.manager.DeadlineTooFar), codeDetail(neg.deadlineTooFar.code));
    ctx.check(`${tag}: open_assurance with threshold 0 fails with InvalidAssurance (${ERR.claims.InvalidAssurance})`,
      codeIs(neg.zeroThreshold.code, ERR.claims.InvalidAssurance), codeDetail(neg.zeroThreshold.code));
  }

  if (drive.deadline === undefined) {
    const deadline = nowS() + windowS;
    const r = write(ctx, s.manager, 'open_assurance', openArgs({ deadline }), 'LAUNCH_ADMIN', `${kind}.open_assurance`);
    drive.deadline = deadline;
    drive.listId = num(r.value);
    drive.openTx = r.txHash;
    ctx.save();
  }
  ctx.check(`${tag}: open_assurance returned the planned list id`, drive.listId === drive.plannedList, `list ${drive.listId}`);

  // Observed once, right after open_assurance: the freeze and the reserved slug end at launch or release.
  const opened = await observe(ctx, drive.steps, 'opened', () => ({
    assurance: read(ctx, s.manager, 'get_assurance', { token_address: a.token }),
    list: read(ctx, a.claims, 'get_list', { list_id: String(drive.listId) }),
    assuranceList: read(ctx, a.claims, 'assurance_list'),
    state: stateOf(ctx, kind),
    allowance: num(read(ctx, a.token, 'mint_allowance', { module: a.claims })),
    bySlug: read(ctx, s.manager, 'get_dao_by_slug', { slug: s.daoConfigs[kind].slug }),
    admin: read(ctx, a.token, 'admin'),
    live: read(ctx, a.token, 'is_live')
  }));
  const rec = opened.assurance;
  ctx.check(`${tag}: manager.get_assurance records the ClaimMinter, list, deadline and launch config`,
    !!rec && rec.claim_minter === a.claims && num(rec.list_id) === drive.listId && num(rec.deadline) === drive.deadline &&
      rec.launch_config?.launch_auction === false && rec.launch_config?.launch_marketplace === false, JSON.stringify(rec));
  const list = opened.list;
  ctx.check(`${tag}: list terms (price 1 XLM, total 3, threshold ${THRESHOLD_CLAIMERS}, deadline, root)`,
    !!list && big(list.price) === PRICE && num(list.total) === 3 && num(list.threshold_claimers) === THRESHOLD_CLAIMERS &&
      num(list.deadline) === drive.deadline && String(list.root).toLowerCase() === drive.tree.root, JSON.stringify(list));
  ctx.check(`${tag}: claims.assurance_list == ${drive.listId}, assurance_state Open`, opened.assuranceList !== null && num(opened.assuranceList) === drive.listId && opened.state === 'Open', `state ${opened.state}`);
  ctx.check(`${tag}: open_assurance granted the ClaimMinter the list total as mint allowance`, opened.allowance === drive.tree.total, String(opened.allowance));
  ctx.check(`${tag}: the slug is reserved (get_dao_by_slug == token)`, opened.bySlug === a.token, s.daoConfigs[kind].slug);
  ctx.check(`${tag}: frozen, not live (token admin == Treasury, is_live == false)`, opened.admin === a.treasury && opened.live === false);
  return drive;
}

function claimArgs(ctx, kind, role, mintNow) {
  const drive = ctx.state.drives[kind];
  const me = ctx.id(role);
  const entry = readJson(join(ctx.root, drive.tree.path)).claims[me];
  if (!entry) throw new Error(`${role} (${me}) is not in the ${kind} claim tree`);
  return claimParams({ listId: drive.listId, claimer: me, leafAmount: entry.amount, mintNow, proof: entry.proof, maxPrice: PRICE });
}

const listOf = (ctx, kind) => read(ctx, ctx.state.daos[kind].addr.claims, 'get_list', { list_id: String(ctx.state.drives[kind].listId) });
const recordOf = (ctx, kind, role) => read(ctx, ctx.state.daos[kind].addr.claims, 'get_claim', { list_id: String(ctx.state.drives[kind].listId), claimer: ctx.id(role) });
const stateOf = (ctx, kind) => enumName(read(ctx, ctx.state.daos[kind].addr.claims, 'assurance_state', { list_id: String(ctx.state.drives[kind].listId) }));

/** A claim transaction; records the token ids, the payer's balance move and the tx. */
function claimTx(ctx, kind, role, mintNow, txName) {
  const s = ctx.state;
  const a = s.daos[kind].addr;
  const me = ctx.id(role);
  const before = nativeBalance(ctx, me);
  const r = write(ctx, a.claims, 'claim', claimArgs(ctx, kind, role, mintNow), role, txName);
  const after = nativeBalance(ctx, me);
  return { tx: r.txHash, ids: Array.isArray(r.value) ? r.value.map(Number) : [], spent: String(before - after), mintNow };
}

// ---------------------------------------------------------------------------------------------
// Phase 1: failed drive
// ---------------------------------------------------------------------------------------------
async function failedDrive(ctx) {
  const s = ctx.state;
  const kind = 'fail';
  const dao = await deployDao(ctx, kind);
  const a = dao.addr;
  const drive = await openDrive(ctx, kind, { windowS: windowSeconds(process.env, 'E2E_FAIL_WINDOW_S', 300), negatives: true });
  const A = ctx.id('CLAIMER_A');
  const B = ctx.id('CLAIMER_B');
  const list = String(drive.listId);
  const cost = PRICE * BigInt(LEAVES.CLAIMER_A);
  const tag = 'fail drive';

  const claim = await observe(ctx, drive.steps, 'claimA', () => claimTx(ctx, kind, 'CLAIMER_A', LEAVES.CLAIMER_A, 'fail.claimA'));
  ctx.check(`${tag}: CLAIMER_A claimed 2 tokens (ids ${claim.ids.join(', ')})`, claim.ids.length === 2, `tx ${claim.tx}`);
  const spent = big(claim.spent);
  ctx.check(`${tag}: CLAIMER_A paid at least 2 XLM into escrow (fees tolerated)`, spent >= cost && spent < cost + FEE_TOLERANCE, `${spent} stroops`);
  const afterClaim = await observe(ctx, drive.steps, 'afterClaim', () => {
    const l = listOf(ctx, kind);
    return { escrow: String(big(l.escrow)), claimers: num(l.claimers), minted: num(l.minted), record: String(big(recordOf(ctx, kind, 'CLAIMER_A').escrowed)), balance: num(read(ctx, a.token, 'balance', { account: A })) };
  });
  ctx.check(`${tag}: list escrow == 2 XLM and the claimer's record shows it`, big(afterClaim.escrow) === cost && big(afterClaim.record) === cost, `escrow ${afterClaim.escrow}`);
  ctx.check(`${tag}: one claimer so far (threshold ${THRESHOLD_CLAIMERS} not met), 2 minted, CLAIMER_A holds 2 tokens`,
    afterClaim.claimers === 1 && afterClaim.minted === 2 && afterClaim.balance === 2);

  // Guards before the deadline. They can only be observed in the window; a resumed run that is past it says so.
  const guards = await observe(ctx, drive.steps, 'preGuards', () => {
    if (nowS() + 20 >= drive.deadline) return { skipped: true };
    return {
      state: stateOf(ctx, kind),
      launchWhenReady: expectCode(ctx, s.manager, 'launch_when_ready', { token_address: a.token }, 'CLAIMER_B').code,
      releaseSlug: expectCode(ctx, s.manager, 'release_slug', { token_address: a.token }, 'CLAIMER_B').code,
      refund: expectCode(ctx, a.claims, 'refund', { list_id: list, claimer: A }, 'CLAIMER_B').code
    };
  });
  if (guards.skipped) {
    ctx.skip(`${tag}: guards before the deadline (7140, 7142, 7823)`, 'the deadline was too close or past when this step ran (resumed late); rerun with a fresh state or a longer E2E_FAIL_WINDOW_S');
  } else {
    ctx.check(`${tag}: before the deadline assurance_state is Open`, guards.state === 'Open', String(guards.state));
    ctx.check(`${tag}: launch_when_ready fails with AssuranceNotMet (${ERR.manager.AssuranceNotMet})`, codeIs(guards.launchWhenReady, ERR.manager.AssuranceNotMet), codeDetail(guards.launchWhenReady));
    ctx.check(`${tag}: release_slug fails with AssuranceNotFailed (${ERR.manager.AssuranceNotFailed})`, codeIs(guards.releaseSlug, ERR.manager.AssuranceNotFailed), codeDetail(guards.releaseSlug));
    ctx.check(`${tag}: refund fails with NotFailed (${ERR.claims.NotFailed})`, codeIs(guards.refund, ERR.claims.NotFailed), codeDetail(guards.refund));
  }

  await waitFor('drive deadline (assurance_state -> Failed)', async () => {
    const left = drive.deadline + 3 - nowS();
    if (left > 0) return { done: false, note: `${left}s until the deadline` };
    const st = stateOf(ctx, kind);
    return { done: st === 'Failed', note: `assurance_state=${st}` };
  }, { timeoutS: Math.max(0, drive.deadline - nowS()) + 600 });

  const after = await observe(ctx, drive.steps, 'afterDeadline', () => ({
    state: stateOf(ctx, kind),
    claim: expectCode(ctx, a.claims, 'claim', claimArgs(ctx, kind, 'CLAIMER_B', LEAVES.CLAIMER_B), 'CLAIMER_B').code,
    launchWhenReady: expectCode(ctx, s.manager, 'launch_when_ready', { token_address: a.token }, 'CLAIMER_B').code,
    live: read(ctx, a.token, 'is_live')
  }));
  ctx.check(`${tag}: after the deadline assurance_state is Failed and the token is not live`, after.state === 'Failed' && after.live === false, String(after.state));
  ctx.check(`${tag}: a claim now fails with AssuranceFailed (${ERR.claims.AssuranceFailed})`, codeIs(after.claim, ERR.claims.AssuranceFailed), codeDetail(after.claim));
  ctx.check(`${tag}: launch_when_ready fails with AssuranceFailed (${ERR.manager.AssuranceFailed})`, codeIs(after.launchWhenReady, ERR.manager.AssuranceFailed), codeDetail(after.launchWhenReady));

  // The refund comes from a third party: CLAIMER_A signs nothing between the two balance reads, so the delta is exact.
  const refund = await observe(ctx, drive.steps, 'refund', () => {
    const before = nativeBalance(ctx, A);
    const r = write(ctx, a.claims, 'refund', { list_id: list, claimer: A }, 'CLAIMER_B', 'fail.refund');
    const afterBal = nativeBalance(ctx, A);
    return { tx: r.txHash, returned: r.value === undefined ? null : String(big(r.value)), delta: String(afterBal - before) };
  });
  ctx.check(`${tag}: refund (by CLAIMER_B, a third party) returned 2 XLM`, refund.returned !== null && big(refund.returned) === cost, String(refund.returned));
  ctx.check(`${tag}: CLAIMER_A's balance rose by exactly the refund`, big(refund.delta) === cost, `delta ${refund.delta}`);
  const post = await observe(ctx, drive.steps, 'afterRefund', () => ({
    second: expectCode(ctx, a.claims, 'refund', { list_id: list, claimer: A }, 'CLAIMER_B').code,
    escrow: String(big(listOf(ctx, kind).escrow)),
    record: String(big(recordOf(ctx, kind, 'CLAIMER_A').escrowed)),
    live: read(ctx, a.token, 'is_live'),
    balance: num(read(ctx, a.token, 'balance', { account: A }))
  }));
  ctx.check(`${tag}: a second refund fails with NothingToRefund (${ERR.claims.NothingToRefund})`, codeIs(post.second, ERR.claims.NothingToRefund), codeDetail(post.second));
  ctx.check(`${tag}: list escrow and the claimer's record are 0; the token stays not live; the claimer keeps the 2 tokens`,
    big(post.escrow) === 0n && big(post.record) === 0n && post.live === false && post.balance === 2);

  const slug = s.daoConfigs[kind].slug;
  const released = await observe(ctx, drive.steps, 'slugReleased', () => {
    const r = write(ctx, s.manager, 'release_slug', { token_address: a.token }, 'CLAIMER_B', 'fail.release_slug');
    return {
      tx: r.txHash,
      lookup: expectCode(ctx, s.manager, 'get_dao_by_slug', { slug }, 'CLAIMER_B').code,
      again: expectCode(ctx, s.manager, 'release_slug', { token_address: a.token }, 'CLAIMER_B').code,
      slugOf: read(ctx, s.manager, 'get_slug', { token_address: a.token })
    };
  });
  ctx.check(`${tag}: release_slug (by CLAIMER_B) freed the slug: get_dao_by_slug fails with SlugNotFound (${ERR.manager.SlugNotFound})`, codeIs(released.lookup, ERR.manager.SlugNotFound), codeDetail(released.lookup));
  ctx.check(`${tag}: a second release_slug fails with SlugNotFound (${ERR.manager.SlugNotFound})`, codeIs(released.again, ERR.manager.SlugNotFound), codeDetail(released.again));
  ctx.check(`${tag}: manager.get_slug(token) is null`, released.slugOf === null, JSON.stringify(released.slugOf));
}

// ---------------------------------------------------------------------------------------------
// Phase 2: launched drive
// ---------------------------------------------------------------------------------------------
async function launchedDrive(ctx) {
  const s = ctx.state;
  const kind = 'live';
  const dao = await deployDao(ctx, kind);
  const a = dao.addr;
  const drive = await openDrive(ctx, kind, { windowS: windowSeconds(process.env, 'E2E_LIVE_WINDOW_S', 600), negatives: false });
  const tag = 'live drive';
  const cost = PRICE * 2n;
  ctx.check(`${tag}: launch_when_ready will be called by CLAIMER_A, who is not the launch admin`, ctx.id('CLAIMER_A') !== ctx.id('LAUNCH_ADMIN'));

  const claimA = await observe(ctx, drive.steps, 'claimA', () => claimTx(ctx, kind, 'CLAIMER_A', 1, 'live.claimA'));
  const claimB = await observe(ctx, drive.steps, 'claimB', () => claimTx(ctx, kind, 'CLAIMER_B', 1, 'live.claimB'));
  ctx.check(`${tag}: CLAIMER_A and CLAIMER_B claimed one token each (ids ${claimA.ids.join(',')} and ${claimB.ids.join(',')})`, claimA.ids.length === 1 && claimB.ids.length === 1);
  const met = await observe(ctx, drive.steps, 'met', () => {
    const l = listOf(ctx, kind);
    return { state: stateOf(ctx, kind), escrow: String(big(l.escrow)), claimers: num(l.claimers), minted: num(l.minted) };
  });
  ctx.check(`${tag}: two claimers meet the threshold (assurance_state Met)`, met.state === 'Met' && met.claimers === 2 && met.minted === 2, JSON.stringify(met));
  ctx.check(`${tag}: list escrow == 2 XLM before launch`, big(met.escrow) === cost, met.escrow);

  const launch = await observe(ctx, drive.steps, 'launch', () => {
    const treasuryBefore = nativeBalance(ctx, a.treasury);
    const r = write(ctx, s.manager, 'launch_when_ready', { token_address: a.token }, 'CLAIMER_A', 'live.launch_when_ready');
    const treasuryAfter = nativeBalance(ctx, a.treasury);
    return { tx: r.txHash, treasuryBefore: String(treasuryBefore), treasuryAfter: String(treasuryAfter) };
  });
  ctx.check(`${tag}: launch_when_ready succeeded from a non-admin (CLAIMER_A)`, !!launch.tx, launch.tx);
  const launched = await observe(ctx, drive.steps, 'launched', () => ({
    live: read(ctx, a.token, 'is_live'),
    admin: read(ctx, a.token, 'admin'),
    escrow: String(big(listOf(ctx, kind).escrow)),
    release: read(ctx, a.claims, 'release', { list_id: String(drive.listId) }),
    refund: expectCode(ctx, a.claims, 'refund', { list_id: String(drive.listId), claimer: ctx.id('CLAIMER_A') }, 'CLAIMER_B').code,
    bySlug: read(ctx, s.manager, 'get_dao_by_slug', { slug: s.daoConfigs[kind].slug }),
    pending: read(ctx, s.manager, 'get_pending_dao', { token_address: a.token })
  }));
  ctx.check(`${tag}: token.is_live == true and token.admin == Treasury`, launched.live === true && launched.admin === a.treasury);
  ctx.check(`${tag}: the whole escrow (2 XLM) reached the Treasury`, big(launch.treasuryAfter) - big(launch.treasuryBefore) === cost, `delta ${big(launch.treasuryAfter) - big(launch.treasuryBefore)}`);
  ctx.check(`${tag}: list escrow is 0 after launch`, big(launched.escrow) === 0n);
  ctx.check(`${tag}: claims.release returns 0 (launch already released it)`, launched.release !== undefined && big(launched.release) === 0n, String(launched.release));
  ctx.check(`${tag}: refund now fails with NotFailed (${ERR.claims.NotFailed})`, codeIs(launched.refund, ERR.claims.NotFailed), codeDetail(launched.refund));
  ctx.check(`${tag}: get_dao_by_slug == token and get_pending_dao is gone`, launched.bySlug === a.token && launched.pending === null);

  const post = await observe(ctx, drive.steps, 'postLaunchClaim', () => {
    const treasuryBefore = nativeBalance(ctx, a.treasury);
    const claim = claimTx(ctx, kind, 'CLAIMER_A', 1, 'live.claimA_postlaunch');
    const treasuryAfter = nativeBalance(ctx, a.treasury);
    const l = listOf(ctx, kind);
    return { claim, treasuryDelta: String(treasuryAfter - treasuryBefore), escrow: String(big(l.escrow)), minted: num(l.minted), claimers: num(l.claimers), recordA: recordOf(ctx, kind, 'CLAIMER_A') };
  });
  ctx.check(`${tag}: a claim after launch paid the Treasury directly (+1 XLM exactly)`, big(post.treasuryDelta) === PRICE, `delta ${post.treasuryDelta}`);
  // release() empties the list's escrow, not the claimers' records: A's record keeps the 1 XLM paid before launch.
  ctx.check(`${tag}: the list holds no new escrow; 3 minted by 2 claimers; CLAIMER_A claimed 2 of 2, escrowed only the 1 XLM paid before launch`,
    big(post.escrow) === 0n && post.minted === 3 && post.claimers === 2 && num(post.recordA.claimed) === 2 && big(post.recordA.escrowed) === PRICE, JSON.stringify(post.recordA));
  drive.tokenIds = { CLAIMER_A: [...claimA.ids, ...post.claim.ids], CLAIMER_B: claimB.ids };
  ctx.save();
}

// ---------------------------------------------------------------------------------------------
// Phase 3: switches by proposal
// ---------------------------------------------------------------------------------------------
const STAGES = ['Pending', 'Active', 'Succeeded', 'Queued', 'Executed'];
const atLeast = (st, stage) => STAGES.indexOf(st) >= STAGES.indexOf(stage);

async function switches(ctx) {
  const s = ctx.state;
  const kind = 'live';
  const dao = s.daos?.[kind];
  const drive = s.drives?.[kind];
  if (!dao?.addr || !drive?.steps?.postLaunchClaim || !drive.tokenIds) throw new Error('the launched DAO is not ready: run launched-drive first');
  const a = dao.addr;
  const admin = ctx.id('LAUNCH_ADMIN');
  const A = ctx.id('CLAIMER_A');
  const B = ctx.id('CLAIMER_B');
  const nonMember = process.env.E2E_NON_MEMBER || DEFAULT_NON_MEMBER;
  const sw = (s.switches ??= { steps: {}, P: {} });
  const [recoverId, keepId] = drive.tokenIds.CLAIMER_A;
  const votes = (who) => num(read(ctx, a.token, 'get_votes', { account: who }));
  const settings = () => read(ctx, a.token, 'settings');
  const owner = (id) => read(ctx, a.token, 'owner_of', { token_id: String(id) });
  const tag = 'live DAO';

  // Before: locked, members-only, recovery off.
  const before = await observe(ctx, sw.steps, 'before', () => ({
    settings: settings(),
    transfer: expectCode(ctx, a.token, 'transfer', { from: A, to: B, token_id: String(recoverId) }, 'CLAIMER_A').code,
    delegate: expectCode(ctx, a.token, 'delegate', { account: A, delegatee: nonMember }, 'CLAIMER_A').code,
    votes: { admin: votes(admin), A: votes(A), B: votes(B) },
    recoverOwner: owner(recoverId)
  }));
  ctx.check(`${tag}: start state is locked + members-only + recovery off`, sameSettings(before.settings, SWITCH_EXPECTED.start), JSON.stringify(before.settings));
  ctx.check(`${tag}: before P1, CLAIMER_A's transfer fails with TransfersLocked (${ERR.token.TransfersLocked})`, codeIs(before.transfer, ERR.token.TransfersLocked), codeDetail(before.transfer));
  ctx.check(`${tag}: before P1, delegating to a non-member fails with DelegateNotMember (${ERR.token.DelegateNotMember})`, codeIs(before.delegate, ERR.token.DelegateNotMember), codeDetail(before.delegate));
  ctx.check(`${tag}: votes start at admin 4, CLAIMER_A 2, CLAIMER_B 1`, before.votes.admin === 4 && before.votes.A === 2 && before.votes.B === 1, JSON.stringify(before.votes));
  ctx.check(`${tag}: the token to recover (id ${recoverId}) belongs to CLAIMER_A`, before.recoverOwner === A);

  // Propose all three on one clock.
  const enc = {};
  for (const step of SWITCH_STEPS) {
    const p = (sw.P[step] ??= { description: switchDescription(s.runId, step) });
    p.hash = descriptionHash(p.description);
    enc[step] = encodeActions(switchActions(step, { token: a.token, recoverTokenId: recoverId, recoverTo: admin }));
    const predicted = read(ctx, a.governor, 'get_proposal_id', { ...enc[step], description_hash: p.hash });
    if (!p.proposeTx) {
      const r = write(ctx, a.governor, 'propose', { ...enc[step], description: p.description, proposer: admin }, 'LAUNCH_ADMIN', `switches.${step}.propose`);
      p.id = typeof r.value === 'string' ? r.value : predicted;
      p.proposeTx = r.txHash;
      ctx.save();
    }
    ctx.check(`${tag}: ${step} proposed by LAUNCH_ADMIN; id matches governor.get_proposal_id`, p.id === predicted && HEX32_RE.test(p.id), p.id);
  }

  const proposalState = (step) => normalizeState(read(ctx, a.governor, 'proposal_state', { proposal_id: sw.P[step].id }));
  const reach = (step, stage) => async () => {
    const st = proposalState(step);
    if (['Defeated', 'Expired', 'Canceled'].includes(st)) throw new Error(`${step} is ${st}`);
    return { done: atLeast(st, stage), note: `${step} state=${st}` };
  };
  const delay = num(read(ctx, a.governor, 'voting_delay'));
  const period = num(read(ctx, a.governor, 'voting_period'));
  const queueDelay = s.daoConfigs[kind].governance.queueDelay;

  // Vote for each proposal as soon as it is Active; weights are 4 + 2 + 1 = the whole supply.
  for (const step of SWITCH_STEPS) {
    const p = sw.P[step];
    await waitFor(`${step} voting delay (-> Active)`, reach(step, 'Active'), { timeoutS: delay + 900 });
    p.votes = p.votes ?? {};
    for (const role of ['LAUNCH_ADMIN', 'CLAIMER_A', 'CLAIMER_B']) {
      if (!p.votes[role]) {
        const r = write(ctx, a.governor, 'cast_vote', { proposal_id: p.id, vote_type: '1', reason: `membership switches ${step}`, voter: ctx.id(role) }, role, `switches.${step}.vote.${role}`);
        p.votes[role] = { tx: r.txHash, weight: String(r.value) };
        ctx.save();
      }
    }
    const weights = Object.values(p.votes).map((v) => num(v.weight));
    ctx.check(`${tag}: all three voted for ${step} with weights 4, 2, 1`, weights.join(',') === '4,2,1', weights.join(','));
  }

  // Queue every proposal once it Succeeded (CLAIMER_B operates), then execute in order.
  for (const step of SWITCH_STEPS) {
    const p = sw.P[step];
    await waitFor(`${step} voting period (-> Succeeded)`, reach(step, 'Succeeded'), { timeoutS: period + 900 });
    if (!p.queueTx) {
      const r = write(ctx, a.governor, 'queue', { ...enc[step], description_hash: p.hash, eta: '0', operator: B }, 'CLAIMER_B', `switches.${step}.queue`);
      p.queueTx = r.txHash;
      ctx.save();
    }
    ctx.check(`${tag}: ${step} queued`, atLeast(proposalState(step), 'Queued'), proposalState(step));
  }

  const after = { P1: null, P2: null, P3: null };
  for (const step of SWITCH_STEPS) {
    const p = sw.P[step];
    if (!p.executeTx) {
      await waitFor(`${step} queue delay (${queueDelay}s) until treasury.execute simulates OK`, async () => {
        const sim = simulate(ctx, a.treasury, 'execute', { ...enc[step], description_hash: p.hash }, 'CLAIMER_B');
        return sim.unexpectedSuccess ? { done: true, note: 'simulation ok' } : { done: false, note: `not executable yet (code ${sim.code ?? '?'})` };
      }, { timeoutS: queueDelay + 900 });
      const r = write(ctx, a.treasury, 'execute', { ...enc[step], description_hash: p.hash }, 'CLAIMER_B', `switches.${step}.execute`);
      p.executeTx = r.txHash;
      ctx.save();
    }
    after[step] = await observe(ctx, p, 'after', async () => {
      const common = { state: proposalState(step), settings: settings() };
      if (step === 'P1') {
        return { ...common, owner: owner(recoverId), votes: { admin: votes(admin), A: votes(A) }, balanceA: num(read(ctx, a.token, 'balance', { account: A })) };
      }
      if (step === 'P2') {
        const delegate = simulate(ctx, a.token, 'delegate', { account: A, delegatee: nonMember }, 'CLAIMER_A');
        const move = write(ctx, a.token, 'transfer', { from: A, to: B, token_id: String(keepId) }, 'CLAIMER_A', 'switches.P2.transfer_unlocked');
        return { ...common, delegateOk: delegate.unexpectedSuccess === true, moveTx: move.txHash, owner: owner(keepId) };
      }
      return {
        ...common,
        transfer: expectCode(ctx, a.token, 'transfer', { from: B, to: A, token_id: String(keepId) }, 'CLAIMER_B').code,
        delegate: expectCode(ctx, a.token, 'delegate', { account: B, delegatee: nonMember }, 'CLAIMER_B').code
      };
    });
    ctx.check(`${tag}: ${step} Executed through treasury.execute`, after[step].state === 'Executed', after[step].state);
    ctx.check(`${tag}: after ${step} token.settings == ${JSON.stringify(SWITCH_EXPECTED[step])}`, sameSettings(after[step].settings, SWITCH_EXPECTED[step]), JSON.stringify(after[step].settings));
  }

  ctx.check(`${tag}: after P1 token ${recoverId} (dao_transfer) is owned by LAUNCH_ADMIN`, after.P1.owner === admin, after.P1.owner);
  ctx.check(`${tag}: after P1 votes moved with the token (admin ${before.votes.admin} -> ${before.votes.admin + 1}, CLAIMER_A ${before.votes.A} -> ${before.votes.A - 1})`,
    after.P1.votes.admin === before.votes.admin + 1 && after.P1.votes.A === before.votes.A - 1 && after.P1.balanceA === 1, JSON.stringify(after.P1.votes));
  ctx.check(`${tag}: after P2 delegating to a non-member simulates OK (members-only is off)`, after.P2.delegateOk === true);
  ctx.check(`${tag}: after P2 CLAIMER_A's real transfer of token ${keepId} to CLAIMER_B succeeded (transfers unlocked)`, after.P2.owner === B && !!after.P2.moveTx, after.P2.moveTx);
  ctx.check(`${tag}: after P3 CLAIMER_B's transfer back fails with TransfersLocked (${ERR.token.TransfersLocked})`, codeIs(after.P3.transfer, ERR.token.TransfersLocked), codeDetail(after.P3.transfer));
  ctx.check(`${tag}: after P3 delegating to a non-member fails with DelegateNotMember again (${ERR.token.DelegateNotMember})`, codeIs(after.P3.delegate, ERR.token.DelegateNotMember), codeDetail(after.P3.delegate));
}

// ---------------------------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------------------------
async function report(ctx) {
  const s = ctx.state;
  const all = Object.values(s.results).flat();
  console.log('\n=== Assertions ===');
  for (const r of all) console.log(`${r.status.padEnd(4)}  ${r.phase.padEnd(15)} ${r.name}${r.detail ? `  [${r.detail.slice(0, 120)}]` : ''}`);
  console.log('\n=== Transactions ===');
  for (const [name, hash] of Object.entries(s.txs)) console.log(`${name.padEnd(38)} ${EXPLORER_TX}${hash}`);
  const counts = { PASS: 0, FAIL: 0, SKIP: 0 };
  for (const r of all) counts[r.status] += 1;
  const elapsedS = Math.round((Date.now() - Date.parse(s.createdAt)) / 1000);
  const summary = {
    runId: s.runId, network: NETWORK, counts, elapsedSinceStateCreatedSeconds: elapsedS,
    manager: s.manager, managerSource: s.managerSource,
    daos: Object.fromEntries(Object.entries(s.daos ?? {}).map(([k, v]) => [k, { nonce: v.nonce, slug: s.daoConfigs?.[k]?.slug, addresses: v.addr }])),
    drives: Object.fromEntries(Object.entries(s.drives ?? {}).map(([k, v]) => [k, { listId: v.listId, deadline: v.deadline, openTx: v.openTx }])),
    proposals: Object.fromEntries(Object.entries(s.switches?.P ?? {}).map(([k, v]) => [k, v.id])),
    phases: s.phases, txs: Object.fromEntries(Object.entries(s.txs).map(([k, v]) => [k, `${EXPLORER_TX}${v}`])),
    failures: all.filter((r) => r.status === 'FAIL')
  };
  mkdirSync(join(ctx.root, '.e2e'), { recursive: true });
  writeFileSync(join(ctx.root, '.e2e/membership-report.json'), `${JSON.stringify({ ...summary, assertions: all }, replacer, 2)}\n`);
  console.log(`\nreport written to .e2e/membership-report.json (elapsed ${elapsedS}s since the state file was created)`);
}

const PHASE_FNS = { preflight, 'failed-drive': failedDrive, 'launched-drive': launchedDrive, switches, report };

export function main(argv) {
  return runPhases({
    argv, phases: MEMBERSHIP_PHASES, phaseFns: PHASE_FNS, script: 'scripts/e2e-membership.mjs',
    defaultState: '.e2e/membership-state.json', labelPrefix: 'e2e-membership', title: 'Membership rehearsal', viewRole: 'LAUNCH_ADMIN',
    valueOptions: { '--manager-artifact': 'managerArtifact' }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (error) => {
    console.error(redact(error instanceof Error ? error.message : String(error)));
    process.exit(2);
  });
}
