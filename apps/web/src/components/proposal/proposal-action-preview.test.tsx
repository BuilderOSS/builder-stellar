import { Networks, StrKey } from '@stellar/stellar-sdk';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DaoNetworkConfig } from '@/lib/dao-config';

const state = vi.hoisted(() => ({
  config: {} as DaoNetworkConfig,
  release: { data: undefined as unknown, isLoading: false }
}));
vi.mock('@/lib/upgrade-release', () => ({ useUpgradeRelease: () => state.release }));
// Disclosures mount their content lazily; render it inline so the exact hashes stay checkable here.
vi.mock('@/components/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/ui')>()),
  Disclosure: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));
vi.mock('@/contexts/dao-context', () => ({
  useDaoContext: () => ({ daoConfig: state.config }),
  useOptionalDaoContext: () => ({ daoConfig: state.config })
}));
import { shortenId } from '@/components/ui';

import { ProposalActionPreview } from './proposal-action-preview';

const contract = (byte: number) => StrKey.encodeContract(new Uint8Array(32).fill(byte));
const wallet = (byte: number) => StrKey.encodeEd25519PublicKey(new Uint8Array(32).fill(byte));
state.config = {
  name: 'testnet',
  rpcUrl: 'https://rpc.test',
  passphrase: Networks.TESTNET,
  tokenContractId: contract(1),
  governorContractId: contract(2),
  auctionContractId: contract(3),
  treasuryContractId: contract(4),
  marketplaceContractId: contract(5),
  metadataContractId: contract(6)
} as DaoNetworkConfig;

describe('proposal admin-call inspector rendering', () => {
  // Match the existing SSR component tests under this Vitest JSX transform.
  beforeEach(() => vi.stubGlobal('React', React));
  afterEach(() => vi.unstubAllGlobals());
  it('shows ordered artwork fields, exact names/IPFS data and a Token-owner authority warning', () => {
    const html = renderToStaticMarkup(
      <ProposalActionPreview
        targets={[state.config.metadataContractId]}
        functions={['add_properties']}
        args={[
          [
            ['007'],
            [
              { name: 'First', is_new_property: true, property_id: 0 },
              { name: 'Second', is_new_property: false, property_id: 1 }
            ],
            { base_uri: 'ipfs://batch', extension: '.png' }
          ]
        ]}
      />
    );
    expect(html).toContain('Add 1 new layer and 2 images to the artwork');
    expect(html).toContain('High risk');
    expect(html).toContain('Metadata’s own admin');
    expect(html).toContain('007');
    expect(html).toContain('ipfs://batch');
    expect(html.indexOf('First')).toBeLessThan(html.indexOf('Second'));
    expect(html).toContain('is_new_property');
  });
  describe('module upgrades', () => {
    const fromHash = '0'.repeat(63) + '1';
    const toHash = '00' + 'ab'.repeat(31);
    const render = () =>
      renderToStaticMarkup(
        <ProposalActionPreview
          targets={[state.config.auctionContractId]}
          functions={['upgrade']}
          args={[[fromHash, toHash]]}
        />
      );
    afterEach(() => {
      state.release = { data: undefined, isLoading: false };
    });

    it('reads an approved release as routine, with its notes, and keeps the exact hashes', () => {
      state.release = {
        data: { fromVersion: '0.1.0', toVersion: '0.2.0', approved: true, revoked: false },
        isLoading: false
      };
      const html = render();
      expect(html).toContain('Upgrade the auction');
      expect(html).toContain('Approved release');
      expect(html).toContain('0.1.0 → 0.2.0');
      expect(html).toContain('Bidders can add a short comment');
      expect(html).not.toContain('High risk');
      expect(html).toContain(fromHash);
      expect(html).toContain(toHash);
    });

    it('warns when the registry does not approve the upgrade', () => {
      state.release = {
        data: { fromVersion: '0.1.0', toVersion: null, approved: false, revoked: false },
        isLoading: false
      };
      const html = render();
      expect(html).toContain('This release isn&#x27;t approved');
      expect(html).not.toContain('Approved release');
    });

    it('says plainly when the target release was withdrawn', () => {
      state.release = {
        data: { fromVersion: '0.1.0', toVersion: '0.2.0', approved: true, revoked: true },
        isLoading: false
      };
      expect(render()).toContain('This release was withdrawn');
    });

    it('never claims approval it could not check', () => {
      const html = render();
      expect(html).toContain('Couldn&#x27;t check this release');
      expect(html).not.toContain('Approved release');
    });
  });
  describe('token mints', () => {
    const alice = wallet(7);
    const bob = wallet(8);
    const render = (functions: string[], args: unknown[][]) =>
      renderToStaticMarkup(
        <ProposalActionPreview
          targets={functions.map(() => state.config.tokenContractId)}
          functions={functions}
          args={args as never}
          tokenContractId={state.config.tokenContractId}
        />
      );

    it('reads a batch mint as a sentence with the wallet in full below, never as JSON', () => {
      const html = render(['batch_mint'], [[state.config.treasuryContractId, [alice], ['5']]]);
      expect(html).toContain(`Mint 5 membership tokens to ${shortenId(alice)}</p>`);
      expect(html).not.toContain('Mint [');
      expect(html).toContain('Recipient');
      expect(html).toContain(`title="${alice}"`);
      // The exact call stays visible for verification.
      expect(html).toContain(`batch_mint(${state.config.treasuryContractId}, [&quot;${alice}&quot;], [&quot;5&quot;])`);
    });
    it('totals a batch to several wallets and lists what each gets', () => {
      const html = render(['batch_mint'], [[state.config.treasuryContractId, [alice, bob], ['5', '1']]]);
      expect(html).toContain('Mint 6 membership tokens to 2 wallets');
      expect(html).toContain('Gets 5 tokens');
      expect(html).toContain('Gets 1 token<');
      expect(html).not.toContain('>Recipient<');
    });
    it('says a batch the Token would reject fails, instead of titling it', () => {
      const html = render(['batch_mint'], [[state.config.treasuryContractId, [alice, bob], ['5']]]);
      expect(html).toContain('Mint tokens');
      expect(html).toContain('The token rejects this call when it runs');
      expect(html).not.toContain('Recipient');
    });
    it('reads a single mint the same way', () => {
      const html = render(['mint'], [[state.config.treasuryContractId, alice]]);
      expect(html).toContain(`Mint a membership token to ${shortenId(alice)}</p>`);
      expect(html).toContain(`title="${alice}"`);
    });
  });
  it('leaves external upgrades unsupported instead of inferring a module authority', () => {
    for (const target of [contract(9)]) {
      const html = renderToStaticMarkup(
        <ProposalActionPreview targets={[target]} functions={['upgrade']} args={[['01'.repeat(32), 'ab'.repeat(32)]]} />
      );
      expect(html).toContain('This app can&#x27;t read this call');
      expect(html).toContain('Queueing and running it from here are turned off');
      expect(html).not.toContain('Upgrade artwork and profile');
    }
  });
});
