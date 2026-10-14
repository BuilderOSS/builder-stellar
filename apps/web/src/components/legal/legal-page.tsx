import type { ReactNode } from 'react';
import { css } from 'styled-system/css';

import { Callout } from '@/components/ui';
import { Prose } from '@/components/ui/prose';
import { DISCORD_URL } from '@/lib/site';

export const LEGAL_UPDATED = '14 October 2026';

const page = css({ display: 'grid', gap: '6', maxW: '68ch' });
const head = css({ display: 'grid', gap: '1' });
const heading = css({ textStyle: 'title', fontSize: { base: '1.75rem', md: '2rem' }, m: '0' });
const updated = css({ textStyle: 'caption', color: 'ink.muted', m: '0' });
const summaryList = css({
  display: 'grid',
  gap: '1.5',
  m: '0',
  mt: '1',
  pl: '5',
  listStyleType: 'disc',
  textStyle: 'caption',
  fontSize: '0.875rem',
  color: 'ink.muted',
  '& a': { color: 'signal', textDecoration: 'underline', textUnderlineOffset: '3px' }
});

/** Terms, privacy and the disclaimer: a plain-words summary first, then the numbered sections. */
export function LegalPage({ title, summary, children }: { title: string; summary: ReactNode[]; children: ReactNode }) {
  return (
    <div className={page}>
      <header className={head}>
        <h1 className={heading}>{title}</h1>
        <p className={updated}>Last updated: {LEGAL_UPDATED}</p>
      </header>
      <Callout title="The short version">
        <ul className={summaryList}>
          {summary.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      </Callout>
      <Prose>{children}</Prose>
    </div>
  );
}

/** The Discord link legal pages point to for questions, requests and disputes. */
export function DiscordLink({ children = 'our Discord server' }: { children?: ReactNode }) {
  return (
    <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}
