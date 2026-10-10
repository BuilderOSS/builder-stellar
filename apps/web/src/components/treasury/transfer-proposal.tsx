'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { css } from 'styled-system/css';

import { Button, Callout } from '@/components/ui';
import { card, muted, review, reviewTitle, title } from '@/components/ui/panel-styles';
import { useDaoContext } from '@/contexts/dao-context';
import { getTreasuryAssets } from '@/lib/assets-config';
import { daoRoute } from '@/lib/dao-routes';
import { MAX_PROPOSAL_ACTIONS } from '@/lib/governance-limits';
import type { TransferSacTokenData } from '@/lib/proposal-actions/actions/transfer-sac-token/types';
import { ActionFormProvider, useActionFormContext } from '@/lib/proposal-actions/context';
import { getActionHandler } from '@/lib/proposal-actions/registry';
import type { ActionHandler, ValidationResult } from '@/lib/proposal-actions/types';
import { useAdminProposalDraft } from '@/lib/use-admin-proposal-draft';
import { useAuthSessionStore } from '@/stores/auth-session-store';
import { selectDraft, useProposalComposerStore } from '@/stores/proposal-composer-store';

const buttons = css({ display: 'flex', justifyContent: 'flex-end', gap: '2' });

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
  const { daoId, daoConfig, routeId } = useDaoContext();
  const context = useActionFormContext();
  const session = useAuthSessionStore();
  const router = useRouter();
  const proposal = useAdminProposalDraft();
  const [draft, setDraft] = useState<TransferSacTokenData>(() => handler.getDefaultValues());
  const [validation, setValidation] = useState<ValidationResult>();
  const [message, setMessage] = useState('');
  const allowed =
    session.authStatus === 'authenticated' &&
    Boolean(session.address) &&
    !session.walletNetworkIssue &&
    daoConfig.status === 'operational' &&
    Boolean(daoConfig.treasuryContractId);
  const Form = handler.FormComponent;

  function checkDraft() {
    if (!allowed) throw new Error('Authenticate on this network after the community launches.');
    if (!getTreasuryAssets(daoConfig.name).some((asset) => asset.code === draft.assetCode))
      throw new Error('Select a configured SAC asset.');
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
    if (existing.queuedActions.length >= MAX_PROPOSAL_ACTIONS)
      throw new Error('The proposal draft already has 20 actions. Open the composer to edit it.');
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
              ? 'Payouts can be proposed once the community launches.'
              : 'Connect your wallet to propose a payout.')}
        </p>
      ) : null}
      <Form
        value={draft}
        onChange={(value) => {
          setDraft(value);
          setValidation(undefined);
          proposal.cancel();
          setMessage('');
        }}
        disabled={!allowed || Boolean(proposal.pending)}
        validationErrors={validation}
        network={daoConfig.name}
      />
      {message ? <Callout variant="error" title={message} role="alert" /> : null}
      {!proposal.pending ? (
        <Button
          variant="secondary"
          block
          disabled={!allowed || context.balancesLoading || Boolean(context.balancesError)}
          onClick={() => {
            try {
              checkDraft();
              setMessage('');
              proposal.requestAdd({
                daoId,
                action: handler.serialize(draft, context),
                metadata: {
                  title: `Transfer ${draft.amount} ${draft.assetCode}`,
                  description: `Transfer ${draft.amount} ${draft.assetCode} from the treasury to ${draft.recipient.trim()}.`,
                  url: ''
                },
                source: 'Treasury',
                onAdded: () => router.push(daoRoute(routeId, 'proposals/create'))
              });
            } catch (error) {
              setMessage(error instanceof Error ? error.message : 'Unable to prepare proposal.');
            }
          }}
        >
          Review payout
        </Button>
      ) : (
        <div className={review} role="region" aria-label="Review payout proposal">
          <h3 className={reviewTitle}>{proposal.pending.metadata.description}</h3>
          {proposal.pending.summaries.map((summary) => (
            <p key={summary} className={muted}>
              {summary}
            </p>
          ))}
          {proposal.pending.findings.map((finding, index) => (
            <Callout key={index} variant={finding.severity === 'error' ? 'error' : 'warning'} title={finding.message} />
          ))}
          <p className={muted}>
            Nothing is signed now. It joins your proposal draft with anything already in it. The recipient&apos;s
            trustline and the treasury balance are checked when it runs.
          </p>
          <div className={buttons}>
            <Button variant="ghost" onClick={proposal.cancel}>
              Cancel
            </Button>
            {!proposal.pending.findings.some(
              (finding) => finding.severity === 'error' || finding.kind === 'duplicate' || finding.kind === 'conflict'
            ) ? (
              <Button
                disabled={!allowed}
                onClick={() => {
                  try {
                    checkDraft();
                    proposal.resolve('add');
                  } catch (error) {
                    setMessage(error instanceof Error ? error.message : 'Draft unavailable.');
                  }
                }}
              >
                Add to proposal
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
