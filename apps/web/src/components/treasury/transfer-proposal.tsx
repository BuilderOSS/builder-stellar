'use client';

import { useState } from 'react';

import { changeAuthorityText, ChangeSubmit } from '@/components/proposal-changes/change-submit';
import { EditingChangeNotice } from '@/components/proposal-changes/editing-change-notice';
import { PendingValue, usePendingChanges } from '@/components/proposal-changes/pending-value';
import { Callout, FieldHelperText } from '@/components/ui';
import { card, muted, title } from '@/components/ui/panel-styles';
import { useDaoContext } from '@/contexts/dao-context';
import { getTreasuryAssets } from '@/lib/assets-config';
import { MAX_PROPOSAL_ACTIONS } from '@/lib/governance-limits';
import type { TransferSacTokenData } from '@/lib/proposal-actions/actions/transfer-sac-token/types';
import { ActionFormProvider, useActionFormContext } from '@/lib/proposal-actions/context';
import { getActionHandler } from '@/lib/proposal-actions/registry';
import type { ActionHandler, ValidationResult } from '@/lib/proposal-actions/types';
import { CHANGE_SOURCES } from '@/lib/proposal-changes/change-request';
import { useEditingChange } from '@/lib/proposal-changes/use-editing-change';
import { useProposeChange } from '@/lib/proposal-changes/use-propose-change';
import { useAuthSessionStore } from '@/stores/auth-session-store';
import { selectDraft, useProposalComposerStore } from '@/stores/proposal-composer-store';

const handler: ActionHandler<TransferSacTokenData> = getActionHandler('transfer-sac-token');

export function TransferProposal() {
  const { daoConfig } = useDaoContext();
  const address = useAuthSessionStore((s) => s.address);
  return (
    <ActionFormProvider config={daoConfig} session={{ address, kit: null }}>
      <TransferProposalForm />
    </ActionFormProvider>
  );
}

function TransferProposalForm() {
  const { daoId, daoConfig } = useDaoContext();
  const context = useActionFormContext();
  const session = useAuthSessionStore();
  const { propose } = useProposeChange();
  const pending = usePendingChanges('transfer-sac-token');
  const [draft, setDraft] = useState<TransferSacTokenData>(() => handler.getDefaultValues());
  const [validation, setValidation] = useState<ValidationResult>();
  const [message, setMessage] = useState('');
  const editing = useEditingChange({
    accepts: (action) => action.type === 'transfer-sac-token',
    onLoad: (action) => setDraft(handler.deserialize(action))
  });
  const allowed =
    session.authStatus === 'authenticated' &&
    Boolean(session.address) &&
    !session.walletNetworkIssue &&
    daoConfig.status === 'operational' &&
    Boolean(daoConfig.treasuryContractId);
  const Form = handler.FormComponent;

  function checkDraft() {
    if (!allowed) throw new Error('Authenticate on this network after the tribe launches.');
    if (!getTreasuryAssets(daoConfig.name).some((asset) => asset.code === draft.assetCode))
      throw new Error('Choose an asset to send.');
    if (
      context.balancesLoading ||
      context.balancesError ||
      !context.balances?.some((asset) => asset.assetCode === draft.assetCode)
    )
      throw new Error('Wait for a verified treasury balance before proposing a transfer.');
    const result = handler.validate(draft, context);
    setValidation(result);
    if (!result.valid) throw new Error(result.message);
    const existing = selectDraft(session.address, daoId)(useProposalComposerStore.getState());
    if (!editing.editing && existing.queuedActions.length >= MAX_PROPOSAL_ACTIONS)
      throw new Error('The proposal draft already has 20 actions. Open the composer to edit it.');
  }

  function add() {
    try {
      checkDraft();
      setMessage('');
      const result = propose(
        {
          actions: [handler.serialize(draft, context)],
          source: CHANGE_SOURCES.treasury,
          note: `Send ${draft.amount} ${draft.assetCode} from the treasury to ${draft.recipient.trim()}.`,
          replaces: editing.replaces
        },
        {
          onAdded: () => {
            setDraft(handler.getDefaultValues());
            editing.done();
          }
        }
      );
      if (result.outcome === 'invalid') setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to prepare proposal.');
    }
  }

  return (
    <section className={card} aria-labelledby="treasury-proposal-title">
      <div>
        <h2 id="treasury-proposal-title" className={title}>
          Propose a payout
        </h2>
        <p className={muted}>
          Ask members to send treasury funds to someone. Nothing moves until the vote passes and it is executed.
        </p>
      </div>
      {!allowed ? (
        <p className={muted} role="status">
          {session.walletNetworkIssue ||
            (daoConfig.status === 'pending'
              ? 'Payouts can be proposed once the tribe launches.'
              : 'Connect your wallet to propose a payout.')}
        </p>
      ) : null}
      <EditingChangeNotice
        editing={editing.editing}
        onCancel={() => {
          editing.done();
          setDraft(handler.getDefaultValues());
        }}
      />
      {pending
        .filter((action) => action.id !== editing.editing?.id)
        .map((action) => (
          <PendingValue key={action.id} pending={action} />
        ))}
      <Form
        value={draft}
        onChange={(value) => {
          setDraft(value);
          setValidation(undefined);
          setMessage('');
        }}
        disabled={!allowed}
        validationErrors={validation}
        network={daoConfig.name}
      />
      {message ? <Callout variant="error" title={message} role="alert" /> : null}
      <ChangeSubmit
        direct={false}
        what="the payout"
        editing={Boolean(editing.editing)}
        variant="secondary"
        block
        disabled={!allowed || context.balancesLoading || Boolean(context.balancesError)}
        onClick={add}
      />
      <FieldHelperText>
        {changeAuthorityText(false)} The recipient&apos;s trustline and the treasury balance are checked when it runs.
      </FieldHelperText>
    </section>
  );
}
