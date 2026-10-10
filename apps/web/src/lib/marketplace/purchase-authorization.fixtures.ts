import { Client as MarketplaceClient } from '@builder-stellar/marketplace-bindings';
import {
  Account,
  Address,
  Contract,
  Keypair,
  nativeToScVal,
  Networks,
  Operation,
  rpc,
  SorobanDataBuilder,
  StrKey,
  TransactionBuilder,
  xdr
} from '@stellar/stellar-sdk';

import { marketplaceFee } from './amount';
import { secondaryListingKey } from './purchase-cycle';
import type { MarketplaceListing } from './types';

// Deterministic contract addresses; no deployed contracts, RPC or signing.
export const PURCHASE_MARKET = StrKey.encodeContract(new Uint8Array(32).fill(1));
export const PURCHASE_TREASURY = StrKey.encodeContract(new Uint8Array(32).fill(2));
export const PURCHASE_TOKEN = StrKey.encodeContract(new Uint8Array(32).fill(3));
export const PURCHASE_OTHER = StrKey.encodeContract(new Uint8Array(32).fill(4));
export const PURCHASE_BUYER = Keypair.random().publicKey();
export const PURCHASE_SELLER = Keypair.random().publicKey();

export function authorizedCall(
  contract: string,
  method: string,
  args: xdr.ScVal[],
  children: xdr.SorobanAuthorizedInvocation[] = []
) {
  return new xdr.SorobanAuthorizedInvocation({
    function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
      new xdr.InvokeContractArgs({
        contractAddress: new Address(contract).toScAddress(),
        functionName: method,
        args
      })
    ),
    subInvocations: children
  });
}

export function sourceAuthorization(root: xdr.SorobanAuthorizedInvocation) {
  const entry = new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),
    rootInvocation: root
  });
  // Exercise actual serialization, not hand-shaped objects resembling XDR.
  return xdr.SorobanAuthorizationEntry.fromXdr(entry.toXdr('base64'), 'base64');
}

