import { run, runQuiet } from './lib.mjs';

const containerName = 'stellar-nouns-builder-local';
const requestedContainerName = 'nouns-builder-local';
const configPath = 'configs/local.json';

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
run('node', ['scripts/deploy-contracts.mjs', configPath, '--force']);
