'use client';

import { Client as AuctionClient } from '@builder-stellar/auction-bindings';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Stack } from 'styled-system/jsx';

import { AuctionHistory } from '@/components/auction-history/history';
import { PageSection } from '@/components/page-section';
import { Button, Callout, Card, Heading, Input, ShortId, Skeleton, Text } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { getTreasuryAssets } from '@/lib/assets-config';
import { prepareBuyerAction, prepareBuyerRefund } from '@/lib/auction-history/actions';
import { auctionQueryKey, useBuyerRefund, useCurrentAuction } from '@/lib/auction-history/hooks';
import {
  assertAuctionWallet,
  auctionBuyerState,
  formatAuctionAmount,
  minimumAuctionBid,
  parseAuctionAmount,
  settlementMethod
} from '@/lib/auction-history/state';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { waitForConfirmation } from '@/lib/transaction-confirmation';
import { useTransactionFeedback } from '@/lib/transaction-feedback';
import { useAuthSessionStore } from '@/stores/auth-session-store';

export default function AuctionsPage() {
  const { daoId, daoConfig } = useDaoContext();
  const address = useAuthSessionStore((state) => state.address);
  return (
    <AuctionBuyer
      key={JSON.stringify([...auctionQueryKey(daoConfig, daoId, 'view'), address])}
      config={daoConfig}
      daoId={daoId}
    />
  );
}

