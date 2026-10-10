'use client';

import { Client as TokenClient } from '@builder-stellar/token-bindings';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { useState } from 'react';
import { Grid, Stack } from 'styled-system/jsx';

import { AdminProposalDraftDialog } from '@/components/admin/admin-proposal-draft-dialog';
import { AdminSurfaceNav as AdminSectionNav } from '@/components/admin/admin-surface-nav';
import { AuthorityPanel } from '@/components/admin/authority-panel';
import { PageSection } from '@/components/page-section';
import { Badge, Callout, Card, Heading, ShortId, Text } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { treasuryIsOwner } from '@/lib/admin-proposals';
import { useContractOwner } from '@/lib/admin-queries';
import { useAdminTokenState } from '@/lib/admin-surfaces';
import { type DaoNetworkConfig } from '@/lib/dao-config';
import { useGoldskyMintAuthorities } from '@/lib/goldsky-queries';
import { getActionHandler } from '@/lib/proposal-actions/registry';
import { waitForConfirmation } from '@/lib/transaction-confirmation';
import { useTransactionFeedback } from '@/lib/transaction-feedback';
import { useAdminDraftStatus } from '@/lib/use-admin-draft-status';
import { useAdminProposalDraft } from '@/lib/use-admin-proposal-draft';
import { getStellarAddressError } from '@/lib/validation';
import { useAuthSessionStore } from '@/stores/auth-session-store';

async function submitAuthorityUpdate(
  config: DaoNetworkConfig,
  sessionAddress: string,
  authority: string,
  enabled: boolean
) {
  const client = new TokenClient({
    contractId: config.tokenContractId,
    rpcUrl: config.rpcUrl,
    networkPassphrase: config.passphrase,
    publicKey: sessionAddress,
    signTransaction: async (xdr: string, opts?: { networkPassphrase?: string; address?: string }) =>
      StellarWalletsKit.signTransaction(xdr, {
        networkPassphrase: opts?.networkPassphrase ?? config.passphrase,
        address: opts?.address ?? sessionAddress
      })
  });

  return (await client.set_mint_authority({ authority, enabled })).signAndSend();
}

