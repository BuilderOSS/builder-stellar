'use client';
import { ProfileLinksEditor } from '@/components/admin/profile-links-editor';
import { Input, MarkdownField } from '@/components/ui';
import { followsName, suggestSlug, suggestSymbol } from '@/lib/create-dao-identity';
import { MAX_PROFILE_BYTES, profileBytes } from '@/lib/dao-profile';
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
          <CreationField id="tokenName" label="Tribe name">
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
            label="Link"
            hint={
              basicInfo.slug
                ? `/dao/${basicInfo.slug}${slugFollows ? ' · filled in from the name' : ''}`
                : 'Lowercase letters, numbers and hyphens. Filled in from the name.'
            }
          >
            <Input
              id="slug"
              autoComplete="off"
              value={basicInfo.slug}
              maxLength={63}
              placeholder="my-tribe"
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
      <CreationField
        id="description"
        label="Description"
        hint={`What your tribe is about. Markdown works. ${profileBytes({ description: basicInfo.description, links: basicInfo.links, image: basicInfo.contractImage }).toLocaleString()} of ${MAX_PROFILE_BYTES.toLocaleString()} bytes used with the links and image.`}
      >
        <MarkdownField
          id="description"
          rows={5}
          value={basicInfo.description}
          images={false}
          invalid={Boolean(errors.description) || undefined}
          describedBy={errors.description ? 'description-error' : 'description-hint'}
          onChange={(description) => {
            update({ description });
            clear('description');
          }}
        />
      </CreationField>
      <ProfileLinksEditor
        id="links"
        links={basicInfo.links}
        onChange={(links) => {
          update({ links });
          clear('links');
        }}
      />
    </div>
  );
}
