import { nativeToScVal, Networks, StrKey, xdr } from '@stellar/stellar-sdk';
import type { Api } from '@stellar/stellar-sdk/rpc';
import { describe, expect, it } from 'vitest';

import { decodeExecutionReceipt } from './proposal-execution-receipt';
import type { ProposalEncodingContext } from './proposal-supported-calls';

const contract = (byte: number) => StrKey.encodeContract(new Uint8Array(32).fill(byte));
const config = {
  name: 'testnet',
  rpcUrl: 'https://rpc.test',
  passphrase: Networks.TESTNET,
  treasuryContractId: contract(1),
  governorContractId: contract(2)
} as ProposalEncodingContext;
const proposal = { proposalId: 'ab'.repeat(32), targets: [contract(3), contract(4)], functions: ['mint', 'pause'] };
const event = (
  index: number,
  treasury = config.treasuryContractId,
  governor = config.governorContractId,
  id = proposal.proposalId
) =>
  new xdr.ContractEvent({
    ext: xdr.ExtensionPoint.v0(),
    contractId: new xdr.ContractId(StrKey.decodeContract(treasury)),
    type: xdr.ContractEventType.contract,
    body: xdr.ContractEventBody.v0(
      new xdr.ContractEventV0({
        topics: [
          xdr.ScVal.scvSymbol('execute'),
          nativeToScVal(governor, { type: 'address' }),
          nativeToScVal(proposal.targets[index], { type: 'address' }),
          xdr.ScVal.scvBytes(Buffer.from(id, 'hex'))
        ],
        data: nativeToScVal(
          { function: proposal.functions[index], index },
          { type: { function: ['symbol', 'symbol'], index: ['symbol', 'u32'] } }
        )
      })
    )
  });
const response = (events: xdr.ContractEvent[]) =>
  ({
    status: 'SUCCESS',
    txHash: 'hash',
    ledger: 30,
    events: { contractEventsXdr: [events] }
  }) as Api.GetSuccessfulTransactionResponse;
describe('ordered Treasury execution receipts', () => {
  it('orders by contract call index and excludes other Treasury/DAO/proposal events', () => {
    const receipt = decodeExecutionReceipt(
      response([
        event(1),
        event(0, contract(9)),
        event(0, config.treasuryContractId, contract(8)),
        event(0, config.treasuryContractId, config.governorContractId, 'cd'.repeat(32)),
        event(0)
      ]),
      config,
      proposal
    );
    expect(receipt.calls).toEqual([
      { index: 0, target: contract(3), function: 'mint' },
      { index: 1, target: contract(4), function: 'pause' }
    ]);
    expect(receipt.transactionHash).toBe('hash');
  });
  it('does not fabricate a complete receipt from missing or duplicate calls', () => {
    expect(() => decodeExecutionReceipt(response([event(0)]), config, proposal)).toThrow(/unavailable/);
    expect(() => decodeExecutionReceipt(response([event(0), event(0)]), config, proposal)).toThrow(/unavailable/);
    const failed = {
      ...response([event(0), event(1)]),
      status: 'FAILED'
    } as unknown as Api.GetSuccessfulTransactionResponse;
    expect(() => decodeExecutionReceipt(failed, config, proposal)).toThrow(/successful/);
  });
});
