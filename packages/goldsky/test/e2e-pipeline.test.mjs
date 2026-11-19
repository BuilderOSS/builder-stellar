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

// The walkthrough suite's pipeline (decision E1, docs/qa/WALKTHROUGHS.md): same transforms as the
// public pipeline, but its own Manager, deployment id, name, file and database secret.
const PUBLIC_MANAGER = 'CCLBJAC5DM66J3TFQVZOZ3F4Q3TV4CZKBT5ZADRTE7BZPF3QAIEK72ZD';
const E2E_MANAGER = 'CDE2EWALKTHROUGHMANAGERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
const e2eEnv = parseDotEnv(readFileSync(join(packageRoot, 'e2e.env'), 'utf8'));
const deployment = { network: 'testnet', manager: E2E_MANAGER, deploymentLedger: 6_000_000 };

test('e2e.env names a separate pipeline, file and secret, and no credentials', () => {
  assert.equal(e2eEnv.MANAGER_DEPLOYMENT_FILE, 'deploys/e2e-walk-testnet-manager.json');
  assert.equal(e2eEnv.GOLDSKY_PIPELINE_NAME, 'builder-stellar-testnet-e2e');
  assert.equal(e2eEnv.GOLDSKY_PIPELINE_FILE, 'pipelines/builder-stellar-e2e-events.yaml');
  assert.notEqual(e2eEnv.GOLDSKY_POSTGRES_SECRET, 'BUILDER_POSTGRES_SECRET');
  assert.deepEqual(
    Object.keys(e2eEnv).sort(),
    ['GOLDSKY_PIPELINE_FILE', 'GOLDSKY_PIPELINE_NAME', 'GOLDSKY_POSTGRES_SECRET', 'MANAGER_DEPLOYMENT_FILE']
  );
});

test('GOLDSKY_ENV_FILE selects e2e.env instead of .env', () => {
  const merged = loadPackageEnv({ GOLDSKY_ENV_FILE: 'e2e.env' });
  assert.equal(merged.GOLDSKY_PIPELINE_NAME, 'builder-stellar-testnet-e2e');
  assert.equal(resolvePipelineOutputPath({ GOLDSKY_ENV_FILE: 'e2e.env' }), join(packageRoot, e2eEnv.GOLDSKY_PIPELINE_FILE));
  assert.equal(resolvePostgresSecretName({ GOLDSKY_ENV_FILE: 'e2e.env' }), e2eEnv.GOLDSKY_POSTGRES_SECRET);
  assert.throws(() => loadPackageEnv({ GOLDSKY_ENV_FILE: 'missing.env' }), /GOLDSKY_ENV_FILE not found/);
});

test('without GOLDSKY_PIPELINE_FILE the public pipeline file is unchanged', () => {
  assert.equal(resolvePipelineOutputPath({ GOLDSKY_ENV_FILE: '.env.example' }), defaultOutputPath);
});

test('the e2e pipeline indexes only the e2e Manager, under its own deployment id', () => {
  const yaml = buildGoldskyPipelineYaml({
    deployment,
    secretName: e2eEnv.GOLDSKY_POSTGRES_SECRET,
    pipelineName: resolvePipelineName(deployment, { GOLDSKY_PIPELINE_NAME: e2eEnv.GOLDSKY_PIPELINE_NAME })
  });
  assert.match(yaml, /^name: builder-stellar-testnet-e2e$/m);
  assert.match(yaml, new RegExp(`'manager:${E2E_MANAGER}' AS deployment_id`));
  assert.match(yaml, /start_at: 6000000/);
  assert.ok(!yaml.includes(PUBLIC_MANAGER), 'the e2e pipeline must not mention the public Manager');
  assert.ok(!yaml.includes('BUILDER_POSTGRES_SECRET'), 'the e2e pipeline must not write to the public database');

  // Same transforms and sinks as the public pipeline: only the Manager-specific values differ.
  const publicYaml = readFileSync(defaultOutputPath, 'utf8');
  const normalise = (text) =>
    text
      .replaceAll(PUBLIC_MANAGER, 'MANAGER')
      .replaceAll(E2E_MANAGER, 'MANAGER')
      .replace(/^name: .*$/m, 'name: X')
      .replace(/start_at: \d+/, 'start_at: N')
      .replace(/ledger_sequence >= \d+/, 'ledger_sequence >= N')
      .replaceAll('BUILDER_POSTGRES_SECRET', 'SECRET')
      .replaceAll(e2eEnv.GOLDSKY_POSTGRES_SECRET, 'SECRET');
  assert.equal(normalise(yaml).trimEnd(), normalise(publicYaml).trimEnd());
});
