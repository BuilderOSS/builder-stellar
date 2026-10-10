import { Client as AuctionClient } from '@builder-stellar/auction-bindings';
import { Client as GovernorClient } from '@builder-stellar/governor-bindings';
import { Client as MarketplaceClient } from '@builder-stellar/marketplace-bindings';
import { Client as MetadataClient } from '@builder-stellar/metadata-bindings';
import { Client as TokenClient } from '@builder-stellar/token-bindings';
import { Client as TreasuryClient } from '@builder-stellar/treasury-bindings';
import { Networks, StrKey, type xdr } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { assertAdminCallSupported } from './admin-registered-call';
import type { DaoNetworkConfig } from './dao-config';
import { keccak256Bytes } from './keccak';
import { inspectProposalAdminCall } from './proposal-action-inspection';
import { artworkSettingMethods } from './proposal-actions/artwork-admin-actions';
import { getActionHandler, getAllActionHandlers, isRegisteredActionType } from './proposal-actions/registry';
import type { BuildContext, FormContext, ProposalQueuedAction } from './proposal-actions/types';
import {
  buildProposalCallVectors,
  encodeProposalCallArgs,
  getProposalActionSummary,
  proposalCallId
} from './proposal-call';
import { encodeSupportedCall } from './proposal-supported-calls';

const contract = (byte: number) => StrKey.encodeContract(new Uint8Array(32).fill(byte));
const config: DaoNetworkConfig = {
  name: 'testnet',
  rpcUrl: 'https://rpc.test',
  passphrase: Networks.TESTNET,
  tokenContractId: contract(1),
  governorContractId: contract(2),
  treasuryContractId: contract(3),
  auctionContractId: contract(4),
  marketplaceContractId: contract(5),
  metadataContractId: contract(6),
  label: '',
  tokenName: '',
  tokenSymbol: '',
  tokenDescription: '',
  adminAddress: '',
  launchAdmin: '',
  contractImage: '',
  auctionEnabled: true,
  auctionPaused: false,
  status: 'operational'
};
const context: FormContext = { config, session: { address: null, kit: null } };
const build: BuildContext = {
  config,
  tokenContractId: config.tokenContractId,
  governorContractId: config.governorContractId,
  treasuryAddress: config.treasuryContractId
};
const batch = {
  names: ['007'],
  items: [{ name: ' 01 ', is_new_property: true, property_id: 0 }],
  ipfsGroup: { base_uri: 'ipfs://collection', extension: '.png' }
};
const metadata = new MetadataClient({
  contractId: config.metadataContractId,
  rpcUrl: config.rpcUrl,
  networkPassphrase: config.passphrase
}).spec;
const xdrs = (args: xdr.ScVal[]) => args.map((arg) => arg.toXDR('base64'));
const action = (id: string, data = batch): ProposalQueuedAction => ({
  id,
  type: 'add-artwork-properties',
  recipient: '',
  amount: '',
  ...data
});

