'use client';

import { useState } from 'react';
import { css } from 'styled-system/css';

import { Badge, Callout, FieldHelperText } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { ACTION_SOURCES, defaultSourceKey } from '@/lib/proposal-actions/action-request';
import { ACTION_CATALOG, type CurrentValue } from '@/lib/proposal-actions/catalog';
import { getActionHandler } from '@/lib/proposal-actions/registry';
import type { ProposalActionType, ValidationResult } from '@/lib/proposal-actions/types';
import { useEditingAction } from '@/lib/proposal-actions/use-editing-action';
import { useProposeAction } from '@/lib/proposal-actions/use-propose-action';
import { getProposalActionSummary } from '@/lib/proposal-call';
import { useAuthSessionStore } from '@/stores/auth-session-store';

import { actionAuthorityText, ActionSubmit } from './action-submit';
import { EditingActionNotice } from './editing-action-notice';
import { PendingValue, usePendingActions } from './pending-value';

const card = css({ display: 'grid', gap: '3', p: '5', borderRadius: 'card', bg: 'surface', boxShadow: 'raised' });
const footer = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '3',
  flexWrap: 'wrap'
});

/**
 * One setting on a Manage page: its live value, any value waiting in the proposal, the same form the composer
 * uses, and one button that applies it in Setup or adds it to the proposal after launch.
 */
export function SettingActionCard<TData extends object>({
  type,
  title,
  current,
  direct,
  canAct,
  busy,
  loading = false,
  onApply
}: {
  type: ProposalActionType;
  title: string;
  current: CurrentValue<TData> | null;
  direct: boolean;
  canAct: boolean;
  busy: boolean;
  /** This card's own action is being signed. */
  loading?: boolean;
  /** Setup only: sign the action now. */
  onApply: (draft: TData) => Promise<void> | void;
}) {
  const { daoConfig: config } = useDaoContext();
  const address = useAuthSessionStore((state) => state.address);
  const handler = getActionHandler(type);
  // The setting's own form, the one the composer shows for it.
  const Form = ACTION_CATALOG[type].Form ?? handler.FormComponent;
  const { propose } = useProposeAction();
  const [draft, setDraft] = useState<TData | null>(null);
  const [errors, setErrors] = useState<ValidationResult | null>(null);
  const [message, setMessage] = useState('');
  // Edit from the pending row: saving replaces that action in place, like the `?action=` round trip.
  const [localEdit, setLocalEdit] = useState<string | null>(null);
  const pending = usePendingActions(type).at(-1);
  const editing = useEditingAction({
    accepts: (action) => action.type === type,
    onLoad: (action) => setDraft(handler.deserialize(action) as TData)
  });
  const value = (draft ?? current?.draft ?? handler.getDefaultValues()) as TData;
  const unchanged = !draft || JSON.stringify(draft) === JSON.stringify(current?.draft);
  const context = { config, session: { address, kit: null } };

  async function submit() {
    setMessage('');
    const result = handler.validate(value, context);
    if (!result.valid) {
      setErrors(result);
      return;
    }
    setErrors(null);
    if (direct) {
      await onApply(value);
      setDraft(null);
      return;
    }
    const action = handler.serialize(value, context);
    const outcome = propose(
      {
        actions: [action],
        source: ACTION_SOURCES[defaultSourceKey(type)],
        note: `${getProposalActionSummary(action)}${current ? ` (now ${current.text})` : ''}.`,
        replaces: editing.replaces ?? (localEdit ? [localEdit] : undefined)
      },
      {
        onAdded: () => {
          setDraft(null);
          setLocalEdit(null);
          editing.done();
        }
      }
    );
    if (outcome.outcome === 'invalid') setMessage(outcome.message);
    if (outcome.outcome === 'no-wallet') setMessage('Connect a wallet to add this to a proposal.');
  }

  return (
    <section className={card} aria-label={title}>
      <div>
        <Badge>{title}</Badge>
      </div>
      <EditingActionNotice
        editing={editing.editing}
        onCancel={() => {
          editing.done();
          setDraft(null);
        }}
      />
      <EditingActionNotice
        editing={localEdit && pending?.id === localEdit ? pending : null}
        onCancel={() => {
          setLocalEdit(null);
          setDraft(null);
        }}
      />
      <PendingValue
        now={current?.text ?? '—'}
        pending={editing.editing || localEdit ? undefined : pending}
        onEdit={
          pending && !direct
            ? () => {
                setDraft(handler.deserialize(pending) as TData);
                setLocalEdit(pending.id);
              }
            : undefined
        }
      />
      <Form
        value={value}
        onChange={(next: TData) => {
          setDraft(next);
          setErrors(null);
        }}
        disabled={busy || !canAct}
        validationErrors={errors ?? undefined}
        network={config.name}
      />
      {message ? <Callout variant="warning" title={message} /> : null}
      <div className={footer}>
        <FieldHelperText>{actionAuthorityText(direct)}</FieldHelperText>
        <ActionSubmit
          direct={direct}
          editing={Boolean(editing.editing || localEdit)}
          disabled={busy || !canAct || (unchanged && !editing.editing && !localEdit)}
          loading={loading}
          onClick={() => void submit()}
        />
      </div>
    </section>
  );
}
