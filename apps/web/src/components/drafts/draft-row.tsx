'use client';

import { FileText, Sparkles, Trash2 } from 'lucide-react';
import type { Route } from 'next';
import NextLink from 'next/link';
import { type ReactNode, useState } from 'react';
import { css } from 'styled-system/css';

import { IconButton } from '@/components/ui';

import type { DraftItem } from './collect-drafts';
import { DiscardDraftDialog } from './discard-draft-dialog';

// Stretched link: the title's link covers the whole row, and the actions sit above it, so the row
// opens the draft without nesting buttons inside a link.
const row = css({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  gap: '3',
  minH: '14',
  py: '3',
  px: '3',
  mx: '-2',
  borderRadius: 'control',
  transitionProperty: 'background-color',
  transitionDuration: 'fast',
  '@media (hover: hover) and (pointer: fine)': { _hover: { bg: 'hover' } },
  '&:has(a:focus-visible)': { outline: '2px solid', outlineColor: 'signal', outlineOffset: '-2px' }
});
const media = css({
  display: 'inline-flex',
  flexShrink: '0',
  color: 'ink.muted',
  '& svg': { width: '5', height: '5' }
});
const body = css({ flex: '1', minW: '0', display: 'grid', gap: '0.5' });
const titleLink = css({
  textStyle: 'body',
  fontWeight: '600',
  color: 'ink',
  textDecoration: 'none',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  outline: 'none',
  _after: { content: '""', position: 'absolute', inset: '0', borderRadius: 'control' }
});
const meta = css({ textStyle: 'caption', color: 'ink.muted', overflowWrap: 'anywhere' });
const actions = css({
  position: 'relative',
  zIndex: '1',
  display: 'flex',
  alignItems: 'center',
  gap: '1',
  flexShrink: '0'
});

/** A draft you can open to continue, with its own discard (confirmed in a dialog). */
export function DraftRow({
  item,
  onDiscard,
  extra
}: {
  item: DraftItem;
  onDiscard: (item: DraftItem) => void;
  /** Extra actions beside the bin, e.g. Duplicate on the Drafts page. */
  extra?: ReactNode;
}) {
  const [confirming, setConfirming] = useState(false);
  const Icon = item.kind === 'proposal' ? FileText : Sparkles;
  return (
    <div className={row}>
      <span className={media}>
        <Icon aria-hidden="true" strokeWidth={1.75} />
      </span>
      <span className={body}>
        <NextLink href={item.href as Route} className={titleLink}>
          {item.title}
        </NextLink>
        <span className={meta}>
          {item.kind === 'proposal' ? 'Proposal' : 'New DAO'} · {item.meta}
        </span>
      </span>
      {extra || item.discardable ? (
        <span className={actions}>
          {extra}
          {item.discardable ? (
            <IconButton label={`Discard ${item.title}`} variant="ghost" size="sm" onClick={() => setConfirming(true)}>
              <Trash2 aria-hidden="true" />
            </IconButton>
          ) : null}
        </span>
      ) : null}
      <DiscardDraftDialog
        open={confirming}
        title={item.title}
        onCancel={() => setConfirming(false)}
        onDiscard={() => {
          setConfirming(false);
          onDiscard(item);
        }}
      />
    </div>
  );
}
