import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const DEADLINE = 1_900_000_000;
const PASSPHRASE = 'Test SDF Network ; September 2015';
const state = vi.hoisted(() => ({
  config: {} as Record<string, unknown>,
  session: {} as Record<string, unknown>
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/contexts/dao-context', () => ({ useDaoContext: () => ({ daoConfig: state.config }) }));
vi.mock('@/stores/auth-session-store', () => ({ useAuthSessionStore: () => state.session }));
vi.mock('@/lib/transaction-feedback', () => ({
  useTransactionFeedback: () => ({ start: vi.fn(), submitted: vi.fn(), success: vi.fn(), fail: vi.fn() })
}));
vi.mock('@/lib/release-slug', () => ({ releaseDriveSlug: vi.fn() }));

import { ReleaseSlug } from './release-slug';

// The existing Vitest config uses classic JSX, while Next uses the automatic runtime.
vi.stubGlobal('React', React);
afterAll(() => vi.unstubAllGlobals());

const render = (disabled = false) => renderToStaticMarkup(<ReleaseSlug disabled={disabled} />).replace(/<!-- -->/g, '');
const button = (html: string) => html.match(/<button[^>]*>(?:(?!<\/button>).)*Free the link<\/button>/s)?.[0] ?? '';

describe('ReleaseSlug', () => {
  afterEach(() => vi.useRealTimers());
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime((DEADLINE + 60) * 1000);
    state.config = {
      name: 'testnet',
      passphrase: PASSPHRASE,
      tokenContractId: 'CTOKEN',
      assuranceOutcome: 'open',
      assuranceDeadline: DEADLINE
    };
    state.session = {
      address: `G${'A'.repeat(55)}`,
      authStatus: 'authenticated',
      walletNetworkIssue: '',
      walletNetworkPassphrase: PASSPHRASE
    };
  });

  it('offers to free the link once the drive ended and the link is still held', () => {
    const html = render();
    expect(button(html)).not.toBe('');
    expect(button(html)).not.toContain('disabled');
    expect(html).toContain('still holds the link it reserved');
    expect(html).not.toContain('Connect a wallet');
  });

  it('stays hidden while the drive can still launch', () => {
    vi.setSystemTime((DEADLINE - 60) * 1000);
    expect(render()).toBe('');
  });

  it('is hidden once the indexed outcome is released, and for a launched or driveless tribe', () => {
    for (const assuranceOutcome of ['released', 'launched', null]) {
      state.config = { ...state.config, assuranceOutcome };
      expect(render()).toBe('');
    }
  });

  it('asks for a wallet on the right network before it can sign', () => {
    state.session = { ...state.session, authStatus: 'anonymous', address: '' };
    let html = render();
    expect(button(html)).toContain('disabled');
    expect(html).toContain('Connect a wallet on this tribe&#x27;s network to free it.');

    state.session = {
      address: `G${'A'.repeat(55)}`,
      authStatus: 'authenticated',
      walletNetworkIssue: 'Wrong network',
      walletNetworkPassphrase: 'Public Global Stellar Network ; September 2015'
    };
    html = render();
    expect(button(html)).toContain('disabled');
  });

  it('follows the page it sits on while another transaction runs', () => {
    expect(button(render(true))).toContain('disabled');
  });
});