function AuctionBuyer({ config, daoId }: { config: DaoNetworkConfig; daoId: string }) {
  const session = useAuthSessionStore();
  const tx = useTransactionFeedback(config.name);
  const { data, error, isLoading, mutate } = useCurrentAuction(config, daoId);
  const refund = useBuyerRefund(config, daoId, session.address);
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<'bid' | 'settle' | 'refund' | null>(null);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [now, setNow] = useState(0);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const state = auctionBuyerState(config, data, now);
  const auction = data?.auction;
  const asset = getTreasuryAssets(config.name).find((item) => item.contractId === data?.config.payment_token);
  const paymentToken = asset?.code ?? 'SAC';
  const method = data ? settlementMethod(data, now) : null;
  const canSettle = method && !['disabled', 'setup', 'loading'].includes(state);
  const walletReady = Boolean(
    session.address && session.walletNetworkPassphrase === config.passphrase && !session.walletNetworkIssue
  );

  useEffect(() => {
    mounted.current = true;
    const update = () => setNow(Math.floor(Date.now() / 1000));
    const initial = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 1000);
    return () => {
      mounted.current = false;
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, []);

  const submit = async (action: 'bid' | 'settle' | 'refund') => {
    if (inFlight.current) return;
    setMessage('');
    if (!walletReady) return setMessage('Connect a wallet on the DAO network first.');
    if (action !== 'refund' && (!data || state === 'setup' || state === 'disabled'))
      return setMessage('Auctions are not available for this DAO.');
    if (action === 'bid' && state !== 'active') return setMessage('This auction is not accepting bids.');
    if (action === 'settle' && !canSettle) return setMessage('This auction cannot be settled yet.');
    const parsed = parseAuctionAmount(amount);
    if (action === 'bid' && (parsed === null || parsed < minimumAuctionBid(data!)))
      return setMessage(
        `Enter at least ${formatAuctionAmount(minimumAuctionBid(data!))} ${paymentToken}, up to 7 decimals.`
      );
    inFlight.current = true;
    setBusy(action);
    tx.start(action === 'bid' ? 'Preparing bid…' : action === 'settle' ? 'Preparing settlement…' : 'Preparing refund…');
    const bidder = session.address;
    const assertWallet = async () => {
      if (!mounted.current) throw new Error('Auction view changed. Review the current DAO before signing.');
      const current = useAuthSessionStore.getState();
      assertAuctionWallet(current.address, current.walletNetworkPassphrase, bidder, config.passphrase);
      const [wallet, network] = await Promise.all([StellarWalletsKit.getAddress(), StellarWalletsKit.getNetwork()]);
      assertAuctionWallet(wallet.address, network.networkPassphrase, bidder, config.passphrase);
      if (!mounted.current) throw new Error('Auction view changed.');
    };
    try {
      await assertWallet();
      const client = new AuctionClient({
        contractId: config.auctionContractId,
        rpcUrl: config.rpcUrl,
        networkPassphrase: config.passphrase,
        publicKey: bidder,
        allowHttp: config.name === 'local',
        signTransaction: async (xdr, opts) => {
          await assertWallet();
          if (opts?.networkPassphrase && opts.networkPassphrase !== config.passphrase)
            throw new Error('Unexpected signing network.');
          if (opts?.address && opts.address !== bidder) throw new Error('Unexpected signing account.');
          return StellarWalletsKit.signTransaction(xdr, { networkPassphrase: config.passphrase, address: bidder });
        }
      });
      let assembled;
      if (action === 'refund') {
        assembled = await prepareBuyerRefund(client, bidder);
      } else {
        assembled = await prepareBuyerAction(client, data!, bidder, action, parsed);
      }
      // Only this explicit user action opens the wallet. Reads never sign.
      const sent = await assembled.signAndSend();
      const hash = sent.sendTransactionResponse?.hash ?? '';
      tx.submitted('Auction transaction submitted', hash);
      await waitForConfirmation(hash, config.rpcUrl);
      tx.success(action === 'bid' ? 'Bid confirmed' : action === 'settle' ? 'Auction settled' : 'Refund claimed', hash);
      if (mounted.current) {
        setAmount('');
        setHistoryRevision((value) => value + 1);
      }
      await Promise.all([mutate(), refund.mutate()]);
    } catch (error) {
      tx.fail(error, 'Auction transaction failed', 'auction');
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(null);
    }
  };

  return (
    <PageSection title="Auctions" description="Bid on the current collectible and browse the auction archive.">
      <Stack gap="6">
        <Text className="label">
          {config.label || config.name} · {paymentToken} payments
        </Text>
        {state === 'setup' ? (
          <Callout
            variant="warning"
            title="Auction setup"
            description="This DAO has not launched. Bidding and settlement are unavailable until launch."
          />
        ) : null}
        {state === 'disabled' ? (
          <Callout
            variant="warning"
            title="Auctions are disabled"
            description="This DAO is not running primary auctions."
          />
        ) : null}
        {state === 'not-launched' ? (
          <Callout
            variant="warning"
            title="No auction has started"
            description="The DAO must launch or resume its auction module before bidding can begin."
          />
        ) : null}
        {state === 'paused' && !auction ? (
          <Callout
            variant="warning"
            title="Auctions are paused"
            description="There is no current token to bid on or settle."
          />
        ) : null}
        {error && !['setup', 'disabled'].includes(state) ? (
          <Callout variant="error" title="Current auction unavailable" description={error.message}>
            <Button variant="outline" onClick={() => void mutate()}>
              Retry current auction
            </Button>
          </Callout>
        ) : null}
        {isLoading && !data && !['setup', 'disabled'].includes(state) ? (
          <Card p="6">
            <Skeleton style={{ width: '100%', height: '220px' }} />
            <Text role="status">Loading auction…</Text>
          </Card>
        ) : null}
        {refund.error ? (
          <Callout
            variant="warning"
            title="Refund balance unavailable"
            description="Retry before assuming there is no refund."
          >
            <Button variant="outline" onClick={() => void refund.mutate()}>
              Retry refund
            </Button>
          </Callout>
        ) : null}
        {refund.data !== undefined && refund.data > 0n ? (
          <Callout
            variant="warning"
            title={`Deferred refund: ${formatAuctionAmount(refund.data)} ${paymentToken}`}
            description="The contract holds an outbid refund that could not be delivered. Claiming withdraws your entire deferred balance."
          >
            <Button onClick={() => void submit('refund')} disabled={Boolean(busy) || !walletReady}>
              {busy === 'refund' ? 'Claiming…' : 'Claim refund'}
            </Button>
          </Callout>
        ) : null}
        {auction && data && !['disabled', 'setup'].includes(state) ? (
          <Card p="6">
            <Stack gap="4">
              <Image
                src={`/api/render/${encodeURIComponent(daoId)}/${auction.token_id}`}
                alt={`Token #${auction.token_id}`}
                width={280}
                height={280}
                unoptimized
                style={{ maxWidth: '100%', borderRadius: '16px' }}
              />
              <Heading>Token #{auction.token_id}</Heading>
              <Text role="status">
                {state === 'expired'
                  ? 'Auction expired · awaiting settlement'
                  : state === 'paused'
                    ? 'Auction paused'
                    : state === 'settled'
                      ? 'Auction settled'
                      : state === 'active'
                        ? `${Math.max(0, Number(auction.end_time) - now)} seconds remaining`
                        : 'Checking auction time…'}
              </Text>
              <Text>
                {auction.highest_bidder
                  ? `Highest bid ${formatAuctionAmount(auction.highest_bid)}`
                  : `Reserve ${formatAuctionAmount(data.config.reserve_price)}`}{' '}
                {paymentToken}
              </Text>
              <ShortId value={data.config.payment_token} label="Payment token" />
              {auction.highest_bidder ? (
                <Link href={`/dao/${encodeURIComponent(daoId)}/members/${auction.highest_bidder}`}>
                  <ShortId value={auction.highest_bidder} label="Highest bidder" />
                </Link>
              ) : null}
              <Text>Ends {new Date(Number(auction.end_time) * 1000).toLocaleString()}</Text>
              {state === 'active' ? (
                <Stack gap="2">
                  <label htmlFor="auction-bid">Your bid ({paymentToken})</label>
                  <Input
                    id="auction-bid"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    inputMode="decimal"
                    disabled={Boolean(busy)}
                    placeholder={`Minimum ${formatAuctionAmount(minimumAuctionBid(data))}`}
                  />
                  <Text>
                    Up to 7 decimals. The full bid is escrowed, not just the increment. A late bid may extend the
                    auction.
                  </Text>
                  <Button onClick={() => void submit('bid')} disabled={Boolean(busy) || !walletReady || Boolean(error)}>
                    {busy === 'bid' ? 'Submitting…' : 'Place bid'}
                  </Button>
                </Stack>
              ) : null}
              {state === 'paused' || state === 'expired' ? (
                <Callout
                  variant="warning"
                  title={state === 'paused' ? 'Bidding is paused' : 'Bidding has ended'}
                  description={`${auction.highest_bidder ? 'Settlement transfers the token to the winner and proceeds to treasury.' : 'With no bids, settlement transfers the unsold token to treasury; it is not burned.'} ${data.paused ? 'Once the end time passes, paused settlement closes this auction without starting another.' : 'Settlement also mints and starts the next auction.'}`}
                />
              ) : null}
              {canSettle ? (
                <Button
                  variant="outline"
                  onClick={() => void submit('settle')}
                  disabled={Boolean(busy) || !walletReady || Boolean(error)}
                >
                  {busy === 'settle'
                    ? 'Settling…'
                    : method === 'settle_auction'
                      ? 'Settle paused auction only'
                      : 'Settle and start next auction'}
                </Button>
              ) : null}
              {!walletReady ? (
                <Text>Connect a wallet on {config.label || config.name} to bid, settle, or claim a refund.</Text>
              ) : null}
              <Heading>Recent bids</Heading>
              {data.bids?.length ? (
                data.bids.map((bid) => (
                  <div key={bid.event_id}>
                    <Link href={`/dao/${encodeURIComponent(daoId)}/members/${bid.bidder}`}>
                      <ShortId value={bid.bidder} label="Bidder" />
                    </Link>
                    <Text className="mono">
                      {formatAuctionAmount(bid.amount)} {paymentToken}
                    </Text>
                    <Text>{bid.timestamp ? new Date(bid.timestamp).toLocaleString() : 'Time unavailable'}</Text>
                  </div>
                ))
              ) : (
                <Text>No indexed bids yet. Recent confirmations may take a moment to appear.</Text>
              )}
            </Stack>
          </Card>
        ) : null}
        {config.auctionContractId ? <AuctionHistory key={historyRevision} config={config} daoId={daoId} /> : null}
        {message ? <Callout variant="warning" title={message} /> : null}
      </Stack>
    </PageSection>
  );
}
