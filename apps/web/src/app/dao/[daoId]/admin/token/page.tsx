'use client';

import { Client as TokenClient } from '@builder-stellar/token-bindings';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { useState } from 'react';
import { Stack } from 'styled-system/jsx';

import { AdminProposalDraftDialog } from '@/components/admin/admin-proposal-draft-dialog';
import { AdminSurfaceNav as AdminSectionNav } from '@/components/admin/admin-surface-nav';
import { AuthorityPanel } from '@/components/admin/authority-panel';
import { PageSection } from '@/components/page-section';
import { Badge, Button, Callout, Card, Heading, Text } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { treasuryHasAuthority, treasuryIsAdmin } from '@/lib/admin-proposals';
import { useContractAdmin } from '@/lib/admin-queries';
import { useAdminArtwork, useAdminTokenState } from '@/lib/admin-surfaces';
import { MAX_BATCH_MINT } from '@/lib/batch-mint-budget';
import { useGoldskyMintAuthorities } from '@/lib/goldsky-queries';
import { BatchMintGovernanceTokenForm } from '@/lib/proposal-actions/actions/batch-mint-governance-token/component';
import type { BatchMintGovernanceTokenData } from '@/lib/proposal-actions/actions/batch-mint-governance-token/types';
import { getActionHandler } from '@/lib/proposal-actions/registry';
import { waitForConfirmation } from '@/lib/transaction-confirmation';
import { useTransactionFeedback } from '@/lib/transaction-feedback';
import { useAdminDraftStatus } from '@/lib/use-admin-draft-status';
import { useAdminProposalDraft } from '@/lib/use-admin-proposal-draft';
import { signWithWallet } from '@/lib/wallet-sign';
import { useAuthSessionStore } from '@/stores/auth-session-store';

