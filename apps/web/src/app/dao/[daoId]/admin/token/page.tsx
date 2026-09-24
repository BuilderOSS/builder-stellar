'use client';

import { Client as TokenClient } from '@builder-stellar/token-bindings';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Stack } from 'styled-system/jsx';

import { AdminSectionNav } from '@/components/admin/admin-section-nav';
import { AuthorityPanel } from '@/components/admin/authority-panel';
import { PageSection } from '@/components/page-section';
import { Badge, Button, Callout, Card, Heading, Text } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { startAdminProposal, treasuryHasAuthority, treasuryIsOwner } from '@/lib/admin-proposals';
import { useContractOwner } from '@/lib/admin-queries';
import { useGoldskyMintAuthorities } from '@/lib/goldsky-queries';
import { BatchMintGovernanceTokenForm } from '@/lib/proposal-actions/actions/batch-mint-governance-token/component';
import type { BatchMintGovernanceTokenData } from '@/lib/proposal-actions/actions/batch-mint-governance-token/types';
import { getActionHandler } from '@/lib/proposal-actions/registry';
import { waitForConfirmation } from '@/lib/transaction-confirmation';
import { useTransactionFeedback } from '@/lib/transaction-feedback';
import { useDaoSessionStore } from '@/stores/dao-session-store';

export default function TokenAdminPage() {
  const { daoId, daoConfig: config } = useDaoContext();
  const router = useRouter();
  const session = useDaoSessionStore();
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('1');
  const [formMessage, setFormMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const tx = useTransactionFeedback(config.name);
  const { data: mintAuthorities, error, isLoading, mutate } = useGoldskyMintAuthorities(config.tokenContractId);
  const { data: tokenOwner } = useContractOwner(config, 'token', session.address || undefined);
  const isOwner = Boolean(session.address && session.address === config.adminAddress);
  const hasMintAccess = Boolean(isOwner || mintAuthorities?.items.some((item) => item.authority === session.address));
  const treasuryCanMint =
    treasuryIsOwner(config, tokenOwner) || treasuryHasAuthority(config.treasuryContractId, mintAuthorities?.items);
  const canProposeMint = Boolean(session.address && treasuryCanMint);

  async function handleMint() {
    if (!session.address || (!hasMintAccess && !canProposeMint)) {
      setFormMessage('Connect a mint authority wallet or use a DAO whose treasury has mint authority.');
      return;
    }

    if (!config.tokenContractId) {
      setFormMessage('Missing token contract id in the active network config.');
      return;
    }

    if (!recipient) {
      setFormMessage('Recipient is required.');
      return;
    }

    const mintAmount = Number(amount);
    if (!Number.isInteger(mintAmount) || mintAmount < 1 || mintAmount > 20) {
      setFormMessage('Mint amount must be between 1 and 20.');
      return;
    }

    setBusy(true);
    setFormMessage('');
    tx.start('Preparing batch mint transaction...');

    try {
      if (!hasMintAccess && canProposeMint) {
        const handler = getActionHandler('batch-mint-governance-token');
        const action = handler.serialize(
          { recipient, amount },
          { config, session: { address: session.address, kit: StellarWalletsKit } }
        );
        startAdminProposal({
          router,
          daoId,
          action,
          source: 'admin/token',
          metadata: {
            title: `Mint ${amount} governance token${amount === '1' ? '' : 's'}`,
            description: `Mint ${amount} governance token${amount === '1' ? '' : 's'} to ${recipient}.`,
            url: ''
          }
        });
        return;
      }

      const client = new TokenClient({
        contractId: config.tokenContractId,
        rpcUrl: config.rpcUrl,
        networkPassphrase: config.passphrase,
        publicKey: session.address,
        signTransaction: async (xdr: string, opts?: { networkPassphrase?: string; address?: string }) =>
          StellarWalletsKit.signTransaction(xdr, {
            networkPassphrase: opts?.networkPassphrase ?? config.passphrase,
            address: opts?.address ?? session.address
          })
      });

      const assembled = await client.batch_mint({ minter: session.address, to: recipient, amount: mintAmount });
      const sent = await assembled.signAndSend();
      const hash = sent.sendTransactionResponse?.hash ?? '';
      const countLabel = mintAmount === 1 ? 'token' : 'tokens';
      tx.submitted(`Minting ${mintAmount} ${countLabel}`, hash);
      await waitForConfirmation(hash, config.rpcUrl);
      setFormMessage('');
      setRecipient('');
      setAmount('1');
      void mutate();
      tx.success(`Minted ${mintAmount} ${countLabel}`, hash);
    } catch (error) {
      tx.fail(error, 'Mint failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageSection title="Token Admin" description="Mint tokens and review the current mint-authority set.">
      <Stack gap="4">
        <AdminSectionNav daoId={daoId} active="/token" />

        <Card p="5">
          <Stack gap="3">
            <div>
              <Badge>{hasMintAccess ? 'Mint enabled' : 'Read only'}</Badge>
            </div>
            <Heading style={{ fontSize: '1.2rem' }}>Mint voting token</Heading>
            <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
              {hasMintAccess
                ? 'Enter a recipient address and mint up to 20 tokens directly to that wallet.'
                : 'Only a mint authority or the owner can mint from this page.'}
            </Text>
            <BatchMintGovernanceTokenForm
              value={{ recipient, amount } satisfies BatchMintGovernanceTokenData}
              onChange={(value) => {
                setRecipient(value.recipient);
                setAmount(value.amount);
              }}
              disabled={!hasMintAccess && !canProposeMint}
            />
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Button type="button" onClick={handleMint} disabled={busy || (!hasMintAccess && !canProposeMint)}>
                {busy ? 'Preparing...' : hasMintAccess ? 'Batch mint' : 'Create mint proposal'}
              </Button>
              <Button type="button" variant="outline" onClick={() => void mutate()} disabled={isLoading}>
                {isLoading ? 'Refreshing...' : 'Refresh authorities'}
              </Button>
            </div>
            {formMessage ? <Callout variant="warning" title={formMessage} /> : null}
            {error ? <Callout variant="error" title={error.message} /> : null}
          </Stack>
        </Card>

        <AuthorityPanel
          title="Mint authorities"
          badge="Token"
          description="These wallets are explicitly allowed to mint. The owner is always allowed too."
          items={mintAuthorities?.items ?? []}
          value=""
          allowLabel=""
          revokeLabel=""
          editable={false}
          loading={isLoading}
          emptyLabel="No explicit mint authorities indexed yet."
        />
      </Stack>
    </PageSection>
  );
}
