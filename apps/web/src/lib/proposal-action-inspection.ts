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
  const modules = [
    ['token', config.tokenContractId],
    ['governor', config.governorContractId],
    ['auction', config.auctionContractId],
    ['treasury', config.treasuryContractId],
    ['marketplace', config.marketplaceContractId],
    ['metadata', config.metadataContractId]
  ];
  const moduleName = modules.find(([, address]) => address && address === target)?.[0];
  if (config.treasuryContractId && target === config.treasuryContractId && fn === 'authorize') {
    // Indexed args are decoded JSON (types are not recoverable), so render the
    // tree as read; drafts are validated and encoded with explicit types.
    return {
      title: 'Authorize the next action (Treasury)',
      risk: 'High risk: lets the NEXT action of this proposal use the Treasury’s authorization for exactly these nested calls (for example SAC transfers out of the Treasury). Read every node.',
      fields: authorizeFields(args[0])
    };
  }
  if (fn === 'migrate' && moduleName) {
    return {
      title: `Migrate ${moduleName} storage`,
      risk: 'Runs the module’s storage migration after an upgrade that changed storage. Fails with NothingToMigrate when the storage is current.',
      fields: []
    };
  }
  const metadataCall = !!config.metadataContractId && target === config.metadataContractId;
  if (!metadataCall && fn !== 'upgrade') return null;
  const encoded = encodeSupportedCall(target, fn, args, config);
  if (metadataCall && fn === 'regenerate') {
    return {
      title: `Seed traits for token #${String(scValToNative(encoded[0]!))}`,
      risk: 'Assigns pseudo-random traits to a token minted without artwork. Fails (AlreadySeeded) if the token already has traits.',
      fields: [{ label: 'Token ID', value: String(scValToNative(encoded[0]!)) }]
    };
  }
  if (fn === 'upgrade') {
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

type IndexedAuthNode = { contract?: unknown; fn_name?: unknown; fnName?: unknown; args?: unknown; sub?: unknown };
function authorizeFields(nodes: unknown): { label: string; value: string }[] {
  const lines: string[] = [];
  const walk = (list: unknown, depth: number) => {
    if (!Array.isArray(list)) return;
    for (const raw of list as IndexedAuthNode[]) {
      const args = Array.isArray(raw?.args)
        ? raw.args.map((arg) =>
            arg && typeof arg === 'object' && 'type' in arg && 'value' in arg
              ? `${String((arg as { type: unknown }).type)}:${String((arg as { value: unknown }).value)}`
              : JSON.stringify(arg, (_, item) => (typeof item === 'bigint' ? item.toString() : item))
          )
        : [];
      lines.push(
        `${'  '.repeat(depth)}${String(raw?.contract)}.${String(raw?.fn_name ?? raw?.fnName)}(${args.join(', ')})`
      );
      walk(raw?.sub, depth + 1);
    }
  };
  walk(nodes, 0);
  return lines.map((value, index) => ({ label: `Authorized call ${index + 1}`, value }));
}
