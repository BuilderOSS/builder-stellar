import type { IpfsGroup, ItemParam } from '@builder-stellar/metadata-bindings';

import { CodeBlock, Field, FieldLabel, Input, Text } from '@/components/ui';
import { MAX_PROFILE_BYTES, parseProfile, profileProblems } from '@/lib/dao-profile';
import type {
  ActionFormProps,
  ActionHandler,
  ProposalQueuedAction,
  ValidationResult
} from '@/lib/proposal-actions/types';

/** These handlers are intentionally not registered here. The registry owner adds
 * the literal types and metadata ABI role before enabling governance submission. */
export type PendingAdminHandler<T, K extends string> = Omit<ActionHandler<T>, 'type' | 'serialize' | 'deserialize'> & {
  type: K;
  serialize: (
    data: T
  ) => Omit<ProposalQueuedAction, 'type'> & Pick<ProposalQueuedAction, 'id' | 'recipient' | 'amount'> & { type: K };
  deserialize: (action: Omit<ProposalQueuedAction, 'type'> & { type: string }) => T;
};
export type ArtworkPropertiesDraft = { names: string[]; items: ItemParam[]; ipfsGroup: IpfsGroup };
export function validateArtworkProperties(data: ArtworkPropertiesDraft): ValidationResult {
  if (
    !data ||
    !Array.isArray(data.names) ||
    data.names.length > 16 ||
    data.names.some((name) => typeof name !== 'string' || !name.trim())
  )
    return { valid: false, message: 'Use at most 16 non-empty property names.' };
  if (!Array.isArray(data.items) || !data.items.length || data.items.length > 30)
    return { valid: false, message: 'Each artwork call must contain 1–30 items.' };
  if (
    data.items.some(
      (item) =>
        !item ||
        typeof item.name !== 'string' ||
        !item.name.trim() ||
        !Number.isInteger(item.property_id) ||
        item.property_id < 0 ||
        item.property_id > 15 ||
        typeof item.is_new_property !== 'boolean'
    )
  )
    return { valid: false, message: 'Each item needs a name, property ID (0–15), and new-property flag.' };
  if (data.names.some((_, id) => !data.items.some((item) => item.is_new_property && item.property_id === id)))
    return { valid: false, message: 'Every new property must have an item in its first call.' };
  if (data.items.some((item) => item.is_new_property && item.property_id >= data.names.length))
    return { valid: false, message: 'New-property item IDs must refer to the names in this call.' };
  if (
    !data.ipfsGroup ||
    !/^ipfs:\/\/[^\s]+$/.test(data.ipfsGroup.base_uri) ||
    !/^\.(png|jpg|jpeg|webp)$/.test(data.ipfsGroup.extension)
  )
    return { valid: false, message: 'Use an ipfs:// artwork directory and .png, .jpg, .jpeg, or .webp extension.' };
  return { valid: true };
}
function PropertiesForm({ value }: ActionFormProps<ArtworkPropertiesDraft>) {
  return (
    <>
      <Text>
        Prepare structured artwork batches in Artwork Admin. Property IDs and IPFS references must be reviewed together.
      </Text>
      <CodeBlock>{JSON.stringify(value, null, 2)}</CodeBlock>
    </>
  );
}
function propertiesHandler(
  type: 'add-artwork-properties' | 'reset-artwork-properties',
  method: string
): PendingAdminHandler<ArtworkPropertiesDraft, typeof type> {
  return {
    type,
    label: type === 'add-artwork-properties' ? 'Append artwork properties and items' : 'Reset artwork properties',
    description: 'Write an artwork batch and its IPFS reference. Resetting can break existing token metadata.',
    group: 'Artwork',
    FormComponent: PropertiesForm,
    getDefaultValues: () => ({ names: [], items: [], ipfsGroup: { base_uri: '', extension: '.png' } }),
    validate: validateArtworkProperties,
    serialize: (data) => ({ id: crypto.randomUUID(), type, recipient: '', amount: '', ...data }),
    deserialize: (action) => ({ names: action.names, items: action.items, ipfsGroup: action.ipfsGroup }),
    buildCallVector: (data, context) => ({
      target: context.config.metadataContractId,
      function: method,
      args: [data.names, data.items, data.ipfsGroup]
    })
  };
}
export const addArtworkPropertiesHandler = propertiesHandler('add-artwork-properties', 'add_properties');
export const resetArtworkPropertiesHandler = propertiesHandler(
  'reset-artwork-properties',
  'delete_and_recreate_properties'
);

