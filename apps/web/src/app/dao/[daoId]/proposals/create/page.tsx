// New simplified proposals/create page using the new architecture

'use client';

import { Client as GovernorClient } from '@builder-stellar/governor-bindings';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { BookOpen, ChevronLeft, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import { css } from 'styled-system/css';

import { DiscardDraftDialog } from '@/components/drafts/discard-draft-dialog';
import { ProposalActionConfirmDialog } from '@/components/proposal/proposal-action-confirm-dialog';
import { ProposalContextRail } from '@/components/proposal/proposal-context-rail';
import { SettingValuesContext } from '@/components/proposal-actions/setting-forms';
import {
  ActionBar,
  Button,
  ButtonLink,
  Callout,
  Field,
  FieldHelperText,
  FieldLabel,
  Input,
  Markdown,
  MarkdownField,
  PageHeader,
  ProgressSteps,
  Section,
  Skeleton
} from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { daoRoute } from '@/lib/dao-routes';
import { MAX_PROPOSAL_ACTIONS, validateProposalActionCount } from '@/lib/governance-limits';
import { createCallsIn, resolvePendingModules } from '@/lib/modules/pending';
import { ActionFormProvider, ActionPickerSheet, ProposalActionQueue } from '@/lib/proposal-actions';
import { applyWhatThisDoes, suggestTitle, WHAT_THIS_DOES_HEADING } from '@/lib/proposal-actions/compose-metadata';
import { actionCountText } from '@/lib/proposal-actions/queue';
import { analyzeDraft } from '@/lib/proposal-actions/review';
import { reviewGapText, reviewReadiness } from '@/lib/proposal-actions/review-readiness';
import { useSettingValues } from '@/lib/proposal-actions/use-setting-values';
import { buildProposalCallVectors, encodeProposalCallArgs } from '@/lib/proposal-call';
import { useProposalEligibility } from '@/lib/proposal-eligibility';
import { proposalIdToRouteId } from '@/lib/proposal-id';
import {
  encodeProposalMetadata,
  PROPOSAL_DESCRIPTION_MAX_BYTES,
  proposalDescriptionBytes,
  validateProposalMetadataDraft
} from '@/lib/proposal-metadata';
import { markRecentProposal } from '@/lib/recent-proposal';
import { restoreArchivedState } from '@/lib/restore-archived-client';
import { waitForConfirmation } from '@/lib/transaction-confirmation';
import { useTransactionFeedback } from '@/lib/transaction-feedback';
import { signWithWallet } from '@/lib/wallet-sign';
import { useAuthSessionStore } from '@/stores/auth-session-store';
import { selectDraft, selectHasDraft, useProposalComposerStore } from '@/stores/proposal-composer-store';

const layout = css({
  display: 'grid',
  gap: '8',
  lg: { gridTemplateColumns: 'minmax(0, 1fr) 340px', alignItems: 'start' },
  xl: { gridTemplateColumns: 'minmax(0, 1fr) 380px' }
});
const mainColumn = css({ display: 'grid', gap: '2', minW: '0', maxW: '720px' });
const back = css({ ml: '-3' });
const topRow = css({ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '2' });
const stack = css({ display: 'grid', gap: '5' });
const actions = css({ display: 'flex', justifyContent: 'space-between', gap: '2', pt: '2' });
const review = css({ display: 'grid', gap: '3', p: '5', borderRadius: 'card', bg: 'surface', boxShadow: 'raised' });
const reviewTitle = css({ textStyle: 'title', fontSize: '1.375rem', m: '0' });
const reviewLink = css({ textStyle: 'label', color: 'signal', overflowWrap: 'anywhere' });
const reviewHeading = css({ textStyle: 'label', color: 'ink.muted', m: '0', mt: '2' });
const suggestion = css({ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2' });
const wideOnly = css({ display: { base: 'none', md: 'block' } });
const gap = css({ textStyle: 'caption', color: 'ink.muted', m: '0', textAlign: { md: 'right' } });
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
  const [openingProposal, setOpeningProposal] = useState(false);
  const [confirmedProposalHref, setConfirmedProposalHref] = useState<ReturnType<typeof daoRoute> | null>(null);
  const session = useAuthSessionStore();
  const { daoConfig: config } = useDaoContext();

  // Zustand store hooks
  const draft = useProposalComposerStore(selectDraft(session.address || null, daoId));
  const { step, metadata, queuedActions, editingState } = draft;
  const hasDraft = useProposalComposerStore(selectHasDraft(session.address || null, daoId));

  const setStep = useProposalComposerStore((s) => s.setStep);
  const updateMetadata = useProposalComposerStore((s) => s.updateMetadata);
  const reset = useProposalComposerStore((s) => s.reset);
  const settingValues = useSettingValues();
  const [pickerOpen, setPickerOpen] = useState(false);

  // Queries
  const eligibility = useProposalEligibility(config, session.address);

  // Transaction feedback
  const txFeedback = useTransactionFeedback(config.name);
  const [transactionBusy, setTransactionBusy] = useState(false);

  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [contextRailOpen, setContextRailOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const contextTriggerRef = useRef<HTMLButtonElement>(null);
  const closeContextRail = useCallback(() => setContextRailOpen(false), []);

  const proposalCreationError = eligibility.error?.message;
  // Governor propose fails with NotLive until the DAO is launched.
  const isPendingLaunch = config.status === 'pending';
  const proposalCreationLocked = !eligibility.eligible || isPendingLaunch;
  const proposalCreationDisabledMessage = isPendingLaunch
    ? 'Proposals open once your tribe launches.'
    : eligibility.message;
  // The Governor accepts at most MAX_PROPOSAL_ACTIONS (20) actions per proposal.
  const actionCountError = validateProposalActionCount(queuedActions.length);
  const allDraftFindings = analyzeDraft(queuedActions, config);
  const draftFindings = allDraftFindings.filter((finding) => finding.severity === 'error');
  const hasBlockingDraftFindings = draftFindings.length > 0;
  // Ordering problems still submit, but the vote would fail at execution, so say so before signing.
  const orderWarnings = [...new Set(allDraftFindings.filter((f) => f.kind === 'order').map((f) => f.message))];

  // Metadata validation
  const metadataValidation = validateProposalMetadataDraft(metadata);
  const descriptionBytes = proposalDescriptionBytes(metadata);

  const readiness = reviewReadiness(metadata, queuedActions);
  const readinessText = reviewGapText(readiness);

  const suggestedTitle = suggestTitle(queuedActions);
  const whatItDoes = applyWhatThisDoes(queuedActions, metadata);
  const hasWhatItDoes = metadata.description.includes(WHAT_THIS_DOES_HEADING);

  // The why and the changes are one page, written in either order. Nothing is filled in for the member.
  const handleReview = () => {
    if (readiness.ready) setStep(session.address, daoId, 2);
  };

  const handleOpenConfirmDialog = () => {
    setConfirmDialogOpen(true);
  };

  const handleConfirmSubmit = async () => {
    if (!session.address) return;
    let confirmedHref: ReturnType<typeof daoRoute> | null = null;

    try {
      setTransactionBusy(true);
      setConfirmDialogOpen(false);
      txFeedback.start('Submitting your proposal');

      // Build call vectors
      const { targets, functions, args } = buildProposalCallVectors(
        queuedActions,
        config.tokenContractId,
        config.treasuryContractId,
        config
      );

      // A module this proposal adds is called before it exists. Its address is the Manager's own
      // prediction, read now, and the draft's address must match it or the later steps would
      // call somewhere else.
      const pendingModules = await resolvePendingModules(
        config,
        createCallsIn(targets, functions, args, config.tokenContractId)
      );
      for (const queued of queuedActions)
        if (queued.type === 'create-module' && !pendingModules[String(queued.address)])
          throw new Error(
            'The new module’s address no longer matches what the Manager predicts. Add it again from Manage → Membership.'
          );

      // Encode args and metadata
      const encodedArgs = encodeProposalCallArgs(targets, functions, args, { ...config, pendingModules });
      const description = encodeProposalMetadata(metadata);

      // Create governor client
      const governor = new GovernorClient({
        contractId: config.governorContractId,
        rpcUrl: config.rpcUrl,
        networkPassphrase: config.passphrase,
        publicKey: session.address,
        ...restoreArchivedState,
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

      txFeedback.submitted('Proposal sent', hash);
      await waitForConfirmation(hash, config.rpcUrl);

      confirmedHref = proposalId ? daoRoute(routeId, `proposals/${proposalId}`) : daoRoute(routeId, 'proposals');
      setConfirmedProposalHref(confirmedHref);
      txFeedback.success('Proposal created', hash);

      // Keep a loading surface mounted while clearing the draft and navigating.
      setOpeningProposal(true);
      if (proposalId) markRecentProposal(daoId, proposalId);
      reset(session.address, daoId);
      router.push(confirmedHref);
    } catch (err: any) {
      setOpeningProposal(false);
      console.error('Proposal creation error:', err);
      if (!confirmedHref) txFeedback.fail(err, 'Proposal failed', 'governor');
    } finally {
      setTransactionBusy(false);
    }
  };

  const steps = [
    { id: 'write', label: 'Write' },
    { id: 'review', label: 'Review' }
  ];

  if (openingProposal)
    return (
      <div role="status" aria-busy="true" className={stack}>
        <PageHeader title="Opening your proposal" />
        <Skeleton className={css({ height: '40', borderRadius: 'card' })} />
        <p>Your proposal is confirmed. Loading its details…</p>
        {confirmedProposalHref ? <ButtonLink href={confirmedProposalHref}>Open proposal</ButtonLink> : null}
      </div>
    );

  if (confirmedProposalHref)
    return (
      <div className={stack}>
        <PageHeader title="Your proposal was created" />
        <Callout
          variant="warning"
          title="We couldn't open it automatically"
          description="Your transaction is confirmed. Open the proposal below; its details may take a moment to appear."
        />
        <ButtonLink href={confirmedProposalHref}>Open proposal</ButtonLink>
      </div>
    );

  return (
    <>
      <div className={layout}>
        <div className={mainColumn}>
          <div className={topRow}>
            <ButtonLink href={daoRoute(routeId, 'proposals')} variant="ghost" size="sm" className={back}>
              <ChevronLeft aria-hidden="true" />
              All proposals
            </ButtonLink>
            {hasDraft && session.address ? (
              <Button variant="ghost" size="sm" disabled={transactionBusy} onClick={() => setDiscardOpen(true)}>
                <Trash2 aria-hidden="true" />
                Discard draft
              </Button>
            ) : null}
          </div>
          <DiscardDraftDialog
            open={discardOpen}
            title={draft.metadata.title.trim() || 'Untitled proposal'}
            onCancel={() => setDiscardOpen(false)}
            onDiscard={() => {
              setDiscardOpen(false);
              reset(session.address, daoId);
              router.push(daoRoute(routeId, 'proposals'));
            }}
          />
          <PageHeader
            title={hasDraft ? 'Your proposal' : 'New proposal'}
            meta="Say why, add what changes, then sign. Changes you add from Manage, Treasury or Claims land here too. Drafts save on this browser."
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
                  onSelect={(index) => setStep(session.address, daoId, (index + 1) as 1 | 2)}
                  canSelect={(index) => index === 0 || readiness.ready}
                />

                {step === 1 && (
                  <div className={stack}>
                    <Field>
                      <FieldLabel htmlFor="title">Title (required)</FieldLabel>
                      <Input
                        id="title"
                        required
                        value={metadata.title}
                        onChange={(e) => updateMetadata(session.address, daoId, { title: e.target.value })}
                        placeholder={suggestedTitle || 'Fund the winter tool library'}
                      />
                      {suggestedTitle && metadata.title.trim() !== suggestedTitle ? (
                        <div className={suggestion}>
                          <FieldHelperText>Suggested from the changes: {suggestedTitle}</FieldHelperText>
                          <Button
                            variant="link"
                            size="sm"
                            onClick={() => updateMetadata(session.address, daoId, { title: suggestedTitle })}
                          >
                            Use it
                          </Button>
                        </div>
                      ) : null}
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="description">Why</FieldLabel>
                      <MarkdownField
                        id="description"
                        value={metadata.description}
                        onChange={(description) => updateMetadata(session.address, daoId, { description })}
                        placeholder="The problem, who it helps, and what it costs"
                        rows={9}
                        canUpload={session.authStatus === 'authenticated'}
                        invalid={descriptionBytes > PROPOSAL_DESCRIPTION_MAX_BYTES}
                        describedBy="description-budget"
                      />
                      <FieldHelperText
                        id="description-budget"
                        tone={descriptionBytes > PROPOSAL_DESCRIPTION_MAX_BYTES ? 'error' : undefined}
                      >
                        Required. Up to {PROPOSAL_DESCRIPTION_MAX_BYTES.toLocaleString()} bytes (
                        {descriptionBytes.toLocaleString()} used).
                      </FieldHelperText>
                      {queuedActions.length && whatItDoes !== metadata.description ? (
                        <div>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => updateMetadata(session.address, daoId, { description: whatItDoes })}
                          >
                            <Sparkles aria-hidden="true" />
                            {hasWhatItDoes ? 'Update “What this does”' : 'Add “What this does” from the changes'}
                          </Button>
                        </div>
                      ) : null}
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
                    <ActionFormProvider config={config} session={{ address: session.address, kit: StellarWalletsKit }}>
                      <SettingValuesContext.Provider value={settingValues.values}>
                        <Section
                          title={
                            queuedActions.length
                              ? `In this proposal (${actionCountText(queuedActions)})`
                              : 'In this proposal'
                          }
                          description={`Up to ${MAX_PROPOSAL_ACTIONS} actions. They run in order, all together, only if the vote passes.`}
                          level={3}
                        >
                          <div className={stack}>
                            {actionCountError ? <Callout variant="error" title={actionCountError} /> : null}
                            <ProposalActionQueue daoId={daoId} />
                            <div>
                              <Button
                                variant="secondary"
                                onClick={() => setPickerOpen(true)}
                                disabled={queuedActions.length >= MAX_PROPOSAL_ACTIONS || Boolean(editingState)}
                              >
                                <Plus aria-hidden="true" />
                                Add a change
                              </Button>
                            </div>
                          </div>
                        </Section>
                        <ActionPickerSheet daoId={daoId} open={pickerOpen} onOpenChange={setPickerOpen} />
                      </SettingValuesContext.Provider>
                    </ActionFormProvider>
                    <div className={actions}>
                      <Button variant="ghost" onClick={() => router.back()}>
                        Cancel
                      </Button>
                      <div className={wideOnly}>
                        <Button onClick={handleReview} disabled={!readiness.ready}>
                          Next: review
                        </Button>
                      </div>
                    </div>
                    {readinessText ? (
                      <p className={gap} role="status">
                        {readinessText}
                      </p>
                    ) : null}
                    <ActionBar mobileOnly>
                      <Button
                        variant="secondary"
                        onClick={() => setContextRailOpen(true)}
                        ref={contextTriggerRef}
                        aria-haspopup="dialog"
                      >
                        <BookOpen aria-hidden="true" />
                        Reference
                      </Button>
                      <Button onClick={handleReview} disabled={!readiness.ready}>
                        Next: review
                      </Button>
                    </ActionBar>
                  </div>
                )}

                {step === 2 && (
                  <div className={stack}>
                    {actionCountError ? (
                      <Callout variant="error" badge="Fix before submitting" title={actionCountError} />
                    ) : null}
                    {!metadataValidation.valid ? (
                      <Callout variant="error" badge="Fix before submitting" title={metadataValidation.message} />
                    ) : null}
                    {hasBlockingDraftFindings ? (
                      <Callout
                        variant="error"
                        badge="Fix before submitting"
                        title="Some changes repeat or clash"
                        description="Go back and remove or replace the flagged change."
                      />
                    ) : null}
                    {orderWarnings.map((message) => (
                      <Callout
                        key={message}
                        variant="warning"
                        title="Check the order of changes"
                        description={message}
                      />
                    ))}
                    <section className={review} aria-label="Proposal preview">
                      <h2 className={reviewTitle}>{metadata.title}</h2>
                      <Markdown source={metadata.description} variant="rich" />
                      {metadata.url ? (
                        <a href={metadata.url} target="_blank" rel="noreferrer" className={reviewLink}>
                          {metadata.url}
                        </a>
                      ) : null}
                      <h3 className={reviewHeading}>
                        {queuedActions.length === 1 ? 'If it passes, this runs' : 'If it passes, these run in order'}
                      </h3>
                      <ProposalActionQueue daoId={daoId} variant="review" />
                    </section>
                    <Callout
                      title="Your wallet shows the exact transaction"
                      description="Check the contracts, recipients and amounts there before you sign. Proposing is free; your wallet pays a small network fee."
                    />
                    <div className={actions}>
                      <Button variant="ghost" onClick={() => setStep(session.address, daoId, 1)}>
                        Back
                      </Button>
                      <Button
                        onClick={handleOpenConfirmDialog}
                        disabled={
                          proposalCreationLocked ||
                          hasBlockingDraftFindings ||
                          Boolean(actionCountError) ||
                          !metadataValidation.valid
                        }
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
      {step === 1 ? null : (
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
      )}

      <ProposalActionConfirmDialog
        open={confirmDialogOpen}
        onConfirm={handleConfirmSubmit}
        onCancel={() => setConfirmDialogOpen(false)}
        title="Submit this proposal?"
        message={`It goes to a vote with ${queuedActions.length === 1 ? 'one action' : `${queuedActions.length} actions`}. Your wallet shows the final transaction before you sign.`}
        confirmLabel="Submit proposal"
        busy={transactionBusy}
      />
    </>
  );
}
