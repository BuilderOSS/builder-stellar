'use client';

import { Client as MetadataClient } from '@builder-stellar/metadata-bindings';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { useState } from 'react';
import { Stack } from 'styled-system/jsx';

import { AdminProposalDraftDialog } from '@/components/admin/admin-proposal-draft-dialog';
import { AdminSurfaceNav as AdminSectionNav } from '@/components/admin/admin-surface-nav';
import { artworkAppendPlan } from '@/components/admin/artwork-admin-plan';
import { ArtworkStateInspector } from '@/components/admin/artwork-state-inspector';
import type { ArtworkPlan } from '@/components/create-dao/artwork-configuration';
import { ArtworkDirectoryUpload } from '@/components/create-dao/ArtworkDirectoryUpload';
import { ArtworkSetup } from '@/components/create-dao/ArtworkSetup';
import { PageSection } from '@/components/page-section';
import { Button, Callout, Card, Heading, Input, ShortId, Text } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { treasuryIsAdmin } from '@/lib/admin-proposals';
import { assertAdminCallSupported } from '@/lib/admin-registered-call';
import { adminReadOptions, useAdminArtwork, useAdminTokenState } from '@/lib/admin-surfaces';
import {
  artworkSettingMethods,
  type ArtworkSettingType,
  validateArtworkSetting
} from '@/lib/proposal-actions/artwork-admin-actions';
import { getAllActionHandlers } from '@/lib/proposal-actions/registry';
import { waitForConfirmation } from '@/lib/transaction-confirmation';
import { useTransactionFeedback } from '@/lib/transaction-feedback';
import { useAdminProposalDraft } from '@/lib/use-admin-proposal-draft';
import { useAuthSessionStore } from '@/stores/auth-session-store';

const fields = [
  { type: 'set-artwork-renderer', key: 'renderer_base', label: 'Renderer URL' },
  { type: 'set-artwork-project-uri', key: 'project_uri', label: 'Project URL' },
  { type: 'set-artwork-contract-image', key: 'contract_image', label: 'Collection image URL' },
  { type: 'set-artwork-description', key: 'description', label: 'Collection description' }
] as const;

