import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { enrichTransactionMetadata, runQuiet } from "./lib.mjs";

const args = process.argv.slice(2);
const daoConfigPath = args[0];
const networkConfigPath = args[1];

if (!daoConfigPath || !networkConfigPath) {
  throw new Error(
    "Usage: node scripts/deploy-dao.mjs <dao-config.json> <network-config.json>",
  );
}

// Load DAO configuration
if (!existsSync(daoConfigPath)) {
  throw new Error(`DAO config file not found: ${daoConfigPath}`);
}
const daoConfig = JSON.parse(readFileSync(daoConfigPath, "utf8"));

// Load network configuration (same as used for deploy-manager.mjs)
if (!existsSync(networkConfigPath)) {
  throw new Error(`Network config file not found: ${networkConfigPath}`);
}
const networkConfig = JSON.parse(readFileSync(networkConfigPath, "utf8"));

const networkName = networkConfig.network;
const identityName =
  process.env.DEPLOY_IDENTITY?.trim() || `${networkName}-admin`;
const managerArtifactPath = `deploys/${networkConfig.label}-${networkName}-manager.json`;
const daoArtifactPath = `deploys/${networkConfig.label}-${networkName}-dao-${daoConfig.nonce}.json`;

// Load Manager deployment artifact
if (!existsSync(managerArtifactPath)) {
  throw new Error(
    `Manager deployment artifact not found: ${managerArtifactPath}\n` +
      `Please run: node scripts/deploy-manager.mjs ${networkConfigPath}`,
  );
}
const managerArtifact = JSON.parse(readFileSync(managerArtifactPath, "utf8"));
const managerAddress = managerArtifact.manager;

if (
  managerArtifact.network !== networkName ||
  managerArtifact.label !== networkConfig.label
) {
  throw new Error(
    `Manager artifact ${managerArtifactPath} does not match ${networkName}/${networkConfig.label}`,
  );
}

if (!managerAddress || !managerArtifact.implementations) {
  throw new Error(
    `Manager artifact ${managerArtifactPath} must contain manager and implementations`,
  );
}

for (const implementation of [
  "token",
  "metadata",
  "auction",
  "governor",
  "treasury",
]) {
  if (!managerArtifact.implementations[implementation]) {
    throw new Error(
      `Manager artifact ${managerArtifactPath} is missing ${implementation} implementation`,
    );
  }
}

// Validate DAO config
const required = [
  ["deployer", daoConfig.deployer],
  ["nonce", daoConfig.nonce],
  ["token.name", daoConfig.token?.name],
  ["token.symbol", daoConfig.token?.symbol],
  ["token.uri", daoConfig.token?.uri],
  ["metadata.projectUri", daoConfig.metadata?.projectUri],
  ["metadata.description", daoConfig.metadata?.description],
  ["metadata.contractImage", daoConfig.metadata?.contractImage],
  ["metadata.rendererBase", daoConfig.metadata?.rendererBase],
  ["metadata.artwork.ipfs.baseUri", daoConfig.metadata?.artwork?.ipfs?.baseUri],
  [
    "metadata.artwork.ipfs.extension",
    daoConfig.metadata?.artwork?.ipfs?.extension,
  ],
  ["auction.duration", daoConfig.auction?.duration],
  ["auction.reservePrice", daoConfig.auction?.reservePrice],
  ["auction.timeBuffer", daoConfig.auction?.timeBuffer],
  ["auction.paymentAsset", daoConfig.auction?.paymentAsset],
  ["governance.votingDelay", daoConfig.governance?.votingDelay],
  ["governance.votingPeriod", daoConfig.governance?.votingPeriod],
  ["governance.quorumBps", daoConfig.governance?.quorumBps],
  [
    "governance.proposalThresholdBps",
    daoConfig.governance?.proposalThresholdBps,
  ],
  ["launchAdmin", daoConfig.launchAdmin],
];

