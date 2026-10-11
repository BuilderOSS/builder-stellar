'use client';

import { Client as MetadataClient } from '@builder-stellar/metadata-bindings';
import { Client as TokenClient } from '@builder-stellar/token-bindings';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { Check, ImageUp, X } from 'lucide-react';
import { type ReactNode, useRef, useState } from 'react';
import { css, cx } from 'styled-system/css';

import { AdminProposalDraftDialog } from '@/components/admin/admin-proposal-draft-dialog';
import { prepareDaoImage, uploadDaoImage } from '@/components/create-dao/dao-image-upload';
import { ActionBar, Button, Callout, Chip, Crest, FieldLabel, Input, Spinner, Textarea } from '@/components/ui';
import { card, muted, title } from '@/components/ui/panel-styles';
import { useDaoContext } from '@/contexts/dao-context';
import { treasuryIsAdmin } from '@/lib/admin-proposals';
import { adminReadOptions, useAdminArtwork, useAdminTokenState } from '@/lib/admin-surfaces';
import { checkNewLink, managerClient, useLinkAvailability, useManagerLink } from '@/lib/community-link';
import { buildProfilePlan, type CommunityProfile, type ProfileStep } from '@/lib/community-profile-plan';
import { validateArtworkSetting } from '@/lib/proposal-actions/artwork-admin-actions';
import { getActionHandler } from '@/lib/proposal-actions/registry';
import { getProposalActionSummary } from '@/lib/proposal-call';
import { waitForConfirmation } from '@/lib/transaction-confirmation';
import { useTransactionFeedback } from '@/lib/transaction-feedback';
import { useAdminProposalDraft } from '@/lib/use-admin-proposal-draft';
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

/**
 * Manage → Community profile: the name, symbol, image, description and website people see.
 * During setup the launch admin applies changes directly; after launch they become one proposal.
 */
