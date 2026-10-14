import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Keypair, StrKey } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { claimEntries, parseClaimCsv } from './minter/claim-csv';
import { MAX_TREE_CLAIMS } from './minter/tree';
import { combineDuplicates, parseWalletCsv, SAMPLE_WALLET_ADDRESSES, walletRowsCsv } from './wallet-csv';

const alice = Keypair.random().publicKey();
const bob = Keypair.random().publicKey();
const contract = StrKey.encodeContract(new Uint8Array(32).fill(3));

describe('wallet list CSV', () => {
  it('reads a header row, extra columns, quotes and every common separator', () => {
    const parsed = parseClaimCsv(`﻿name,amount,wallet\r\n"Alice",5,"${alice}"\nBob;2;${bob}\n`);
    expect(parsed.problems).toEqual([]);
    expect(parsed.rows).toEqual([
      { line: 2, address: alice, amount: '5' },
      { line: 3, address: bob, amount: '2' }
    ]);
    expect(parsed.total).toBe(7n);
    expect(parseClaimCsv(`${alice}\t3\n${contract} 1`).rows.map((row) => row.amount)).toEqual(['3', '1']);
  });
  it('reports every bad row with its line number instead of stopping at the first', () => {
    const parsed = parseClaimCsv(
      ['address,amount', `${alice},5`, 'GNOTREAL,1', `${bob},0`, `${bob},1.5`, `${bob}`, '# a comment', ''].join('\n')
    );
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.problems.map((problem) => problem.line)).toEqual([3, 4, 5, 6]);
    expect(parsed.problems[0]!.message).toContain("isn't a Stellar address");
    expect(parsed.problems[1]!.message).toContain('above zero');
    expect(claimEntries(parsed)).toBeNull();
  });
  it('normalizes lowercase addresses and leading zeros the tree would refuse', () => {
    expect(parseClaimCsv(`${alice.toLowerCase()},007`).rows).toEqual([{ line: 1, address: alice, amount: '7' }]);
  });
  it('flags repeat wallets, and combining them sums their amounts at the first line', () => {
    const parsed = parseClaimCsv(`${alice},2\n${bob},1\n${alice},3`);
    expect(parsed.duplicates).toEqual([{ address: alice, lines: [1, 3] }]);
    expect(claimEntries(parsed)).toBeNull();
    const combined = combineDuplicates(parsed.rows);
    expect(combined).toEqual([
      { line: 1, address: alice, amount: '5' },
      { line: 2, address: bob, amount: '1' }
    ]);
    const reparsed = parseClaimCsv(walletRowsCsv(combined));
    expect(claimEntries(reparsed)).toEqual([
      { address: alice, amount: '5' },
      { address: bob, amount: '1' }
    ]);
  });
  it('enforces the claim list caps on wallets and tokens, and no caps unless asked', () => {
    const many = Array.from({ length: MAX_TREE_CLAIMS + 1 }, () => `${Keypair.random().publicKey()},1`).join('\n');
    expect(parseClaimCsv(many).problems.at(-1)!.message).toContain('10,000 wallets');
    const huge = parseClaimCsv(`${alice},4294967295\n${bob},1`);
    expect(huge.problems.at(-1)!.message).toContain('more tokens than one list can hold');
    expect(parseWalletCsv(`${alice},4294967296`).problems).toEqual([]);
  });
  it('ships a sample that parses, and never lets its example wallets through', () => {
    const sample = readFileSync(join(process.cwd(), 'public/samples/wallets-sample.csv'), 'utf8');
    const parsed = parseClaimCsv(sample);
    expect(parsed.problems).toHaveLength(SAMPLE_WALLET_ADDRESSES.size);
    expect(parsed.problems.every((problem) => problem.message.includes('example wallet'))).toBe(true);
    const own = sample.replace(/^G[A-Z2-7]{55}/gm, () => Keypair.random().publicKey());
    expect(claimEntries(parseClaimCsv(own))).toHaveLength(3);
  });
});
