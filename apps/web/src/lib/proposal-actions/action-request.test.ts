import { describe, expect, it } from 'vitest';

import { analyzeProposalAction } from '@/lib/proposal-action-identity';

import { withoutActionMeta } from './action-request';
import { action } from './test-fixtures';

describe('withoutActionMeta', () => {
  it('compares a starting price by its number, not the asset name kept for reading', () => {
    const fromManage = action('set-auction-reserve-price', { reservePrice: '150', amount: '150', assetCode: 'XLM' });
    const older = action('set-auction-reserve-price', { reservePrice: '150', amount: '150' });
    expect(withoutActionMeta(fromManage)).not.toHaveProperty('assetCode');
    const findings = analyzeProposalAction(withoutActionMeta(fromManage), [withoutActionMeta(older)]);
    expect(findings.map((finding) => finding.kind)).toContain('duplicate');
    expect(findings.map((finding) => finding.kind)).not.toContain('conflict');
  });

  it('keeps the asset of a treasury payment, which is part of the call', () => {
    const payment = action('transfer-sac-token', { assetCode: 'USDC', amount: '5' });
    expect(withoutActionMeta(payment)).toHaveProperty('assetCode', 'USDC');
  });
});
