// Regenerates packages/*-bindings from the contract WASMs.
// Usage: pnpm contracts:bindings   (then: pnpm --filter @builder-stellar/<name>-bindings build)
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
  },
  {
    packageName: 'marketplace',
    wasmPath: `${buildDir}/marketplace.wasm`,
    outputDir: 'packages/marketplace-bindings',
    packageJsonName: '@builder-stellar/marketplace-bindings'
  }
];

function rewritePackageJsonName(outputDir, packageJsonName) {
  const packageJsonPath = `${outputDir}/package.json`;
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  packageJson.name = packageJsonName;
  packageJson.dependencies['@stellar/stellar-sdk'] = '^17.0.1';
  writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

function patchGeneratedBindings(packageName, outputDir) {
  const typesPath = `${outputDir}/src/types.ts`;

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
}

// Build with the same toolchain path that produces the deployable WASM
// (`stellar contract build`, spec shaking v2 on). The legacy
// SOROBAN_SDK_BUILD_SYSTEM_SUPPORTS_SPEC_SHAKING_V2=0 build embeds every
// unused library type (e.g. OpenZeppelin RWA/Governor enums) in the spec, which
// makes the generator emit duplicate/colliding types and bindings that do not
// match the deployed contract spec.
run('stellar', ['contract', 'build']);

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

// `generate --overwrite` deletes each package's node_modules (the pnpm symlinks
// to @stellar/stellar-sdk, buffer and typescript). Without relinking, `tsc`
// fails with "Cannot find module '@stellar/stellar-sdk'" and the cascading
// "Property 'spec'/'txFromJson' does not exist on type 'Client'" errors.
run('pnpm', ['install']);
