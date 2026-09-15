import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Get the project root directory (where package.json is)
const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(scriptDir, '..');

const deploysDir = join(projectRoot, 'deploys');
const outputFile = join(projectRoot, 'apps/web/src/config/deployments.generated.ts');

function generateDeploymentConfig() {
  if (!existsSync(deploysDir)) {
    console.error(`Error: ${deploysDir} directory not found`);
    process.exit(1);
  }

  const deployFiles = readdirSync(deploysDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const content = JSON.parse(readFileSync(join(deploysDir, f), 'utf8'));
      return {
        fileName: f,
        deployment: {
          ...content
        }
      };
    });

  if (!deployFiles.length) {
    console.error(`Error: No deployment JSON files found in ${deploysDir}/`);
    process.exit(1);
  }

  const deployments = deployFiles.map(({ deployment }) => deployment);

  // Extract unique network and label values for type unions
  const networks = [...new Set(deployments.map((d) => d.network))];
  const labels = [...new Set(deployments.map((d) => d.label))];

  const tsContent = `// Auto-generated from deploys/*.json
// DO NOT EDIT MANUALLY - Run 'pnpm dao:generate-config' to regenerate

const DEPLOYMENTS_DATA = ${JSON.stringify(deployments, null, 2)};

export const DEPLOYMENTS = DEPLOYMENTS_DATA as Array<{
  network: string;
  label: string;
  config: {
    label: string;
    adminAddress: string;
    webBaseUrl: string;
    rpcUrl: string;
    networkPassphrase: string;
    token: {
      name: string;
      symbol: string;
      description: string;
    };
    governor: {
      votingDelay: number;
      votingPeriod: number;
      queueDelay: number;
      proposalThreshold: number;
      quorumBps: number;
    };
    auction: {
      duration: number;
      reservePrice: number;
      minBidIncrementPercent: number;
      timeBuffer: number;
      paymentToken: string;
    };
  };
  contracts: {
    token: string;
    governor: string;
    treasury: string;
    auction: string;
  };
  outputs: {
    tokenBaseUri: string;
    identityName: string;
    saltSuffix: string | null;
    deployArtifactPath: string;
    deploymentLedger: number | null;
  };
  deploymentLedger?: number | null;
  transactions?: {
    token?: { deployedAt: string; txHash?: string; ledger?: number };
    governor?: { deployedAt: string; txHash?: string; ledger?: number };
    treasury?: { deployedAt: string; txHash?: string; ledger?: number };
    auction?: { deployedAt: string; txHash?: string; ledger?: number };
  };
}>;

export function getDeployment(network: string, label: string) {
  const deployment = DEPLOYMENTS.find(
    (d) => d.network === network && d.label === label
  );

  if (!deployment) {
    const available = DEPLOYMENTS.map((d) => \`\${d.network}/\${d.label}\`).join(', ');
    throw new Error(
      \`No deployment found for network="\${network}" label="\${label}". \` +
        \`Available deployments: \${available}\`
    );
  }

  return deployment;
}

export type DeploymentNetwork = ${networks.map((n) => `'${n}'`).join(' | ')};
export type DeploymentLabel = ${labels.map((l) => `'${l}'`).join(' | ')};
`;

  // Ensure output directory exists
  const outputDir = join(projectRoot, 'apps', 'web', 'src', 'config');
  mkdirSync(outputDir, { recursive: true });

  writeFileSync(outputFile, tsContent);

  console.log(`✅ Generated ${outputFile} from ${deployFiles.length} deployment(s):`);
  for (const { fileName, deployment } of deployFiles) {
    console.log(`   - ${fileName} → ${deployment.network}/${deployment.label}`);
  }
}

generateDeploymentConfig();
