import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeActions, paramArgs, selectPhases, HEX32_RE } from './e2e-testnet.mjs';
import {
  ERR, ERR_SOURCES, LAUNCH_CONFIG, LEAVES, MEMBERSHIP_PHASES, PRICE, DEFAULT_NON_MEMBER, SWITCH_EXPECTED, SWITCH_STEPS,
  assuranceListParams, claimParams, enumName, main, membershipDaoConfig, parseTreeOutput, roleNames, sameSettings,
  switchActions, switchDescription, treeSpec, windowSeconds
} from './e2e-membership.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const G_ADMIN = 'GCLGEIQB4RCG63LSIBSHQ6T67YICWKTHSORNHVXHFVVGXISZU3MQU6CO';
const G_A = 'GDQB6R74Q5K4MOCKPB3NLB7SX4BQR7DTXA3BGNKIVMZEXBEKCK4NQPFU';
const G_B = 'GD3V5DONBL34B4P7ZCJNVLPJI77THOSV4Y7SJBCT7IIFAIK7TFADLSOA';
const C_SAC = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
const HEX = 'ab'.repeat(32);
const template = JSON.parse(readFileSync(join(root, 'configs/testnet-builder-claims-dao.json'), 'utf8'));

test('roles default to the shared testnet identities and take env overrides', () => {
  assert.deepEqual(roleNames({}), { LAUNCH_ADMIN: 'testnet-admin', CLAIMER_A: 'alice', CLAIMER_B: 'testnet-dev' });
  assert.deepEqual(roleNames({ E2E_LAUNCH_ADMIN: 'x', E2E_CLAIMER_A: 'y', E2E_CLAIMER_B: 'z' }), { LAUNCH_ADMIN: 'x', CLAIMER_A: 'y', CLAIMER_B: 'z' });
});

test('drive windows are integers of at least a minute', () => {
  assert.equal(windowSeconds({}, 'E2E_FAIL_WINDOW_S', 300), 300);
  assert.equal(windowSeconds({ E2E_FAIL_WINDOW_S: '' }, 'E2E_FAIL_WINDOW_S', 300), 300);
  assert.equal(windowSeconds({ E2E_FAIL_WINDOW_S: '120' }, 'E2E_FAIL_WINDOW_S', 300), 120);
  assert.throws(() => windowSeconds({ E2E_FAIL_WINDOW_S: '59' }, 'E2E_FAIL_WINDOW_S', 300), /at least 60/);
  assert.throws(() => windowSeconds({ E2E_FAIL_WINDOW_S: '1.5e3x' }, 'E2E_FAIL_WINDOW_S', 300), /at least 60/);
});

test('DAO configs derive from the claims profile: ClaimMinter only, locked, recovery off, fresh slug and nonce', () => {
  const fail = membershipDaoConfig(template, { kind: 'fail', nonce: 1791966647, owner: G_ADMIN, sac: C_SAC, runId: '1791966647' });
  const live = membershipDaoConfig(template, { kind: 'live', nonce: 1791966648, owner: G_ADMIN, sac: C_SAC, runId: '1791966647' });
  assert.equal(fail.slug, 'e2e-fail-1791966647');
  assert.equal(live.slug, 'e2e-live-1791966648');
  assert.notEqual(fail.token.name, live.token.name);
  for (const config of [fail, live]) {
    assert.equal(config.deployer, G_ADMIN);
    assert.equal(config.launchAdmin, G_ADMIN);
    assert.deepEqual(config.claims, { paymentAsset: C_SAC });
    assert.deepEqual(config.tokenSettings, { transfersLocked: true, membersOnlyDelegation: true, daoRecovery: false });
    assert.deepEqual(config.launch, { launchAuction: false, launchMarketplace: false });
    assert.equal(config.auction, undefined);
    assert.equal(config.marketplace, undefined);
    assert.equal(config.$comment, undefined);
    assert.equal(config.governance.votingDelay, 300);
    assert.equal(config.metadata.artwork.properties.length, template.metadata.artwork.properties.length);
  }
  assert.deepEqual(fail.founders, [{ address: G_ADMIN, amount: 1 }]);
  assert.deepEqual(live.founders, [{ address: G_ADMIN, amount: 4 }]);
  // the template stays untouched
  assert.equal(template.tokenSettings.daoRecovery, true);
  assert.equal(template.slug, 'builder-claims');
  assert.throws(() => membershipDaoConfig(template, { kind: 'nope', nonce: 1, owner: G_ADMIN, sac: C_SAC, runId: '1' }));
});

test('the derived configs pass deploy-dao.mjs --validate-only (no network)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-membership-'));
  for (const [kind, nonce] of [['fail', 7001], ['live', 7002]]) {
    const path = join(dir, `${kind}.json`);
    writeFileSync(path, JSON.stringify(membershipDaoConfig(template, { kind, nonce, owner: G_ADMIN, sac: C_SAC, runId: '7001' })));
    const result = spawnSync('node', [join(here, 'deploy-dao.mjs'), '--validate-only', path], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /DAO config is valid/);
    assert.match(result.stdout, /modules: claims\n/);
    assert.match(result.stdout, /"transfers_locked":true,"members_only_delegation":true,"dao_recovery":false/);
  }
});

