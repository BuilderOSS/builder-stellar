/**
 * Wallets and token amounts from a spreadsheet (claim lists, founder tokens): one wallet and a
 * whole-token amount per row. Every problem is reported with its line number, so a list is fixed
 * in one pass rather than one error at a time.
 */
import { StrKey } from '@stellar/stellar-sdk';

/** A CSV past this size is not a wallet list (10,000 rows is about 600 KB). */
export const MAX_WALLET_CSV_BYTES = 2 * 1024 * 1024;
/** The example file offered next to every CSV import. */
export const SAMPLE_WALLET_CSV_URL = '/samples/wallets-sample.csv';
/** Its example wallets: never minted to or published by mistake. */
export const SAMPLE_WALLET_ADDRESSES = new Set([
  'GBKGHZQCCM5QAYXAFJVRGJTOYSMVMJ2KYXPN2AOZTLTQ6QLFUW46DU66',
  'GAZ4XOXVMEVU3EIW6L62ZBSIPFNCQGOBQBFLCVLUBEZ3AB2VHRTIX4FQ',
  'GAESSUP37IX22V2HFO7ALPHQWIHTIWC6BTRVWFMLE6ELBCLVNCWUY5PE'
]);

export type WalletRow = { line: number; address: string; amount: string };
export type WalletProblem = { line: number; message: string };
export type WalletDuplicate = { address: string; lines: number[] };
export type ParsedWalletList = {
  rows: WalletRow[];
  problems: WalletProblem[];
  duplicates: WalletDuplicate[];
  /** Every token the valid rows add up to. */
  total: bigint;
};
/** What the list feeds, e.g. one claim list: its caps become line-free problems. */
export type WalletListLimits = { holder: string; maxWallets: number; maxTokens: bigint };

const ADDRESS_HEADER = /^(address|wallet|account|recipient|stellar[ _-]?address|public[ _-]?key)$/i;
const AMOUNT_HEADER = /^(amount|tokens?|count|quantity|qty|allocation)$/i;

function cells(line: string) {
  const separated = /[,;\t]/.test(line) ? line.split(/[,;\t]/) : line.split(/\s+/);
  return separated.map((cell) =>
    cell
      .trim()
      .replace(/^"(.*)"$/, '$1')
      .trim()
  );
}

function isAddress(value: string) {
  return StrKey.isValidEd25519PublicKey(value) || StrKey.isValidContract(value);
}

/** Parse CSV, TSV or one "address amount" per line, with an optional header row naming the columns. */
export function parseWalletCsv(text: string, limits?: WalletListLimits): ParsedWalletList {
  const lines = text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((raw, index) => ({ line: index + 1, raw: raw.trim() }))
    .filter(({ raw }) => raw && !raw.startsWith('#'));
  let addressColumn = 0;
  let amountColumn = 1;
  const first = lines[0] ? cells(lines[0].raw) : [];
  const headerAddress = first.findIndex((cell) => ADDRESS_HEADER.test(cell));
  const headerAmount = first.findIndex((cell) => AMOUNT_HEADER.test(cell));
  if (headerAddress >= 0 || headerAmount >= 0) {
    lines.shift();
    if (headerAddress >= 0) addressColumn = headerAddress;
    if (headerAmount >= 0) amountColumn = headerAmount;
  }

  const rows: WalletRow[] = [];
  const problems: WalletProblem[] = [];
  const seen = new Map<string, number[]>();
  for (const { line, raw } of lines) {
    const row = cells(raw);
    const address = (row[addressColumn] ?? '').toUpperCase();
    const amount = row[amountColumn] ?? '';
    if (!address || !amount) {
      problems.push({ line, message: 'Needs a wallet address and an amount.' });
      continue;
    }
    if (!isAddress(address)) {
      problems.push({ line, message: `${row[addressColumn]} isn't a Stellar address.` });
      continue;
    }
    if (SAMPLE_WALLET_ADDRESSES.has(address)) {
      problems.push({ line, message: 'This is an example wallet from the sample file. Put a real one here.' });
      continue;
    }
    if (!/^\d+$/.test(amount) || BigInt(amount) === 0n) {
      problems.push({ line, message: `${amount} isn't a whole number of tokens above zero.` });
      continue;
    }
    if (limits && BigInt(amount) > limits.maxTokens) {
      problems.push({ line, message: `That is more tokens than ${limits.holder} can hold.` });
      continue;
    }
    rows.push({ line, address, amount: BigInt(amount).toString() });
    seen.set(address, [...(seen.get(address) ?? []), line]);
  }

  const total = rows.reduce((sum, row) => sum + BigInt(row.amount), 0n);
  if (limits && seen.size > limits.maxWallets)
    problems.push({
      line: 0,
      message: `${capitalize(limits.holder)} holds up to ${limits.maxWallets.toLocaleString()} wallets.`
    });
  if (limits && total > limits.maxTokens)
    problems.push({ line: 0, message: `The rows add up to more tokens than ${limits.holder} can hold.` });
  const duplicates = [...seen].filter(([, at]) => at.length > 1).map(([address, at]) => ({ address, lines: at }));
  return { rows, problems, duplicates, total };
}

function capitalize(text: string) {
  return text ? text[0]!.toUpperCase() + text.slice(1) : text;
}

/** One row per wallet, amounts summed, each at the line it first appeared on. */
export function combineDuplicates(rows: WalletRow[]): WalletRow[] {
  const combined = new Map<string, WalletRow>();
  for (const row of rows) {
    const existing = combined.get(row.address);
    combined.set(
      row.address,
      existing ? { ...existing, amount: (BigInt(existing.amount) + BigInt(row.amount)).toString() } : row
    );
  }
  return [...combined.values()];
}

/** Rows back to CSV, e.g. after combining duplicates. */
export function walletRowsCsv(rows: WalletRow[]) {
  return ['address,amount', ...rows.map((row) => `${row.address},${row.amount}`)].join('\n') + '\n';
}
