import { Client as MarketplaceClient } from '@builder-stellar/marketplace-bindings';
import { Client as TokenClient } from '@builder-stellar/token-bindings';
import { Keypair, nativeToScVal, Networks, scValToNative, StrKey, xdr } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { contractCallLabel } from './contract-call-labels';
import { keccak256Bytes } from './keccak';
import { getActionHandler, getAllActionHandlers } from './proposal-actions/registry';
import type { BuildContext, FormContext, ProposalActionType } from './proposal-actions/types';
import {
  encodeProposalCallArgs,
  getProposalActionLabel,
  getProposalActionSummary,
  normalizeProposalCallArgs,
  proposalCallId
} from './proposal-call';
import type { ProposalEncodingContext } from './proposal-supported-calls';

const contract = (byte: number) => StrKey.encodeContract(new Uint8Array(32).fill(byte));
const recipient = Keypair.fromRawEd25519Seed(new Uint8Array(32).fill(7)).publicKey();
const config: ProposalEncodingContext = {
  name: 'testnet',
  rpcUrl: 'https://example.test',
  passphrase: Networks.TESTNET,
  tokenContractId: contract(1),
  governorContractId: contract(2),
  treasuryContractId: contract(3),
  auctionContractId: contract(4),
  marketplaceContractId: contract(5),
  metadataContractId: contract(6),
  claimsContractId: contract(7)
};
const encode = (target: string, fn: string, args: unknown[]) =>
  encodeProposalCallArgs([target], [fn], [args], config)[0] as xdr.ScVal[];