test('open_assurance list uses ScVal-JSON for u64 / i128 / BytesN and plain values elsewhere', () => {
  const list = assuranceListParams({ root: HEX, treeUri: 'ipfs://bafkreitest/tree.json', price: PRICE, total: 3, thresholdClaimers: 2, expiresAt: 1_900_000_000, deadline: 1_800_000_300 });
  assert.deepEqual(list, {
    root: { bytes: HEX },
    tree_uri: 'ipfs://bafkreitest/tree.json',
    price: { i128: '10000000' },
    expires_at: { u64: '1900000000' },
    total: 3,
    threshold_claimers: 2,
    deadline: { u64: '1800000300' }
  });
  // what the CLI receives: one JSON argument per struct, never bare strings for the typed fields
  const argv = paramArgs({ token_address: C_SAC, list, launch_config: LAUNCH_CONFIG });
  assert.deepEqual(argv.slice(0, 2), ['--token_address', C_SAC]);
  assert.deepEqual(JSON.parse(argv[3]), list);
  assert.deepEqual(JSON.parse(argv[5]), { launch_auction: false, launch_marketplace: false });
  assert.throws(() => assuranceListParams({ root: 'AB'.repeat(32), treeUri: 'ipfs://x', price: 1, total: 1, thresholdClaimers: 1, expiresAt: 2, deadline: 1 }), /64 lowercase hex/);
  assert.throws(() => assuranceListParams({ root: HEX, treeUri: 'https://x', price: 1, total: 1, thresholdClaimers: 1, expiresAt: 2, deadline: 1 }), /ipfs/);
  assert.throws(() => assuranceListParams({ root: HEX, treeUri: 'ipfs://x', price: 1, total: -1, thresholdClaimers: 1, expiresAt: 2, deadline: 1 }), /u32/);
  // a zero threshold is encodable on purpose: the contract refuses it (7825) and the rehearsal simulates that
  assert.equal(assuranceListParams({ root: HEX, treeUri: 'ipfs://x', price: 1, total: 1, thresholdClaimers: 0, expiresAt: 2, deadline: 1 }).threshold_claimers, 0);
});

test('claim arguments: scalars as strings, the proof as a JSON array of hex nodes', () => {
  const params = claimParams({ listId: 0, claimer: G_A, leafAmount: '2', mintNow: 2, proof: [HEX], maxPrice: PRICE });
  assert.deepEqual(params, { list_id: '0', claimer: G_A, leaf_amount: '2', mint_now: '2', proof: [HEX], max_price: '10000000' });
  assert.deepEqual(paramArgs(params).slice(-4), ['--proof', `["${HEX}"]`, '--max_price', '10000000']);
  assert.throws(() => claimParams({ listId: 0, claimer: G_A, leafAmount: '2', mintNow: 2, proof: ['zz'], maxPrice: 1 }));
  assert.throws(() => claimParams({ listId: 0, claimer: 'nope', leafAmount: '2', mintNow: 2, proof: [], maxPrice: 1 }));
  assert.deepEqual(claimParams({ listId: 1, claimer: G_B, leafAmount: 1, mintNow: 1, proof: [], maxPrice: 1 }).proof, []);
});

test('tree builder spec and output parsing', () => {
  assert.deepEqual(treeSpec({ network: 'n', token: C_SAC, list: 3, entries: [{ address: G_A, amount: 2 }] }),
    { network: 'n', token: C_SAC, list: 3, entries: [{ address: G_A, amount: '2' }] });
  const summary = { root: HEX, total: '3', claims: { [G_A]: { amount: '2', proof: [HEX] } } };
  assert.deepEqual(parseTreeOutput(`vite-node noise\n${JSON.stringify(summary)}\n`), summary);
  assert.throws(() => parseTreeOutput('no json here'), /no JSON summary/);
  assert.throws(() => parseTreeOutput(JSON.stringify({ root: 'short', claims: {} })), /malformed/);
});

test('unit enums print as strings, one-element arrays or objects', () => {
  assert.equal(enumName('Failed'), 'Failed');
  assert.equal(enumName(['Met']), 'Met');
  assert.equal(enumName({ Open: null }), 'Open');
  assert.equal(enumName(null), undefined);
});

