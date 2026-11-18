import { describe, expect, it } from 'vitest';

import {
  buildBundle,
  bundleFileStem,
  bundleToMarkdown,
  type ChainFacts,
  emptyDraft,
  type EntityDraft,
  hasErrors,
  kycAssessment,
  LEGAL_EXPORT_SCHEMA,
  shareBps,
  suggestLegalName,
  validateDraft
} from './bundle';

const G1 = `G${'A'.repeat(55)}`;
const G2 = `G${'B'.repeat(55)}`;
const G3 = `G${'C'.repeat(55)}`;

const draft = (overrides: Partial<EntityDraft> = {}): EntityDraft => ({
  ...emptyDraft('Lantern Club', 'A neighbourhood tribe that funds street lights.'),
  contact: { name: 'Ana', email: 'ana@example.com', role: 'Founder' },
  ...overrides
});

const facts = (overrides: Partial<ChainFacts> = {}): ChainFacts => ({
  generatedAt: '2026-11-18T10:00:00.000Z',
  network: 'testnet',
  networkPassphrase: 'Test SDF Network ; September 2015',
  tribe: {
    name: 'Lantern Club',
    daoId: 'CTOKEN',
    url: 'https://tribes.build/dao/lantern',
    status: 'operational',
    links: []
  },
  token: {
    name: 'Lantern',
    symbol: 'LNT',
    totalSupply: '12',
    votingSupply: '10',
    transfersLocked: false,
    membersOnlyDelegation: false,
    daoRecovery: false
  },
  launchModes: { auction: true, claims: false, marketplace: true },
  contracts: [
    { role: 'Token', address: 'CTOKEN', explorerUrl: 'https://stellar.expert/explorer/testnet/contract/CTOKEN' }
  ],
  governance: {
    votingDelaySeconds: 86_400,
    votingPeriodSeconds: 3 * 86_400,
    proposalThreshold: '1',
    quorumBps: 1_000,
    safetyDelaySeconds: 2 * 86_400
  },
  treasury: { address: 'CTREASURY', balances: [{ asset: 'XLM', amount: '120.0000000' }] },
  members: {
    count: 3,
    holders: [
      { address: G1, votingPower: 5n },
      { address: G2, votingPower: 3n },
      { address: G3, votingPower: 2n }
    ]
  },
  ...overrides
});

describe('suggestLegalName', () => {
  it('adds the DAO LLC suffix once', () => {
    expect(suggestLegalName('Lantern Club')).toBe('Lantern Club DAO LLC');
    expect(suggestLegalName('Lantern DAO')).toBe('Lantern DAO LLC');
    expect(suggestLegalName('Lantern DAO LLC')).toBe('Lantern DAO LLC');
    expect(suggestLegalName('  ')).toBe('');
  });
});

describe('validateDraft', () => {
  it('accepts a complete draft, with or without the space before LLC', () => {
    expect(hasErrors(validateDraft(draft()))).toBe(false);
    expect(hasErrors(validateDraft(draft({ legalName: 'Lantern DAOLLC' })))).toBe(false);
  });

  it('needs the suffix, a real purpose and a contact', () => {
    const errors = validateDraft(
      draft({ legalName: 'Lantern Ltd', purpose: 'Lights', contact: { name: '', email: 'nope', role: '' } })
    );
    expect(Object.keys(errors).sort()).toEqual(['contactEmail', 'contactName', 'legalName', 'purpose']);
  });

  it('checks each manager', () => {
    const errors = validateDraft(
      draft({
        managers: [
          { name: '', role: 'Ops', wallet: '' },
          { name: 'Bo', role: '', wallet: 'not-an-address' },
          { name: 'Cy', role: '', wallet: G1 }
        ]
      })
    );
    expect(Object.keys(errors.managers ?? {})).toEqual(['0', '1']);
  });
});

describe('kycAssessment', () => {
  it('rounds the share down', () => {
    expect(shareBps(1n, 3n)).toBe(3_333);
    expect(shareBps(1n, 0n)).toBe(0);
  });

  it('lists holders at or above 25% as category A', () => {
    const { category, owners } = kycAssessment(facts().members.holders, 10n, []);
    expect(category).toBe('A');
    expect(owners.map((o) => [o.address, o.bps])).toEqual([
      [G1, 5_000],
      [G2, 3_000]
    ]);
  });

  it('falls back to managers, then to any member', () => {
    const spread = [1n, 1n, 1n, 1n, 1n].map((votingPower, i) => ({ address: `G${i}`, votingPower }));
    expect(kycAssessment(spread, 5n, [{ name: 'Bo', role: '', wallet: '' }]).category).toBe('B');
    expect(kycAssessment(spread, 5n, []).category).toBe('C');
  });
});

describe('buildBundle', () => {
  it('combines the answers and the chain facts', () => {
    const bundle = buildBundle(draft({ managers: [{ name: ' Bo ', role: 'Ops', wallet: '' }] }), facts());
    expect(bundle.$schema).toBe(LEGAL_EXPORT_SCHEMA);
    expect(bundle.entity.proposedLegalName).toBe('Lantern Club DAO LLC');
    expect(bundle.entity.managers).toEqual([{ name: 'Bo', role: 'Ops', wallet: null }]);
    expect(bundle.beneficialOwnership.category).toBe('A');
    expect(bundle.beneficialOwnership.holdersAtOrAboveThreshold[0]).toEqual({
      address: G1,
      votingPower: '5',
      shareBps: 5_000
    });
    // Bigints never reach JSON.stringify.
    expect(() => JSON.stringify(bundle)).not.toThrow();
  });

  it('still builds when the governor or treasury could not be read', () => {
    const bundle = buildBundle(draft(), facts({ governance: null, treasury: { address: 'CT', balances: null } }));
    expect(bundle.governance).toBeNull();
    expect(bundleToMarkdown(bundle)).toContain('could not be read');
  });
});

describe('bundleToMarkdown', () => {
  it('leads with the disclaimer and spells out the rules', () => {
    const markdown = bundleToMarkdown(buildBundle(draft(), facts()));
    expect(markdown.split('\n')[2]).toMatch(/^> .*not legal advice/);
    expect(markdown).toContain('**Quorum:** 10% of tokens with votes');
    expect(markdown).toContain('**Voting period:** 3 days');
    expect(markdown).toContain(`| ${G1} | 5 | 50% |`);
  });
});

describe('bundleFileStem', () => {
  it('names the files after the entity and the date', () => {
    expect(bundleFileStem(buildBundle(draft(), facts()))).toBe('lantern-club-dao-llc-2026-11-18');
  });
});
