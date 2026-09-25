// New simplified proposals/create page using the new architecture

'use client';

import { Client as GovernorClient } from '@builder-stellar/governor-bindings';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import { Grid, Stack } from 'styled-system/jsx';

import { PageSection } from '@/components/page-section';
import { ProposalActionConfirmDialog } from '@/components/proposal/proposal-action-confirm-dialog';
import { ProposalContextRail } from '@/components/proposal/proposal-context-rail';
import { Badge, Button, Callout, Card, Heading, Input, Skeleton, Text, Textarea } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { daoRoute } from '@/lib/dao-routes';
import { ActionFormProvider, ActionFormWrapper, ProposalActionQueue } from '@/lib/proposal-actions';
import { buildProposalCallVectors, encodeProposalCallArgs, getProposalActionSummary } from '@/lib/proposal-call';
import { useProposalEligibility } from '@/lib/proposal-eligibility';
import { proposalIdToRouteId } from '@/lib/proposal-id';
import { encodeProposalMetadata, validateProposalMetadataDraft } from '@/lib/proposal-metadata';
import { waitForConfirmation } from '@/lib/transaction-confirmation';
import { useTransactionFeedback } from '@/lib/transaction-feedback';
import { useDaoSessionStore } from '@/stores/dao-session-store';
import {
  selectCanProceedToStep2,
  selectDraft,
  selectHasDraft,
  useProposalComposerStore
} from '@/stores/proposal-composer-store';

