// components/create-dao/DeploymentProgress.tsx

'use client';

import { Check, ExternalLink, LoaderCircle, X } from 'lucide-react';
import { Stack } from 'styled-system/jsx';

import { Button, Callout, Card, Heading, Text } from '@/components/ui';
import { getExplorerTxUrl } from '@/lib/explorer-links';
import type { DeploymentState, DeploymentStep } from '@/lib/use-dao-deployment';

interface DeploymentProgressProps {
  state: DeploymentState;
  network: string;
  onCancel?: () => void;
}

type StepStatus = 'pending' | 'active' | 'completed' | 'error';

const DEPLOYMENT_STEPS: Array<{ key: DeploymentStep; label: string; description: string }> = [
  {
    key: 'predicting',
    label: 'Predict Addresses',
    description: 'Calculating contract addresses'
  },
  {
    key: 'creating',
    label: 'Create DAO',
    description: 'Deploying contracts to blockchain'
  },
  {
    key: 'accepting-ownership',
    label: 'Accept Ownership',
    description: 'Taking ownership of token contract'
  },
  {
    key: 'adding-properties',
    label: 'Configure Metadata',
    description: 'Setting up artwork properties'
  },
  {
    key: 'minting-founders',
    label: 'Mint Allocations',
    description: 'Distributing founder tokens'
  },
  {
    key: 'finalizing',
    label: 'Finalize DAO',
    description: 'Transferring ownership to treasury'
  },
  {
    key: 'indexing',
    label: 'Index DAO',
    description: 'Waiting for blockchain confirmation'
  }
];

function getStepStatus(
  step: DeploymentStep,
  currentStep: DeploymentStep,
  completedSteps: Set<DeploymentStep>,
  error: Error | null
): StepStatus {
  if (error && step === currentStep) return 'error';
  if (completedSteps.has(step)) return 'completed';
  if (step === currentStep) return 'active';
  return 'pending';
}

