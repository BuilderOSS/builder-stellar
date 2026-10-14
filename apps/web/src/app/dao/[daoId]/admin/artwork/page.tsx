'use client';

import { Client as MetadataClient } from '@builder-stellar/metadata-bindings';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import NextLink from 'next/link';
import { useState } from 'react';
import { css } from 'styled-system/css';
import { Stack } from 'styled-system/jsx';

import { AdminProposalDraftDialog } from '@/components/admin/admin-proposal-draft-dialog';
import { artworkAppendPlan } from '@/components/admin/artwork-admin-plan';
import { ArtworkLayers } from '@/components/admin/artwork-layers';
import { UnseededTokens } from '@/components/admin/unseeded-tokens';
import type { ArtworkPlan } from '@/components/create-dao/artwork-configuration';
import { ArtworkDirectoryUpload } from '@/components/create-dao/ArtworkDirectoryUpload';
import { ArtworkSetup } from '@/components/create-dao/ArtworkSetup';
import { PageSection } from '@/components/page-section';
import {
  Button,
  Callout,
  Card,
  ConfirmAction,
  Disclosure,
  Field,
  FieldHelperText,
  FieldLabel,
  Heading,
  Input,
  Text,
  Textarea
} from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { treasuryIsAdmin } from '@/lib/admin-proposals';
import { assertAdminCallSupported } from '@/lib/admin-registered-call';
import { adminReadOptions, useAdminArtwork, useAdminTokenState } from '@/lib/admin-surfaces';
import { daoAdminRoute } from '@/lib/dao-routes';
import { validateArtworkSetting } from '@/lib/proposal-actions/artwork-admin-actions';
import { getActionHandler } from '@/lib/proposal-actions/registry';
import { restoreArchivedState } from '@/lib/restore-archived-client';
import { waitForConfirmation } from '@/lib/transaction-confirmation';
import { useTransactionFeedback } from '@/lib/transaction-feedback';
import { useAdminProposalDraft } from '@/lib/use-admin-proposal-draft';
import { signWithWallet } from '@/lib/wallet-sign';
import { useAuthSessionStore } from '@/stores/auth-session-store';

/** A renderer change goes to a vote with its reasons; this is the shortest reason we accept. */
const MIN_REASON = 20;

const current = css({ textStyle: 'mono', fontSize: '0.8125rem', color: 'ink', m: '0', overflowWrap: 'anywhere' });

