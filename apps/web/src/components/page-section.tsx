import type { ReactNode } from 'react';
import { css } from 'styled-system/css';

import { PageHeader } from '@/components/ui';

const body = css({ display: 'grid', gap: '5', minW: '0' });

/** A titled page: header (title, one line of context, actions) then content. */
export function PageSection({
  title,
  description,
  actions,
  eyebrow,
  children
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <PageHeader title={title} meta={description} actions={actions} eyebrow={eyebrow} />
      <div className={body}>{children}</div>
    </div>
  );
}
