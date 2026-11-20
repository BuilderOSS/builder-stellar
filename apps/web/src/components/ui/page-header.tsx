import type { ReactNode } from 'react';
import { css } from 'styled-system/css';

import { ActionBar } from './action-bar';
import { GuideLink } from './guide-link';

const header = css({ display: 'grid', gap: '2', mb: { base: '5', md: '7' } });
const row = css({ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '4' });
const titleClass = css({ textStyle: 'title', fontSize: { base: '1.625rem', md: '2rem' }, margin: '0', color: 'ink' });
const metaClass = css({ textStyle: 'body', color: 'ink.muted', margin: '0', maxW: '65ch' });
const desktopActions = css({ display: { base: 'none', md: 'flex' }, gap: '2', flexShrink: '0' });
const inlineActions = css({ display: 'flex', gap: '2', flexShrink: '0' });

/**
 * Page title, one line of context, and the page's actions. On phones a primary
 * action moves to the sticky ActionBar above the tab bar (density rule 2). A
 * secondary link (`actionsPlacement="inline"`, e.g. Market settings) stays in the
 * header instead, so it doesn't sit over the page for every visitor.
 */
export function PageHeader({
  title,
  meta,
  eyebrow,
  actions,
  actionsPlacement = 'bar',
  guide
}: {
  title: ReactNode;
  meta?: ReactNode;
  /** Small context above the title (e.g. a status chip). Not a kicker. */
  eyebrow?: ReactNode;
  actions?: ReactNode;
  actionsPlacement?: 'bar' | 'inline';
  /** This page's guide on docs.tribes.build (a docs path, e.g. `guides/marketplace/sell`). */
  guide?: string;
}) {
  const inline = actionsPlacement === 'inline';
  return (
    <header className={header}>
      {eyebrow ? <div>{eyebrow}</div> : null}
      <div className={row}>
        <h1 className={titleClass}>{title}</h1>
        {actions ? <div className={inline ? inlineActions : desktopActions}>{actions}</div> : null}
      </div>
      {meta || guide ? (
        <p className={metaClass}>
          {meta}
          {meta && guide ? ' ' : null}
          {guide ? <GuideLink path={guide} /> : null}
        </p>
      ) : null}
      {actions && !inline ? <ActionBar mobileOnly>{actions}</ActionBar> : null}
    </header>
  );
}
