import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ADAPTER = `C${'B'.repeat(55)}`;
const state = vi.hoisted(() => ({
  approved: [] as Array<{ source: string; name: string; decimals: number }>,
  voteSource: '',
  /** Custom timings (no pace) open Advanced settings. */
  votingDelay: 86400
}));

vi.mock('@/lib/vote-source', () => ({ useApprovedVoteSources: () => ({ data: state.approved }) }));
vi.mock('@/stores/create-dao-store', () => {
  const store = {
    governance: { votingDelay: 86400, votingPeriod: 259200, queueDelay: 3600, quorumBps: 1000, proposalThreshold: 1 },
    auction: { duration: 86400, timeBuffer: 900 },
    validationErrors: {},
    updateGovernance: () => undefined,
    clearValidationError: () => undefined
  };
  const useCreateDaoStore = (select: (s: typeof store) => unknown) =>
    select({
      ...store,
      governance: { ...store.governance, votingDelay: state.votingDelay, voteSource: state.voteSource }
    } as typeof store);
  useCreateDaoStore.getState = () => store;
  return { useCreateDaoStore };
});

vi.stubGlobal('React', React);
const { GovernanceStep, voteTypeOptions } = await import('./GovernanceStep');

describe('governance type choice', () => {
  beforeEach(() => {
    state.approved = [];
    state.voteSource = '';
    state.votingDelay = 86400;
  });

  it('offers token-weighted voting and shows NQG as coming, not selectable', () => {
    const options = voteTypeOptions('', []);
    expect(options.map((option) => [option.value, Boolean(option.disabled)])).toEqual([
      ['token', false],
      ['nqg', true]
    ]);
    expect(options[1]!.description).toBe('Coming once NQG is available on Stellar.');
  });

  it('adds the chosen approved source as the selected way votes are counted', () => {
    const options = voteTypeOptions(ADAPTER, [{ source: ADAPTER, name: 'Mock adapter', decimals: 0 }]);
    expect(options.at(-1)).toMatchObject({ value: ADAPTER, label: 'Mock adapter' });
  });

  it('renders the choice, and hides the vote source picker until a source is approved', () => {
    const html = renderToStaticMarkup(<GovernanceStep />);
    expect(html).toContain('How are votes counted?');
    expect(html).toContain('Token-weighted');
    expect(html).toContain('Neural Quorum Governance (NQG)');
    expect(html).not.toContain('Vote source');
  });

  it('warns that a chosen vote source is permanent', () => {
    state.approved = [{ source: ADAPTER, name: 'Mock adapter', decimals: 0 }];
    state.voteSource = ADAPTER;
    const html = renderToStaticMarkup(<GovernanceStep />);
    expect(html).toContain('Mock adapter');
    expect(html).toContain('This contract decides every member&#x27;s voting power');
  });

  it('lists approved sources in Advanced settings', () => {
    state.approved = [{ source: ADAPTER, name: 'Mock adapter', decimals: 0 }];
    state.votingDelay = 4000; // custom timings keep Advanced open
    const html = renderToStaticMarkup(<GovernanceStep />);
    expect(html).toContain('Only sources the platform approved are listed.');
  });

  it('shows no picker in Advanced settings when nothing is approved', () => {
    state.votingDelay = 4000;
    const html = renderToStaticMarkup(<GovernanceStep />);
    expect(html).toContain('Advanced settings');
    expect(html).not.toContain('Only sources the platform approved are listed.');
  });
});
