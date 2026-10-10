import { describe, expect, it } from 'vitest';

import { defaultConfiguration, type LocalDaoDraft } from '@/stores/create-dao-store';
import { createEmptyDraft, type ProposalDraft } from '@/stores/proposal-composer-store';

import { collectDrafts } from './collect-drafts';

const NOW = 1_800_000_000_000;
const DAO = `C${'A'.repeat(55)}`;

function daoDraft(
  id: string,
  name: string,
  updatedAt: number,
  deployment?: LocalDaoDraft['deployment']
): LocalDaoDraft {
  const configuration = defaultConfiguration('testnet');
  configuration.basicInfo.tokenName = name;
  return {
    id,
    scope: { network: 'testnet', deployment: 'manager', wallet: null },
    configuration,
    imagePreview: null,
    imageFilename: '',
    section: 'basicInfo',
    createdAt: updatedAt,
    updatedAt,
    deployment
  };
}
function proposalDraft(patch: Partial<ProposalDraft>): ProposalDraft {
  return { ...createEmptyDraft(), ...patch };
}

describe('collectDrafts', () => {
  it('lists proposal and DAO drafts together, newest first, with readable meta', () => {
    const items = collectDrafts({
      proposalDrafts: {
        [DAO]: proposalDraft({
          metadata: { title: 'Raise the reserve', description: '', url: '' } as ProposalDraft['metadata'],
          queuedActions: [{ id: 'a', type: 'set-voting-delay', recipient: '', amount: '' }],
          updatedAt: NOW - 60_000
        })
      },
      daoDrafts: [daoDraft('d1', 'Lantern Club', NOW - 3_600_000)],
      communities: new Map([[DAO, { name: 'Builder DAO', routeId: 'builder' }]]),
      now: NOW
    });
    expect(items.map((item) => [item.kind, item.title])).toEqual([
      ['proposal', 'Raise the reserve'],
      ['dao', 'Lantern Club']
    ]);
    expect(items[0].meta).toMatch(/^Builder DAO · 1 change · saved /);
    expect(items[0].href).toBe('/dao/builder/proposals/create');
    expect(items[1].href).toBe('/create?draft=d1');
  });

  it('leaves out drafts nobody started', () => {
    const items = collectDrafts({
      proposalDrafts: { [DAO]: proposalDraft({ updatedAt: NOW }) },
      daoDrafts: [daoDraft('empty', '  ', NOW)],
      communities: new Map(),
      now: NOW
    });
    expect(items).toEqual([]);
  });

  it('keeps a DAO draft with a live deployment record, but never offers to discard it', () => {
    const [live] = collectDrafts({
      proposalDrafts: {},
      daoDrafts: [daoDraft('d2', 'Lantern Club', NOW, { status: 'confirmed' } as LocalDaoDraft['deployment'])],
      communities: new Map(),
      now: NOW
    });
    expect(live.discardable).toBe(false);
    const [failed] = collectDrafts({
      proposalDrafts: {},
      daoDrafts: [daoDraft('d3', 'Lantern Club', NOW, { status: 'failed' } as LocalDaoDraft['deployment'])],
      communities: new Map(),
      now: NOW
    });
    expect(failed.discardable).toBe(true);
  });

  it('falls back to a short address for a community it cannot name', () => {
    const [item] = collectDrafts({
      proposalDrafts: {
        [DAO]: proposalDraft({ metadata: { title: 'x', description: '', url: '' } as ProposalDraft['metadata'] })
      },
      daoDrafts: [],
      communities: new Map(),
      now: NOW
    });
    expect(item.meta.startsWith('CAAA…AAAA')).toBe(true);
    expect(item.href).toBe(`/dao/${DAO}/proposals/create`);
  });
});
