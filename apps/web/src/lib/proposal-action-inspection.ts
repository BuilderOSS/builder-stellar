import { scValToNative } from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';

import { encodeSupportedCall, type ProposalEncodingContext } from '@/lib/proposal-supported-calls';

export type ProposalCallInspection = {
  title: string;
  risk: string;
  fields: { label: string; value: string }[];
};

/** Inspect only target-role/spec-validated admin calls; never guess an external ABI. */
export function inspectProposalAdminCall(
  target: string,
  fn: string,
  args: unknown[],
  config: ProposalEncodingContext
): ProposalCallInspection | null {
  if (config.minterContractId && target === config.minterContractId) {
    const values = encodeSupportedCall(target, fn, args, config).map(scValToNative);
    return {
      title:
        fn === 'set_merkle_root'
          ? 'Set Minter Merkle root'
          : fn === 'set_allowlist'
            ? 'Replace Minter allowlist'
            : 'Minter batch allocation',
      risk: 'High risk: changes token allocation. Root/list replacement starts a new round and permits repeat claims; batch mint is immediate on execution. Requires the current Token admin and Live/mint authority checks.',
      fields: [
        { label: 'DAO Token', value: String(values[0]) },
        ...values.slice(1).map((value, i) => ({
          label: fn === 'set_merkle_root' ? 'Root (32 bytes)' : `Ordered allocation argument ${i + 1}`,
          value:
            value instanceof Uint8Array
              ? Buffer.from(value).toString('hex')
              : JSON.stringify(value, (_, item) => (typeof item === 'bigint' ? item.toString() : item))
        }))
      ]
    };
  }
  const metadataCall = !!config.metadataContractId && target === config.metadataContractId;
  if (!metadataCall && fn !== 'upgrade') return null;
  const encoded = encodeSupportedCall(target, fn, args, config);
  if (fn === 'upgrade') {
    const modules = [
      ['token', config.tokenContractId],
      ['governor', config.governorContractId],
      ['auction', config.auctionContractId],
      ['treasury', config.treasuryContractId],
      ['marketplace', config.marketplaceContractId]
    ];
    const moduleName = modules.find(([, address]) => address === target)?.[0];
    if (!moduleName) return null;
    return {
      title: `Upgrade ${moduleName} module`,
      risk: 'High risk: changes deployed code. Current hash, module authority, and Manager-approved transition are checked on-chain; ABI support is not approval.',
      fields: [
        { label: 'Current WASM hash (32 bytes)', value: Buffer.from(scValToNative(encoded[0]!)).toString('hex') },
        { label: 'Target WASM hash (32 bytes)', value: Buffer.from(scValToNative(encoded[1]!)).toString('hex') }
      ]
    };
  }
  if (fn === 'add_properties') {
    const names = scValToNative(encoded[0]!) as string[];
    const items = scValToNative(encoded[1]!) as { name: string; property_id: number; is_new_property: boolean }[];
    const group = scValToNative(encoded[2]!) as { base_uri: string; extension: string };
    return {
      title: `Append artwork: ${names.length} new properties, ${items.length} ordered items`,
      risk: 'High risk: changes collection artwork. Calls allocate property/IPFS reference slots in order. New-property IDs refer to this call’s names; other IDs refer to existing properties. Authority is Metadata’s own admin (the Treasury after launch).',
      fields: [
        { label: 'New property names (ordered)', value: JSON.stringify(names) },
        { label: 'Items (ordered; name, property_id, is_new_property)', value: JSON.stringify(items) },
        { label: 'IPFS directory', value: group.base_uri },
        { label: 'File extension', value: group.extension }
      ]
    };
  }
  const labels: Record<string, string> = {
    update_renderer_base: 'Artwork renderer',
    update_description: 'Collection description',
    update_project_uri: 'Project URI',
    update_contract_image: 'Collection image'
  };
  if (!labels[fn]) return null;
  return {
    title: `Update ${labels[fn]!.toLowerCase()}`,
    risk: 'High risk: changes collection metadata or its external renderer/content reference. Authority is Metadata’s own admin (the Treasury after launch).',
    fields: [{ label: `New ${labels[fn]!.toLowerCase()}`, value: scValToNative(encoded[0]!) as string }]
  };
}
