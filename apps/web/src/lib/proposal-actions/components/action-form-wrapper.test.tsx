import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, describe, expect, it, vi } from 'vitest';

const form = vi.hoisted(() => ({
  propose: vi.fn(() => ({ outcome: 'added' })),
  onSave: undefined as undefined | (() => void),
  data: {
    recipient: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    amount: '1'
  } as Record<string, unknown>
}));
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: (selector: (state: unknown) => unknown) => selector({ address: 'wallet' })
}));
vi.mock('@/stores/proposal-composer-store', () => ({
  normalizeWalletAddress: (address: string) => address.toUpperCase(),
  selectValidationErrors: () => () => null,
  useProposalComposerStore: (selector: (state: unknown) => unknown) =>
    selector({
      draftsByWallet: {
        WALLET: {
          dao: {
            editingState: { mode: 'edit', actionType: 'mint-governance-token', index: 0, draftData: form.data }
          }
        }
      },
      cancelEdit: vi.fn(),
      updateDraft: vi.fn(),
      setFormMessage: vi.fn(),
      setValidationErrors: vi.fn()
    })
}));
vi.mock('@/contexts/dao-context', () => ({ useDaoContext: () => ({ routeId: 'dao' }) }));
vi.mock('@/lib/proposal-actions/use-propose-action', () => ({ useProposeAction: () => ({ propose: form.propose }) }));
vi.mock('../context', () => ({
  useActionFormContext: () => ({ config: { treasuryContractId: 'treasury', adminAddress: 'treasury' } })
}));
vi.mock('./action-form-shell', () => ({
  ActionFormShell: ({ onSave, children }: { onSave: () => void; children: React.ReactNode }) => {
    form.onSave = onSave;
    return children;
  }
}));

import { ActionFormWrapper } from './action-form-wrapper';

vi.stubGlobal('React', React);
afterAll(() => vi.unstubAllGlobals());

describe('existing single-mint drafts in the unified form', () => {
  it('keeps the recipient and exposes the multi-recipient form, saving only on explicit request', () => {
    const html = renderToStaticMarkup(<ActionFormWrapper daoId="dao" />);
    expect(html).toContain(form.data.recipient);
    expect(html).toContain('Add recipient');
    expect(form.propose).not.toHaveBeenCalled();

    form.onSave!();
    expect(form.propose).toHaveBeenCalledWith(
      expect.objectContaining({
        actions: [
          expect.objectContaining({ type: 'batch-mint-governance-token', recipient: form.data.recipient, amount: '1' })
        ]
      }),
      expect.anything()
    );
  });
});
