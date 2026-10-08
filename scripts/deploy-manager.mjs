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
const releaseManifestPath = 'releases/contracts.json';
if (!existsSync(releaseManifestPath)) {
  throw new Error(`Contract release manifest not found: ${releaseManifestPath}`);
}
const versions = JSON.parse(readFileSync(releaseManifestPath, 'utf8'));
const contractNames = ['manager', 'token', 'metadata', 'auction', 'governor', 'treasury', 'marketplace', 'minter'];
for (const name of contractNames) {
  if (typeof versions[name] !== 'string' || versions[name].trim() === '') {
    throw new Error(`Contract release manifest must define a version for ${name}`);
  }
}
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
  process.env.DEPLOY_IDENTITY?.trim() || `${networkName}-admin`;
const adminAddress = config.adminAddress;
const rpcUrl = config.rpcUrl;
const networkPassphrase = config.networkPassphrase;
const saltSuffix = process.env.DEPLOY_SALT_SUFFIX?.trim() ?? '';
const contractBuildDir = 'target/wasm32v1-none/release';
const deployArtifactPath = `deploys/${config.label}-${networkName}-manager.json`;
const sourceCommitResult = runQuiet('git', ['rev-parse', 'HEAD']);
const sourceCommit = sourceCommitResult.ok ? sourceCommitResult.stdout.trim() : null;

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

  // Retry up to 3 times with delays between attempts
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1) {
      console.log(`Retry attempt ${attempt}/3, waiting 5 seconds...`);
      // Wait 5 seconds between retries using busy-wait (compatible with ES modules)
      const endTime = Date.now() + 5000;
      while (Date.now() < endTime) {
        // Busy wait - simple and doesn't require imports
      }
    }

    const result = runQuiet('stellar', [
      'contract',
      'upload',
      '--wasm',
      wasmFile,
      '--source-account',
      identityName,
      '--network',
      networkName
    ]);

    if (result.ok) {
      console.log(`Installed ${packageName} WASM: ${hash}`);
      return hash;
    }

    // Check if already installed (success case)
    if (
      result.stderr.includes('already exists') ||
      result.stdout.includes(hash)
    ) {
      console.log(`WASM already installed: ${hash}`);
      return hash;
    }

    // Check if this is a retryable error
    lastError = result.stderr || result.stdout;
    if (
      lastError.includes('TxSorobanInvalid') ||
      lastError.includes('TxInsufficientFee') ||
      lastError.includes('timeout') ||
      lastError.includes('connection')
    ) {
      if (attempt < 3) {
        console.log(`Retryable error detected: ${lastError.split('\n')[0]}`);
        continue;
      }
    } else {
      // Non-retryable error, fail immediately
      console.error('Install output:', result.stdout);
      console.error('Install error:', result.stderr);
      throw new Error(`Failed to install ${packageName} WASM`);
    }
  }

  // All retries exhausted - log full error and throw
  console.error('Install error (final attempt output):');
  console.error('Full error output:', lastError);
  throw new Error(`Failed to install ${packageName} WASM after 3 attempts`);
}

// Contract code (WASM) entries are shared by every DAO deployed from the same hash, and rent for
// extending them is charged to whoever's transaction pushes the TTL up: measured on testnet, extending
// a 34 KB code entry to 170 days cost ~213 XLM (the first create_dao paid ~223 XLM, the second 2.5 XLM).
// OPT-IN: set EXTEND_CODE_TTL_DAYS (max 170; the network caps entries at max_entry_ttl, ~180 days) to have
// the platform operator pre-pay that rent here. Repeat before the code TTL runs out:
// `stellar contract extend --wasm-hash <hash> --ledgers-to-extend <ledgers>`. Budget accordingly:
// total rent scales with the sum of WASM sizes (~215 KB for all eight contracts).
const CODE_TTL_DAYS = Number(process.env.EXTEND_CODE_TTL_DAYS || 0);
const CODE_TTL_LEDGERS = Math.min(CODE_TTL_DAYS, 170) * 17280;

