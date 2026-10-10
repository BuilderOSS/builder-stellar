import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { enrichTransactionMetadata, runQuiet } from './lib.mjs';

const args = process.argv.slice(2);
const phase = args[0];
const daoConfigPath = args[1];
const networkConfigPath = args[2];
/**
 * DAO Deployment Script (hardened-contract flow)
 *
 * Usage:
 *   node scripts/deploy-dao.mjs <create_dao|admin_checklist|launch_dao|bump_slug_ttl> <dao-config.json> <network-config.json>
 *   node scripts/deploy-dao.mjs --validate-only <dao-config.json>      (no network, no artifacts)
 *
 * Three phases, each resumable:
 *
 * 1. create_dao: Manager.create_dao deploys Token, Treasury, Governor, Metadata, Auction and Marketplace
 *    in one transaction and wires them through constructors (there are no wiring setters). Governance,
 *    auction, marketplace and metadata settings from the config are passed as constructor values, and
 *    the payment assets are recorded by the Manager for launch-time assertion. The launch admin is
 *    the admin of every module during the setup window.
 *
 * 2. admin_checklist (setup window, the launch admin signs directly; no Manager, Minter or Treasury):
 *    - mint founder tokens with token.batch_mint (the admin may mint before launch; launch_dao
 *      requires a nonzero voting supply, i.e. founders other than the Treasury/Auction/Marketplace).
 *      Batches are bounded to 20 tokens per call (common::MAX_BATCH_MINT: the 16 KiB event limit).
 *    - add the artwork with metadata.add_properties in batches of <= 30 items (each batch adds its
 *      own IPFS group). Progress is derived from metadata.ipfs_data_count().
 *    Not possible before launch: token.set_mint_authority (NotLive), Minter merkle/allowlist
 *    (Minter requires a Live token), auction.unpause, marketplace primary listings, any governance
 *    action. Settings are NOT re-applied here: the constructors already hold them.
 *    Changing auction/marketplace payment assets in setup makes launch_dao fail.
 *
 * 3. launch_dao: Manager.launch_dao(token_address, launch_config{launch_auction, launch_marketplace,
 *    enable_minter, expected_minter}; expected_minter is pinned to get_platform_minter when
 *    enable_minter is set). It grants mint authority itself (Treasury, Marketplace, Auction if launched,
 *    and the Manager's registered PlatformMinter if enable_minter), hands the admin of every module
 *    to the Treasury, claims the slug and deletes the pending state. The Manager has no authority
 *    afterwards.
 *
 * Slug: `slug` in the config is requested by create_dao and claimed permanently by launch_dao (unique
 * per Manager; 4-63 chars of [a-z0-9-]). Both phases pre-check that no launched DAO holds it; launch
 * fails with SlugTaken if another DAO launched with it first (rename with manager.update_pending_slug
 * and update the config). The claimed slug registry entries expire unless renewed: run the permissionless `bump_slug_ttl` phase periodically
 * (the network caps each extension at ~180 days). It needs no auth beyond paying the fee.
 *
 * Prerequisites: Manager deployed with deploy-manager.mjs (which also registers the platform
 * minter used by enable_minter). create_dao requires auth from BOTH deployer and launchAdmin, so the
 * config must use the same address for both (enforced by validation). The identity (DEPLOY_IDENTITY, default <network>-admin) must be
 * the config deployer (create_dao) and launchAdmin (checklist/launch).
 */

const phases = ['create_dao', 'admin_checklist', 'launch_dao', 'bump_slug_ttl'];
const validateOnly = args[0] === '--validate-only';

if (validateOnly ? !args[1] : (!phases.includes(phase) || !daoConfigPath || !networkConfigPath)) {
  throw new Error(
    'Usage: node scripts/deploy-dao.mjs <create_dao|admin_checklist|launch_dao|bump_slug_ttl> <dao-config.json> <network-config.json>\n' +
      '       node scripts/deploy-dao.mjs --validate-only <dao-config.json>'
  );
}