describe('current proposal ABI encoding', () => {
  it('builds vector batch_mint, matching the immutable generated token spec', () => {
    const handler = getActionHandler('batch-mint-governance-token');
    const call = handler.buildCallVector({ recipient, amount: '20' }, {
      config,
      tokenContractId: config.tokenContractId,
      governorContractId: config.governorContractId,
      treasuryAddress: config.treasuryContractId
    } as BuildContext);
    expect(call.args).toEqual([config.treasuryContractId, [recipient], ['20']]);
    const spec = new TokenClient({
      contractId: config.tokenContractId,
      rpcUrl: config.rpcUrl,
      networkPassphrase: config.passphrase
    }).spec;
    const expected = spec.funcArgsToScVals('batch_mint', {
      minter: config.treasuryContractId,
      recipients: [recipient],
      amounts: [20n]
    });
    expect(encode(call.target, call.function, call.args).map((arg) => arg.toXDR('base64'))).toEqual(
      expected.map((arg) => arg.toXDR('base64'))
    );
    expect(() => encode(call.target, call.function, [config.treasuryContractId, recipient, 20])).toThrow(/vector/);
  });

  it('distinguishes NFT transfer u32 from SAC transfer i128, refusing unknown targets', () => {
    expect(encode(config.tokenContractId, 'transfer', [config.treasuryContractId, recipient, '12'])[2]?.type).toBe(
      'scvU32'
    );
    const sac = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
    expect(encode(sac, 'transfer', [config.treasuryContractId, recipient, '9007199254740993123'])[2]?.type).toBe(
      'scvI128'
    );
    expect(() => encode(contract(8), 'transfer', [config.treasuryContractId, recipient, '12'])).toThrow(
      /Unsupported external/
    );
    expect(() =>
      encode(config.tokenContractId, 'transfer', [config.treasuryContractId, recipient, '4294967296'])
    ).toThrow(/range/);
  });

  it('retains wide indexed integers exactly, rejects already-lossy values and invalid booleans', () => {
    const args = [[{ u128: '900719925474099312345' }]];
    expect(normalizeProposalCallArgs(args)).toEqual([['900719925474099312345']]);
    expect(
      scValToNative(
        encode(config.governorContractId, 'set_proposal_threshold', normalizeProposalCallArgs(args)[0]!)[0]!
      )
    ).toBe(900719925474099312345n);
    expect(() => normalizeProposalCallArgs([[{ u128: 9007199254740992 }]])).toThrow(/Unsafe/);
    expect(() => normalizeProposalCallArgs([[{ bool: 'false' }]])).toThrow(/boolean/);
  });

  it('builds exact SAC amounts and validates balance precision without floats', () => {
    const handler = getActionHandler('transfer-sac-token');
    const data = { recipient, assetCode: 'XLM', amount: '90071992547409.9312345' };
    const context = {
      config,
      tokenContractId: config.tokenContractId,
      governorContractId: config.governorContractId,
      treasuryAddress: config.treasuryContractId
    } as BuildContext;
    expect(handler.buildCallVector(data, context).args[2]).toBe('900719925474099312345');
    const form = {
      config,
      session: { address: recipient, kit: null },
      balances: [{ assetCode: 'XLM', balance: '90071992547409.9312344', isNative: true }]
    } as FormContext;
    expect(handler.validate(data, form).valid).toBe(false);
    expect(handler.validate({ ...data, amount: '0.00000001' }, form).valid).toBe(false);
    expect(handler.validate({ ...data, amount: '1' }, { ...form, balancesError: 'RPC unavailable' }).valid).toBe(false);
    const local = {
      ...context,
      config: { ...context.config, name: 'local' as const, passphrase: 'Standalone Network ; February 2017' }
    };
    const call = handler.buildCallVector({ ...data, amount: '1' }, local);
    expect(() => encodeProposalCallArgs([call.target], [call.function], [call.args], local.config)).not.toThrow();
  });

  it('reencodes typed indexed calls to the exact original XDR and proposal ID', () => {
    const targets = [config.tokenContractId, config.governorContractId, config.treasuryContractId];
    const functions = ['batch_mint', 'set_proposal_threshold', 'upgrade'];
    const original = [
      [
        nativeToScVal(config.treasuryContractId, { type: 'address' }),
        nativeToScVal([recipient], { type: 'address' }),
        nativeToScVal([20n], { type: 'u128' })
      ],
      [nativeToScVal(900719925474099312345n, { type: 'u128' })],
      [xdr.ScVal.scvBytes(new Uint8Array(32).fill(11)), xdr.ScVal.scvBytes(new Uint8Array(32).fill(12))]
    ];
    const indexed = [
      [{ address: config.treasuryContractId }, { vec: [{ address: recipient }] }, { vec: [{ u128: '20' }] }],
      [{ u128: '900719925474099312345' }],
      [{ bytes: Buffer.alloc(32, 11).toString('base64') }, { bytes: Buffer.alloc(32, 12).toString('hex') }]
    ];
    const reencoded = encodeProposalCallArgs(targets, functions, indexed, config) as xdr.ScVal[][];
    expect(reencoded.map((call) => call.map((arg) => arg.toXDR('base64')))).toEqual(
      original.map((call) => call.map((arg) => arg.toXDR('base64')))
    );
    const description = keccak256Bytes('Exact proposal identity');
    expect(proposalCallId(targets, functions, reencoded, description)).toBe(
      proposalCallId(targets, functions, original, description)
    );
    expect(proposalCallId(targets, functions, reencoded, description)).not.toBe(
      proposalCallId([...targets].reverse(), functions, original, description)
    );
    expect(() => encode(config.treasuryContractId, 'upgrade', ['abc', 'def'])).toThrow(/length/);
  });

  it('matches current marketplace spec for all supported admin calls and discriminates pause ABIs', () => {
    const spec = new MarketplaceClient({
      contractId: config.marketplaceContractId,
      rpcUrl: config.rpcUrl,
      networkPassphrase: config.passphrase
    }).spec;
    for (const [fn, args, native] of [
      ['set_payment_asset', [contract(10)], { payment_asset: contract(10) }],
      ['set_secondary_fee_bps', [10000], { fee_bps: 10000 }],
      ['pause', [], {}],
      ['unpause', [], {}],
      [
        'open_pool',
        ['9007199254740993', contract(10), '9007199254740994', 100, 2, 10, '86400'],
        {
          price: 9007199254740993n,
          asset: contract(10),
          expires_at: 9007199254740994n,
          size: 100,
          max_per_buyer: 2,
          max_sold_per_period: 10,
          period_secs: 86400n
        }
      ],
      ['close_pool', [7], { pool_id: 7 }],
      ['sweep_pool', [7], { pool_id: 7 }]
    ] as const) {
      const encoded = encode(config.marketplaceContractId, fn, [...args]);
      expect(encoded.map((arg) => arg.toXDR('base64'))).toEqual(
        spec.funcArgsToScVals(fn, native).map((arg) => arg.toXDR('base64'))
      );
      const indexed = encoded.map((arg) => {
        const value = scValToNative(arg);
        return typeof value === 'bigint' ? { [arg.type.slice(3).toLowerCase()]: value.toString() } : value;
      });
      const reencoded = encode(config.marketplaceContractId, fn, indexed);
      const hash = keccak256Bytes('Marketplace admin');
      expect(proposalCallId([config.marketplaceContractId], [fn], [reencoded], hash)).toBe(
        proposalCallId([config.marketplaceContractId], [fn], [encoded], hash)
      );
    }
    expect(() => encode(config.marketplaceContractId, 'pause', [config.treasuryContractId])).toThrow(/argument count/);
    expect(() => encode(config.auctionContractId, 'pause', [])).toThrow(/argument count/);
    expect(() => encode(config.marketplaceContractId, 'set_payment_token', [contract(10)])).toThrow(/Unsupported/);
    expect(encode(config.governorContractId, 'set_queue_delay', [300])[0]?.type).toBe('scvU32');
    expect(encode(config.auctionContractId, 'set_min_bid_increment', [10])[0]?.type).toBe('scvU32');
    expect(encode(config.auctionContractId, 'cancel_auction', [])).toEqual([]);
  });
});