function extendCodeTtl(label, hash) {
  if (!(CODE_TTL_DAYS > 0)) {
    console.log(`Skipping ${label} code TTL extension (set EXTEND_CODE_TTL_DAYS to pre-pay shared code rent)`);
    return;
  }
  const result = runQuiet('stellar', [
    'contract',
    'extend',
    '--wasm-hash',
    hash,
    '--ledgers-to-extend',
    String(CODE_TTL_LEDGERS),
    '--durability',
    'persistent',
    '--source-account',
    identityName,
    '--network',
    networkName
  ]);
  if (result.ok) {
    console.log(`Extended ${label} code TTL to ~${Math.min(CODE_TTL_DAYS, 170)} days (${hash.slice(0, 12)}...)`);
  } else {
    console.warn(
      `WARNING: could not extend ${label} code TTL: ${(result.stderr || result.stdout).trim().split('\n').slice(-2).join(' ')}\n` +
        '  The contracts still work, but the first DAO creator will pay the code rent.'
    );
  }
}

function registerImplementation(managerAddress, wasmHash, name, version) {
  // register_implementation rejects an already-registered hash
  // (ImplementationAlreadyRegistered), so re-runs skip hashes that exist.
  const existing = runQuiet('stellar', [
    'contract', 'invoke', '--id', managerAddress, '--source-account', identityName,
    '--network', networkName, '--send', 'no', '--', 'get_implementation', '--wasm_hash', wasmHash
  ]);
  if (existing.ok) {
    const out = (existing.stdout + existing.stderr).replace(/\x1b\[[0-9;]*m/g, '').trim();
    if (out.split('\n').pop().trim() !== 'null') {
      console.log(`Implementation ${name} already registered (${wasmHash}), skipping`);
      return;
    }
  }
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
    version
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
    implementations.treasury,
    '--marketplace',
    implementations.marketplace
  ]);

  if (!result.ok) {
    console.error('Set current output:', result.stdout);
    console.error('Set current error:', result.stderr);
    throw new Error('Failed to set current implementations');
  }

  console.log('Current implementations set successfully');
}

