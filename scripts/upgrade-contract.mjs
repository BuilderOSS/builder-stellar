import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { runQuiet } from './lib.mjs';

/**
 * Upgrade tooling for the hardened contracts.
 *
 * - manager: Manager admin calls upgrade_manager directly.
 * - DAO modules: the Manager admin registers the new implementation and approves the (from, to)
 *   path (register_implementation / approve_upgrade). The module upgrade itself is `upgrade(from_hash,
 *   to_hash)` followed by `sync_version()`, owner-only:
 *     * before launch (token.is_live() == false) the owner is the launch admin: this script calls them
 *       directly with DEPLOY_IDENTITY;
 *     * after launch the owner of every module is the Treasury, so a direct call can never succeed.
 *       The script writes a governance proposal payload (targets/functions/args/description hash) and
 *       prints the propose -> cast_vote -> queue -> treasury.execute commands. Nothing is sent to the
 *       Governor by this script.
 *   Treasury and Governor self-upgrades use the same payload: Treasury-targeted actions are handled by
 *   its self-dispatch (only `upgrade(from,to)` and `sync_version()` are allowed).
 *
 * Registry notes: records are write-once (a wrong name/version for a hash can never be fixed or
 * un-revoked). Use get_implementation(hash) and the Manager's Current* hashes for security decisions,
 * never get_latest_implementation(name): it returns None once the latest hash is revoked.
 *
 * Env: DEPLOY_IDENTITY (Manager admin / launch admin key), LEGACY_MANAGER_VERSION (manager only),
 *      PROPOSER (address placed in the printed propose command), UPGRADE_DESCRIPTION (proposal text).
 */

const MASK = (1n << 64n) - 1n;
const ROUND_CONSTANTS = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n
];
const ROTATIONS = [
  [0, 36, 3, 41, 18], [1, 44, 10, 45, 2], [62, 6, 43, 15, 61], [28, 55, 25, 21, 56], [27, 20, 39, 8, 14]
];
const rotl = (value, shift) => (((value << BigInt(shift)) | (value >> BigInt(64 - shift))) & MASK);

// Legacy Keccak-256 (0x01 padding), which is what the Governor's `keccak256(description)` computes.
// Node's built-in sha3-256 uses different padding and does NOT match.
function keccak256(input) {
  const rate = 136;
  const data = Buffer.from(input);
  const padded = Buffer.alloc(Math.ceil((data.length + 1) / rate) * rate);
  data.copy(padded);
  padded[data.length] ^= 0x01;
  padded[padded.length - 1] ^= 0x80;
  const state = Array.from({ length: 5 }, () => Array(5).fill(0n));
  for (let offset = 0; offset < padded.length; offset += rate) {
    for (let i = 0; i < rate / 8; i++) state[i % 5][Math.floor(i / 5)] ^= padded.readBigUInt64LE(offset + i * 8);
    for (const constant of ROUND_CONSTANTS) {
      const c = state.map((column) => column.reduce((a, b) => a ^ b));
      for (let x = 0; x < 5; x++) {
        const d = c[(x + 4) % 5] ^ rotl(c[(x + 1) % 5], 1);
        for (let y = 0; y < 5; y++) state[x][y] ^= d;
      }
      const b = Array.from({ length: 5 }, () => Array(5).fill(0n));
      for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) {
        b[y][(2 * x + 3 * y) % 5] = ROTATIONS[x][y] === 0 ? state[x][y] : rotl(state[x][y], ROTATIONS[x][y]);
      }
      for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) {
        state[x][y] = b[x][y] ^ (~b[(x + 1) % 5][y] & MASK & b[(x + 2) % 5][y]);
      }
      state[0][0] ^= constant;
    }
  }
  const out = Buffer.alloc(32);
  for (let i = 0; i < 4; i++) out.writeBigUInt64LE(state[i % 5][Math.floor(i / 5)], i * 8);
  return out.toString('hex');
}

const [moduleName, firstConfigPath, secondConfigPath, fromHash] = process.argv.slice(2);
const moduleNames = ['manager', 'token', 'metadata', 'auction', 'governor', 'treasury', 'marketplace'];

if (!moduleNames.includes(moduleName) || !firstConfigPath || !fromHash) {
  throw new Error(
    'Usage: node scripts/upgrade-contract.mjs <manager|token|metadata|auction|governor|treasury|marketplace> <network-config.json> [dao-config.json] <from-wasm-hash>'
  );
}

const networkConfigPath = moduleName === 'manager' ? firstConfigPath : secondConfigPath;
const daoConfigPath = moduleName === 'manager' ? null : firstConfigPath;
if (!networkConfigPath) throw new Error('A network config is required for module upgrades');

