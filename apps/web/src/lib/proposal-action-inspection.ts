import { scValToNative } from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';

import type { UpgradeModule } from '@/lib/admin-module-versions';
import { artworkAdditionTitle } from '@/lib/contract-call-labels';
import { parseProfile } from '@/lib/dao-profile';
import { moduleLabelInSentence } from '@/lib/module-updates';
import { encodeSupportedCall, type ProposalEncodingContext } from '@/lib/proposal-supported-calls';

export type ProposalCallInspection = {
  title: string;
  risk: string;
  fields: { label: string; value: string }[];
  /** A module upgrade: shown with the registry's verdict instead of a generic warning. */
  upgrade?: { module: UpgradeModule; fromHash: string; toHash: string };
};

/** Inspect only target-role/spec-validated admin calls; never guess an external ABI. */
export function inspectProposalAdminCall(
  target: string,
  fn: string,
  args: unknown[],
  config: ProposalEncodingContext
): ProposalCallInspection | null {
  if (config.claimsContractId && target === config.claimsContractId && fn === 'open_list') {
    const values = encodeSupportedCall(target, fn, args, config).map(scValToNative);
    const text = (value: unknown) =>
      value instanceof Uint8Array
        ? Buffer.from(value).toString('hex')
        : JSON.stringify(value, (_, item) => (typeof item === 'bigint' ? item.toString() : item));
    return {
      title: 'Open a claim list',
      risk: 'High risk: lets the listed wallets mint up to the list total, paying the list price. The claims module needs a mint allowance for it (granted earlier in the same proposal).',
      fields: [
        { label: 'Root (32 bytes)', value: text(values[0]) },
        { label: 'Published claim list', value: text(values[1]) },
        { label: 'Payment asset', value: text(values[2]) },
        { label: 'Price per token (base units)', value: text(values[3]) },
        { label: 'Closes at (unix seconds)', value: text(values[4]) },
        { label: 'Most tokens', value: text(values[5]) }
      ]
    };
  }
  const modules = [
    ['token', config.tokenContractId],
    ['governor', config.governorContractId],
    ['auction', config.auctionContractId],
    ['treasury', config.treasuryContractId],
    ['marketplace', config.marketplaceContractId],
    ['metadata', config.metadataContractId],
    ['claims', config.claimsContractId]
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
    const fromHash = Buffer.from(scValToNative(encoded[0]!)).toString('hex');
    const toHash = Buffer.from(scValToNative(encoded[1]!)).toString('hex');
    return {
      title: `Upgrade ${moduleLabelInSentence(moduleName as UpgradeModule)}`,
      risk: 'Replaces the contract’s code. The contract checks on-chain that this upgrade is approved when the proposal runs; an unapproved one fails and changes nothing.',
      fields: [
        { label: 'Current WASM hash (32 bytes)', value: fromHash },
        { label: 'Target WASM hash (32 bytes)', value: toHash }
      ],
      upgrade: { module: moduleName as UpgradeModule, fromHash, toHash }
    };
  }
  if (fn === 'add_properties') {
    const names = scValToNative(encoded[0]!) as string[];
    const items = scValToNative(encoded[1]!) as { name: string; property_id: number; is_new_property: boolean }[];
    const group = scValToNative(encoded[2]!) as { base_uri: string; extension: string };
    return {
      title: artworkAdditionTitle(names.length, items.length),
      risk: 'High risk: changes collection artwork. Calls allocate property/IPFS reference slots in order. New-property IDs refer to this call’s names; other IDs refer to existing properties. Authority is Metadata’s own admin (the Treasury after launch).',
      fields: [
        { label: 'New property names (ordered)', value: JSON.stringify(names) },
        { label: 'Items (ordered; name, property_id, is_new_property)', value: JSON.stringify(items) },
        { label: 'IPFS directory', value: group.base_uri },
        { label: 'File extension', value: group.extension }
      ]
    };
  }
  if (fn === 'update_profile') {
    const [expectedSeq, raw] = encoded.map(scValToNative) as [number, string];
    const profile = parseProfile(raw);
    return {
      title: 'Update the tribe profile',
      risk: 'Replaces the tribe description, links and image. It applies only if no other profile update lands first (revision check). Authority is Metadata’s own admin (the Treasury after launch).',
      fields: [
        { label: 'Replaces revision', value: String(expectedSeq) },
        { label: 'Description', value: profile.description },
        { label: 'Links', value: profile.links.map((link) => `${link.label}: ${link.url}`).join('\n') || 'None' },
        { label: 'Image', value: profile.image || 'None' }
      ]
    };
  }
  const labels: Record<string, string> = {
    update_renderer_base: 'Artwork renderer'
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
