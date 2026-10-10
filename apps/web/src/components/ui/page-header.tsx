import type { ReactNode } from 'react';
import { css } from 'styled-system/css';

import { ActionBar } from './action-bar';

const header = css({ display: 'grid', gap: '2', mb: { base: '5', md: '7' } });
const row = css({ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '4' });
const titleClass = css({ textStyle: 'title', fontSize: { base: '1.625rem', md: '2rem' }, margin: '0', color: 'ink' });
const metaClass = css({ textStyle: 'body', color: 'ink.muted', margin: '0', maxW: '65ch' });
const desktopActions = css({ display: { base: 'none', md: 'flex' }, gap: '2', flexShrink: '0' });

/**
 * Page title, one line of context, and the page's actions. On phones the
 * actions move to the sticky ActionBar above the tab bar (density rule 2).
 */
export function PageHeader({
  title,
  meta,
  eyebrow,
  actions
}: {
  title: ReactNode;
  meta?: ReactNode;
  /** Small context above the title (e.g. a status chip). Not a kicker. */
  eyebrow?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className={header}>
      {eyebrow ? <div>{eyebrow}</div> : null}
      <div className={row}>
        <h1 className={titleClass}>{title}</h1>
        {actions ? <div className={desktopActions}>{actions}</div> : null}
      </div>
      {meta ? <p className={metaClass}>{meta}</p> : null}
      {actions ? <ActionBar mobileOnly>{actions}</ActionBar> : null}
    </header>
  );
}
