'use client';
import { Input, Textarea } from '@/components/ui';
import { followsName, suggestSlug, suggestSymbol } from '@/lib/create-dao-identity';
import { MAX_TOKEN_NAME_BYTES, MAX_TOKEN_SYMBOL_LENGTH } from '@/lib/validation';
import { useCreateDaoStore } from '@/stores/create-dao-store';

import { CreationField, fieldAccessibility } from './CreationField';
import { DaoImageField } from './DaoImageField';
import { SlugAvailability } from './SlugAvailability';
import styles from './workspace-styles';

export function BasicInfoStep() {
  const basicInfo = useCreateDaoStore((s) => s.basicInfo);
  const errors = useCreateDaoStore((s) => s.validationErrors);
  const update = useCreateDaoStore((s) => s.updateBasicInfo);
  const clear = useCreateDaoStore((s) => s.clearValidationError);
  // Symbol and slug follow the name until someone types their own.
  const symbolFollows =
    Boolean(basicInfo.tokenName) && followsName(basicInfo.tokenSymbol, basicInfo.tokenName, suggestSymbol);
  const slugFollows = Boolean(basicInfo.tokenName) && followsName(basicInfo.slug, basicInfo.tokenName, suggestSlug);
  return (
    <div className={styles.stack}>
      <div className={styles.identity}>
        <div className={styles.stack}>
          <CreationField id="tokenName" label="DAO name">
            <Input
              id="tokenName"
              autoComplete="off"
              value={basicInfo.tokenName}
              maxLength={MAX_TOKEN_NAME_BYTES}
              {...fieldAccessibility('tokenName', errors)}
              onChange={(e) => {
                const name = e.target.value;
                const previous = basicInfo.tokenName;
                const patch: Parameters<typeof update>[0] = { tokenName: name };
                if (followsName(basicInfo.tokenSymbol, previous, suggestSymbol)) {
                  patch.tokenSymbol = suggestSymbol(name);
                  clear('tokenSymbol');
                }
                if (followsName(basicInfo.slug, previous, suggestSlug)) {
                  patch.slug = suggestSlug(name);
                  clear('slug');
                }
                update(patch);
                clear('tokenName');
              }}
            />
          </CreationField>
          <CreationField
            id="tokenSymbol"
            label="Symbol"
            hint={
              symbolFollows
                ? 'Filled in from the name. Type to choose your own.'
                : `Up to ${MAX_TOKEN_SYMBOL_LENGTH} capital letters or numbers, like a ticker.`
            }
          >
            <Input
              id="tokenSymbol"
              autoComplete="off"
              value={basicInfo.tokenSymbol}
              maxLength={MAX_TOKEN_SYMBOL_LENGTH}
              {...fieldAccessibility('tokenSymbol', errors)}
              onChange={(e) => {
                update({ tokenSymbol: e.target.value.toUpperCase() });
                clear('tokenSymbol');
              }}
            />
          </CreationField>
          <CreationField
            id="slug"
            label="URL slug"
            hint={
              basicInfo.slug
                ? `Your link: /dao/${basicInfo.slug}${slugFollows ? ' · filled in from the name' : ''}`
                : 'Lowercase letters, numbers and hyphens. Filled in from the name.'
            }
          >
            <Input
              id="slug"
              autoComplete="off"
              value={basicInfo.slug}
              maxLength={63}
              placeholder="my-dao"
              {...fieldAccessibility('slug', errors)}
              onChange={(e) => {
                update({ slug: e.target.value.toLowerCase() });
                clear('slug');
              }}
            />
            <SlugAvailability slug={basicInfo.slug} />
          </CreationField>
        </div>
        <DaoImageField />
      </div>
      <CreationField id="description" label="Description" hint="12–240 characters">
        <Textarea
          id="description"
          rows={3}
          maxLength={240}
          value={basicInfo.description}
          {...fieldAccessibility('description', errors)}
          onChange={(e) => {
            update({ description: e.target.value });
            clear('description');
          }}
        />
      </CreationField>
      <CreationField id="projectUri" label="Website">
        <Input
          id="projectUri"
          type="url"
          value={basicInfo.projectUri}
          {...fieldAccessibility('projectUri', errors)}
          onChange={(e) => update({ projectUri: e.target.value })}
        />
      </CreationField>
    </div>
  );
}
