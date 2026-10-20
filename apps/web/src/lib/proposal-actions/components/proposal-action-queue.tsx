// src/lib/proposal-actions/components/proposal-action-queue.tsx

'use client';

import { ChevronDown, ChevronUp, GripVertical, TriangleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type PointerEvent as ReactPointerEvent, useRef, useState } from 'react';
import { css } from 'styled-system/css';

import { ProposalActionConfirmDialog } from '@/components/proposal/proposal-action-confirm-dialog';
import { Button, Chip, IconButton } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { daoRoute } from '@/lib/dao-routes';
import { isHighRiskProposalAction } from '@/lib/proposal-action-identity';
import { getProposalActionSummary } from '@/lib/proposal-call';
import { isPickable } from '@/lib/proposal-changes/catalog';
import { changeEditHref, type ChangeSource } from '@/lib/proposal-changes/change-request';
import { showRemovedToast } from '@/lib/proposal-changes/change-toast';
import { type QueueItem, queueItems, removeFromQueue } from '@/lib/proposal-changes/queue';
import { analyzeQueue } from '@/lib/proposal-changes/review';
import { useAuthSessionStore } from '@/stores/auth-session-store';
import { normalizeWalletAddress, useProposalComposerStore } from '@/stores/proposal-composer-store';

import { getActionHandler } from '../registry';
import type { ProposalQueuedAction } from '../types';

const empty = css({ textStyle: 'body', color: 'ink.muted', m: '0' });
const list = css({ display: 'grid', listStyle: 'none', m: '0', p: '0' });
const item = css({
  position: 'relative',
  display: 'grid',
  gridTemplateColumns: 'auto minmax(0, 1fr)',
  gap: '3',
  py: '3.5',
  borderBottomWidth: '1px',
  borderColor: 'rule',
  // A new change rises in; nothing animates on page load because rows render before hydration.
  opacity: '1',
  transform: 'translateY(0)',
  transitionProperty: 'opacity, transform',
  transitionDuration: '200ms',
  transitionTimingFunction: 'out',
  '@starting-style': { opacity: '0', transform: 'translateY(8px)' },
  _motionReduce: { transform: 'none', '@starting-style': { transform: 'none' } },
  _last: { borderBottomWidth: '0' },
  '&[data-dragging]': { opacity: '0.5' },
  '&[data-drop="before"]': { boxShadow: 'inset 0 2px 0 0 token(colors.signal)' },
  '&[data-drop="after"]': { boxShadow: 'inset 0 -2px 0 0 token(colors.signal)' },
  md: { gridTemplateColumns: 'auto minmax(0, 1fr) auto', alignItems: 'start' }
});
const number = css({
  display: 'grid',
  placeItems: 'center',
  width: '7',
  height: '7',
  borderRadius: 'full',
  bg: 'hover',
  textStyle: 'micro',
  color: 'ink.muted',
  '[data-editing] > &': { bg: 'signal.wash', color: 'signal' }
});
const body = css({ display: 'grid', gap: '1', minW: '0' });
const sentence = css({ textStyle: 'body', fontWeight: '600', m: '0', overflowWrap: 'anywhere' });
const metaRow = css({ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2' });
const stepsToggle = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '1',
  p: '0',
  bg: 'transparent',
  border: '0',
  color: 'ink.muted',
  textStyle: 'caption',
  cursor: 'pointer',
  _hover: { color: 'ink' },
  _focusVisible: { outline: '2px solid', outlineColor: 'signal', outlineOffset: '2px', borderRadius: 'sm' },
  '& svg': {
    width: '3.5',
    height: '3.5',
    transitionProperty: 'rotate',
    transitionDuration: 'pop',
    transitionTimingFunction: 'out'
  },
  '&[aria-expanded=true] svg': { rotate: '180deg' }
});
const stepList = css({ display: 'grid', gap: '1', listStyle: 'none', m: '0', p: '0', pl: '3', counterReset: 'step' });
const step = css({
  textStyle: 'caption',
  color: 'ink.muted',
  overflowWrap: 'anywhere',
  counterIncrement: 'step',
  _before: { content: 'counter(step) ". "', color: 'ink.faint' }
});
const finding = css({
  display: 'flex',
  alignItems: 'flex-start',
  gap: '1.5',
  textStyle: 'caption',
  m: '0',
  color: 'warning',
  '&[data-severity=error]': { color: 'danger' },
  '& svg': { width: '3.5', height: '3.5', flexShrink: '0', mt: '0.5' }
});
const buttons = css({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '1',
  gridColumn: { base: '2', md: 'auto' }
});
const handle = css({
  display: 'none',
  color: 'ink.faint',
  cursor: 'grab',
  touchAction: 'none',
  '@media (hover: hover) and (pointer: fine)': { display: 'inline-flex' },
  '&:active': { cursor: 'grabbing' }
});

