import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const ADMIN = `G${'A'.repeat(55)}`;
const TREASURY = `C${'T'.repeat(55)}`;
const state = vi.hoisted(() => ({
  address: '',
  admin: '',
  live: false,
  link: { slug: 'lantern-club', claimed: false }
}));

vi.mock('@/contexts/dao-context', () => {
  const value = {
    daoId: 'CDAO',
    routeId: 'lantern-club',
    daoConfig: {
      name: 'testnet',
      slug: 'lantern-club',
      tokenName: 'Lantern Club',
      tokenSymbol: 'LANTERN',
      profile: {
        description: 'Evening walks.',
        links: [{ label: 'Website', url: 'https://lantern.club' }],
        image: 'https://example.com/a.png'
      },
      profileStatus: 'verified',
      profileSeq: 2,
      tokenContractId: 'CTOKEN',
      metadataContractId: 'CMETA',
      treasuryContractId: `C${'T'.repeat(55)}`,
      passphrase: 'test'
    }
  };
  return { useDaoContext: () => value, useOptionalDaoContext: () => value };
});
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: () => ({ address: state.address, walletNetworkIssue: '', walletNetworkPassphrase: 'test' })
}));
vi.mock('@/lib/admin-surfaces', () => ({
  adminReadOptions: () => ({}),
  useAdminTokenState: () => ({ data: { admin: state.admin, live: state.live }, mutate: vi.fn() }),
  useAdminArtwork: () => ({
    data: {
      admin: state.admin,
      profileSeq: 2
    },
    mutate: vi.fn()
  })
}));
vi.mock('@/lib/community-link', async (load) => ({
  ...(await load<typeof import('@/lib/community-link')>()),
  useManagerLink: () => ({ data: state.link, mutate: vi.fn() }),
  useLinkAvailability: () => undefined
}));
vi.mock('@/lib/proposal-changes/use-propose-change', () => ({
  useProposeChange: () => ({ propose: vi.fn(() => ({ outcome: 'added' })), canPropose: true })
}));
vi.mock('@/lib/proposal-changes/use-editing-change', () => ({
  useEditingChange: () => ({ editing: null, bundle: [], replaces: undefined, done: vi.fn() })
}));
vi.mock('@/components/proposal-changes/pending-value', () => ({
  PendingValue: () => null,
  usePendingChanges: () => []
}));
vi.mock('@/lib/transaction-feedback', () => ({
  useTransactionFeedback: () => ({ start: vi.fn(), submitted: vi.fn(), success: vi.fn(), fail: vi.fn() })
}));
vi.mock('@/components/create-dao/dao-image-upload', () => ({ prepareDaoImage: vi.fn(), uploadDaoImage: vi.fn() }));

import { CommunityProfileEditor } from './community-profile';

// The existing Vitest config uses classic JSX, while Next uses the automatic runtime.
vi.stubGlobal('React', React);
afterAll(() => vi.unstubAllGlobals());

const render = () => renderToStaticMarkup(<CommunityProfileEditor />);
const input = (html: string, id: string) => html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0] ?? '';

describe('CommunityProfileEditor', () => {
  beforeEach(() => {
    state.address = ADMIN;
    state.admin = ADMIN;
    state.live = false;
    state.link = { slug: 'lantern-club', claimed: false };
  });

  it('lets the launch admin edit everything directly during setup, showing current values', () => {
    const html = render();
    expect(html).toContain('During setup, changes apply right away.');
    expect(input(html, 'profile-name')).toContain('value="Lantern Club"');
    expect(input(html, 'profile-name')).not.toContain('disabled');
    expect(html).toContain('value="https://lantern.club"');
    expect(input(html, 'profile-links-label-0')).toContain('value="Website"');
    expect(input(html, 'profile-link')).toContain('value="lantern-club"');
    expect(html).toContain('Yours once you launch.');
  });

  it('sends changes to a proposal once the treasury is the admin', () => {
    state.live = true;
    state.admin = TREASURY;
    const html = render();
    expect(html).toContain('Changes go into a proposal for members to vote on.');
    // Members can still draft every change; the vote decides.
    expect(input(html, 'profile-name')).not.toContain('disabled');
    expect(html).not.toContain('Read only');
    // The link sits with the rest of the profile; changing it is its own vote.
    expect(input(html, 'profile-link')).toContain('value="lantern-club"');
    expect(input(html, 'profile-link')).not.toContain('disabled');
    expect(html).toContain('Changing it takes its own vote.');
  });

  it('is read only for a wallet with no authority', () => {
    state.address = `G${'B'.repeat(55)}`;
    const html = render();
    expect(html).toContain('Read only');
    expect(input(html, 'profile-links-label-0')).toContain('disabled');
  });
});
