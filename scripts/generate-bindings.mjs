import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { run } from './lib.mjs';

const buildDir = 'target/wasm32v1-none/release';
const contracts = [
  {
    packageName: 'token',
    wasmPath: `${buildDir}/token.wasm`,
    outputDir: 'packages/token-bindings',
    packageJsonName: '@builder-stellar/token-bindings'
  },
  {
    packageName: 'governor',
    wasmPath: `${buildDir}/governor.wasm`,
    outputDir: 'packages/governor-bindings',
    packageJsonName: '@builder-stellar/governor-bindings'
  },
  {
    packageName: 'treasury',
    wasmPath: `${buildDir}/treasury.wasm`,
    outputDir: 'packages/treasury-bindings',
    packageJsonName: '@builder-stellar/treasury-bindings'
  },
  {
    packageName: 'auction',
    wasmPath: `${buildDir}/auction.wasm`,
    outputDir: 'packages/auction-bindings',
    packageJsonName: '@builder-stellar/auction-bindings'
  },
  {
    packageName: 'manager',
    wasmPath: `${buildDir}/manager.wasm`,
    outputDir: 'packages/manager-bindings',
    packageJsonName: '@builder-stellar/manager-bindings'
  },
  {
    packageName: 'metadata',
    wasmPath: `${buildDir}/metadata.wasm`,
    outputDir: 'packages/metadata-bindings',
    packageJsonName: '@builder-stellar/metadata-bindings'
  }
];

function rewritePackageJsonName(outputDir, packageJsonName) {
  const packageJsonPath = `${outputDir}/package.json`;
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  packageJson.name = packageJsonName;
  packageJson.dependencies['@stellar/stellar-sdk'] = '^17.0.1';
  writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

function replaceNth(content, search, replacement, targetIndex) {
  let seen = 0;
  return content
    .split(search)
    .map((segment, index) => {
      if (index === 0) {
        return segment;
      }

      seen += 1;
      return `${seen === targetIndex ? replacement : search}${segment}`;
    })
    .join('');
}

function patchGeneratedBindings(packageName, outputDir) {
  // Note: We keep .js extensions as-is for ES module compatibility
  const typesPath = `${outputDir}/src/types.ts`;
  const clientPath = `${outputDir}/src/client.ts`;

  // The SDK generator emits error enums as value-only objects, while clients
  // use them as the error type in Result return values.
  if (packageName === 'manager') {
    let typesContent = readFileSync(typesPath, 'utf8');
    typesContent = typesContent.replace(
      '/**\n * Event: DaoCreated',
      'export type ManagerError = typeof ManagerError[keyof typeof ManagerError];\n\n/**\n * Event: DaoCreated'
    );
    writeFileSync(typesPath, typesContent);
  }

  // Patch types.ts for Point and ComplianceError issues
  if (packageName === 'token') {
    let typesContent = readFileSync(typesPath, 'utf8');

    // Add Point type alias with Buffer import
    typesContent = typesContent.replace(
      "import {Address, xdr} from '@stellar/stellar-sdk';",
      "import {Address, xdr} from '@stellar/stellar-sdk';\nimport {Buffer} from 'buffer';\n\ntype Point = Buffer;"
    );

    // Rename duplicate ComplianceError to ComplianceHookError
    typesContent = replaceNth(typesContent, 'export const ComplianceError = {', 'export const ComplianceHookError = {', 2);

    writeFileSync(typesPath, typesContent);
  }

  // Patch client.ts for function parameter (reserved keyword)
  if (packageName === 'treasury') {
    let clientContent = readFileSync(clientPath, 'utf8');

    // Rename 'function' parameter to 'function_' (reserved keyword)
    clientContent = clientContent.replace(
      /execute\(\s*{\s*target,\s*function,\s*args\s*}:\s*{\s*target:\s*string,\s*function:\s*string,/g,
      'execute({ target, function_, args }: { target: string, function_: string,'
    );

    writeFileSync(clientPath, clientContent);
  }
}

run('cargo', ['build', '-p', 'token', '-p', 'governor', '-p', 'treasury', '-p', 'auction', '-p', 'manager', '-p', 'metadata', '--release', '--target', 'wasm32v1-none'], {
  env: {
    ...process.env,
    SOROBAN_SDK_BUILD_SYSTEM_SUPPORTS_SPEC_SHAKING_V2: '0'
  }
});

for (const contract of contracts) {
  mkdirSync(contract.outputDir, { recursive: true });
  run('pnpm', [
    'dlx',
    '@stellar/stellar-sdk@17.0.1',
    'generate',
    '--wasm',
    contract.wasmPath,
    '--output-dir',
    contract.outputDir,
    '--contract-name',
    contract.packageName,
    '--overwrite'
  ]);
  patchGeneratedBindings(contract.packageName, contract.outputDir);
  rewritePackageJsonName(contract.outputDir, contract.packageJsonName);
}
