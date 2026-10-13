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
 *   node scripts/deploy-dao.mjs <create_dao|admin_checklist|launch_dao> <dao-config.json> <network-config.json>
 *   node scripts/deploy-dao.mjs --validate-only <dao-config.json>      (no network, no artifacts)
 *
 * Three phases, each resumable:
 *
 * 1. create_dao: Manager.create_dao deploys Token, Treasury, Governor and Metadata plus the optional
 *    modules the config has (`auction`, `marketplace`, `claims` sections; each kind at most once) in
 *    one transaction and wires them through constructors (there are no wiring setters). Governance,
 *    module and metadata settings from the config are passed as constructor values, and each module's
 *    payment asset is recorded by the Manager for launch-time assertion. `tokenSettings` sets the
 *    membership switches (docs/designs/locked-tokens.md; all off is an open DAO) and `transferAgents`
 *    names the created kinds that become transfer agents. The launch admin is the admin of every
 *    module during the setup window.
 *
 * 2. admin_checklist (setup window, the launch admin signs directly; no Manager or Treasury):
 *    - FIRST add the artwork with metadata.add_properties in batches of <= 30 items (each batch adds
 *      its own IPFS group). Progress is derived from metadata.ipfs_data_count(). Artwork must exist
 *      before minting: the metadata hook seeds traits at mint time and seeds nothing without it.
 *    - THEN mint founder tokens with token.batch_mint (the admin may mint before launch; launch_dao
 *      requires a nonzero voting supply, i.e. founders other than the Treasury/Auction/Marketplace).
 *      Each call must fit the token's event budget (common::batch_mint_fits, 16 KiB event limit):
 *      300 bytes per token + 450 per recipient <= 13,500, i.e. up to 43 tokens to one founder or
 *      18 founders with one token each. Progress is derived from token ownership (owner_of).
 *    - verify every founder token has traits and seed any that do not with metadata.regenerate
 *      (safety net for tokens minted before the artwork).
 *    Not possible here: auction.unpause, any governance action. Settings are NOT re-applied here:
 *    the constructors already hold them. Changing a module's payment asset in setup makes launch_dao
 *    fail (PaymentAssetMismatch).
 *
 * 3. launch_dao: Manager.launch_dao(token_address, launch_config{launch_auction, launch_marketplace}).
 *    It launches every registered module, grants the Auction (when launched) an unlimited mint
 *    allowance, hands the admin of every module to the Treasury, claims the slug and deletes the
 *    pending state. The Manager has no authority afterwards. Other allowances (pools, ClaimMinter
 *    lists) are granted by governance with token.increase_mint_allowance.
 *
 * Slug: `slug` in the config is requested by create_dao and claimed permanently by launch_dao (unique
 * per Manager; 4-63 chars of [a-z0-9-]). Both phases pre-check that no launched DAO holds it; launch
 * fails with SlugTaken if another DAO launched with it first (rename with manager.update_pending_slug
 * and update the config). The claimed slug entries are renewed with every other DAO key by the DAO's
 * renewal sweep (scripts/renew-dao.mjs or the Renewal tab in Manage).
 *
 * Profile: `metadata.profile` ({ description, links: [{ label, url }], image }) is serialized as the
 * profile JSON of docs/STORAGE_DIET.md § 6 ({"v":1,...}) and must fit common::MAX_PROFILE_LENGTH
 * (4,096 bytes). It is event-only on chain: Metadata stores its hash and sequence number.
 *
 * Prerequisites: Manager deployed with deploy-manager.mjs. create_dao requires auth from BOTH
 * deployer and launchAdmin, so the config must use the same address for both (enforced by validation). The identity (DEPLOY_IDENTITY, default <network>-admin) must be
 * the config deployer (create_dao) and launchAdmin (checklist/launch).
 */

const phases = ['create_dao', 'admin_checklist', 'launch_dao'];
const validateOnly = args[0] === '--validate-only';

if (validateOnly ? !args[1] : (!phases.includes(phase) || !daoConfigPath || !networkConfigPath)) {
  throw new Error(
    'Usage: node scripts/deploy-dao.mjs <create_dao|admin_checklist|launch_dao> <dao-config.json> <network-config.json>\n' +
      '       node scripts/deploy-dao.mjs --validate-only <dao-config.json>'
  );
}

