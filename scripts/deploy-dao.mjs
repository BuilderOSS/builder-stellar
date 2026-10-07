import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { enrichTransactionMetadata, runQuiet } from './lib.mjs';

const args = process.argv.slice(2);
const phase = args[0];
const daoConfigPath = args[1];
const networkConfigPath = args[2];
const phases = ['create_dao', 'admin_checklist', 'launch_dao', 'deploy_minter', 'batch_mint'];

if (!phases.includes(phase) || !daoConfigPath || !networkConfigPath) {
  throw new Error(
    'Usage: node scripts/deploy-dao.mjs <create_dao|admin_checklist|launch_dao|deploy_minter|batch_mint> <dao-config.json> <network-config.json>'
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
if (!managerArtifact.versions) {
  throw new Error(`Manager artifact ${managerArtifactPath} must contain release versions`);
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
const maxBatchMint = 100;
const maxBatchMintRecipients = 16;
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
const founderTotal = daoConfig.founders.reduce((total, founder) => {
  if (!Number.isInteger(founder.amount) || founder.amount <= 0) {
    throw new Error('DAO founder amounts must be positive integers');
  }
  return total + founder.amount;
}, 0);
if (daoConfig.founders.length > maxBatchMintRecipients || founderTotal > maxBatchMint) {
  throw new Error(`DAO founder allocations must fit batch_mint_many limits (${maxBatchMint} tokens, ${maxBatchMintRecipients} recipients)`);
}

const marketplaceConfig = daoConfig.marketplace ?? {};
const queueDelay = daoConfig.governance.queueDelay ?? 300;
const marketplacePaymentAsset = marketplaceConfig.paymentAsset ?? daoConfig.auction.paymentAsset;
const listingCount = marketplaceConfig.primaryListingCount ?? 10;
const listingPrice = marketplaceConfig.primaryPrice ?? '10000000000';
const listingDuration = marketplaceConfig.primaryListingDuration ?? 30 * 24 * 60 * 60;

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

function invokeView(id, method, params = {}) {
  const result = runQuiet('stellar', [
    'contract', 'invoke', '--id', id, '--source-account', identityName,
    '--network', networkName, '--send', 'no', '--', method,
    ...Object.entries(params).flatMap(([name, value]) => [`--${name}`, typeof value === 'string' ? value : JSON.stringify(value)])
  ], { env: { ...process.env, STELLAR_NO_CACHE: 'true' } });
  if (!result.ok) throw new Error(`Failed to query ${method}: ${result.stderr || result.stdout}`);
  const output = (result.stdout + result.stderr).replace(/\x1b\[[0-9;]*m/g, '').trim();
  const json = output.match(/(\{.*\}|\[.*\])\s*$/s)?.[1];
  if (json) {
    try {
      return JSON.parse(json);
    } catch {
      // Fall through to scalar parsing.
    }
  }
  const value = output.match(/(?:^|\n)"?(true|false|-?\d+)"?\s*$/i)?.[1];
  if (value === undefined) throw new Error(`Could not parse ${method} result: ${output}`);
  return value === 'true' ? true : value === 'false' ? false : Number(value);
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

function deployIfMissing(contractName, alias, initArgs = []) {
  const saltSuffix = process.env.DEPLOY_SALT_SUFFIX?.trim() ?? '';
  const contractBuildDir = 'target/wasm32v1-none/release';

  function wasmHash(packageName) {
    const wasmFile = `${contractBuildDir}/${packageName}.wasm`;
    return createHash('sha256')
      .update(readFileSync(wasmFile))
      .digest('hex');
  }

  function saltFor(packageName) {
    const hash = wasmHash(packageName);
    const seed = saltSuffix
      ? `dao-minter:${networkConfig.label}:${networkName}:${packageName}:${hash}:${saltSuffix}`
      : `dao-minter:${networkConfig.label}:${networkName}:${packageName}:${hash}`;
    return createHash('sha256').update(seed).digest('hex');
  }

  function contractId(packageName) {
    const result = runQuiet('stellar', [
      'contract', 'id', 'wasm',
      '--salt', saltFor(packageName),
      '--source-account', identityName,
      '--network', networkName
    ]);
    return result.stdout.trim();
  }

  const id = contractId(contractName);
  const exists = runQuiet('stellar', [
    'contract', 'fetch',
    '--id', id,
    '--network', networkName
  ]);

  let txMetadata = null;
  if (!exists.ok) {
    const wasmPath = `${contractBuildDir}/${contractName}.wasm`;
    const result = runQuiet('stellar', [
      'contract', 'deploy',
      '--alias', alias,
      '--wasm', wasmPath,
      '--source-account', identityName,
      '--network', networkName,
      '--salt', saltFor(contractName),
      '--', ...initArgs
    ]);

    if (!result.ok) {
      console.error('Deploy output:', result.stdout);
      console.error('Deploy error:', result.stderr);
      throw new Error(`Failed to deploy ${contractName}`);
    }

    console.log(result.stdout);
    console.error(result.stderr);

    const output = result.stdout + result.stderr;
    const txHashMatch = output.match(/Signing transaction:\s*([a-f0-9]{64})/i);

    txMetadata = { deployedAt: new Date().toISOString() };
    if (txHashMatch) {
      txMetadata.txHash = txHashMatch[1];
    }
  }

  return { id, txMetadata };
}

function writeArtifact({ status, addresses, transactions = {}, error, replaceTransactions = false }) {
  const previous = existsSync(daoArtifactPath) ? loadJson(daoArtifactPath, 'DAO artifact') : {};
  const allTransactions = replaceTransactions
    ? transactions
    : { ...(previous.transactions ?? {}), ...transactions };
  const ledgers = Object.values(allTransactions).flatMap((value) => Array.isArray(value) ? value : [value])
    .map((value) => value?.ledger).filter(Number.isFinite);
  const artifact = {
    ...previous, status, network: networkName, label: networkConfig.label,
    deployer: daoConfig.deployer, nonce: daoConfig.nonce, manager: managerAddress,
    versions: managerArtifact.versions,
    sourceCommit: managerArtifact.sourceCommit ?? null,
    addresses: addresses ?? previous.addresses ?? null, config: daoConfig,
    updatedAt: new Date().toISOString()
  };
  if (Object.keys(allTransactions).length > 0) artifact.transactions = allTransactions;
  if (ledgers.length > 0) artifact.deploymentLedger = Math.min(...ledgers);
  if (error) artifact.error = error instanceof Error ? error.message : String(error);
  else delete artifact.error;
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
  writeArtifact({ status: 'created', addresses, transactions, replaceTransactions: true });
  console.log('Create phase complete. Run admin_checklist next.');
  process.exit(0);
}

artifact = loadDaoArtifact();
addresses = artifact.addresses;
transactions = { ...(artifact.transactions ?? {}) };

if (phase === 'admin_checklist') {
  console.log('\n=== Admin Checklist ===\n');

  const checkpoint = (status = 'checklist_partial', error) =>
    writeArtifact({ status, addresses, transactions, error });

  try {
    // A recreated DAO can inherit checkpoints from a previous deployment in the
    // local artifact. Reconcile the checkpoint before skipping any checklist work.
    if (invokeView(addresses.token, 'total_supply') === 0 && Object.keys(transactions).some((key) => key !== 'createDao')) {
      transactions = transactions.createDao ? { createDao: transactions.createDao } : {};
      checkpoint();
    }

    {
      // Use shared minter from manager artifact
      if (!addresses.minter) {
        addresses.minter = managerArtifact.minter;
        if (!addresses.minter) {
          throw new Error('Manager artifact does not contain shared minter address. Please redeploy the manager.');
        }
        console.log(`Using shared Minter: ${addresses.minter}`);
        checkpoint();
      }

      // Grant mint authority to the Minter contract
      if (!transactions.grantMinterAuthority) {
        console.log('Granting mint authority to Minter contract...');
        invoke(addresses.token, 'set_mint_authority', { authority: addresses.minter, enabled: true });
        transactions.grantMinterAuthority = true;
        console.log('Mint authority granted to Minter');
        checkpoint();
      }

      // Founder mints must happen BEFORE launch_dao to satisfy minimum supply requirement
      if (!transactions.founderMints) {
        console.log('Minting founder tokens...');
        // Mint in small batches to avoid storage footprint and event size limits
        const maxPerBatch = 5; // Conservative limit to stay within footprint
        for (const founder of daoConfig.founders) {
          const fullBatches = Math.floor(founder.amount / maxPerBatch);
          const remainder = founder.amount % maxPerBatch;

          // Mint full batches
          for (let i = 0; i < fullBatches; i++) {
            const params = {
              token_id: addresses.token,
              recipients: JSON.stringify([founder.address]),
              amounts: JSON.stringify([{ u128: String(maxPerBatch) }])
            };
            invoke(addresses.minter, 'mint_batch', params);
          }

          // Mint remainder
          if (remainder > 0) {
            const params = {
              token_id: addresses.token,
              recipients: JSON.stringify([founder.address]),
              amounts: JSON.stringify([{ u128: String(remainder) }])
            };
            invoke(addresses.minter, 'mint_batch', params);
          }

          console.log(`Minted ${founder.amount} tokens to ${founder.address}`);
        }
        transactions.founderMints = { success: true, count: founderTotal };
        console.log(`Founder tokens minted: ${founderTotal} total`);
        checkpoint();
      }

      if (!transactions.addProperties) {
        const names = artworkProperties.map(({ name }) => name);
        const items = artworkProperties.flatMap((property, propertyId) => property.items.map((name) => ({ property_id: propertyId, name, is_new_property: true })));
        transactions.addProperties = invokeView(addresses.metadata, 'properties_count') > 0
          ? { skipped: true, reason: 'properties already exist' }
          : transaction(invoke(addresses.metadata, 'add_properties', {
              names: JSON.stringify(names), items: JSON.stringify(items), ipfs_group: JSON.stringify({ base_uri: daoConfig.metadata.artwork.ipfs.baseUri, extension: daoConfig.metadata.artwork.ipfs.extension })
            }));
        checkpoint();
      }

      for (const [method, name, value] of [
        ['update_project_uri', 'new_project_uri', daoConfig.metadata.projectUri],
        ['update_description', 'new_description', daoConfig.metadata.description],
        ['update_contract_image', 'new_contract_image', daoConfig.metadata.contractImage],
        ['update_renderer_base', 'new_renderer_base', daoConfig.metadata.rendererBase]
      ]) {
        if (!transactions[name]) {
          transactions[name] = transaction(invoke(addresses.metadata, method, { [name]: value }));
          checkpoint();
        }
      }

      for (const [method, name, value] of [
        ['set_duration', 'duration', daoConfig.auction.duration],
        ['set_reserve_price', 'reserve_price', String(daoConfig.auction.reservePrice)],
        ['set_time_buffer', 'time_buffer', daoConfig.auction.timeBuffer],
        ['set_payment_token', 'payment_token', daoConfig.auction.paymentAsset]
      ]) {
        if (!transactions[name]) {
          transactions[name] = transaction(invoke(addresses.auction, method, { [name]: value }));
          checkpoint();
        }
      }

      console.log('Governance configuration:', JSON.stringify({ ...daoConfig.governance, queueDelay }, null, 2));
      console.log('Marketplace configuration:', JSON.stringify({ paymentAsset: marketplacePaymentAsset, secondaryFeeBps: marketplaceConfig.secondaryFeeBps ?? 250 }, null, 2));
      if (!transactions.setMintAuthority) {
        invoke(addresses.token, 'set_mint_authority', { authority: addresses.marketplace, enabled: true });
        transactions.setMintAuthority = true;
        checkpoint();
      }
      if (!transactions.setMarketplacePaymentAsset) {
        invoke(addresses.marketplace, 'set_payment_asset', { payment_asset: marketplacePaymentAsset });
        transactions.setMarketplacePaymentAsset = true;
        checkpoint();
      }
      if (!transactions.setSecondaryFeeBps) {
        invoke(addresses.marketplace, 'set_secondary_fee_bps', { fee_bps: marketplaceConfig.secondaryFeeBps ?? 250 });
        transactions.setSecondaryFeeBps = true;
        checkpoint();
      }
      if (!transactions.unpauseMarketplace) {
        if (invokeView(addresses.marketplace, 'get_config').paused) invoke(addresses.marketplace, 'unpause');
        transactions.unpauseMarketplace = true;
        checkpoint();
      }
    }

    // Marketplace listing tokens would be minted via Minter contract if needed
    // For now, skip marketplace listing minting in admin_checklist
    if (!transactions.listingMint) {
      transactions.listingMint = { skipped: true, reason: 'Use Minter contract for bulk listing token creation' };
      checkpoint();
    }
    transactions.marketplaceListings = transactions.marketplaceListings ?? [];
    checkpoint('checklist_complete');
    console.log(`Admin checklist complete.`);
    console.log('Review the artifact and run launch_dao when ready.');
    process.exit(0);
  } catch (error) {
    checkpoint('checklist_partial', error);
    throw error;
  }
}

if (phase === 'launch_dao') {
  console.log('\n=== Launching DAO (auctions and marketplace enabled) ===\n');
  const launchOutput = invoke(managerAddress, 'launch_dao', {
    token_address: addresses.token,
    launch_config: JSON.stringify({ launch_auction: true, launch_marketplace: true })
  });
  transactions.launchDao = transaction(launchOutput);
  writeArtifact({ status: 'operational', addresses, transactions });
  console.log('DAO launch complete. Auctions and marketplace are enabled.');
  process.exit(0);
}

if (phase === 'deploy_minter') {
  console.log('\n=== Checking Minter ===\n');
  if (!addresses.minter) {
    addresses.minter = managerArtifact.minter;
    if (!addresses.minter) {
      throw new Error('Manager artifact does not contain shared minter address. Please redeploy the manager.');
    }
  }
  console.log(`Using shared Minter: ${addresses.minter}`);
  writeArtifact({ status: 'operational', addresses, transactions });
  console.log('Minter configured. Run batch_mint to execute batch minting.');
  process.exit(0);
}

if (phase === 'batch_mint') {
  console.log('\n=== Executing Batch Mint ===\n');
  const minterAddress = addresses.minter;
  if (!minterAddress) {
    throw new Error('Minter not deployed. Run deploy_minter first.');
  }

  // Use minter config from DAO config or provide sensible defaults
  const batchMintConfig = daoConfig.minter?.batch_mint ?? {
    recipients: [
      { to: daoConfig.founders[0]?.address || daoConfig.launchAdmin, amount: 100 },
      { to: daoConfig.founders[1]?.address || daoConfig.launchAdmin, amount: 100 },
      { to: daoConfig.founders[2]?.address || daoConfig.launchAdmin, amount: 100 }
    ]
  };

  console.log('Batch mint recipients:', JSON.stringify(batchMintConfig.recipients, null, 2));

  const output = invoke(minterAddress, 'mint_batch', {
    token: addresses.token,
    admin: daoConfig.launchAdmin,
    recipients: JSON.stringify(batchMintConfig.recipients)
  });

  transactions.batchMint = transaction(output, {
    recipients: batchMintConfig.recipients,
    totalAmount: batchMintConfig.recipients.reduce((sum, r) => sum + r.amount, 0)
  });
  writeArtifact({ status: 'operational', addresses, transactions });
  console.log('Batch mint complete.');
  console.log('Minted tokens to:', batchMintConfig.recipients.map(r => `${r.to} (${r.amount})`).join(', '));
  process.exit(0);
}
