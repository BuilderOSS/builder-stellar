'use client';

import { Client as AuctionClient } from '@builder-stellar/auction-bindings';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { useState } from 'react';
import { Stack } from 'styled-system/jsx';
import useSWR from 'swr';

import { AdminPaymentTokenForm, AdminReservePriceForm } from '@/components/admin/admin-action-forms';
import { AdminProposalDraftDialog } from '@/components/admin/admin-proposal-draft-dialog';
import { AdminSectionNav } from '@/components/admin/admin-section-nav';
import { PageSection } from '@/components/page-section';
import { Badge, Button, Callout, Card, Heading, Input, ShortId, Skeleton, Text } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { treasuryIsOwner } from '@/lib/admin-proposals';
import { useContractOwner } from '@/lib/admin-queries';
import { getTreasuryAssets } from '@/lib/assets-config';
import { useGoldskyMintAuthorities } from '@/lib/goldsky-queries';
import { getActionHandler } from '@/lib/proposal-actions/registry';
import { waitForConfirmation } from '@/lib/transaction-confirmation';
import { useTransactionFeedback } from '@/lib/transaction-feedback';
import { useAdminProposalDraft } from '@/lib/use-admin-proposal-draft';
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
  const proposalDraft = useAdminProposalDraft();
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

  async function updateReservePrice() {
    if (!session.address || (!isOwner && !canProposeAuction) || !data || data.paused !== true) return;
    const match = reservePrice.trim().match(/^(\d+)(?:\.(\d{1,7}))?$/);
    if (!match)
      return tx.fail(new Error('Enter a valid reserve price with up to 7 decimal places.'), 'Invalid reserve price');
    const amount = BigInt(match[1]) * 10_000_000n + BigInt((match[2] || '').padEnd(7, '0') || '0');
    if (amount < 1000n)
      return tx.fail(new Error('Reserve price must be at least 0.0001 payment tokens.'), 'Invalid reserve price');
    if (!isOwner && canProposeAuction) {
      const handler = getActionHandler('set-auction-reserve-price');
      const action = handler.serialize(
        { reservePrice: reservePrice.trim() },
        { config, session: { address: session.address, kit: StellarWalletsKit } }
      );
      proposalDraft.requestAdd({
        daoId,
        action,
        source: 'admin/auction/set-auction-reserve-price',
        metadata: {
          title: 'Update auction reserve price',
          description: `Set the next auction reserve price to ${reservePrice.trim()}.`,
          url: ''
        },
        onAdded: () => setFormMessage('Auction reserve price update added to the proposal draft.')
      });
      return;
    }
    setBusy(true);
    tx.start('Updating reserve price...');
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

  async function updatePaymentToken() {
    if (!session.address || (!isOwner && !canProposeAuction) || !data || data.paused !== true) return;
    const value = paymentToken.trim();
    if (!value) return tx.fail(new Error('Payment token contract address is required.'), 'Invalid payment token');
    if (!isOwner && canProposeAuction) {
      const handler = getActionHandler('set-auction-payment-token');
      const action = handler.serialize(
        { paymentToken: value },
        { config, session: { address: session.address, kit: StellarWalletsKit } }
      );
      proposalDraft.requestAdd({
        daoId,
        action,
        source: 'admin/auction/set-auction-payment-token',
        metadata: {
          title: 'Update auction payment token',
          description: `Set the auction payment token to ${value}.`,
          url: ''
        },
        onAdded: () => setFormMessage('Auction payment token update added to the proposal draft.')
      });
      return;
    }
    setBusy(true);
    tx.start('Updating payment token...');
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
                    . Changes apply after the next auction is created.
                  </Text>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <Input
                      value={paymentToken}
                      onChange={(event) => setPaymentToken(event.target.value)}
                      placeholder="SAC contract address"
                      disabled={busy || data?.paused !== true}
                    />
                    <Button
                      variant="outline"
                      onClick={() => void updatePaymentToken()}
                      disabled={busy || data?.paused !== true || !paymentToken}
                    >
                      {isOwner ? 'Update payment token' : 'Add payment token proposal'}
                    </Button>
                  </div>
                  <Text className="label">Reserve price for the next auction</Text>
                  <Text className="lede" style={{ margin: 0 }}>
                    Current reserve: {data ? Number(data.config.reserve_price) / 10_000_000 : '—'}{' '}
                    {data?.config.payment_token
                      ? (getTreasuryAssets(config.name).find((asset) => asset.contractId === data.config.payment_token)
                          ?.code ?? 'SAC')
                      : 'SAC'}{' '}
                    units. Changes apply after the next auction is created.
                  </Text>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <Input
                      value={reservePrice}
                      onChange={(event) => setReservePrice(event.target.value)}
                      placeholder="For example 10"
                      inputMode="decimal"
                      disabled={busy || data?.paused !== true}
                    />
                    <Button
                      variant="outline"
                      onClick={() => void updateReservePrice()}
                      disabled={busy || data?.paused !== true || !reservePrice}
                    >
                      {isOwner ? 'Update reserve' : 'Add reserve proposal'}
                    </Button>
                  </div>
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
                . Changes apply after the next auction is created.
              </Text>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <AdminPaymentTokenForm
                  value={{ paymentToken }}
                  onChange={(value) => setPaymentToken(value.paymentToken)}
                  disabled={busy || data?.paused !== true}
                />
                <Button
                  variant="outline"
                  onClick={() => void updatePaymentToken()}
                  disabled={busy || data?.paused !== true || !paymentToken}
                >
                  {isOwner ? 'Update payment token' : 'Add payment token proposal'}
                </Button>
              </div>
              <Text className="label">Reserve price for the next auction</Text>
              <Text className="lede" style={{ margin: 0 }}>
                Current reserve: {data ? Number(data.config.reserve_price) / 10_000_000 : '—'}{' '}
                {data?.config.payment_token
                  ? (getTreasuryAssets(config.name).find((asset) => asset.contractId === data.config.payment_token)
                      ?.code ?? 'SAC')
                  : 'SAC'}{' '}
                units. Changes apply after the next auction is created.
              </Text>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <AdminReservePriceForm
                  value={{ reservePrice }}
                  onChange={(value) => setReservePrice(value.reservePrice)}
                  disabled={busy || data?.paused !== true}
                />
                <Button
                  variant="outline"
                  onClick={() => void updateReservePrice()}
                  disabled={busy || data?.paused !== true || !reservePrice}
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
