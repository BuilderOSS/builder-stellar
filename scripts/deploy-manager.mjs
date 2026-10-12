import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import readline from 'node:readline/promises';
import {
  DEFAULT_CODE_TTL_DAYS,
  LEDGERS_PER_DAY,
  enrichTransactionMetadata,
  extendWithinFeeCap,
  parseCodeTtlDays,
  run,
  runQuiet
} from './lib.mjs';

const args = process.argv.slice(2);
const force = args.includes('--force');
const configPath = args.find((arg) => arg !== '--force');

if (!configPath) {
  throw new Error('Usage: node scripts/deploy-manager.mjs <config.json> [--force]');
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
const missingConfig = requiredConfig.find(([, value]) => value === undefined || value === null || value === '');
if (missingConfig) {
  throw new Error(`Manager config ${configPath} must define ${missingConfig[0]}`);
}
if (!['local', 'testnet', 'mainnet'].includes(config.network)) {
  throw new Error(`Manager config ${configPath} must define network as local, testnet, or mainnet`);
}
const networkName = config.network;
const identityName = process.env.DEPLOY_IDENTITY?.trim() || `${networkName}-admin`;
const adminAddress = config.adminAddress;
const rpcUrl = config.rpcUrl;
const networkPassphrase = config.networkPassphrase;
const saltSuffix = process.env.DEPLOY_SALT_SUFFIX?.trim() ?? '';
const contractBuildDir = 'target/wasm32v1-none/release';
const deployArtifactPath = `deploys/${config.label}-${networkName}-manager.json`;
// Platform upgrade notice: ledgers between a Manager approval and the earliest upgrade of the Manager
// itself or the shared Minter. Every DAO depends on both (registry, factory, mint authority), so the
// notice is what lets a DAO react before a hostile upgrade lands. 7 days (120,960 ledgers) on a public
// network; `upgradeDelayLedgers` in the network config shortens it for testnet. The admin can change
// it later with set_upgrade_delay on each contract (a reduction waits out the notice in force).
const upgradeDelay = Number(config.upgradeDelayLedgers ?? 7 * LEDGERS_PER_DAY);
if (!Number.isInteger(upgradeDelay) || upgradeDelay < 0) {
  throw new Error(`upgradeDelayLedgers must be a non-negative integer, got ${config.upgradeDelayLedgers}`);
}
const sourceCommitResult = runQuiet('git', ['rev-parse', 'HEAD']);
const sourceCommit = sourceCommitResult.ok ? sourceCommitResult.stdout.trim() : null;

async function confirmOverwrite(filePath) {
  if (force || !existsSync(filePath)) {
    return true;
  }

  if (!process.stdin.isTTY) {
    throw new Error(`Refusing to overwrite ${filePath} without --force in non-interactive mode`);
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
  runQuiet('stellar', ['network', 'add', networkName, '--rpc-url', rpcUrl, '--network-passphrase', networkPassphrase]);
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
  const exists = runQuiet('stellar', ['contract', 'fetch', '--id', id, '--network', networkName]);

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
    if (result.stderr.includes('already exists') || result.stdout.includes(hash)) {
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

// Contract code (WASM) entries are shared by every DAO deployed from the same hash. New code is born at the
// network minimum (~7 days) and contracts only bump their own code a few days (`common::ttl`), so the
// platform extends every uploaded hash to 170 days here (docs/STORAGE_DIET.md D28) and renews it with
// `node scripts/renew-code-ttl.mjs <artifact>`. EXTEND_CODE_TTL_DAYS overrides the lifetime; values at or
// below the 4 days contracts bump code to are refused (the next caller would pay again).
const CODE_TTL_DAYS = parseCodeTtlDays(process.env.EXTEND_CODE_TTL_DAYS || DEFAULT_CODE_TTL_DAYS);

function extendCodeTtl(label, hash) {
  // Simulated first and stepped when one extension would come close to the u32 fee cap.
  try {
    const steps = extendWithinFeeCap(['--wasm-hash', hash], CODE_TTL_DAYS, {
      network: networkName,
      source: identityName
    });
    const detail = steps.map((s) => `${s.days} d for ${(Number(s.fee) / 1e7).toFixed(2)} XLM`).join(', then ');
    console.log(`Extended ${label} code (${hash.slice(0, 12)}...): ${detail}`);
  } catch (e) {
    console.warn(
      `WARNING: could not extend ${label} code TTL: ${e.message.split('\n').slice(-2).join(' ')}\n` +
        '  Re-run, or run scripts/renew-code-ttl.mjs: until then the code is at the network minimum.'
    );
  }
}

// Registry records are write-once (no rename, re-version or un-revoke), so a wrong
// name/version for a hash can never be corrected. Verify before and after registering.
function readImplementation(managerAddress, wasmHash) {
  const r = runQuiet('stellar', [
    'contract',
    'invoke',
    '--id',
    managerAddress,
    '--source-account',
    identityName,
    '--network',
    networkName,
    '--send',
    'no',
    '--',
    'get_implementation',
    '--wasm_hash',
    wasmHash
  ]);
  if (!r.ok) return { ok: false };
  const out = (r.stdout + r.stderr).replace(/\x1b\[[0-9;]*m/g, '').trim();
  const last = out.split('\n').pop().trim();
  if (last === 'null') return { ok: true, record: null };
  try {
    return { ok: true, record: JSON.parse(last) };
  } catch {
    throw new Error(`Could not parse get_implementation output for ${wasmHash}: ${last}`);
  }
}

function assertImplementationMatches(record, wasmHash, name, version, when) {
  if (record && record.name === name && record.version === version) return;
  throw new Error(
    `Registry record for ${wasmHash} ${when} has name=${record?.name} version=${record?.version}, ` +
      `expected name=${name} version=${version}. Registration is write-once and un-revoking is ` +
      'impossible, so this cannot be corrected on this Manager. Do NOT continue: deploy a fresh ' +
      'Manager (or rebuild the WASM so it has a different hash) and re-run.'
  );
}

function registerImplementation(managerAddress, wasmHash, name, version) {
  // register_implementation rejects an already-registered hash
  // (ImplementationAlreadyRegistered), so re-runs skip hashes that exist.
  const existing = readImplementation(managerAddress, wasmHash);
  if (existing.ok && existing.record) {
    assertImplementationMatches(existing.record, wasmHash, name, version, 'already on-chain');
    console.log(`Implementation ${name} already registered (${wasmHash}), skipping`);
    setLatestImplementation(managerAddress, wasmHash, name);
    return;
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

  const after = readImplementation(managerAddress, wasmHash);
  if (!after.ok) throw new Error(`Could not read back ${name} implementation ${wasmHash} after registering`);
  assertImplementationMatches(after.record, wasmHash, name, version, 'after registration');
  console.log(`Registered ${name} implementation`);
  setLatestImplementation(managerAddress, wasmHash, name);
}

// Registration does not move the "latest" pointer; select it explicitly (idempotent).
function setLatestImplementation(managerAddress, wasmHash, name) {
  const r = runQuiet('stellar', [
    'contract',
    'invoke',
    '--id',
    managerAddress,
    '--source-account',
    identityName,
    '--network',
    networkName,
    '--send',
    'no',
    '--',
    'get_latest_implementation',
    '--name',
    name
  ]);
  const last = r.ok
    ? (r.stdout + r.stderr)
        .replace(/\x1b\[[0-9;]*m/g, '')
        .trim()
        .split('\n')
        .pop()
        .trim()
    : 'null';
  if (last !== 'null') {
    try {
      if (JSON.parse(last).wasm_hash === wasmHash) {
        console.log(`Latest ${name} implementation already ${wasmHash}, skipping`);
        return;
      }
    } catch {
      // fall through and set it
    }
  }
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
    'set_latest_implementation',
    '--name',
    name,
    '--wasm_hash',
    wasmHash
  ]);
  if (!result.ok) {
    console.error('set_latest_implementation output:', result.stdout);
    console.error('set_latest_implementation error:', result.stderr);
    throw new Error(`Failed to set the latest ${name} implementation`);
  }
  console.log(`Latest ${name} implementation set to ${wasmHash}`);
}

// NOTE: security decisions must use get_implementation(hash) and the Current* hashes,
// never get_latest_implementation(name): it returns None once the selected hash is revoked.

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
    'contract',
    'invoke',
    '--id',
    managerAddress,
    '--source-account',
    identityName,
    '--network',
    networkName,
    '--send',
    'no',
    '--',
    method
  ]);
  if (!result.ok) throw new Error(`Failed to query Manager ${method}: ${result.stderr || result.stdout}`);
  return (result.stdout + result.stderr)
    .replace(/\x1b\[[0-9;]*m/g, '')
    .trim()
    .split('\n')
    .pop()
    .replace(/"/g, '');
}

// Admin-only. Every launch_dao pins and grants mint authority to this address (LaunchConfig.minter);
// without it launch fails with PlatformMinterNotSet. Idempotent: skipped when already registered.
function setPlatformMinter(managerAddress, minterAddress) {
  const current = viewManager(managerAddress, 'get_platform_minter');
  if (current === minterAddress) {
    console.log(`Platform minter already set: ${minterAddress}`);
    return;
  }
  console.log(`Setting platform minter ${minterAddress}...`);
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
    'set_platform_minter',
    '--minter',
    minterAddress
  ]);
  if (!result.ok) {
    console.error('set_platform_minter output:', result.stdout);
    console.error('set_platform_minter error:', result.stderr);
    throw new Error('Failed to set platform minter');
  }
}

async function writeDeployArtifact(managerAddress, implementations, txMetadata, minterAddress) {
  if (!(await confirmOverwrite(deployArtifactPath))) {
    console.log(`Skipped writing ${deployArtifactPath}.`);
    return;
  }

  const existingArtifact = existsSync(deployArtifactPath) ? JSON.parse(readFileSync(deployArtifactPath, 'utf8')) : null;
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
      : (existingArtifact?.deploymentLedger ?? null),
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
  // implementations (+ Minter) -> extend all code to 170 days -> set_current_implementations (six DAO
  // modules) -> deploy shared Minter(manager, current_hash) -> set_platform_minter. Each step is
  // idempotent, so re-running resumes.
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
  const managerDeploy = deployIfMissing('manager', `dao-manager-${networkName}`, [
    '--admin',
    adminAddress,
    '--current_hash',
    managerWasmHash,
    '--version',
    versions.manager,
    '--upgrade_delay',
    String(upgradeDelay)
  ]);

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
  registerImplementation(managerDeploy.id, implementations.metadata, 'Metadata', versions.metadata);
  registerImplementation(managerDeploy.id, implementations.auction, 'Auction', versions.auction);
  registerImplementation(managerDeploy.id, implementations.governor, 'Governor', versions.governor);
  registerImplementation(managerDeploy.id, implementations.treasury, 'Treasury', versions.treasury);
  registerImplementation(managerDeploy.id, implementations.marketplace, 'Marketplace', versions.marketplace);
  registerImplementation(managerDeploy.id, implementations.minter, 'Minter', versions.minter);

  // Pre-pay the shared contract-code rent (see extendCodeTtl): callers never pay to extend shared code.
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
  const minterDeploy = deployIfMissing('minter', 'shared-minter', [
    '--manager',
    managerDeploy.id,
    '--current_hash',
    implementations.minter,
    '--upgrade_delay',
    String(upgradeDelay)
  ]);
  console.log(`Minter upgrade notice: ${upgradeDelay} ledgers (~${(upgradeDelay / LEDGERS_PER_DAY).toFixed(2)} days)`);
  console.log(`Shared Minter deployed: ${minterDeploy.id}`);

  // Register it as the Manager's platform minter (every launch pins it).
  console.log('\n=== Registering Platform Minter ===\n');
  setPlatformMinter(managerDeploy.id, minterDeploy.id);

  // Write deployment artifact
  await writeDeployArtifact(managerDeploy.id, implementations, managerDeploy.txMetadata, minterDeploy.id);

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
