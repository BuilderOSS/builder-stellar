import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Client as AuctionClient } from '@builder-stellar/auction-bindings';
import { Client as ClaimMinterClient } from '@builder-stellar/claim-minter-bindings';
import { Client as GovernorClient } from '@builder-stellar/governor-bindings';
import { Client as ManagerClient } from '@builder-stellar/manager-bindings';
import { Client as MarketplaceClient } from '@builder-stellar/marketplace-bindings';
import { Client as MetadataClient } from '@builder-stellar/metadata-bindings';
import { Client as TokenClient } from '@builder-stellar/token-bindings';
import { Client as TreasuryClient } from '@builder-stellar/treasury-bindings';
import { Networks, StrKey, xdr } from '@stellar/stellar-sdk';
import { Spec } from '@stellar/stellar-sdk/contract';
import { describe, expect, it } from 'vitest';

/**
 * The web encodes every proposal call from the generated bindings' spec (proposal-supported-calls.ts).
 * If a contract changes and `pnpm contracts:bindings` is not re-run, proposals encode against the old
 * ABI. This compares each package's spec with the WASM built from the contracts in this checkout.
 *
 * Needs `stellar contract build` (the same build `scripts/generate-bindings.mjs` uses), or the WASM
 * directory in CONTRACT_WASM_DIR. Without the WASM the suite is skipped, unless
 * REQUIRE_CONTRACT_WASM=1, when it fails instead (for CI).
 */
const WASM_DIR = process.env.CONTRACT_WASM_DIR
  ? `${process.env.CONTRACT_WASM_DIR.replace(/\/$/, '')}/`
  : fileURLToPath(new URL('../../../../target/wasm32v1-none/release/', import.meta.url));
const options = {
  contractId: StrKey.encodeContract(new Uint8Array(32).fill(1)),
  rpcUrl: 'https://rpc.test',
  networkPassphrase: Networks.TESTNET
};

const packages = [
  ['token', TokenClient],
  ['governor', GovernorClient],
  ['treasury', TreasuryClient],
  ['auction', AuctionClient],
  ['manager', ManagerClient],
  ['metadata', MetadataClient],
  ['marketplace', MarketplaceClient],
  // The ClaimMinter crate is `minter`; its bindings package is claim-minter-bindings.
  ['minter', ClaimMinterClient]
] as const;

/** Doc comments are not part of the ABI; a reworded comment is not drift. */
function stripDocs(value: unknown): void {
  if (Array.isArray(value)) return value.forEach(stripDocs);
  if (!value || typeof value !== 'object' || ArrayBuffer.isView(value)) return;
  for (const [key, inner] of Object.entries(value)) {
    if (key === 'doc') (value as Record<string, unknown>).doc = '';
    else stripDocs(inner);
  }
}

/** "scSpecEntryFunctionV0:mint": an entry's kind and name. */
function entryName(entry: xdr.ScSpecEntry): string {
  const arm = Object.keys(entry).find((key) => key !== 'type')!;
  const body = (entry as unknown as Record<string, { name: { toString(): string } }>)[arm]!;
  return `${entry.type}:${body.name.toString()}`;
}

/** name → doc-free XDR, for functions and for every type, error and event entry. */
function abi(spec: Spec) {
  const functions = new Map<string, string>();
  const types = new Map<string, string>();
  for (const original of spec.entries) {
    const entry = xdr.ScSpecEntry.fromXDR(original.toXDR());
    stripDocs(entry);
    const name = entryName(entry);
    (entry.type === 'scSpecEntryFunctionV0' ? functions : types).set(name, entry.toXDR('base64'));
  }
  return { functions, types };
}

const missingWasm = packages.filter(([crate]) => !existsSync(`${WASM_DIR}${crate}.wasm`)).map(([crate]) => crate);
const required = process.env.REQUIRE_CONTRACT_WASM === '1';

describe('generated bindings match the compiled contracts', () => {
  if (missingWasm.length && !required) {
    it.skip(`skipped: no WASM for ${missingWasm.join(', ')} in target/wasm32v1-none/release (run \`stellar contract build\`)`, () => {});
    return;
  }

  it.each(packages)('%s bindings have the WASM’s functions, arguments and types', (crate, Client) => {
    expect(existsSync(`${WASM_DIR}${crate}.wasm`), `${crate}.wasm is missing; run \`stellar contract build\``).toBe(
      true
    );
    const built = abi(Spec.fromWasm(readFileSync(`${WASM_DIR}${crate}.wasm`)));
    const bound = abi(new Client(options).spec);
    const hint = `re-run \`pnpm contracts:bindings\` and rebuild the ${crate} bindings`;

    // Every function, with the same argument names, types and result.
    expect([...bound.functions.keys()].sort(), `function list differs; ${hint}`).toEqual(
      [...built.functions.keys()].sort()
    );
    for (const [name, encoded] of bound.functions)
      expect(encoded, `${name} signature differs; ${hint}`).toBe(built.functions.get(name));

    // Every type the bindings know is identical in the WASM. A legacy build without spec shaking v2
    // embeds extra library types, so the WASM may hold types the bindings leave out.
    for (const [name, encoded] of bound.types)
      expect(built.types.get(name), `${name} differs or is gone; ${hint}`).toBe(encoded);
  });
});
