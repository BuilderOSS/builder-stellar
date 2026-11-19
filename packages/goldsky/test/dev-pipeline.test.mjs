import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { parse as parseDotEnv } from 'dotenv';

import {
  buildGoldskyPipelineYaml,
  defaultOutputPath,
  loadPackageEnv,
  packageRoot,
  resolvePipelineName,
  resolvePipelineOutputPath,
  resolvePostgresSecretName
} from '../src/pipeline-generator.mjs';

// The dev.tribes.build pipeline (docs/DEV_DEPLOYMENT.md): same transforms as the
// public pipeline, but its own Manager, deployment id, name, file and database secret.
const PUBLIC_MANAGER = 'CCLBJAC5DM66J3TFQVZOZ3F4Q3TV4CZKBT5ZADRTE7BZPF3QAIEK72ZD';
const DEV_MANAGER = 'CDDEVTRIBESBUILDMANAGERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
const devEnv = parseDotEnv(readFileSync(join(packageRoot, 'dev.env'), 'utf8'));
const deployment = { network: 'testnet', manager: DEV_MANAGER, deploymentLedger: 6_000_000 };

test('dev.env names a separate pipeline, file and secret, and no credentials', () => {
  assert.equal(devEnv.MANAGER_DEPLOYMENT_FILE, 'deploys/dev-testnet-manager.json');
  assert.equal(devEnv.GOLDSKY_PIPELINE_NAME, 'builder-stellar-testnet-dev');
  assert.equal(devEnv.GOLDSKY_PIPELINE_FILE, 'pipelines/builder-stellar-dev-events.yaml');
  assert.notEqual(devEnv.GOLDSKY_POSTGRES_SECRET, 'BUILDER_POSTGRES_SECRET');
  assert.deepEqual(
    Object.keys(devEnv).sort(),
    ['GOLDSKY_PIPELINE_FILE', 'GOLDSKY_PIPELINE_NAME', 'GOLDSKY_POSTGRES_SECRET', 'MANAGER_DEPLOYMENT_FILE']
  );
});

test('GOLDSKY_ENV_FILE selects dev.env instead of .env', () => {
  const merged = loadPackageEnv({ GOLDSKY_ENV_FILE: 'dev.env' });
  assert.equal(merged.GOLDSKY_PIPELINE_NAME, 'builder-stellar-testnet-dev');
  assert.equal(resolvePipelineOutputPath({ GOLDSKY_ENV_FILE: 'dev.env' }), join(packageRoot, devEnv.GOLDSKY_PIPELINE_FILE));
  assert.equal(resolvePostgresSecretName({ GOLDSKY_ENV_FILE: 'dev.env' }), devEnv.GOLDSKY_POSTGRES_SECRET);
  assert.throws(() => loadPackageEnv({ GOLDSKY_ENV_FILE: 'missing.env' }), /GOLDSKY_ENV_FILE not found/);
});

test('without GOLDSKY_PIPELINE_FILE the public pipeline file is unchanged', () => {
  assert.equal(resolvePipelineOutputPath({ GOLDSKY_ENV_FILE: '.env.example' }), defaultOutputPath);
});

test('the dev pipeline indexes only the dev Manager, under its own deployment id', () => {
  const yaml = buildGoldskyPipelineYaml({
    deployment,
    secretName: devEnv.GOLDSKY_POSTGRES_SECRET,
    pipelineName: resolvePipelineName(deployment, { GOLDSKY_PIPELINE_NAME: devEnv.GOLDSKY_PIPELINE_NAME })
  });
  assert.match(yaml, /^name: builder-stellar-testnet-dev$/m);
  assert.match(yaml, new RegExp(`'manager:${DEV_MANAGER}' AS deployment_id`));
  assert.match(yaml, /start_at: 6000000/);
  assert.ok(!yaml.includes(PUBLIC_MANAGER), 'the dev pipeline must not mention the public Manager');
  assert.ok(!yaml.includes('BUILDER_POSTGRES_SECRET'), 'the dev pipeline must not write to the public database');

  // Same transforms and sinks as the public pipeline: only the Manager-specific values differ.
  const publicYaml = readFileSync(defaultOutputPath, 'utf8');
  const normalise = (text) =>
    text
      .replaceAll(PUBLIC_MANAGER, 'MANAGER')
      .replaceAll(DEV_MANAGER, 'MANAGER')
      .replace(/^name: .*$/m, 'name: X')
      .replace(/start_at: \d+/, 'start_at: N')
      .replace(/ledger_sequence >= \d+/, 'ledger_sequence >= N')
      .replaceAll('BUILDER_POSTGRES_SECRET', 'SECRET')
      .replaceAll(devEnv.GOLDSKY_POSTGRES_SECRET, 'SECRET');
  assert.equal(normalise(yaml).trimEnd(), normalise(publicYaml).trimEnd());
});
