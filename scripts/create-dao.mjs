import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { runQuiet } from './lib.mjs';

const args = process.argv.slice(2);
const daoConfigPath = args[0];
const networkConfigPath = args[1];

if (!daoConfigPath || !networkConfigPath) {
  throw new Error('Usage: node scripts/create-dao.mjs <dao-config.json> <network-config.json>');
}

// Load DAO configuration
if (!existsSync(daoConfigPath)) {
  throw new Error(`DAO config file not found: ${daoConfigPath}`);
}
const daoConfig = JSON.parse(readFileSync(daoConfigPath, 'utf8'));

// Load network configuration (same as used for deploy-manager.mjs)
if (!existsSync(networkConfigPath)) {
  throw new Error(`Network config file not found: ${networkConfigPath}`);
}
const networkConfig = JSON.parse(readFileSync(networkConfigPath, 'utf8'));

const networkName = networkConfig.network;
const identityName = `${networkName}-dev`;
const managerArtifactPath = `deploys/${networkConfig.label}-${networkName}-manager.json`;

// Load Manager deployment artifact
if (!existsSync(managerArtifactPath)) {
  throw new Error(
    `Manager deployment artifact not found: ${managerArtifactPath}\n` +
    `Please run: node scripts/deploy-manager.mjs ${networkConfigPath}`
  );
}
const managerArtifact = JSON.parse(readFileSync(managerArtifactPath, 'utf8'));
const managerAddress = managerArtifact.manager;

// Validate DAO config
const required = [
  ['deployer', daoConfig.deployer],
  ['nonce', daoConfig.nonce],
  ['token.name', daoConfig.token?.name],
  ['token.symbol', daoConfig.token?.symbol],
  ['token.uri', daoConfig.token?.uri],
  ['metadata.projectUri', daoConfig.metadata?.projectUri],
  ['metadata.description', daoConfig.metadata?.description],
  ['metadata.contractImage', daoConfig.metadata?.contractImage],
  ['metadata.rendererBase', daoConfig.metadata?.rendererBase],
  ['auction.duration', daoConfig.auction?.duration],
  ['auction.reservePrice', daoConfig.auction?.reservePrice],
  ['auction.timeBuffer', daoConfig.auction?.timeBuffer],
  ['auction.paymentAsset', daoConfig.auction?.paymentAsset],
  ['governance.votingDelay', daoConfig.governance?.votingDelay],
  ['governance.votingPeriod', daoConfig.governance?.votingPeriod],
  ['governance.quorumBps', daoConfig.governance?.quorumBps],
  ['governance.proposalThresholdBps', daoConfig.governance?.proposalThresholdBps],
  ['launchAdmin', daoConfig.launchAdmin]
];

const missing = required.find(([, value]) => value === undefined || value === null);
if (missing) {
  throw new Error(`DAO config ${daoConfigPath} must define ${missing[0]}`);
}

// Predict DAO addresses before creation
console.log('\n=== Predicting DAO Addresses ===\n');
const predictResult = runQuiet('stellar', [
  'contract',
  'invoke',
  '--id',
  managerAddress,
  '--source-account',
  identityName,
  '--network',
  networkName,
  '--',
  'predict',
  '--creator',
  daoConfig.deployer,
  '--nonce',
  String(daoConfig.nonce)
]);

if (!predictResult.ok) {
  console.error('Predict output:', predictResult.stdout);
  console.error('Predict error:', predictResult.stderr);
  throw new Error('Failed to predict DAO addresses');
}

console.log('Predicted addresses:');
console.log(predictResult.stdout);

// Build founders array parameter
const foundersParam = daoConfig.founders && daoConfig.founders.length > 0
  ? `[${daoConfig.founders.map(f => `{"address":"${f.address}","amount":${f.amount}}`).join(',')}]`
  : '[]';

// Create the DAO
console.log('\n=== Creating DAO ===\n');
const createResult = runQuiet('stellar', [
  'contract',
  'invoke',
  '--id',
  managerAddress,
  '--source-account',
  identityName,
  '--network',
  networkName,
  '--',
  'create_dao',
  '--deployer',
  daoConfig.deployer,
  '--nonce',
  String(daoConfig.nonce),
  '--token_name',
  daoConfig.token.name,
  '--token_symbol',
  daoConfig.token.symbol,
  '--token_uri',
  daoConfig.token.uri,
  '--project_uri',
  daoConfig.metadata.projectUri,
  '--description',
  daoConfig.metadata.description,
  '--contract_image',
  daoConfig.metadata.contractImage,
  '--renderer_base',
  daoConfig.metadata.rendererBase,
  '--auction_duration',
  String(daoConfig.auction.duration),
  '--reserve_price',
  String(daoConfig.auction.reservePrice),
  '--time_buffer',
  String(daoConfig.auction.timeBuffer),
  '--payment_asset',
  daoConfig.auction.paymentAsset,
  '--voting_delay',
  String(daoConfig.governance.votingDelay),
  '--voting_period',
  String(daoConfig.governance.votingPeriod),
  '--quorum_bps',
  String(daoConfig.governance.quorumBps),
  '--proposal_threshold_bps',
  String(daoConfig.governance.proposalThresholdBps),
  '--founders',
  foundersParam,
  '--launch_admin',
  daoConfig.launchAdmin
]);

if (!createResult.ok) {
  console.error('Create DAO output:', createResult.stdout);
  console.error('Create DAO error:', createResult.stderr);
  throw new Error('Failed to create DAO');
}

console.log(createResult.stdout);
console.error(createResult.stderr);

// Parse the result to extract DAO addresses
// The stellar CLI returns the result in the output
const outputLines = (createResult.stdout + createResult.stderr).split('\n');
const addressesLine = outputLines.find(line => line.includes('DaoAddresses'));

// Write DAO creation artifact
const daoArtifactPath = `deploys/${networkConfig.label}-${networkName}-dao-${daoConfig.nonce}.json`;
const daoArtifact = {
  network: networkName,
  label: networkConfig.label,
  deployer: daoConfig.deployer,
  nonce: daoConfig.nonce,
  manager: managerAddress,
  config: daoConfig,
  createdAt: new Date().toISOString()
};

// Try to parse addresses from output
// Note: This is a best-effort extraction; the exact format depends on stellar CLI output
const txHashMatch = (createResult.stdout + createResult.stderr).match(/Signing transaction:\s*([a-f0-9]{64})/i);
if (txHashMatch) {
  daoArtifact.txHash = txHashMatch[1];
}

mkdirSync('deploys', { recursive: true });
writeFileSync(daoArtifactPath, `${JSON.stringify(daoArtifact, null, 2)}\n`);

console.log(`\n=== DAO Creation Complete ===`);
console.log(`Artifact saved to: ${daoArtifactPath}`);
console.log(`\nTo query DAO addresses:`);
console.log(`stellar contract invoke --id ${managerAddress} --source-account ${identityName} --network ${networkName} -- predict --creator ${daoConfig.deployer} --nonce ${daoConfig.nonce}`);