describe('mint draft wording', () => {
  const recipient = Keypair.random().publicKey();
  it('describes queued mints the way the proposal page does', () => {
    const mint = { id: 'a', type: 'batch-mint-governance-token' as const, recipient, amount: '5' };
    expect(getProposalActionSummary(mint)).toBe(`Mint 5 membership tokens to ${recipient}`);
    expect(getProposalActionSummary({ ...mint, amount: '1' })).toBe(`Mint a membership token to ${recipient}`);
    expect(getProposalActionSummary({ ...mint, type: 'mint-governance-token', amount: '' })).toBe(
      `Mint a membership token to ${recipient}`
    );
    expect(getProposalActionLabel('batch-mint-governance-token')).toBe('Mint membership tokens');
  });
});

describe('admin draft wording', () => {
  const setting = (type: ProposalActionType, value: string) => ({ id: 'a', type, recipient: '', amount: value, value });

  it('labels each action in sentence case, the way the proposal page titles its call', () => {
    expect(getProposalActionLabel('transfer-sac-token')).toBe('Send treasury funds');
    expect(getProposalActionLabel('set-voting-delay')).toBe(contractCallLabel('set_voting_delay'));
    expect(getProposalActionLabel('set-queue-delay')).toBe(contractCallLabel('set_queue_delay'));
    expect(getProposalActionLabel('set-auction-reserve-price')).toBe(contractCallLabel('set_reserve_price'));
    expect(getProposalActionLabel('pause-auction')).toBe('Pause auctions');
    expect(getProposalActionLabel('pause-marketplace')).toBe('Pause the market');
    expect(getProposalActionLabel('unpause-marketplace')).toBe('Reopen the market');
    for (const handler of getAllActionHandlers()) {
      const label = getProposalActionLabel(handler.type);
      expect(label, handler.type).toBe(handler.label);
      // Sentence case: no capitalised word after the first (acronyms like DAO and "(Treasury)" pass).
      expect(
        label
          .split(' ')
          .slice(1)
          .filter((word) => /^[A-Z][a-z]/.test(word)),
        handler.type
      ).toEqual([]);
    }
  });

  it('names the asset a new starting price is paid in', () => {
    const price = {
      id: 'p',
      type: 'set-auction-reserve-price',
      recipient: '',
      amount: '150',
      reservePrice: '150'
    } as const;
    expect(getProposalActionSummary({ ...price, assetCode: 'XLM' })).toBe('Change the starting price to 150 XLM');
    // A draft saved before the asset was recorded still reads.
    expect(getProposalActionSummary(price)).toBe('Change the starting price to 150');
  });

  it('summarises settings as sentences with units', () => {
    expect(getProposalActionSummary(setting('set-voting-delay', '3600'))).toBe(
      'Change the wait before voting opens to 1 hour'
    );
    expect(getProposalActionSummary(setting('set-voting-period', '90000'))).toBe(
      'Change how long voting stays open to 1 day 1 hour'
    );
    expect(getProposalActionSummary(setting('set-queue-delay', '172800'))).toBe('Change the safety delay to 2 days');
    expect(getProposalActionSummary(setting('set-proposal-threshold', '5'))).toBe('Require 5 votes to make a proposal');
    expect(getProposalActionSummary(setting('set-proposal-threshold', '1'))).toBe('Require 1 vote to make a proposal');
    expect(getProposalActionSummary(setting('set-quorum-bps', '1250'))).toBe('Change the quorum to 12.5%');
    expect(getProposalActionSummary(setting('set-marketplace-secondary-fee', '250'))).toBe(
      'Change the resale fee to 2.5%'
    );
    expect(getProposalActionSummary(setting('set-auction-duration', '86400'))).toBe(
      'Change how long each auction runs to 1 day'
    );
    expect(getProposalActionSummary(setting('set-auction-time-buffer', '300'))).toBe('Make a late bid add 5 minutes');
    expect(getProposalActionSummary(setting('set-auction-min-bid-increment', '5'))).toBe(
      'Change the minimum bid increase to 5%'
    );
  });

  it('summarises pauses, pools and treasury sends without jargon', () => {
    const empty = (type: ProposalActionType) => ({ id: 'a', type, recipient: '', amount: '' });
    expect(getProposalActionSummary(empty('unpause-auction'))).toBe('Resume auctions');
    expect(getProposalActionSummary(empty('cancel-auction'))).toBe('Cancel the current auction');
    expect(getProposalActionSummary({ ...empty('close-pool'), poolId: '3' })).toBe('Close pool #3');
    expect(getProposalActionSummary({ ...empty('sweep-pool'), poolId: '3' })).toBe(
      'Move pool #3’s unsold tokens to the treasury'
    );
    expect(
      getProposalActionSummary({ id: 'a', type: 'transfer-sac-token', recipient, amount: '12.5', assetCode: 'XLM' })
    ).toBe(`Send 12.5 XLM to ${recipient}`);
  });
});