export type ArtworkSettingDraft = { value: string };
export const artworkSettingMethods = {
  'set-artwork-renderer': 'update_renderer_base'
} as const;
export type ArtworkSettingType = keyof typeof artworkSettingMethods;
export function validateArtworkSetting(value: string, type: ArtworkSettingType): ValidationResult {
  if (!value.trim()) return { valid: false, message: 'Enter a non-empty value.' };
  // Metadata rejects settings strings over 256 characters (StringTooLong, 7312).
  if (new TextEncoder().encode(value).length > 256) return { valid: false, message: 'Use at most 256 UTF-8 bytes.' };
  void type;
  try {
    const url = new URL(value.trim());
    if (!['https:', 'ipfs:'].includes(url.protocol)) throw new Error();
  } catch {
    return { valid: false, message: 'Use an HTTPS or IPFS URL.' };
  }
  return { valid: true };
}
export const artworkSettingHandlers = (Object.keys(artworkSettingMethods) as ArtworkSettingType[]).map(
  (type): PendingAdminHandler<ArtworkSettingDraft, ArtworkSettingType> => ({
    type,
    label: type.replace('set-artwork-', 'Update artwork ').replaceAll('-', ' '),
    description: 'Update collection metadata through the Metadata admin (the Treasury after launch).',
    group: 'Artwork',
    FormComponent: ({ value, onChange, disabled }) => (
      <Field>
        <FieldLabel htmlFor={`artwork-setting-${type}`}>New value</FieldLabel>
        <Input
          id={`artwork-setting-${type}`}
          value={value.value}
          disabled={disabled}
          onChange={(event) => onChange({ value: event.target.value })}
        />
      </Field>
    ),
    getDefaultValues: () => ({ value: '' }),
    validate: (data) => validateArtworkSetting(data.value, type),
    serialize: (data) => ({ id: crypto.randomUUID(), type, recipient: '', amount: '', value: data.value.trim() }),
    deserialize: (action) => ({ value: action.value || '' }),
    buildCallVector: (data, context) => ({
      target: context.config.metadataContractId,
      function: artworkSettingMethods[type],
      args: [data.value.trim()]
    })
  })
);

/**
 * The community profile (docs/STORAGE_DIET.md § 6): one `update_profile` call
 * carrying the whole JSON and the revision it replaces. If another update lands
 * first, the call fails with ProfileSeqMismatch and changes nothing.
 */
export type DaoProfileDraft = { expectedSeq: number; profile: string };

export function validateDaoProfileDraft(data: DaoProfileDraft): ValidationResult {
  if (!Number.isInteger(data.expectedSeq) || data.expectedSeq < 0)
    return { valid: false, message: 'The current profile revision is unknown. Refresh and try again.' };
  if (!data.profile) return { valid: false, message: 'The profile is empty.' };
  const problems = profileProblems(parseProfile(data.profile));
  if (new TextEncoder().encode(data.profile).length > MAX_PROFILE_BYTES)
    return { valid: false, message: `The profile is over the ${MAX_PROFILE_BYTES}-byte limit.` };
  return problems.length ? { valid: false, message: problems[0]! } : { valid: true };
}

export const updateDaoProfileHandler: PendingAdminHandler<DaoProfileDraft, 'update-dao-profile'> = {
  type: 'update-dao-profile',
  label: 'Update the community profile',
  description: 'Replace the description, links and image people see. Prepare it in Manage → Community profile.',
  group: 'Administration',
  FormComponent: ({ value }) => (
    <>
      <Text>Edit the profile in Manage → Community profile; this shows what the proposal will write.</Text>
      <CodeBlock>{value.profile}</CodeBlock>
    </>
  ),
  getDefaultValues: () => ({ expectedSeq: 0, profile: '' }),
  validate: validateDaoProfileDraft,
  serialize: (data) => ({
    id: crypto.randomUUID(),
    type: 'update-dao-profile',
    recipient: '',
    amount: '',
    expectedSeq: data.expectedSeq,
    profile: data.profile
  }),
  deserialize: (action) => ({ expectedSeq: Number(action.expectedSeq), profile: String(action.profile ?? '') }),
  buildCallVector: (data, context) => ({
    target: context.config.metadataContractId,
    function: 'update_profile',
    args: [data.expectedSeq, data.profile]
  })
};
