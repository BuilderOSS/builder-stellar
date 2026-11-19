import { describe, expect, it } from 'vitest';

import {
  buildBundle,
  bundleFileStem,
  bundleToMarkdown,
  type ChainFacts,
  emptyDraft,
  type EntityDraft,
  hasErrors,
  holderKind,
  kycAssessment,
  LEGAL_EXPORT_SCHEMA,
  shareBps,
  suggestLegalName,
  validateDraft
} from './bundle';

const G1 = `G${'A'.repeat(55)}`;
const G2 = `G${'B'.repeat(55)}`;
const G3 = `G${'C'.repeat(55)}`;
const C_MULTISIG = `C${'M'.repeat(55)}`;
const C_TREASURY = `C${'T'.repeat(55)}`;

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
  voteSource: { address: 'CTOKEN', isToken: true },
  launchModes: { auction: true, claims: false, marketplace: true },
  contracts: [
    { role: 'Token', address: 'CTOKEN', explorerUrl: 'https://stellar.expert/explorer/testnet/contract/CTOKEN' },
    {
      role: 'Treasury',
      address: C_TREASURY,
      explorerUrl: `https://stellar.expert/explorer/testnet/contract/${C_TREASURY}`
    }
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
      { address: G1, ownedTokens: 5n, votingPower: 5n },
      { address: G2, ownedTokens: 3n, votingPower: 3n },
      { address: G3, ownedTokens: 2n, votingPower: 2n },
      { address: C_TREASURY, ownedTokens: 2n, votingPower: 0n }
    ]
  },
  ...overrides
});

describe('suggestLegalName', () => {
  it('adds the DAO LLC suffix once', () => {
    expect(suggestLegalName('Lantern Club')).toBe('Lantern Club DAO LLC');
    expect(suggestLegalName('Lantern DAO')).toBe('Lantern DAO LLC');
    expect(suggestLegalName('Lantern DAO LLC')).toBe('Lantern DAO LLC');
    // MIDAO's own example: the space before "DAO LLC" is the optional one.
    expect(suggestLegalName('MIDAO')).toBe('MIDAO LLC');
    expect(suggestLegalName('  ')).toBe('');
  });
});