export default function ArtworkAdminPage() {
  const { daoId, daoConfig: config } = useDaoContext();
  const session = useAuthSessionStore();
  const token = useAdminTokenState(config, session.address);
  const artwork = useAdminArtwork(config, session.address);
  const proposal = useAdminProposalDraft();
  const tx = useTransactionFeedback(config.name);
  const [edits, setEdits] = useState<Partial<Record<ArtworkSettingType, string>>>({});
  const [upload, setUpload] = useState<ArtworkPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  // Artwork and settings authority is Metadata's own admin() (launch admin in
  // setup, the Treasury after launch).
  const wired = artwork.data?.settings.token === config.tokenContractId;
  const direct = Boolean(wired && session.address && artwork.data?.admin === session.address);
  const canPropose = Boolean(
    wired && session.address && token.data?.live && treasuryIsAdmin(config, artwork.data?.admin)
  );
  const networkReady =
    !session.walletNetworkIssue &&
    (!session.walletNetworkPassphrase || session.walletNetworkPassphrase === config.passphrase);
  const context = { config, session: { address: session.address, kit: StellarWalletsKit } };
  const handlers = getAllActionHandlers();
  const appendHandler = handlers.find((handler) => String(handler.type) === 'add-artwork-properties');

  async function applySetting(type: ArtworkSettingType) {
    if (!session.address || busy || !networkReady || (!direct && !canPropose)) return;
    const value = edits[type]?.trim() ?? '';
    const validation = validateArtworkSetting(value, type);
    if (!validation.valid) return setMessage(validation.message);
    const registered = handlers.find((handler) => String(handler.type) === type);
    if (!direct) {
      if (!registered)
        return setMessage('Metadata governance encoding is not registered in this build. No proposal was added.');
      try {
        assertAdminCallSupported(registered, { value }, context);
      } catch (error) {
        return setMessage((error as Error).message);
      }
      proposal.requestAdd({
        daoId,
        action: registered.serialize({ value }, context),
        source: `admin/artwork/${type}`,
        metadata: { title: registered.label, description: `Set artwork metadata to ${value}.`, url: '' }
      });
      return;
    }
    setBusy(true);
    setMessage('');
    tx.start('Update artwork metadata');
    try {
      const client = new MetadataClient({
        ...adminReadOptions(config, config.metadataContractId, session.address),
        signTransaction: (xdr, opts) =>
          StellarWalletsKit.signTransaction(xdr, {
            ...opts,
            address: session.address!,
            networkPassphrase: config.passphrase
          })
      });
      const assembled =
        type === 'set-artwork-renderer'
          ? await client.update_renderer_base({ new_renderer_base: value })
          : type === 'set-artwork-description'
            ? await client.update_description({ new_description: value })
            : type === 'set-artwork-project-uri'
              ? await client.update_project_uri({ new_project_uri: value })
              : await client.update_contract_image({ new_contract_image: value });
      assembled.result.unwrap();
      const sent = await assembled.signAndSend();
      const hash = sent.sendTransactionResponse?.hash ?? '';
      tx.submitted('Artwork metadata submitted', hash);
      await waitForConfirmation(hash, config.rpcUrl);
      tx.success('Artwork metadata updated', hash);
      await artwork.mutate();
    } catch (error) {
      tx.fail(error, 'Artwork metadata update failed', 'metadata');
    } finally {
      setBusy(false);
    }
  }

  async function proposeUpload() {
    if (!upload || !appendHandler || !canPropose || !networkReady || busy) return;
    setBusy(true);
    try {
      // Read count again just before building IDs; contract execution still checks
      // them. Governance reviewers must check no other artwork batch precedes it.
      const current = await artwork.mutate();
      if (!current) throw new Error('Current artwork state is unavailable.');
      const batches = artworkAppendPlan(upload, current.properties.length);
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
            title: 'Append DAO artwork',
            description: `Artwork batch ${index + 1} of ${batches.length}. IPFS: ${upload.baseUri}. Expected starting property count: ${current.properties.length}. Review absolute IDs and ordering before execution.`,
            url: ''
          }
        })),
        onAdded: () => setMessage(`${batches.length} artwork batches added to the proposal draft.`)
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not prepare artwork proposal.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AdminProposalDraftDialog pending={proposal.pending} onCancel={proposal.cancel} onResolve={proposal.resolve} />
      <PageSection
        title="Artwork configuration"
        description="Read on-chain artwork, install setup layers, and govern collection metadata."
      >
        <Stack gap="4">
          <AdminSectionNav daoId={daoId} active="/artwork" />
          {!config.metadataContractId ? (
            <Callout
              variant="warning"
              title="Metadata contract address is missing"
              description="The Manager creates Metadata with the DAO, not at launch. Refresh the DAO configuration or ask the deployment admin to inspect it."
            />
          ) : null}
          {artwork.isLoading || token.isLoading ? <Text role="status">Reading artwork and Token admin…</Text> : null}
          {artwork.error || token.error ? (
            <Callout
              variant="error"
              title="Artwork state unavailable"
              description={(artwork.error || token.error).message}
            />
          ) : null}
          <Button
            type="button"
            variant="outline"
            disabled={busy || artwork.isLoading}
            onClick={() => void Promise.all([artwork.mutate(), token.mutate()])}
          >
            Refresh artwork and authority
          </Button>
          {config.metadataContractId ? <ShortId value={config.metadataContractId} label="Metadata contract" /> : null}
          {!direct && !canPropose ? (
            <Callout
              variant="info"
              title="Read-only artwork view"
              description="Artwork authority follows the current Token admin. Connect that wallet during setup, or prepare a governance proposal after Treasury owns the Token."
            />
          ) : null}
          {artwork.data && !wired ? (
            <Callout
              variant="error"
              title="Metadata points to another Token"
              description="Edits are blocked because Metadata's token address does not match this DAO."
            />
          ) : null}
          {message ? (
            <div role="status">
              <Callout variant="warning" title={message} />
            </div>
          ) : null}
          {artwork.data ? (
            <>
              <Card p="5">
                <Stack gap="4">
                  <Heading style={{ fontSize: '1.2rem' }}>Collection metadata</Heading>
                  <Text>
                    These settings are on-chain. Uploading to IPFS alone does not update them. Renderer changes can
                    affect existing token images.
                  </Text>
                  {fields.map(({ type, key, label }) => {
                    const registered = handlers.some((handler) => String(handler.type) === type);
                    return (
                      <Stack gap="2" key={key}>
                        <Text style={{ overflowWrap: 'anywhere' }}>
                          Current {label.toLowerCase()}: {artwork.data!.settings[key] || 'Not set'}
                        </Text>
                        <label htmlFor={key}>
                          {label}
                          <Input
                            id={key}
                            name={key}
                            autoComplete="off"
                            spellCheck={type === 'set-artwork-description'}
                            value={edits[type] ?? artwork.data!.settings[key]}
                            disabled={busy || (!direct && !canPropose)}
                            onChange={(event) => setEdits((current) => ({ ...current, [type]: event.target.value }))}
                          />
                        </label>
                        {direct || (canPropose && registered) ? (
                          <Button
                            type="button"
                            variant="outline"
                            disabled={
                              busy ||
                              !networkReady ||
                              !edits[type]?.trim() ||
                              edits[type]?.trim() === artwork.data!.settings[key]
                            }
                            onClick={() => void applySetting(type)}
                          >
                            {direct ? `Apply ${label.toLowerCase()}` : 'Add to proposal'}
                          </Button>
                        ) : null}
                      </Stack>
                    );
                  })}
                  {canPropose &&
                  fields.some(({ type }) => !handlers.some((handler) => String(handler.type) === type)) ? (
                    <Callout
                      variant="warning"
                      title="Metadata governance integration required"
                      description={`This build does not register artwork actions and Metadata target encoding yet. No transaction or proposal is created here until those safeguards are integrated. ABI methods: ${Object.values(artworkSettingMethods).join(', ')}.`}
                    />
                  ) : null}
                </Stack>
              </Card>
              <ArtworkStateInspector
                config={config}
                address={session.address}
                propertyCount={artwork.data.properties.length}
                groupCount={artwork.data.groupCount}
              />
              {direct && token.data?.live === false ? (
                <Card p="5">
                  <Stack gap="3">
                    <Heading style={{ fontSize: '1.2rem' }}>Install setup artwork</Heading>
                    {!artwork.data.properties.length ? (
                      <ArtworkSetup daoId={daoId} config={config} />
                    ) : (
                      <Text>
                        Artwork is already installed. The setup installer can resume a saved batch plan but does not
                        replace an existing collection.
                      </Text>
                    )}
                    {artwork.data.properties.length ? <ArtworkSetup daoId={daoId} config={config} /> : null}
                  </Stack>
                </Card>
              ) : null}
              {canPropose ? (
                <Card p="5">
                  <Stack gap="3">
                    <Heading style={{ fontSize: '1.2rem' }}>Append artwork through governance</Heading>
                    <Text>
                      Upload a directory of new layers. Each call adds at most 30 items and an IPFS group. Existing
                      property and item IDs stay intact; this is not a reset.
                    </Text>
                    <ArtworkDirectoryUpload disabled={busy} onComplete={setUpload} />
                    {session.authStatus !== 'authenticated' ? (
                      <Callout
                        variant="info"
                        title="Authenticate your wallet to upload artwork"
                        description="Directory uploads use the existing authenticated upload service. Uploading does not change the metadata contract until a signed transaction or governance proposal executes."
                      />
                    ) : null}
                    {upload ? (
                      <Text>
                        {upload.properties.length} new layers · IPFS directory: {upload.baseUri}
                      </Text>
                    ) : null}
                    {appendHandler ? (
                      <Button
                        type="button"
                        disabled={busy || !upload || !networkReady}
                        onClick={() => void proposeUpload()}
                      >
                        Review artwork proposal batches
                      </Button>
                    ) : (
                      <Callout
                        variant="warning"
                        title="Artwork proposal registration required"
                        description="Directory upload is separate from governance. add_properties cannot be queued until the registry and Metadata ABI encoding are integrated. No proposal has been created."
                      />
                    )}
                  </Stack>
                </Card>
              ) : null}
            </>
          ) : null}
        </Stack>
      </PageSection>
    </>
  );
}
