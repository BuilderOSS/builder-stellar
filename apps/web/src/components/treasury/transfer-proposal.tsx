'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

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

import styles from './treasury.module.css';

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
    <section className={`${styles.panel} ${styles.stack}`} aria-labelledby="treasury-proposal-title">
      <div>
        <p className={styles.label}>Governance</p>
        <h2 id="treasury-proposal-title">Propose a transfer</h2>
      </div>
      <p className={styles.muted}>
        Add the registered SAC transfer action to your existing proposal queue. Funds leave the treasury only after
        voting, queueing and execution—not when you create this local draft.
      </p>
      {!allowed ? (
        <p role="status">
          {session.walletNetworkIssue ||
            (daoConfig.status === 'pending'
              ? 'Launch the community before proposing transfers.'
              : 'Authenticate your wallet to prepare a proposal.')}
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
      {message ? (
        <p role="alert" className={styles.error}>
          {message}
        </p>
      ) : null}
      {!proposal.pending ? (
        <button
          type="button"
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
                onAdded: () => router.push(daoRoute(daoId, 'proposals/create'))
              });
            } catch (error) {
              setMessage(error instanceof Error ? error.message : 'Unable to prepare proposal.');
            }
          }}
        >
          Review transfer proposal
        </button>
      ) : (
        <div className={`${styles.notice} ${styles.stack}`} role="region" aria-label="Review treasury proposal draft">
          <h3>Review proposal action</h3>
          <p>{proposal.pending.metadata.description}</p>
          <p className={styles.address}>Treasury authority: {daoConfig.treasuryContractId}</p>
          {proposal.pending.summaries.map((summary) => (
            <p key={summary}>{summary}</p>
          ))}
          {proposal.pending.findings.map((finding, index) => (
            <p key={index}>{finding.message}</p>
          ))}
          <p className={styles.muted}>
            No signature will be requested. Existing proposal metadata and actions are preserved. Recipient account
            trustlines and available balances will be checked during execution.
          </p>
          <div className={styles.row}>
            <button type="button" onClick={proposal.cancel}>
              Cancel
            </button>
            {!proposal.pending.findings.some(
              (finding) => finding.severity === 'error' || finding.kind === 'duplicate' || finding.kind === 'conflict'
            ) ? (
              <button
                type="button"
                className={styles.primary}
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
                Add to queue & open composer
              </button>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
