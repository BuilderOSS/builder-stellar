import { writeFileSync } from 'node:fs';
import { run, runQuiet } from './lib.mjs';

const containerName = 'stellar-builder-local';
const requestedContainerName = 'builder-local';
const configPath = 'configs/local-manager.json';
const identityName = process.env.DEPLOY_IDENTITY?.trim() || 'local-admin';

function ensureContainer() {
  const running = runQuiet('docker', ['inspect', '-f', '{{.State.Running}}', containerName]);
  if (running.ok && running.stdout.trim() === 'true') {
    return;
  }

  if (running.ok && running.stdout.trim() === 'false') {
    run('docker', ['start', containerName]);
    return;
  }

  const started = runQuiet('stellar', [
    'container',
    'start',
    'local',
    '--name',
    requestedContainerName,
    '--ports-mapping',
    '8000:8000'
  ]);
  if (started.ok) {
    return;
  }

  const stderr = `${started.stderr}\n${started.stdout}`.trim();
  if (stderr.includes('already running')) {
    return;
  }

  throw new Error(stderr || 'Failed to start local Stellar container on port 8000');
}

ensureContainer();

// Manager config for the local network. The admin is the local identity, so the file is generated.
runQuiet('stellar', ['keys', 'generate', identityName]);
const address = runQuiet('stellar', ['keys', 'address', identityName]).stdout.trim();
if (!address) throw new Error(`Could not resolve address for identity ${identityName}`);
writeFileSync(configPath, `${JSON.stringify({
  network: 'local',
  label: 'builder',
  adminAddress: address,
  rpcUrl: 'http://localhost:8000/soroban/rpc',
  networkPassphrase: 'Standalone Network ; February 2017'
}, null, 2)}\n`);

// Deploys Manager, registers implementations, sets current implementations and the platform minter.
run('node', ['scripts/deploy-manager.mjs', configPath, '--force'], {
  env: { ...process.env, DEPLOY_IDENTITY: identityName }
});
console.log('\nLocal Manager is ready. Next: copy configs/testnet-builder-dao.json, set deployer/launchAdmin/founders to the');
console.log(`${identityName} address (${address}) and a local payment asset contract, then run`);
console.log(`DEPLOY_IDENTITY=${identityName} node scripts/deploy-dao.mjs create_dao <dao.json> ${configPath}  (then admin_checklist, launch_dao)`);
