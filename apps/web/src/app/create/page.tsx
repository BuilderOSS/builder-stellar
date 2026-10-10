'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { ZodError } from 'zod';

import { BasicInfoStep, GovernanceStep, MembershipStep, ReviewStep } from '@/components/create-dao';
import { DeploymentProgress } from '@/components/create-dao/DeploymentProgress';
import { SectionOutline } from '@/components/create-dao/SectionOutline';
import styles from '@/components/create-dao/workspace-styles';
import { useWorkspaceSync } from '@/components/local-workspace/workspace-sync';
import { Button, Callout, PageHeader } from '@/components/ui';
import {
  configuredCreationNetwork,
  draftConfigurationSchema,
  sectionSchemas,
  validateCreationAssets
} from '@/lib/create-dao-schema';
import { getDeploymentConfig, isDeploymentConfigured } from '@/lib/deployment-config';
import { pollCreatedDao, useDaoDeployment } from '@/lib/use-dao-deployment';
import { useAuthSessionStore } from '@/stores/auth-session-store';
import { creationStorageError, useCreateDaoStore } from '@/stores/create-dao-store';

// One long form, read top to bottom. Ids double as anchors for the outline.
const FORM_SECTIONS = [
  {
    id: 'identity',
    title: 'Identity',
    description: 'Your name, picture and what the community is about. This is how people find you.'
  },
  {
    id: 'membership',
    title: 'Membership',
    description: 'Pick how people become members. Fine-tune prices and timings later.'
  },
  {
    id: 'voting',
    title: 'Voting',
    description: 'Pick a pace for decisions. The exact rules are in Advanced settings.'
  },
  {
    id: 'review',
    title: 'Check and create',
    description: 'Everything above in plain words. Nothing is signed until you press Create.'
  }
] as const;