export default function OwnerPage() {
  const { daoId, daoConfig: config } = useDaoContext();
  const session = useAuthSessionStore();
  const [mintAuthority, setMintAuthority] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const proposalDraft = useAdminProposalDraft();
  const draftStatus = useAdminDraftStatus(daoId, ['set-mint-authority']);
  const tx = useTransactionFeedback(config.name);
  const {
    data: mintAuthorities,
    mutate: refreshMintAuthorities,
    error: mintAuthorityError,
    isLoading: mintAuthoritiesLoading
  } = useGoldskyMintAuthorities(config.tokenContractId);
  const { data: tokenOwner } = useContractOwner(config, 'token', session.address || undefined);
  const token = useAdminTokenState(config, session.address);
  const isOwner = Boolean(session.address && token.data?.owner === session.address);
  const canProposeAuthority = Boolean(session.address && treasuryIsOwner(config, tokenOwner));

  if (!isOwner && !canProposeAuthority) {
    return (
      <PageSection title="Owner" description="Owner-only authority management.">
        <AdminSectionNav daoId={daoId} active="/owner" />
        <Callout
          variant="warning"
          badge="Access restricted"
          title="Connect the owner wallet to continue"
          description="Authority changes require the current Token owner. After launch, Treasury-owned changes go through governance."
        >
          <ShortId value={config.adminAddress} label="Owner address" />
        </Callout>
      </PageSection>
    );
  }

  async function updateAuthority(authority: string, enabled: boolean) {
    if (!session.address || !authority) {
      setFormMessage('Authority address is required.');
      return;
    }
    const addressError = getStellarAddressError(authority.trim());
    if (addressError) {
      setFormMessage(addressError);
      return;
    }
    if (
      session.walletNetworkIssue ||
      (session.walletNetworkPassphrase && session.walletNetworkPassphrase !== config.passphrase)
    ) {
      setFormMessage('Switch your wallet to the DAO network before preparing an authority update.');
      return;
    }

    if (!config.tokenContractId) {
      setFormMessage('Missing contract id in the active network config.');
      return;
    }

    // Mint authority changes fail with NotLive until the DAO has been launched.
    if (!token.data?.live) {
      setFormMessage('Mint authorities can only be changed after the DAO is launched.');
      return;
    }

    const treasuryOwnsTarget = treasuryIsOwner(config, tokenOwner);
    if (!isOwner && !treasuryOwnsTarget) {
      setFormMessage('The treasury does not currently own this contract.');
      return;
    }

    try {
      if (!isOwner && treasuryOwnsTarget) {
        const type = 'set-mint-authority';
        const handler = getActionHandler(type);
        const action = handler.serialize(
          { authority, enabled },
          { config, session: { address: session.address, kit: StellarWalletsKit } }
        );
        proposalDraft.requestAddBatch({
          daoId,
          requests: [
            {
              daoId,
              action,
              source: `admin/owner/${type}`,
              metadata: {
                title: `${enabled ? 'Grant' : 'Revoke'} mint authority`,
                description: `${enabled ? 'Grant' : 'Revoke'} mint authority for ${authority}.`,
                url: ''
              }
            }
          ],
          onAdded: () => setFormMessage(`${enabled ? 'Grant' : 'Revoke'} mint authority added to the proposal draft.`)
        });
        return;
      }

      setBusy(true);
      setFormMessage('');
      const actionType = enabled ? 'Granting' : 'Revoking';
      tx.start(`${actionType} Mint Authority...`);

      const sent = await submitAuthorityUpdate(config, session.address, authority, enabled);
      const hash = sent.sendTransactionResponse?.hash ?? '';
      tx.submitted(`${actionType} Mint Authority`, hash);
      await waitForConfirmation(hash, config.rpcUrl);
      setFormMessage('');
      setMintAuthority('');
      void refreshMintAuthorities();
      tx.success(`${enabled ? 'Updated' : 'Revoked'} authority`, hash);
    } catch (error) {
      tx.fail(error, 'Authority update failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AdminProposalDraftDialog
        pending={proposalDraft.pending}
        onCancel={proposalDraft.cancel}
        onResolve={proposalDraft.resolve}
      />
      <PageSection title="Owner" description="Manage mint authorities from one control center.">
        <Stack gap="4">
          <AdminSectionNav daoId={daoId} active="/owner" />

          <Card p="5">
            <Stack gap="3">
              <div>
                <Badge>Owner</Badge>
              </div>
              <Heading style={{ fontSize: '1.2rem' }}>Owner controls</Heading>
              <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                The owner can add or remove token mint authorities. Those authorities can then use the token admin page.
                Mint authorities can only be changed after the DAO is launched.
              </Text>
              {formMessage ? <Callout variant="warning" title={formMessage} /> : null}
            </Stack>
          </Card>

          <Grid columns={{ base: 1, xl: 2 }} gap="4">
            <AuthorityPanel
              title="Mint authority"
              badge="Token"
              description="Grant or revoke who can mint voting tokens."
              items={mintAuthorities?.items ?? []}
              value={mintAuthority}
              onValueChange={setMintAuthority}
              onAllow={() => void updateAuthority(mintAuthority, true)}
              onRevoke={() => void updateAuthority(mintAuthority, false)}
              allowLabel={isOwner ? 'Allow minting' : 'Propose grant'}
              revokeLabel={isOwner ? 'Revoke minting' : 'Propose revoke'}
              busy={busy || !token.data?.live}
              loading={mintAuthoritiesLoading}
              emptyLabel={mintAuthorityError?.message || 'No mint authorities indexed yet.'}
              draftPreview={draftStatus.actionsInDraft.find((a) => a.type === 'set-mint-authority')}
            />
          </Grid>
        </Stack>
      </PageSection>
    </>
  );
}
