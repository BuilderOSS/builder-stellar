'use client';

import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { Client as AuctionClient } from '@builder-stellar/auction-bindings';
import { useState } from 'react';
import { Stack } from 'styled-system/jsx';
import useSWR from 'swr';

import { AdminSectionNav } from '@/components/admin/admin-section-nav';
import { useDaoContext } from '@/contexts/dao-context';
import { PageSection } from '@/components/page-section';
import { Badge, Button, Callout, Card, Heading, Input, ShortId, Text } from '@/components/ui';
import { getTreasuryAssets } from '@/lib/assets-config';
import { getDaoNetworkConfig, getDefaultDaoNetwork } from '@/lib/dao-config';
import { useGoldskyMintAuthorities } from '@/lib/goldsky-queries';
import { waitForConfirmation } from '@/lib/transaction-confirmation';
import { useTransactionFeedback } from '@/lib/transaction-feedback';
import { useDaoSessionStore } from '@/stores/dao-session-store';

type AuctionStatus = { paused: boolean; config: { reserve_price: string; payment_token: string | null } };

const fetcher = async (url: string): Promise<AuctionStatus> => {
  const response = await fetch(url, { cache: 'no-store' });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || 'Auction status unavailable');
  return { paused: Boolean(payload.paused), config: payload.config };
};

export default function AuctionAdminPage() {
  const { daoId } = useDaoContext();
  const session = useDaoSessionStore();
  const config = getDaoNetworkConfig(getDefaultDaoNetwork());
  const tx = useTransactionFeedback(config.name);
  const [busy, setBusy] = useState(false);
  const [reservePrice, setReservePrice] = useState('');
  const [paymentToken, setPaymentToken] = useState('');
  const { data, error, mutate } = useSWR<AuctionStatus>('/api/auctions', fetcher);
  const { data: mintAuthorities, error: mintAuthorityError } = useGoldskyMintAuthorities();
  const isOwner = Boolean(session.address && session.address === config.adminAddress);
  const auctionCanMint = Boolean(
    mintAuthorities?.items.some((item) => item.authority === config.auctionContractId && item.enabled)
  );

  async function updatePaused(nextPaused: boolean) {
    if (!session.address || !isOwner) return;
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
    if (!session.address || !isOwner || !data || data.paused !== true) return;
    const match = reservePrice.trim().match(/^(\d+)(?:\.(\d{1,7}))?$/);
    if (!match)
      return tx.fail(new Error('Enter a valid reserve price with up to 7 decimal places.'), 'Invalid reserve price');
    const amount = BigInt(match[1]) * 10_000_000n + BigInt((match[2] || '').padEnd(7, '0') || '0');
    if (amount < 1000n)
      return tx.fail(new Error('Reserve price must be at least 0.0001 payment tokens.'), 'Invalid reserve price');
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
    if (!session.address || !isOwner || !data || data.paused !== true) return;
    const value = paymentToken.trim();
    if (!value) return tx.fail(new Error('Payment token contract address is required.'), 'Invalid payment token');
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

  if (!isOwner) {
    return (
        <PageSection title="Auction controls" description="Owner-only auction operations.">
          <Callout variant="warning" badge="Access restricted" title="Connect the configured owner wallet to continue">
            <ShortId value={config.adminAddress} label="Owner address" />
          </Callout>
        </PageSection>
    );
  }

  return (
      <PageSection
        title="Auction controls"
        description="Pause or resume auction activity for maintenance and emergency operations."
      >
        <Stack gap="4">
          <AdminSectionNav daoId={daoId} active="/auction" />
          {error ? <Callout variant="error" title={error.message} /> : null}
          <Card p="5">
            <Stack gap="4">
              <div>
                <Badge>Owner</Badge>
              </div>
              <Heading style={{ fontSize: '1.2rem' }}>Auction status</Heading>
              <Text className="lede" style={{ margin: 0 }}>
                {data?.paused
                  ? 'Bidding and automatic settlement are paused.'
                  : 'Auctions are active and accepting bids.'}
              </Text>
              {data?.paused && !auctionCanMint ? (
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
                  Pause auctions
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void updatePaused(false)}
                  disabled={busy || data?.paused !== true || !auctionCanMint}
                >
                  Resume auctions
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
                  Update payment token
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
                  Update reserve
                </Button>
              </div>
            </Stack>
          </Card>
        </Stack>
      </PageSection>
  );
}
