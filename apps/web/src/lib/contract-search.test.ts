import { StrKey } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { shortenId } from '@/components/ui';

import { contractLabel, coreContracts, matchContract, parseContractQuery } from './contract-search';

const contractId = (seed: number) => StrKey.encodeContract(Buffer.alloc(32, seed));

const dao = {
  manager_contract: contractId(1),
  token_contract: contractId(2),
  governor_contract: contractId(3),
  treasury_contract: contractId(4),
  metadata_contract: contractId(5),
  auction_contract: contractId(6),
  marketplace_contract: null,
  claims_contract: null
};
const external = { role: 'module', label: contractLabel('module', 'custom_savings_vault'), id: contractId(7) };
const contracts = [...coreContracts(dao), external];

const find = (query: string) => matchContract(parseContractQuery(query), contracts);

describe('parseContractQuery', () => {
  it('reads a full contract ID, ignoring case and pasted whitespace', () => {
    const id = contractId(4);
    expect(parseContractQuery(id)).toEqual({ kind: 'full', id });
    expect(parseContractQuery(` ${id.slice(0, 20)}\n${id.slice(20).toLowerCase()} `)).toEqual({ kind: 'full', id });
  });

  it('reads the shortened form with an ellipsis or three dots', () => {
    const id = contractId(3);
    expect(parseContractQuery(shortenId(id))).toEqual({ kind: 'short', head: id.slice(0, 6), tail: id.slice(-6) });
    expect(parseContractQuery(`${id.slice(0, 4)}...${id.slice(-4)}`)).toMatchObject({ kind: 'short' });
  });

  it('flags account addresses and IDs with a bad checksum', () => {
    expect(parseContractQuery(StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 9)))).toEqual({ kind: 'account' });
    const id = contractId(4);
    const broken = `${id.slice(0, -1)}${id.endsWith('A') ? 'B' : 'A'}`;
    expect(parseContractQuery(broken)).toEqual({ kind: 'malformed' });
  });

  it('ignores queries too short or not made of ID characters', () => {
    expect(parseContractQuery('CABC')).toBeNull();
    expect(parseContractQuery('lantern-dao #1')).toBeNull();
    expect(parseContractQuery('')).toBeNull();
  });
});

describe('matchContract', () => {
  it('finds any core contract or registered module by its full ID', () => {
    expect(find(contractId(4))?.label).toBe('Treasury contract');
    expect(find(contractId(6))?.label).toBe('Auction contract');
    expect(find(contractId(7))?.label).toBe('Savings vault module');
  });

  it('finds a contract by its shortened form or a fragment', () => {
    expect(find(shortenId(contractId(3)))?.role).toBe('governor');
    expect(find(contractId(5).slice(10, 18).toLowerCase())?.role).toBe('metadata');
  });

  it('never matches the shared Manager or an account', () => {
    expect(find(dao.manager_contract)).toBeNull();
    expect(find(StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 2)))).toBeNull();
  });
});

describe('contractLabel', () => {
  it('names known roles and external modules', () => {
    expect(contractLabel('marketplace')).toBe('Market contract');
    expect(contractLabel('module', 'custom_grants')).toBe('Grants module');
    expect(contractLabel('module', null)).toBe('Module');
  });
});
