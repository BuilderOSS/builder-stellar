/**
 * docs/STORAGE_DIET_REVIEW.md § 3 open item: the app reported about twice the
 * simulated resource fee. stellar-sdk 17.1.0 `AssembledTransaction.sign` rebuilds
 * with `fee: this.built.fee` (which already includes the resource fee), and
 * `build()` adds the resource fee again. patches/@stellar__stellar-sdk@17.1.0.patch
 * drops that override; this test pins the fixed behavior.
 */
import {
  Account,
  Address,
  Contract,
  contract,
  Keypair,
  Networks,
  SorobanDataBuilder,
  TransactionBuilder,
  xdr
} from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

describe('AssembledTransaction.sign fee', () => {
  it('keeps one resource fee when it rebuilds the transaction for signing', async () => {
    const source = Keypair.random().publicKey();
    const contractId = new Contract(Address.contract(Buffer.alloc(32, 7)).toString()).contractId();
    const resourceFee = 2_998_799_289n;
    const written = xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        contract: new Address(contractId).toScAddress(),
        key: xdr.ScVal.scvU32(1),
        durability: xdr.ContractDataDurability.persistent
      })
    );
    const data = new SorobanDataBuilder().setResourceFee(resourceFee).setReadWrite([written]).build();
    const built = new TransactionBuilder(new Account(source, '1'), { fee: '100', networkPassphrase: Networks.TESTNET })
      .addOperation(new Contract(contractId).call('propose'))
      .setSorobanData(data)
      .setTimeout(180)
      .build();
    expect(BigInt(built.fee)).toBe(resourceFee + 100n);

    const assembled = contract.AssembledTransaction.fromJson(
      {
        contractId,
        method: 'propose',
        networkPassphrase: Networks.TESTNET,
        rpcUrl: 'https://rpc.invalid',
        publicKey: source,
        parseResultXdr: () => null
      },
      {
        tx: built.toXDR(),
        simulationResult: { auth: [], retval: xdr.ScVal.scvVoid().toXDR('base64') },
        simulationTransactionData: data.toXDR('base64')
      }
    );
    let signed = '';
    await assembled.sign({
      signTransaction: async (txXdr: string) => {
        signed = txXdr;
        return { signedTxXdr: txXdr, signerAddress: source };
      }
    });
    expect(BigInt(TransactionBuilder.fromXDR(signed, Networks.TESTNET).fee)).toBe(resourceFee + 100n);
  });
});
