import type { Client } from '@builder-stellar/marketplace-bindings';
import { Address, nativeToScVal, rpc, scValToNative, xdr } from '@stellar/stellar-sdk';

import { marketplaceId } from './amount';
import { STALE_PURCHASE } from './purchase-authorization';
import { MarketplaceError, matchesSnapshot } from './query';
import type { MarketplaceListing } from './types';

function reject(): never {
  throw new MarketplaceError(STALE_PURCHASE, 409);
}
export function secondaryListingKey(listing: MarketplaceListing) {
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(listing.contractId).toScAddress(),
      // Existing Rust DataKey::Listing(u32); no new method or storage field.
      key: xdr.ScVal.scvVec([
        xdr.ScVal.scvSymbol('Listing'),
        nativeToScVal(Number(marketplaceId(listing.id, 'secondary')), { type: 'u32' })
      ]),
      durability: xdr.ContractDataDurability.persistent
    })
  );
}
function sameKey(left: xdr.LedgerKey, right: xdr.LedgerKey) {
  return left.toXdr('base64') === right.toXdr('base64');
}
function assertListingData(data: xdr.LedgerEntryData, listing: MarketplaceListing, key: xdr.LedgerKey) {
  if (data.type !== 'contractData' || key.type !== 'contractData') reject();
  const actual = data.contractData;
  if (
    Address.fromScAddress(actual.contract).toString() !== listing.contractId ||
    actual.key.toXdr('base64') !== key.contractData.key.toXdr('base64') ||
    actual.durability.name !== 'persistent'
  )
    reject();
  const decoded: unknown = scValToNative(actual.val);
  if (!decoded || typeof decoded !== 'object') reject();
  const value = decoded as Record<string, unknown>;
  if (
    typeof value.price !== 'bigint' ||
    typeof value.expires_at !== 'bigint' ||
    typeof value.payment_asset !== 'string' ||
    typeof value.seller !== 'string' ||
    typeof value.fee_bps !== 'number' ||
    !matchesSnapshot(listing, {
      price: value.price,
      expires_at: value.expires_at,
      payment_asset: value.payment_asset,
      seller: value.seller,
      fee_bps: value.fee_bps
    })
  )
    reject();
}

/** A token id is not a listing generation. Prove the simulation deleted the
 * reviewed creation's entry, not a replacement with identical payment terms.
 * Missing state differences / retained creation evidence fail closed.
 * This verifies preparation; the existing ABI cannot pin an identical-term ABA
 * replacement between preparation and execution (requires a contract generation guard).
 */
export async function assertSecondaryPurchaseCycle(
  listing: MarketplaceListing,
  creation: { createdLedger: bigint; createdTransactionHash: string },
  simulation: rpc.Api.SimulateTransactionResponse | undefined,
  client: Pick<Client, 'secondaryListingCreatedEventFilter' | 'parseEvent'>,
  server: Pick<rpc.Server, 'getEvents' | 'getLedgerEntries'>
) {
  try {
    if (creation.createdTransactionHash !== listing.transactionHash) reject();
    if (
      !simulation ||
      rpc.Api.isSimulationError(simulation) ||
      !rpc.Api.isSimulationSuccess(simulation) ||
      rpc.Api.isSimulationRestore(simulation) ||
      !simulation.stateChanges
    )
      reject();
    const key = secondaryListingKey(listing);
    const changes = simulation.stateChanges.filter((change) => sameKey(change.key, key));
    if (changes.length !== 1 || !changes[0].before || changes[0].after !== null) reject();
    const before = changes[0].before;
    if (
      BigInt(before.lastModifiedLedgerSeq) !== creation.createdLedger ||
      creation.createdLedger < 1n ||
      creation.createdLedger > BigInt(simulation.latestLedger)
    )
      reject();
    assertListingData(before.data, listing, key);

    const [history, current] = await Promise.all([
      server.getEvents({
        startLedger: Number(creation.createdLedger),
        endLedger: Number(creation.createdLedger) + 1,
        filters: [
          {
            type: 'contract',
            contractIds: [listing.contractId],
            topics: [
              client.secondaryListingCreatedEventFilter({ token_id: Number(marketplaceId(listing.id, 'secondary')) })
            ]
          }
        ],
        limit: 1000
      }),
      server.getLedgerEntries(key)
    ]);
    if (
      history.events.length >= 1000 ||
      history.oldestLedger > Number(creation.createdLedger) ||
      history.latestLedger < simulation.latestLedger ||
      current.latestLedger < simulation.latestLedger
    )
      reject();
    const creations = history.events.filter(
      (event) =>
        event.inSuccessfulContractCall &&
        event.type === 'contract' &&
        event.ledger === Number(creation.createdLedger) &&
        event.contractId?.contractId() === listing.contractId &&
        client.parseEvent(event.topic, event.value)?.name === 'SecondaryListingCreated'
    );
    // Multiple creates for this token in one ledger are ambiguous without a
    // contract generation id. Do not select by transaction hash alone.
    if (creations.length !== 1 || creations[0].txHash !== creation.createdTransactionHash) reject();
    const event = client.parseEvent(creations[0].topic, creations[0].value);
    if (
      event?.name !== 'SecondaryListingCreated' ||
      event.data.token_id !== Number(marketplaceId(listing.id, 'secondary')) ||
      event.data.price === undefined ||
      event.data.expires_at === undefined ||
      event.data.payment_asset === undefined ||
      !matchesSnapshot(listing, {
        price: event.data.price,
        expires_at: event.data.expires_at,
        payment_asset: event.data.payment_asset,
        seller: event.data.seller,
        fee_bps: event.data.fee_bps
      })
    )
      reject();
    if (
      current.entries.length !== 1 ||
      !sameKey(current.entries[0].key, key) ||
      current.entries[0].lastModifiedLedgerSeq !== before.lastModifiedLedgerSeq
    )
      reject();
    assertListingData(current.entries[0].val, listing, key);
  } catch (error) {
    if (error instanceof MarketplaceError) throw error;
    throw new MarketplaceError(
      'The listing cycle cannot be verified from retained chain evidence. Do not sign; refresh and review again or use an RPC provider with the required history/state differences.',
      409
    );
  }
}