const missing = required.find(
  ([, value]) => value === undefined || value === null,
);
if (missing) {
  throw new Error(`DAO config ${daoConfigPath} must define ${missing[0]}`);
}

const artworkProperties = daoConfig.metadata.artwork?.properties;
if (!Array.isArray(artworkProperties) || artworkProperties.length === 0) {
  throw new Error(
    `DAO config ${daoConfigPath} must define metadata.artwork.properties`,
  );
}
if (artworkProperties.length > 16) {
  throw new Error("DAO artwork cannot contain more than 16 properties");
}
for (const [index, property] of artworkProperties.entries()) {
  if (
    !property.name ||
    !Array.isArray(property.items) ||
    property.items.length === 0
  ) {
    throw new Error(
      `DAO artwork property ${index} must define a name and at least one item`,
    );
  }
}

// Predict DAO addresses before creation
console.log("\n=== Predicting DAO Addresses ===\n");
const predictResult = runQuiet("stellar", [
  "contract",
  "invoke",
  "--id",
  managerAddress,
  "--source-account",
  identityName,
  "--network",
  networkName,
  "--",
  "predict_addresses",
  "--creator",
  daoConfig.deployer,
  "--nonce",
  String(daoConfig.nonce),
]);

if (!predictResult.ok) {
  console.error("Predict output:", predictResult.stdout);
  console.error("Predict error:", predictResult.stderr);
  throw new Error("Failed to predict DAO addresses");
}

console.log("Predicted addresses:");
console.log(predictResult.stdout);

const predictedAddresses = extractDaoAddresses(
  predictResult.stdout + predictResult.stderr,
);
if (!predictedAddresses) {
  throw new Error(
    "Manager prediction succeeded but DaoAddresses could not be parsed from Stellar CLI output",
  );
}

const tokenUri = daoConfig.token.uri.replace(
  "{daoId}",
  predictedAddresses.token,
);

const createParams = JSON.stringify({
  deployer: daoConfig.deployer,
  nonce: daoConfig.nonce,
  token_name: daoConfig.token.name,
  token_symbol: daoConfig.token.symbol,
  token_uri: tokenUri,
  project_uri: daoConfig.metadata.projectUri,
  description: daoConfig.metadata.description,
  contract_image: daoConfig.metadata.contractImage,
  renderer_base: daoConfig.metadata.rendererBase,
  artwork_property_names: artworkProperties.map((property) => property.name),
  artwork_items: artworkProperties.flatMap((property, propertyId) =>
    property.items.map((name) => ({
      property_id: propertyId,
      name,
      is_new_property: true,
    })),
  ),
  artwork_ipfs: {
    base_uri: daoConfig.metadata.artwork.ipfs.baseUri,
    extension: daoConfig.metadata.artwork.ipfs.extension,
  },
  auction_duration: daoConfig.auction.duration,
  reserve_price: String(daoConfig.auction.reservePrice),
  time_buffer: daoConfig.auction.timeBuffer,
  payment_asset: daoConfig.auction.paymentAsset,
  voting_delay: daoConfig.governance.votingDelay,
  voting_period: daoConfig.governance.votingPeriod,
  quorum_bps: daoConfig.governance.quorumBps,
  proposal_threshold_bps: daoConfig.governance.proposalThresholdBps,
  founders: daoConfig.founders ?? [],
  launch_admin: daoConfig.launchAdmin,
});

