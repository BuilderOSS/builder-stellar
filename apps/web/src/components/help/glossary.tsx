'use client';

import { GLOSSARY, type GlossaryKey } from '@builder-stellar/glossary';
import { CircleHelp } from 'lucide-react';
import type { ReactNode } from 'react';
import { css } from 'styled-system/css';

import { Popover } from '@/components/ui';

const termButton = css({
  display: 'inline',
  p: '0',
  m: '0',
  bg: 'transparent',
  border: '0',
  font: 'inherit',
  color: 'inherit',
  cursor: 'help',
  textDecorationLine: 'underline',
  textDecorationStyle: 'dotted',
  textDecorationColor: 'ink.faint',
  textUnderlineOffset: '0.2em',
  borderRadius: 'sm',
  _focusVisible: { outline: '2px solid', outlineColor: 'signal', outlineOffset: '2px' },
  '@media (hover: hover) and (pointer: fine)': { _hover: { textDecorationColor: 'signal' } }
});
const iconButton = css({
  display: 'inline-grid',
  placeItems: 'center',
  verticalAlign: 'middle',
  width: '6',
  height: '6',
  p: '0',
  m: '0',
  bg: 'transparent',
  border: '0',
  borderRadius: 'full',
  color: 'ink.muted',
  cursor: 'help',
  '& svg': { width: '4', height: '4' },
  _focusVisible: { outline: '2px solid', outlineColor: 'signal', outlineOffset: '2px' },
  '@media (hover: hover) and (pointer: fine)': { _hover: { color: 'signal' } }
});
const panel = css({ display: 'grid', gap: '1.5', maxW: '72' });
const title = css({ textStyle: 'label', m: '0' });
const plain = css({ textStyle: 'caption', color: 'ink', m: '0' });
const dao = css({ textStyle: 'caption', color: 'ink.muted', m: '0' });

/**
 * A word newcomers may not know, explained in place. Tap, click or press Enter to open; it works on
 * touch, unlike a hover tooltip. With no children it renders a small help icon after the text. The
 * copy comes from packages/glossary, shared with the docs site.
 */
export function GlossaryTerm({ term, children }: { term: GlossaryKey; children?: ReactNode }) {
  const entry = GLOSSARY[term];
  return (
    <Popover
      id={`glossary-${term}`}
      placement="top"
      label={entry.term}
      trigger={
        children ? (
          <button type="button" className={termButton}>
            {children}
          </button>
        ) : (
          <button type="button" className={iconButton} aria-label={`What does ${entry.term.toLowerCase()} mean?`}>
            <CircleHelp aria-hidden="true" />
          </button>
        )
      }
    >
      <div className={panel}>
        <p className={title}>{entry.term}</p>
        <p className={plain}>{entry.plain}</p>
        <p className={dao}>{entry.dao}</p>
      </div>
    </Popover>
  );
}
