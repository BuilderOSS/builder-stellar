import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, describe, expect, it, vi } from 'vitest';

const form = vi.hoisted(() => ({
  save: vi.fn(),
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
      saveAction: form.save,
      setValidationErrors: vi.fn()
    })
}));
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
    expect(form.save).not.toHaveBeenCalled();

    form.onSave!();
    expect(form.save).toHaveBeenCalledWith(
      'wallet',
      'dao',
      expect.objectContaining({ type: 'batch-mint-governance-token', recipient: form.data.recipient, amount: '1' })
    );
  });
});
