import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { runQuiet } from './lib.mjs';

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
  'contract', 'install', '--wasm', wasmPath, '--source-account', identityName,
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
  invoke(managerArtifact.manager, 'register_implementation', {
    name: 'Manager',
    version: legacyManagerVersion,
    wasm_hash: fromHash
  });
}
invoke(managerArtifact.manager, 'register_implementation', {
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

const plan = {
  network: networkConfig.network,
  manager: managerArtifact.manager,
  module: moduleName,
  target,
  fromHash,
  toHash: targetHash,
  version: releaseManifest[moduleName],
  managerApproval: 'submitted',
  governanceActions: [
    { target, function: 'upgrade', args: { from_hash: fromHash, to_hash: targetHash } },
    { target, function: 'sync_version', args: {} }
  ]
};
const planPath = `deploys/${networkConfig.label}-${networkConfig.network}-dao-${daoConfig.nonce}-${moduleName}-upgrade.json`;
writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);
console.log(`Approved ${moduleName} upgrade ${fromHash} -> ${targetHash}.`);
console.log(`Submit both governanceActions, in order, through the DAO Treasury: ${planPath}`);
