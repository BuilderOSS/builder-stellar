'use client';

import { Client as MetadataClient } from '@builder-stellar/metadata-bindings';
import { Client as TokenClient } from '@builder-stellar/token-bindings';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { Check, ImageUp, X } from 'lucide-react';
import { type ReactNode, useRef, useState } from 'react';
import { css, cx } from 'styled-system/css';

import { ProfileLinksEditor } from '@/components/admin/profile-links-editor';
import { prepareDaoImage, uploadDaoImage } from '@/components/create-dao/dao-image-upload';
import { actionAuthorityText, ActionSubmit } from '@/components/proposal-actions/action-submit';
import { EditingActionNotice } from '@/components/proposal-actions/editing-action-notice';
import { PendingValue, usePendingActions } from '@/components/proposal-actions/pending-value';
import {
  ActionBar,
  Button,
  Callout,
  Chip,
  Crest,
  FieldHelperText,
  FieldLabel,
  HelpTip,
  Input,
  MarkdownField,
  Spinner
} from '@/components/ui';
import { card, title } from '@/components/ui/panel-styles';
import { useDaoContext } from '@/contexts/dao-context';
import { treasuryIsAdmin } from '@/lib/admin-proposals';
import { adminReadOptions, useAdminArtwork, useAdminTokenState } from '@/lib/admin-surfaces';
import { checkNewLink, managerClient, useLinkAvailability, useManagerLink } from '@/lib/community-link';
import { buildProfilePlan, type CommunityProfile, type ProfileStep } from '@/lib/community-profile-plan';
import { type DaoProfile, MAX_PROFILE_BYTES, parseProfile, profileBytes, profileProblems } from '@/lib/dao-profile';
import { ACTION_SOURCES } from '@/lib/proposal-actions/action-request';
import { validateDaoProfileDraft } from '@/lib/proposal-actions/artwork-admin-actions';
import { getActionHandler } from '@/lib/proposal-actions/registry';
import { useEditingAction } from '@/lib/proposal-actions/use-editing-action';
import { useProposeAction } from '@/lib/proposal-actions/use-propose-action';
import { getProposalActionSummary } from '@/lib/proposal-call';
import { restoreArchivedState } from '@/lib/restore-archived-client';
import { waitForConfirmation } from '@/lib/transaction-confirmation';
import { useTransactionFeedback } from '@/lib/transaction-feedback';
import { MAX_TOKEN_NAME_BYTES, MAX_TOKEN_SYMBOL_LENGTH } from '@/lib/validation';
import { signWithWallet } from '@/lib/wallet-sign';
import { useAuthSessionStore } from '@/stores/auth-session-store';

const grid = css({
  display: 'grid',
  gap: '5',
  gridTemplateColumns: { base: 'minmax(0, 1fr)', md: '160px minmax(0, 1fr)' }
});
const imageCol = css({ display: 'grid', gap: '2', alignContent: 'start', justifyItems: 'start' });
const imageBox = css({ width: '40', height: '40' });
const fields = css({ display: 'grid', gap: '5', minW: '0' });
const twoCol = css({
  display: 'grid',
  gap: '5',
  gridTemplateColumns: { base: 'minmax(0, 1fr)', sm: 'minmax(0, 1fr) 140px' }
});
const field = css({ display: 'grid', gap: '1.5', minW: '0', alignContent: 'start' });
const hintRow = css({ display: 'flex', alignItems: 'center', gap: '3', flexWrap: 'wrap', minH: '5' });
const hint = css({ textStyle: 'caption', color: 'ink.muted', m: '0' });
const error = css({ textStyle: 'caption', color: 'danger', fontWeight: '600', m: '0' });
const planBox = css({
  display: 'grid',
  gap: '3',
  p: '4',
  borderRadius: 'control',
  boxShadow: 'inset 0 0 0 1px token(colors.signal.edge)'
});
const stepList = css({ listStyle: 'decimal', m: '0', pl: '5', display: 'grid', gap: '2' });
const stepRow = css({
  transitionProperty: 'opacity, transform',
  transitionDuration: '180ms',
  transitionTimingFunction: 'out',
  '@starting-style': { opacity: '0', transform: 'translateY(4px)' },
  _motionReduce: { '@starting-style': { transform: 'none' } }
});
const stepTitle = css({ textStyle: 'body', fontWeight: '600', color: 'ink', display: 'block' });
const stepDetail = css({ textStyle: 'mono', fontSize: '0.8125rem', color: 'ink.muted', overflowWrap: 'anywhere' });
const footer = css({ display: 'flex', justifyContent: 'flex-end', gap: '2', flexWrap: 'wrap' });
const linkStatus = css({
  display: 'flex',
  alignItems: 'center',
  gap: '1.5',
  textStyle: 'caption',
  minH: '5',
  m: '0',
  transitionProperty: 'color',
  transitionDuration: '150ms',
  '& svg': { width: '4', height: '4', flexShrink: '0' }
});
const linkTone = {
  ok: css({ color: 'success', fontWeight: '600' }),
  bad: css({ color: 'danger', fontWeight: '600' }),
  quiet: css({ color: 'ink.muted' })
};
const planGroup = css({ display: 'grid', gap: '3', pt: '3', borderTopWidth: '1px', borderColor: 'rule' });
const planNote = css({ textStyle: 'caption', color: 'ink.muted', m: '0' });

