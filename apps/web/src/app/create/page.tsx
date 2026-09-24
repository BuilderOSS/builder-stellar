// app/create/page.tsx

'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { Button, Callout, Text } from '@/components/ui';
import { WalletControls } from '@/components/wallet-controls';
import {
  CREATE_DAO_SECTIONS,
  type CreateDaoFormData,
  createDaoSchema,
  type CreateDaoSection,
  sectionSchemas
} from '@/lib/create-dao-schema';
import { getDeploymentConfig, isDeploymentConfigured } from '@/lib/deployment-config';
import { useDaoDeployment } from '@/lib/use-dao-deployment';
import { useCreateDaoStore } from '@/stores/create-dao-store';
import { useDaoSessionStore } from '@/stores/dao-session-store';

type SectionStatus = 'complete' | 'active' | 'error' | 'pending';

function validationField(path: PropertyKey[]) {
  const [section, field, index, nestedField] = path;
  if (section === 'basicInfo') return String(field ?? 'basicInfo');
  if (section === 'artwork') {
    if (field === 'ipfs') return index === 'baseUri' ? 'ipfsBaseUri' : 'ipfsExtension';
    if (field === 'properties' && typeof index === 'number') return `artworkProperty${index}`;
    return 'artworkProperties';
  }
  if (section === 'auction') {
    return (
      (
        {
          duration: 'auctionDuration',
          timeBuffer: 'timeBuffer',
          reservePrice: 'reservePrice',
          paymentAsset: 'paymentAsset'
        } as Record<string, string>
      )[String(field)] ?? 'auction'
    );
  }
  if (section === 'governance') return String(field ?? 'governance');
  if (section === 'founders') {
    if (typeof field === 'number' && nestedField)
      return `founder${field}${String(nestedField).replace(/^./, (value) => value.toUpperCase())}`;
    return 'founders';
  }
  return String(section ?? 'form');
}

function validationSection(path: PropertyKey[]): CreateDaoSection {
  const section = path[0];
  return section === 'basicInfo' ||
    section === 'artwork' ||
    section === 'auction' ||
    section === 'governance' ||
    section === 'founders'
    ? section
    : 'review';
}

