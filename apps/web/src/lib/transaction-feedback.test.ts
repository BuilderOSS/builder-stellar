import { beforeEach, describe, expect, it, vi } from 'vitest';

const toaster = vi.hoisted(() => ({
  create: vi.fn(() => 'toast-1'),
  update: vi.fn(),
  isVisible: vi.fn(() => true),
  success: vi.fn(),
  error: vi.fn()
}));
vi.mock('@/lib/toaster', () => ({ toaster }));
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useRef: (value: unknown) => ({ current: value })
}));

import { useTransactionFeedback } from './transaction-feedback';

describe('useTransactionFeedback', () => {
  beforeEach(() => vi.clearAllMocks());

  it('moves one toast through a multi-step flow, so no step stays spinning (BUG-CAP-13)', () => {
    const tx = useTransactionFeedback('testnet');
    tx.start('Let the claims module mint');
    tx.start('Open the claim list');
    tx.success('Claim list open', 'abc123');
    expect(toaster.create).toHaveBeenCalledTimes(1);
    expect(toaster.update).toHaveBeenNthCalledWith(
      1,
      'toast-1',
      expect.objectContaining({ title: 'Open the claim list' })
    );
    expect(toaster.update).toHaveBeenLastCalledWith('toast-1', expect.objectContaining({ type: 'success' }));
  });

  it('starts a new toast when the person closed the earlier one', () => {
    const tx = useTransactionFeedback('testnet');
    tx.start('First');
    toaster.isVisible.mockReturnValueOnce(false);
    tx.start('Second');
    expect(toaster.create).toHaveBeenCalledTimes(2);
  });
});
