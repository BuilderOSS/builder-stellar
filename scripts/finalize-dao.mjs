import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { enrichTransactionMetadata, runQuiet } from './lib.mjs';

const [daoArtifactPath, networkConfigPath] = process.argv.slice(2);
if (!daoArtifactPath || !networkConfigPath) {
  throw new Error('Usage: node scripts/finalize-dao.mjs <dao-artifact.json> <network-config.json>');
}
if (!existsSync(daoArtifactPath) || !existsSync(networkConfigPath)) {
  throw new Error('DAO artifact or network config not found');
}

const artifact = JSON.parse(readFileSync(daoArtifactPath, 'utf8'));
const network = JSON.parse(readFileSync(networkConfigPath, 'utf8'));
const managerArtifactPath = `deploys/${network.label}-${network.network}-manager.json`;
const manager = JSON.parse(readFileSync(managerArtifactPath, 'utf8')).manager;
const identity = process.env.DAO_DEPLOY_IDENTITY?.trim() || `${network.network}-dev`;

const result = runQuiet('stellar', [
  'contract', 'invoke', '--id', manager, '--source-account', identity,
  '--network', network.network, '--', 'finalize_dao', '--token_address', artifact.addresses.token
]);
const output = result.stdout + result.stderr;
if (!result.ok) {
  throw new Error(`DAO finalization failed: ${result.stderr || result.stdout}`);
}

const match = output.match(/Signing transaction:\s*([a-f0-9]{64})/i);
artifact.status = 'operational';
artifact.transactions = artifact.transactions || {};
if (match) artifact.transactions.finalizeDao = enrichTransactionMetadata({ txHash: match[1] }, network.network);
writeFileSync(daoArtifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(`DAO finalized: ${daoArtifactPath}`);
