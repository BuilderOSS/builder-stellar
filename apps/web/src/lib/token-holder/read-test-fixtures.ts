import { nativeToScVal, Networks } from '@stellar/stellar-sdk';
import { AssembledTransaction } from '@stellar/stellar-sdk/contract';

/** Real SDK result/error getters, with no RPC, account lookup, signing or submission. */
export async function missingTokenRead() {
  const tx = await AssembledTransaction.build<string>({
    contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
    rpcUrl: 'https://rpc.invalid',
    networkPassphrase: Networks.TESTNET,
    method: 'owner_of',
    args: [nativeToScVal(0, { type: 'u32' })],
    simulate: false,
    parseResultXdr: () => {
      throw new Error('Failed simulation must not be decoded.');
    },
    errorTypes: { 200: { message: 'NonExistentToken' } }
  });
  tx.simulation = {
    id: 'test',
    latestLedger: 1000,
    events: [],
    _parsed: true,
    error: 'HostError: Error(Contract, #200)'
  };
  return tx;
}
