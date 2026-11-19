import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Keypair } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { builtHashes, compareHashes, CONTRACTS, describeMismatch, fundIdentities } from '../src/preflight.ts';

const hashes = (value: string) => Object.fromEntries(CONTRACTS.map(({ name }) => [name, value]));

describe('compareHashes', () => {
  it('passes when every contract matches', () => {
    expect(compareHashes(hashes('aa'), hashes('aa'))).toEqual([]);
  });

  it('names each mismatch, including an unset implementation', () => {
    const onChain = { ...hashes('aa'), governor: 'old', minter: null };
    const mismatches = compareHashes(onChain, hashes('aa'));
    expect(mismatches).toEqual([
      { contract: 'governor', onChain: 'old', built: 'aa' },
      { contract: 'minter', onChain: null, built: 'aa' }
    ]);
    const message = describeMismatch({ status: 'mismatch', manager: 'CMAN', mismatches });
    expect(message).toMatch(/CMAN does not run this checkout's contracts/);
    expect(message).toMatch(/governor\s+on chain old/);
    expect(message).toMatch(/minter\s+on chain \(unset\)/);
  });
});

describe('builtHashes', () => {
  it('hashes target/wasm32v1-none/release/*.wasm and refuses a missing build', () => {
    const root = mkdtempSync(join(tmpdir(), 'preflight-'));
    try {
      expect(() => builtHashes(root)).toThrow(/run stellar contract build/);
      mkdirSync(join(root, 'target/wasm32v1-none/release'), { recursive: true });
      for (const { name } of CONTRACTS) writeFileSync(join(root, 'target/wasm32v1-none/release', `${name}.wasm`), name);
      const built = builtHashes(root);
      // sha256("manager")
      expect(built.manager).toBe('6ee4a469cd4e91053847f5d3fcb61dbcc91e8f0ef10be7748da4c4a1ba382d17');
      expect(Object.keys(built)).toHaveLength(CONTRACTS.length);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('fundIdentities', () => {
  const identity = (name: string) => {
    const keypair = Keypair.random();
    return { name, address: keypair.publicKey(), keypair };
  };

  it('creates missing accounts, tops up low ones, leaves funded ones, and logs no secrets', async () => {
    const fresh = identity('e2e-founder');
    const low = identity('e2e-member-a');
    const rich = identity('e2e-member-b');
    const balances = new Map<string, number | null>([
      [fresh.address, null],
      [low.address, 50],
      [rich.address, 9_000]
    ]);
    const friendbotted: string[] = [];
    const merged: string[] = [];
    const lines: string[] = [];
    const results = await fundIdentities([fresh, low, rich], {
      log: (line) => lines.push(line),
      deps: {
        balance: async (address) => (balances.has(address) ? (balances.get(address) as number | null) : 10_000),
        friendbot: async (address) => {
          friendbotted.push(address);
          if (balances.has(address)) balances.set(address, 10_000);
        },
        mergeInto: async (target) => {
          merged.push(target);
          balances.set(target, (balances.get(target) ?? 0) + 10_000);
        }
      }
    });
    expect(results.map((r) => r.action)).toEqual(['created', 'topped-up', 'ok']);
    expect(friendbotted[0]).toBe(fresh.address);
    expect(friendbotted).toHaveLength(2); // the fresh account and a throwaway donor
    expect(merged).toEqual([low.address]);
    const printed = lines.join('\n');
    for (const { keypair } of [fresh, low, rich]) expect(printed).not.toContain(keypair.secret());
    expect(printed).toContain(fresh.address);
  });
});