export default function ProposalCreatePage() {
  const { daoId } = useDaoContext();
  const router = useRouter();
  const session = useDaoSessionStore();
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
  const proposalCreationLocked = !eligibility.eligible;
  const proposalCreationDisabledMessage = eligibility.message;

  // Metadata validation
  const metadataValidation = validateProposalMetadataDraft(metadata);

  const handleProceedToStep2 = () => {
    if (metadataValidation.valid) {
      setStep(session.address, daoId, 2);
    }
  };

  const handleProceedToStep3 = () => {
    if (canProceed && queuedActions.length > 0) {
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
      const encodedArgs = encodeProposalCallArgs(functions, args);
      const description = encodeProposalMetadata(metadata);

      // Create governor client
      const governor = new GovernorClient({
        contractId: config.governorContractId,
        rpcUrl: config.rpcUrl,
        networkPassphrase: config.passphrase,
        publicKey: session.address,
        signTransaction: async (xdr: string, opts?: { networkPassphrase?: string; address?: string }) =>
          StellarWalletsKit.signTransaction(xdr, {
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
      router.push(proposalId ? daoRoute(daoId, `proposals/${proposalId}`) : daoRoute(daoId, 'proposals'));
    } catch (err: any) {
      console.error('Proposal creation error:', err);
      txFeedback.fail(err, 'Proposal failed');
    } finally {
      setTransactionBusy(false);
    }
  };

  return (
    <>
      <PageSection
        title="Proposal Studio"
        description="Draft the decision, reference the DAO's current state, and verify every on-chain action before asking the wallet to sign."
      >
        <div className="proposal-studio-layout">
          <Stack gap="6">
            {session.address && eligibility.loading ? (
              <div role="status" aria-live="polite" aria-busy="true" className="loading-card">
                <span className="sr-only">Checking proposal eligibility</span>
                <Card p="4">
                  <Stack gap="2">
                    <Skeleton style={{ width: '190px', height: '1.1em' }} />
                    <Skeleton style={{ width: '320px', maxWidth: '100%', height: '0.9em' }} />
                  </Stack>
                </Card>
              </div>
            ) : proposalCreationError && !hasDraft ? (
              <Callout
                variant="error"
                title="Unable to check proposal eligibility"
                description={proposalCreationError}
              />
            ) : proposalCreationLocked && !hasDraft ? (
              <Callout
                variant="warning"
                title="Cannot Create Proposals"
                description={proposalCreationDisabledMessage}
              />
            ) : (
              <>
                {proposalCreationError ? (
                  <Callout
                    variant="warning"
                    title="Proposal eligibility could not be checked"
                    description={proposalCreationError}
                  />
                ) : null}
                {proposalCreationLocked && !proposalCreationError ? (
                  <Callout
                    variant="warning"
                    title="Proposal submission is currently unavailable"
                    description={proposalCreationDisabledMessage}
                  />
                ) : null}
                {/* Wizard Steps */}
                <div className="stepper" aria-label={`Proposal creation, step ${step} of 3`}>
                  <Badge style={{ opacity: step === 1 ? 1 : 0.5 }}>1. Details</Badge>
                  <div className="stepper-line" aria-hidden="true" />
                  <Badge style={{ opacity: step === 2 ? 1 : 0.5 }}>2. Actions</Badge>
                  <div className="stepper-line" aria-hidden="true" />
                  <Badge style={{ opacity: step === 3 ? 1 : 0.5 }}>3. Review</Badge>
                </div>

                {/* Step 1: Metadata */}
                {step === 1 && (
                  <Stack gap="4">
                    <Card p="5">
                      <Stack gap="4">
                        <Heading as="h2" style={{ fontSize: '1.25rem' }}>
                          Proposal Details
                        </Heading>

                        <Stack gap="2">
                          <label htmlFor="title">
                            <Text style={{ fontWeight: 600 }}>Title</Text>
                          </label>
                          <Input
                            id="title"
                            value={metadata.title}
                            onChange={(e) => updateMetadata(session.address, daoId, { title: e.target.value })}
                            placeholder="Proposal title"
                          />
                          {!metadataValidation.valid && (
                            <Text style={{ color: 'var(--error-9)', fontSize: '0.875rem' }}>
                              {metadataValidation.message}
                            </Text>
                          )}
                        </Stack>

                        <Stack gap="2">
                          <label htmlFor="description">
                            <Text style={{ fontWeight: 600 }}>Description</Text>
                          </label>
                          <Textarea
                            id="description"
                            value={metadata.description}
                            onChange={(e) => updateMetadata(session.address, daoId, { description: e.target.value })}
                            placeholder="Describe what this proposal does"
                            rows={6}
                          />
                        </Stack>

                        <Stack gap="2">
                          <label htmlFor="url">
                            <Text style={{ fontWeight: 600 }}>Discussion URL (optional)</Text>
                          </label>
                          <Input
                            id="url"
                            value={metadata.url}
                            onChange={(e) => updateMetadata(session.address, daoId, { url: e.target.value })}
                            placeholder="https://forum.example.com/proposal-discussion"
                          />
                        </Stack>
                      </Stack>
                    </Card>

                    <div className="form-actions">
                      <Button variant="outline" onClick={() => router.back()}>
                        Cancel
                      </Button>
                      <Button onClick={handleProceedToStep2} disabled={!metadataValidation.valid}>
                        Continue to Actions
                      </Button>
                    </div>
                  </Stack>
                )}

                {/* Step 2: Actions */}
                {step === 2 && (
                  <ActionFormProvider config={config} session={{ address: session.address, kit: StellarWalletsKit }}>
                    <Stack gap="4">
                      <div>
                        <Heading as="h2" style={{ fontSize: '1.25rem', marginBottom: '8px' }}>
                          Proposal Actions
                        </Heading>
                        <Text style={{ color: 'var(--gray-11)', fontSize: '0.875rem' }}>
                          Add one or more actions that will execute if this proposal passes
                        </Text>
                      </div>

                      <Grid columns={{ base: 1, lg: 2 }} gap="6">
                        <Stack gap="4">
                          {!editingState && (
                            <Button onClick={() => beginCreate(session.address, daoId)}>Add Action</Button>
                          )}

                          <ActionFormWrapper daoId={daoId} />
                        </Stack>

                        <Stack gap="4">
                          <Heading as="h3" style={{ fontSize: '1.125rem' }}>
                            Queued Actions ({queuedActions.length})
                          </Heading>
                          <ProposalActionQueue daoId={daoId} />
                        </Stack>
                      </Grid>

                      <div className="form-actions form-actions--split">
                        <Button variant="outline" onClick={() => setStep(session.address, daoId, 1)}>
                          Back to Details
                        </Button>
                        <Button onClick={handleProceedToStep3} disabled={!canProceed || queuedActions.length === 0}>
                          Continue to Review
                        </Button>
                      </div>
                    </Stack>
                  </ActionFormProvider>
                )}

                {/* Step 3: Review */}
                {step === 3 && (
                  <Stack gap="4">
                    <div>
                      <Heading as="h2" style={{ fontSize: '1.25rem', marginBottom: '8px' }}>
                        Review & Submit
                      </Heading>
                      <Text style={{ color: 'var(--gray-11)', fontSize: '0.875rem' }}>
                        Review your proposal details and actions before submitting to the blockchain
                      </Text>
                    </div>

                    <Callout
                      variant="warning"
                      badge="Wallet transaction"
                      title="Submitting creates an on-chain governance proposal"
                      description="Your wallet will show the final transaction for review. Confirm the target contracts, recipients, and amounts before signing."
                    />

                    <Card p="5">
                      <Stack gap="4">
                        <div>
                          <Text style={{ fontSize: '0.875rem', color: 'var(--gray-11)', marginBottom: '4px' }}>
                            Title
                          </Text>
                          <Text style={{ fontWeight: 600, fontSize: '1.125rem' }}>{metadata.title}</Text>
                        </div>

                        <div>
                          <Text style={{ fontSize: '0.875rem', color: 'var(--gray-11)', marginBottom: '4px' }}>
                            Description
                          </Text>
                          <Text style={{ lineHeight: 1.6 }}>{metadata.description}</Text>
                        </div>

                        {metadata.url && (
                          <div>
                            <Text style={{ fontSize: '0.875rem', color: 'var(--gray-11)', marginBottom: '4px' }}>
                              Discussion URL
                            </Text>
                            <a
                              href={metadata.url}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                color: 'var(--accent-11)',
                                textDecoration: 'underline',
                                wordBreak: 'break-all'
                              }}
                            >
                              {metadata.url}
                            </a>
                          </div>
                        )}

                        <div>
                          <Text style={{ fontSize: '0.875rem', color: 'var(--gray-11)', marginBottom: '8px' }}>
                            Actions ({queuedActions.length})
                          </Text>
                          <Stack gap="2">
                            {queuedActions.map((action, i) => (
                              <Card
                                key={action.id}
                                p="3"
                                style={{ background: 'var(--gray-2)', border: '1px solid var(--gray-6)' }}
                              >
                                <Text style={{ fontSize: '0.875rem' }}>
                                  <strong>{i + 1}.</strong> {getProposalActionSummary(action)}
                                </Text>
                              </Card>
                            ))}
                          </Stack>
                        </div>
                      </Stack>
                    </Card>

                    <div className="form-actions form-actions--split">
                      <Button variant="outline" onClick={() => setStep(session.address, daoId, 2)}>
                        Back to Actions
                      </Button>
                      <Button onClick={handleOpenConfirmDialog} disabled={proposalCreationLocked || transactionBusy}>
                        {transactionBusy ? 'Submitting...' : 'Submit Proposal'}
                      </Button>
                    </div>
                  </Stack>
                )}
              </>
            )}
          </Stack>
          <ProposalContextRail
            key={editingState?.actionType ?? 'no-action'}
            activeActionType={editingState?.actionType}
            mobileOpen={contextRailOpen}
            onMobileClose={closeContextRail}
            mobileTriggerRef={contextTriggerRef}
          />
          <Button
            type="button"
            variant="outline"
            className="proposal-context-mobile-trigger"
            onClick={() => setContextRailOpen(true)}
            ref={contextTriggerRef}
            aria-expanded={contextRailOpen}
            aria-controls="proposal-context-rail"
          >
            Reference DAO context
          </Button>
        </div>
      </PageSection>

      {/* Confirm Dialog */}
      <ProposalActionConfirmDialog
        open={confirmDialogOpen}
        onConfirm={handleConfirmSubmit}
        onCancel={() => setConfirmDialogOpen(false)}
        title="Confirm Proposal Creation"
        message="This will submit your proposal to the blockchain. You'll need to sign the transaction with your wallet."
        confirmLabel="Create Proposal"
        busy={transactionBusy}
      />
    </>
  );
}