function loadJson(path, label) {
  if (!existsSync(path)) throw new Error(`${label} file not found: ${path}`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

// Contract bounds (contracts/manager/src/contract.rs validate_initial_config, governor/auction constants).
const LIMITS = {
  minGovernanceDelay: 300,
  maxGovernanceDelay: 2_592_000,
  maxBps: 10_000,
  maxFeeBps: 2_500, // common::MAX_FEE_BPS (25%)
  minAuctionDuration: 300,
  minReservePrice: 1000n,
  maxTimeBuffer: 86_400,
  maxString: 256,
  maxArtworkItemsPerCall: 30,
  maxProperties: 16,
  maxBatchMintTokens: 20, // common::MAX_BATCH_MINT
  maxBatchMintRecipients: 20
};
const ADDRESS_RE = /^[GC][A-Z2-7]{55}$/;
const CONTRACT_RE = /^C[A-Z2-7]{55}$/;

function validateDaoConfig(config) {
  const errors = [];
  const err = (message) => errors.push(message);
  const str = (path, value) => {
    if (typeof value !== 'string' || value.length === 0) err(`${path} must be a non-empty string`);
    else if (value.length > LIMITS.maxString) err(`${path} must be at most ${LIMITS.maxString} characters`);
  };
  const addr = (path, value, re = ADDRESS_RE) => {
    if (typeof value !== 'string' || !re.test(value)) err(`${path} must be a valid Stellar ${re === CONTRACT_RE ? 'contract (C...)' : 'account/contract (G.../C...)'} address`);
  };
  const intRange = (path, value, min, max) => {
    if (!Number.isInteger(value) || value < min || value > max) err(`${path} must be an integer in ${min}..=${max} (got ${JSON.stringify(value)})`);
  };
  const bigint = (path, value, min) => {
    let parsed = null;
    try { if (typeof value === 'string' || Number.isSafeInteger(value)) parsed = BigInt(value); } catch { /* invalid */ }
    if (parsed === null || parsed < min) err(`${path} must be an integer (number or decimal string) >= ${min} (got ${JSON.stringify(value)})`);
    return parsed;
  };

  addr('deployer', config.deployer);
  addr('launchAdmin', config.launchAdmin);
  if (config.deployer !== config.launchAdmin) {
    err(
      'deployer and launchAdmin differ, but create_dao requires authorization from BOTH. ' +
        'The stellar CLI signs with a single --source-account, so this script only supports deployer == launchAdmin. ' +
        'Use the same identity/address for both, or build the transaction with `stellar tx new invoke --build-only`, ' +
        'sign it with both accounts (`stellar tx sign`), and submit it manually.'
    );
  }
  if (!Number.isSafeInteger(config.nonce) || config.nonce < 0) err('nonce must be a non-negative integer');
  for (const key of ['name', 'symbol', 'uri']) str(`token.${key}`, config.token?.[key]);
  str('slug', config.slug);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(config.slug) || config.slug.length < 4 || config.slug.length > 63) {
    err('slug must be 4-63 chars of lowercase letters, numbers and single hyphens');
  }
  for (const key of ['projectUri', 'description', 'contractImage', 'rendererBase']) str(`metadata.${key}`, config.metadata?.[key]);

  const gov = config.governance ?? {};
  if ('proposalThresholdBps' in gov) {
    err('governance.proposalThresholdBps was renamed: the contract takes an ABSOLUTE vote count, use governance.proposalThreshold (integer >= 1)');
  }
  for (const key of ['votingDelay', 'votingPeriod', 'queueDelay']) {
    intRange(`governance.${key}`, gov[key], LIMITS.minGovernanceDelay, LIMITS.maxGovernanceDelay);
  }
  intRange('governance.quorumBps', gov.quorumBps, 1, LIMITS.maxBps);
  const threshold = bigint('governance.proposalThreshold', gov.proposalThreshold, 1n);

  const auction = config.auction ?? {};
  if (!(Number.isSafeInteger(auction.duration) && auction.duration >= LIMITS.minAuctionDuration)) err(`auction.duration must be an integer >= ${LIMITS.minAuctionDuration} seconds`);
  bigint('auction.reservePrice', auction.reservePrice, LIMITS.minReservePrice);
  intRange('auction.timeBuffer', auction.timeBuffer, 1, LIMITS.maxTimeBuffer);
  addr('auction.paymentAsset', auction.paymentAsset, CONTRACT_RE);

  const marketplace = config.marketplace ?? {};
  const marketplaceAsset = marketplace.paymentAsset ?? auction.paymentAsset;
  addr('marketplace.paymentAsset', marketplaceAsset, CONTRACT_RE);
  intRange('marketplace.secondaryFeeBps', marketplace.secondaryFeeBps ?? 250, 0, LIMITS.maxFeeBps);

  const launch = config.launch ?? {};
  for (const key of ['launchAuction', 'launchMarketplace', 'enableMinter']) {
    if (launch[key] !== undefined && typeof launch[key] !== 'boolean') err(`launch.${key} must be a boolean`);
  }

  let founderTotal = 0;
  if (!Array.isArray(config.founders) || config.founders.length === 0) {
    err('founders must list at least one founder (launch_dao requires total_supply > 0)');
  } else {
    for (const [index, founder] of config.founders.entries()) {
      addr(`founders[${index}].address`, founder?.address);
      if (!Number.isInteger(founder?.amount) || founder.amount <= 0) err(`founders[${index}].amount must be a positive integer`);
      else founderTotal += founder.amount;
    }
    if (founderTotal > 0xffffffff) err('founder allocation total exceeds u32');
  }
  if (threshold !== null && founderTotal > 0 && threshold > BigInt(founderTotal)) {
    err(`governance.proposalThreshold (${threshold}) exceeds the founder supply (${founderTotal}); nobody could propose at launch`);
  }

  const properties = config.metadata?.artwork?.properties;
  str('metadata.artwork.ipfs.baseUri', config.metadata?.artwork?.ipfs?.baseUri);
  str('metadata.artwork.ipfs.extension', config.metadata?.artwork?.ipfs?.extension);
  if (!Array.isArray(properties) || properties.length === 0 || properties.length > LIMITS.maxProperties) {
    err(`metadata.artwork.properties must contain 1..=${LIMITS.maxProperties} properties`);
  } else {
    for (const [index, property] of properties.entries()) {
      str(`metadata.artwork.properties[${index}].name`, property?.name);
      if (!Array.isArray(property?.items) || property.items.length === 0) err(`metadata.artwork.properties[${index}] needs at least one item`);
      else property.items.forEach((item, i) => str(`metadata.artwork.properties[${index}].items[${i}]`, item));
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid DAO config:\n  - ${errors.join('\n  - ')}`);
  }
}

// Founder mint batches: pieces of <= 20 tokens, packed into batches of <= 20 entries / 20 tokens.
function planFounderBatches(founders) {
  const pieces = founders.flatMap(({ address, amount }) => {
    const out = [];
    for (let left = amount; left > 0; left -= LIMITS.maxBatchMintTokens) out.push({ address, amount: Math.min(left, LIMITS.maxBatchMintTokens) });
    return out;
  });
  const batches = [];
  let current = { entries: [], total: 0 };
  for (const piece of pieces) {
    if (current.entries.length === LIMITS.maxBatchMintRecipients || current.total + piece.amount > LIMITS.maxBatchMintTokens) {
      batches.push(current);
      current = { entries: [], total: 0 };
    }
    current.entries.push(piece);
    current.total += piece.amount;
  }
  if (current.entries.length > 0) batches.push(current);
  return batches;
}

// Artwork add_properties calls of <= 30 items. A property is created by the first call that mentions
// it (property_id = index into that call's `names`, is_new_property = true); later calls address it by
// absolute id with is_new_property = false.
function planArtworkBatches(properties) {
  const calls = [];
  let call = { names: [], items: [] };
  let local = new Map(); // property id -> index in this call's names
  let created = 0; // properties created by already-closed calls
  const flush = () => {
    if (call.items.length === 0) return;
    created += call.names.length;
    calls.push(call);
    call = { names: [], items: [] };
    local = new Map();
  };
  for (const [propertyId, property] of properties.entries()) {
    for (const item of property.items) {
      if (call.items.length === LIMITS.maxArtworkItemsPerCall) flush();
      if (propertyId >= created && !local.has(propertyId)) {
        local.set(propertyId, call.names.length);
        call.names.push(property.name);
      }
      call.items.push(local.has(propertyId)
        ? { property_id: local.get(propertyId), name: item, is_new_property: true }
        : { property_id: propertyId, name: item, is_new_property: false });
    }
  }
  flush();
  return calls;
}

const daoConfig = loadJson(validateOnly ? args[1] : daoConfigPath, 'DAO config');
validateDaoConfig(daoConfig);
const artworkProperties = daoConfig.metadata.artwork.properties;
const marketplaceConfig = daoConfig.marketplace ?? {};
const queueDelay = daoConfig.governance.queueDelay;
const marketplacePaymentAsset = marketplaceConfig.paymentAsset ?? daoConfig.auction.paymentAsset;
const launchFlags = {
  launch_auction: daoConfig.launch?.launchAuction ?? daoConfig.auction.enabled ?? true,
  launch_marketplace: daoConfig.launch?.launchMarketplace ?? true,
  enable_minter: daoConfig.launch?.enableMinter ?? false,
  // Pinned at launch time from get_platform_minter (see launch_dao phase); required when enable_minter.
  expected_minter: null
};
const founderBatches = planFounderBatches(daoConfig.founders);
const artworkBatches = planArtworkBatches(artworkProperties);

if (validateOnly) {
  console.log(`DAO config is valid: ${founderBatches.length} founder mint batch(es), ${artworkBatches.length} artwork batch(es).`);
  console.log(`launch_config: ${JSON.stringify(launchFlags)}`);
  process.exit(0);
}

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
  const quoted = output.match(/(?:^|\n)"([A-Z0-9]{56})"\s*$/)?.[1];
  if (quoted) return quoted;
  const value = output.match(/(?:^|\n)"?(true|false|null|-?\d+)"?\s*$/i)?.[1];
  if (value === undefined) throw new Error(`Could not parse ${method} result: ${output}`);
  return value === 'true' ? true : value === 'false' ? false : value === 'null' ? null : Number(value);
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
    slug: daoConfig.slug,
    governance: {
      voting_delay: u32(daoConfig.governance.votingDelay),
      voting_period: u32(daoConfig.governance.votingPeriod),
      queue_delay: u32(queueDelay),
      proposal_threshold: u128(daoConfig.governance.proposalThreshold),
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

function requireIdentity(label, expected) {
  const result = runQuiet('stellar', ['keys', 'address', identityName]);
  if (result.ok && result.stdout.trim() && result.stdout.trim() !== expected) {
    throw new Error(`Identity ${identityName} is ${result.stdout.trim()}, but ${label} is ${expected}. Set DEPLOY_IDENTITY to the matching key.`);
  }
}

let artifact;
let addresses;
let transactions = {};

// Fail before spending fees if a launched DAO already claimed the slug
// (SlugNotFound / #7128 means it is free; pending DAOs do not hold slugs).
function assertSlugUnclaimed() {
  let claimedBy = null;
  try {
    claimedBy = invokeView(managerAddress, 'get_dao_by_slug', { slug: daoConfig.slug });
  } catch (e) {
    if (!/SlugNotFound|#7128/.test(String(e.message))) throw e;
  }
  if (claimedBy) throw new Error(`Slug "${daoConfig.slug}" is already claimed by ${claimedBy}; choose another slug in the DAO config`);
}

if (phase === 'bump_slug_ttl') {
  console.log(`\n=== Renewing slug "${daoConfig.slug}" storage TTL ===\n`);
  invoke(managerAddress, 'bump_slug_ttl', { slug: daoConfig.slug });
  console.log('Slug TTL renewed.');
  process.exit(0);
}

if (phase === 'create_dao') {
  console.log('\n=== Creating DAO (setup window: the launch admin administers every module) ===\n');
  requireIdentity('deployer', daoConfig.deployer);
  assertSlugUnclaimed();
  const output = invoke(managerAddress, 'create_dao', {
    params: JSON.stringify({ deployer: daoConfig.deployer, nonce: { u64: String(daoConfig.nonce) }, launch_admin: daoConfig.launchAdmin, initial_config: initialConfig() })
  });
  addresses = addressesFromOutput(output);
  if (!addresses) throw new Error('DAO creation succeeded but DAO addresses could not be parsed');
  const requested = invokeView(managerAddress, 'get_pending_dao', { token_address: addresses.token })?.slug;
  if (requested !== daoConfig.slug) throw new Error(`Pending DAO requests slug "${requested}", expected "${daoConfig.slug}"`);
  console.log(`Slug "${daoConfig.slug}" requested; launch_dao claims it.`);
  transactions.createDao = transaction(output);
  writeArtifact({ status: 'created', addresses, transactions, replaceTransactions: true });
  console.log('Create phase complete. Run admin_checklist next.');
  process.exit(0);
}

artifact = loadDaoArtifact();
addresses = artifact.addresses;
transactions = { ...(artifact.transactions ?? {}) };

if (phase === 'admin_checklist') {
  console.log('\n=== Admin Checklist (setup window, launch admin signs directly) ===\n');
  requireIdentity('launchAdmin', daoConfig.launchAdmin);

  const checkpoint = (status = 'checklist_partial', error) =>
    writeArtifact({ status, addresses, transactions, error });

  try {
    if (invokeView(addresses.token, 'is_live') === true) {
      throw new Error('Token is already Live: the setup window is closed. Nothing more can be minted by the launch admin.');
    }

    // A recreated DAO can inherit checkpoints from a previous deployment in the
    // local artifact. Reconcile the checkpoint before recording more work.
    if (invokeView(addresses.token, 'total_supply') === 0 && Object.keys(transactions).some((key) => key !== 'createDao')) {
      transactions = transactions.createDao ? { createDao: transactions.createDao } : {};
      checkpoint();
    }

    // Founder mints: token.batch_mint signed by the launch admin (token owner). Progress is
    // derived from the on-chain total_supply so a crash between invoke and checkpoint is safe.
    transactions.founderMintBatches = transactions.founderMintBatches ?? [];
    let supply = Number(invokeView(addresses.token, 'total_supply'));
    let cumulative = 0;
    for (const [index, batch] of founderBatches.entries()) {
      const start = cumulative;
      cumulative += batch.total;
      if (cumulative <= supply) continue;
      if (supply > start) {
        throw new Error(`Token total_supply ${supply} is inside founder batch ${index + 1} (${start}..${cumulative}); reconcile manually`);
      }
      console.log(`Minting founder batch ${index + 1}/${founderBatches.length} (${batch.total} tokens):`);
      for (const entry of batch.entries) console.log(`  ${entry.address} x ${entry.amount}`);
      const output = invoke(addresses.token, 'batch_mint', {
        minter: daoConfig.launchAdmin,
        recipients: batch.entries.map((entry) => entry.address),
        amounts: batch.entries.map((entry) => ({ u128: String(entry.amount) }))
      });
      transactions.founderMintBatches.push(transaction(output, { batch: index + 1, tokens: batch.total }));
      supply += batch.total;
      checkpoint();
    }
    console.log(`Founder tokens minted: total_supply = ${supply}`);

    // Artwork: add_properties by the launch admin, <= 30 items per call. Each applied call appends one
    // IPFS group, so ipfs_data_count tells how many planned calls are already on chain.
    transactions.artworkBatches = transactions.artworkBatches ?? [];
    const applied = Number(invokeView(addresses.metadata, 'ipfs_data_count'));
    if (applied > artworkBatches.length) {
      throw new Error(`Metadata already holds ${applied} artwork batches but the config plans ${artworkBatches.length}; reconcile manually`);
    }
    for (const [index, call] of artworkBatches.entries()) {
      if (index < applied) continue;
      console.log(`Adding artwork batch ${index + 1}/${artworkBatches.length} (${call.items.length} items, ${call.names.length} new properties)`);
      const output = invoke(addresses.metadata, 'add_properties', {
        names: call.names,
        items: call.items,
        ipfs_group: { base_uri: daoConfig.metadata.artwork.ipfs.baseUri, extension: daoConfig.metadata.artwork.ipfs.extension }
      });
      transactions.artworkBatches.push(transaction(output, { batch: index + 1, items: call.items.length }));
      checkpoint();
    }
    console.log(`Artwork complete: ${invokeView(addresses.metadata, 'properties_count')} properties`);

    console.log('\nSettings applied at create_dao (constructor values, not re-sent):');
    console.log(JSON.stringify({
      governance: daoConfig.governance,
      auction: daoConfig.auction,
      marketplace: { paymentAsset: marketplacePaymentAsset, secondaryFeeBps: marketplaceConfig.secondaryFeeBps ?? 250 }
    }, null, 2));
    console.log(`launch_config for launch_dao: ${JSON.stringify(launchFlags)}`);
    console.log('\nNOTES:');
    console.log('  - Minter merkle roots / allowlists CANNOT be configured now: the Minter requires a Live token. Set them after launch_dao (launch admin is the Treasury afterwards, so use governance or the admin recorded by the Minter).');
    console.log('  - Mint authority (Treasury, Marketplace, Auction, platform Minter) is granted by launch_dao itself. Do not call token.set_mint_authority now (NotLive).');
    console.log('  - Do not change auction/marketplace payment assets in setup: launch_dao would fail with PaymentTokenMismatch/PaymentAssetMismatch.');

    checkpoint('checklist_complete');
    console.log('\nAdmin checklist complete. Review the artifact and run launch_dao when ready.');
    process.exit(0);
  } catch (error) {
    checkpoint('checklist_partial', error);
    throw error;
  }
}

if (phase === 'launch_dao') {
  console.log('\n=== Launching DAO ===\n');
  requireIdentity('launchAdmin', daoConfig.launchAdmin);

  // Preflight (read-only) so failures are explained before spending a transaction.
  const pending = invokeView(managerAddress, 'get_pending_dao', { token_address: addresses.token });
  if (!pending) throw new Error('Manager has no pending DAO for this token: it is already launched or was never created here.');
  if (pending.auction_payment_asset !== daoConfig.auction.paymentAsset || pending.marketplace_payment_asset !== marketplacePaymentAsset) {
    throw new Error('Config payment assets differ from the ones recorded at create_dao; launch_dao would fail with a payment mismatch. Recreate the DAO or restore the original config.');
  }
  if (!(Number(invokeView(addresses.token, 'total_supply')) > 0)) {
    throw new Error('Token voting supply is 0: run admin_checklist first, minting founders other than the Treasury/Auction/Marketplace (launch_dao fails with LaunchSupplyZero).');
  }
  if (pending.slug !== daoConfig.slug) {
    throw new Error(`Pending DAO requests slug "${pending.slug}" but the config has "${daoConfig.slug}"; update one of them first.`);
  }
  assertSlugUnclaimed();
  if (launchFlags.enable_minter) {
    const minter = invokeView(managerAddress, 'get_platform_minter');
    if (!minter) throw new Error('enable_minter is set but the Manager has no platform minter (PlatformMinterNotSet). The Manager admin must run set_platform_minter (deploy-manager.mjs does this).');
    console.log(`Platform minter to be granted mint authority (pinned as expected_minter): ${minter}`);
    // The Manager reverts with PlatformMinterMismatch if the admin swaps the minter before this
    // transaction lands, so what the launch admin saw is what gets mint authority.
    launchFlags.expected_minter = minter;
  }

  const launchOutput = invoke(managerAddress, 'launch_dao', {
    token_address: addresses.token,
    launch_config: launchFlags
  });
  transactions.launchDao = transaction(launchOutput);
  writeArtifact({ status: 'operational', addresses, transactions });
  console.log(`DAO launched: ${JSON.stringify(launchFlags)}`);
  const claimed = invokeView(managerAddress, 'get_dao_by_slug', { slug: daoConfig.slug });
  if (claimed !== addresses.token) throw new Error(`Slug "${daoConfig.slug}" resolves to ${claimed}, expected ${addresses.token}`);
  console.log(`Slug "${daoConfig.slug}" claimed by ${addresses.token}`);
  console.log('All modules are Live with the Treasury as admin. Further administration is by governance proposal (see scripts/upgrade-contract.mjs for the payload shape).');
  if (launchFlags.launch_marketplace) console.log('Primary sales: the Treasury must create listings via governance (marketplace.create_primary_listing), buyers call buy_primary.');
  process.exit(0);
}
