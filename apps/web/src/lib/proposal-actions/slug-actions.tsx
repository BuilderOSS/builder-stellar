'use client';

import { Field, FieldHelperText, FieldLabel, Input } from '@/components/ui';
import { isValidSlug } from '@/lib/create-dao-schema';
import { getDeploymentConfig } from '@/lib/deployment-config';

import type { ActionFormProps, ActionHandler, FormContext, ValidationResult } from './types';

export type DaoSlugDraft = { slug: string };

/** What members are told about the old link; shared by the preview and the profile caption. */
export const SLUG_CHANGE_WARNING =
  'The old link is freed right away. It keeps leading here only until another community takes it, which can happen at any time.';

function validateDaoSlug(data: DaoSlugDraft, context?: Pick<FormContext, 'config'>): ValidationResult {
  const slug = data.slug.trim();
  if (!isValidSlug(slug))
    return {
      valid: false,
      message: 'Use 4-63 lowercase letters, numbers or single hyphens',
      fields: { slug: 'Use 4-63 lowercase letters, numbers or single hyphens' }
    };
  if (context?.config.slug && slug === context.config.slug)
    return { valid: false, message: 'This is already your link', fields: { slug: 'This is already your link' } };
  return { valid: true };
}

function DaoSlugForm({ value, onChange, disabled, validationErrors }: ActionFormProps<DaoSlugDraft>) {
  const error = validationErrors && !validationErrors.valid ? validationErrors.fields?.slug : undefined;
  return (
    <Field>
      <FieldLabel htmlFor="dao-slug">New link</FieldLabel>
      <Input
        id="dao-slug"
        value={value.slug}
        maxLength={63}
        spellCheck={false}
        disabled={disabled}
        aria-invalid={Boolean(error) || undefined}
        onChange={(event) => onChange({ slug: event.target.value.toLowerCase() })}
      />
      <FieldHelperText tone={error ? 'error' : undefined}>{error ?? SLUG_CHANGE_WARNING}</FieldHelperText>
    </Field>
  );
}

/**
 * Move a launched community to a new link (Manager 0.2.0 `change_slug`). The Manager checks the
 * caller is the token's admin, so only the Treasury, by proposal, can do it.
 */
export const changeDaoSlugHandler: ActionHandler<DaoSlugDraft> = {
  type: 'change-dao-slug',
  label: 'Change the community link',
  description: 'Move the community to a new /dao/ link',
  group: 'Administration',
  FormComponent: DaoSlugForm,
  getDefaultValues: () => ({ slug: '' }),
  validate: (data, context) => validateDaoSlug(data, context),
  serialize: (data, context) => ({
    id: crypto.randomUUID(),
    type: 'change-dao-slug',
    recipient: '',
    amount: '',
    slug: data.slug.trim(),
    previousSlug: context?.config.slug ?? ''
  }),
  deserialize: (action) => ({ slug: action.slug ?? '' }),
  buildCallVector: (data, context) => ({
    target: getDeploymentConfig().managerAddress,
    function: 'change_slug',
    args: [context.tokenContractId, data.slug.trim()]
  })
};
