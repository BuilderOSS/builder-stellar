'use client';

import { Client as GovernorClient } from '@builder-stellar/governor-bindings';
import { Client as TokenClient } from '@builder-stellar/token-bindings';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Grid, Stack } from 'styled-system/jsx';

import { AdminSectionNav } from '@/components/admin/admin-section-nav';
import { AuthorityPanel } from '@/components/admin/authority-panel';
import { PageSection } from '@/components/page-section';
import { Badge, Callout, Card, Heading, ShortId, Text } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { startAdminProposal, treasuryIsOwner } from '@/lib/admin-proposals';
import { useContractOwner } from '@/lib/admin-queries';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { useGoldskyGovernorAuthorities, useGoldskyMintAuthorities } from '@/lib/goldsky-queries';
import { getActionHandler } from '@/lib/proposal-actions/registry';
import { waitForConfirmation } from '@/lib/transaction-confirmation';
import { useTransactionFeedback } from '@/lib/transaction-feedback';
import { useDaoSessionStore } from '@/stores/dao-session-store';

async function submitAuthorityUpdate(
  config: DaoNetworkConfig,
  sessionAddress: string,
  method: 'set_mint_authority' | 'set_governor_authority',
  authority: string,
  enabled: boolean
) {
  if (method === 'set_mint_authority') {
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

  const client = new GovernorClient({
    contractId: config.governorContractId,
    rpcUrl: config.rpcUrl,
    networkPassphrase: config.passphrase,
    publicKey: sessionAddress,
    signTransaction: async (xdr: string, opts?: { networkPassphrase?: string; address?: string }) =>
      StellarWalletsKit.signTransaction(xdr, {
        networkPassphrase: opts?.networkPassphrase ?? config.passphrase,
        address: opts?.address ?? sessionAddress
      })
  });

  return (await client.set_governor_authority({ authority, enabled })).signAndSend();
}

export default function OwnerPage() {
  const { daoId, daoConfig: config } = useDaoContext();
  const router = useRouter();
  const session = useDaoSessionStore();
  const [mintAuthority, setMintAuthority] = useState('');
  const [governorAuthority, setGovernorAuthority] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const tx = useTransactionFeedback(config.name);
  const {
    data: mintAuthorities,
    mutate: refreshMintAuthorities,
    error: mintAuthorityError,
    isLoading: mintAuthoritiesLoading
  } = useGoldskyMintAuthorities(config.tokenContractId);
  const {
    data: governorAuthorities,
    mutate: refreshGovernorAuthorities,
    error: governorAuthorityError,
    isLoading: governorAuthoritiesLoading
  } = useGoldskyGovernorAuthorities(config.tokenContractId);
  const { data: tokenOwner } = useContractOwner(config, 'token', session.address || undefined);
  const { data: governorOwner } = useContractOwner(config, 'governor', session.address || undefined);
  const isOwner = Boolean(session.address && session.address === config.adminAddress);
  const canProposeAuthority = Boolean(
    session.address && (treasuryIsOwner(config, tokenOwner) || treasuryIsOwner(config, governorOwner))
  );

  if (!isOwner && !canProposeAuthority) {
    return (
      <PageSection title="Owner" description="Owner-only authority management.">
        <Callout
          variant="warning"
          badge="Access restricted"
          title="Connect the owner wallet to continue"
          description="Only the configured bootstrap owner can add or remove mint and governance authorities."
        >
          <ShortId value={config.adminAddress} label="Owner address" />
        </Callout>
      </PageSection>
    );
  }

  async function updateAuthority(
    method: 'set_mint_authority' | 'set_governor_authority',
    authority: string,
    enabled: boolean
  ) {
    if (!session.address || !authority) {
      setFormMessage('Authority address is required.');
      return;
    }

    if (
      (method === 'set_mint_authority' && !config.tokenContractId) ||
      (method === 'set_governor_authority' && !config.governorContractId)
    ) {
      setFormMessage('Missing contract id in the active network config.');
      return;
    }

    const treasuryOwnsTarget =
      method === 'set_mint_authority' ? treasuryIsOwner(config, tokenOwner) : treasuryIsOwner(config, governorOwner);
    if (!isOwner && !treasuryOwnsTarget) {
      setFormMessage('The treasury does not currently own this contract.');
      return;
    }

    setBusy(true);
    setFormMessage('');
    const authorityType = method == 'set_mint_authority' ? 'Mint' : 'Governor';
    const actionType = enabled ? 'Granting' : 'Revoking';
    tx.start(`${actionType} ${authorityType} Authority...`);

    try {
      if (!isOwner && treasuryOwnsTarget) {
        const type = method === 'set_mint_authority' ? 'set-mint-authority' : 'set-governor-authority';
        const handler = getActionHandler(type);
        const action = handler.serialize(
          { authority, enabled },
          { config, session: { address: session.address, kit: StellarWalletsKit } }
        );
        startAdminProposal({
          router,
          daoId,
          action,
          source: `admin/owner/${type}`,
          metadata: {
            title: `${enabled ? 'Grant' : 'Revoke'} ${authorityType.toLowerCase()} authority`,
            description: `${enabled ? 'Grant' : 'Revoke'} ${authorityType.toLowerCase()} authority for ${authority}.`,
            url: ''
          }
        });
        return;
      }

      const sent = await submitAuthorityUpdate(config, session.address, method, authority, enabled);
      const hash = sent.sendTransactionResponse?.hash ?? '';
      tx.submitted(`${actionType} ${authorityType} Authority`, hash);
      await waitForConfirmation(hash, config.rpcUrl);
      setFormMessage('');
      if (method === 'set_mint_authority') {
        setMintAuthority('');
        void refreshMintAuthorities();
      } else {
        setGovernorAuthority('');
        void refreshGovernorAuthorities();
      }
      tx.success(`${enabled ? 'Updated' : 'Revoked'} authority`, hash);
    } catch (error) {
      tx.fail(error, 'Authority update failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageSection title="Owner" description="Manage mint and governance authorities from one control center.">
      <Stack gap="4">
        <AdminSectionNav daoId={daoId} active="/owner" />

        <Card p="5">
          <Stack gap="3">
            <div>
              <Badge>Owner</Badge>
            </div>
            <Heading style={{ fontSize: '1.2rem' }}>Owner controls</Heading>
            <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
              The owner can add or remove both token and governance authorities. Those authorities can then use the
              matching admin pages.
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
            onAllow={() => void updateAuthority('set_mint_authority', mintAuthority, true)}
            onRevoke={() => void updateAuthority('set_mint_authority', mintAuthority, false)}
            allowLabel="Allow minting"
            revokeLabel="Revoke minting"
            busy={busy}
            loading={mintAuthoritiesLoading}
            emptyLabel={mintAuthorityError?.message || 'No mint authorities indexed yet.'}
          />
          <AuthorityPanel
            title="Governor authority"
            badge="Governance"
            description="Grant or revoke who can update governor settings."
            items={governorAuthorities?.items ?? []}
            value={governorAuthority}
            onValueChange={setGovernorAuthority}
            onAllow={() => void updateAuthority('set_governor_authority', governorAuthority, true)}
            onRevoke={() => void updateAuthority('set_governor_authority', governorAuthority, false)}
            allowLabel="Allow governance"
            revokeLabel="Revoke governance"
            busy={busy}
            loading={governorAuthoritiesLoading}
            emptyLabel={governorAuthorityError?.message || 'No governance authorities indexed yet.'}
          />
        </Grid>
      </Stack>
    </PageSection>
  );
}