const EMPTY: ProposalQueuedAction[] = [];

type ConfirmState = { title: string; message: string; onConfirm: () => void } | null;

function itemSentence(entry: QueueItem) {
  if (entry.bundleId) return String(entry.bundleLabel ?? '').replace(/:\s*\d+\s+steps?$/, '');
  return getProposalActionSummary(entry.actions[0]);
}

/** Findings for each queued action against the ones before it, shown on its row as the proposal is built. */
function rowFindings(entry: QueueItem, findings: ReturnType<typeof analyzeQueue>) {
  const own = new Set(entry.actions.map((action) => action.id));
  return entry.actions
    .flatMap((action) => findings.get(action.id) ?? [])
    .filter((found) => found.kind !== 'high-risk')
    .filter((found, index, all) => all.findIndex((other) => other.message === found.message) === index)
    .filter((found) => !(found.kind === 'order' && own.size > 1 && found.existingActionIndexes.length === 0));
}

/**
 * The proposal's changes, one row per change or bundle, in the order they run. The composer, the draft dock
 * and the review step share it; `variant` only trims what each place needs.
 */
export function ProposalActionQueue({
  daoId,
  variant = 'composer'
}: {
  daoId: string;
  /** `composer` edits inline and reorders; `compact` (the dock) and `review` only list and remove. */
  variant?: 'composer' | 'compact' | 'review';
}) {
  const { routeId, daoConfig } = useDaoContext();
  const router = useRouter();
  const address = useAuthSessionStore((state) => state.address);
  const walletKey = normalizeWalletAddress(address);
  const queuedActions = useProposalComposerStore((s) => s.draftsByWallet[walletKey]?.[daoId]?.queuedActions ?? EMPTY);
  const editingState = useProposalComposerStore((s) => s.draftsByWallet[walletKey]?.[daoId]?.editingState ?? null);
  const beginEdit = useProposalComposerStore((s) => s.beginEdit);
  const moveItem = useProposalComposerStore((s) => s.moveItem);
  const restore = useProposalComposerStore((s) => s.restore);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const rows = useRef<Array<HTMLLIElement | null>>([]);

  const items = queueItems(queuedActions);
  const findings = analyzeQueue(queuedActions, daoConfig);
  const editingIndex = editingState?.mode === 'edit' ? editingState.index : undefined;
  const reorderable = variant === 'composer' && items.length > 1;

  function remove(entry: QueueItem) {
    if (!address) return;
    const previous = queuedActions;
    restore(address, daoId, removeFromQueue(queuedActions, [entry.actions[0].id]));
    showRemovedToast({ address, daoId, previous, label: itemSentence(entry) });
  }

  function requestRemove(entry: QueueItem) {
    // A bundle or a high-risk change asks first; anything else comes out at once, with undo.
    if (entry.bundleId || entry.actions.some(isHighRiskProposalAction)) {
      setConfirm({
        title: entry.bundleId ? 'Remove all of its steps?' : 'Remove this change?',
        message: `“${itemSentence(entry)}” comes out of the proposal${
          entry.actions.length > 1 ? `, all ${entry.actions.length} steps together` : ''
        }. You can undo it from the notice.`,
        onConfirm: () => {
          remove(entry);
          setConfirm(null);
        }
      });
      return;
    }
    remove(entry);
  }

  function edit(entry: QueueItem) {
    const first = entry.actions[0];
    const inline = variant === 'composer' && !entry.bundleId && isPickable(getActionHandler(first.type));
    if (inline) return beginEdit(address, daoId, entry.start);
    const href = changeEditHref(first);
    if (href) router.push(daoRoute(routeId, href));
  }

  function move(from: number, to: number) {
    moveItem(address, daoId, from, to);
  }

  /** Pointer reorder: the row follows the pointer by index, shown as a drop line, and moves on release. */
  function startDrag(event: ReactPointerEvent<HTMLElement>, from: number) {
    if (event.button !== 0) return;
    event.preventDefault();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    let to = from;
    setDrag({ from, to });
    const onMove = (moveEvent: PointerEvent) => {
      const index = rows.current.findIndex((row) => {
        const rect = row?.getBoundingClientRect();
        return rect ? moveEvent.clientY >= rect.top && moveEvent.clientY <= rect.bottom : false;
      });
      if (index >= 0 && index !== to) {
        to = index;
        setDrag({ from, to });
      }
    };
    const onUp = () => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
      setDrag(null);
      if (to !== from) animateMove(from, to);
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
  }

  /** FLIP for pointer moves only: keyboard and button moves land without animating. */
  function animateMove(from: number, to: number) {
    const before = rows.current.map((row) => row?.getBoundingClientRect().top ?? 0);
    move(from, to);
    if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    requestAnimationFrame(() => {
      const easing = getComputedStyle(document.documentElement).getPropertyValue('--easings-in-out').trim();
      rows.current.forEach((row) => {
        if (!row) return;
        const key = row.dataset.key;
        const oldIndex = items.findIndex((entry) => entry.key === key);
        if (oldIndex < 0) return;
        const delta = before[oldIndex] - row.getBoundingClientRect().top;
        if (!delta) return;
        row.animate([{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }], {
          duration: 200,
          easing: easing || 'ease-in-out'
        });
      });
    });
  }

  if (queuedActions.length === 0) {
    return (
      <p className={empty}>
        {variant === 'composer'
          ? 'Nothing yet. Add a change below, or from any Manage page.'
          : 'Nothing in your proposal yet.'}
      </p>
    );
  }

  return (
    <div>
      <ol className={list} aria-label="Changes in this proposal">
        {items.map((entry, index) => {
          const first = entry.actions[0];
          const source = first.source as ChangeSource | undefined;
          const isEditing =
            editingIndex !== undefined &&
            editingIndex >= entry.start &&
            editingIndex < entry.start + entry.actions.length;
          const open = expanded[entry.key] ?? false;
          const shown = rowFindings(entry, findings);
          const pickable = !entry.bundleId && isPickable(getActionHandler(first.type));
          const href = changeEditHref(first);
          const canEdit = variant === 'composer' ? pickable || Boolean(href) : Boolean(href);
          const dropping =
            drag && drag.to === index && drag.from !== index ? (drag.to < drag.from ? 'before' : 'after') : undefined;
          return (
            <li
              key={entry.key}
              ref={(row) => {
                rows.current[index] = row;
              }}
              data-key={entry.key}
              className={item}
              data-editing={isEditing ? '' : undefined}
              data-dragging={drag?.from === index ? '' : undefined}
              data-drop={dropping}
            >
              <span className={number} aria-hidden="true">
                {index + 1}
              </span>
              <div className={body}>
                <p className={sentence}>
                  {itemSentence(entry)}
                  {isEditing ? (
                    <span className={css({ ml: '2' })}>
                      <Chip tone="live">Editing</Chip>
                    </span>
                  ) : null}
                </p>
                <div className={metaRow}>
                  {source && source.surface !== 'composer' ? (
                    <Chip tone="outline">
                      {isPickable(getActionHandler(first.type)) ? source.label : `Prepared in ${source.label}`}
                    </Chip>
                  ) : null}
                  {entry.bundleId ? (
                    <button
                      type="button"
                      className={stepsToggle}
                      aria-expanded={open}
                      onClick={() => setExpanded((current) => ({ ...current, [entry.key]: !open }))}
                    >
                      {entry.actions.length} steps
                      <ChevronDown aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
                {entry.bundleId && open ? (
                  <ol className={stepList}>
                    {entry.actions.map((action: ProposalQueuedAction) => (
                      <li key={action.id} className={step}>
                        {getProposalActionSummary(action)}
                      </li>
                    ))}
                  </ol>
                ) : null}
                {shown.map((found) => (
                  <p key={found.message} className={finding} data-severity={found.severity}>
                    <TriangleAlert aria-hidden="true" />
                    {found.message}
                  </p>
                ))}
              </div>
              <div className={buttons}>
                {reorderable ? (
                  <>
                    <span
                      className={handle}
                      role="presentation"
                      title="Drag to reorder"
                      onPointerDown={(event) => startDrag(event, index)}
                    >
                      <GripVertical aria-hidden="true" />
                    </span>
                    <IconButton
                      label={`Move change ${index + 1} up`}
                      size="sm"
                      disabled={index === 0}
                      onClick={() => move(index, index - 1)}
                    >
                      <ChevronUp aria-hidden="true" />
                    </IconButton>
                    <IconButton
                      label={`Move change ${index + 1} down`}
                      size="sm"
                      disabled={index === items.length - 1}
                      onClick={() => move(index, index + 1)}
                    >
                      <ChevronDown aria-hidden="true" />
                    </IconButton>
                  </>
                ) : null}
                {canEdit ? (
                  <Button variant="ghost" size="sm" onClick={() => edit(entry)} disabled={isEditing}>
                    Edit
                  </Button>
                ) : null}
                <Button variant="ghost" size="sm" onClick={() => requestRemove(entry)} disabled={isEditing}>
                  Remove
                </Button>
              </div>
            </li>
          );
        })}
      </ol>
      <ProposalActionConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title ?? ''}
        message={confirm?.message ?? ''}
        confirmLabel="Remove"
        tone="danger"
        busy={false}
        onConfirm={confirm?.onConfirm ?? (() => {})}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
