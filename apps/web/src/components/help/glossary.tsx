'use client';

import { CircleHelp } from 'lucide-react';
import type { ReactNode } from 'react';
import { css } from 'styled-system/css';

import { Popover } from '@/components/ui';

export type GlossaryKey = 'treasury' | 'proposal' | 'delegate' | 'quorum' | 'launch-admin' | 'safety-delay';

/** Plain words first, the DAO term one line beneath (DESIGN.md, Voice). */
export const GLOSSARY: Record<GlossaryKey, { term: string; plain: string; dao: string }> = {
  treasury: {
    term: 'Treasury',
    plain: 'The money the tribe holds together. It only moves when a vote passes.',
    dao: 'An onchain treasury contract. Every payment in and out is public.'
  },
  proposal: {
    term: 'Proposal',
    plain:
      'An idea put to a vote, like paying someone or changing a setting. If it passes, it runs exactly as written.',
    dao: 'A governance proposal with onchain actions.'
  },
  delegate: {
    term: 'Delegate',
    plain: 'Someone you let vote with your tokens. You keep the tokens, and you can change your delegate any time.',
    dao: 'Vote delegation: your voting power moves, your NFTs stay put.'
  },
  quorum: {
    term: 'Quorum',
    plain:
      'How many For and Abstain votes a proposal needs before it can pass, so a few people can’t decide for everyone.',
    dao: 'The governor’s quorum, a share of all votes. After launch it changes only by vote.'
  },
  'launch-admin': {
    term: 'Launch admin',
    plain:
      'The wallet that sets a tribe up before it launches. At launch, every setting passes to the tribe’s treasury.',
    dao: 'Setup authority only. After launch, changes require DAO governance.'
  },
  'safety-delay': {
    term: 'Safety delay',
    plain: 'The wait between a vote passing and the proposal running, so everyone can see what’s about to happen.',
    dao: 'The governor’s queue delay, a timelock.'
  }
};

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
 * touch, unlike a hover tooltip. With no children it renders a small help icon after the text.
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
