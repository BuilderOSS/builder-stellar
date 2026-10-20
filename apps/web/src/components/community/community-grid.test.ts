import { StrKey } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { coreContracts } from '@/lib/contract-search';
import type { DaoConfig } from '@/lib/dao-db';

import { type CommunitySort, compareCommunities, searchCommunities } from './community-grid';

const communities = [
  { name: 'Lantern', createdLedger: 20 },
  { name: 'Anchor', createdLedger: 30 },
  { name: 'Mesa', createdLedger: 10 }
];

const order = (sort: CommunitySort) =>
  [...communities].sort((a, b) => compareCommunities(sort, a, b)).map((item) => item.name);

describe('compareCommunities', () => {
  it('sorts by creation in both directions', () => {
    expect(order('newest')).toEqual(['Anchor', 'Lantern', 'Mesa']);
    expect(order('oldest')).toEqual(['Mesa', 'Lantern', 'Anchor']);
  });

  it('sorts by name in both directions', () => {
    expect(order('name')).toEqual(['Anchor', 'Lantern', 'Mesa']);
    expect(order('name-desc')).toEqual(['Mesa', 'Lantern', 'Anchor']);
  });
});

describe('searchCommunities', () => {
  const contractId = (seed: number) => StrKey.encodeContract(Buffer.alloc(32, seed));
  const dao = (seed: number, name: string) =>
    ({
      dao_id: contractId(seed),
      token_contract: contractId(seed),
      governor_contract: contractId(seed + 1),
      treasury_contract: contractId(seed + 2),
      metadata_contract: null,
      auction_contract: null,
      marketplace_contract: null,
      claims_contract: null,
      manager_contract: contractId(99),
      token_name: name,
      token_symbol: name.slice(0, 3).toUpperCase(),
      description: '',
      status: 'operational',
      created_ledger: seed
    }) as unknown as DaoConfig;
  const daos = [dao(10, 'Lantern'), dao(20, 'Anchor')];
  const grants = { role: 'module', label: 'Grants module', id: contractId(50) };
  const contracts = { [contractId(20)]: [...coreContracts(daos[1]), grants] };
  const names = (query: string) =>
    searchCommunities(daos, contracts, query).map(({ summary }) => [summary.name, summary.match?.label]);

  it('finds a tribe by name without a contract note', () => {
    expect(names('lant')).toEqual([['Lantern', undefined]]);
  });

  it('finds a tribe by any of its contracts and says which matched', () => {
    expect(names(contractId(12))).toEqual([['Lantern', 'Treasury contract']]);
    expect(names(contractId(50))).toEqual([['Anchor', 'Grants module']]);
  });

  it('falls back to the record contracts when no index is given', () => {
    expect(searchCommunities(daos, undefined, contractId(21)).map(({ summary }) => summary.name)).toEqual(['Anchor']);
  });

  it('matches nothing for the shared Manager', () => {
    expect(names(contractId(99))).toEqual([]);
  });
});
