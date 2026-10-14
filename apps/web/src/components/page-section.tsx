import type { ReactNode } from 'react';
import { css } from 'styled-system/css';

import { PageHeader } from '@/components/ui';

const body = css({ display: 'grid', gap: '5', minW: '0' });
const noteLine = css({ display: 'block' });

/**
 * A titled page: header (title, one line of context, actions) then content.
 * `daoNote` is the quiet DAO term for crypto natives, on its own line under the description.
 */
export function PageSection({
  title,
  description,
  daoNote,
  actions,
  eyebrow,
  children
}: {
  title: ReactNode;
  description?: ReactNode;
  daoNote?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  children: ReactNode;
}) {
  const meta = daoNote ? (
    <>
      {description}
      <span className={noteLine}>{daoNote}</span>
    </>
  ) : (
    description
  );
  return (
    <div>
      <PageHeader title={title} meta={meta} actions={actions} eyebrow={eyebrow} />
      <div className={body}>{children}</div>
    </div>
  );
}