export default function CreateDaoPage() {
  useWorkspaceSync();
  const router = useRouter();
  const session = useAuthSessionStore();
  const store = useCreateDaoStore();
  const [readyScope, setReadyScope] = useState('');
  const [pageError, setPageError] = useState('');
  const [indexingMessage, setIndexingMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const operation = useRef(false);
  const indexingRequest = useRef<AbortController | null>(null);
  const configured = isDeploymentConfigured();
  const network = configuredCreationNetwork();
  const deployment = configured ? getDeploymentConfig().managerAddress : 'unconfigured';
  const currentScope = JSON.stringify([network, deployment, session.address]);
  const ready = readyScope === currentScope;
  const { state, deployDao } = useDaoDeployment(session.address, network);
  const draft = store.drafts.find((d) => d.id === store.activeDraftId);
  useEffect(() => {
    let canceled = false;
    void (async () => {
      try {
        await useCreateDaoStore.persist.rehydrate();
        if (canceled) return;
        setPageError('');
        const requested = new URLSearchParams(window.location.search).get('draft') ?? undefined;
        useCreateDaoStore.getState().initialize({ network, deployment, wallet: session.address || null }, requested);
        setReadyScope(currentScope);
      } catch (e) {
        if (!canceled) setPageError(e instanceof Error ? e.message : 'Could not open this draft');
      }
    })();
    return () => {
      canceled = true;
      indexingRequest.current?.abort();
    };
  }, [network, deployment, session.address, currentScope]);

  const showErrors = (error: ZodError) => {
    store.clearAllValidationErrors();
    for (const issue of error.issues) {
      const parts = issue.path.map(String);
      const key = ['basicInfo', 'governance'].includes(parts[0]) ? parts.slice(1).join('.') : parts.join('.');
      store.setValidationError(key, issue.message);
    }
    // A field inside Advanced settings mounts a frame or two after its panel opens; keep looking briefly.
    let frames = 0;
    const focusFirst = () => {
      const field = document.querySelector<HTMLElement>('[aria-invalid="true"], [data-invalid="true"]');
      if (field) field.focus();
      else if (++frames < 10) requestAnimationFrame(focusFirst);
    };
    requestAnimationFrame(focusFirst);
  };
  const openSetup = async (token: string) => {
    indexingRequest.current?.abort();
    const controller = new AbortController();
    indexingRequest.current = controller;
    setIndexingMessage('Waiting for the DAO to appear in the directory…');
    try {
      const indexed = await pollCreatedDao(token, controller.signal);
      if (controller.signal.aborted) return;
      if (indexed) router.push(`/dao/${token}`);
      else
        setIndexingMessage(
          'Deployment is confirmed. The directory has not caught up yet. Check again without redeploying.'
        );
    } catch (e) {
      if (controller.signal.aborted) return;
      setIndexingMessage(e instanceof Error ? e.message : 'Directory lookup failed. The deployment record is saved.');
    }
  };
  const deploy = async (rebroadcast = false) => {
    if (operation.current || !draft) return;
    const parsed = draftConfigurationSchema.safeParse(draft.configuration);
    if (!parsed.success) {
      // Every section is on the page, so focusing the first invalid field scrolls straight to it.
      showErrors(parsed.error);
      setPageError(
        parsed.error.issues.length === 1
          ? 'One field needs attention. We took you to it.'
          : `${parsed.error.issues.length} fields need attention. We took you to the first one.`
      );
      return;
    }
    try {
      validateCreationAssets(parsed.data, network);
    } catch (e) {
      setPageError((e as Error).message);
      return;
    }
    operation.current = true;
    setBusy(true);
    setPageError('');
    try {
      const addresses = await deployDao({ ...parsed.data, launchAdmin: session.address }, draft.id, { rebroadcast });
      if (useAuthSessionStore.getState().address === session.address) await openSetup(addresses.token);
    } catch (e) {
      setPageError(e instanceof Error ? e.message : 'Deployment needs attention');
    } finally {
      setBusy(false);
      operation.current = false;
    }
  };
  const authenticated = Boolean(session.address) && session.authStatus === 'authenticated';
  const walletIssue =
    session.walletNetworkIssue ||
    (configured &&
    session.walletNetworkPassphrase &&
    session.walletNetworkPassphrase !== getDeploymentConfig().networkPassphrase
      ? 'Switch your wallet to this workspace’s network.'
      : '');
  const complete: Record<(typeof FORM_SECTIONS)[number]['id'], boolean> = {
    // Description and website are checked with membership's schema but shown under Identity.
    identity:
      sectionSchemas.basicInfo.safeParse(store.basicInfo).success &&
      sectionSchemas.membership.shape.basicInfo.safeParse(store.basicInfo).success,
    membership:
      sectionSchemas.membership.shape.auction.safeParse(store.auction).success &&
      sectionSchemas.membership.shape.marketplace.safeParse(store.marketplace).success,
    voting: sectionSchemas.governance.safeParse(store.governance).success,
    review: false
  };
  const outline = FORM_SECTIONS.map(({ id, title }) => ({ id, title, complete: complete[id] }));
  return (
    <div className={styles.createPage}>
      <div>
        <PageHeader
          title="Start a DAO"
          meta={
            creationStorageError() || (ready ? `Saved on this browser as you go · ${network}` : 'Opening your draft…')
          }
        />
        {pageError && (!ready || draft?.deployment) ? (
          <Callout variant="error" title="This needs attention" description={pageError} />
        ) : null}
        {!ready ? (
          <p role="status">{pageError ? 'Open Drafts to pick a draft on this network.' : 'Loading your draft…'}</p>
        ) : draft?.deployment ? (
          <>
            <DeploymentProgress state={state} record={draft.deployment} network={network} />
            {indexingMessage ? (
              <p role="status" className={styles.muted}>
                {indexingMessage}
              </p>
            ) : null}
            <div className={styles.actions}>
              <Link href={{ pathname: '/drafts' }}>Back to drafts</Link>
              {draft.deployment.status === 'confirmed' && draft.deployment.addresses ? (
                <Button
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await openSetup(draft.deployment!.addresses!.token);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? 'Opening…' : 'Continue to setup'}
                </Button>
              ) : (
                <Button
                  disabled={busy || !authenticated || Boolean(walletIssue) || Boolean(creationStorageError())}
                  onClick={() => void deploy()}
                >
                  {busy
                    ? 'Working…'
                    : draft.deployment.hash && !['failed', 'rejected', 'expired'].includes(draft.deployment.status)
                      ? 'Check the transaction'
                      : 'Try again'}
                </Button>
              )}
              {draft.deployment.signedTxXdr &&
              !['confirmed', 'failed', 'rejected', 'expired'].includes(draft.deployment.status) ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy || !authenticated || Boolean(walletIssue)}
                  onClick={() => void deploy(true)}
                >
                  Send the same signed transaction again
                </Button>
              ) : null}
            </div>
            {!authenticated ? (
              <p className={styles.muted}>Connect the wallet you created this with to continue.</p>
            ) : null}
            {walletIssue ? <p className={styles.error}>{walletIssue}</p> : null}
          </>
        ) : (
          <div className={styles.formLayout}>
            <div className={styles.form}>
              {FORM_SECTIONS.map((section, position) => (
                <section
                  key={section.id}
                  id={section.id}
                  tabIndex={-1}
                  aria-labelledby={`${section.id}-heading`}
                  className={styles.formSection}
                >
                  <div className={styles.formSectionHead}>
                    <h2 id={`${section.id}-heading`} className={styles.formSectionTitle}>
                      <span aria-hidden="true">{position + 1}</span>
                      {section.title}
                    </h2>
                    <p className={styles.muted}>{section.description}</p>
                  </div>
                  {section.id === 'identity' ? (
                    <BasicInfoStep />
                  ) : section.id === 'membership' ? (
                    <MembershipStep />
                  ) : section.id === 'voting' ? (
                    <GovernanceStep />
                  ) : (
                    <>
                      <ReviewStep connectedAddress={session.address} />
                      {pageError ? (
                        <Callout variant="error" title="This needs attention" description={pageError} />
                      ) : null}
                      <div className={styles.actions}>
                        <Link href={{ pathname: '/drafts' }}>Save for later</Link>
                        <Button
                          type="button"
                          onClick={() => void deploy()}
                          disabled={
                            busy ||
                            !authenticated ||
                            !configured ||
                            Boolean(walletIssue) ||
                            Boolean(store.imagePreview) ||
                            Boolean(creationStorageError())
                          }
                        >
                          {busy ? 'Creating…' : 'Create community'}
                        </Button>
                      </div>
                      <p className={styles.muted}>
                        {!configured
                          ? "Creating isn't set up on this deployment yet. Your draft is still saved."
                          : !authenticated
                            ? 'Connect your wallet when you’re ready to create it.'
                            : walletIssue ||
                              (store.imagePreview
                                ? 'Upload your image (or use the saved one) in Identity first.'
                                : 'You sign once to create it in Setup. You launch it later, when it’s ready.')}
                      </p>
                    </>
                  )}
                </section>
              ))}
            </div>
            <div className={styles.outline}>
              <SectionOutline sections={outline} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