export function DeploymentProgress({ state, network, onCancel }: DeploymentProgressProps) {
  const { currentStep, completedSteps, transactions, progress, error, predictedAddresses, createdAddresses } = state;

  const progressPercent = (progress.currentStepIndex / progress.totalSteps) * 100;
  const isComplete = currentStep === 'complete';
  const isFailed = currentStep === 'error';
  const isDeploying = !isComplete && !isFailed;

  return (
    <Card p="6">
      <Stack gap="6">
        {/* Header */}
        <div>
          <Heading as="h2" style={{ fontSize: '1.5rem', marginBottom: '8px' }}>
            {isComplete ? 'DAO Created Successfully!' : isFailed ? 'Deployment Failed' : 'Deploying DAO...'}
          </Heading>
          <Text style={{ color: 'var(--gray-11)' }}>{progress.currentStepLabel}</Text>
        </div>

        {/* Progress Bar */}
        <div
          style={{
            width: '100%',
            height: '8px',
            background: 'var(--gray-4)',
            borderRadius: '4px',
            overflow: 'hidden'
          }}
        >
          <div
            style={{
              width: `${progressPercent}%`,
              height: '100%',
              background: isFailed ? 'var(--error-9)' : isComplete ? 'var(--success-9)' : 'var(--accent-9)',
              transition: 'width 0.3s ease'
            }}
          />
        </div>

        {/* Step Progress */}
        <Text style={{ fontSize: '0.875rem', color: 'var(--gray-11)' }}>
          Step {progress.currentStepIndex} of {progress.totalSteps}
        </Text>

        {/* Error Message */}
        {error && (
          <Callout
            variant="error"
            title="Deployment Failed"
            description={error.message || 'An unexpected error occurred during deployment'}
          />
        )}

        {/* Steps List */}
        <Stack gap="3">
          {DEPLOYMENT_STEPS.map((step) => {
            const status = getStepStatus(step.key, currentStep, completedSteps, error);
            const txHash = getTxHashForStep(step.key, transactions);

            return (
              <Card
                key={step.key}
                p="4"
                style={{
                  background: status === 'active' ? 'var(--accent-2)' : 'var(--gray-2)',
                  border: `1px solid ${status === 'active' ? 'var(--accent-6)' : status === 'error' ? 'var(--error-6)' : 'var(--gray-6)'}`
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {/* Status Icon */}
                  <div style={{ flexShrink: 0 }}>
                    {status === 'completed' && (
                      <div
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          background: 'var(--success-9)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <Check size={14} color="white" />
                      </div>
                    )}
                    {status === 'active' && <LoaderCircle size={24} className="is-spinning" color="var(--accent-9)" />}
                    {status === 'error' && (
                      <div
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          background: 'var(--error-9)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <X size={14} color="white" />
                      </div>
                    )}
                    {status === 'pending' && (
                      <div
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          border: '2px solid var(--gray-6)'
                        }}
                      />
                    )}
                  </div>

                  {/* Step Info */}
                  <div style={{ flex: 1 }}>
                    <Text style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{step.label}</Text>
                    <Text style={{ color: 'var(--gray-11)', fontSize: '0.875rem' }}>{step.description}</Text>
                  </div>

                  {/* Transaction Link */}
                  {txHash && (
                    <a
                      href={getExplorerTxUrl(network as any, txHash)}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        color: 'var(--accent-11)',
                        fontSize: '0.875rem',
                        textDecoration: 'none'
                      }}
                    >
                      View TX
                      <ExternalLink size={14} />
                    </a>
                  )}
                </div>
              </Card>
            );
          })}
        </Stack>

        {/* Contract Addresses */}
        {(predictedAddresses || createdAddresses) && (
          <Card p="4" style={{ background: 'var(--gray-2)', border: '1px solid var(--gray-6)' }}>
            <Stack gap="3">
              <Text style={{ fontWeight: 600, fontSize: '0.9375rem' }}>
                {createdAddresses ? 'DAO Contract Addresses' : 'Predicted Addresses'}
              </Text>
              {(createdAddresses || predictedAddresses)! && (
                <Stack gap="2">
                  <AddressRow label="Token" address={(createdAddresses || predictedAddresses)!.token} />
                  <AddressRow label="Governor" address={(createdAddresses || predictedAddresses)!.governor} />
                  <AddressRow label="Treasury" address={(createdAddresses || predictedAddresses)!.treasury} />
                  <AddressRow label="Metadata" address={(createdAddresses || predictedAddresses)!.metadata} />
                  <AddressRow label="Auction" address={(createdAddresses || predictedAddresses)!.auction} />
                </Stack>
              )}
            </Stack>
          </Card>
        )}

        {/* Actions */}
        {isComplete && (
          <Callout
            variant="success"
            title="DAO Created Successfully"
            description="Your DAO has been deployed and is now operational. Redirecting to your DAO page..."
          />
        )}

        {isFailed && onCancel && (
          <div className="form-actions">
            <Button variant="outline" onClick={onCancel}>
              Close
            </Button>
          </div>
        )}

        {isDeploying && (
          <Callout
            variant="info"
            title="Deployment in Progress"
            description="Please keep this page open and confirm each transaction in your wallet when prompted. This process may take a few minutes."
          />
        )}
      </Stack>
    </Card>
  );
}

function getTxHashForStep(step: DeploymentStep, transactions: DeploymentState['transactions']): string | undefined {
  switch (step) {
    case 'creating':
      return transactions.create;
    case 'accepting-ownership':
      return transactions.acceptOwnership;
    case 'adding-properties':
      return transactions.addProperties;
    case 'minting-founders':
      return transactions.founderMints[0]; // Show first mint tx
    case 'finalizing':
      return transactions.finalize;
    default:
      return undefined;
  }
}

function AddressRow({ label, address }: { label: string; address: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
      <Text style={{ fontSize: '0.875rem', color: 'var(--gray-11)' }}>{label}</Text>
      <Text
        style={{
          fontSize: '0.8125rem',
          fontFamily: 'monospace',
          maxWidth: '60%',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}
      >
        {address}
      </Text>
    </div>
  );
}