function Changed({ show, onUndo, children }: { show: boolean; onUndo: () => void; children?: ReactNode }) {
  return (
    <div className={hintRow}>
      {children}
      {show ? (
        <>
          <Chip tone="live">Changed</Chip>
          <Button variant="ghost" size="sm" onClick={onUndo}>
            Undo
          </Button>
        </>
      ) : null}
    </div>
  );
}

type NameEdits = Partial<Pick<CommunityProfile, 'name' | 'symbol'>>;

/**
 * Manage → Community profile: the name, symbol, image, description and links people see.
 * During setup the launch admin applies changes directly; after launch they become one proposal.
 * The description, links and image are one profile JSON on chain (docs/STORAGE_DIET.md § 6).
 */
export function CommunityProfileEditor() {
  const { daoId, routeId, daoConfig: config } = useDaoContext();
  const session = useAuthSessionStore();
  const token = useAdminTokenState(config, session.address);
  const artwork = useAdminArtwork(config, session.address);
  const { propose } = useProposeAction();
  const PROFILE_TYPES = ['set-token-metadata', 'update-dao-profile', 'change-dao-slug'] as const;
  const pending = usePendingActions([...PROFILE_TYPES]);
  const editing = useEditingAction({
    accepts: (action) => (PROFILE_TYPES as readonly string[]).includes(action.type),
    onLoad: (action) => {
      if (action.type === 'set-token-metadata')
        setEdits({ name: String(action.name ?? ''), symbol: String(action.symbol ?? '') });
      if (action.type === 'update-dao-profile') setProfileDraft(parseProfile(String(action.profile ?? '')));
      if (action.type === 'change-dao-slug') setLinkEdit(String(action.slug ?? ''));
    }
  });
  const tx = useTransactionFeedback(config.name);
  const [edits, setEdits] = useState<NameEdits>({});
  const [profileDraft, setProfileDraft] = useState<DaoProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<{ url: string; file: File } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const current: CommunityProfile = { name: config.tokenName, symbol: config.tokenSymbol, profile: config.profile };
  const profile = profileDraft ?? current.profile;
  const value = (key: 'name' | 'symbol') => edits[key] ?? current[key];
  const changed = (key: 'name' | 'symbol') => edits[key] !== undefined && edits[key]!.trim() !== current[key].trim();
  const set = (patch: NameEdits) => {
    setMessage('');
    setEdits((previous) => ({ ...previous, ...patch }));
  };
  const reset = (key: 'name' | 'symbol') =>
    setEdits((previous) => {
      const next = { ...previous };
      delete next[key];
      return next;
    });
  const setProfile = (patch: Partial<DaoProfile>) => {
    setMessage('');
    setProfileDraft({ ...profile, ...patch });
  };
  const profileChanged = (key: keyof DaoProfile) =>
    profileDraft !== null && JSON.stringify(profileDraft[key]) !== JSON.stringify(current.profile[key]);
  const resetProfile = (key: keyof DaoProfile) => setProfileDraft({ ...profile, [key]: current.profile[key] });
  // The revision update_profile must name: the chain's, read with the rest of Metadata.
  const chainSeq = artwork.data?.profileSeq ?? null;
  const bytes = profileBytes(profile);

  const live = token.data?.live === true;
  // Token and Metadata share the same admin: the launch admin during setup, the Treasury after.
  const direct = Boolean(
    session.address && token.data?.admin === session.address && artwork.data?.admin === session.address
  );
  const canPropose = Boolean(
    session.address &&
    live &&
    treasuryIsAdmin(config, token.data?.admin) &&
    treasuryIsAdmin(config, artwork.data?.admin)
  );
  const canAct = direct || canPropose;
  const networkReady =
    !session.walletNetworkIssue &&
    (!session.walletNetworkPassphrase || session.walletNetworkPassphrase === config.passphrase);
  const context = { config, session: { address: session.address, kit: StellarWalletsKit } };

  // The link lives in the Manager. During setup it changes directly with the rest; after launch it
  // needs its own proposal, since a link someone takes first would fail everything bundled with it.
  const readSource = adminReadOptions(config, config.tokenContractId, session.address).publicKey;
  const link = useManagerLink(config, daoId, readSource);
  const [linkEdit, setLinkEdit] = useState<string | undefined>();
  const currentLink = link.data?.slug ?? null;
  const nextLink = (linkEdit ?? currentLink ?? '').trim();
  const linkChanged = linkEdit !== undefined && nextLink !== currentLink;
  const availability = useLinkAvailability(linkChanged ? nextLink : '');
  const linkCheck = linkChanged ? checkNewLink(nextLink, currentLink, daoId, availability) : null;
  const canChangeLink = Boolean(currentLink) && (direct || canPropose);
  const linkReady = linkChanged && linkCheck?.state === 'ok';
  const linkStep = linkReady ? { title: 'Change the link', detail: `/dao/${currentLink} → /dao/${nextLink}` } : null;

  const steps = buildProfilePlan(current, { ...edits, ...(profileDraft ? { profile: profileDraft } : {}) }, chainSeq);
  const stepError = (step: ProfileStep) =>
    step.type === 'set-token-metadata'
      ? getActionHandler('set-token-metadata').validate(step.values, context)
      : validateDaoProfileDraft(step.values);
  const errors = Object.fromEntries(
    steps.flatMap((step) => {
      const result = stepError(step);
      if (result.valid) return [];
      if (step.type === 'set-token-metadata')
        return Object.entries(('fields' in result && result.fields) || { name: result.message });
      return [['profile', result.message]];
    })
  ) as Record<string, string>;
  const problems = profileDraft ? profileProblems(profileDraft) : [];
  const blocked = Object.keys(errors).length > 0 || Boolean(preview) || (direct && linkChanged && !linkReady);
  // During setup the link is one more direct step; after launch it is proposed separately.
  const shownSteps = direct && linkStep ? [...steps, { type: 'change-dao-slug', ...linkStep }] : steps;

  async function pickImage(file: File) {
    try {
      const prepared = await prepareDaoImage(file);
      setPreview({ url: prepared.preview, file });
    } catch (failure) {
      setMessage(failure instanceof Error ? failure.message : 'Could not read this image');
    }
  }
  async function uploadImage() {
    if (!preview || uploading) return;
    setUploading(true);
    try {
      const url = await uploadDaoImage(preview.file);
      setProfile({ image: url });
      setPreview(null);
    } catch (failure) {
      setMessage(failure instanceof Error ? failure.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  function proposeLink() {
    if (!linkReady) return;
    const action = getActionHandler('change-dao-slug').serialize({ slug: nextLink }, context);
    const replaces = editing.editing?.type === 'change-dao-slug' ? editing.replaces : undefined;
    const result = propose(
      { actions: [action], source: ACTION_SOURCES.profile, note: getProposalActionSummary(action), replaces },
      {
        onAdded: () => {
          setLinkEdit(undefined);
          if (replaces) editing.done();
        }
      }
    );
    if (result.outcome === 'invalid') setMessage(result.message);
  }

  async function addToProposal() {
    if (!steps.length || blocked) return;
    try {
      for (const step of steps) await assertProfileRevision(step);
    } catch (failure) {
      setMessage(failure instanceof Error ? failure.message : 'Could not check the current profile');
      return;
    }
    // A rename and a profile update are separate changes, each with its own note, so either can be removed.
    const replaces = editing.editing && editing.editing.type !== 'change-dao-slug' ? editing.replaces : undefined;
    const result = propose(
      {
        actions: steps.map((step) => ({
          ...getActionHandler(step.type).serialize(step.values, context),
          note: `${step.title}: ${step.detail}.`
        })),
        source: ACTION_SOURCES.profile,
        note: steps.map((step) => step.title).join('. '),
        replaces
      },
      {
        onAdded: () => {
          setEdits({});
          setProfileDraft(null);
          editing.done();
        }
      }
    );
    if (result.outcome === 'invalid') setMessage(result.message);
  }

  /** The chain's profile revision right now; a stale one would make update_profile fail. */
  async function assertProfileRevision(step: ProfileStep) {
    if (step.type !== 'update-dao-profile') return;
    const client = new MetadataClient(adminReadOptions(config, config.metadataContractId, session.address));
    const seq = (await client.profile_seq()).result.unwrap();
    if (seq !== step.values.expectedSeq) {
      await artwork.mutate();
      throw new Error('The profile changed since this page loaded. Review the current profile, then try again.');
    }
  }

  async function applyDirectly() {
    if (!session.address || !shownSteps.length || blocked || !networkReady) return;
    setBusy(true);
    const sign = (xdr: string, opts?: { networkPassphrase?: string; address?: string }) =>
      signWithWallet(xdr, { ...opts, address: session.address!, networkPassphrase: config.passphrase });
    try {
      const total = shownSteps.length;
      for (const [index, step] of steps.entries()) {
        const label = total > 1 ? `${step.title} (step ${index + 1} of ${total})` : step.title;
        tx.start(label);
        let assembled;
        if (step.type === 'set-token-metadata') {
          const client = new TokenClient({
            ...adminReadOptions(config, config.tokenContractId, session.address),
            ...restoreArchivedState,
            signTransaction: sign
          });
          assembled = await client.set_metadata(step.values);
        } else {
          const client = new MetadataClient({
            ...adminReadOptions(config, config.metadataContractId, session.address),
            ...restoreArchivedState,
            signTransaction: sign
          });
          await assertProfileRevision(step);
          const call = await client.update_profile({
            expected_seq: step.values.expectedSeq,
            profile: step.values.profile
          });
          call.result.unwrap();
          assembled = call;
        }
        const sent = await assembled.signAndSend();
        const hash = sent.sendTransactionResponse?.hash ?? '';
        tx.submitted(`${step.title} submitted`, hash);
        await waitForConfirmation(hash, config.rpcUrl);
        tx.success(`${step.title} done`, hash);
        // Keep only what still needs doing if a later step fails.
        if (step.type === 'set-token-metadata') {
          reset('name');
          reset('symbol');
        } else setProfileDraft(null);
      }
      if (linkStep) {
        const label = total > 1 ? `${linkStep.title} (step ${total} of ${total})` : linkStep.title;
        tx.start(label);
        const assembled = await managerClient(config, session.address, sign).update_pending_slug({
          token_address: daoId,
          slug: nextLink
        });
        assembled.result.unwrap();
        const sent = await assembled.signAndSend();
        const hash = sent.sendTransactionResponse?.hash ?? '';
        tx.submitted(`${linkStep.title} submitted`, hash);
        await waitForConfirmation(hash, config.rpcUrl);
        tx.success(`Your link is now /dao/${nextLink}`, hash);
        setLinkEdit(undefined);
      }
    } catch (failure) {
      tx.fail(failure, 'Profile update failed');
    } finally {
      setBusy(false);
      await Promise.all([artwork.mutate(), token.mutate(), link.mutate()]);
    }
  }

  const disabled = busy || !canAct;
  const count = shownSteps.length
    ? `${shownSteps.length} ${shownSteps.length === 1 ? 'change' : 'changes'}`
    : 'changes';
  const submit = (
    <ActionSubmit
      direct={direct}
      what={count}
      editing={Boolean(editing.editing && editing.editing.type !== 'change-dao-slug')}
      disabled={disabled || !shownSteps.length || blocked || (direct && !networkReady)}
      loading={busy}
      onClick={() => void (direct ? applyDirectly() : addToProposal())}
    />
  );

  return (
    <>
      <section className={card} aria-labelledby="profile-title">
        <EditingActionNotice
          editing={editing.editing}
          onCancel={() => {
            editing.done();
            setEdits({});
            setProfileDraft(null);
            setLinkEdit(undefined);
          }}
        />
        <div>
          <h2 id="profile-title" className={title}>
            How people see {config.tokenName || 'your tribe'}
          </h2>
          <HelpTip label="Profile changes">
            {direct
              ? 'During setup, changes apply right away.'
              : live
                ? 'Changes go into a proposal for members to vote on.'
                : 'Connect the launch admin wallet to change these during setup.'}
          </HelpTip>
        </div>

        {!canAct && session.address ? (
          <Callout variant="info" title="Read only" description="You can't change the profile with this wallet." />
        ) : null}

        <div className={grid}>
          <div className={imageCol}>
            <span className={css({ textStyle: 'label', color: 'ink' })}>Image</span>
            <div className={imageBox}>
              {/* The crest's initials show through if the image is missing or fails to load. */}
              <Crest
                name={value('name') || config.tokenName}
                seed={config.tokenContractId}
                src={preview?.url ?? profile.image}
                size="fill"
              />
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void pickImage(file);
                event.target.value = '';
              }}
            />
            {preview ? (
              <Button size="sm" loading={uploading} disabled={disabled} onClick={() => void uploadImage()}>
                <ImageUp aria-hidden="true" />
                Upload image
              </Button>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                className={css({ width: '40' })}
                disabled={disabled}
                onClick={() => fileInput.current?.click()}
              >
                Choose image
              </Button>
            )}
            <Changed
              show={profileChanged('image') || Boolean(preview)}
              onUndo={() => {
                setPreview(null);
                resetProfile('image');
              }}
            />
          </div>

          <div className={fields}>
            <div className={twoCol}>
              <div className={field}>
                <FieldLabel htmlFor="profile-name">Name</FieldLabel>
                <Input
                  id="profile-name"
                  value={value('name')}
                  maxLength={MAX_TOKEN_NAME_BYTES}
                  disabled={disabled}
                  aria-invalid={Boolean(errors.name) || undefined}
                  onChange={(event) => set({ name: event.target.value })}
                />
                <Changed show={changed('name')} onUndo={() => reset('name')} />
                {errors.name ? <p className={error}>{errors.name}</p> : null}
              </div>
              <div className={field}>
                <FieldLabel htmlFor="profile-symbol">Symbol</FieldLabel>
                <Input
                  id="profile-symbol"
                  value={value('symbol')}
                  maxLength={MAX_TOKEN_SYMBOL_LENGTH}
                  disabled={disabled}
                  aria-invalid={Boolean(errors.symbol) || undefined}
                  onChange={(event) => set({ symbol: event.target.value.toUpperCase() })}
                />
                <Changed show={changed('symbol')} onUndo={() => reset('symbol')} />
                {errors.symbol ? <p className={error}>{errors.symbol}</p> : null}
              </div>
            </div>
            <div className={field}>
              <FieldLabel htmlFor="profile-link">Link</FieldLabel>
              <Input
                id="profile-link"
                value={linkEdit ?? currentLink ?? ''}
                placeholder={currentLink ?? routeId}
                maxLength={63}
                spellCheck={false}
                autoCapitalize="none"
                autoComplete="off"
                disabled={busy || !canChangeLink}
                aria-invalid={linkCheck?.state === 'bad' || undefined}
                aria-describedby="profile-link-status"
                onChange={(event) => {
                  setMessage('');
                  setLinkEdit(event.target.value.toLowerCase().replace(/\s+/g, '-'));
                }}
              />
              <Changed show={linkChanged} onUndo={() => setLinkEdit(undefined)}>
                <p
                  id="profile-link-status"
                  aria-live="polite"
                  className={cx(
                    linkStatus,
                    linkCheck?.state === 'ok' ? linkTone.ok : linkCheck?.state === 'bad' ? linkTone.bad : linkTone.quiet
                  )}
                >
                  {linkCheck?.state === 'checking' ? <Spinner label="Checking" /> : null}
                  {linkCheck?.state === 'ok' ? <Check aria-hidden="true" strokeWidth={2} /> : null}
                  {linkCheck?.state === 'bad' ? <X aria-hidden="true" strokeWidth={2} /> : null}
                  {linkCheck
                    ? linkCheck.text
                    : !live
                      ? `/dao/${currentLink ?? routeId}. Yours once you launch.`
                      : `/dao/${currentLink ?? routeId}. Changing it takes its own vote.`}
                </p>
              </Changed>
            </div>
            {config.profileStatus === 'unavailable' && config.profileSeq !== null ? (
              <Callout
                variant="warning"
                title="The current profile can't be shown right now"
                description="It couldn't be checked against the chain. Saving a new description, links or image replaces it."
              />
            ) : null}
            <div className={field}>
              <FieldLabel htmlFor="profile-description">Description</FieldLabel>
              <MarkdownField
                id="profile-description"
                value={profile.description}
                disabled={disabled}
                canUpload={Boolean(session.address)}
                invalid={problems.length > 0 || undefined}
                describedBy={bytes > MAX_PROFILE_BYTES ? 'profile-budget' : undefined}
                onChange={(description) => setProfile({ description })}
              />
              <Changed show={profileChanged('description')} onUndo={() => resetProfile('description')} />
            </div>
            <ProfileLinksEditor
              id="profile-links"
              links={profile.links}
              disabled={disabled}
              onChange={(links) => setProfile({ links })}
            />
            <Changed show={profileChanged('links')} onUndo={() => resetProfile('links')} />
            {bytes > MAX_PROFILE_BYTES ? (
              <p id="profile-budget" className={error} role="alert">
                Profile exceeds the {MAX_PROFILE_BYTES.toLocaleString()}-byte limit.
              </p>
            ) : null}
            {errors.profile ? <p className={error}>{errors.profile}</p> : null}
          </div>
        </div>

        {pending
          .filter((action) => action.id !== editing.editing?.id)
          .map((action) => (
            <PendingValue key={action.id} pending={action} />
          ))}
        <div className={planBox} aria-live="polite">
          <h3 className={css({ textStyle: 'subheading', m: '0' })}>
            {direct ? 'This will' : 'If the proposal passes, it will'}
          </h3>
          {shownSteps.length ? (
            <ol className={stepList}>
              {shownSteps.map((step) => (
                <li key={step.type} className={stepRow}>
                  <span className={stepTitle}>{step.title}</span>
                  <span className={stepDetail}>{step.detail}</span>
                </li>
              ))}
            </ol>
          ) : !linkStep ? (
            <p className={hint}>Change something above to see what will happen.</p>
          ) : null}
          {direct && linkStep ? (
            <p className={planNote}>
              The new link is yours once you launch. If another tribe launches first with it, pick another.
            </p>
          ) : null}
          {preview ? <p className={hint}>Upload the new image to include it.</p> : null}
          {!direct && linkStep ? (
            <div className={cx(planGroup, stepRow)}>
              <span className={stepTitle}>In its own proposal: change the link</span>
              <span className={stepDetail}>{linkStep.detail}</span>
              <p className={planNote}>
                /dao/{currentLink} is freed when it passes. Old links lead here until another tribe takes it, which can
                happen right away. If /dao/{nextLink} is taken before the vote, that proposal fails and you can propose
                another link.
              </p>
              <div>
                <ActionSubmit
                  direct={false}
                  what="the new link"
                  editing={editing.editing?.type === 'change-dao-slug'}
                  variant={steps.length ? 'secondary' : 'primary'}
                  disabled={busy}
                  onClick={proposeLink}
                />
              </div>
            </div>
          ) : null}
        </div>

        {message ? <Callout variant="warning" title={message} role="alert" /> : null}
        {/* With only a new link after launch, its own button is the one action. */}
        {shownSteps.length || !linkStep ? (
          <div className={footer}>
            <FieldHelperText>{actionAuthorityText(direct)}</FieldHelperText>
            {submit}
          </div>
        ) : null}
      </section>
      {shownSteps.length ? <ActionBar mobileOnly>{submit}</ActionBar> : null}
    </>
  );
}
