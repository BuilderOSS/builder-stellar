import { Asset, Keypair, nativeToScVal, Networks, xdr } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { getTreasuryAssets } from '@/lib/assets-config';

import { assertMarketplacePurchaseAuthorization } from './purchase-authorization';
import {
  authorizedCall,
  PURCHASE_BUYER,
  PURCHASE_MARKET,
  PURCHASE_OTHER,
  PURCHASE_SELLER,
  PURCHASE_TREASURY,
  purchaseFixture,
  purchaseRootArgs,
  sourceAuthorization,
  transferAuthorization
} from './purchase-authorization.fixtures';
import type { MarketplaceListing } from './types';

const xlm = Asset.native().contractId(Networks.TESTNET);
const usdc = getTreasuryAssets('testnet').find((asset) => asset.code === 'USDC')!.contractId!;
const listing: MarketplaceListing = {
  deploymentId: 'deployment-a',
  daoId: 'dao-a',
  contractId: PURCHASE_MARKET,
  eventId: 'original-cycle',
  kind: 'secondary',
  id: '7',
  tokenId: '7',
  price: '10000000',
  paymentAsset: xlm,
  feeBps: 250,
  seller: PURCHASE_SELLER,
  buyer: null,
  expiresAt: '2000000000',
  status: 'open',
  createdAt: null,
  closedAt: null,
  transactionHash: 'creation-hash'
};

function check(expected: MarketplaceListing, simulated: ReturnType<typeof purchaseFixture>) {
  return assertMarketplacePurchaseAuthorization(
    simulated.encoded,
    Networks.TESTNET,
    expected,
    PURCHASE_BUYER,
    PURCHASE_TREASURY,
    simulated.auth
  );
}

