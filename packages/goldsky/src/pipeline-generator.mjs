import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseDotEnv } from 'dotenv';

const moduleDir = dirname(fileURLToPath(import.meta.url));
export const packageRoot = resolve(moduleDir, '..');
export const repoRoot = resolve(packageRoot, '..', '..');
export const defaultTemplatePath = join(packageRoot, 'templates', 'builder-stellar-events.yaml.mustache');
export const defaultRawScriptPath = join(packageRoot, 'src', 'raw-events.script.js');
export const defaultDecodedScriptPath = join(packageRoot, 'src', 'decoded-events.script.js');
export const defaultScriptPath = join(packageRoot, 'src', 'activity-feed.script.js');
export const defaultOutputPath = join(packageRoot, 'pipelines', 'builder-stellar-events.yaml');
export const defaultEnvPaths = [join(packageRoot, '.env'), join(packageRoot, '.env.local')];

export function loadPackageEnv(env = process.env, envPaths = defaultEnvPaths) {
  const fileEnv = {};
  for (const envPath of envPaths) {
    if (!existsSync(envPath)) {
      continue;
    }
    Object.assign(fileEnv, parseDotEnv(readFileSync(envPath, 'utf8')));
  }

  return { ...fileEnv, ...env };
}

export function resolveDeploymentSelection(env = process.env) {
  const merged = loadPackageEnv(env);
  const configuredPath = merged.MANAGER_DEPLOYMENT_FILE;
  if (!configuredPath) {
    throw new Error('MANAGER_DEPLOYMENT_FILE is required');
  }
  const artifactPath = resolve(repoRoot, configuredPath);

  return { artifactPath };
}

export function resolvePostgresSecretName(env = process.env) {
  const merged = loadPackageEnv(env);
  return merged.GOLDSKY_POSTGRES_SECRET || merged.DAO_POSTGRES || 'DAO_POSTGRES';
}

export function loadDeploymentArtifact(selection = resolveDeploymentSelection()) {
  if (!existsSync(selection.artifactPath)) {
    throw new Error(`Deployment artifact not found: ${selection.artifactPath}`);
  }
  return JSON.parse(readFileSync(selection.artifactPath, 'utf8'));
}

export function indentBlock(text, spaces) {
  const indent = ' '.repeat(spaces);
   return text.trimEnd().split(/\r?\n/).map((line) => (line.trim() === '' ? '' : `${indent}${line}`)).join('\n');
}

export function renderTemplate(template, variables) {
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => {
    if (!(key in variables)) {
      throw new Error(`Missing template variable: ${key}`);
    }
    return String(variables[key]);
  });
}

function resolveStartAt(deployment) {
  const txLedgers = Object.values(deployment.transactions ?? {})
    .map((tx) => tx?.ledger)
    .filter((ledger) => Number.isFinite(ledger));

  const deploymentLedger = Number.isFinite(deployment.deploymentLedger) ? deployment.deploymentLedger : null;
  const startLedger = deploymentLedger ?? (txLedgers.length ? Math.min(...txLedgers) : null);

  if (startLedger === null) {
    throw new Error('Manager deployment artifact must define deploymentLedger or a transaction ledger');
  }
  return startLedger;
}

export function buildGoldskyPipelineYaml({ deployment, secretName, templateSource, scriptSource }) {
  const template = templateSource ?? readFileSync(defaultTemplatePath, 'utf8');
  const rawScript = readFileSync(defaultRawScriptPath, 'utf8');
  const decodedScript = readFileSync(defaultDecodedScriptPath, 'utf8');
  const script = scriptSource ?? readFileSync(defaultScriptPath, 'utf8');
  const managerContract = deployment.manager;
  if (!managerContract) {
    throw new Error('Deployment artifact must define manager');
  }
  const startAt = resolveStartAt(deployment);

  return renderTemplate(template, {
    PIPELINE_NAME: 'builder-stellar-events',
    RESOURCE_SIZE: 's',
    DESCRIPTION: `Index Manager ${managerContract} on ${deployment.network} with Goldsky Turbo`,
    DEPLOYMENT_ID: `manager:${managerContract}`,
    START_AT: startAt,
    DATASET_NAME: `stellar_${deployment.network}.events`,
    MANAGER_CONTRACT_ID: managerContract,
    RAW_EVENTS_SCRIPT: indentBlock(rawScript, 6),
    DECODED_EVENTS_SCRIPT: indentBlock(decodedScript, 6),
    ACTIVITY_SCRIPT: indentBlock(script, 6),
    POSTGRES_SECRET_NAME: secretName || 'DAO_POSTGRES'
  });
}

export function writeGoldskyPipeline({ env = process.env, outputPath = defaultOutputPath } = {}) {
  const selection = resolveDeploymentSelection(env);
  const deployment = loadDeploymentArtifact(selection);
  const secretName = resolvePostgresSecretName(env);
  const yaml = buildGoldskyPipelineYaml({ deployment, secretName });

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${yaml.trimEnd()}\n`);

  return {
    selection: { ...selection, network: deployment.network, label: deployment.label },
    deployment,
    secretName,
    outputPath,
    yaml
  };
}
