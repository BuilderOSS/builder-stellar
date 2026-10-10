import { Keypair, StrKey } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { encodeSupportedCall } from '@/lib/proposal-supported-calls';

import { inspectProposalAdminCall } from './proposal-action-inspection';
import { treasuryPurchaseAuthNodes, validateAuthNodes } from './treasury-authorize';

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
