'use client';

import { Client as AuctionClient } from '@builder-stellar/auction-bindings';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { useState } from 'react';
import { Stack } from 'styled-system/jsx';
import useSWR from 'swr';

import { AuctionAutoPauseDialog, type AuctionAutoPauseAction } from '@/components/admin/auction-auto-pause-dialog';
import { AdminPaymentTokenForm, AdminReservePriceForm } from '@/components/admin/admin-action-forms';
import { AdminProposalDraftDialog } from '@/components/admin/admin-proposal-draft-dialog';
import { AdminSectionNav } from '@/components/admin/admin-section-nav';
import { PageSection } from '@/components/page-section';
import { Badge, Button, Callout, Card, Heading, ShortId, Skeleton, Text } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { treasuryIsOwner } from '@/lib/admin-proposals';
import { useContractOwner } from '@/lib/admin-queries';
import { getTreasuryAssets } from '@/lib/assets-config';
import { formatStroops } from '@/lib/auction-values';
import { useGoldskyMintAuthorities } from '@/lib/goldsky-queries';
import { getActionHandler } from '@/lib/proposal-actions/registry';
import { waitForConfirmation } from '@/lib/transaction-confirmation';
import { useTransactionFeedback } from '@/lib/transaction-feedback';
import { useAdminProposalDraft } from '@/lib/use-admin-proposal-draft';
import { useAdminDraftStatus } from '@/lib/use-admin-draft-status';
import { getStellarAddressError, isValidStellarAddress } from '@/lib/validation';
import { useDaoSessionStore } from '@/stores/dao-session-store';

type AuctionStatus = { paused: boolean; config: { reserve_price: string; payment_token: string | null } };

const fetcher = async (url: string): Promise<AuctionStatus> => {
  const response = await fetch(url, { cache: 'no-store' });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || 'Auction status unavailable');
  return { paused: Boolean(payload.paused), config: payload.config };
};

