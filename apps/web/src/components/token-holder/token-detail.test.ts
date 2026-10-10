import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { missingTokenRead } from '@/lib/token-holder/read-test-fixtures';

const mocks = vi.hoisted(() => ({
  data: {} as Record<string, unknown>,
  controls: vi.fn()
}));
vi.mock('swr', () => ({
  default: () => ({ data: mocks.data, error: undefined, isLoading: false, isValidating: false, mutate: vi.fn() })
}));
vi.mock('@/contexts/dao-context', () => {
  const value = {
    daoId: 'dao-a',
    daoConfig: { tokenName: 'Actual DAO', tokenDescription: 'Actual description' }
  };
  return { useDaoContext: () => value, useOptionalDaoContext: () => value };
});
vi.mock('./holder-controls', () => ({
  HolderControls: (props: unknown) => {
    mocks.controls(props);
    return createElement('div', null, 'Holder controls');
  }
}));

import { HolderTokenDetail } from './token-detail';

vi.stubGlobal('React', React);
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  mocks.controls.mockClear();
  mocks.data = { owner: null, ownerSource: 'unavailable', indexedOwner: null, metadata: null };
});

describe('token ownership rendered fallbacks', () => {
  it('renders unavailable ownership without a holder link or live controls', () => {
    const html = renderToStaticMarkup(createElement(HolderTokenDetail, { tokenId: 0 }));
    expect(html).toContain('Ownership is unavailable.');
    expect(html).not.toContain('/members/');
    expect(mocks.controls).toHaveBeenCalledWith(expect.objectContaining({ owner: null, liveOwner: false }));
  });
  it('does not render an SDK contract-error object from a malformed or stale owner DTO', async () => {
    const tx = await missingTokenRead();
    mocks.data.owner = JSON.parse(JSON.stringify(tx.result));
    mocks.data.ownerSource = 'onchain';
    const html = renderToStaticMarkup(createElement(HolderTokenDetail, { tokenId: 0 }));
    expect(html).toContain('Ownership is unavailable.');
    expect(html).not.toContain('/members/');
    expect(html).not.toContain('NonExistentToken');
    expect(mocks.controls).toHaveBeenCalledWith(expect.objectContaining({ owner: null, liveOwner: false }));
  });
});
