// New simplified proposals/create page using the new architecture

'use client';

import { Client as GovernorClient } from '@builder-stellar/governor-bindings';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { BookOpen, ChevronLeft, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import { css } from 'styled-system/css';

import { ProposalActionConfirmDialog } from '@/components/proposal/proposal-action-confirm-dialog';
import { ProposalContextRail } from '@/components/proposal/proposal-context-rail';
import {
  Button,
  ButtonLink,
  Callout,
  Field,
  FieldHelperText,
  FieldLabel,
  Input,
  PageHeader,
  ProgressSteps,
  Section,
  Skeleton,
  Textarea
} from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { daoRoute } from '@/lib/dao-routes';
import { MAX_PROPOSAL_ACTIONS, validateProposalActionCount } from '@/lib/governance-limits';
import { analyzeProposalAction } from '@/lib/proposal-action-identity';
import { ActionFormProvider, ActionFormWrapper, ProposalActionQueue } from '@/lib/proposal-actions';
import { buildProposalCallVectors, encodeProposalCallArgs, getProposalActionSummary } from '@/lib/proposal-call';
import { useProposalEligibility } from '@/lib/proposal-eligibility';
import { proposalIdToRouteId } from '@/lib/proposal-id';
import { encodeProposalMetadata, validateProposalMetadataDraft } from '@/lib/proposal-metadata';
import { waitForConfirmation } from '@/lib/transaction-confirmation';
import { useTransactionFeedback } from '@/lib/transaction-feedback';
import { signWithWallet } from '@/lib/wallet-sign';
import { useAuthSessionStore } from '@/stores/auth-session-store';
import {
  selectCanProceedToStep2,
  selectDraft,
  selectHasDraft,
  useProposalComposerStore
} from '@/stores/proposal-composer-store';

const layout = css({
  display: 'grid',
  gap: '8',
  lg: { gridTemplateColumns: 'minmax(0, 1fr) 340px', alignItems: 'start' },
  xl: { gridTemplateColumns: 'minmax(0, 1fr) 380px' }
});
const mainColumn = css({ display: 'grid', gap: '2', minW: '0', maxW: '720px' });
const back = css({ justifySelf: 'start', ml: '-3' });
const stack = css({ display: 'grid', gap: '5' });
const actions = css({ display: 'flex', justifyContent: 'space-between', gap: '2', pt: '2' });
const hint = css({ textStyle: 'body', color: 'ink.muted', m: '0' });
const review = css({ display: 'grid', gap: '3', p: '5', borderRadius: 'card', bg: 'surface', boxShadow: 'raised' });
const reviewTitle = css({ textStyle: 'title', fontSize: '1.375rem', m: '0' });
const reviewBody = css({ textStyle: 'body', color: 'ink', m: '0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' });
const reviewLink = css({ textStyle: 'label', color: 'signal', overflowWrap: 'anywhere' });
const reviewHeading = css({ textStyle: 'label', color: 'ink.muted', m: '0', mt: '2' });
const reviewList = css({ display: 'grid', gap: '2', listStyle: 'none', m: '0', p: '0' });
const reviewItem = css({ display: 'flex', alignItems: 'flex-start', gap: '2.5', textStyle: 'body' });
const reviewIndex = css({
  display: 'grid',
  placeItems: 'center',
  flexShrink: '0',
  width: '6',
  height: '6',
  borderRadius: 'full',
  bg: 'hover',
  textStyle: 'micro',
  color: 'ink.muted'
});
const referenceTrigger = css({
  display: { base: 'inline-flex', lg: 'none' },
  position: 'fixed',
  zIndex: 'bar',
  right: '4',
  bottom: 'calc(token(sizes.tabbar) + env(safe-area-inset-bottom) + 16px)',
  boxShadow: 'float'
});

export default function ProposalCreatePage() {
  const { daoId, routeId } = useDaoContext();
  const router = useRouter();
  const session = useAuthSessionStore();
  const { daoConfig: config } = useDaoContext();

  // Zustand store hooks
  const draft = useProposalComposerStore(selectDraft(session.address || null, daoId));
  const { step, metadata, queuedActions, editingState } = draft;
  const hasDraft = useProposalComposerStore(selectHasDraft(session.address || null, daoId));
  const canProceed = useProposalComposerStore(selectCanProceedToStep2(session.address || null, daoId));

  const setStep = useProposalComposerStore((s) => s.setStep);
  const updateMetadata = useProposalComposerStore((s) => s.updateMetadata);
  const beginCreate = useProposalComposerStore((s) => s.beginCreate);
  const reset = useProposalComposerStore((s) => s.reset);

  // Queries
  const eligibility = useProposalEligibility(config, session.address);

  // Transaction feedback
  const txFeedback = useTransactionFeedback(config.name);
  const [transactionBusy, setTransactionBusy] = useState(false);

  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [contextRailOpen, setContextRailOpen] = useState(false);
  const contextTriggerRef = useRef<HTMLButtonElement>(null);
  const closeContextRail = useCallback(() => setContextRailOpen(false), []);

  const proposalCreationError = eligibility.error?.message;
  // Governor propose fails with NotLive until the DAO is launched.
  const isPendingLaunch = config.status === 'pending';
  const proposalCreationLocked = !eligibility.eligible || isPendingLaunch;
  const proposalCreationDisabledMessage = isPendingLaunch
    ? 'Proposals can only be created after the DAO has been launched.'
    : eligibility.message;
  // The Governor accepts at most MAX_PROPOSAL_ACTIONS (20) actions per proposal.
  const actionCountError = validateProposalActionCount(queuedActions.length);
  const draftFindings = queuedActions.flatMap((action, index) =>
    analyzeProposalAction(action, queuedActions.slice(0, index)).filter((finding) => finding.severity === 'error')
  );
  const hasBlockingDraftFindings = draftFindings.length > 0;

  // Metadata validation
  const metadataValidation = validateProposalMetadataDraft(metadata);

  const handleProceedToStep2 = () => {
    if (metadataValidation.valid) {
      setStep(session.address, daoId, 2);
    }
  };

  const handleProceedToStep3 = () => {
    if (canProceed && queuedActions.length > 0 && !actionCountError) {
      setStep(session.address, daoId, 3);
    }
  };

  const handleOpenConfirmDialog = () => {
    setConfirmDialogOpen(true);
  };

  const handleConfirmSubmit = async () => {
    if (!session.address) return;

    try {
      setTransactionBusy(true);
      setConfirmDialogOpen(false);
      txFeedback.start('Preparing proposal...');

      // Build call vectors
      const { targets, functions, args } = buildProposalCallVectors(
        queuedActions,
        config.tokenContractId,
        config.treasuryContractId,
        config
      );

      // Encode args and metadata
      const encodedArgs = encodeProposalCallArgs(targets, functions, args, config);
      const description = encodeProposalMetadata(metadata);

      // Create governor client
      const governor = new GovernorClient({
        contractId: config.governorContractId,
        rpcUrl: config.rpcUrl,
        networkPassphrase: config.passphrase,
        publicKey: session.address,
        signTransaction: async (xdr: string, opts?: { networkPassphrase?: string; address?: string }) =>
          signWithWallet(xdr, {
            networkPassphrase: opts?.networkPassphrase ?? config.passphrase,
            address: opts?.address ?? session.address
          })
      });

      // Submit proposal
      const assembled = await governor.propose({
        targets,
        functions,
        args: encodedArgs,
        description,
        proposer: session.address
      });

      const proposalId = assembled.result ? proposalIdToRouteId(assembled.result) : '';
      const sent = await assembled.signAndSend();
      const hash = sent.sendTransactionResponse?.hash ?? '';

      txFeedback.submitted('Proposal submitted', hash);
      await waitForConfirmation(hash, config.rpcUrl);

      txFeedback.success('Proposal created', hash);

      // Reset store and navigate
      reset(session.address, daoId);
      router.push(proposalId ? daoRoute(routeId, `proposals/${proposalId}`) : daoRoute(routeId, 'proposals'));
    } catch (err: any) {
      console.error('Proposal creation error:', err);
      txFeedback.fail(err, 'Proposal failed', 'governor');
    } finally {
      setTransactionBusy(false);
    }
  };

  const steps = [
    { id: 'details', label: 'What and why' },
    { id: 'actions', label: 'What it does' },
    { id: 'review', label: 'Review' }
  ];

  return (
    <>
      <div className={layout}>
        <div className={mainColumn}>
          <ButtonLink href={daoRoute(routeId, 'proposals')} variant="ghost" size="sm" className={back}>
            <ChevronLeft aria-hidden="true" />
            All votes
          </ButtonLink>
          <PageHeader
            title={hasDraft ? 'Your proposal' : 'New proposal'}
            meta="Say what you want to change and why, add what happens if it passes, then sign. Drafts save on this browser."
          />
          <div className={stack}>
            {session.address && eligibility.loading ? (
              <div role="status" aria-live="polite" aria-busy="true" className={stack}>
                <span className="sr-only">Checking whether you can propose</span>
                <Skeleton className={css({ height: '16', borderRadius: 'card' })} />
              </div>
            ) : proposalCreationError && !hasDraft ? (
              <Callout
                variant="error"
                title="We couldn't check whether you can propose"
                description={proposalCreationError}
              />
            ) : proposalCreationLocked && !hasDraft ? (
              <Callout variant="warning" title="You can't propose yet" description={proposalCreationDisabledMessage} />
            ) : (
              <>
                {proposalCreationError ? (
                  <Callout
                    variant="warning"
                    title="We couldn't check whether you can propose"
                    description={proposalCreationError}
                  />
                ) : null}
                {proposalCreationLocked && !proposalCreationError ? (
                  <Callout
                    variant="warning"
                    title="You can keep drafting, but can't submit yet"
                    description={proposalCreationDisabledMessage}
                  />
                ) : null}

                <ProgressSteps
                  steps={steps}
                  current={step - 1}
                  onSelect={(index) => setStep(session.address, daoId, (index + 1) as 1 | 2 | 3)}
                />

                {step === 1 && (
                  <div className={stack}>
                    <Field>
                      <FieldLabel htmlFor="title">Title</FieldLabel>
                      <Input
                        id="title"
                        value={metadata.title}
                        onChange={(e) => updateMetadata(session.address, daoId, { title: e.target.value })}
                        placeholder="Fund the winter tool library"
                        aria-invalid={!metadataValidation.valid && metadata.title.length > 0 ? true : undefined}
                      />
                      {!metadataValidation.valid ? (
                        <FieldHelperText>{metadataValidation.message}</FieldHelperText>
                      ) : null}
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="description">Why</FieldLabel>
                      <Textarea
                        id="description"
                        value={metadata.description}
                        onChange={(e) => updateMetadata(session.address, daoId, { description: e.target.value })}
                        placeholder="What changes, who it helps, and what it costs"
                        rows={7}
                      />
                      <FieldHelperText>Members read this before they vote. Plain words work best.</FieldHelperText>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="url">Discussion link (optional)</FieldLabel>
                      <Input
                        id="url"
                        value={metadata.url}
                        onChange={(e) => updateMetadata(session.address, daoId, { url: e.target.value })}
                        placeholder="https://forum.example.com/winter-tools"
                        inputMode="url"
                      />
                    </Field>
                    <div className={actions}>
                      <Button variant="ghost" onClick={() => router.back()}>
                        Cancel
                      </Button>
                      <Button onClick={handleProceedToStep2} disabled={!metadataValidation.valid}>
                        Next: what it does
                      </Button>
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <ActionFormProvider config={config} session={{ address: session.address, kit: StellarWalletsKit }}>
                    <div className={stack}>
                      <p className={hint}>
                        Add up to {MAX_PROPOSAL_ACTIONS} actions. They run in order, all together, only if the vote
                        passes.
                      </p>
                      {!editingState && (
                        <div>
                          <Button
                            variant="secondary"
                            onClick={() => beginCreate(session.address, daoId)}
                            disabled={queuedActions.length >= MAX_PROPOSAL_ACTIONS}
                          >
                            <Plus aria-hidden="true" />
                            Add an action
                          </Button>
                        </div>
                      )}
                      {actionCountError ? <Callout variant="error" title={actionCountError} /> : null}
                      <ActionFormWrapper daoId={daoId} />
                      <Section title={`Actions (${queuedActions.length})`} level={3}>
                        <ProposalActionQueue daoId={daoId} />
                      </Section>
                      <div className={actions}>
                        <Button variant="ghost" onClick={() => setStep(session.address, daoId, 1)}>
                          Back
                        </Button>
                        <Button
                          onClick={handleProceedToStep3}
                          disabled={!canProceed || queuedActions.length === 0 || Boolean(actionCountError)}
                        >
                          Next: review
                        </Button>
                      </div>
                    </div>
                  </ActionFormProvider>
                )}

                {step === 3 && (
                  <div className={stack}>
                    {actionCountError ? (
                      <Callout variant="error" badge="Fix before submitting" title={actionCountError} />
                    ) : null}
                    {hasBlockingDraftFindings ? (
                      <Callout
                        variant="error"
                        badge="Fix before submitting"
                        title="Some actions repeat or conflict"
                        description="Go back and remove or replace the flagged action."
                      />
                    ) : null}
                    <section className={review} aria-label="Proposal preview">
                      <h2 className={reviewTitle}>{metadata.title}</h2>
                      <p className={reviewBody}>{metadata.description}</p>
                      {metadata.url ? (
                        <a href={metadata.url} target="_blank" rel="noreferrer" className={reviewLink}>
                          {metadata.url}
                        </a>
                      ) : null}
                      <h3 className={reviewHeading}>If it passes</h3>
                      <ol className={reviewList}>
                        {queuedActions.map((action, i) => (
                          <li key={action.id} className={reviewItem}>
                            <span className={reviewIndex} aria-hidden="true">
                              {i + 1}
                            </span>
                            {getProposalActionSummary(action)}
                          </li>
                        ))}
                      </ol>
                    </section>
                    <Callout
                      title="Your wallet shows the exact transaction"
                      description="Check the contracts, recipients and amounts there before you sign. Proposing is free; your wallet pays a small network fee."
                    />
                    <div className={actions}>
                      <Button variant="ghost" onClick={() => setStep(session.address, daoId, 2)}>
                        Back
                      </Button>
                      <Button
                        onClick={handleOpenConfirmDialog}
                        disabled={proposalCreationLocked || hasBlockingDraftFindings || Boolean(actionCountError)}
                        loading={transactionBusy}
                      >
                        {transactionBusy ? 'Submitting' : 'Submit proposal'}
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        <ProposalContextRail
          key={editingState?.actionType ?? 'no-action'}
          activeActionType={editingState?.actionType}
          mobileOpen={contextRailOpen}
          onMobileClose={closeContextRail}
          mobileTriggerRef={contextTriggerRef}
        />
      </div>
      <Button
        variant="secondary"
        className={referenceTrigger}
        onClick={() => setContextRailOpen(true)}
        ref={contextTriggerRef}
        aria-haspopup="dialog"
      >
        <BookOpen aria-hidden="true" />
        Reference
      </Button>

      <ProposalActionConfirmDialog
        open={confirmDialogOpen}
        onConfirm={handleConfirmSubmit}
        onCancel={() => setConfirmDialogOpen(false)}
        title="Submit this proposal?"
        message={`It goes up for a vote with ${queuedActions.length} action${queuedActions.length === 1 ? '' : 's'}. Your wallet will show the final transaction before you sign.`}
        confirmLabel="Submit proposal"
        busy={transactionBusy}
      />
    </>
  );
}