describe('purchase simulation real-XDR authorization binding', () => {
  it.each([xlm, usdc])('accepts exact primary and secondary SAC payment trees for %s', (asset) => {
    for (const kind of ['primary', 'secondary'] as const) {
      const expected = {
        ...listing,
        kind,
        paymentAsset: asset,
        id: kind === 'primary' ? '9007199254740993' : '7',
        seller: kind === 'primary' ? null : PURCHASE_SELLER,
        feeBps: kind === 'primary' ? 0 : 250
      };
      expect(() => check(expected, purchaseFixture(expected))).not.toThrow();
    }
  });
  it.each(['primary', 'secondary'] as const)('rejects the old price=1 / buy simulation price=2 race for %s', (kind) => {
    const expected = {
      ...listing,
      kind,
      seller: kind === 'primary' ? null : PURCHASE_SELLER,
      feeBps: kind === 'primary' ? 0 : 250
    };
    const simulated = purchaseFixture({ ...expected, price: '20000000' });
    expect(simulated.auth[0]).toBeInstanceOf(xdr.SorobanAuthorizationEntry);
    expect(() => check(expected, simulated)).toThrow('reviewed listing');
  });
  it.each([{ paymentAsset: usdc }, { seller: Keypair.random().publicKey() }, { feeBps: 500 }])(
    'rejects replaced listing terms %j',
    (change) => {
      expect(() => check(listing, purchaseFixture({ ...listing, ...change }))).toThrow('reviewed listing');
    }
  );
  it('rejects a changed primary Treasury destination', () => {
    const primary = { ...listing, kind: 'primary' as const, seller: null, feeBps: 0 };
    expect(() => check(primary, purchaseFixture(primary, PURCHASE_BUYER, PURCHASE_OTHER))).toThrow('reviewed listing');
  });
  it('rejects a different payer and swapped payout destinations even when total spend matches', () => {
    const fee = 250000n;
    for (const children of [
      [
        transferAuthorization(xlm, PURCHASE_SELLER, PURCHASE_TREASURY, fee),
        transferAuthorization(xlm, PURCHASE_BUYER, PURCHASE_SELLER, 9750000n)
      ],
      [
        transferAuthorization(xlm, PURCHASE_BUYER, PURCHASE_SELLER, fee),
        transferAuthorization(xlm, PURCHASE_BUYER, PURCHASE_TREASURY, 9750000n)
      ]
    ])
      expect(() => check(listing, purchaseFixture(listing, PURCHASE_BUYER, PURCHASE_TREASURY, { children }))).toThrow(
        'reviewed listing'
      );
  });
  it('requires the exact host destination, method, kind-specific id type/value and buyer', () => {
    const args = purchaseRootArgs(listing, PURCHASE_BUYER);
    for (const change of [
      { hostContract: PURCHASE_OTHER },
      { hostMethod: 'buy_primary' },
      { hostArgs: [nativeToScVal(8, { type: 'u32' }), args[1]] },
      { hostArgs: [nativeToScVal(7n, { type: 'u64' }), args[1]] },
      { hostArgs: [args[0], nativeToScVal(PURCHASE_SELLER, { type: 'address' })] },
      { hostArgs: [...args, nativeToScVal(1, { type: 'u32' })] },
      { source: PURCHASE_SELLER },
      { operationSource: PURCHASE_SELLER },
      { extraOperation: true }
    ]) {
      expect(() => check(listing, purchaseFixture(listing, PURCHASE_BUYER, PURCHASE_TREASURY, change))).toThrow(
        'reviewed listing'
      );
    }
  });
  it('rejects extra buyer authorization entries, missing auth and divergent serialized operation auth', () => {
    const valid = purchaseFixture(listing);
    const theft = sourceAuthorization(transferAuthorization(xlm, PURCHASE_BUYER, PURCHASE_OTHER, 1n));
    for (const change of [{ auth: [] }, { auth: [...valid.auth, theft] }, { operationAuth: [theft] }]) {
      expect(() => check(listing, purchaseFixture(listing, PURCHASE_BUYER, PURCHASE_TREASURY, change))).toThrow(
        'reviewed listing'
      );
    }
  });
  it('rejects unknown or nested buyer authorizations, including an extra transfer to the buyer itself', () => {
    const valid = purchaseFixture(listing).auth[0].rootInvocation.subInvocations;
    for (const children of [
      [...valid, transferAuthorization(xlm, PURCHASE_BUYER, PURCHASE_OTHER, 1n)],
      [...valid, transferAuthorization(xlm, PURCHASE_BUYER, PURCHASE_BUYER, 1n)],
      [authorizedCall(xlm, 'approve', []), valid[1]],
      [
        authorizedCall(
          xlm,
          'transfer',
          valid[0].function.type === 'sorobanAuthorizedFunctionTypeContractFn' ? valid[0].function.contractFn.args : [],
          [transferAuthorization(usdc, PURCHASE_BUYER, PURCHASE_OTHER, 1n)]
        ),
        valid[1]
      ]
    ])
      expect(() => check(listing, purchaseFixture(listing, PURCHASE_BUYER, PURCHASE_TREASURY, { children }))).toThrow(
        'reviewed listing'
      );
  });
  it('rejects a different authorization root', () => {
    const valid = purchaseFixture(listing);
    const altered = sourceAuthorization(
      authorizedCall(
        PURCHASE_OTHER,
        'buy',
        purchaseRootArgs(listing, PURCHASE_BUYER),
        valid.auth[0].rootInvocation.subInvocations
      )
    );
    expect(() =>
      check(listing, purchaseFixture(listing, PURCHASE_BUYER, PURCHASE_TREASURY, { auth: [altered] }))
    ).toThrow();
  });
  it('rejects address and V2 credentials rather than assuming the envelope signature signs arbitrary buyer auth', () => {
    const valid = purchaseFixture(listing).auth[0];
    const credentials = new xdr.SorobanAddressCredentials({
      address: nativeToScVal(PURCHASE_BUYER, { type: 'address' }).value as xdr.ScAddress,
      nonce: 1n,
      signatureExpirationLedger: 1200,
      signature: xdr.ScVal.scvVoid()
    });
    for (const credential of [
      xdr.SorobanCredentials.sorobanCredentialsAddress(credentials),
      xdr.SorobanCredentials.sorobanCredentialsAddressV2(credentials)
    ]) {
      const entry = new xdr.SorobanAuthorizationEntry({
        credentials: credential,
        rootInvocation: valid.rootInvocation
      });
      expect(() =>
        check(listing, purchaseFixture(listing, PURCHASE_BUYER, PURCHASE_TREASURY, { auth: [entry] }))
      ).toThrow('reviewed listing');
    }
  });
  it.each([0, 10000])('accepts the baseline zero-payment omission at fee %i bps', (feeBps) => {
    const expected = { ...listing, feeBps };
    expect(() => check(expected, purchaseFixture(expected))).not.toThrow();
  });
  it('preserves exact one-stroop rounding and rejects pretending zero transfers were authorized', () => {
    const expected = { ...listing, price: '1' };
    expect(() => check(expected, purchaseFixture(expected))).not.toThrow();
    const children = [
      transferAuthorization(xlm, PURCHASE_BUYER, PURCHASE_TREASURY, 0n),
      transferAuthorization(xlm, PURCHASE_BUYER, PURCHASE_SELLER, 1n)
    ];
    expect(() => check(expected, purchaseFixture(expected, PURCHASE_BUYER, PURCHASE_TREASURY, { children }))).toThrow();
  });
});