function viewManager(managerAddress, method) {
  const result = runQuiet('stellar', [
    'contract', 'invoke', '--id', managerAddress, '--source-account', identityName,
    '--network', networkName, '--send', 'no', '--', method
  ]);
  if (!result.ok) throw new Error(`Failed to query Manager ${method}: ${result.stderr || result.stdout}`);
  return (result.stdout + result.stderr).replace(/\x1b\[[0-9;]*m/g, '').trim().split('\n').pop().replace(/"/g, '');
}

// Admin-only. launch_dao(enable_minter = true) grants mint authority to this address; without it
// launch fails with PlatformMinterNotSet (1008). Idempotent: skipped when already registered.
function setPlatformMinter(managerAddress, minterAddress) {
  const current = viewManager(managerAddress, 'get_platform_minter');
  if (current === minterAddress) {
    console.log(`Platform minter already set: ${minterAddress}`);
    return;
  }
  console.log(`Setting platform minter ${minterAddress}...`);
  const result = runQuiet('stellar', [
    'contract', 'invoke', '--id', managerAddress, '--source-account', identityName,
    '--network', networkName, '--', 'set_platform_minter', '--minter', minterAddress
  ]);
  if (!result.ok) {
    console.error('set_platform_minter output:', result.stdout);
    console.error('set_platform_minter error:', result.stderr);
    throw new Error('Failed to set platform minter');
  }
}

async function writeDeployArtifact(
  managerAddress,
  implementations,
  txMetadata,
  minterAddress
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
    minter: minterAddress,
    implementations,
    versions,
    sourceCommit,
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
  // Sequence: build -> deploy Manager(admin, current_hash, version) -> upload + register all module
  // implementations (+ Minter) -> set_current_implementations (six DAO modules) -> deploy shared Minter
  // (no constructor) -> set_platform_minter. Each step is idempotent, so re-running resumes.
  // Build all deployable contracts with the real deployable build (spec shaking v2 on).
  // The legacy SOROBAN_SDK_BUILD_SYSTEM_SUPPORTS_SPEC_SHAKING_V2=0 build embeds every unused
  // library type: WASMs are 2-4x larger (token ~138 KB) and exceed the network's 131072-byte
  // contract_max_size_bytes, so they cannot even be uploaded. Same command as `pnpm contracts:build`.
  run('stellar', ['contract', 'build']);

  ensureNetwork();
  ensureIdentity();

  // Deploy Manager contract
  console.log('\n=== Deploying Manager Contract ===\n');
  const managerWasmHash = wasmHash('manager');
  const managerDeploy = deployIfMissing(
    'manager',
    `dao-manager-${networkName}`,
    ['--admin', adminAddress, '--current_hash', managerWasmHash, '--version', versions.manager]
  );

  console.log(`Manager deployed: ${managerDeploy.id}`);

  // Install the Manager and all module implementation WASMs.
  console.log('\n=== Installing Implementation WASMs ===\n');
  const implementations = {
    manager: installWasm('manager'),
    token: installWasm('token'),
    metadata: installWasm('metadata'),
    auction: installWasm('auction'),
    governor: installWasm('governor'),
    treasury: installWasm('treasury'),
    marketplace: installWasm('marketplace'),
    minter: installWasm('minter')
  };

  // Register implementations with Manager
  console.log('\n=== Registering Implementations ===\n');
  if (implementations.manager !== managerWasmHash) {
    throw new Error('Installed Manager WASM hash does not match deployed Manager WASM hash');
  }
  registerImplementation(managerDeploy.id, implementations.manager, 'Manager', versions.manager);
  registerImplementation(managerDeploy.id, implementations.token, 'Token', versions.token);
  registerImplementation(
    managerDeploy.id,
    implementations.metadata,
    'Metadata',
    versions.metadata
  );
  registerImplementation(managerDeploy.id, implementations.auction, 'Auction', versions.auction);
  registerImplementation(
    managerDeploy.id,
    implementations.governor,
    'Governor',
    versions.governor
  );
  registerImplementation(
    managerDeploy.id,
    implementations.treasury,
    'Treasury',
    versions.treasury
  );
  registerImplementation(
    managerDeploy.id,
    implementations.marketplace,
    'Marketplace',
    versions.marketplace
  );
  registerImplementation(managerDeploy.id, implementations.minter, 'Minter', versions.minter);

  // Optionally pre-pay the shared contract-code rent (see extendCodeTtl): DAO creators then pay ~2.5 XLM, not ~223.
  console.log('\n=== Extending Shared Code TTL ===\n');
  for (const [label, hash] of Object.entries({
    Manager: implementations.manager,
    Token: implementations.token,
    Metadata: implementations.metadata,
    Auction: implementations.auction,
    Governor: implementations.governor,
    Treasury: implementations.treasury,
    Marketplace: implementations.marketplace,
    Minter: implementations.minter
  })) {
    extendCodeTtl(label, hash);
  }

  // Set current implementations
  console.log('\n=== Setting Current Implementations ===\n');
  setCurrentImplementations(managerDeploy.id, implementations);

  // Deploy shared Minter instance
  console.log('\n=== Deploying Shared Minter ===\n');
  const minterDeploy = deployIfMissing('minter', 'shared-minter', []);
  console.log(`Shared Minter deployed: ${minterDeploy.id}`);

  // Register it as the Manager's platform minter (needed for launch_config.enable_minter).
  console.log('\n=== Registering Platform Minter ===\n');
  setPlatformMinter(managerDeploy.id, minterDeploy.id);

  // Write deployment artifact
  await writeDeployArtifact(
    managerDeploy.id,
    implementations,
    managerDeploy.txMetadata,
    minterDeploy.id
  );

  console.log(`\n=== Manager Deployment Complete ===`);
  console.log(`MANAGER=${managerDeploy.id}`);
  console.log(`MINTER=${minterDeploy.id}`);
  console.log(`\nImplementations:`);
  console.log(`TOKEN_WASM=${implementations.token}`);
  console.log(`METADATA_WASM=${implementations.metadata}`);
  console.log(`AUCTION_WASM=${implementations.auction}`);
  console.log(`GOVERNOR_WASM=${implementations.governor}`);
  console.log(`TREASURY_WASM=${implementations.treasury}`);
  console.log(`MARKETPLACE_WASM=${implementations.marketplace}`);
  console.log(`MINTER_WASM=${implementations.minter}`);
}

await main();