function loadJson(path, label) {
  if (!existsSync(path)) throw new Error(`${label} file not found: ${path}`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

// Contract bounds (contracts/manager/src/contract.rs validate_initial_config, governor/auction constants).
/** The profile JSON of docs/STORAGE_DIET.md § 6, exactly as create_dao receives it. */
function profileJson(config) {
  const profile = config.metadata?.profile ?? {};
  return JSON.stringify({
    v: 1,
    description: profile.description ?? '',
    links: profile.links ?? [],
    ...(profile.image ? { image: profile.image } : {})
  });
}

const LIMITS = {
  minGovernanceDelay: 300,
  maxGovernanceDelay: 2_592_000,
  maxBps: 10_000,
  maxFeeBps: 2_500, // common::MAX_FEE_BPS (25%)
  minAuctionDuration: 300,
  minReservePrice: 1000n,
  maxTimeBuffer: 86_400,
  maxString: 256,
  maxProfileBytes: 4_096, // common::MAX_PROFILE_LENGTH
  maxArtworkItemsPerCall: 30,
  maxProperties: 16,
  // common::batch_mint_fits: estimated event bytes per batch_mint call.
  batchMintEventBudget: 13_500, // common::BATCH_MINT_EVENT_BUDGET
  batchMintBytesPerToken: 300, // common::BATCH_MINT_BYTES_PER_TOKEN
  batchMintBytesPerRecipient: 450 // common::BATCH_MINT_BYTES_PER_RECIPIENT
};
const batchMintCost = (tokens, recipients) =>
  tokens * LIMITS.batchMintBytesPerToken + recipients * LIMITS.batchMintBytesPerRecipient;
// common::MAX_BATCH_MINT: the most tokens one call can mint to a single recipient (43).
const MAX_BATCH_MINT_TOKENS = Math.floor((LIMITS.batchMintEventBudget - LIMITS.batchMintBytesPerRecipient) / LIMITS.batchMintBytesPerToken);
const ADDRESS_RE = /^[GC][A-Z2-7]{55}$/;
// ModuleSpec kinds (common::modules::KIND_*), in the order create_dao deploys them.
const MODULE_KINDS = ['auction', 'marketplace', 'claims'];
// common::modules::TokenSettings, as camelCase config keys.
const TOKEN_SETTINGS = ['transfersLocked', 'membersOnlyDelegation', 'daoRecovery'];

/** The module kinds a config creates: a section that is present and not `enabled: false`. */
function configuredModules(config) {
  return Object.fromEntries(MODULE_KINDS.map((kind) => [kind, config[kind] != null && typeof config[kind] === 'object' && config[kind].enabled !== false]));
}

/** A module's payment asset; marketplace and claims default to the auction's (then the marketplace's). */
function paymentAssetOf(config, kind) {
  const kinds = configuredModules(config);
  const fallback = [kinds.auction && config.auction.paymentAsset, kinds.marketplace && config.marketplace.paymentAsset].find(Boolean);
  return kinds[kind] ? (config[kind].paymentAsset ?? fallback) : null;
}
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
  for (const key of ['name', 'symbol']) str(`token.${key}`, config.token?.[key]);
  if (config.token?.uri !== undefined) err('token.uri was removed: token_uri is built on chain from metadata.rendererBase');
  if (/["\\\u0000-\u001f]/.test(config.token?.name ?? '')) err('token.name may not contain ", \\ or control characters');
  str('slug', config.slug);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(config.slug) || config.slug.length < 4 || config.slug.length > 63) {
    err('slug must be 4-63 chars of lowercase letters, numbers and single hyphens');
  }
  str('metadata.rendererBase', config.metadata?.rendererBase);
  for (const key of ['projectUri', 'description', 'contractImage']) {
    if (config.metadata?.[key] !== undefined) err(`metadata.${key} was replaced by metadata.profile ({ description, links, image })`);
  }
  const profileBytes = Buffer.byteLength(profileJson(config), 'utf8');
  if (profileBytes > LIMITS.maxProfileBytes) err(`metadata.profile serializes to ${profileBytes} bytes; the limit is ${LIMITS.maxProfileBytes}`);
  const links = config.metadata?.profile?.links ?? [];
  if (!Array.isArray(links) || links.length > 8) err('metadata.profile.links must be an array of at most 8 { label, url }');
  for (const link of Array.isArray(links) ? links : []) {
    if (typeof link?.label !== 'string' || [...link.label].length > 32) err('each profile link label must be a string of at most 32 characters');
    if (!/^(https?:\/\/|mailto:|ipfs:\/\/)/.test(link?.url ?? '')) err(`profile link URL must be https, http, mailto or ipfs: ${link?.url}`);
  }

  const gov = config.governance ?? {};
  if ('proposalThresholdBps' in gov) {
    err('governance.proposalThresholdBps was renamed: the contract takes an ABSOLUTE vote count, use governance.proposalThreshold (integer >= 1)');
  }
  for (const key of ['votingDelay', 'votingPeriod', 'queueDelay']) {
    intRange(`governance.${key}`, gov[key], LIMITS.minGovernanceDelay, LIMITS.maxGovernanceDelay);
  }
  intRange('governance.quorumBps', gov.quorumBps, 1, LIMITS.maxBps);
  const threshold = bigint('governance.proposalThreshold', gov.proposalThreshold, 1n);

  for (const kind of MODULE_KINDS) {
    const section = config[kind];
    if (section === undefined) continue;
    if (section === null || typeof section !== 'object' || Array.isArray(section)) err(`${kind} must be an object (omit it for a DAO without that module)`);
    else if (section.enabled !== undefined && typeof section.enabled !== 'boolean') err(`${kind}.enabled must be a boolean`);
  }
  const kinds = configuredModules(config);
  if (kinds.auction) {
    const auction = config.auction;
    if (!(Number.isSafeInteger(auction.duration) && auction.duration >= LIMITS.minAuctionDuration)) err(`auction.duration must be an integer >= ${LIMITS.minAuctionDuration} seconds`);
    bigint('auction.reservePrice', auction.reservePrice, LIMITS.minReservePrice);
    intRange('auction.timeBuffer', auction.timeBuffer, 1, LIMITS.maxTimeBuffer);
    addr('auction.paymentAsset', auction.paymentAsset, CONTRACT_RE);
  }
  if (kinds.marketplace) {
    addr('marketplace.paymentAsset', paymentAssetOf(config, 'marketplace'), CONTRACT_RE);
    intRange('marketplace.secondaryFeeBps', config.marketplace.secondaryFeeBps ?? 250, 0, LIMITS.maxFeeBps);
  }
  if (kinds.claims) addr('claims.paymentAsset', paymentAssetOf(config, 'claims'), CONTRACT_RE);

  const settings = config.tokenSettings ?? {};
  if (typeof settings !== 'object' || Array.isArray(settings)) err('tokenSettings must be an object');
  for (const key of Object.keys(settings)) {
    if (!TOKEN_SETTINGS.includes(key)) err(`tokenSettings.${key} is not a token switch (${TOKEN_SETTINGS.join(', ')})`);
    else if (typeof settings[key] !== 'boolean') err(`tokenSettings.${key} must be a boolean`);
  }
  const agents = config.transferAgents ?? [];
  if (!Array.isArray(agents)) err('transferAgents must be an array of module kinds');
  else {
    for (const kind of agents) {
      // Manager UnknownAgentKind: an agent must be a kind this create_dao deploys.
      if (!kinds[kind]) err(`transferAgents names "${kind}", which this config does not create (${Object.keys(kinds).filter((k) => kinds[k]).join(', ') || 'no modules'})`);
    }
    if (new Set(agents).size !== agents.length) err('transferAgents lists a kind twice');
  }

  const launch = config.launch ?? {};
  for (const key of ['launchAuction', 'launchMarketplace']) {
    if (launch[key] !== undefined && typeof launch[key] !== 'boolean') err(`launch.${key} must be a boolean`);
  }
  if (launch.enableMinter !== undefined) err('launch.enableMinter was removed: the shared Minter is retired; add a `claims` section for a per-DAO ClaimMinter');
  if (launch.launchAuction === true && !kinds.auction) err('launch.launchAuction is true but the config creates no auction');
  if (launch.launchMarketplace === true && !kinds.marketplace) err('launch.launchMarketplace is true but the config creates no marketplace');

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

// Packs founder allocations into batch_mint calls that each fit common::batch_mint_fits. A founder
// above MAX_BATCH_MINT_TOKENS is split across calls.
function planFounderBatches(founders) {
  const pieces = founders.flatMap(({ address, amount }) => {
    const out = [];
    for (let left = amount; left > 0; left -= MAX_BATCH_MINT_TOKENS) out.push({ address, amount: Math.min(left, MAX_BATCH_MINT_TOKENS) });
    return out;
  });
  const batches = [];
  let current = { entries: [], total: 0 };
  for (const piece of pieces) {
    if (batchMintCost(current.total + piece.amount, current.entries.length + 1) > LIMITS.batchMintEventBudget) {
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
const modules = configuredModules(daoConfig);
const queueDelay = daoConfig.governance.queueDelay;
const tokenSettings = {
  transfers_locked: daoConfig.tokenSettings?.transfersLocked ?? false,
  members_only_delegation: daoConfig.tokenSettings?.membersOnlyDelegation ?? false,
  dao_recovery: daoConfig.tokenSettings?.daoRecovery ?? false
};
const launchFlags = {
  launch_auction: daoConfig.launch?.launchAuction ?? modules.auction,
  launch_marketplace: daoConfig.launch?.launchMarketplace ?? modules.marketplace
};
const founderBatches = planFounderBatches(daoConfig.founders);
const artworkBatches = planArtworkBatches(artworkProperties);

if (validateOnly) {
  console.log(`DAO config is valid: ${founderBatches.length} founder mint batch(es), ${artworkBatches.length} artwork batch(es).`);
  console.log(`modules: ${MODULE_KINDS.filter((kind) => modules[kind]).join(', ') || 'none'}`);
  console.log(`token_settings: ${JSON.stringify(tokenSettings)}; transfer_agents: ${JSON.stringify(daoConfig.transferAgents ?? [])}`);
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

// True when the token id exists (owner_of succeeds).
function tokenExists(tokenId) {
  try {
    invokeView(addresses.token, 'owner_of', { token_id: String(tokenId) });
    return true;
  } catch {
    return false;
  }
}

// True when the token has stored attributes (get_attributes fails or is empty otherwise).
function isSeeded(tokenId) {
  try {
    const attributes = invokeView(addresses.metadata, 'get_attributes', { token_id: String(tokenId) });
    return Array.isArray(attributes) && attributes.length > 0;
  } catch {
    return false;
  }
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
  // DaoAddresses: the core four are always set; a module kind the DAO does not have is null.
  const core = ['token', 'metadata', 'governor', 'treasury'];
  function find(value) {
    if (!value || typeof value !== 'object') return null;
    if (core.every((name) => typeof value[name] === 'string')) {
      const result = Object.fromEntries(core.map((name) => [name, value[name]]));
      for (const kind of MODULE_KINDS) result[kind] = typeof value[kind] === 'string' ? value[kind] : null;
      return result;
    }
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
  if (!artifact.addresses?.token || !artifact.addresses.treasury) {
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
    profile: profileJson(daoConfig),
    renderer_base: daoConfig.metadata.rendererBase,
    slug: daoConfig.slug,
    governance: {
      voting_delay: u32(daoConfig.governance.votingDelay),
      voting_period: u32(daoConfig.governance.votingPeriod),
      queue_delay: u32(queueDelay),
      proposal_threshold: u128(daoConfig.governance.proposalThreshold),
      quorum_bps: u32(daoConfig.governance.quorumBps)
    },
    // ModuleSpec enum: one { Variant: config } object per module, each kind at most once.
    modules: MODULE_KINDS.filter((kind) => modules[kind]).map((kind) => {
      if (kind === 'auction') {
        return {
          Auction: {
            duration: u64(daoConfig.auction.duration),
            reserve_price: i128(daoConfig.auction.reservePrice),
            time_buffer: u64(daoConfig.auction.timeBuffer),
            payment_asset: daoConfig.auction.paymentAsset
          }
        };
      }
      if (kind === 'marketplace') {
        return {
          Marketplace: {
            payment_asset: paymentAssetOf(daoConfig, 'marketplace'),
            secondary_fee_bps: u32(daoConfig.marketplace.secondaryFeeBps ?? 250)
          }
        };
      }
      return { Claims: { payment_asset: paymentAssetOf(daoConfig, 'claims') } };
    }),
    token_settings: tokenSettings,
    transfer_agents: daoConfig.transferAgents ?? []
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
    if (!tokenExists(0) && Number(invokeView(addresses.metadata, 'ipfs_data_count')) === 0 && Object.keys(transactions).some((key) => key !== 'createDao')) {
      transactions = transactions.createDao ? { createDao: transactions.createDao } : {};
      checkpoint();
    }

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

    // Founder mints come AFTER the artwork: the metadata hook seeds traits at mint time and seeds
    // nothing while no properties exist. token.batch_mint is signed by the launch admin (token
    // admin). Token ids are sequential from 0 in the setup window and a batch is atomic, so a batch
    // is on chain iff its last token exists (total_supply is the voting supply and would miss
    // founders held by the Treasury/Auction/Marketplace).
    const propertiesCount = Number(invokeView(addresses.metadata, 'properties_count'));
    if (propertiesCount === 0) {
      console.warn('WARNING: no artwork properties are configured, so founder tokens will have no traits until metadata.regenerate is called.');
    }
    transactions.founderMintBatches = transactions.founderMintBatches ?? [];
    let cumulative = 0;
    for (const [index, batch] of founderBatches.entries()) {
      const start = cumulative;
      cumulative += batch.total;
      if (tokenExists(cumulative - 1)) continue;
      if (tokenExists(start)) {
        throw new Error(`Founder batch ${index + 1} (tokens ${start}..${cumulative - 1}) is partially on chain; reconcile manually`);
      }
      console.log(`Minting founder batch ${index + 1}/${founderBatches.length} (${batch.total} tokens):`);
      for (const entry of batch.entries) console.log(`  ${entry.address} x ${entry.amount}`);
      const output = invoke(addresses.token, 'batch_mint', {
        minter: daoConfig.launchAdmin,
        recipients: batch.entries.map((entry) => entry.address),
        amounts: batch.entries.map((entry) => ({ u128: String(entry.amount) }))
      });
      transactions.founderMintBatches.push(transaction(output, { batch: index + 1, tokens: batch.total }));
      checkpoint();
    }
    console.log(`Founder tokens minted: ${cumulative} tokens, voting supply = ${invokeView(addresses.token, 'total_supply')}`);

    // Safety net: every founder token must have traits. A batch is seeded atomically with its mint,
    // so checking its first token is enough; an unseeded batch (minted before the artwork, e.g. by an
    // earlier run of this script) is fixed with metadata.regenerate per token (launch admin is the
    // metadata admin during setup).
    if (propertiesCount > 0) {
      transactions.regenerated = transactions.regenerated ?? [];
      let first = 0;
      for (const batch of founderBatches) {
        if (!isSeeded(first)) {
          for (let id = first; id < first + batch.total; id += 1) {
            if (isSeeded(id)) continue;
            console.log(`Seeding founder token ${id} (minted without traits): metadata.regenerate`);
            const output = invoke(addresses.metadata, 'regenerate', { token_id: String(id) });
            transactions.regenerated.push(transaction(output, { tokenId: id }));
            checkpoint();
          }
        }
        first += batch.total;
      }
      console.log(`Founder traits verified for tokens 0..${cumulative - 1}`);
    }

    console.log('\nSettings applied at create_dao (constructor values, not re-sent):');
    console.log(JSON.stringify({
      governance: daoConfig.governance,
      ...(modules.auction ? { auction: daoConfig.auction } : {}),
      ...(modules.marketplace ? { marketplace: { paymentAsset: paymentAssetOf(daoConfig, 'marketplace'), secondaryFeeBps: daoConfig.marketplace.secondaryFeeBps ?? 250 } } : {}),
      ...(modules.claims ? { claims: { paymentAsset: paymentAssetOf(daoConfig, 'claims') } } : {}),
      tokenSettings,
      transferAgents: daoConfig.transferAgents ?? []
    }, null, 2));
    console.log(`launch_config for launch_dao: ${JSON.stringify(launchFlags)}`);
    console.log('\nNOTES:');
    if (modules.claims) console.log('  - ClaimMinter lists can be opened now by the launch admin (claims.open_list) after granting an allowance (token.increase_mint_allowance); or open an assurance drive with manager.open_assurance instead of launch_dao.');
    console.log('  - launch_dao grants the Auction (when launched) an unlimited mint allowance; pools and later lists need allowances granted by governance (token.increase_mint_allowance).');
    console.log('  - Do not change module payment assets in setup: launch_dao would fail with PaymentAssetMismatch.');

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
  for (const kind of MODULE_KINDS) {
    const recorded = pending[`${kind}_payment_asset`] ?? null;
    if (recorded !== paymentAssetOf(daoConfig, kind)) {
      throw new Error(`Config ${kind} payment asset (${paymentAssetOf(daoConfig, kind)}) differs from the one recorded at create_dao (${recorded}); launch_dao would fail with a payment mismatch. Recreate the DAO or restore the original config.`);
    }
  }
  if (!(Number(invokeView(addresses.token, 'total_supply')) > 0)) {
    throw new Error('Token voting supply is 0: run admin_checklist first, minting founders other than the Treasury/Auction/Marketplace (launch_dao fails with LaunchSupplyZero).');
  }
  if (pending.slug !== daoConfig.slug) {
    throw new Error(`Pending DAO requests slug "${pending.slug}" but the config has "${daoConfig.slug}"; update one of them first.`);
  }
  assertSlugUnclaimed();

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
  if (launchFlags.launch_marketplace) console.log('Primary sales: governance grants the Marketplace an allowance (token.increase_mint_allowance) and opens a quick-buy pool (marketplace.open_pool, then restock); buyers call buy_from_pool.');
  process.exit(0);
}
