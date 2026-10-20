// src/lib/proposal-actions/components/action-picker-sheet.tsx

'use client';

import { ArrowUpRight, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useContext, useMemo, useState } from 'react';
import { css } from 'styled-system/css';

import { SettingValuesContext } from '@/components/proposal-actions/setting-forms';
import { Disclosure, SearchInput, Sheet } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { daoRoute } from '@/lib/dao-routes';
import {
  ACTION_CATALOG,
  actionAvailability,
  actionHome,
  pickerEntries,
  TRIBE_PARTS
} from '@/lib/proposal-actions/catalog';
import { useAuthSessionStore } from '@/stores/auth-session-store';
import { normalizeWalletAddress, useProposalComposerStore } from '@/stores/proposal-composer-store';

import { getAllActionHandlers } from '../registry';
import type { ActionHandler, ProposalActionType } from '../types';
import { ActionFormWrapper } from './action-form-wrapper';

const stack = css({ display: 'grid', gap: '5' });
const group = css({ display: 'grid', gap: '1.5' });
const groupTitle = css({ textStyle: 'label', color: 'ink.muted', m: '0' });
const intents = css({ display: 'grid', gap: '2', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' });
const tile = css({
  display: 'grid',
  gap: '1',
  alignContent: 'start',
  minH: '16',
  p: '3',
  borderRadius: 'control',
  bg: 'raised',
  border: '0',
  color: 'ink',
  textAlign: 'left',
  textDecoration: 'none',
  cursor: 'pointer',
  transitionProperty: 'background-color, scale',
  transitionDuration: 'fast',
  transitionTimingFunction: 'out',
  '@media (hover: hover) and (pointer: fine)': { _hover: { bg: 'hover' } },
  _active: { scale: '0.96' },
  _motionReduce: { _active: { scale: '1' } },
  _focusVisible: { outline: '2px solid', outlineColor: 'signal', outlineOffset: '2px' },
  _disabled: { cursor: 'default', opacity: '0.6', _active: { scale: '1' } }
});
const tileTitle = css({ textStyle: 'body', fontWeight: '600' });
const tileMeta = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '1',
  textStyle: 'caption',
  color: 'ink.muted',
  '& svg': { width: '3.5', height: '3.5' }
});
const rows = css({ display: 'grid', listStyle: 'none', m: '0', p: '0' });
const row = css({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: '3',
  width: '100%',
  minH: 'touch',
  py: '2.5',
  px: '2',
  mx: '-2',
  border: '0',
  borderRadius: 'control',
  bg: 'transparent',
  color: 'ink',
  textAlign: 'left',
  cursor: 'pointer',
  transitionProperty: 'background-color',
  transitionDuration: 'fast',
  '@media (hover: hover) and (pointer: fine)': { _hover: { bg: 'hover' } },
  _focusVisible: { outline: '2px solid', outlineColor: 'signal', outlineOffset: '-2px' },
  _disabled: { cursor: 'default', _hover: { bg: 'transparent' } },
  '& > svg': { width: '4', height: '4', color: 'ink.faint' }
});
const rowText = css({ display: 'grid', gap: '0.5', minW: '0' });
const rowLabel = css({ textStyle: 'body', fontWeight: '500', '[disabled] &': { color: 'ink.muted' } });
const rowMeta = css({ textStyle: 'caption', color: 'ink.muted' });
const fixLink = css({
  textStyle: 'caption',
  color: 'signal',
  textDecoration: 'none',
  _hover: { textDecoration: 'underline' }
});
const empty = css({ textStyle: 'body', color: 'ink.muted', m: '0' });

type Entry = { handler: ActionHandler; meta: (typeof ACTION_CATALOG)[ProposalActionType] };

/** What members do most comes first: paying someone, then adding members. */
const INTENT_ORDER: ProposalActionType[] = [
  'transfer-sac-token',
  'batch-mint-governance-token',
  'mint-governance-token',
  'transfer-dao-token',
  'treasury-buy-listing',
  'dao-transfer'
];
const intentRank = (entry: Entry) => {
  const rank = INTENT_ORDER.indexOf(entry.handler.type);
  return rank < 0 ? INTENT_ORDER.length : rank;
};

function matches(entry: Entry, query: string) {
  if (!query) return true;
  const text = `${entry.meta.intent ?? ''} ${entry.handler.label} ${entry.handler.description} ${entry.meta.keywords ?? ''}`;
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((word) => text.toLowerCase().includes(word));
}

/**
 * Adding a change to the proposal, in two screens: choose what to change, then set it up. Choosing starts
 * from what a member wants ("Pay someone"), then every setting by tribe part with its live value. Changes
 * prepared on their own page link there instead.
 */
