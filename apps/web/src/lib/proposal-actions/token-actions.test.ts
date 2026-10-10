import { Client as TokenClient } from '@builder-stellar/token-bindings';
import { Networks, StrKey } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import type { DaoNetworkConfig } from '@/lib/dao-config';
import { analyzeProposalAction, isHighRiskProposalAction } from '@/lib/proposal-action-identity';
import { getProposalActionLabel, getProposalActionSummary } from '@/lib/proposal-call';
import { encodeSupportedCall } from '@/lib/proposal-supported-calls';

import { getActionHandler } from './registry';
import type { BuildContext, FormContext } from './types';

const contract = (byte: number) => StrKey.encodeContract(new Uint8Array(32).fill(byte));
const account = StrKey.encodeEd25519PublicKey(new Uint8Array(32).fill(9));
const config = {
  name: 'testnet',
  rpcUrl: 'https://rpc.test',
  passphrase: Networks.TESTNET,
  tokenContractId: contract(1),
  governorContractId: contract(2),
  treasuryContractId: contract(3),
  auctionContractId: contract(4),
  marketplaceContractId: contract(5),
  metadataContractId: contract(6)
} as DaoNetworkConfig;
const build: BuildContext = {
  config,
  tokenContractId: config.tokenContractId,
  governorContractId: config.governorContractId,
  treasuryAddress: config.treasuryContractId
};
const form = { config, session: { address: null, kit: null } } as FormContext;
const spec = new TokenClient({
  contractId: config.tokenContractId,
  rpcUrl: config.rpcUrl,
  networkPassphrase: config.passphrase
}).spec;

const rename = getActionHandler('set-token-metadata');
const give = getActionHandler('transfer-dao-token');
const draft = { name: 'Lantern Club', symbol: 'LANTERN', uri: 'https://example.com/api/dao/x/token/' };

describe('set-token-metadata', () => {
  it('encodes token.set_metadata(uri, name, symbol) against the real token spec', () => {
    const call = rename.buildCallVector(draft, build);
    expect(call).toEqual({
      target: config.tokenContractId,
      function: 'set_metadata',
      args: [draft.uri, draft.name, draft.symbol]
    });
    const encoded = encodeSupportedCall(call.target, call.function, call.args, config);
    expect(encoded.map((arg) => arg.toXDR('base64'))).toEqual(
      spec.funcArgsToScVals('set_metadata', draft).map((arg) => arg.toXDR('base64'))
    );
  });

  it("enforces the token's on-chain limits (name 40 bytes, symbol 10, URI 200 bytes)", () => {
    expect(rename.validate(draft, form).valid).toBe(true);
    expect(rename.validate({ ...draft, name: 'x'.repeat(41) }, form).valid).toBe(false);
    // Multi-byte characters count as bytes on chain.
    expect(rename.validate({ ...draft, name: 'é'.repeat(21) }, form).valid).toBe(false);
    expect(rename.validate({ ...draft, symbol: 'ABCDEFGHIJK' }, form).valid).toBe(false);
    expect(rename.validate({ ...draft, symbol: 'abc' }, form).valid).toBe(false);
    expect(rename.validate({ ...draft, uri: `https://e.com/${'a'.repeat(190)}` }, form).valid).toBe(false);
  });

  it('is one resource per DAO, high risk, and reads as a rename', () => {
    const first = rename.serialize(draft, form);
    const second = rename.serialize({ ...draft, name: 'Lantern Society' }, form);
    expect(analyzeProposalAction(second, [first]).some((finding) => finding.kind === 'conflict')).toBe(true);
    expect(isHighRiskProposalAction(first)).toBe(true);
    expect(getProposalActionLabel('set-token-metadata')).toBe('Rename Community');
    expect(getProposalActionSummary(first)).toBe('Rename to Lantern Club (LANTERN)');
  });
});

describe('transfer-dao-token', () => {
  it('sends from the treasury, which executes the call, encoded with the token spec', () => {
    const call = give.buildCallVector({ tokenId: '12', recipient: account }, build);
    expect(call).toEqual({
      target: config.tokenContractId,
      function: 'transfer',
      args: [config.treasuryContractId, account, 12]
    });
    const encoded = encodeSupportedCall(call.target, call.function, call.args, config);
    expect(encoded.map((arg) => arg.toXDR('base64'))).toEqual(
      spec
        .funcArgsToScVals('transfer', { from: config.treasuryContractId, to: account, token_id: 12 })
        .map((arg) => arg.toXDR('base64'))
    );
  });

  it('needs a token number and a real address; two gifts of one token clash', () => {
    expect(give.validate({ tokenId: '', recipient: account }, form).valid).toBe(false);
    expect(give.validate({ tokenId: '3', recipient: 'nope' }, form).valid).toBe(false);
    const a = give.serialize({ tokenId: '3', recipient: account }, form);
    const b = give.serialize(
      { tokenId: '3', recipient: StrKey.encodeEd25519PublicKey(new Uint8Array(32).fill(8)) },
      form
    );
    expect(analyzeProposalAction(b, [a]).some((finding) => finding.kind === 'conflict')).toBe(true);
  });
});
