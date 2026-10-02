import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { enrichTransactionMetadata, runQuiet } from './lib.mjs';

const args = process.argv.slice(2);
const phase = args[0];
const daoConfigPath = args[1];
const networkConfigPath = args[2];
const phases = ['create_dao', 'admin_checklist', 'launch_dao'];

if (!phases.includes(phase) || !daoConfigPath || !networkConfigPath) {
  throw new Error(
    'Usage: node scripts/deploy-dao.mjs <create_dao|admin_checklist|launch_dao> <dao-config.json> <network-config.json>'
  );
}

function loadJson(path, label) {
  if (!existsSync(path)) throw new Error(`${label} file not found: ${path}`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

const daoConfig = loadJson(daoConfigPath, 'DAO config');
const networkConfig = loadJson(networkConfigPath, 'Network config');
const networkName = networkConfig.network;
const identityName = process.env.DEPLOY_IDENTITY?.trim() || `${networkName}-admin`;
const managerArtifactPath = `deploys/${networkConfig.label}-${networkName}-manager.json`;
const daoArtifactPath = `deploys/${networkConfig.label}-${networkName}-dao-${daoConfig.nonce}.json`;

if (!existsSync(managerArtifactPath)) {
  throw new Error(
    `Manager deployment artifact not found: ${managerArtifactPath}\n` +
      `Please run: node scripts/deploy-manager.mjs ${networkConfigPath}`
  );
}

const managerArtifact = loadJson(managerArtifactPath, 'Manager deployment artifact');
if (managerArtifact.network !== networkName || managerArtifact.label !== networkConfig.label) {
  throw new Error(`Manager artifact ${managerArtifactPath} does not match ${networkName}/${networkConfig.label}`);
}
const managerAddress = managerArtifact.manager;
if (!managerAddress || !managerArtifact.implementations) {
  throw new Error(`Manager artifact ${managerArtifactPath} must contain manager and implementations`);
}

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
  ['metadata.artwork.ipfs.baseUri', daoConfig.metadata?.artwork?.ipfs?.baseUri],
  ['metadata.artwork.ipfs.extension', daoConfig.metadata?.artwork?.ipfs?.extension],
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
const missing = required.find(([, value]) => value === undefined || value === null || value === '');
if (missing) throw new Error(`DAO config ${daoConfigPath} must define ${missing[0]}`);

const artworkProperties = daoConfig.metadata.artwork.properties;
if (!Array.isArray(artworkProperties) || artworkProperties.length === 0 || artworkProperties.length > 16) {
  throw new Error('DAO artwork must define between 1 and 16 properties');
}
for (const [index, property] of artworkProperties.entries()) {
  if (!property.name || !Array.isArray(property.items) || property.items.length === 0) {
    throw new Error(`DAO artwork property ${index} must define a name and at least one item`);
  }
}
if (!Array.isArray(daoConfig.founders) || daoConfig.founders.length !== 3) {
  throw new Error('DAO config must define exactly three founders');
}

const marketplaceConfig = daoConfig.marketplace ?? {};
const queueDelay = daoConfig.governance.queueDelay ?? 300;
const marketplacePaymentAsset = marketplaceConfig.paymentAsset ?? daoConfig.auction.paymentAsset;
const listingCount = marketplaceConfig.primaryListingCount ?? 10;
const listingPrice = marketplaceConfig.primaryPrice ?? '10000000000';
const listingDuration = marketplaceConfig.primaryListingDuration ?? 30 * 24 * 60 * 60;
const resumeAdmin = process.env.DEPLOY_DAO_RESUME === '1';

function invoke(id, method, params = {}) {
  const result = runQuiet('stellar', [
    'contract', 'invoke', '--id', id, '--source-account', identityName,
    '--network', networkName, '--', method,
    ...Object.entries(params).flatMap(([name, value]) => [`--${name}`, typeof value === 'string' ? value : JSON.stringify(value)])
  ], { env: { ...process.env, STELLAR_NO_CACHE: 'true' } });
  if (!result.ok) {
    console.error(`${method} output:`, result.stdout);
    console.error(`${method} error:`, result.stderr);
    throw new Error(`Failed to invoke ${method}`);
  }
  return result.stdout + result.stderr;
}

function transaction(output, extra = {}) {
  const match = output.match(/Signing transaction:\s*([a-f0-9]{64})/i);
  if (!match) return null;
  try {
    return enrichTransactionMetadata({ txHash: match[1], ...extra }, networkName);
  } catch (error) {
    return { txHash: match[1], ...extra, ledgerError: error instanceof Error ? error.message : String(error) };
  }
}

function addressesFromOutput(output) {
  const normalized = output.replace(/\\"/g, '"');
  const aliases = {
    token: ['token', 'token_address'], metadata: ['metadata', 'metadata_address'],
    auction: ['auction', 'auction_address'], governor: ['governor', 'governor_address'],
    treasury: ['treasury', 'treasury_address'], marketplace: ['marketplace', 'marketplace_address']
  };
  function find(value) {
    if (!value || typeof value !== 'object') return null;
    const result = {};
    for (const [name, keys] of Object.entries(aliases)) {
      const key = keys.find((candidate) => typeof value[candidate] === 'string');
      if (key) result[name] = value[key];
    }
    if (Object.keys(result).length === Object.keys(aliases).length) return result;
    return Object.values(value).map(find).find(Boolean) ?? null;
  }
  for (const match of normalized.matchAll(/\{[^{}]*\}/g)) {
    try {
      const result = find(JSON.parse(match[0]));
      if (result) return result;
    } catch {
      // Ignore diagnostic objects printed by the Stellar CLI.
    }
  }
  return null;
}

function loadDaoArtifact() {
  if (!existsSync(daoArtifactPath)) {
    throw new Error(`DAO artifact not found: ${daoArtifactPath}. Run create_dao first.`);
  }
  const artifact = loadJson(daoArtifactPath, 'DAO artifact');
  if (!artifact.addresses?.token || !artifact.addresses.marketplace) {
    throw new Error(`DAO artifact ${daoArtifactPath} does not contain DAO addresses`);
  }
  return artifact;
}

function writeArtifact({ status, addresses, transactions = {}, error }) {
  const previous = existsSync(daoArtifactPath) ? loadJson(daoArtifactPath, 'DAO artifact') : {};
  const allTransactions = { ...(previous.transactions ?? {}), ...transactions };
  const ledgers = Object.values(allTransactions).flatMap((value) => Array.isArray(value) ? value : [value])
    .map((value) => value?.ledger).filter(Number.isFinite);
  const artifact = {
    ...previous, status, network: networkName, label: networkConfig.label,
    deployer: daoConfig.deployer, nonce: daoConfig.nonce, manager: managerAddress,
    addresses: addresses ?? previous.addresses ?? null, config: daoConfig,
    updatedAt: new Date().toISOString()
  };
  if (Object.keys(allTransactions).length > 0) artifact.transactions = allTransactions;
  if (ledgers.length > 0) artifact.deploymentLedger = Math.min(...ledgers);
  if (error) artifact.error = error instanceof Error ? error.message : String(error);
  mkdirSync('deploys', { recursive: true });
  writeFileSync(daoArtifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(`DAO artifact written to ${daoArtifactPath}`);
}

function initialConfig() {
  const u32 = (value) => ({ u32: Number(value) });
  const u64 = (value) => ({ u64: String(value) });
  const u128 = (value) => ({ u128: String(value) });
  const i128 = (value) => ({ i128: String(value) });
  return {
    token_name: daoConfig.token.name,
    token_symbol: daoConfig.token.symbol,
    token_uri: daoConfig.token.uri,
    project_uri: daoConfig.metadata.projectUri,
    description: daoConfig.metadata.description,
    contract_image: daoConfig.metadata.contractImage,
    renderer_base: daoConfig.metadata.rendererBase,
    governance: {
      voting_delay: u32(daoConfig.governance.votingDelay),
      voting_period: u32(daoConfig.governance.votingPeriod),
      queue_delay: u32(queueDelay),
      proposal_threshold: u128(daoConfig.governance.proposalThresholdBps),
      quorum_bps: u32(daoConfig.governance.quorumBps)
    },
    auction: {
      duration: u64(daoConfig.auction.duration),
      reserve_price: i128(daoConfig.auction.reservePrice),
      time_buffer: u64(daoConfig.auction.timeBuffer),
      payment_asset: daoConfig.auction.paymentAsset
    },
    marketplace: {
      payment_asset: marketplacePaymentAsset,
      secondary_fee_bps: u32(marketplaceConfig.secondaryFeeBps ?? 250)
    }
  };
}

let artifact;
let addresses;
let transactions = {};

if (phase === 'create_dao') {
  console.log('\n=== Creating DAO (paused, no members or listings) ===\n');
  const output = invoke(managerAddress, 'create_dao', {
    params: JSON.stringify({ deployer: daoConfig.deployer, nonce: { u64: String(daoConfig.nonce) }, launch_admin: daoConfig.launchAdmin, initial_config: initialConfig() })
  });
  addresses = addressesFromOutput(output);
  if (!addresses) throw new Error('DAO creation succeeded but DAO addresses could not be parsed');
  transactions.createDao = transaction(output);
  writeArtifact({ status: 'created', addresses, transactions });
  console.log('Create phase complete. Run admin_checklist next.');
  process.exit(0);
}

artifact = loadDaoArtifact();
addresses = artifact.addresses;

if (phase === 'admin_checklist') {
  console.log('\n=== Admin Checklist ===\n');

  if (!resumeAdmin) {
    const founderMints = [];
    for (const founder of daoConfig.founders) {
      let remaining = founder.amount;
      while (remaining > 0) {
        const amount = 1;
        const output = invoke(addresses.token, 'mint', {
          minter: daoConfig.launchAdmin,
          to: founder.address
        });
        founderMints.push(transaction(output, { address: founder.address, amount }));
        remaining -= amount;
      }
    }
    transactions.founderMints = founderMints;

    const names = artworkProperties.map(({ name }) => name);
    const items = artworkProperties.flatMap((property, propertyId) => property.items.map((name) => ({ property_id: propertyId, name, is_new_property: true })));
    transactions.addProperties = transaction(invoke(addresses.metadata, 'add_properties', {
      names: JSON.stringify(names), items: JSON.stringify(items), ipfs_group: JSON.stringify({ base_uri: daoConfig.metadata.artwork.ipfs.baseUri, extension: daoConfig.metadata.artwork.ipfs.extension })
    }));

    for (const [method, name, value] of [
      ['update_project_uri', 'new_project_uri', daoConfig.metadata.projectUri],
      ['update_description', 'new_description', daoConfig.metadata.description],
      ['update_contract_image', 'new_contract_image', daoConfig.metadata.contractImage],
      ['update_renderer_base', 'new_renderer_base', daoConfig.metadata.rendererBase]
    ]) transactions[name] = transaction(invoke(addresses.metadata, method, { [name]: value }));

    for (const [method, name, value] of [
      ['set_duration', 'duration', daoConfig.auction.duration],
      ['set_reserve_price', 'reserve_price', String(daoConfig.auction.reservePrice)],
      ['set_time_buffer', 'time_buffer', daoConfig.auction.timeBuffer],
      ['set_payment_token', 'payment_token', daoConfig.auction.paymentAsset]
    ]) transactions[name] = transaction(invoke(addresses.auction, method, { [name]: value }));

    console.log('Governance configuration:', JSON.stringify({ ...daoConfig.governance, queueDelay }, null, 2));
    console.log('Marketplace configuration:', JSON.stringify({ paymentAsset: marketplacePaymentAsset, secondaryFeeBps: marketplaceConfig.secondaryFeeBps ?? 250 }, null, 2));
    invoke(addresses.token, 'set_mint_authority', { authority: addresses.marketplace, enabled: true });
    invoke(addresses.marketplace, 'set_payment_asset', { payment_asset: marketplacePaymentAsset });
    invoke(addresses.marketplace, 'set_secondary_fee_bps', { fee_bps: marketplaceConfig.secondaryFeeBps ?? 250 });
    invoke(addresses.marketplace, 'unpause');
  }

  const listings = [];
  const expiresAt = Math.floor(Date.now() / 1000) + listingDuration;
  let nextTokenId = daoConfig.founders.reduce((total, founder) => total + founder.amount, 0);
  let remainingListings = listingCount;
  while ((!resumeAdmin || process.env.DEPLOY_DAO_RESUME_MINT === '1') && remainingListings > 0) {
    const amount = 1;
    invoke(addresses.token, 'mint', {
      minter: daoConfig.launchAdmin,
      to: daoConfig.launchAdmin
    });
    remainingListings -= amount;
  }
  for (let index = 0; index < listingCount; index += 1) {
    invoke(addresses.token, 'approve', {
      owner: daoConfig.launchAdmin,
      spender: addresses.marketplace,
      token_id: nextTokenId + index,
      expiration_ledger: 5100000
    });
    const output = invoke(addresses.marketplace, 'list', {
      token_id: nextTokenId + index,
      seller: daoConfig.launchAdmin,
      price: String(listingPrice),
      expires_at: expiresAt
    });
    listings.push(transaction(output, { tokenId: nextTokenId + index, price: String(listingPrice), expiresAt }));
  }
  transactions.marketplaceListings = listings;
  writeArtifact({ status: 'checklist_complete', addresses, transactions });
  console.log(`Admin checklist complete: ${listingCount} marketplace tokens listed at ${listingPrice} stroops each.`);
  console.log('Review the artifact and run launch_dao when ready.');
  process.exit(0);
}

console.log('\n=== Launching DAO (auctions and marketplace enabled) ===\n');
const launchOutput = invoke(managerAddress, 'launch_dao', {
  token_address: addresses.token,
  launch_config: JSON.stringify({ launch_auction: true, launch_marketplace: true })
});
transactions.launchDao = transaction(launchOutput);
writeArtifact({ status: 'operational', addresses, transactions });
console.log('DAO launch complete. Auctions and marketplace are enabled.');
