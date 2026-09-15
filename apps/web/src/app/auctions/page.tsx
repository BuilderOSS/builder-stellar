'use client';

import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { Client as AuctionClient } from '@nouns-builder-stellar/auction-bindings';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Grid, Stack } from 'styled-system/jsx';
import useSWR from 'swr';

import { DaoShell } from '@/components/dao-shell';
import { PageSection } from '@/components/page-section';
import { Button, Callout, Card, Heading, Input, ShortId, Text } from '@/components/ui';
import { getTreasuryAssets } from '@/lib/assets-config';
import { getDaoNetworkConfig, getDefaultDaoNetwork } from '@/lib/dao-config';
import { waitForConfirmation } from '@/lib/transaction-confirmation';
import { useTransactionFeedback } from '@/lib/transaction-feedback';
import { useDaoSessionStore } from '@/stores/dao-session-store';

type AuctionData = {
  auction: {
    token_id: string;
    start_time: string;
    end_time: string;
    highest_bid: string;
    highest_bidder: string | null;
    settled: boolean;
  };
  config: { reserve_price: string; min_bid_increment_percent: number; payment_token: string | null };
  paused: boolean;
  bids: Array<{ bidder: string; amount: string; timestamp: string | null }>;
  history: Array<{ token_id: string; highest_bid_amount: string; highest_bidder: string | null; settled: boolean }>;
};

const fetcher = (url: string) =>
  fetch(url, { cache: 'no-store' }).then(async (response) => {
    const json = await response.json();
    if (!response.ok) throw new Error(json.message || 'Auction unavailable');
    return json as AuctionData;
  });