const networkConfig = JSON.parse(readFileSync(networkConfigPath, 'utf8'));
const releaseManifest = JSON.parse(readFileSync('releases/contracts.json', 'utf8'));
const managerArtifactPath = `deploys/${networkConfig.label}-${networkConfig.network}-manager.json`;
if (!existsSync(managerArtifactPath)) throw new Error(`Manager artifact not found: ${managerArtifactPath}`);
const managerArtifact = JSON.parse(readFileSync(managerArtifactPath, 'utf8'));
const identityName = process.env.DEPLOY_IDENTITY?.trim() || `${networkConfig.network}-admin`;
const wasmPath = `target/wasm32v1-none/release/${moduleName}.wasm`;

if (!existsSync(wasmPath)) {
  throw new Error(`Missing ${wasmPath}. Run: pnpm contracts:build`);
}
if (!releaseManifest[moduleName]) throw new Error(`Missing ${moduleName} release version`);

if (moduleName !== 'manager') {
  const managerVersionProbe = runQuiet('stellar', [
    'contract', 'invoke', '--id', managerArtifact.manager, '--source-account', identityName,
    '--network', networkConfig.network, '--send', 'no', '--',
    'get_implementation_version', '--wasm_hash', fromHash
  ]);
  if (!managerVersionProbe.ok) {
    throw new Error(
      'Manager does not expose get_implementation_version. Upgrade Manager first with LEGACY_MANAGER_VERSION set to its verified active release.'
    );
  }
}

function isRegistered(hash) {
  const r = runQuiet('stellar', [
    'contract', 'invoke', '--id', managerArtifact.manager, '--source-account', identityName,
    '--network', networkConfig.network, '--send', 'no', '--', 'get_implementation', '--wasm_hash', hash
  ]);
  return r.ok && (r.stdout + r.stderr).trim().split('\n').pop().trim() !== 'null';
}

function registerOnce(params) {
  // register_implementation rejects an existing hash (ImplementationAlreadyRegistered).
  if (isRegistered(params.wasm_hash)) {
    console.log(`Implementation ${params.name} ${params.wasm_hash} already registered, skipping.`);
    return;
  }
  invoke(managerArtifact.manager, 'register_implementation', params);
}

function invoke(contractId, method, params) {
  const result = runQuiet('stellar', [
    'contract', 'invoke', '--id', contractId, '--source-account', identityName,
    '--network', networkConfig.network, '--', method,
    ...Object.entries(params).flatMap(([name, value]) => [`--${name}`, value])
  ]);
  if (!result.ok) throw new Error(`${method} failed: ${result.stderr || result.stdout}`);
}

const targetHash = createHash('sha256').update(readFileSync(wasmPath)).digest('hex');
const installResult = runQuiet('stellar', [
  'contract', 'upload', '--wasm', wasmPath, '--source-account', identityName,
  '--network', networkConfig.network
]);
if (!installResult.ok && !installResult.stderr.includes('already exists') && !installResult.stdout.includes(targetHash)) {
  throw new Error(`Failed to install ${moduleName} WASM: ${installResult.stderr || installResult.stdout}`);
}

const implementationName = moduleName[0].toUpperCase() + moduleName.slice(1);
if (moduleName === 'manager') {
  const legacyManagerVersion = process.env.LEGACY_MANAGER_VERSION?.trim();
  if (!legacyManagerVersion) {
    throw new Error(
      'Set LEGACY_MANAGER_VERSION to the verified active Manager release before migrating Manager.'
    );
  }
  registerOnce({
    name: 'Manager',
    version: legacyManagerVersion,
    wasm_hash: fromHash
  });
}
registerOnce({
  name: implementationName,
  version: releaseManifest[moduleName],
  wasm_hash: targetHash
});
invoke(managerArtifact.manager, 'approve_upgrade', {
  from_hash: fromHash,
  to_hash: targetHash
});

if (moduleName === 'manager') {
  invoke(managerArtifact.manager, 'upgrade_manager', {
    from_hash: fromHash,
    to_hash: targetHash
  });
  console.log(`Manager upgraded to ${releaseManifest.manager} (${targetHash}).`);
  process.exit(0);
}

const daoConfig = JSON.parse(readFileSync(daoConfigPath, 'utf8'));
const daoArtifactPath = `deploys/${networkConfig.label}-${networkConfig.network}-dao-${daoConfig.nonce}.json`;
if (!existsSync(daoArtifactPath)) throw new Error(`DAO artifact not found: ${daoArtifactPath}`);
const daoArtifact = JSON.parse(readFileSync(daoArtifactPath, 'utf8'));
const target = daoArtifact.addresses?.[moduleName];
if (!target) throw new Error(`DAO artifact does not contain a ${moduleName} address`);

