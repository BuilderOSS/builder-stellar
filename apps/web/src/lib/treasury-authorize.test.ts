import { Client as MarketplaceClient } from '@builder-stellar/marketplace-bindings';
import { Client as TreasuryClient } from '@builder-stellar/treasury-bindings';
import { Keypair, scValToNative, StrKey } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import type { DaoNetworkConfig } from '@/lib/dao-config';
import { buildProposalCallVectors, encodeProposalCallArgs } from '@/lib/proposal-call';
import { encodeSupportedCall } from '@/lib/proposal-supported-calls';

import { inspectProposalAdminCall } from './proposal-action-inspection';
import { getActionHandler } from './proposal-actions/registry';
import type { FormContext } from './proposal-actions/types';
import { authNodeSpecValue, treasuryPurchaseAuthNodes, validateAuthNodes } from './treasury-authorize';

const contract = (n: number) => StrKey.encodeContract(Buffer.alloc(32, n));
const treasury = contract(1);
const sac = contract(2);
const seller = Keypair.random().publicKey();
const config = {
  name: 'testnet',
  rpcUrl: 'https://soroban-testnet.stellar.org',
  passphrase: 'Test SDF Network ; September 2015',
  tokenContractId: contract(3),
  governorContractId: contract(4),
  auctionContractId: contract(5),
  treasuryContractId: treasury,
  marketplaceContractId: contract(6),
  metadataContractId: contract(7)
} as Parameters<typeof encodeSupportedCall>[3];

describe('Treasury authorize trees', () => {
  const nodes = treasuryPurchaseAuthNodes({ treasury, paymentAsset: sac, seller, price: 1_000n, fee: 25n });
  it('builds the fee and proceeds transfers a Treasury purchase needs', () => {
    expect(nodes.map((node) => node.args.map((arg) => arg.value))).toEqual([
      [treasury, treasury, '25'],
      [treasury, seller, '975']
    ]);
    expect(treasuryPurchaseAuthNodes({ treasury, paymentAsset: sac, seller, price: 1_000n, fee: 0n })).toHaveLength(1);
    expect(validateAuthNodes(nodes)).toBeNull();
  });
  it('encodes typed Val arguments through the Treasury spec and fails closed on untyped ones', () => {
    expect(encodeSupportedCall(treasury, 'authorize', [nodes], config)).toHaveLength(1);
    const untyped = [{ ...nodes[0], args: [treasury] }];
    expect(() => encodeSupportedCall(treasury, 'authorize', [untyped], config)).toThrow();
  });
  it('rejects oversized or malformed trees', () => {
    expect(validateAuthNodes([])).not.toBeNull();
    expect(validateAuthNodes(Array.from({ length: 17 }, () => nodes[0]))).toMatch(/16/);
    let deep = { ...nodes[0], sub: [] as typeof nodes };
    for (let i = 0; i < 4; i += 1) deep = { ...nodes[0], sub: [deep] };
    expect(validateAuthNodes([deep])).toMatch(/4 levels/);
  });
  it('renders indexed authorize trees and migrate/regenerate calls for review', () => {
    const indexed = [{ contract: sac, fn_name: 'transfer', args: [treasury, seller, '975'], sub: [] }];
    const inspected = inspectProposalAdminCall(treasury, 'authorize', [indexed], config);
    expect(inspected?.fields[0]?.value).toContain(`${sac}.transfer`);
    expect(inspectProposalAdminCall(config.metadataContractId, 'migrate', [], config)?.title).toBe(
      'Migrate metadata storage'
    );
    expect(inspectProposalAdminCall(config.metadataContractId, 'regenerate', [3], config)?.title).toContain('#3');
  });
});

describe('Treasury buys a listing proposal', () => {
  const price = 1_000n;
  const nodes = treasuryPurchaseAuthNodes({ treasury, paymentAsset: sac, seller, price, fee: 25n });
  const daoConfig = config as unknown as DaoNetworkConfig;
  const formContext = { config: daoConfig } as FormContext;
  const actions = [
    getActionHandler('treasury-authorize').serialize({ nodes }, formContext),
    getActionHandler('treasury-buy-listing').serialize({ tokenId: '5', maxPrice: price.toString() }, formContext)
  ];

  it('builds the authorize and buy calls in order, targeting the Treasury and the Marketplace', () => {
    const vectors = buildProposalCallVectors(actions, config.tokenContractId, treasury, daoConfig);
    expect(vectors.targets).toEqual([treasury, config.marketplaceContractId]);
    expect(vectors.functions).toEqual(['authorize', 'buy']);
    expect(vectors.args[1]).toEqual(['5', treasury, '1000']);
  });

  it('encodes both calls from the contract specs, the buy as (u32 token, address buyer, i128 max price)', () => {
    const vectors = buildProposalCallVectors(actions, config.tokenContractId, treasury, daoConfig);
    const [authorize, buy] = encodeProposalCallArgs(vectors.targets, vectors.functions, vectors.args, config);
    const options = { rpcUrl: config.rpcUrl, networkPassphrase: config.passphrase };

    const treasurySpec = new TreasuryClient({ ...options, contractId: treasury }).spec;
    expect(authorize!.map((arg) => arg.toXDR('base64'))).toEqual(
      treasurySpec
        .funcArgsToScVals('check_authorization', { nodes: nodes.map(authNodeSpecValue) })
        .map((arg) => arg.toXDR('base64'))
    );

    const marketplaceSpec = new MarketplaceClient({ ...options, contractId: config.marketplaceContractId }).spec;
    expect(buy!.map((arg) => arg.type)).toEqual(['scvU32', 'scvAddress', 'scvI128']);
    expect(buy!.map((arg) => arg.toXDR('base64'))).toEqual(
      marketplaceSpec
        .funcArgsToScVals('buy', { token_id: 5, buyer: treasury, max_price: price })
        .map((arg) => arg.toXDR('base64'))
    );
    expect(buy!.map((arg) => scValToNative(arg))).toEqual([5, treasury, price]);
  });

  it('refuses a buy aimed at anything but this DAO’s Marketplace, or with a bad price', () => {
    expect(() => encodeProposalCallArgs([contract(9)], ['buy'], [['5', treasury, '1000']], config)).toThrow(
      /Unsupported external call/
    );
    expect(() =>
      encodeProposalCallArgs([config.marketplaceContractId], ['buy'], [['5', treasury, 'x']], config)
    ).toThrow(/whole-number/);
    expect(() => encodeProposalCallArgs([config.marketplaceContractId], ['buy'], [['5', treasury]], config)).toThrow(
      /argument count/
    );
  });
});