function formatAmount(value: string | bigint | undefined) {
  if (!value) return '0';
  const raw = BigInt(value);
  const whole = raw / 10_000_000n;
  const fraction = (raw % 10_000_000n).toString().padStart(7, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function parseAmount(value: string) {
  const match = value.trim().match(/^(\d+)(?:\.(\d{1,7}))?$/);
  if (!match) return null;
  return BigInt(match[1]) * 10_000_000n + BigInt((match[2] || '').padEnd(7, '0') || '0');
}

function formatDate(value: string | number | undefined) {
  const numericValue = Number(value);
  const timestamp =
    Number.isFinite(numericValue) && numericValue > 0
      ? numericValue
      : typeof value === 'string'
        ? Date.parse(value) / 1000
        : NaN;
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 'Time unavailable';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(timestamp * 1000)
  );
}

function formatPaymentToken(network: ReturnType<typeof getDefaultDaoNetwork>, contractId: string | null | undefined) {
  const asset = getTreasuryAssets(network).find((item) => item.contractId === contractId);
  return asset?.code ?? 'SAC';
}

function formatRemaining(endTime: string, now: number) {
  const remaining = Math.max(0, Number(endTime) - now);
  const days = Math.floor(remaining / 86_400);
  const hours = Math.floor((remaining % 86_400) / 3_600);
  const minutes = Math.floor((remaining % 3_600) / 60);
  return `${days}d ${hours}hr ${minutes}m remaining`;
}

export default function AuctionsPage() {
  const config = getDaoNetworkConfig(getDefaultDaoNetwork());
  const session = useDaoSessionStore();
  const tx = useTransactionFeedback(config.name);
  const { data, error, isLoading, mutate } = useSWR<AuctionData>('/api/auctions', fetcher, { refreshInterval: 15_000 });
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(0);
  const paymentToken = formatPaymentToken(config.name, data?.config.payment_token);
  const auctionEnded = Boolean(data?.auction && now > 0 && Number(data.auction.end_time) <= now);

  useEffect(() => {
    const update = () => setNow(Math.floor(Date.now() / 1000));
    const initial = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 1000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, []);

  const submit = async (action: 'bid' | 'settle') => {
    if (!session.address || !data) return setMessage('Connect a wallet first.');
    setMessage('');
    if (action === 'bid') {
      const parsed = parseAmount(amount);
      const highest = BigInt(data.auction.highest_bid);
      const reserve = BigInt(data.config.reserve_price);
      const minimum =
        highest > 0n ? highest + (highest * BigInt(data.config.min_bid_increment_percent)) / 100n : reserve;
      if (parsed === null || parsed < minimum)
        return setMessage(`Bid at least ${formatAmount(minimum)} payment tokens.`);
      setBusy(true);
      tx.start('Submitting bid...');
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
        const assembled = await client.create_bid({
          bidder: session.address,
          token_id: BigInt(data.auction.token_id),
          amount: parsed
        });
        const sent = await assembled.signAndSend();
        const hash = sent.sendTransactionResponse?.hash ?? '';
        tx.submitted('Bid submitted', hash);
        await waitForConfirmation(hash, config.rpcUrl);
        tx.success('Bid confirmed', hash);
        setAmount('');
        await mutate();
      } catch (err) {
        tx.fail(err, 'Bid failed');
      } finally {
        setBusy(false);
      }
    } else {
      setBusy(true);
      tx.start('Settling auction...');
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
        const assembled = await client.settle_and_create_new();
        const sent = await assembled.signAndSend();
        const hash = sent.sendTransactionResponse?.hash ?? '';
        tx.submitted('Settlement submitted', hash);
        await waitForConfirmation(hash, config.rpcUrl);
        tx.success('Auction settled', hash);
        await mutate();
      } catch (err) {
        tx.fail(err, 'Settlement failed');
      } finally {
        setBusy(false);
      }
    }
  };

  return (
    <DaoShell>
      <PageSection title="Auctions" description="Bid on the current DAO collectible and browse settled auctions.">
        <Stack gap="6">
          {error ? <Callout variant="error" title={error.message} /> : null}
          {isLoading && !data ? <Text className="lede">Loading auction...</Text> : null}
          {data?.auction ? (
            <>
              <Card p="6">
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(180px, 280px) 1fr',
                    gap: '24px',
                    alignItems: 'start'
                  }}
                >
                  <div
                    style={{
                      aspectRatio: '1',
                      overflow: 'hidden',
                      borderRadius: '16px',
                      background: 'rgba(255,255,255,0.06)'
                    }}
                  >
                    <Image
                      src={`/api/token/${data.auction.token_id}/image.svg`}
                      alt={`Token #${data.auction.token_id}`}
                      width={560}
                      height={560}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover'
                      }}
                      unoptimized
                    />
                  </div>

                  <Stack gap="4">
                    <div>
                      <Text className="label">Current auction</Text>
                      <Heading className="auction-current__token" style={{ marginTop: '4px' }}>
                        Token #{data.auction.token_id}
                      </Heading>
                    </div>

                    <div className="auction-current__status" role="status">
                      {auctionEnded
                        ? 'Auction ended'
                        : now
                          ? formatRemaining(data.auction.end_time, now)
                          : 'Checking auction status…'}
                    </div>

                    <Text className="lede">
                      {data.auction.highest_bid === '0'
                        ? `Reserve ${formatAmount(data.config.reserve_price)} ${paymentToken}`
                        : `Highest bid ${formatAmount(data.auction.highest_bid)} ${paymentToken}`}
                    </Text>

                    {!auctionEnded ? (
                      <Text className="lede" style={{ margin: 0, fontSize: '0.85rem' }}>
                        Ends {formatDate(data.auction.end_time)}
                      </Text>
                    ) : null}

                    {data.auction.highest_bidder ? (
                      <Link className="auction-bidder mono" href={`/members/${data.auction.highest_bidder}`}>
                        {data.auction.highest_bidder}
                      </Link>
                    ) : null}

                    {auctionEnded ? (
                      <Callout
                        variant="warning"
                        title="This auction has ended."
                        description="Settle it to distribute the winning token and start the next auction."
                      />
                    ) : data.paused ? (
                      <Callout variant="warning" title="Auctions are paused." />
                    ) : (
                      <Stack gap="2">
                        <Input
                          value={amount}
                          onChange={(event) => setAmount(event.target.value)}
                          placeholder={`Minimum ${formatAmount(
                            BigInt(data.auction.highest_bid) > 0n
                              ? BigInt(data.auction.highest_bid) +
                                  (BigInt(data.auction.highest_bid) * BigInt(data.config.min_bid_increment_percent)) /
                                    100n
                              : BigInt(data.config.reserve_price)
                          )} ${paymentToken}`}
                          inputMode="decimal"
                          disabled={busy}
                        />

                        <Text className="lede" style={{ margin: 0, fontSize: '0.85rem' }}>
                          Enter an amount in {paymentToken}. SAC amounts support up to 7 decimal places.
                        </Text>

                        <Button onClick={() => void submit('bid')} disabled={busy}>
                          {busy ? 'Submitting...' : 'Place bid'}
                        </Button>
                      </Stack>
                    )}

                    {auctionEnded && !data.paused ? (
                      <Button variant="outline" onClick={() => void submit('settle')} disabled={busy}>
                        {busy ? 'Settling...' : 'Settle and start next auction'}
                      </Button>
                    ) : null}
                  </Stack>
                </div>
              </Card>

              <Grid columns={{ base: 1, md: 2 }} gap="4">
                <Card p="5">
                  <Stack gap="4">
                    <div>
                      <Text className="label">Activity</Text>
                      <Heading style={{ fontSize: '1.2rem', marginTop: '4px' }}>Recent bids</Heading>
                    </div>

                    {data.bids.length ? (
                      <Stack gap="2">
                        {data.bids.map((bid, index) => (
                          <div
                            key={`${bid.bidder}-${index}`}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: '12px',
                              padding: '12px 0',
                              borderTop: index ? '1px solid rgba(148,163,184,0.14)' : undefined
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <Link href={`/members/${bid.bidder}`}>
                                <ShortId value={bid.bidder} label="Bidder" />
                              </Link>

                              <Text
                                className="lede"
                                style={{
                                  margin: '4px 0 0',
                                  fontSize: '0.78rem'
                                }}
                              >
                                {bid.timestamp ? formatDate(bid.timestamp) : 'Recently'}
                              </Text>
                            </div>

                            <Text
                              className="mono"
                              style={{
                                margin: 0,
                                fontSize: '1rem',
                                fontWeight: 700,
                                whiteSpace: 'nowrap'
                              }}
                            >
                              {formatAmount(bid.amount)} {paymentToken}
                            </Text>
                          </div>
                        ))}
                      </Stack>
                    ) : (
                      <Text className="lede">No bids yet. Be the first to bid.</Text>
                    )}
                  </Stack>
                </Card>

                <Card p="5">
                  <Stack gap="4">
                    <div>
                      <Text className="label">Archive</Text>
                      <Heading style={{ fontSize: '1.2rem', marginTop: '4px' }}>Past auctions</Heading>
                    </div>

                    {data.history.length ? (
                      <Stack gap="2">
                        {data.history.map((auction, index) => (
                          <div
                            key={auction.token_id}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: '12px',
                              padding: '12px 0',
                              borderTop: index ? '1px solid rgba(148,163,184,0.14)' : undefined
                            }}
                          >
                            <div>
                              <Text style={{ margin: 0, fontWeight: 600 }}>Token #{auction.token_id}</Text>

                              <div
                                className="lede"
                                style={{
                                  margin: '4px 0 0',
                                  fontSize: '0.78rem'
                                }}
                              >
                                {auction.highest_bidder ? (
                                  <Link href={`/members/${auction.highest_bidder}`}>
                                    <ShortId value={auction.highest_bidder} label="Winner" />
                                  </Link>
                                ) : (
                                  'No winning bidder'
                                )}
                              </div>
                            </div>

                            <Text
                              className="mono"
                              style={{
                                margin: 0,
                                fontWeight: 700,
                                whiteSpace: 'nowrap'
                              }}
                            >
                              {formatAmount(auction.highest_bid_amount)} {paymentToken}
                            </Text>
                          </div>
                        ))}
                      </Stack>
                    ) : (
                      <Text className="lede">No settled auctions yet.</Text>
                    )}
                  </Stack>
                </Card>
              </Grid>
            </>
          ) : data && !data.auction ? (
            <Callout variant="warning" title="Current auction data is unavailable." />
          ) : null}
          {message ? <Callout variant="warning" title={message} /> : null}
        </Stack>
      </PageSection>
    </DaoShell>
  );
}