const live = (() => {
  const result = runQuiet('stellar', [
    'contract', 'invoke', '--id', daoArtifact.addresses.token, '--source-account', identityName,
    '--network', networkConfig.network, '--send', 'no', '--', 'is_live'
  ]);
  if (!result.ok) throw new Error(`Could not read token.is_live: ${result.stderr || result.stdout}`);
  return /true\s*$/i.test(result.stdout.trim());
})();

if (!live) {
  // Setup window: the launch admin still owns the module.
  invoke(target, 'upgrade', { from_hash: fromHash, to_hash: targetHash });
  invoke(target, 'sync_version', {});
  console.log(`Pre-launch: upgraded ${moduleName} directly as the launch admin (${fromHash} -> ${targetHash}).`);
  process.exit(0);
}

// Live DAO: the module owner is the Treasury. Emit a governance payload instead of a direct call.
const description =
  process.env.UPGRADE_DESCRIPTION?.trim() ||
  `Upgrade ${moduleName} to ${releaseManifest[moduleName]} (${targetHash})`;
const descriptionHash = keccak256(Buffer.from(description, 'utf8'));
const bytes = (hex) => ({ bytes: hex });
const payload = {
  targets: [target, target],
  functions: ['upgrade', 'sync_version'],
  args: [[bytes(fromHash), bytes(targetHash)], []],
  description,
  description_hash: descriptionHash
};
const plan = {
  network: networkConfig.network,
  manager: managerArtifact.manager,
  module: moduleName,
  target,
  fromHash,
  toHash: targetHash,
  version: releaseManifest[moduleName],
  managerApproval: 'submitted',
  governor: daoArtifact.addresses.governor,
  treasury: daoArtifact.addresses.treasury,
  proposal: payload
};
const planPath = `deploys/${networkConfig.label}-${networkConfig.network}-dao-${daoConfig.nonce}-${moduleName}-upgrade.json`;
writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);

const q = (value) => `'${JSON.stringify(value)}'`;
const net = `--network ${networkConfig.network}`;
const proposer = process.env.PROPOSER?.trim() || '<PROPOSER_ADDRESS>';
console.log(`Approved ${moduleName} upgrade ${fromHash} -> ${targetHash} on the Manager.`);
console.log(`The DAO is Live: ${moduleName} is owned by the Treasury, so it must be upgraded by governance.`);
console.log(`Proposal payload written to ${planPath}\n`);
console.log('1. Propose (proposer needs >= proposal_threshold votes at the previous ledger):');
console.log(`stellar contract invoke --id ${plan.governor} --source-account <PROPOSER_KEY> ${net} -- propose \\
  --targets ${q(payload.targets)} --functions ${q(payload.functions)} \\
  --args ${q(payload.args)} \\
  --description ${JSON.stringify(description)} --proposer ${proposer}`);
console.log('   (note the returned proposal id; it is also in the ProposalCreated event)\n');
console.log('2. After voting_delay, vote (vote_type 0 = against, 1 = for, 2 = abstain):');
console.log(`stellar contract invoke --id ${plan.governor} --source-account <VOTER_KEY> ${net} -- cast_vote \\
  --proposal_id <PROPOSAL_ID> --vote_type 1 --reason "" --voter <VOTER_ADDRESS>\n`);
console.log('3. After voting_period, if Succeeded (queue; eta is ignored by the Governor, operator is unauthenticated):');
console.log(`stellar contract invoke --id ${plan.governor} --source-account <ANY_KEY> ${net} -- queue \\
  --targets ${q(payload.targets)} --functions ${q(payload.functions)} --args ${q(payload.args)} \\
  --description_hash ${descriptionHash} --eta 0 --operator <ANY_ADDRESS>\n`);
console.log('4. After queue_delay, execute through the TREASURY (anyone; Governor.execute always fails with UseTreasuryExecute):');
console.log(`stellar contract invoke --id ${plan.treasury} --source-account <ANY_KEY> ${net} -- execute \\
  --targets ${q(payload.targets)} --functions ${q(payload.functions)} --args ${q(payload.args)} \\
  --description_hash ${descriptionHash}\n`);
console.log('A Succeeded proposal that is not queued expires 14 days after voting ends; a Queued one expires 14 days after its ETA.');
if (moduleName === 'treasury' || moduleName === 'governor') {
  console.log(`NOTE: ${moduleName} self-upgrade. Treasury-targeted actions run through its self-dispatch (upgrade/sync_version only).`);
  console.log('If sync_version fails in the same execute (it may still run the old code in-transaction), split it into a second proposal.');
}
