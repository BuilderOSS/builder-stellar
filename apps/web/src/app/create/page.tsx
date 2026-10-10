'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { ZodError } from 'zod';

import { BasicInfoStep, GovernanceStep, MembershipStep, ReviewStep } from '@/components/create-dao';
import { DeploymentProgress } from '@/components/create-dao/DeploymentProgress';
import styles from '@/components/create-dao/workspace-styles';
import { useWorkspaceSync } from '@/components/local-workspace/workspace-sync';
import { Button, Callout, Heading, PageHeader, ProgressSteps } from '@/components/ui';
import {
  configuredCreationNetwork,
  CREATE_DAO_SECTIONS,
  draftConfigurationSchema,
  sectionSchemas,
  validateCreationAssets
} from '@/lib/create-dao-schema';
import { getDeploymentConfig, isDeploymentConfigured } from '@/lib/deployment-config';
import { pollCreatedDao, useDaoDeployment } from '@/lib/use-dao-deployment';
import { useAuthSessionStore } from '@/stores/auth-session-store';
import { creationStorageError, useCreateDaoStore } from '@/stores/create-dao-store';

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
  const heading = useRef<HTMLHeadingElement>(null);
  const configured = isDeploymentConfigured();
  const network = configuredCreationNetwork();
  const deployment = configured ? getDeploymentConfig().managerAddress : 'unconfigured';
  const currentScope = JSON.stringify([network, deployment, session.address]);
  const ready = readyScope === currentScope;
  const { state, deployDao } = useDaoDeployment(session.address, network);
  const draft = store.drafts.find((d) => d.id === store.activeDraftId);
  const index = CREATE_DAO_SECTIONS.findIndex((s) => s.id === store.section);
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
  useEffect(() => {
    if (ready) heading.current?.focus();
  }, [store.section, ready]);

  const showErrors = (error: ZodError) => {
    store.clearAllValidationErrors();
    for (const issue of error.issues) {
      const parts = issue.path.map(String);
      const key = ['basicInfo', 'governance'].includes(parts[0]) ? parts.slice(1).join('.') : parts.join('.');
      store.setValidationError(key, issue.message);
    }
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>('[aria-invalid="true"], [data-invalid="true"]')?.focus()
    );
  };
  const next = () => {
    const input =
      store.section === 'basicInfo'
        ? store.basicInfo
        : store.section === 'governance'
          ? store.governance
          : { basicInfo: store.basicInfo, auction: store.auction, marketplace: store.marketplace };
    if (store.section === 'review') return;
    const parsed = sectionSchemas[store.section].safeParse(input);
    if (!parsed.success) {
      showErrors(parsed.error);
      return;
    }
    store.clearAllValidationErrors();
    store.setSection(CREATE_DAO_SECTIONS[index + 1].id);
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
      const issue = parsed.error.issues[0];
      const section =
        issue.path[0] === 'governance'
          ? 'governance'
          : issue.path[0] === 'basicInfo' &&
              ['tokenName', 'tokenSymbol', 'contractImage'].includes(String(issue.path[1]))
            ? 'basicInfo'
            : ['tokenUri', 'rendererBase'].includes(String(issue.path[1]))
              ? 'review'
              : 'membership';
      store.setSection(section);
      showErrors(parsed.error);
      setPageError('Some configuration fields need attention. Return to the relevant step.');
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
  return (
    <div className={styles.workspace}>
      <div>
        <PageHeader
          title="Start a DAO"
          meta={
            creationStorageError() || (ready ? `Saved on this browser as you go · ${network}` : 'Opening your draft…')
          }
        />
        {pageError ? <Callout variant="error" title="This needs attention" description={pageError} /> : null}
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
          <>
            <ProgressSteps
              steps={CREATE_DAO_SECTIONS.map((section) => ({ id: section.id, label: section.title }))}
              current={Math.max(0, index)}
              onSelect={(target) => store.setSection(CREATE_DAO_SECTIONS[target].id)}
              canSelect={() => true}
            />
            <section className={styles.panel} aria-labelledby="step-heading">
              <Heading ref={heading} id="step-heading" tabIndex={-1} as="h2" size="title">
                {CREATE_DAO_SECTIONS[index]?.title}
              </Heading>
              {store.section === 'basicInfo' ? (
                <BasicInfoStep />
              ) : store.section === 'membership' ? (
                <MembershipStep />
              ) : store.section === 'governance' ? (
                <GovernanceStep />
              ) : (
                <ReviewStep connectedAddress={session.address} />
              )}
            </section>
            <div className={styles.actions}>
              {index > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => store.setSection(CREATE_DAO_SECTIONS[index - 1].id)}
                >
                  Back
                </Button>
              ) : (
                <Link href={{ pathname: '/drafts' }}>Save for later</Link>
              )}
              {store.section !== 'review' ? (
                <Button type="button" onClick={next}>
                  Continue
                </Button>
              ) : (
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
              )}
            </div>
            {store.section === 'review' ? (
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
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