export function contractActionFixture(contract: string, method: string, args: xdr.ScVal[], source: string) {
  const auth = [sourceAuthorization(authorizedCall(contract, method, args))];
  const call = new Contract(contract).call(method, ...args);
  const host = call.body.value as xdr.InvokeHostFunctionOp;
  const encoded = new TransactionBuilder(new Account(source, '1'), { fee: '100', networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.invokeHostFunction({ func: host.hostFunction, auth }))
    .setTimeout(180)
    .build()
    .toXDR();
  return {
    simulationData: { result: { auth, retval: xdr.ScVal.scvVoid() } },
    needsNonInvokerSigningBy: () => [],
    toXdr: () => encoded
  };
}

export function transferAuthorization(asset: string, payer: string, to: string, amount: bigint) {
  return authorizedCall(asset, 'transfer', [
    new Address(payer).toScVal(),
    new Address(to).toScVal(),
    nativeToScVal(amount, { type: 'i128' })
  ]);
}

export function purchaseRootArgs(listing: MarketplaceListing, buyer: string) {
  return [
    listing.kind === 'primary'
      ? nativeToScVal(BigInt(listing.id), { type: 'u64' })
      : nativeToScVal(Number(listing.id), { type: 'u32' }),
    new Address(buyer).toScVal()
  ];
}

export function purchaseFixture(
  listing: MarketplaceListing,
  buyer = PURCHASE_BUYER,
  treasury = PURCHASE_TREASURY,
  changes: {
    children?: xdr.SorobanAuthorizedInvocation[];
    auth?: xdr.SorobanAuthorizationEntry[];
    operationAuth?: xdr.SorobanAuthorizationEntry[];
    hostContract?: string;
    hostMethod?: string;
    hostArgs?: xdr.ScVal[];
    source?: string;
    operationSource?: string;
    extraOperation?: boolean;
  } = {}
) {
  const price = BigInt(listing.price);
  const fee = listing.kind === 'primary' ? 0n : marketplaceFee(listing.price, listing.feeBps);
  const children =
    changes.children ??
    (listing.kind === 'primary'
      ? [transferAuthorization(listing.paymentAsset, buyer, treasury, price)]
      : [
          ...(fee > 0n ? [transferAuthorization(listing.paymentAsset, buyer, treasury, fee)] : []),
          ...(price > fee ? [transferAuthorization(listing.paymentAsset, buyer, listing.seller!, price - fee)] : [])
        ]);
  const method = listing.kind === 'primary' ? 'buy_primary' : 'buy';
  const args = purchaseRootArgs(listing, buyer);
  const auth = changes.auth ?? [sourceAuthorization(authorizedCall(listing.contractId, method, args, children))];
  const call = new Contract(changes.hostContract ?? listing.contractId).call(
    changes.hostMethod ?? method,
    ...(changes.hostArgs ?? args)
  );
  const host = call.body.value as xdr.InvokeHostFunctionOp;
  const operation = Operation.invokeHostFunction({
    func: host.hostFunction,
    auth: changes.operationAuth ?? auth,
    source: changes.operationSource
  });
  const builder = new TransactionBuilder(new Account(changes.source ?? buyer, '1'), {
    fee: '100',
    networkPassphrase: Networks.TESTNET
  })
    .addOperation(operation)
    .setTimeout(180);
  if (changes.extraOperation) builder.addOperation(Operation.manageData({ name: 'unexpected', value: null }));
  const encoded = builder.build().toXDR();
  const simulation: rpc.Api.SimulateTransactionSuccessResponse = {
    id: 'fixture',
    _parsed: true,
    latestLedger: 1000,
    events: [],
    minResourceFee: '0',
    transactionData: new SorobanDataBuilder(),
    result: { auth, retval: xdr.ScVal.scvVoid() },
    stateChanges:
      listing.kind === 'secondary'
        ? [{ type: 3, key: secondaryListingKey(listing), before: secondaryEntry(listing), after: null }]
        : []
  };
  return {
    encoded,
    auth,
    simulationData: { result: { auth, retval: xdr.ScVal.scvVoid() } },
    simulation,
    needsNonInvokerSigningBy: () => [],
    toXdr: () => encoded
  };
}

export function secondaryEntry(listing: MarketplaceListing, ledger = 900) {
  const key = secondaryListingKey(listing);
  if (key.type !== 'contractData') throw new Error('Unexpected fixture key');
  const value = nativeToScVal(
    {
      expires_at: BigInt(listing.expiresAt),
      fee_bps: listing.feeBps,
      payment_asset: listing.paymentAsset,
      price: BigInt(listing.price),
      seller: listing.seller
    },
    {
      type: {
        expires_at: ['symbol', 'u64'],
        fee_bps: ['symbol', 'u32'],
        payment_asset: ['symbol', 'address'],
        price: ['symbol', 'i128'],
        seller: ['symbol', 'address']
      }
    }
  );
  return xdr.LedgerEntry.fromXdr(
    new xdr.LedgerEntry({
      lastModifiedLedgerSeq: ledger,
      data: xdr.LedgerEntryData.contractData(
        new xdr.ContractDataEntry({
          ext: xdr.ExtensionPoint.v0(),
          contract: key.contractData.contract,
          key: key.contractData.key,
          durability: xdr.ContractDataDurability.persistent,
          val: value
        })
      ),
      ext: xdr.LedgerEntryExt.v0()
    }).toXdr('base64'),
    'base64'
  );
}

export const purchaseFixtureClient = new MarketplaceClient({
  contractId: PURCHASE_MARKET,
  networkPassphrase: Networks.TESTNET,
  rpcUrl: 'https://rpc.example'
});
export function creationEvent(listing: MarketplaceListing, ledger = 900): rpc.Api.EventResponse {
  const entry = secondaryEntry(listing, ledger);
  if (entry.data.type !== 'contractData') throw new Error('Unexpected fixture entry');
  return {
    id: `fixture-event-${ledger}`,
    type: 'contract',
    contractId: new Contract(listing.contractId),
    topic: purchaseFixtureClient
      .secondaryListingCreatedEventFilter({ token_id: Number(listing.id) })
      .map((topic) => xdr.ScVal.fromXdr(topic, 'base64')),
    value: entry.data.contractData.val,
    ledger,
    ledgerClosedAt: '2026-10-10T00:00:00Z',
    transactionIndex: 0,
    operationIndex: 0,
    inSuccessfulContractCall: true,
    txHash: listing.transactionHash
  };
}
export function creationHistory(listing: MarketplaceListing): rpc.Api.GetEventsResponse {
  return {
    events: [creationEvent(listing)],
    cursor: '',
    latestLedger: 1000,
    oldestLedger: 1,
    latestLedgerCloseTime: '0',
    oldestLedgerCloseTime: '0'
  };
}
export function currentListingEntry(listing: MarketplaceListing): rpc.Api.GetLedgerEntriesResponse {
  return {
    latestLedger: 1000,
    entries: [{ key: secondaryListingKey(listing), val: secondaryEntry(listing).data, lastModifiedLedgerSeq: 900 }]
  };
}