test('switch proposals: encodings, ordering and the settings each one leaves', () => {
  const ctx = { token: C_SAC, recoverTokenId: 4, recoverTo: G_ADMIN };
  const p1 = encodeActions(switchActions('P1', ctx));
  assert.equal(p1.functions, '["set_dao_recovery","dao_transfer"]'); // recovery on BEFORE the recovery move (RecoveryOff otherwise)
  assert.equal(p1.args, `[[{"bool":true}],[{"u32":4},{"address":"${G_ADMIN}"}]]`);
  assert.equal(p1.targets, `["${C_SAC}","${C_SAC}"]`);
  assert.equal(encodeActions(switchActions('P2', ctx)).args, '[[{"bool":false}],[{"bool":false}]]');
  const p3 = encodeActions(switchActions('P3', ctx));
  assert.equal(p3.functions, '["set_transfers_locked","set_members_only_delegation","set_dao_recovery"]');
  assert.equal(p3.args, '[[{"bool":true}],[{"bool":true}],[{"bool":false}]]');
  assert.throws(() => switchActions('P9', ctx));

  // Apply the actions to the start settings: each step must change something (SettingUnchanged otherwise)
  // and land on the settings the rehearsal asserts.
  const fields = { set_transfers_locked: 'transfers_locked', set_members_only_delegation: 'members_only_delegation', set_dao_recovery: 'dao_recovery' };
  let settings = { ...SWITCH_EXPECTED.start };
  for (const step of SWITCH_STEPS) {
    for (const { fn, args } of switchActions(step, ctx)) {
      if (!fields[fn]) continue;
      assert.notEqual(settings[fields[fn]], args[0].bool, `${step}: ${fn} must change its switch`);
      settings = { ...settings, [fields[fn]]: args[0].bool };
    }
    assert.ok(sameSettings(settings, SWITCH_EXPECTED[step]), `${step} leaves ${JSON.stringify(SWITCH_EXPECTED[step])}`);
  }
  assert.ok(sameSettings(settings, SWITCH_EXPECTED.start), 'P3 relocks to the start state');
  assert.ok(!sameSettings({ ...settings, dao_recovery: true }, SWITCH_EXPECTED.start));
  assert.match(switchDescription('123', 'P2'), /^Membership switches 123 P2: /);
  assert.notEqual(switchDescription('1', 'P1'), switchDescription('1', 'P2'));
  assert.match(DEFAULT_NON_MEMBER, /^G[A-Z2-7]{55}$/);
});

test('expected error codes match the Rust enums', () => {
  for (const [group, names] of Object.entries(ERR)) {
    const source = readFileSync(join(root, ERR_SOURCES[group]), 'utf8');
    const codes = Object.fromEntries([...source.matchAll(/^\s*([A-Z]\w+)\s*=\s*(\d+),/gm)].map((m) => [m[1], Number(m[2])]));
    for (const [name, code] of Object.entries(names)) assert.equal(codes[name], code, `${group}.${name} in ${ERR_SOURCES[group]}`);
  }
});

test('phase selection and usage for the membership script', async () => {
  assert.deepEqual(MEMBERSHIP_PHASES, ['preflight', 'failed-drive', 'launched-drive', 'switches', 'report']);
  assert.deepEqual(selectPhases('2', MEMBERSHIP_PHASES), ['launched-drive']);
  assert.deepEqual(selectPhases('all', MEMBERSHIP_PHASES), MEMBERSHIP_PHASES);
  assert.throws(() => selectPhases('5', MEMBERSHIP_PHASES), /0\.\.4/);
  // the arguments are validated before any file or network access
  await assert.rejects(main(['bogus']), /Usage: node scripts\/e2e-membership\.mjs <preflight\|failed-drive\|launched-drive\|switches\|report\|all\|0\.\.4>/);
  await assert.rejects(main(['bogus', '--manager-artifact', 'deploys/x.json']), /Usage/);
  await assert.rejects(main(['preflight', '--wat']), /unknown argument --wat/);
});

test('claim leaves and price match the drive terms the rehearsal asserts', () => {
  assert.equal(LEAVES.CLAIMER_A + LEAVES.CLAIMER_B, 3);
  assert.equal(PRICE, 10_000_000n);
});

test('the web tree builder produces the tree the script claims against (vite-node, offline)', { skip: !existsSync(join(root, 'apps/web/node_modules/.bin/vite-node')) }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-membership-tree-'));
  const spec = join(dir, 'spec.json');
  const out = join(dir, 'tree.json');
  writeFileSync(spec, JSON.stringify(treeSpec({
    network: 'Test SDF Network ; September 2015', token: C_SAC, list: 0,
    entries: [{ address: G_A, amount: LEAVES.CLAIMER_A }, { address: G_B, amount: LEAVES.CLAIMER_B }]
  })));
  const result = spawnSync('pnpm', ['exec', 'vite-node', '--config', 'vitest.config.ts', join(here, 'e2e-membership-tree.ts'), spec, out], {
    cwd: join(root, 'apps/web'), encoding: 'utf8', timeout: 120_000
  });
  assert.equal(result.status, 0, result.stderr);
  const summary = parseTreeOutput(result.stdout);
  assert.equal(summary.total, '3');
  assert.deepEqual(Object.keys(summary.claims).sort(), [G_A, G_B].sort());
  assert.equal(summary.claims[G_A].amount, '2');
  assert.ok(Object.values(summary.claims).every((c) => c.proof.length === 1 && HEX32_RE.test(c.proof[0])));
  const file = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(file.format, 'builder-stellar-merkle-v1');
  assert.equal(file.merkleRoot, summary.root);
  assert.equal(file.token, C_SAC);
});