describe('Metadata and module upgrade registry integration', () => {
  it('exposes append, all four settings, and upgrade in composer options, never reset', () => {
    const types = getAllActionHandlers().map((handler) => handler.type);
    expect(types).toEqual(
      expect.arrayContaining(['add-artwork-properties', ...Object.keys(artworkSettingMethods), 'upgrade-dao-module'])
    );
    expect(new Set(types).size).toBe(types.length);
    expect(isRegisteredActionType('reset-artwork-properties')).toBe(false);
    const handler = getActionHandler('add-artwork-properties');
    expect(handler.validate(batch, context).valid).toBe(true);
    expect(handler.serialize(batch, context).type).toBe('add-artwork-properties');
    expect(handler.buildCallVector(batch, build)).toEqual({
      target: config.metadataContractId,
      function: 'add_properties',
      args: [batch.names, batch.items, batch.ipfsGroup]
    });
    expect(() => assertAdminCallSupported(handler, batch, context)).not.toThrow();
    expect(() =>
      encodeSupportedCall(
        config.metadataContractId,
        'delete_and_recreate_properties',
        [batch.names, batch.items, batch.ipfsGroup],
        config
      )
    ).toThrow(/Unsupported/);
  });

  it('matches add_properties vector/UDT spec and reencodes tagged indexed maps to the identical proposal ID', () => {
    expect(metadata.getFunc('add_properties').inputs.map((input) => input.name.toString())).toEqual([
      'names',
      'items',
      'ipfs_group'
    ]);
    const expected = metadata.funcArgsToScVals('add_properties', {
      names: batch.names,
      items: batch.items,
      ipfs_group: batch.ipfsGroup
    });
    const tagged = [
      [
        { vec: [{ string: '007' }] },
        {
          vec: [
            {
              map: [
                { key: { symbol: 'name' }, val: { string: ' 01 ' } },
                { key: { symbol: 'property_id' }, val: { u32: '0' } },
                { key: { symbol: 'is_new_property' }, val: { bool: true } }
              ]
            }
          ]
        },
        {
          map: [
            [{ symbol: 'extension' }, { string: '.png' }],
            [{ symbol: 'base_uri' }, { string: 'ipfs://collection' }]
          ]
        }
      ]
    ];
    const encoded = encodeProposalCallArgs([config.metadataContractId], ['add_properties'], tagged, config);
    expect(xdrs(encoded[0]!)).toEqual(xdrs(expected));
    const hash = keccak256Bytes('Artwork batch identity');
    expect(proposalCallId([config.metadataContractId], ['add_properties'], encoded, hash)).toBe(
      proposalCallId([config.metadataContractId], ['add_properties'], [expected], hash)
    );
    const inspected = inspectProposalAdminCall(
      config.metadataContractId,
      'add_properties',
      [batch.names, batch.items, batch.ipfsGroup],
      config
    )!;
    expect(inspected.fields[0]?.value).toBe('["007"]');
    expect(inspected.fields[1]?.value).toContain(' 01 ');
    expect(inspected.risk).toContain('current Token owner');
  });

  it('encodes every metadata setting as String and accepts legitimate admin calls without invented caller fields', () => {
    for (const [type, method] of Object.entries(artworkSettingMethods)) {
      const handler = getAllActionHandlers().find((item) => item.type === type)!;
      const value = type === 'set-artwork-description' ? '007' : 'https://metadata.example/path';
      expect(handler.validate({ value }, context).valid).toBe(true);
      const call = handler.buildCallVector({ value }, build);
      expect(call).toEqual({ target: config.metadataContractId, function: method, args: [value] });
      const encoded = encodeSupportedCall(call.target, call.function, call.args, config);
      const field = metadata.getFunc(method).inputs[0]!.name.toString();
      expect(xdrs(encoded)).toEqual(xdrs(metadata.funcArgsToScVals(method, { [field]: value })));
      const indexed = encodeProposalCallArgs([call.target], [method], [[{ string: value }]], config);
      const hash = keccak256Bytes(type);
      expect(proposalCallId([call.target], [method], indexed, hash)).toBe(
        proposalCallId([call.target], [method], [encoded], hash)
      );
      expect(encoded[0]?.type).toBe('scvString');
      expect(() => assertAdminCallSupported(handler, { value }, context)).not.toThrow();
      expect(inspectProposalAdminCall(call.target, method, [value], config)?.fields[0]?.value).toBe(value);
    }
  });

  it('retains ordered and repeated artwork append calls instead of collapsing batches', () => {
    const second = { ...batch, names: [], items: [{ name: 'Two', property_id: 0, is_new_property: false }] };
    const actions = [action('first'), action('second', second), action('third', second)];
    const vectors = buildProposalCallVectors(actions, config.tokenContractId, config.treasuryContractId, config);
    expect(vectors.targets).toEqual(Array(3).fill(config.metadataContractId));
    expect(vectors.functions).toEqual(Array(3).fill('add_properties'));
    expect(vectors.args).toEqual([
      [batch.names, batch.items, batch.ipfsGroup],
      [second.names, second.items, second.ipfsGroup],
      [second.names, second.items, second.ipfsGroup]
    ]);
    const encoded = encodeProposalCallArgs(vectors.targets, vectors.functions, vectors.args, config);
    expect(encoded).toHaveLength(3);
    const hash = keccak256Bytes('Ordered artwork');
    expect(proposalCallId(vectors.targets, vectors.functions, encoded, hash)).not.toBe(
      proposalCallId(vectors.targets, vectors.functions, [...encoded].reverse(), hash)
    );
    expect(getProposalActionSummary(actions[0]!)).toContain('1 ordered items');
  });

  it('rejects unsafe nested integers, malformed structs and bools, obsolete argument lists, and unknown targets', () => {
    const encodeItem = (item: unknown) =>
      encodeSupportedCall(config.metadataContractId, 'add_properties', [batch.names, [item], batch.ipfsGroup], config);
    expect(() => encodeItem({ ...batch.items[0], property_id: 9007199254740992 })).toThrow(/Unsafe/);
    expect(() => encodeItem({ ...batch.items[0], property_id: '4294967296' })).toThrow(/range/);
    expect(() => encodeItem({ ...batch.items[0], is_new_property: 'false' })).toThrow(/boolean/);
    expect(() => encodeItem({ name: 'Missing fields' })).toThrow(/struct fields/);
    expect(() => encodeItem({ ...batch.items[0], caller: config.treasuryContractId })).toThrow(/struct fields/);
    expect(() =>
      encodeSupportedCall(
        config.metadataContractId,
        'add_properties',
        [config.treasuryContractId, batch.names, batch.items, batch.ipfsGroup],
        config
      )
    ).toThrow(/argument count/);
    expect(() =>
      encodeSupportedCall(contract(9), 'add_properties', [batch.names, batch.items, batch.ipfsGroup], config)
    ).toThrow(/Unsupported/);
  });

  it('matches upgrade specs for each supported DAO module, retaining all leading-zero BytesN and exact target addresses', () => {
    const fromHash = '0'.repeat(63) + '1';
    const toHash = '0000' + 'AF'.repeat(30);
    const handler = getActionHandler('upgrade-dao-module');
    for (const [module, target, Client] of [
      ['token', config.tokenContractId, TokenClient],
      ['governor', config.governorContractId, GovernorClient],
      ['auction', config.auctionContractId, AuctionClient],
      ['treasury', config.treasuryContractId, TreasuryClient],
      ['marketplace', config.marketplaceContractId, MarketplaceClient]
    ] as const) {
      const values = { module, fromHash, toHash };
      expect(handler.validate(values, context).valid).toBe(true);
      const call = handler.buildCallVector(values, build);
      expect(call).toEqual({ target, function: 'upgrade', args: [fromHash, toHash] });
      const spec = new Client({ contractId: target, rpcUrl: config.rpcUrl, networkPassphrase: config.passphrase }).spec;
      const expected = spec.funcArgsToScVals('upgrade', {
        from_hash: Buffer.from(fromHash, 'hex'),
        to_hash: Buffer.from(toHash, 'hex')
      });
      expect(xdrs(encodeSupportedCall(target, 'upgrade', call.args, config))).toEqual(xdrs(expected));
      const indexed = [
        [
          { bytes: Buffer.from(fromHash, 'hex').toString('base64') },
          { bytes: Buffer.from(toHash, 'hex').toString('base64') }
        ]
      ];
      const reencoded = encodeProposalCallArgs([target], ['upgrade'], indexed, config);
      const hash = keccak256Bytes(module);
      expect(proposalCallId([target], ['upgrade'], reencoded, hash)).toBe(
        proposalCallId([target], ['upgrade'], [expected], hash)
      );
      expect(() => assertAdminCallSupported(handler, values, context)).not.toThrow();
      expect(
        inspectProposalAdminCall(target, 'upgrade', call.args, config)?.fields.map((field) => field.value)
      ).toEqual([fromHash, toHash.toLowerCase()]);
      expect(getProposalActionSummary(handler.serialize(values, context))).toContain(fromHash);
    }
  });

  it('keeps Metadata upgrade blocked despite its ABI, and refuses unknown modules/malformed hashes', () => {
    const handler = getActionHandler('upgrade-dao-module');
    const values = { module: 'metadata', fromHash: '01'.repeat(32), toHash: 'ab'.repeat(32) };
    expect(metadata.getFunc('upgrade').inputs).toHaveLength(2);
    expect(handler.validate(values, context).valid).toBe(false);
    expect(() => assertAdminCallSupported(handler, values, context)).toThrow(/Metadata upgrade/);
    expect(() =>
      encodeSupportedCall(config.metadataContractId, 'upgrade', [values.fromHash, values.toHash], config)
    ).toThrow(/no public getter/);
    expect(() => encodeSupportedCall(config.metadataContractId, 'sync_version', [], config)).toThrow(
      /no public getter/
    );
    expect(() =>
      inspectProposalAdminCall(config.metadataContractId, 'upgrade', [values.fromHash, values.toHash], config)
    ).toThrow(/no public getter/);
    expect(handler.validate({ ...values, module: 'external' }, context).valid).toBe(false);
    expect(handler.validate({ ...values, module: 'token', fromHash: 'bad' }, context).valid).toBe(false);
    expect(() =>
      encodeSupportedCall(config.tokenContractId, 'upgrade', ['ab'.repeat(31), values.toHash], config)
    ).toThrow(/length/);
    expect(() => encodeSupportedCall(contract(9), 'upgrade', [values.fromHash, values.toHash], config)).toThrow(
      /Unsupported/
    );
  });
});