export default function AuctionAdminPage() {
  const { daoId, daoConfig: config } = useDaoContext();
  const session = useDaoSessionStore();
  const tx = useTransactionFeedback(config.name);
  const [busy, setBusy] = useState(false);
  const [formMessage, setFormMessage] = useState('');
  const [reservePrice, setReservePrice] = useState('');
  const [paymentToken, setPaymentToken] = useState('');
  const [autoPauseDialogOpen, setAutoPauseDialogOpen] = useState(false);
  const [autoPauseAction, setAutoPauseAction] = useState<AuctionAutoPauseAction | null>(null);
  const proposalDraft = useAdminProposalDraft();
  const draftStatus = useAdminDraftStatus(daoId, [
    'set-auction-reserve-price',
    'set-auction-payment-token',
    'pause-auction',
    'unpause-auction'
  ]);
  const { data, error, mutate, isLoading } = useSWR<AuctionStatus>(
    `/api/dao/${encodeURIComponent(daoId)}/auctions`,
    fetcher
  );
  const { data: mintAuthorities, error: mintAuthorityError } = useGoldskyMintAuthorities(config.tokenContractId);
  const { data: auctionOwner } = useContractOwner(config, 'auction', session.address || undefined);
  const isOwner = Boolean(session.address && session.address === config.adminAddress);
  const canProposeAuction = Boolean(session.address && treasuryIsOwner(config, auctionOwner));
  const auctionCanMint = Boolean(
    mintAuthorities?.items.some((item) => item.authority === config.auctionContractId && item.enabled)
  );

  async function updatePaused(nextPaused: boolean) {
    if (!session.address || (!isOwner && !canProposeAuction)) return;
    if (!isOwner && canProposeAuction) {
      const type = nextPaused ? 'pause-auction' : 'unpause-auction';
      const handler = getActionHandler(type);
      const action = handler.serialize({}, { config, session: { address: session.address, kit: StellarWalletsKit } });
      proposalDraft.requestAdd({
        daoId,
        action,
        source: `admin/auction/${type}`,
        metadata: {
          title: nextPaused ? 'Pause auctions' : 'Resume auctions',
          description: nextPaused ? 'Pause auction activity.' : 'Resume auction activity.',
          url: ''
        },
        onAdded: () => setFormMessage(`${nextPaused ? 'Pause' : 'Resume'} auctions added to the proposal draft.`)
      });
      return;
    }
    setBusy(true);
    tx.start(nextPaused ? 'Pausing auctions...' : 'Resuming auctions...');
    try {
      const client = new AuctionClient({
        contractId: config.auctionContractId,
        rpcUrl: config.rpcUrl,
        networkPassphrase: config.passphrase,
        publicKey: session.address,
        signTransaction: async (xdr: string, opts?: { networkPassphrase?: string; address?: string }) =>
          StellarWalletsKit.signTransaction(xdr, {
            networkPassphrase: opts?.networkPassphrase ?? config.passphrase,
            address: opts?.address ?? session.address
          })
      });
      const assembled = nextPaused
        ? await client.pause({ caller: session.address })
        : await client.unpause({ caller: session.address });
      const sent = await assembled.signAndSend();
      const hash = sent.sendTransactionResponse?.hash ?? '';
      tx.submitted(nextPaused ? 'Auction pause submitted' : 'Auction resume submitted', hash);
      await waitForConfirmation(hash, config.rpcUrl);
      tx.success(nextPaused ? 'Auctions paused' : 'Auctions resumed', hash);
      await mutate();
    } catch (updateError) {
      tx.fail(updateError, 'Auction control failed');
    } finally {
      setBusy(false);
    }
  }

  async function updateReservePrice(skipPauseCheck = false) {
    if (!session.address || (!isOwner && !canProposeAuction) || !data) return;

    // If auctions are active and not skipping pause check, show confirmation dialog
    if (!skipPauseCheck && data.paused === false) {
      setAutoPauseAction('reserve-price');
      setAutoPauseDialogOpen(true);
      return;
    }

    const match = reservePrice.trim().match(/^(\d+)(?:\.(\d{1,7}))?$/);
    if (!match)
      return tx.fail(new Error('Enter a valid reserve price with up to 7 decimal places.'), 'Invalid reserve price');
    const amount = BigInt(match[1]) * 10_000_000n + BigInt((match[2] || '').padEnd(7, '0') || '0');
    if (amount < 1000n)
      return tx.fail(new Error('Reserve price must be at least 0.0001 payment tokens.'), 'Invalid reserve price');
    if (!isOwner && canProposeAuction) {
      const actions = [];
      // Add pause action if auctions are active
      if (data.paused === false) {
        const pauseHandler = getActionHandler('pause-auction');
        const pauseAction = pauseHandler.serialize({}, { config, session: { address: session.address, kit: StellarWalletsKit } });
        actions.push(pauseAction);
      }
      const handler = getActionHandler('set-auction-reserve-price');
      const action = handler.serialize(
        { reservePrice: reservePrice.trim() },
        { config, session: { address: session.address, kit: StellarWalletsKit } }
      );
      actions.push(action);

      // Add all actions to draft
      for (let i = 0; i < actions.length; i++) {
        proposalDraft.requestAdd({
          daoId,
          action: actions[i],
          source: `admin/auction/${i === 0 && data.paused === false ? 'pause-auction' : 'set-auction-reserve-price'}`,
          metadata: {
            title: i === 0 && data.paused === false ? 'Pause auctions' : 'Update auction reserve price',
            description: i === 0 && data.paused === false ? 'Pause auction activity.' : `Set the next auction reserve price to ${reservePrice.trim()}.`,
            url: ''
          },
          onAdded: () => {
            if (i === actions.length - 1) {
              setFormMessage(`${data.paused === false ? 'Pause and update' : 'Update'} reserve price added to the proposal draft.`);
              setReservePrice('');
            }
          }
        });
      }
      return;
    }
    setBusy(true);
    tx.start('Updating reserve price...');
    try {
      // If auctions are active, pause them first
      if (data.paused === false) {
        const pauseClient = new AuctionClient({
          contractId: config.auctionContractId,
          rpcUrl: config.rpcUrl,
          networkPassphrase: config.passphrase,
          publicKey: session.address,
          signTransaction: async (xdr: string, opts?: { networkPassphrase?: string; address?: string }) =>
            StellarWalletsKit.signTransaction(xdr, {
              networkPassphrase: opts?.networkPassphrase ?? config.passphrase,
              address: opts?.address ?? session.address
            })
        });
        tx.start('Pausing auctions...');
        const pauseAssembled = await pauseClient.pause({ caller: session.address });
        const pauseSent = await pauseAssembled.signAndSend();
        const pauseHash = pauseSent.sendTransactionResponse?.hash ?? '';
        tx.submitted('Auction pause submitted', pauseHash);
        await waitForConfirmation(pauseHash, config.rpcUrl);
        tx.submitted('Auctions paused, updating reserve price...');
      }

      const client = new AuctionClient({
        contractId: config.auctionContractId,
        rpcUrl: config.rpcUrl,
        networkPassphrase: config.passphrase,
        publicKey: session.address,
        signTransaction: async (xdr: string, opts?: { networkPassphrase?: string; address?: string }) =>
          StellarWalletsKit.signTransaction(xdr, {
            networkPassphrase: opts?.networkPassphrase ?? config.passphrase,
            address: opts?.address ?? session.address
          })
      });
      const sent = await (await client.set_reserve_price({ reserve_price: amount })).signAndSend();
      const hash = sent.sendTransactionResponse?.hash ?? '';
      tx.submitted('Reserve price update submitted', hash);
      await waitForConfirmation(hash, config.rpcUrl);
      tx.success('Reserve price updated', hash);
      setReservePrice('');
      await mutate();
    } catch (updateError) {
      tx.fail(updateError, 'Reserve price update failed');
    } finally {
      setBusy(false);
    }
  }

  async function updatePaymentToken(skipPauseCheck = false) {
    if (!session.address || (!isOwner && !canProposeAuction) || !data) return;

    // If auctions are active and not skipping pause check, show confirmation dialog
    if (!skipPauseCheck && data.paused === false) {
      setAutoPauseAction('payment-token');
      setAutoPauseDialogOpen(true);
      return;
    }

    const value = paymentToken.trim();
    if (!value) return tx.fail(new Error('Payment token contract address is required.'), 'Invalid payment token');
    if (!isValidStellarAddress(value)) {
      return tx.fail(
        new Error(getStellarAddressError(value) ?? 'Invalid payment token contract address.'),
        'Invalid payment token'
      );
    }
    if (!isOwner && canProposeAuction) {
      const actions = [];
      // Add pause action if auctions are active
      if (data.paused === false) {
        const pauseHandler = getActionHandler('pause-auction');
        const pauseAction = pauseHandler.serialize({}, { config, session: { address: session.address, kit: StellarWalletsKit } });
        actions.push(pauseAction);
      }
      const handler = getActionHandler('set-auction-payment-token');
      const action = handler.serialize(
        { paymentToken: value },
        { config, session: { address: session.address, kit: StellarWalletsKit } }
      );
      actions.push(action);

      // Add all actions to draft
      for (let i = 0; i < actions.length; i++) {
        proposalDraft.requestAdd({
          daoId,
          action: actions[i],
          source: `admin/auction/${i === 0 && data.paused === false ? 'pause-auction' : 'set-auction-payment-token'}`,
          metadata: {
            title: i === 0 && data.paused === false ? 'Pause auctions' : 'Update auction payment token',
            description: i === 0 && data.paused === false ? 'Pause auction activity.' : `Set the auction payment token to ${value}.`,
            url: ''
          },
          onAdded: () => {
            if (i === actions.length - 1) {
              setFormMessage(`${data.paused === false ? 'Pause and update' : 'Update'} payment token added to the proposal draft.`);
              setPaymentToken('');
            }
          }
        });
      }
      return;
    }
    setBusy(true);
    tx.start('Updating payment token...');
    try {
      // If auctions are active, pause them first
      if (data.paused === false) {
        const pauseClient = new AuctionClient({
          contractId: config.auctionContractId,
          rpcUrl: config.rpcUrl,
          networkPassphrase: config.passphrase,
          publicKey: session.address,
          signTransaction: async (xdr: string, opts?: { networkPassphrase?: string; address?: string }) =>
            StellarWalletsKit.signTransaction(xdr, {
              networkPassphrase: opts?.networkPassphrase ?? config.passphrase,
              address: opts?.address ?? session.address
            })
        });
        tx.start('Pausing auctions...');
        const pauseAssembled = await pauseClient.pause({ caller: session.address });
        const pauseSent = await pauseAssembled.signAndSend();
        const pauseHash = pauseSent.sendTransactionResponse?.hash ?? '';
        tx.submitted('Auction pause submitted', pauseHash);
        await waitForConfirmation(pauseHash, config.rpcUrl);
        tx.submitted('Auctions paused, updating payment token...');
      }

      const client = new AuctionClient({
        contractId: config.auctionContractId,
        rpcUrl: config.rpcUrl,
        networkPassphrase: config.passphrase,
        publicKey: session.address,
        signTransaction: async (xdr: string, opts?: { networkPassphrase?: string; address?: string }) =>
          StellarWalletsKit.signTransaction(xdr, {
            networkPassphrase: opts?.networkPassphrase ?? config.passphrase,
            address: opts?.address ?? session.address
          })
      });
      const sent = await (await client.set_payment_token({ payment_token: value })).signAndSend();
      const hash = sent.sendTransactionResponse?.hash ?? '';
      tx.submitted('Payment token update submitted', hash);
      await waitForConfirmation(hash, config.rpcUrl);
      tx.success('Payment token updated', hash);
      setPaymentToken('');
      await mutate();
    } catch (updateError) {
      tx.fail(updateError, 'Payment token update failed');
    } finally {
      setBusy(false);
    }
  }

  if (!isOwner && !canProposeAuction) {
    return (
      <PageSection title="Auction controls" description="Owner-only auction operations.">
        <Callout variant="warning" badge="Access restricted" title="Connect the configured owner wallet to continue">
          <ShortId value={config.adminAddress} label="Owner address" />
        </Callout>
      </PageSection>
    );
  }

  return (
    <>
      <AdminProposalDraftDialog
        pending={proposalDraft.pending}
        onCancel={proposalDraft.cancel}
        onResolve={proposalDraft.resolve}
      />
      <AuctionAutoPauseDialog
        open={autoPauseDialogOpen}
        action={autoPauseAction ?? 'payment-token'}
        isLoading={busy}
        onCancel={() => setAutoPauseDialogOpen(false)}
        onConfirm={() => {
          setAutoPauseDialogOpen(false);
          if (autoPauseAction === 'payment-token') {
            void updatePaymentToken(true);
          } else {
            void updateReservePrice(true);
          }
        }}
      />
      <PageSection
        title="Auction controls"
        description="Pause or resume auction activity for maintenance and emergency operations."
      >
        <Stack gap="4">
          <AdminSectionNav daoId={daoId} active="/auction" />
          {error ? <Callout variant="error" title={error.message} /> : null}
          {formMessage ? <Callout variant="warning" title={formMessage} /> : null}
          <Card p="5">
            <Stack gap="4">
              <div>
                <Badge>Owner</Badge>
              </div>
              <Heading style={{ fontSize: '1.2rem' }}>Auction status</Heading>
              {isLoading && !data ? (
                <div role="status" aria-busy="true" className="skeleton-list">
                  <span className="sr-only">Loading auction controls</span>
                  <Skeleton style={{ width: '260px', height: '1em' }} />
                  <Skeleton style={{ width: '100%', height: '1em' }} />
                  <Skeleton style={{ width: '100%', height: '2.5em' }} />
                  <Skeleton style={{ width: '100%', height: '1em' }} />
                  <Skeleton style={{ width: '100%', height: '2.5em' }} />
                </div>
              ) : (
                <Text className="lede" style={{ margin: 0 }}>
                  {data?.paused
                    ? 'Bidding and automatic settlement are paused.'
                    : 'Auctions are active and accepting bids.'}
                </Text>
              )}
              {data ? (
                <>
                  {data.paused && !auctionCanMint ? (
                    <Callout
                      variant="warning"
                      title="Auction mint authority is missing."
                      description={
                        mintAuthorityError?.message ||
                        `Grant ${config.auctionContractId} mint authority in Token Admin before resuming. Resuming launches the next auction and mints its token.`
                      }
                    />
                  ) : null}
                </>
              ) : null}
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <Button onClick={() => void updatePaused(true)} disabled={busy || data?.paused !== false}>
                  {isOwner ? 'Pause auctions' : 'Add pause proposal'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void updatePaused(false)}
                  disabled={busy || data?.paused !== true || !auctionCanMint}
                >
                  {isOwner ? 'Resume auctions' : 'Add resume proposal'}
                </Button>
              </div>
              <Text className="label">Auction payment token</Text>
              <Text className="lede" style={{ margin: 0 }}>
                {data?.config.payment_token
                  ? `${getTreasuryAssets(config.name).find((asset) => asset.contractId === data.config.payment_token)?.code ?? 'Unknown SAC'} · ${data.config.payment_token}`
                  : 'Not configured'}
                . Changes apply after the next auction is created. If auctions are active, they will be paused automatically.
              </Text>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <AdminPaymentTokenForm
                  value={{ paymentToken }}
                  onChange={(value) => setPaymentToken(value.paymentToken)}
                  network={config.name}
                  disabled={busy}
                  draftPreview={draftStatus.actionsInDraft.find((a) => a.type === 'set-auction-payment-token')}
                />
                <Button
                  variant="outline"
                  onClick={() => void updatePaymentToken()}
                  disabled={busy || !paymentToken}
                >
                  {isOwner ? 'Update payment token' : 'Add payment token proposal'}
                </Button>
              </div>
              <Text className="label">Reserve price for the next auction</Text>
              <Text className="lede" style={{ margin: 0 }}>
                Current reserve: {data ? formatStroops(data.config.reserve_price) : '—'}{' '}
                {data?.config.payment_token
                  ? (getTreasuryAssets(config.name).find((asset) => asset.contractId === data.config.payment_token)
                      ?.code ?? 'SAC')
                  : 'SAC'}{' '}
                units. Changes apply after the next auction is created. If auctions are active, they will be paused automatically.
              </Text>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <AdminReservePriceForm
                  value={{ reservePrice }}
                  onChange={(value) => setReservePrice(value.reservePrice)}
                  disabled={busy}
                  draftPreview={draftStatus.actionsInDraft.find((a) => a.type === 'set-auction-reserve-price')}
                />
                <Button
                  variant="outline"
                  onClick={() => void updateReservePrice()}
                  disabled={busy || !reservePrice}
                >
                  {isOwner ? 'Update reserve' : 'Add reserve proposal'}
                </Button>
              </div>
            </Stack>
          </Card>
        </Stack>
      </PageSection>
    </>
  );
}
