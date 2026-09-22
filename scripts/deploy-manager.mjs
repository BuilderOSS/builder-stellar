import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import readline from 'node:readline/promises';
import { enrichTransactionMetadata, run, runQuiet } from './lib.mjs';

const args = process.argv.slice(2);
const force = args.includes('--force');
const configPath = args.find((arg) => arg !== '--force');

if (!configPath) {
  throw new Error(
    'Usage: node scripts/deploy-manager.mjs <config.json> [--force]'
  );
}

const config = JSON.parse(readFileSync(configPath, 'utf8'));
const requiredConfig = [
  ['network', config.network],
  ['label', config.label],
  ['adminAddress', config.adminAddress],
  ['rpcUrl', config.rpcUrl],
  ['networkPassphrase', config.networkPassphrase]
];
const missingConfig = requiredConfig.find(
  ([, value]) => value === undefined || value === null || value === ''
);
if (missingConfig) {
  throw new Error(
    `Manager config ${configPath} must define ${missingConfig[0]}`
  );
}
if (!['local', 'testnet', 'mainnet'].includes(config.network)) {
  throw new Error(
    `Manager config ${configPath} must define network as local, testnet, or mainnet`
  );
}
const networkName = config.network;
const identityName =
  process.env.DAO_DEPLOY_IDENTITY?.trim() || `${networkName}-dev`;
const adminAddress = config.adminAddress;
const rpcUrl = config.rpcUrl;
const networkPassphrase = config.networkPassphrase;
const saltSuffix = process.env.DAO_DEPLOY_SALT_SUFFIX?.trim() ?? '';
const contractBuildDir = 'target/wasm32v1-none/release';
const deployArtifactPath = `deploys/${config.label}-${networkName}-manager.json`;