export function ActionPickerSheet({
  daoId,
  open,
  onOpenChange
}: {
  daoId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { daoConfig: config, routeId } = useDaoContext();
  const values = useContext(SettingValuesContext);
  const address = useAuthSessionStore((state) => state.address);
  const walletKey = normalizeWalletAddress(address);
  const editingState = useProposalComposerStore((s) => s.draftsByWallet[walletKey]?.[daoId]?.editingState ?? null);
  const beginCreate = useProposalComposerStore((s) => s.beginCreate);
  const cancelEdit = useProposalComposerStore((s) => s.cancelEdit);
  const [query, setQuery] = useState('');

  const entries = useMemo(() => pickerEntries(), []);
  const elsewhereIntents = useMemo(
    () =>
      getAllActionHandlers()
        .map((handler) => ({ handler, meta: ACTION_CATALOG[handler.type] }))
        .filter((entry) => entry.meta.section === 'elsewhere' && entry.meta.intent),
    []
  );
  const shown = entries.filter((entry) => matches(entry, query.trim()));
  const intentEntries = shown
    .filter((entry) => entry.meta.section === 'intent')
    .sort((a, b) => intentRank(a) - intentRank(b));
  const shownElsewhere = elsewhereIntents.filter((entry) => matches(entry, query.trim()));
  const settings = shown.filter((entry) => entry.meta.section === 'setting');
  const advanced = shown.filter((entry) => entry.meta.section === 'advanced');

  function pick(type: ProposalActionType) {
    const draft = ACTION_CATALOG[type].currentValue?.(values)?.draft;
    beginCreate(address, daoId, type, draft);
  }

  function close(next: boolean) {
    onOpenChange(next);
    if (!next) {
      // An edit closes with its sheet; a new change left half set up is discarded.
      if (editingState) cancelEdit(address, daoId);
      setTimeout(() => setQuery(''), 250);
    }
  }

  function settingRow(entry: Entry) {
    const availability = actionAvailability(entry.handler.type, config, values);
    const current = entry.meta.currentValue?.(values);
    return (
      <li key={entry.handler.type}>
        <button
          type="button"
          className={row}
          disabled={!availability.available}
          onClick={() => pick(entry.handler.type)}
        >
          <span className={rowText}>
            <span className={rowLabel}>{entry.handler.label}</span>
            <span className={rowMeta}>
              {availability.available
                ? current
                  ? `Now: ${current.text}`
                  : entry.handler.description
                : availability.reason}
            </span>
          </span>
          {availability.available ? <ChevronRight aria-hidden="true" /> : null}
        </button>
        {!availability.available && availability.fixHref ? (
          <Link className={fixLink} href={daoRoute(routeId, availability.fixHref)}>
            Fix in {availability.fixLabel}
          </Link>
        ) : null}
      </li>
    );
  }

  const choosing = !editingState;
  const parts = TRIBE_PARTS.map((part) => ({
    part,
    items: settings.filter((entry) => entry.meta.part === part)
  })).filter((entry) => entry.items.length);

  return (
    <Sheet
      open={open || Boolean(editingState)}
      onOpenChange={close}
      title={choosing ? 'Add a change' : editingState.mode === 'edit' ? 'Edit a change' : 'Set up the change'}
      description={
        choosing
          ? 'Changes run in order, all together, only if the vote passes. Nothing is signed until you submit.'
          : undefined
      }
    >
      {choosing ? (
        <div className={stack}>
          <SearchInput value={query} onValueChange={setQuery} label="Find a change" placeholder="Find a change" />

          {intentEntries.length || shownElsewhere.length ? (
            <section className={group} aria-labelledby="picker-intents">
              <h3 id="picker-intents" className={groupTitle}>
                Do something
              </h3>
              <div className={intents}>
                {intentEntries.map((entry) => {
                  const availability = actionAvailability(entry.handler.type, config, values);
                  return (
                    <button
                      key={entry.handler.type}
                      type="button"
                      className={tile}
                      disabled={!availability.available}
                      onClick={() => pick(entry.handler.type)}
                    >
                      <span className={tileTitle}>{entry.meta.intent}</span>
                      <span className={tileMeta}>
                        {availability.available ? entry.handler.description : availability.reason}
                      </span>
                    </button>
                  );
                })}
                {shownElsewhere.map((entry) => {
                  const home = actionHome(entry.handler.type);
                  const availability = actionAvailability(entry.handler.type, config, values);
                  return availability.available ? (
                    <Link key={entry.handler.type} className={tile} href={daoRoute(routeId, home.href)}>
                      <span className={tileTitle}>{entry.meta.intent}</span>
                      <span className={tileMeta}>
                        Prepared in {home.label}
                        <ArrowUpRight aria-hidden="true" />
                      </span>
                    </Link>
                  ) : null;
                })}
              </div>
            </section>
          ) : null}

          {parts.map(({ part, items }) => (
            <section key={part} className={group} aria-labelledby={`picker-${part}`}>
              <h3 id={`picker-${part}`} className={groupTitle}>
                Change a setting · {part}
              </h3>
              <ul className={rows}>{items.map(settingRow)}</ul>
            </section>
          ))}

          {advanced.length ? (
            <Disclosure title="Advanced" defaultOpen={Boolean(query.trim())} key={query.trim() ? 'search' : 'browse'}>
              <ul className={rows}>{advanced.map(settingRow)}</ul>
            </Disclosure>
          ) : null}

          {!intentEntries.length && !shownElsewhere.length && !parts.length && !advanced.length ? (
            <p className={empty}>No change matches “{query.trim()}”. Try a plainer word, like “pay” or “quorum”.</p>
          ) : null}
        </div>
      ) : (
        <ActionFormWrapper daoId={daoId} onDone={() => onOpenChange(false)} />
      )}
    </Sheet>
  );
}