describe('validateDraft', () => {
  it('accepts names ending in "DAO LLC", with or without a space before DAO', () => {
    expect(hasErrors(validateDraft(draft()))).toBe(false);
    expect(hasErrors(validateDraft(draft({ legalName: 'MIDAO LLC' })))).toBe(false);
    expect(hasErrors(validateDraft(draft({ legalName: 'MI DAO LLC' })))).toBe(false);
  });

  it('rejects "DAOLLC": the phrase keeps its space', () => {
    expect(validateDraft(draft({ legalName: 'Lantern DAOLLC' })).legalName).toBeTruthy();
  });

  it('asks a non-profit for its kind of good works, and checks the dollar estimate', () => {
    expect(validateDraft(draft({ entityType: 'non-profit' })).nonProfitPurpose).toBeTruthy();
    expect(
      validateDraft(draft({ entityType: 'non-profit', nonProfitPurpose: 'educational' })).nonProfitPurpose
    ).toBeUndefined();
    expect(validateDraft(draft({ fundingUsdEstimate: '45,000' })).fundingUsdEstimate).toBeUndefined();
    expect(validateDraft(draft({ fundingUsdEstimate: 'lots' })).fundingUsdEstimate).toBeTruthy();
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

  const supply = { minted: 12n, voting: 10n };
  const tribe = ['CTOKEN', C_TREASURY];

  it("counts ownership of all tokens minted, and leaves the tribe's own contracts out of the owners", () => {
    const { category, owners, tribeHeld } = kycAssessment(facts().members.holders, supply, [], tribe);
    expect(category).toBe('A');
    expect(owners.map((o) => [o.address, o.ownershipBps])).toEqual([
      [G1, 4_166],
      [G2, 2_500]
    ]);
    expect(tribeHeld).toEqual([]);
  });

  it('reports a delegate with 25% of the votes beside the owners, not as one', () => {
    const holders = [
      { address: G1, ownedTokens: 1n, votingPower: 6n },
      { address: G2, ownedTokens: 5n, votingPower: 0n }
    ];
    const { owners, votingOnly } = kycAssessment(holders, { minted: 10n, voting: 10n }, [], tribe);
    expect(owners.map((o) => o.address)).toEqual([G2]);
    expect(votingOnly.map((o) => [o.address, o.votingBps])).toEqual([[G1, 6_000]]);
  });

  it('flags a contract owner for a KYB look-through and lists tribe-held tokens apart', () => {
    const holders = [
      { address: C_MULTISIG, ownedTokens: 4n, votingPower: 4n },
      { address: C_TREASURY, ownedTokens: 4n, votingPower: 0n }
    ];
    const { owners, tribeHeld } = kycAssessment(holders, { minted: 10n, voting: 6n }, [], tribe);
    expect(owners.map((o) => o.kind)).toEqual(['contract']);
    expect(tribeHeld.map((o) => o.address)).toEqual([C_TREASURY]);
    expect(holderKind(G1, tribe)).toBe('account');
  });

  it("doesn't guess a category when the holders or the minted supply couldn't be read", () => {
    expect(kycAssessment(null, supply, [], tribe).category).toBe('unknown');
    expect(kycAssessment(facts().members.holders, { minted: null, voting: 10n }, [], tribe)).toEqual({
      category: 'unknown',
      owners: [],
      votingOnly: [],
      tribeHeld: []
    });
  });

  it('falls back to managers, then to any member', () => {
    const spread = [1n, 1n, 1n, 1n, 1n].map((n, i) => ({ address: `G${i}`, ownedTokens: n, votingPower: n }));
    const five = { minted: 5n, voting: 5n };
    expect(kycAssessment(spread, five, [{ name: 'Bo', role: '', wallet: '' }], tribe).category).toBe('B');
    expect(kycAssessment(spread, five, [], tribe).category).toBe('C');
  });
});

describe('buildBundle', () => {
  it('combines the answers and the chain facts', () => {
    const bundle = buildBundle(draft({ managers: [{ name: ' Bo ', role: 'Ops', wallet: '' }] }), facts());
    expect(bundle.$schema).toBe(LEGAL_EXPORT_SCHEMA);
    expect(bundle.entity.proposedLegalName).toBe('Lantern Club DAO LLC');
    expect(bundle.entity.managers).toEqual([{ name: 'Bo', role: 'Ops', wallet: null }]);
    expect(bundle.beneficialOwnership.category).toBe('A');
    expect(bundle.beneficialOwnership.owners[0]).toMatchObject({
      address: G1,
      kind: 'account',
      tokensOwned: '5',
      ownershipShareBps: 4_166,
      votingPower: '5',
      votingShareBps: 5_000
    });
    expect(bundle.operatingAgreementProfile).toMatchObject({
      membershipTracking: 'blockchain',
      voting: 'one-token-one-vote',
      governance: 'smart-contract'
    });
    expect(bundle.entity.management).toMatch(/^Governance delegated to the smart contracts/);
    expect(bundle.smartContracts.every((c) => c.status === 'live')).toBe(true);
    expect(bundle.initialContributions.treasuryAddress).toBe('CTREASURY');
    expect(bundle.sources.naming).toContain('docs.midao.org');
    // Bigints never reach JSON.stringify.
    expect(() => JSON.stringify(bundle)).not.toThrow();
  });

  it('marks a tribe in setup as not yet live and describes an adapter vote source', () => {
    const bundle = buildBundle(
      draft(),
      facts({
        tribe: { ...facts().tribe, status: 'pending' },
        voteSource: { address: C_MULTISIG, isToken: false }
      })
    );
    expect(bundle.smartContracts[0].status).toBe('deployed, not yet live');
    expect(bundle.operatingAgreementProfile.voting).toBe('vote-source-weighted');
    expect(bundle.membership.voteSource).toBe(C_MULTISIG);
  });

  it('keeps for-profit and non-profit answers only for their own type', () => {
    const forProfit = buildBundle(
      draft({ entityType: 'for-profit', usMembers: 'yes', nonProfitPurpose: 'charitable' }),
      facts()
    );
    expect(forProfit.entity.forProfit).toEqual({ profitAllocation: null, usMembers: 'yes' });
    expect(forProfit.entity.nonProfitPurposeCategory).toBeNull();
    const nonProfit = buildBundle(draft({ entityType: 'non-profit', nonProfitPurpose: 'educational' }), facts());
    expect(nonProfit.entity.forProfit).toBeNull();
    expect(nonProfit.entity.nonProfitPurposeCategory).toBe('educational');
  });

  it('says the category is not known when the holders failed to load', () => {
    const bundle = buildBundle(
      draft({ managers: [{ name: 'Bo', role: '', wallet: '' }] }),
      facts({ members: { count: null, holders: null } })
    );
    expect(bundle.beneficialOwnership.category).toBe('unknown');
    expect(bundleToMarkdown(bundle)).toContain(
      "**Category not known.** The token holders or the number of tokens minted couldn't be read"
    );
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
    expect(markdown).toContain(`| ${G1} | Stellar account | 5 | 41.66% | 5 | 50% |`);
    expect(markdown).toContain('## Operating agreement profile');
    expect(markdown).toContain('## Sources');
  });
});

describe('bundleFileStem', () => {
  it('names the files after the entity and the date', () => {
    expect(bundleFileStem(buildBundle(draft(), facts()))).toBe('lantern-club-dao-llc-2026-11-18');
  });
});