async function confirmOverwrite(filePath) {
  if (force || !existsSync(filePath)) {
    return true;
  }

  if (!process.stdin.isTTY) {
    throw new Error(
      `Refusing to overwrite ${filePath} without --force in non-interactive mode`
    );
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  const answer = await rl.question(`Overwrite ${filePath}? [y/N] `);
  rl.close();

  return ['y', 'yes'].includes(answer.trim().toLowerCase());
}

function ensureNetwork() {
  runQuiet('stellar', [
    'network',
    'add',
    networkName,
    '--rpc-url',
    rpcUrl,
    '--network-passphrase',
    networkPassphrase
  ]);
  run('stellar', ['network', 'use', networkName]);
}

function ensureIdentity() {
  runQuiet('stellar', ['keys', 'generate', identityName]);
  runQuiet('stellar', ['keys', 'fund', identityName, '--network', networkName]);
}

function wasmPath(packageName) {
  return `${contractBuildDir}/${packageName}.wasm`;
}

function wasmHash(packageName) {
  return createHash('sha256')
    .update(readFileSync(wasmPath(packageName)))
    .digest('hex');
}

function saltFor(packageName) {
  const hash = wasmHash(packageName);
  const seed = saltSuffix
    ? `dao-manager:${config.label}:${networkName}:${packageName}:${hash}:${saltSuffix}`
    : `dao-manager:${config.label}:${networkName}:${packageName}:${hash}`;
  return createHash('sha256').update(seed).digest('hex');
}

function contractId(packageName) {
  return runQuiet('stellar', [
    'contract',
    'id',
    'wasm',
    '--salt',
    saltFor(packageName),
    '--source-account',
    identityName,
    '--network',
    networkName
  ]).stdout.trim();
}

function deployIfMissing(packageName, alias, initArgs) {
  const id = contractId(packageName);
  const exists = runQuiet('stellar', [
    'contract',
    'fetch',
    '--id',
    id,
    '--network',
    networkName
  ]);

  let txMetadata = null;
  if (!exists.ok) {
    const result = runQuiet('stellar', [
      'contract',
      'deploy',
      '--alias',
      alias,
      '--wasm',
      wasmPath(packageName),
      '--source-account',
      identityName,
      '--network',
      networkName,
      '--salt',
      saltFor(packageName),
      '--',
      ...initArgs
    ]);

    if (!result.ok) {
      console.error('Deploy output:', result.stdout);
      console.error('Deploy error:', result.stderr);
      throw new Error(`Failed to deploy ${packageName}`);
    }

    console.log(result.stdout);
    console.error(result.stderr);

    const output = result.stdout + result.stderr;
    const txHashMatch = output.match(/Signing transaction:\s*([a-f0-9]{64})/i);

    txMetadata = {
      deployedAt: new Date().toISOString()
    };

    if (txHashMatch) {
      txMetadata.txHash = txHashMatch[1];
    }
  }

  return { id, txMetadata };
}

function installWasm(packageName) {
  const wasmFile = wasmPath(packageName);
  const hash = wasmHash(packageName);

  console.log(`Installing ${packageName} WASM (hash: ${hash})...`);

  const result = runQuiet('stellar', [
    'contract',
    'install',
    '--wasm',
    wasmFile,
    '--source-account',
    identityName,
    '--network',
    networkName
  ]);

  if (!result.ok) {
    // Check if already installed
    if (
      result.stderr.includes('already exists') ||
      result.stdout.includes(hash)
    ) {
      console.log(`WASM already installed: ${hash}`);
      return hash;
    }
    console.error('Install output:', result.stdout);
    console.error('Install error:', result.stderr);
    throw new Error(`Failed to install ${packageName} WASM`);
  }

  console.log(`Installed ${packageName} WASM: ${hash}`);
  return hash;
}

function registerImplementation(managerAddress, wasmHash, name) {
  console.log(`Registering implementation ${name}...`);

  const result = runQuiet('stellar', [
    'contract',
    'invoke',
    '--id',
    managerAddress,
    '--source-account',
    identityName,
    '--network',
    networkName,
    '--',
    'register_implementation',
    '--wasm_hash',
    wasmHash,
    '--name',
    name,
    '--version',
    '1'
  ]);

  if (!result.ok) {
    console.error('Register output:', result.stdout);
    console.error('Register error:', result.stderr);
    throw new Error(`Failed to register ${name} implementation`);
  }

  console.log(`Registered ${name} implementation`);
}

function setCurrentImplementations(managerAddress, implementations) {
  console.log('Setting current implementations...');

  const result = runQuiet('stellar', [
    'contract',
    'invoke',
    '--id',
    managerAddress,
    '--source-account',
    identityName,
    '--network',
    networkName,
    '--',
    'set_current_implementations',
    '--token',
    implementations.token,
    '--metadata',
    implementations.metadata,
    '--auction',
    implementations.auction,
    '--governor',
    implementations.governor,
    '--treasury',
    implementations.treasury
  ]);

  if (!result.ok) {
    console.error('Set current output:', result.stdout);
    console.error('Set current error:', result.stderr);
    throw new Error('Failed to set current implementations');
  }

  console.log('Current implementations set successfully');
}

async function writeDeployArtifact(
  managerAddress,
  implementations,
  txMetadata
) {
  if (!(await confirmOverwrite(deployArtifactPath))) {
    console.log(`Skipped writing ${deployArtifactPath}.`);
    return;
  }

  const existingArtifact = existsSync(deployArtifactPath)
    ? JSON.parse(readFileSync(deployArtifactPath, 'utf8'))
    : null;
  const managerTransaction = enrichTransactionMetadata(
    txMetadata ?? existingArtifact?.transactions?.manager,
    networkName
  );
  const transactions = managerTransaction ? { manager: managerTransaction } : {};
  const deploymentLedger = Math.min(
    ...Object.values(transactions)
      .map((metadata) => metadata?.ledger)
      .filter((ledger) => Number.isFinite(ledger))
  );

  const artifact = {
    network: networkName,
    label: config.label,
    deploymentLedger: Number.isFinite(deploymentLedger)
      ? deploymentLedger
      : existingArtifact?.deploymentLedger ?? null,
    config: {
      label: config.label,
      adminAddress,
      rpcUrl,
      networkPassphrase
    },
    manager: managerAddress,
    implementations,
    deployedAt: new Date().toISOString()
  };

  if (Object.keys(transactions).length > 0) {
    artifact.transactions = transactions;
  }

  mkdirSync('deploys', { recursive: true });
  writeFileSync(deployArtifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(`\nDeployment artifact written to ${deployArtifactPath}`);
}

async function main() {
  // Build all contracts including manager and metadata
  run(
    'cargo',
    [
      'build',
      '-p',
      'token',
      '-p',
      'governor',
      '-p',
      'treasury',
      '-p',
      'auction',
      '-p',
      'manager',
      '-p',
      'metadata',
      '--release',
      '--target',
      'wasm32v1-none'
    ],
    {
      env: {
        ...process.env,
        SOROBAN_SDK_BUILD_SYSTEM_SUPPORTS_SPEC_SHAKING_V2: '0'
      }
    }
  );

  ensureNetwork();
  ensureIdentity();

  // Deploy Manager contract
  console.log('\n=== Deploying Manager Contract ===\n');
  const managerDeploy = deployIfMissing(
    'manager',
    `dao-manager-${networkName}`,
    ['--admin', adminAddress]
  );

  console.log(`Manager deployed: ${managerDeploy.id}`);

  // Install all 5 implementation WASMs
  console.log('\n=== Installing Implementation WASMs ===\n');
  const implementations = {
    token: installWasm('token'),
    metadata: installWasm('metadata'),
    auction: installWasm('auction'),
    governor: installWasm('governor'),
    treasury: installWasm('treasury')
  };

  // Register implementations with Manager
  console.log('\n=== Registering Implementations ===\n');
  registerImplementation(managerDeploy.id, implementations.token, 'Token');
  registerImplementation(
    managerDeploy.id,
    implementations.metadata,
    'Metadata'
  );
  registerImplementation(managerDeploy.id, implementations.auction, 'Auction');
  registerImplementation(
    managerDeploy.id,
    implementations.governor,
    'Governor'
  );
  registerImplementation(
    managerDeploy.id,
    implementations.treasury,
    'Treasury'
  );

  // Set current implementations
  console.log('\n=== Setting Current Implementations ===\n');
  setCurrentImplementations(managerDeploy.id, implementations);

  // Write deployment artifact
  await writeDeployArtifact(
    managerDeploy.id,
    implementations,
    managerDeploy.txMetadata
  );

  console.log(`\n=== Manager Deployment Complete ===`);
  console.log(`MANAGER=${managerDeploy.id}`);
  console.log(`\nImplementations:`);
  console.log(`TOKEN_WASM=${implementations.token}`);
  console.log(`METADATA_WASM=${implementations.metadata}`);
  console.log(`AUCTION_WASM=${implementations.auction}`);
  console.log(`GOVERNOR_WASM=${implementations.governor}`);
  console.log(`TREASURY_WASM=${implementations.treasury}`);
}

await main();