function ProgressRail({
  activeSection,
  statuses,
  onSelect
}: {
  activeSection: CreateDaoSection;
  statuses: Record<CreateDaoSection, SectionStatus>;
  onSelect: (section: CreateDaoSection) => void;
}) {
  return (
    <nav className="create-progress" aria-label="DAO creation sections">
      <ol className="create-progress__list">
        {CREATE_DAO_SECTIONS.map((section, index) => {
          const status = statuses[section.id];
          const isActive = activeSection === section.id;
          return (
            <li className="create-progress__item" key={section.id}>
              <button
                className={`create-progress__button${isActive ? ' is-active' : ''}${status === 'complete' ? ' is-complete' : ''}${status === 'error' ? ' is-error' : ''}`}
                type="button"
                onClick={() => onSelect(section.id)}
                aria-current={isActive ? 'step' : undefined}
              >
                <span className="create-progress__marker" aria-hidden="true">
                  {status === 'complete' ? '\u2713' : section.number}
                </span>
                <span className="create-progress__copy">
                  <span className="create-progress__title">{section.title}</span>
                  <span className="create-progress__subtitle">{section.subtitle}</span>
                </span>
              </button>
              {index < CREATE_DAO_SECTIONS.length - 1 && (
                <span className="create-progress__connector" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function AccordionSection({
  section,
  status,
  isOpen,
  onToggle,
  children
}: {
  section: (typeof CREATE_DAO_SECTIONS)[number];
  status: SectionStatus;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const panelId = `create-section-panel-${section.id}`;
  const triggerId = `create-section-trigger-${section.id}`;
  const statusLabel = status === 'complete' ? 'Complete' : status === 'error' ? 'Needs attention' : undefined;

  return (
    <section className={`create-accordion__section${isOpen ? ' is-open' : ''}`} data-section={section.id}>
      <h2 className="create-accordion__heading">
        <button
          className="create-accordion__trigger"
          id={triggerId}
          type="button"
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={onToggle}
        >
          <span className="create-accordion__number" aria-hidden="true">
            {status === 'complete' ? '\u2713' : section.number}
          </span>
          <span className="create-accordion__copy">
            <span className="create-accordion__title">{section.title}</span>
            <span className="create-accordion__subtitle">{section.subtitle}</span>
          </span>
          {statusLabel && <span className={`create-accordion__status is-${status}`}>{statusLabel}</span>}
          <span className="create-accordion__chevron" aria-hidden="true">
            {isOpen ? '\u2212' : '+'}
          </span>
        </button>
      </h2>
      <div className="create-accordion__panel" id={panelId} role="region" aria-labelledby={triggerId} hidden={!isOpen}>
        <div className="create-accordion__body">{children}</div>
      </div>
    </section>
  );
}

export default function CreateDaoPage() {
  const router = useRouter();
  const session = useDaoSessionStore();
  const sectionRefs = useRef<Partial<Record<CreateDaoSection, HTMLElement>>>({});

  const basicInfo = useCreateDaoStore((state) => state.basicInfo);
  const artwork = useCreateDaoStore((state) => state.artwork);
  const auction = useCreateDaoStore((state) => state.auction);
  const governance = useCreateDaoStore((state) => state.governance);
  const founders = useCreateDaoStore((state) => state.founders);
  const validationErrors = useCreateDaoStore((state) => state.validationErrors);
  const setValidationError = useCreateDaoStore((state) => state.setValidationError);
  const clearAllValidationErrors = useCreateDaoStore((state) => state.clearAllValidationErrors);
  const reset = useCreateDaoStore((state) => state.reset);

  const [openSections, setOpenSections] = useState<Set<CreateDaoSection>>(new Set(['basicInfo']));
  const [activeSection, setActiveSection] = useState<CreateDaoSection>('basicInfo');
  const [reviewedSections, setReviewedSections] = useState<Set<CreateDaoSection>>(new Set());
  const [isDeploying, setIsDeploying] = useState(false);
  const deploymentReady = isDeploymentConfigured();
  const networkName = deploymentReady ? getDeploymentConfig().name : 'testnet';
  const {
    state: deploymentState,
    deployDao,
    reset: resetDeployment
  } = useDaoDeployment(session.address || '', networkName);

  useEffect(() => {
    void useCreateDaoStore.persist.rehydrate();
  }, []);

  const formData = useMemo<CreateDaoFormData>(
    () => ({ basicInfo, artwork, auction, governance, founders, launchAdmin: session.address || '' }),
    [artwork, auction, basicInfo, founders, governance, session.address]
  );

  const validationResults = useMemo(
    () => ({
      basicInfo: sectionSchemas.basicInfo.safeParse(formData.basicInfo),
      artwork: sectionSchemas.artwork.safeParse(formData.artwork),
      auction: sectionSchemas.auction.safeParse(formData.auction),
      governance: sectionSchemas.governance.safeParse(formData.governance),
      founders: sectionSchemas.founders.safeParse(formData.founders),
      review: createDaoSchema.safeParse(formData)
    }),
    [formData]
  );

  const allEditableSectionsValid = (['basicInfo', 'artwork', 'auction', 'governance', 'founders'] as const).every(
    (section) => validationResults[section].success
  );
  const canSubmit = allEditableSectionsValid && reviewedSections.size === 5 && validationResults.review.success;

  const statuses = useMemo<Record<CreateDaoSection, SectionStatus>>(() => {
    const getStatus = (section: Exclude<CreateDaoSection, 'review'>): SectionStatus => {
      const storedError = Object.keys(validationErrors).some((key) => {
        if (section === 'basicInfo') {
          return [
            'tokenName',
            'tokenSymbol',
            'description',
            'projectUri',
            'tokenUri',
            'contractImage',
            'rendererBase'
          ].includes(key);
        }
        if (section === 'artwork') {
          return (
            key === 'ipfsBaseUri' ||
            key === 'ipfsExtension' ||
            key === 'artworkProperties' ||
            key.startsWith('artworkProperty')
          );
        }
        if (section === 'auction')
          return ['auctionDuration', 'reservePrice', 'timeBuffer', 'paymentAsset', 'auction'].includes(key);
        if (section === 'governance')
          return ['votingDelay', 'votingPeriod', 'quorumBps', 'proposalThresholdBps', 'governance'].includes(key);
        return key === 'founders' || key.startsWith('founder');
      });
      if (!validationResults[section].success && (reviewedSections.has(section) || storedError)) return 'error';
      if (reviewedSections.has(section)) return 'complete';
      if (openSections.has(section)) return 'active';
      return 'pending';
    };

    return {
      basicInfo: getStatus('basicInfo'),
      artwork: getStatus('artwork'),
      auction: getStatus('auction'),
      governance: getStatus('governance'),
      founders: getStatus('founders'),
      review: canSubmit ? 'complete' : openSections.has('review') ? 'active' : 'pending'
    };
  }, [canSubmit, openSections, reviewedSections, validationErrors, validationResults]);

  const setSectionOpen = (section: CreateDaoSection, open = true) => {
    if (open) setActiveSection(section);
    setOpenSections((current) => {
      const next = new Set(current);
      if (open) next.add(section);
      else next.delete(section);
      return next;
    });
  };

  const selectSection = (section: CreateDaoSection) => {
    setSectionOpen(section);
    window.requestAnimationFrame(() => {
      sectionRefs.current[section]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const markSectionReviewed = (section: Exclude<CreateDaoSection, 'review'>) => {
    const result = validationResults[section];
    if (!result.success) {
      for (const issue of result.error.issues)
        setValidationError(validationField([section, ...issue.path]), issue.message);
      setSectionOpen(section);
      return;
    }

    setReviewedSections((current) => new Set(current).add(section));
    setSectionOpen(section, false);
    const nextSection = CREATE_DAO_SECTIONS[CREATE_DAO_SECTIONS.findIndex((item) => item.id === section) + 1];
    if (nextSection) selectSection(nextSection.id);
  };

  const handleSubmit = async () => {
    clearAllValidationErrors();
    const validation = createDaoSchema.safeParse(formData);
    if (!validation.success) {
      for (const issue of validation.error.issues) {
        setValidationError(validationField(issue.path), issue.message);
      }
      const invalidSections = new Set<CreateDaoSection>();
      for (const issue of validation.error.issues) {
        invalidSections.add(validationSection(issue.path));
      }
      invalidSections.forEach((section) => setSectionOpen(section));
      setSectionOpen('review');
      return;
    }

    if (!session.address || !deploymentReady || !canSubmit) return;
    setIsDeploying(true);

    try {
      const addresses = await deployDao(validation.data);
      if (addresses) router.push(`/dao/${addresses.token}`);
    } catch (error) {
      console.error('Deployment failed:', error);
    }
  };

  const handleCloseDeployment = () => {
    resetDeployment();
    setIsDeploying(false);
    reset();
    router.push('/');
  };

  const fieldErrorCount = Object.keys(validationErrors).length;

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
          <WalletControls />
        </header>

        <main id="main-content" className="discovery-main" tabIndex={-1}>
          <section className="discovery-hero" aria-labelledby="discovery-title">
            <div className="discovery-hero__copy">
              <p className="eyebrow">DAO creation workspace</p>
              <h1 className="page-title" id="discovery-title">
                Build your DAO
              </h1>
              <p className="lede">
                Configure your token, artwork, auctions, and governance in one place. You can revisit any section before
                deployment.
              </p>
            </div>
            <div className="discovery-hero__signal">
              <span className="label">Creation progress</span>
              <strong>{reviewedSections.size} of 5 sections reviewed</strong>
              <span>
                {fieldErrorCount > 0
                  ? `${fieldErrorCount} item${fieldErrorCount === 1 ? '' : 's'} need attention`
                  : 'Draft saved locally'}
              </span>
            </div>
          </section>

          {!deploymentReady ? (
            <Callout
              variant="warning"
              title="Deployment Not Configured"
              description="DAO creation is unavailable because the deployment environment is not configured. Please contact the site administrator."
            />
          ) : !session.address ? (
            <Callout
              variant="warning"
              title="Wallet Required"
              description="Please connect your wallet to create a DAO. You will need to sign multiple transactions."
            />
          ) : isDeploying ? (
            <DeploymentProgress state={deploymentState} network={networkName} onCancel={handleCloseDeployment} />
          ) : (
            <Stack gap="5">
              <ProgressRail activeSection={activeSection} statuses={statuses} onSelect={selectSection} />

              <div className="create-accordion" aria-label="DAO configuration form">
                <div
                  ref={(element) => {
                    sectionRefs.current.basicInfo = element ?? undefined;
                  }}
                >
                  <AccordionSection
                    section={CREATE_DAO_SECTIONS[0]}
                    status={statuses.basicInfo}
                    isOpen={openSections.has('basicInfo')}
                    onToggle={() => setSectionOpen('basicInfo', !openSections.has('basicInfo'))}
                  >
                    <BasicInfoStep />
                    <SectionAction label="Save and continue" onClick={() => markSectionReviewed('basicInfo')} />
                  </AccordionSection>
                </div>
                <div
                  ref={(element) => {
                    sectionRefs.current.artwork = element ?? undefined;
                  }}
                >
                  <AccordionSection
                    section={CREATE_DAO_SECTIONS[1]}
                    status={statuses.artwork}
                    isOpen={openSections.has('artwork')}
                    onToggle={() => setSectionOpen('artwork', !openSections.has('artwork'))}
                  >
                    <ArtworkStep />
                    <SectionAction label="Save and continue" onClick={() => markSectionReviewed('artwork')} />
                  </AccordionSection>
                </div>
                <div
                  ref={(element) => {
                    sectionRefs.current.auction = element ?? undefined;
                  }}
                >
                  <AccordionSection
                    section={CREATE_DAO_SECTIONS[2]}
                    status={statuses.auction}
                    isOpen={openSections.has('auction')}
                    onToggle={() => setSectionOpen('auction', !openSections.has('auction'))}
                  >
                    <AuctionStep />
                    <SectionAction label="Save and continue" onClick={() => markSectionReviewed('auction')} />
                  </AccordionSection>
                </div>
                <div
                  ref={(element) => {
                    sectionRefs.current.governance = element ?? undefined;
                  }}
                >
                  <AccordionSection
                    section={CREATE_DAO_SECTIONS[3]}
                    status={statuses.governance}
                    isOpen={openSections.has('governance')}
                    onToggle={() => setSectionOpen('governance', !openSections.has('governance'))}
                  >
                    <GovernanceStep />
                    <SectionAction label="Save and continue" onClick={() => markSectionReviewed('governance')} />
                  </AccordionSection>
                </div>
                <div
                  ref={(element) => {
                    sectionRefs.current.founders = element ?? undefined;
                  }}
                >
                  <AccordionSection
                    section={CREATE_DAO_SECTIONS[4]}
                    status={statuses.founders}
                    isOpen={openSections.has('founders')}
                    onToggle={() => setSectionOpen('founders', !openSections.has('founders'))}
                  >
                    <FoundersStep />
                    <SectionAction label="Save and continue" onClick={() => markSectionReviewed('founders')} />
                  </AccordionSection>
                </div>
                <div
                  ref={(element) => {
                    sectionRefs.current.review = element ?? undefined;
                  }}
                >
                  <AccordionSection
                    section={CREATE_DAO_SECTIONS[5]}
                    status={statuses.review}
                    isOpen={openSections.has('review')}
                    onToggle={() => setSectionOpen('review', !openSections.has('review'))}
                  >
                    <ReviewStep connectedAddress={session.address} />
                    <div className="form-actions form-actions--split create-review-actions">
                      <Text>
                        {canSubmit ? 'Everything is ready to deploy.' : 'Review each section before deploying.'}
                      </Text>
                      <Button onClick={handleSubmit} disabled={!canSubmit}>
                        Create DAO
                      </Button>
                    </div>
                  </AccordionSection>
                </div>
              </div>
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

function SectionAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div className="form-actions form-actions--split create-section-actions">
      <Text>Changes are saved to this draft automatically.</Text>
      <Button type="button" onClick={onClick}>
        {label}
      </Button>
    </div>
  );
}
