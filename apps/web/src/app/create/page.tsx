// app/create/page.tsx

'use client';

import { ArrowLeft } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Stack } from 'styled-system/jsx';

import {
  ArtworkStep,
  AuctionStep,
  BasicInfoStep,
  DeploymentProgress,
  FoundersStep,
  GovernanceStep,
  ReviewStep
} from '@/components/create-dao';
import { Badge, Button, Callout } from '@/components/ui';
import type { CreateDaoFormData } from '@/lib/dao-creation-params';
import { getDeploymentConfig } from '@/lib/deployment-config';
import { useDaoDeployment } from '@/lib/use-dao-deployment';
import {
  selectCanProceedToStep2,
  selectCanProceedToStep3,
  selectCanProceedToStep4,
  selectCanProceedToStep5,
  selectCanProceedToStep6,
  useCreateDaoStore
} from '@/stores/create-dao-store';
import { useDaoSessionStore } from '@/stores/dao-session-store';

export default function CreateDaoPage() {
  const router = useRouter();
  const session = useDaoSessionStore();

  // Store hooks
  const step = useCreateDaoStore((s) => s.step);
  const basicInfo = useCreateDaoStore((s) => s.basicInfo);
  const artwork = useCreateDaoStore((s) => s.artwork);
  const auction = useCreateDaoStore((s) => s.auction);
  const governance = useCreateDaoStore((s) => s.governance);
  const founders = useCreateDaoStore((s) => s.founders);
  const launchAdmin = useCreateDaoStore((s) => s.launchAdmin);

  const setStep = useCreateDaoStore((s) => s.setStep);
  const nextStep = useCreateDaoStore((s) => s.nextStep);
  const prevStep = useCreateDaoStore((s) => s.prevStep);
  const reset = useCreateDaoStore((s) => s.reset);

  // Validation selectors
  const canProceedToStep2 = useCreateDaoStore(selectCanProceedToStep2);
  const canProceedToStep3 = useCreateDaoStore(selectCanProceedToStep3);
  const canProceedToStep4 = useCreateDaoStore(selectCanProceedToStep4);
  const canProceedToStep5 = useCreateDaoStore(selectCanProceedToStep5);
  const canProceedToStep6 = useCreateDaoStore(selectCanProceedToStep6);

  const canSubmit = canProceedToStep6 && launchAdmin.trim().length > 0;

  // Deployment state
  const [isDeploying, setIsDeploying] = useState(false);
  const { state: deploymentState, deployDao, reset: resetDeployment } = useDaoDeployment(session.address || '');

  // Network config
  const networkName = getDeploymentConfig().name;

  const handleProceedToStep2 = () => {
    if (canProceedToStep2) {
      nextStep();
    }
  };

  const handleProceedToStep3 = () => {
    if (canProceedToStep3) {
      nextStep();
    }
  };

  const handleProceedToStep4 = () => {
    if (canProceedToStep4) {
      nextStep();
    }
  };

  const handleProceedToStep5 = () => {
    if (canProceedToStep5) {
      nextStep();
    }
  };

  const handleProceedToStep6 = () => {
    if (canProceedToStep6) {
      nextStep();
    }
  };

  const handleSubmit = async () => {
    if (!session.address || !canSubmit) return;

    setIsDeploying(true);

    try {
      // Build form data
      const formData: CreateDaoFormData = {
        basicInfo,
        artwork,
        auction,
        governance,
        founders,
        launchAdmin
      };

      // Deploy DAO
      const addresses = await deployDao(formData);

      // Redirect to new DAO page
      if (addresses) {
        router.push(`/dao/${addresses.token}`);
      }
    } catch (err) {
      console.error('Deployment failed:', err);
      // Error is shown in DeploymentProgress component
    }
  };

  const handleCloseDeployment = () => {
    resetDeployment();
    setIsDeploying(false);
    reset();
    router.push('/');
  };

  const handleCancel = () => {
    if (confirm('Are you sure you want to cancel? All progress will be lost.')) {
      reset();
      router.push('/');
    }
  };

  return (
    <div className="page-shell">
      <div className="app-frame discovery-frame">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>

        <header className="discovery-header">
          <Link className="brand-lockup" href="/" aria-label="Stellar DAO directory">
            <Image className="brand-mark" src="/icon.svg" alt="" aria-hidden="true" width={44} height={44} priority />
            <div className="brand-copy">
              <p className="brand-name">Stellar DAOs</p>
              <p className="brand-kicker">Governance directory</p>
            </div>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <Link href="/" className="nav-link">
              <ArrowLeft aria-hidden="true" size={16} strokeWidth={2} />
              Back to Directory
            </Link>
            <div className="discovery-header__context">
              <span className="network-dot" aria-hidden="true" />
              <span>{getDeploymentConfig().name}</span>
            </div>
          </div>
        </header>

        <main id="main-content" className="discovery-main" tabIndex={-1}>
          <section className="discovery-hero" aria-labelledby="discovery-title">
            <div className="discovery-hero__copy">
              <p className="eyebrow">DAO creation wizard</p>
              <h1 className="page-title" id="discovery-title">
                {!session.address ? 'Connect your wallet to get started' : 'Create a new DAO'}
              </h1>
              <p className="lede">
                {!session.address
                  ? 'Please connect your wallet to create a DAO. You will be the deployer and need to sign transactions.'
                  : 'Configure and deploy a new DAO on Stellar with governance tokens, auctions, and on-chain voting.'}
              </p>
            </div>
            <div className="discovery-hero__signal" aria-label="Creation progress">
              <span className="label">{isDeploying ? 'Deployment status' : 'Wizard progress'}</span>
              <strong>
                {isDeploying
                  ? deploymentState.progress.currentStepLabel
                  : !session.address
                    ? 'Wallet required'
                    : `Step ${step} of 6`}
              </strong>
              <span>
                {isDeploying
                  ? `${deploymentState.progress.currentStepIndex} of ${deploymentState.progress.totalSteps} steps`
                  : !session.address
                    ? 'Connect to proceed'
                    : 'Multi-step wizard'}
              </span>
            </div>
          </section>

          {!session.address ? (
            <Callout
              variant="warning"
              title="Wallet Required"
              description="Please connect your wallet to create a DAO. You'll need to be the deployer address and sign multiple transactions."
            />
          ) : (
            <Stack gap="6">
              {/* Wizard Steps */}
              <div className="stepper" aria-label={`DAO creation, step ${step} of 6`}>
                <Badge style={{ opacity: step === 1 ? 1 : 0.5, cursor: 'pointer' }} onClick={() => setStep(1)}>
                  1. Basic Info
                </Badge>
                <div className="stepper-line" aria-hidden="true" />
                <Badge style={{ opacity: step === 2 ? 1 : 0.5, cursor: 'pointer' }} onClick={() => setStep(2)}>
                  2. Artwork
                </Badge>
                <div className="stepper-line" aria-hidden="true" />
                <Badge style={{ opacity: step === 3 ? 1 : 0.5, cursor: 'pointer' }} onClick={() => setStep(3)}>
                  3. Auction
                </Badge>
                <div className="stepper-line" aria-hidden="true" />
                <Badge style={{ opacity: step === 4 ? 1 : 0.5, cursor: 'pointer' }} onClick={() => setStep(4)}>
                  4. Governance
                </Badge>
                <div className="stepper-line" aria-hidden="true" />
                <Badge style={{ opacity: step === 5 ? 1 : 0.5, cursor: 'pointer' }} onClick={() => setStep(5)}>
                  5. Founders
                </Badge>
                <div className="stepper-line" aria-hidden="true" />
                <Badge style={{ opacity: step === 6 ? 1 : 0.5, cursor: 'pointer' }} onClick={() => setStep(6)}>
                  6. Review
                </Badge>
              </div>

              {/* Step 1: Basic Information */}
              {step === 1 && (
                <Stack gap="4">
                  <BasicInfoStep />
                  <div className="form-actions form-actions--split">
                    <Button variant="outline" onClick={handleCancel}>
                      Cancel
                    </Button>
                    <Button onClick={handleProceedToStep2} disabled={!canProceedToStep2}>
                      Continue to Artwork
                    </Button>
                  </div>
                </Stack>
              )}

              {/* Step 2: Artwork Configuration */}
              {step === 2 && (
                <Stack gap="4">
                  <ArtworkStep />
                  <div className="form-actions form-actions--split">
                    <Button variant="outline" onClick={prevStep}>
                      Back to Basic Info
                    </Button>
                    <Button onClick={handleProceedToStep3} disabled={!canProceedToStep3}>
                      Continue to Auction
                    </Button>
                  </div>
                </Stack>
              )}

              {/* Step 3: Auction Settings */}
              {step === 3 && (
                <Stack gap="4">
                  <AuctionStep />
                  <div className="form-actions form-actions--split">
                    <Button variant="outline" onClick={prevStep}>
                      Back to Artwork
                    </Button>
                    <Button onClick={handleProceedToStep4} disabled={!canProceedToStep4}>
                      Continue to Governance
                    </Button>
                  </div>
                </Stack>
              )}

              {/* Step 4: Governance Parameters */}
              {step === 4 && (
                <Stack gap="4">
                  <GovernanceStep />
                  <div className="form-actions form-actions--split">
                    <Button variant="outline" onClick={prevStep}>
                      Back to Auction
                    </Button>
                    <Button onClick={handleProceedToStep5} disabled={!canProceedToStep5}>
                      Continue to Founders
                    </Button>
                  </div>
                </Stack>
              )}

              {/* Step 5: Founder Allocations */}
              {step === 5 && (
                <Stack gap="4">
                  <FoundersStep />
                  <div className="form-actions form-actions--split">
                    <Button variant="outline" onClick={prevStep}>
                      Back to Governance
                    </Button>
                    <Button onClick={handleProceedToStep6} disabled={!canProceedToStep6}>
                      Continue to Review
                    </Button>
                  </div>
                </Stack>
              )}

              {/* Step 6: Review & Submit */}
              {step === 6 && !isDeploying && (
                <Stack gap="4">
                  <Callout
                    variant="warning"
                    badge="Blockchain Transaction"
                    title="Creating a DAO requires multiple on-chain transactions"
                    description="Your wallet will prompt you to sign several transactions. This process may take a few minutes to complete. Make sure you have enough XLM for transaction fees."
                  />

                  <ReviewStep />

                  <div className="form-actions form-actions--split">
                    <Button variant="outline" onClick={prevStep}>
                      Back to Founders
                    </Button>
                    <Button onClick={handleSubmit} disabled={!canSubmit}>
                      Create DAO
                    </Button>
                  </div>
                </Stack>
              )}

              {/* Deployment Progress */}
              {isDeploying && (
                <DeploymentProgress state={deploymentState} network={networkName} onCancel={handleCloseDeployment} />
              )}
            </Stack>
          )}
        </main>

        <footer className="app-footer discovery-footer">
          <span>Built for transparent, community-owned coordination.</span>
          <span>DAO creation on Stellar</span>
        </footer>
      </div>
    </div>
  );
}
