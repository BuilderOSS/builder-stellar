'use client';

import { Client as MetadataClient } from '@builder-stellar/metadata-bindings';
import { Client as TokenClient } from '@builder-stellar/token-bindings';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { ImageUp } from 'lucide-react';
import { type ReactNode, useRef, useState } from 'react';
import { css } from 'styled-system/css';
import useSWR from 'swr';

import { AdminProposalDraftDialog } from '@/components/admin/admin-proposal-draft-dialog';
import { prepareDaoImage, uploadDaoImage } from '@/components/create-dao/dao-image-upload';
import {
  ActionBar,
  Button,
  ButtonLink,
  Callout,
  Chip,
  Crest,
  FieldHelperText,
  FieldLabel,
  Input,
  Textarea
} from '@/components/ui';
import { card, muted, title } from '@/components/ui/panel-styles';
import { useDaoContext } from '@/contexts/dao-context';
import { treasuryIsAdmin } from '@/lib/admin-proposals';
import { adminReadOptions, useAdminArtwork, useAdminTokenState } from '@/lib/admin-surfaces';
import {
  buildProfilePlan,
  type CommunityProfile,
  type ProfileStep,
  tokenReportsRenames
} from '@/lib/community-profile-plan';
import { daoAdminRoute } from '@/lib/dao-routes';
import { validateArtworkSetting } from '@/lib/proposal-actions/artwork-admin-actions';
import { getActionHandler } from '@/lib/proposal-actions/registry';
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
const undo = css({
  p: '0',
  bg: 'transparent',
  border: '0',
  color: 'signal',
  textStyle: 'caption',
  fontWeight: '600',
  cursor: 'pointer',
  _hover: { textDecoration: 'underline' },
  _focusVisible: { outline: '2px solid', outlineColor: 'signal', outlineOffset: '2px', borderRadius: 'sm' }
});
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
const footer = css({ display: 'flex', justifyContent: 'flex-end' });

function Changed({ show, onUndo, children }: { show: boolean; onUndo: () => void; children?: ReactNode }) {
  return (
    <div className={hintRow}>
      {children}
      {show ? (
        <>
          <Chip tone="live">Changed</Chip>
          <button type="button" className={undo} onClick={onUndo}>
            Undo
          </button>
        </>
      ) : null}
    </div>
  );
}

/** Read the token's release, so renames are only offered where the app will see them. */
function useTokenVersion(tokenContractId: string, readOptions: ReturnType<typeof adminReadOptions>) {
  return useSWR(tokenContractId ? ['token-version', tokenContractId] : null, async () => {
    const client = new TokenClient(readOptions);
    return (await client.version()).result;
  });
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
  const version = useTokenVersion(
    config.tokenContractId,
    adminReadOptions(config, config.tokenContractId, session.address)
  );
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
  const renamesVisible = tokenReportsRenames(version.data);
  const networkReady =
    !session.walletNetworkIssue &&
    (!session.walletNetworkPassphrase || session.walletNetworkPassphrase === config.passphrase);
  const context = { config, session: { address: session.address, kit: StellarWalletsKit } };

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
  const blocked = Object.keys(errors).length > 0 || Boolean(preview);

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
    if (!session.address || !steps.length || blocked || !networkReady) return;
    setBusy(true);
    const sign = (xdr: string, opts?: { networkPassphrase?: string; address?: string }) =>
      signWithWallet(xdr, { ...opts, address: session.address!, networkPassphrase: config.passphrase });
    try {
      for (const [index, step] of steps.entries()) {
        const label = steps.length > 1 ? `${step.title} (step ${index + 1} of ${steps.length})` : step.title;
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
    } catch (failure) {
      tx.fail(failure, 'Profile update failed');
    } finally {
      setBusy(false);
      await Promise.all([artwork.mutate(), token.mutate()]);
    }
  }

  const disabled = busy || !canAct;
  const count = steps.length ? `${steps.length} ${steps.length === 1 ? 'change' : 'changes'}` : 'changes';
  const submitLabel = direct ? `Apply ${count}` : `Add ${count} to your proposal`;
  const submit = (
    <Button
      disabled={disabled || !steps.length || blocked || (direct && !networkReady)}
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
            {!renamesVisible && version.data ? (
              <Callout
                variant="info"
                title="Renaming needs the newer token contract"
                description={`This community's token is on ${version.data}. Update it to 0.2.0 in Contract versions, then rename here.`}
              >
                <div>
                  <ButtonLink href={daoAdminRoute(routeId, '/upgrades')} variant="secondary" size="sm">
                    Open Contract versions
                  </ButtonLink>
                </div>
              </Callout>
            ) : null}
            <div className={twoCol}>
              <div className={field}>
                <FieldLabel htmlFor="profile-name">Name</FieldLabel>
                <Input
                  id="profile-name"
                  value={value('name')}
                  maxLength={MAX_TOKEN_NAME_BYTES}
                  disabled={disabled || !renamesVisible}
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
                  disabled={disabled || !renamesVisible}
                  aria-invalid={Boolean(errors.symbol) || undefined}
                  onChange={(event) => set({ symbol: event.target.value.toUpperCase() })}
                />
                <Changed show={changed('symbol')} onUndo={() => reset('symbol')} />
                {errors.symbol ? <p className={error}>{errors.symbol}</p> : null}
              </div>
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
            <div className={field}>
              <span className={css({ textStyle: 'label', color: 'ink' })}>Link</span>
              <p className={hint}>/dao/{routeId}</p>
              <FieldHelperText>
                {live ? 'Your link is permanent.' : 'Your link is claimed at launch and then permanent.'}
              </FieldHelperText>
            </div>
          </div>
        </div>

        <div className={planBox} aria-live="polite">
          <h3 className={css({ textStyle: 'subheading', m: '0' })}>
            {direct ? 'This will' : 'If the proposal passes, it will'}
          </h3>
          {steps.length ? (
            <ol className={stepList}>
              {steps.map((step) => (
                <li key={step.type} className={stepRow}>
                  <span className={stepTitle}>{step.title}</span>
                  <span className={stepDetail}>{step.detail}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className={hint}>Change something above to see what will happen.</p>
          )}
          {preview ? <p className={hint}>Upload the new image to include it.</p> : null}
        </div>

        {message ? <Callout variant="warning" title={message} role="alert" /> : null}
        <div className={footer}>{submit}</div>
      </section>
      {steps.length ? <ActionBar mobileOnly>{submit}</ActionBar> : null}
    </>
  );
}
