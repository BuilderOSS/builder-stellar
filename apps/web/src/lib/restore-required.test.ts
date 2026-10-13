import {
  Account,
  Address,
  Contract,
  Keypair,
  Networks,
  SorobanDataBuilder,
  TransactionBuilder,
  xdr
} from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';
import { describe, expect, it } from 'vitest';

import { restoreFromBody, RestoreRequiredError, restoreResponseBody, throwIfRestoreNeeded } from './restore-required';

const member = Keypair.random().publicKey();
const token = Address.contract(Buffer.alloc(32, 4)).toString();
const archived = xdr.LedgerKey.contractData(
  new xdr.LedgerKeyContractData({
    contract: new Address(token).toScAddress(),
    key: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Owner'), xdr.ScVal.scvU32(7)]),
    durability: xdr.ContractDataDurability.persistent
  })
);

/** What an AssembledTransaction holds after a simulation. */
function assembled(restore: boolean) {
  const built = new TransactionBuilder(new Account(member, '41'), { fee: '100', networkPassphrase: Networks.TESTNET })
    .addOperation(new Contract(token).call('transfer'))
    .setTimeout(180)
    .build();
  const simulation = {
    latestLedger: 1,
    transactionData: new SorobanDataBuilder(),
    minResourceFee: '10',
    result: { auth: [], retval: xdr.ScVal.scvVoid() },
    events: [],
    _parsed: true,
    ...(restore
      ? {
          restorePreamble: {
            transactionData: new SorobanDataBuilder().setReadWrite([archived]),
            minResourceFee: '12345'
          }
        }
      : {})
  };
  return { built, simulation, options: { networkPassphrase: Networks.TESTNET } } as unknown as Parameters<
    typeof throwIfRestoreNeeded
  >[0];
}

describe('archived member state', () => {
  it('turns a restore simulation into an unsigned restore for the same account and sequence', () => {
    let caught: unknown;
    try {
      throwIfRestoreNeeded(assembled(true));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RestoreRequiredError);
    const restore = (caught as RestoreRequiredError).restore;
    const tx = TransactionBuilder.fromXDR(restore.xdr, Networks.TESTNET);
    expect('source' in tx && tx.source).toBe(member);
    expect('sequence' in tx && tx.sequence).toBe('42');
    expect(tx.operations.map((op) => op.type)).toEqual(['restoreFootprint']);
    expect(restore.fee).toBe('12445');
    // The archived entry is in the restore's read-write footprint.
    expect(Buffer.from(restore.xdr, 'base64').toString('hex')).toContain(archived.toXDR('hex'));
  });

  it('leaves a simulation that needs nothing restored alone', () => {
    expect(() => throwIfRestoreNeeded(assembled(false))).not.toThrow();
  });

  it('round-trips through the prepare route body', () => {
    const error = new RestoreRequiredError({ xdr: 'AAAA', fee: '12445' });
    const body = JSON.parse(JSON.stringify(restoreResponseBody(error)));
    const back = restoreFromBody(body);
    expect(back).toBeInstanceOf(RestoreRequiredError);
    expect(back?.restore).toEqual({ xdr: 'AAAA', fee: '12445' });
    expect(restoreFromBody({ message: 'other failure' })).toBeNull();
    expect(restoreFromBody(null)).toBeNull();
  });
});