function writeDaoArtifact({
  status,
  predictedAddresses,
  addresses,
  output,
  error,
  transactions = {},
}) {
  const txHashMatch = output?.match(/Signing transaction:\s*([a-f0-9]{64})/i);
  let transaction = txHashMatch ? { txHash: txHashMatch[1] } : null;

  if (transaction) {
    try {
      transaction = enrichTransactionMetadata(transaction, networkName);
    } catch (ledgerError) {
      transaction.ledgerError =
        ledgerError instanceof Error
          ? ledgerError.message
          : String(ledgerError);
    }
  }

  const artifact = {
    status,
    network: networkName,
    label: networkConfig.label,
    deployer: daoConfig.deployer,
    nonce: daoConfig.nonce,
    manager: managerAddress,
    predictedAddresses,
    addresses: addresses ?? null,
    config: daoConfig,
    createdAt: new Date().toISOString(),
  };

  const allTransactions = transaction
    ? { createDao: transaction, ...transactions }
    : transactions;
  if (Object.keys(allTransactions).length > 0) {
    artifact.transactions = allTransactions;
    const ledgers = Object.values(allTransactions)
      .map((metadata) => metadata?.ledger)
      .filter((ledger) => Number.isFinite(ledger));
    if (ledgers.length > 0) {
      artifact.deploymentLedger = Math.min(...ledgers);
    }
  }

  if (error) {
    artifact.error = error instanceof Error ? error.message : String(error);
  }

  mkdirSync("deploys", { recursive: true });
  writeFileSync(daoArtifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(`DAO artifact written to ${daoArtifactPath}`);
}

// Create the DAO
console.log("\n=== Creating DAO ===\n");
const createResult = runQuiet("stellar", [
  "contract",
  "invoke",
  "--id",
  managerAddress,
  "--source-account",
  identityName,
  "--network",
  networkName,
  "--",
  "create_dao",
  "--params",
  createParams,
]);

if (!createResult.ok) {
  console.error("Create DAO output:", createResult.stdout);
  console.error("Create DAO error:", createResult.stderr);
  writeDaoArtifact({
    status: "failed",
    predictedAddresses,
    output: createResult.stdout + createResult.stderr,
    error: createResult.stderr || createResult.stdout || "DAO creation failed",
  });
  throw new Error("Failed to create DAO");
}

console.log(createResult.stdout);
console.error(createResult.stderr);

// Parse the result to extract DAO addresses
// The stellar CLI returns the result in the output
function extractDaoAddresses(output) {
  const normalized = output.replace(/\\"/g, '"');
  const candidates = [];

  for (const match of normalized.matchAll(/\{[^{}]*\}/g)) {
    try {
      candidates.push(JSON.parse(match[0]));
    } catch {
      // Stellar CLI output may contain non-JSON diagnostic lines.
    }
  }

  const keys = {
    token: ["token", "token_address"],
    metadata: ["metadata", "metadata_address"],
    auction: ["auction", "auction_address"],
    governor: ["governor", "governor_address"],
    treasury: ["treasury", "treasury_address"],
  };

  function findObject(value) {
    if (!value || typeof value !== "object") return null;
    const result = {};
    for (const [name, aliases] of Object.entries(keys)) {
      const key = aliases.find((alias) => typeof value[alias] === "string");
      if (key) result[name] = value[key];
    }
    if (Object.keys(result).length === 5) return result;
    for (const child of Object.values(value)) {
      const found = findObject(child);
      if (found) return found;
    }
    return null;
  }

  return candidates.map(findObject).find(Boolean) ?? null;
}

const createOutput = createResult.stdout + createResult.stderr;
const daoAddresses = extractDaoAddresses(createOutput);
if (!daoAddresses) {
  throw new Error(
    "DAO creation succeeded but DaoAddresses could not be parsed from Stellar CLI output",
  );
}

for (const name of Object.keys(predictedAddresses)) {
  if (predictedAddresses[name] !== daoAddresses[name]) {
    throw new Error(
      `Predicted ${name} address does not match created DAO address`,
    );
  }
}

const artworkNames = artworkProperties.map((property) => property.name);
const artworkItems = artworkProperties.flatMap((property, propertyId) =>
  property.items.map((name) => ({
    property_id: propertyId,
    name,
    is_new_property: true,
  })),
);
const artworkIpfs = {
  base_uri: daoConfig.metadata.artwork.ipfs.baseUri,
  extension: daoConfig.metadata.artwork.ipfs.extension,
};
const postCreationTransactions = {};

console.log("\n=== Accepting Token Ownership ===\n");
const ownershipResult = runQuiet("stellar", [
  "contract",
  "invoke",
  "--id",
  daoAddresses.token,
  "--source-account",
  identityName,
  "--network",
  networkName,
  "--",
  "accept_ownership",
]);
const ownershipOutput = ownershipResult.stdout + ownershipResult.stderr;
if (!ownershipResult.ok) {
  writeDaoArtifact({
    status: "partial",
    predictedAddresses,
    addresses: daoAddresses,
    output: createOutput,
    transactions: postCreationTransactions,
    error: ownershipResult.stderr || ownershipResult.stdout,
  });
  throw new Error("DAO created but token ownership acceptance failed");
}
const ownershipTxHash = ownershipOutput.match(
  /Signing transaction:\s*([a-f0-9]{64})/i,
);
if (ownershipTxHash) {
  postCreationTransactions.acceptOwnership = enrichTransactionMetadata(
    { txHash: ownershipTxHash[1] },
    networkName,
  );
}

console.log("\n=== Adding Metadata Properties ===\n");
const propertiesResult = runQuiet("stellar", [
  "contract",
  "invoke",
  "--id",
  daoAddresses.metadata,
  "--source-account",
  identityName,
  "--network",
  networkName,
  "--",
  "add_properties",
  "--names",
  JSON.stringify(artworkNames),
  "--items",
  JSON.stringify(artworkItems),
  "--ipfs_group",
  JSON.stringify(artworkIpfs),
]);
const propertiesOutput = propertiesResult.stdout + propertiesResult.stderr;
if (!propertiesResult.ok) {
  writeDaoArtifact({
    status: "partial",
    predictedAddresses,
    addresses: daoAddresses,
    output: createOutput,
    transactions: postCreationTransactions,
    error: propertiesResult.stderr || propertiesResult.stdout,
  });
  throw new Error("DAO created but metadata properties failed");
}
const propertiesTxHash = propertiesOutput.match(
  /Signing transaction:\s*([a-f0-9]{64})/i,
);
if (propertiesTxHash) {
  postCreationTransactions.addProperties = enrichTransactionMetadata(
    { txHash: propertiesTxHash[1] },
    networkName,
  );
}

writeDaoArtifact({
  status: "pending",
  predictedAddresses,
  addresses: daoAddresses,
  output: createOutput,
  transactions: postCreationTransactions,
});

console.log("\n=== Finalizing DAO ===\n");
const finalizeResult = runQuiet("stellar", [
  "contract",
  "invoke",
  "--id",
  managerAddress,
  "--source-account",
  identityName,
  "--network",
  networkName,
  "--",
  "finalize_dao",
  "--token_address",
  daoAddresses.token,
]);
const finalizeOutput = finalizeResult.stdout + finalizeResult.stderr;
if (!finalizeResult.ok) {
  writeDaoArtifact({
    status: "pending",
    predictedAddresses,
    addresses: daoAddresses,
    output: createOutput,
    transactions: postCreationTransactions,
    error:
      finalizeResult.stderr ||
      finalizeResult.stdout ||
      "DAO finalization failed",
  });
  throw new Error("DAO configuration completed but finalization failed");
}

const finalizeTxHash = finalizeOutput.match(
  /Signing transaction:\s*([a-f0-9]{64})/i,
);
if (finalizeTxHash) {
  postCreationTransactions.finalizeDao = enrichTransactionMetadata(
    { txHash: finalizeTxHash[1] },
    networkName,
  );
}

writeDaoArtifact({
  status: "operational",
  predictedAddresses,
  addresses: daoAddresses,
  output: createOutput,
  transactions: postCreationTransactions,
});

console.log(`\n=== DAO Deployment Complete ===`);
console.log(`Artifact saved to: ${daoArtifactPath}`);
console.log(`\nTo query DAO addresses:`);
console.log(
  `stellar contract invoke --id ${managerAddress} --source-account ${identityName} --network ${networkName} -- predict --creator ${daoConfig.deployer} --nonce ${daoConfig.nonce}`,
);