export default function TokenAdminPage() {
  const { daoId, daoConfig: config } = useDaoContext();
  const session = useAuthSessionStore();
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('1');
  const [formMessage, setFormMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const proposalDraft = useAdminProposalDraft();
  const draftStatus = useAdminDraftStatus(daoId, ['batch-mint-governance-token']);
  const tx = useTransactionFeedback(config.name);
  const { data: mintAuthorities, error, isLoading, mutate } = useGoldskyMintAuthorities(config.tokenContractId);
  const { data: tokenAdmin } = useContractAdmin(config, 'token', session.address || undefined);
  const token = useAdminTokenState(config, session.address);
  const artwork = useAdminArtwork(config, session.address);
  // Traits are seeded at mint time; minting before the artwork leaves tokens unseeded.
  const noArtwork = Boolean(artwork.data && artwork.data.properties.length === 0);
  const [ackNoArtwork, setAckNoArtwork] = useState(false);
  const isAdmin = Boolean(session.address && token.data?.admin === session.address);
  const hasMintAccess = Boolean(isAdmin || token.data?.mintAuthority);
  const treasuryCanMint =
    treasuryIsAdmin(config, tokenAdmin) || treasuryHasAuthority(config.treasuryContractId, mintAuthorities?.items);
  const canProposeMint = Boolean(session.address && token.data?.live && treasuryCanMint);

  async function handleMint() {
    if (
      session.walletNetworkIssue ||
      (session.walletNetworkPassphrase && session.walletNetworkPassphrase !== config.passphrase)
    ) {
      setFormMessage('Switch your wallet to the DAO network before minting.');
      return;
    }
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
    if (!Number.isInteger(mintAmount) || mintAmount < 1 || mintAmount > MAX_BATCH_MINT) {
      setFormMessage(`Mint amount must be between 1 and ${MAX_BATCH_MINT} per transaction; mint more in several.`);
      return;
    }
    if (noArtwork && !ackNoArtwork) {
      setFormMessage('Upload the artwork first, or confirm that these tokens will have no traits.');
      return;
    }

    try {
      const validation = getActionHandler('batch-mint-governance-token').validate(
        { recipient, amount },
        { config, session: { address: session.address, kit: StellarWalletsKit } }
      );
      if (!validation.valid) {
        setFormMessage(validation.message);
        return;
      }
      if (!hasMintAccess && canProposeMint) {
        const handler = getActionHandler('batch-mint-governance-token');
        const action = handler.serialize(
          { recipient, amount },
          { config, session: { address: session.address, kit: StellarWalletsKit } }
        );
        proposalDraft.requestAddBatch({
          daoId,
          requests: [
            {
              daoId,
              action,
              source: 'admin/token',
              metadata: {
                title: `Mint ${amount} governance token${amount === '1' ? '' : 's'}`,
                description: `Mint ${amount} governance token${amount === '1' ? '' : 's'} to ${recipient}.`,
                url: ''
              }
            }
          ],
          onAdded: () => {
            setFormMessage(`Added ${amount} governance token${amount === '1' ? '' : 's'} to the proposal draft.`);
            setRecipient('');
            setAmount('1');
          }
        });
        return;
      }

      setBusy(true);
      setFormMessage('');
      tx.start('Preparing batch mint transaction...');

      const client = new TokenClient({
        contractId: config.tokenContractId,
        rpcUrl: config.rpcUrl,
        networkPassphrase: config.passphrase,
        publicKey: session.address,
        signTransaction: async (xdr: string, opts?: { networkPassphrase?: string; address?: string }) =>
          signWithWallet(xdr, {
            networkPassphrase: opts?.networkPassphrase ?? config.passphrase,
            address: opts?.address ?? session.address
          })
      });

      const assembled = await client.batch_mint({
        minter: session.address,
        recipients: [recipient],
        amounts: [BigInt(mintAmount)]
      });
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
    <>
      <AdminProposalDraftDialog
        pending={proposalDraft.pending}
        onCancel={proposalDraft.cancel}
        onResolve={proposalDraft.resolve}
      />
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
                  ? `Enter a recipient address and mint up to ${MAX_BATCH_MINT} tokens per transaction directly to that wallet.`
                  : 'Only a mint authority or the admin can mint from this page.'}
              </Text>
              <BatchMintGovernanceTokenForm
                value={{ recipient, amount } satisfies BatchMintGovernanceTokenData}
                onChange={(value) => {
                  setRecipient(value.recipient);
                  setAmount(value.amount);
                }}
                disabled={busy || (!hasMintAccess && !canProposeMint)}
                draftPreview={draftStatus.actionsInDraft.find((a) => a.type === 'batch-mint-governance-token')}
              />
              {noArtwork ? (
                <>
                  <Callout
                    variant="error"
                    title="Upload the artwork first"
                    description="This DAO has no artwork properties yet. Tokens minted now get no traits and need metadata.regenerate later."
                  />
                  <label htmlFor="ack-no-artwork">
                    <input
                      id="ack-no-artwork"
                      type="checkbox"
                      checked={ackNoArtwork}
                      disabled={busy}
                      onChange={(event) => setAckNoArtwork(event.target.checked)}
                    />{' '}
                    I understand these tokens will be minted without traits.
                  </label>
                </>
              ) : null}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <Button type="button" onClick={handleMint} disabled={busy || (!hasMintAccess && !canProposeMint)}>
                  {busy ? 'Preparing…' : hasMintAccess ? 'Mint to recipient' : 'Create mint proposal'}
                </Button>
                <Button type="button" variant="outline" onClick={() => void mutate()} disabled={isLoading}>
                  {isLoading ? 'Refreshing...' : 'Refresh authorities'}
                </Button>
              </div>
              {formMessage ? <Callout variant="warning" title={formMessage} /> : null}
              {error ? <Callout variant="error" title={error.message} /> : null}
              {token.error ? (
                <Callout variant="error" title="Live mint authority unavailable" description={token.error.message} />
              ) : null}
            </Stack>
          </Card>

          <AuthorityPanel
            title="Mint authorities"
            badge="Token"
            description="These wallets are explicitly allowed to mint. The admin is always allowed too."
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
    </>
  );
}
