'use client';
import { Input } from '@/components/ui';
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
  return (
    <div className={styles.identity}>
      <div className={styles.stack}>
        <CreationField id="tokenName" label="DAO name">
          <Input
            id="tokenName"
            autoComplete="off"
            value={basicInfo.tokenName}
            maxLength={80}
            {...fieldAccessibility('tokenName', errors)}
            onChange={(e) => {
              update({ tokenName: e.target.value });
              clear('tokenName');
            }}
          />
        </CreationField>
        <CreationField id="tokenSymbol" label="Symbol">
          <Input
            id="tokenSymbol"
            autoComplete="off"
            value={basicInfo.tokenSymbol}
            maxLength={12}
            {...fieldAccessibility('tokenSymbol', errors)}
            onChange={(e) => {
              update({ tokenSymbol: e.target.value.toUpperCase() });
              clear('tokenSymbol');
            }}
          />
        </CreationField>
        <CreationField id="slug" label="URL slug">
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
  );
}