export default function ArtworkAdminPage() {
  const { daoId, daoConfig: config, routeId } = useDaoContext();
  const session = useAuthSessionStore();
  const token = useAdminTokenState(config, session.address);
  const artwork = useAdminArtwork(config, session.address);
  const proposal = useAdminProposalDraft();
  const tx = useTransactionFeedback(config.name);
  const [renderer, setRenderer] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [upload, setUpload] = useState<ArtworkPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  // Artwork changes are authorized by the artwork contract's own admin: the launch
  // admin in setup, the Treasury (so a proposal) after launch.
  const wired = artwork.data?.settings.token === config.tokenContractId;
  const direct = Boolean(wired && session.address && artwork.data?.admin === session.address);
  const canPropose = Boolean(
    wired && session.address && token.data?.live && treasuryIsAdmin(config, artwork.data?.admin)
  );
  const networkReady =
    !session.walletNetworkIssue &&
    (!session.walletNetworkPassphrase || session.walletNetworkPassphrase === config.passphrase);
  const context = { config, session: { address: session.address, kit: StellarWalletsKit } };
  const currentRenderer = artwork.data?.settings.renderer_base ?? '';
  const nextRenderer = (renderer ?? currentRenderer).trim();
  const rendererChanged = Boolean(nextRenderer) && nextRenderer !== currentRenderer;
  const reasonReady = reason.trim().length >= MIN_REASON;

  function checkRenderer() {
    const validation = validateArtworkSetting(nextRenderer, 'set-artwork-renderer');
    if (!validation.valid) {
      setMessage(validation.message);
      return false;
    }
    return true;
  }

  function proposeRenderer() {
    if (!canPropose || busy || !networkReady || !checkRenderer() || !reasonReady) return;
    const handler = getActionHandler('set-artwork-renderer');
    try {
      assertAdminCallSupported(handler, { value: nextRenderer }, context);
    } catch (error) {
      return setMessage((error as Error).message);
    }
    proposal.requestAdd({
      daoId,
      action: handler.serialize({ value: nextRenderer }, context),
      source: 'admin/artwork/set-artwork-renderer',
      metadata: {
        title: 'Change where token images are drawn',
        description: `Every token's image will be drawn from ${nextRenderer} instead of ${currentRenderer || 'the current renderer'}.\n\nWhy: ${reason.trim()}`,
        url: ''
      }
    });
  }

  async function applyRenderer() {
    if (!session.address || !direct || busy || !networkReady || !checkRenderer()) return;
    setBusy(true);
    setMessage('');
    tx.start('Change the renderer');
    try {
      const client = new MetadataClient({
        ...adminReadOptions(config, config.metadataContractId, session.address),
        ...restoreArchivedState,
        signTransaction: (xdr, opts) =>
          signWithWallet(xdr, { ...opts, address: session.address!, networkPassphrase: config.passphrase })
      });
      const assembled = await client.update_renderer_base({ new_renderer_base: nextRenderer });
      assembled.result.unwrap();
      const sent = await assembled.signAndSend();
      const hash = sent.sendTransactionResponse?.hash ?? '';
      tx.submitted('Renderer change submitted', hash);
      await waitForConfirmation(hash, config.rpcUrl);
      tx.success('Token images now come from the new renderer', hash);
      setRenderer(null);
      await artwork.mutate();
    } catch (error) {
      tx.fail(error, "The renderer didn't change", 'metadata');
    } finally {
      setBusy(false);
    }
  }

  async function proposeUpload() {
    const appendHandler = getActionHandler('add-artwork-properties');
    if (!upload || !canPropose || !networkReady || busy) return;
    setBusy(true);
    try {
      // Read the layer count again just before numbering the new ones; the contract
      // still checks them when the proposal runs.
      const fresh = await artwork.mutate();
      if (!fresh) throw new Error("The current artwork didn't load. Try again.");
      const batches = artworkAppendPlan(upload, fresh.properties.length);
      for (const batch of batches) {
        const validation = appendHandler.validate(batch, context);
        if (!validation.valid) throw new Error(validation.message);
        assertAdminCallSupported(appendHandler, batch, context);
      }
      proposal.requestAddBatch({
        daoId,
        requests: batches.map((batch, index) => ({
          daoId,
          action: appendHandler.serialize(batch, context),
          source: 'admin/artwork/add-artwork-properties',
          metadata: {
            title: 'Add new artwork layers',
            description: `Part ${index + 1} of ${batches.length} of a new artwork upload (${upload.baseUri}). It adds to the ${fresh.properties.length} existing layers and changes none of them. If another artwork proposal runs first, this one fails rather than numbering layers wrongly.`,
            url: ''
          }
        })),
        onAdded: () =>
          setMessage(
            `Added the new layers to your proposal draft${batches.length > 1 ? ` in ${batches.length} parts` : ''}.`
          )
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The new layers couldn't be added to a proposal.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AdminProposalDraftDialog pending={proposal.pending} onCancel={proposal.cancel} onResolve={proposal.resolve} />
      <PageSection
        title="Artwork"
        description="The layers every token is drawn from. Add them during setup; change them by vote after launch."
      >
        <Stack gap="4">
          {!config.metadataContractId ? (
            <Callout
              variant="warning"
              title="This community has no artwork contract on record"
              description="It's created with the community, so this usually means the app's copy is out of date. Refresh the page; if it stays, ask the deployment admin to check it."
            />
          ) : null}
          {artwork.error || token.error ? (
            <Callout
              variant="error"
              title="The artwork didn't load"
              description={(artwork.error || token.error).message}
            >
              <div className={css({ mt: '3' })}>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={artwork.isValidating}
                  onClick={() => void Promise.all([artwork.mutate(), token.mutate()])}
                >
                  Try again
                </Button>
              </div>
            </Callout>
          ) : null}
          {artwork.data && !wired ? (
            <Callout
              variant="error"
              title="This artwork belongs to a different token"
              description="Changes are turned off because the artwork contract doesn't point at this community's token."
            />
          ) : null}
          {artwork.data && wired && !direct && !canPropose ? (
            <Callout
              variant="info"
              title="You can look, but not change the artwork"
              description={
                token.data?.live
                  ? 'After launch, artwork changes go through a proposal. Connect a wallet to start one.'
                  : 'During setup, only the launch admin can change the artwork.'
              }
            />
          ) : null}
          {message ? (
            <div role="status">
              <Callout variant="warning" title={message} />
            </div>
          ) : null}

          {artwork.data && wired ? (
            <UnseededTokens
              daoId={daoId}
              config={config}
              address={session.address}
              direct={direct}
              canPropose={canPropose}
              hasArtwork={artwork.data.properties.length > 0}
              proposal={proposal}
            />
          ) : null}

          {direct && token.data?.live === false ? (
            <Card p="5">
              <Stack gap="3">
                <Heading size="heading">
                  {artwork.data?.properties.length ? 'Finish adding your artwork' : 'Add your artwork'}
                </Heading>
                {artwork.data?.properties.length ? (
                  <Text color="ink.muted">
                    Your artwork is in. If an upload stopped partway, pick it up here; this never replaces the layers
                    already added.
                  </Text>
                ) : null}
                <ArtworkSetup daoId={daoId} config={config} />
              </Stack>
            </Card>
          ) : null}

          {canPropose ? (
            <Card p="5">
              <Stack gap="3">
                <Heading size="heading">Add new layers by vote</Heading>
                <Text color="ink.muted">
                  Upload a folder of new layers. They&apos;re added after the existing ones, which stay exactly as they
                  are.
                </Text>
                {session.authStatus !== 'authenticated' ? (
                  <Callout
                    variant="info"
                    title="Sign in with your wallet to upload"
                    description="Uploading doesn't change anything on chain. The layers are added only if the proposal passes."
                  />
                ) : null}
                <ArtworkDirectoryUpload disabled={busy} onComplete={setUpload} />
                {upload ? (
                  <Text>
                    Uploaded {upload.properties.length} new {upload.properties.length === 1 ? 'layer' : 'layers'}.
                  </Text>
                ) : null}
                <div>
                  <Button
                    type="button"
                    disabled={busy || !upload || !networkReady}
                    onClick={() => void proposeUpload()}
                  >
                    Add the new layers to a proposal
                  </Button>
                </div>
              </Stack>
            </Card>
          ) : null}

          {artwork.data ? (
            <ArtworkLayers
              config={config}
              address={session.address}
              layers={artwork.data.properties}
              groupCount={artwork.data.groupCount}
              refreshing={busy || artwork.isValidating}
              onRefresh={() => void Promise.all([artwork.mutate(), token.mutate()])}
            />
          ) : artwork.isLoading ? (
            <Text role="status" color="ink.muted">
              Reading the artwork…
            </Text>
          ) : null}

          {artwork.data ? (
            <Disclosure title="Advanced: where token images are drawn">
              <Stack gap="4">
                <Text color="ink.muted">
                  Wallets and markets ask this address for every token&apos;s image. Change it only to move to a new
                  renderer you trust; a wrong address breaks every token image at once. The community&apos;s own image,
                  description and links are in{' '}
                  <NextLink href={daoAdminRoute(routeId, '/profile')} className={css({ color: 'signal' })}>
                    Community profile
                  </NextLink>
                  .
                </Text>
                <div>
                  <Text textStyle="caption" color="ink.muted">
                    Renderer now
                  </Text>
                  <p className={current}>{currentRenderer || 'Not set'}</p>
                </div>
                {direct || canPropose ? (
                  <>
                    <Field>
                      <FieldLabel htmlFor="renderer-base">New renderer address</FieldLabel>
                      <Input
                        id="renderer-base"
                        autoComplete="off"
                        spellCheck={false}
                        inputMode="url"
                        value={renderer ?? currentRenderer}
                        disabled={busy}
                        onChange={(event) => setRenderer(event.target.value)}
                      />
                      <FieldHelperText>An https:// or ipfs:// address.</FieldHelperText>
                    </Field>
                    {canPropose ? (
                      <Field>
                        <FieldLabel htmlFor="renderer-reason">Why change it?</FieldLabel>
                        <Textarea
                          id="renderer-reason"
                          rows={3}
                          value={reason}
                          disabled={busy}
                          onChange={(event) => setReason(event.target.value)}
                        />
                        <FieldHelperText>
                          Members read this in the proposal. Say what the new renderer is, who runs it and why it&apos;s
                          better.
                        </FieldHelperText>
                      </Field>
                    ) : null}
                    <div>
                      {direct ? (
                        <ConfirmAction
                          title="Change where every token image comes from?"
                          description="Token images in wallets and markets switch to the new address as soon as this confirms."
                          confirmLabel="Change the renderer"
                          cancelLabel="Keep the current one"
                          busy={busy}
                          onConfirm={() => void applyRenderer()}
                          trigger={
                            <Button variant="secondary" disabled={busy || !networkReady || !rendererChanged}>
                              Change the renderer
                            </Button>
                          }
                        />
                      ) : (
                        <Button
                          variant="secondary"
                          disabled={busy || !networkReady || !rendererChanged || !reasonReady}
                          onClick={proposeRenderer}
                        >
                          Add to proposal
                        </Button>
                      )}
                    </div>
                  </>
                ) : null}
              </Stack>
            </Disclosure>
          ) : null}
        </Stack>
      </PageSection>
    </>
  );
}
