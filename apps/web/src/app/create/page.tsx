'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FocusEvent, type FormEvent, useEffect, useRef, useState } from 'react';
import type { ZodError } from 'zod';

import { BasicInfoStep, GovernanceStep, MembershipStep, ReviewStep } from '@/components/create-dao';
import { DeploymentProgress } from '@/components/create-dao/DeploymentProgress';
import { SectionOutline } from '@/components/create-dao/SectionOutline';
import styles from '@/components/create-dao/workspace-styles';
import { DiscardDraftDialog } from '@/components/drafts/discard-draft-dialog';
import { useWorkspaceSync } from '@/components/local-workspace/workspace-sync';
import { Button, Callout, PageHeader } from '@/components/ui';
import { configuredCreationNetwork, draftConfigurationSchema, validateCreationAssets } from '@/lib/create-dao-schema';
import {
  errorsFromZod,
  type FieldError,
  FORM_SECTIONS,
  type FormSectionId,
  sectionOfKey,
  unlockedCount,
  validateSection
} from '@/lib/create-dao-sections';
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
  const [discardOpen, setDiscardOpen] = useState(false);
  // Fields the person has left at least once; only these show errors before Continue is pressed.
  const touched = useRef(new Set<string>());
  // The section that just unlocked, so only it plays the entrance (never on load or resume).
  const [entering, setEntering] = useState<FormSectionId | null>(null);
  const [attention, setAttention] = useState<{ section: FormSectionId; count: number } | null>(null);
  const [checking, setChecking] = useState(false);
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

  // A field inside Advanced settings mounts a frame or two after its panel opens; keep looking briefly.
  const focusFirstInvalid = (scope: ParentNode = document) => {
    let frames = 0;
    const focusFirst = () => {
      const field = scope.querySelector<HTMLElement>('[aria-invalid="true"], [data-invalid="true"]');
      if (field) field.focus();
      else if (++frames < 10) requestAnimationFrame(focusFirst);
    };
    requestAnimationFrame(focusFirst);
  };
  const showErrors = (error: ZodError) => {
    store.clearAllValidationErrors();
    for (const { key, message } of errorsFromZod(error)) store.setValidationError(key, message);
    focusFirstInvalid();
  };
  /** Set or clear errors for some keys of one section, from the latest store values. */
  const applySectionErrors = (section: FormSectionId, keys: Iterable<string>, extra: FieldError[] = []) => {
    const state = useCreateDaoStore.getState();
    const errors = [...validateSection(section, state), ...extra];
    for (const key of keys) {
      const found = errors.find((error) => error.key === key);
      if (found) state.setValidationError(key, found.message);
      else state.clearValidationError(key);
    }
    return errors;
  };
  /** The validated field an event came from: the nearest element whose id is a known field key. */
  const fieldKeyOf = (target: EventTarget | null) => {
    for (let node = target as HTMLElement | null; node; node = node.parentElement) {
      if (node.id && sectionOfKey(node.id)) return node.id;
      if (node.tagName === 'SECTION') return null;
    }
    return null;
  };
  // Check a field when it is first left; after that, re-check it on every change.
  const onFieldBlur = (section: FormSectionId) => (event: FocusEvent<HTMLElement>) => {
    const key = fieldKeyOf(event.target);
    if (!key || sectionOfKey(key) !== section) return;
    // Moving between the parts of one field (days → hours) isn't leaving it.
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) {
      if (fieldKeyOf(event.relatedTarget) === key) return;
    }
    touched.current.add(key);
    applySectionErrors(section, [key]);
  };
  const onFieldInput = (section: FormSectionId) => (event: FormEvent<HTMLElement>) => {
    const key = fieldKeyOf(event.target);
    if (!key || sectionOfKey(key) !== section) return;
    // Fields clear their own error as they change, so go by "left once" rather than "has an error".
    if (touched.current.has(key)) applySectionErrors(section, [key]);
    if (attention?.section === section) setAttention(null);
  };
  const continueFrom = async (index: number) => {
    const section = FORM_SECTIONS[index];
    const next = FORM_SECTIONS[index + 1];
    if (!next) return;
    const state = useCreateDaoStore.getState();
    const extra: FieldError[] = [];
    if (section.id === 'identity') {
      if (state.imagePreview)
        extra.push({
          key: 'contractImage',
          message: 'Upload your image, or keep the default, before continuing.'
        });
      const slug = state.basicInfo.slug;
      if (slug && !validateSection('identity', state).some((error) => error.key === 'slug')) {
        setChecking(true);
        try {
          const response = await fetch(`/api/slugs/${encodeURIComponent(slug)}`, { cache: 'no-store' });
          const status = (await response.json()) as { claimedBy?: string | null };
          if (status.claimedBy)
            extra.push({ key: 'slug', message: 'A launched DAO already owns this link. Pick another.' });
        } catch {
          // If the check can't run, Create still fails safely on a taken slug; don't block on a network blip.
        } finally {
          setChecking(false);
        }
      }
    }
    const errors = validateSection(section.id, state);
    const all = [...errors, ...extra.filter((e) => !errors.some((other) => other.key === e.key))];
    const keys = new Set([...all.map((error) => error.key), ...touched.current]);
    for (const key of all.map((error) => error.key)) touched.current.add(key);
    applySectionErrors(
      section.id,
      [...keys].filter((key) => sectionOfKey(key) === section.id),
      extra
    );
    if (all.length) {
      setAttention({ section: section.id, count: all.length });
      focusFirstInvalid(document.getElementById(section.id) ?? document);
      return;
    }
    setAttention(null);
    state.setSection(next.stored);
    setEntering(next.id);
    requestAnimationFrame(() => {
      const target = document.getElementById(next.id);
      if (!target) return;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      document.getElementById(`${next.id}-heading`)?.focus({ preventScroll: true });
    });
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
  const unlocked = unlockedCount(store.section);
  const outline = FORM_SECTIONS.map(({ id, title }, index) => ({
    id,
    title,
    complete: id !== 'review' && validateSection(id, store).length === 0,
    locked: index >= unlocked
  }));
  return (
    <div className={styles.createPage}>
      <DiscardDraftDialog
        open={discardOpen}
        title={store.basicInfo.tokenName.trim() || 'Untitled DAO'}
        onCancel={() => setDiscardOpen(false)}
        onDiscard={() => {
          setDiscardOpen(false);
          if (!draft) return;
          try {
            useCreateDaoStore.getState().deleteDraft(draft.id);
            router.push('/');
          } catch (failure) {
            setPageError((failure as Error).message);
          }
        }}
      />
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
              {FORM_SECTIONS.slice(0, unlocked).map((section, position) => (
                <section
                  key={section.id}
                  id={section.id}
                  tabIndex={-1}
                  aria-labelledby={`${section.id}-heading`}
                  className={`${styles.formSection}${entering === section.id ? ` ${styles.formSectionEnter}` : ''}`}
                  onBlur={onFieldBlur(section.id)}
                  // onChange (not onInput) so this runs after the field's own handler has saved the value.
                  onChange={onFieldInput(section.id)}
                >
                  <div className={styles.formSectionHead}>
                    <h2 id={`${section.id}-heading`} tabIndex={-1} className={styles.formSectionTitle}>
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
                  ) : null}
                  {section.id !== 'review' && position === unlocked - 1 ? (
                    <div className={styles.continueRow}>
                      {attention?.section === section.id ? (
                        <p className={styles.error} role="alert">
                          {attention.count === 1 ? '1 thing needs' : `${attention.count} things need`} attention
                        </p>
                      ) : (
                        <p className={styles.muted}>Next: {FORM_SECTIONS[position + 1].title}</p>
                      )}
                      <Button type="button" loading={checking} onClick={() => void continueFrom(position)}>
                        Continue to{' '}
                        {position + 1 === FORM_SECTIONS.length - 1 ? 'review' : FORM_SECTIONS[position + 1].title}
                      </Button>
                    </div>
                  ) : null}
                  {section.id !== 'review' ? null : (
                    <>
                      <ReviewStep connectedAddress={session.address} />
                      {pageError ? (
                        <Callout variant="error" title="This needs attention" description={pageError} />
                      ) : null}
                      <div className={styles.actions}>
                        <div className={styles.links}>
                          <Link href={{ pathname: '/drafts' }}>Save for later</Link>
                          <Button type="button" variant="ghost" size="sm" onClick={() => setDiscardOpen(true)}>
                            Discard draft
                          </Button>
                        </div>
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
