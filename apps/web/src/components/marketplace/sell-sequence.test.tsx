import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { sellSequence } from '@/lib/marketplace/sell';

const dialogProps = vi.hoisted(() => ({ last: null as Record<string, unknown> | null }));

vi.mock('@/components/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui')>();
  return {
    ...actual,
    Dialog: (props: Record<string, unknown> & { children?: React.ReactNode }) => {
      dialogProps.last = props;
      return <div>{props.children}</div>;
    }
  };
});
vi.mock('./use-marketplace-signer', () => ({
  useMarketplaceSigner: () => ({
    session: { address: 'G', walletNetworkIssue: '' },
    network: { label: 'Testnet', name: 'testnet' },
    allowed: true,
    prepared: null,
    busy: false,
    message: '',
    hash: '',
    confirmed: false
  })
}));
vi.mock('./trade-review', () => ({ reviewMuted: '', TransactionDetails: () => null }));

vi.stubGlobal('React', React);
afterAll(() => vi.unstubAllGlobals());
const { SellSequence } = await import('./sell-sequence');

describe('the guided sell sequence', () => {
  it('stays open on an outside press or focus, so Change price can open it (BUG-010)', () => {
    const steps = sellSequence(
      { action: 'list', tokenId: '3', price: '6', expiresAt: '2000000000', paymentAsset: 'C', feeBps: 250 },
      { action: 'cancel', kind: 'secondary', id: '3', eventId: 'e' }
    );
    const html = renderToStaticMarkup(
      <SellSequence daoId="dao" title="Change the price" steps={steps} onClose={() => {}} />
    );
    expect(dialogProps.last?.closeOnInteractOutside).toBe(false);
    expect(html).toContain('Step 1 of 3: Cancel the current listing');
  });
});