export function CommunityProfileEditor() {
  const { daoId, routeId, daoConfig: config } = useDaoContext();
  const session = useAuthSessionStore();
  const token = useAdminTokenState(config, session.address);
  const artwork = useAdminArtwork(config, session.address);
  const draft = useAdminProposalDraft();
  const tx = useTransactionFeedback(config.name);
  const [edits, setEdits] = useState<Partial<CommunityProfile>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<{ url: string; file: File } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const settings = artwork.data?.settings;
  const current: CommunityProfile = {
    name: config.tokenName,
    symbol: config.tokenSymbol,
    uri: config.tokenUri ?? '',
    image: settings?.contract_image ?? config.contractImage,
    description: settings?.description ?? config.tokenDescription,
    website: settings?.project_uri ?? ''
  };
  const value = (key: keyof CommunityProfile) => edits[key] ?? current[key];
  const changed = (key: keyof CommunityProfile) =>
    edits[key] !== undefined && edits[key]!.trim() !== current[key].trim();
  const set = (patch: Partial<CommunityProfile>) => {
    setMessage('');
    setEdits((previous) => ({ ...previous, ...patch }));
  };
  const reset = (key: keyof CommunityProfile) =>
    setEdits((previous) => {
      const next = { ...previous };
      delete next[key];
      return next;
    });

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

  const steps = buildProfilePlan(current, edits);
  const stepError = (step: ProfileStep) =>
    step.type === 'set-token-metadata'
      ? getActionHandler('set-token-metadata').validate(step.values, context)
      : validateArtworkSetting(step.values.value, step.type);
  const errors = Object.fromEntries(
    steps.flatMap((step) => {
      const result = stepError(step);
      if (result.valid) return [];
      if (step.type === 'set-token-metadata')
        return Object.entries(('fields' in result && result.fields) || { name: result.message });
      const key = {
        'set-artwork-contract-image': 'image',
        'set-artwork-description': 'description',
        'set-artwork-project-uri': 'website'
      }[step.type];
      return [[key, result.message]];
    })
  ) as Record<string, string>;
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
      set({ image: url });
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
    draft.requestAdd({
      daoId,
      action,
      source: 'admin/profile/change-dao-slug',
      metadata: {
        title: `Change our link to /dao/${nextLink}`,
        description: getProposalActionSummary(action),
        url: ''
      },
      onAdded: () => setLinkEdit(undefined)
    });
  }

  function addToProposal() {
    if (!steps.length || blocked) return;
    draft.requestAddBatch({
      daoId,
      requests: steps.map((step) => {
        const handler = getActionHandler(step.type);
        return {
          daoId,
          action: handler.serialize(step.values, context),
          source: `admin/profile/${step.type}`,
          metadata: { title: step.title, description: `${step.title}: ${step.detail}.`, url: '' }
        };
      }),
      onAdded: () => setEdits({})
    });
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
            signTransaction: sign
          });
          assembled = await client.set_metadata(step.values);
        } else {
          const client = new MetadataClient({
            ...adminReadOptions(config, config.metadataContractId, session.address),
            signTransaction: sign
          });
          const value = step.values.value;
          const call =
            step.type === 'set-artwork-contract-image'
              ? await client.update_contract_image({ new_contract_image: value })
              : step.type === 'set-artwork-description'
                ? await client.update_description({ new_description: value })
                : await client.update_project_uri({ new_project_uri: value });
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
        } else
          reset(
            {
              'set-artwork-contract-image': 'image',
              'set-artwork-description': 'description',
              'set-artwork-project-uri': 'website'
            }[step.type] as keyof CommunityProfile
          );
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
  const submitLabel = direct ? `Apply ${count}` : `Add ${count} to your proposal`;
  const submit = (
    <Button
      disabled={disabled || !shownSteps.length || blocked || (direct && !networkReady)}
      loading={busy}
      onClick={() => (direct ? void applyDirectly() : addToProposal())}
    >
      {submitLabel}
    </Button>
  );

  return (
    <>
      <AdminProposalDraftDialog pending={draft.pending} onCancel={draft.cancel} onResolve={draft.resolve} />
      <section className={card} aria-labelledby="profile-title">
        <div>
          <h2 id="profile-title" className={title}>
            How people see {config.tokenName || 'your community'}
          </h2>
          <p className={muted}>
            {direct
              ? 'During setup, changes apply right away.'
              : live
                ? 'Changes go into a proposal for members to vote on.'
                : 'Connect the launch admin wallet to change these during setup.'}
          </p>
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
                src={preview?.url ?? value('image')}
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
              <Button size="sm" variant="secondary" disabled={disabled} onClick={() => fileInput.current?.click()}>
                Choose image
              </Button>
            )}
            <Changed
              show={changed('image') || Boolean(preview)}
              onUndo={() => {
                setPreview(null);
                reset('image');
              }}
            />
            {errors.image ? <p className={error}>{errors.image}</p> : null}
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
            <div className={field}>
              <FieldLabel htmlFor="profile-description">Description</FieldLabel>
              <Textarea
                id="profile-description"
                rows={3}
                value={value('description')}
                disabled={disabled}
                aria-invalid={Boolean(errors.description) || undefined}
                onChange={(event) => set({ description: event.target.value })}
              />
              <Changed show={changed('description')} onUndo={() => reset('description')} />
              {errors.description ? <p className={error}>{errors.description}</p> : null}
            </div>
            <div className={field}>
              <FieldLabel htmlFor="profile-website">Website</FieldLabel>
              <Input
                id="profile-website"
                type="url"
                value={value('website')}
                disabled={disabled}
                aria-invalid={Boolean(errors.website) || undefined}
                onChange={(event) => set({ website: event.target.value })}
              />
              <Changed show={changed('website')} onUndo={() => reset('website')} />
              {errors.website ? <p className={error}>{errors.website}</p> : null}
            </div>
          </div>
        </div>

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
              The new link is yours once you launch. If another community launches first with it, pick another.
            </p>
          ) : null}
          {preview ? <p className={hint}>Upload the new image to include it.</p> : null}
          {!direct && linkStep ? (
            <div className={cx(planGroup, stepRow)}>
              <span className={stepTitle}>In its own proposal: change the link</span>
              <span className={stepDetail}>{linkStep.detail}</span>
              <p className={planNote}>
                /dao/{currentLink} is freed when it passes. Old links lead here until another community takes it, which
                can happen right away. If /dao/{nextLink} is taken before the vote, that proposal fails and you can
                propose another link.
              </p>
              <div>
                <Button variant={steps.length ? 'secondary' : 'primary'} disabled={busy} onClick={proposeLink}>
                  Propose the new link
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        {message ? <Callout variant="warning" title={message} role="alert" /> : null}
        {/* With only a new link after launch, its own button is the one action. */}
        {shownSteps.length || !linkStep ? <div className={footer}>{submit}</div> : null}
      </section>
      {shownSteps.length ? <ActionBar mobileOnly>{submit}</ActionBar> : null}
    </>
  );
}
