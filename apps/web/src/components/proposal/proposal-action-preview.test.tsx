import { Networks, StrKey } from '@stellar/stellar-sdk';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DaoNetworkConfig } from '@/lib/dao-config';

const state = vi.hoisted(() => ({ config: {} as DaoNetworkConfig }));
vi.mock('@/contexts/dao-context', () => ({ useDaoContext: () => ({ daoConfig: state.config }) }));
import { ProposalActionPreview } from './proposal-action-preview';

const contract = (byte: number) => StrKey.encodeContract(new Uint8Array(32).fill(byte));
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
    expect(html).toContain('Append artwork: 1 new properties, 2 ordered items');
    expect(html).toContain('High risk');
    expect(html).toContain('Metadata’s own admin');
    expect(html).toContain('007');
    expect(html).toContain('ipfs://batch');
    expect(html.indexOf('First')).toBeLessThan(html.indexOf('Second'));
    expect(html).toContain('is_new_property');
  });
  it('shows both full 32-byte upgrade hashes and never claims ABI support proves approval', () => {
    const fromHash = '0'.repeat(63) + '1';
    const toHash = '00' + 'ab'.repeat(31);
    const html = renderToStaticMarkup(
      <ProposalActionPreview
        targets={[state.config.treasuryContractId]}
        functions={['upgrade']}
        args={[[fromHash, toHash]]}
      />
    );
    expect(html).toContain('Upgrade treasury module');
    expect(html).toContain(fromHash);
    expect(html).toContain(toHash);
    expect(html).toContain('ABI support is not approval');
  });
  it('leaves external upgrades unsupported instead of inferring a module authority', () => {
    for (const target of [contract(9)]) {
      const html = renderToStaticMarkup(
        <ProposalActionPreview targets={[target]} functions={['upgrade']} args={[['01'.repeat(32), 'ab'.repeat(32)]]} />
      );
      expect(html).toContain('Unknown or unsupported ABI');
      expect(html).toContain('automatic submission is disabled');
      expect(html).not.toContain('Upgrade metadata module');
    }
  });
});
