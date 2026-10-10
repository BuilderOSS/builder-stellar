import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ config: vi.fn(), proposal: vi.fn(), chain: vi.fn(), receipt: vi.fn() }));
vi.mock('@/lib/dao-config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/dao-config')>()),
  getDaoNetworkConfigById: mocks.config
}));
vi.mock('@/lib/goldsky', () => ({ getGoldskyProposalDetail: mocks.proposal }));
vi.mock('@/lib/proposal-execution-receipt-service', () => ({ getIndexedExecutionReceipt: mocks.receipt }));
vi.mock('@/lib/proposal-chain-state', () => ({
  readProposalChainState: mocks.chain,
  PROPOSAL_EXPIRATION_SECONDS: 1209600
}));
import { GET } from './route';

const indexed = (dao: string) => ({
  proposal: {
    proposal_id: `${dao}-proposal`,
    proposal_number: 1,
    description: 'Proposal',
    proposer: `${dao}-proposer`,
    deadline_ledger: 5000,
    snapshot_ledger: 20,
    eta: 6000,
    vote_start_timestamp: null,
    state: 'queued',
    created_ledger: 10,
    created_timestamp: 4000,
    vote_summary: { for: '9007199254740993', against: '2', abstain: '7' },
    actions: []
  }
});
const get = (dao: string) =>
  GET(new Request(`https://app.test/api/dao/${dao}/proposals/1`), {
    params: Promise.resolve({ daoId: dao, proposalId: '1' })
  });
describe('proposal detail API sources and tenant identity', () => {
  beforeEach(() => {
    mocks.config.mockReset().mockImplementation(async (dao) => ({ governorContractId: `${dao}-governor` }));
    mocks.proposal.mockReset().mockImplementation(async (dao) => indexed(dao));
    mocks.chain.mockReset().mockResolvedValue({
      state: 5,
      stateSource: 'chain',
      deadline: 5000,
      snapshot: 20,
      core: null,
      quorumVotes: null
    });
  });
  it('recovers indexed ETA while retaining live state and indexed proposer, not a voting-period-derived start', async () => {
    const result = await (await get('dao1')).json();
    expect(result).toMatchObject({
      state: 5,
      stateSource: 'chain',
      eta: 6000,
      etaSource: 'indexed',
      expiresAt: 1215600,
      proposer: 'dao1-proposer',
      vote_start: 0,
      voteStartSource: 'unavailable',
      for_votes: '9007199254740993'
    });
  });
  it('uses stored historical start/ETA without current governance settings', async () => {
    mocks.chain.mockResolvedValue({
      state: 5,
      stateSource: 'chain',
      core: { voteStart: 4100, voteEnd: 5200, snapshot: 21, eta: 6100 }
    });
    expect(await (await get('dao1')).json()).toMatchObject({
      vote_start: 4100,
      voteStartSource: 'chain',
      eta: 6100,
      etaSource: 'chain'
    });
  });
  it('keeps two DAO identities in service calls and never falls back to an unscoped query', async () => {
    const one = await (await get('dao1')).json();
    const two = await (await get('dao2')).json();
    expect(one.proposer).not.toBe(two.proposer);
    expect(mocks.proposal).toHaveBeenNthCalledWith(1, 'dao1', '1');
    expect(mocks.proposal).toHaveBeenNthCalledWith(2, 'dao2', '1');
    expect(mocks.chain).toHaveBeenNthCalledWith(2, { governorContractId: 'dao2-governor' }, 'dao2-proposal');
    mocks.proposal.mockRejectedValue(new Error('Scoped query unavailable'));
    expect((await get('dao3')).status).toBe(503);
  });
  it('labels unavailable chain state as indexed and does not invent Pending', async () => {
    mocks.chain.mockRejectedValue(new Error('RPC unavailable'));
    expect(await (await get('dao1')).json()).toMatchObject({ stateSource: 'indexed', state: 5 });
    mocks.proposal.mockResolvedValue({ ...indexed('dao1'), proposal: { ...indexed('dao1').proposal, state: '' } });
    expect(await (await get('dao1')).json()).toMatchObject({ state: null, label: 'Unknown' });
  });
  it('isolates optional indexed receipt failures from authoritative Executed state', async () => {
    mocks.chain.mockResolvedValue({ state: 7, stateSource: 'chain', core: null });
    mocks.receipt.mockRejectedValue(new Error('View unavailable'));
    expect(await (await get('dao1')).json()).toMatchObject({
      state: 7,
      stateSource: 'chain',
      executionReceipt: null,
      executionReceiptStatus: 'unavailable'
    });
    mocks.receipt.mockResolvedValue(null);
    expect(await (await get('dao1')).json()).toMatchObject({ state: 7, executionReceiptStatus: 'pending' });
  });
});
