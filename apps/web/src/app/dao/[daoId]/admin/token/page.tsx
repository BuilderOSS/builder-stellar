'use client';

import { Client as TokenClient } from '@builder-stellar/token-bindings';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { useState } from 'react';
import { css } from 'styled-system/css';
import { Stack } from 'styled-system/jsx';

import { AdminProposalDraftDialog } from '@/components/admin/admin-proposal-draft-dialog';
import { AuthorityPanel } from '@/components/admin/authority-panel';
import { PageSection } from '@/components/page-section';
import { Badge, Button, Callout, Card, Checkbox, Heading, Text } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { treasuryHasAuthority, treasuryIsAdmin } from '@/lib/admin-proposals';
import { useContractAdmin } from '@/lib/admin-queries';
import { useAdminArtwork, useAdminTokenState } from '@/lib/admin-surfaces';
import { MAX_BATCH_MINT } from '@/lib/batch-mint-budget';
import { useGoldskyMintAuthorities } from '@/lib/goldsky-queries';
import { BatchMintGovernanceTokenForm } from '@/lib/proposal-actions/actions/batch-mint-governance-token/component';
import type { BatchMintGovernanceTokenData } from '@/lib/proposal-actions/actions/batch-mint-governance-token/types';
import { getActionHandler } from '@/lib/proposal-actions/registry';
import { restoreArchivedState } from '@/lib/restore-archived-client';
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
  // Only the Token admin mints directly; modules mint against their allowances.
  const hasMintAccess = Boolean(isAdmin);
  const treasuryCanMint =
    treasuryIsAdmin(config, tokenAdmin) || treasuryHasAuthority(config.treasuryContractId, mintAuthorities?.items);
  const canProposeMint = Boolean(session.address && token.data?.live && treasuryCanMint);

  async function handleMint() {
    if (
      session.walletNetworkIssue ||
      (session.walletNetworkPassphrase && session.walletNetworkPassphrase !== config.passphrase)
    ) {
      setFormMessage('Switch your wallet to this community’s network before minting.');
      return;
    }
    if (!session.address || (!hasMintAccess && !canProposeMint)) {
      setFormMessage('Connect a wallet that can mint, or propose the mint if the treasury can mint.');
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
                title: `Mint ${amount} membership token${amount === '1' ? '' : 's'}`,
                description: `Mint ${amount} membership token${amount === '1' ? '' : 's'} to ${recipient}.`,
                url: ''
              }
            }
          ],
          onAdded: () => {
            setFormMessage(
              `Added minting ${amount} membership token${amount === '1' ? '' : 's'} to your proposal draft.`
            );
            setRecipient('');
            setAmount('1');
          }
        });
        return;
      }

      setBusy(true);
      setFormMessage('');
      tx.start('Minting tokens');

      const client = new TokenClient({
        contractId: config.tokenContractId,
        rpcUrl: config.rpcUrl,
        networkPassphrase: config.passphrase,
        publicKey: session.address,
        ...restoreArchivedState,
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
      <PageSection title="Mint tokens" description="Create new membership tokens and see who is allowed to mint.">
        <Stack gap="4">
          <Card p="5">
            <Stack gap="3">
              <div>
                <Badge>{hasMintAccess ? 'You can mint' : canProposeMint ? 'Mint by vote' : 'Read only'}</Badge>
              </div>
              <Heading size="heading">Mint membership tokens</Heading>
              <Text size="sm">
                {hasMintAccess
                  ? `Mint up to ${MAX_BATCH_MINT} tokens at a time straight to one wallet.`
                  : canProposeMint
                    ? `Propose minting up to ${MAX_BATCH_MINT} tokens at a time to one wallet. It runs if the vote passes.`
                    : 'Only an account allowed to mint, or the admin, can mint from this page.'}
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
                    description="This community has no artwork yet. Tokens minted now have no traits until they’re seeded from Manage."
                  />
                  <Checkbox
                    label="I understand these tokens will be minted without traits."
                    checked={ackNoArtwork}
                    disabled={busy}
                    onCheckedChange={setAckNoArtwork}
                  />
                </>
              ) : null}
              <div className={css({ display: 'flex', gap: '2', flexWrap: 'wrap' })}>
                <Button type="button" onClick={handleMint} disabled={busy || (!hasMintAccess && !canProposeMint)}>
                  {busy ? 'Preparing…' : hasMintAccess ? 'Mint to recipient' : 'Create mint proposal'}
                </Button>
                <Button type="button" variant="secondary" onClick={() => void mutate()} disabled={isLoading}>
                  {isLoading ? 'Refreshing…' : 'Refresh authorities'}
                </Button>
              </div>
              {formMessage ? <Callout variant="warning" title={formMessage} /> : null}
              {error ? <Callout variant="error" title={error.message} /> : null}
              {token.error ? (
                <Callout variant="error" title="Couldn't check who can mint" description={token.error.message} />
              ) : null}
            </Stack>
          </Card>

          <AuthorityPanel
            title="Mint authorities"
            badge="Token"
            description="These accounts are allowed to mint. The admin always can."
            items={mintAuthorities?.items ?? []}
            value=""
            allowLabel=""
            revokeLabel=""
            editable={false}
            loading={isLoading}
            emptyLabel="No accounts have been allowed to mint yet."
          />
        </Stack>
      </PageSection>
    </>
  );
}
