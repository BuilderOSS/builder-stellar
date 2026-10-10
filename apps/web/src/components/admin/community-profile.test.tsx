import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const ADMIN = `G${'A'.repeat(55)}`;
const TREASURY = `C${'T'.repeat(55)}`;
const state = vi.hoisted(() => ({
  address: '',
  admin: '',
  live: false,
  version: '0.2.0' as string | undefined
}));

vi.mock('@/contexts/dao-context', () => {
  const value = {
    daoId: 'CDAO',
    routeId: 'lantern-club',
    daoConfig: {
      name: 'testnet',
      tokenName: 'Lantern Club',
      tokenSymbol: 'LANTERN',
      tokenUri: 'https://example.com/token/',
      tokenDescription: 'Evening walks.',
      contractImage: 'https://example.com/a.png',
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
      settings: {
        contract_image: 'https://example.com/a.png',
        description: 'Evening walks.',
        project_uri: 'https://lantern.club'
      }
    },
    mutate: vi.fn()
  })
}));
vi.mock('swr', () => ({ default: () => ({ data: state.version }) }));
vi.mock('@/lib/use-admin-proposal-draft', () => ({
  useAdminProposalDraft: () => ({ pending: null, requestAddBatch: vi.fn(), cancel: vi.fn(), resolve: vi.fn() })
}));
vi.mock('@/lib/transaction-feedback', () => ({
  useTransactionFeedback: () => ({ start: vi.fn(), submitted: vi.fn(), success: vi.fn(), fail: vi.fn() })
}));
vi.mock('@/components/admin/admin-proposal-draft-dialog', () => ({ AdminProposalDraftDialog: () => null }));
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
    state.version = '0.2.0';
  });

  it('lets the launch admin edit everything directly during setup, showing current values', () => {
    const html = render();
    expect(html).toContain('During setup, changes apply right away.');
    expect(input(html, 'profile-name')).toContain('value="Lantern Club"');
    expect(input(html, 'profile-name')).not.toContain('disabled');
    expect(input(html, 'profile-website')).toContain('value="https://lantern.club"');
    expect(html).toContain('Your link is claimed at launch and then permanent.');
  });

  it('sends changes to a proposal once the treasury is the admin', () => {
    state.live = true;
    state.admin = TREASURY;
    const html = render();
    expect(html).toContain('Changes go into a proposal for members to vote on.');
    // Members can still draft every change; the vote decides.
    expect(input(html, 'profile-name')).not.toContain('disabled');
    expect(html).not.toContain('Read only');
    expect(html).toContain('Your link is permanent.');
  });

  it('locks name and symbol, with a path to upgrade, while the token is on 0.1.0', () => {
    state.version = '0.1.0';
    const html = render();
    expect(html).toContain('Renaming needs the newer token contract');
    expect(html).toContain('href="/dao/lantern-club/admin/upgrades"');
    expect(input(html, 'profile-name')).toContain('disabled');
    expect(input(html, 'profile-symbol')).toContain('disabled');
    expect(input(html, 'profile-website')).not.toContain('disabled');
  });

  it('is read only for a wallet with no authority', () => {
    state.address = `G${'B'.repeat(55)}`;
    const html = render();
    expect(html).toContain('Read only');
    expect(input(html, 'profile-website')).toContain('disabled');
  });
});
