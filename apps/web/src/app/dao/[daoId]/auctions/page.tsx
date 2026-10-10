'use client';

import { Client as AuctionClient } from '@builder-stellar/auction-bindings';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { css } from 'styled-system/css';

import { AuctionHistory } from '@/components/auction-history/history';
import { PageSection } from '@/components/page-section';
import {
  Address,
  Amount,
  AmountInput,
  Avatar,
  Button,
  Callout,
  Chip,
  Countdown,
  Disclosure,
  ErrorState,
  Field,
  FieldHelperText,
  FieldLabel,
  ListRow,
  Section,
  Skeleton
} from '@/components/ui';
import { getNetworkConfig } from '@/config/networks';
import { useDaoContext } from '@/contexts/dao-context';
import { relativeTime, shortAddress } from '@/lib/activity-feed';
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
import { daoRoute } from '@/lib/dao-routes';
import { waitForConfirmation } from '@/lib/transaction-confirmation';
import { useTransactionFeedback } from '@/lib/transaction-feedback';
import { signWithWallet } from '@/lib/wallet-sign';
import { useAuthSessionStore } from '@/stores/auth-session-store';

const stage = css({
  display: 'grid',
  gap: { base: '6', md: '8' },
  md: { gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', alignItems: 'start' }
});
const art = css({
  aspectRatio: '1',
  borderRadius: 'sheet',
  overflow: 'hidden',
  bg: 'hover',
  outline: '1px solid',
  outlineColor: 'imageEdge',
  outlineOffset: '-1px',
  md: { position: 'sticky', top: '20' },
  '& img': { width: '100%', height: '100%', objectFit: 'cover' }
});
const panel = css({ display: 'grid', gap: '5', minW: '0' });
const tokenTitle = css({ textStyle: 'display', fontSize: { base: '2rem', md: '2.5rem' }, m: '0' });
const figures = css({ display: 'flex', flexWrap: 'wrap', gap: { base: '6', md: '10' } });
const figureLabel = css({ textStyle: 'caption', color: 'ink.muted', m: '0' });
const figureValue = css({
  textStyle: 'title',
  fontSize: '1.5rem',
  m: '0',
  mt: '0.5',
  fontVariantNumeric: 'tabular-nums'
});
const note = css({ textStyle: 'caption', color: 'ink.muted', m: '0' });

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
  const { routeId } = useDaoContext();
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
          return signWithWallet(xdr, { networkPassphrase: config.passphrase, address: bidder });
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

  const minimum = data && auction ? minimumAuctionBid(data) : null;
  const parsedAmount = parseAuctionAmount(amount);
  const bidReady = parsedAmount !== null && minimum !== null && parsedAmount >= minimum;
  const endsAt = auction ? Number(auction.end_time) : 0;
  const statusChip =
    state === 'active' ? (
      <Chip tone="live">Live</Chip>
    ) : state === 'expired' ? (
      <Chip tone="warning">Ended · ready to settle</Chip>
    ) : state === 'paused' ? (
      <Chip tone="warning">Paused</Chip>
    ) : state === 'settled' ? (
      <Chip tone="success">Settled</Chip>
    ) : null;

  return (
    <PageSection
      title="Auction"
      description="One token at a time. The winner becomes a member and the bid funds the treasury."
    >
      {state === 'setup' ? (
        <Callout
          variant="warning"
          title="Auctions start after launch"
          description="This community is still in setup. Bidding opens once it launches."
        />
      ) : null}
      {state === 'disabled' ? (
        <Callout
          title="This community doesn't run auctions"
          description="Tokens are shared another way, like the market or claims."
        />
      ) : null}
      {state === 'not-launched' ? (
        <Callout
          title="The first auction hasn't started"
          description="It starts once the auction is launched or resumed."
        />
      ) : null}
      {state === 'paused' && !auction ? (
        <Callout
          variant="warning"
          title="Auctions are paused"
          description="There's nothing to bid on or settle right now."
        />
      ) : null}
      {error && !['setup', 'disabled'].includes(state) ? (
        <ErrorState
          title="The auction didn't load"
          cause={error.message}
          actions={
            <Button variant="secondary" onClick={() => void mutate()}>
              Try again
            </Button>
          }
        />
      ) : null}
      {refund.error ? (
        <Callout
          variant="warning"
          title="We couldn't check for a refund"
          description="Try again before assuming there isn't one."
        >
          <div>
            <Button variant="secondary" size="sm" onClick={() => void refund.mutate()}>
              Check again
            </Button>
          </div>
        </Callout>
      ) : null}
      {refund.data !== undefined && refund.data > 0n ? (
        <Callout
          variant="success"
          badge="Refund waiting"
          title={`${formatAuctionAmount(refund.data)} ${paymentToken} is yours to claim`}
          description="You were outbid and the refund couldn't be sent automatically. Claiming returns all of it to your wallet."
        >
          <div>
            <Button
              onClick={() => void submit('refund')}
              disabled={Boolean(busy) || !walletReady}
              loading={busy === 'refund'}
            >
              {busy === 'refund' ? 'Claiming' : 'Claim refund'}
            </Button>
          </div>
        </Callout>
      ) : null}

      {isLoading && !data && !['setup', 'disabled'].includes(state) ? (
        <div className={stage} role="status" aria-busy="true">
          <span className="sr-only">Loading the auction</span>
          <Skeleton className={css({ aspectRatio: '1', borderRadius: 'sheet' })} />
          <div className={css({ display: 'grid', gap: '3', alignContent: 'start' })}>
            <Skeleton className={css({ width: '48', height: '9' })} />
            <Skeleton className={css({ height: '20' })} />
            <Skeleton className={css({ height: '12' })} />
          </div>
        </div>
      ) : null}

      {auction && data && !['disabled', 'setup'].includes(state) ? (
        <div className={stage}>
          <div className={art}>
            <Image
              src={`/api/render/${encodeURIComponent(daoId)}/${auction.token_id}`}
              alt={`${config.tokenName} #${auction.token_id}`}
              width={560}
              height={560}
              unoptimized
              priority
            />
          </div>

          <div className={panel}>
            <div className={css({ display: 'grid', gap: '2' })}>
              <div>{statusChip}</div>
              <h2 className={tokenTitle}>
                {config.tokenName} #{auction.token_id}
              </h2>
            </div>

            <div className={figures}>
              <div>
                <p className={figureLabel}>{auction.highest_bidder ? 'Top bid' : 'Starting at'}</p>
                <p className={figureValue}>
                  <Amount
                    value={formatAuctionAmount(
                      auction.highest_bidder ? auction.highest_bid : data.config.reserve_price
                    )}
                    unit={paymentToken}
                  />
                </p>
              </div>
              <div>
                <p className={figureLabel}>{state === 'active' ? 'Ends in' : 'Ended'}</p>
                <p className={figureValue}>
                  {state === 'active' ? (
                    <Countdown endsAt={endsAt} endedLabel="Ending" />
                  ) : (
                    new Date(endsAt * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
                  )}
                </p>
              </div>
            </div>

            {auction.highest_bidder ? (
              <ListRow
                href={daoRoute(routeId, `members/${auction.highest_bidder}`)}
                media={<Avatar address={auction.highest_bidder} yours={auction.highest_bidder === session.address} />}
                title={
                  auction.highest_bidder === session.address ? "You're winning" : shortAddress(auction.highest_bidder)
                }
                meta="Highest bidder"
              />
            ) : null}

            {state === 'active' ? (
              <div className={css({ display: 'grid', gap: '3' })}>
                <Field>
                  <FieldLabel htmlFor="auction-bid">Your bid</FieldLabel>
                  <AmountInput
                    id="auction-bid"
                    unit={paymentToken}
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    disabled={Boolean(busy)}
                    placeholder={minimum !== null ? formatAuctionAmount(minimum) : undefined}
                  />
                  <FieldHelperText>
                    {minimum !== null ? `At least ${formatAuctionAmount(minimum)} ${paymentToken}. ` : ''}
                    Your full bid is held until you&apos;re outbid, then it comes back to you.
                  </FieldHelperText>
                </Field>
                {minimum !== null && !amount ? (
                  <div>
                    <Button variant="secondary" size="sm" onClick={() => setAmount(formatAuctionAmount(minimum))}>
                      Bid the minimum
                    </Button>
                  </div>
                ) : null}
                <Button
                  block
                  size="lg"
                  onClick={() => void submit('bid')}
                  disabled={Boolean(busy) || !walletReady || Boolean(error)}
                  loading={busy === 'bid'}
                >
                  {busy === 'bid'
                    ? 'Placing your bid'
                    : bidReady
                      ? `Place ${formatAuctionAmount(parsedAmount!)} ${paymentToken} bid`
                      : 'Place bid'}
                </Button>
                <p className={note}>Bids in the last minutes add a little time so everyone gets a fair chance.</p>
              </div>
            ) : null}

            {state === 'paused' || state === 'expired' ? (
              <Callout
                title={state === 'paused' ? 'Bidding is paused' : 'Bidding has ended'}
                description={`${auction.highest_bidder ? 'Settling sends the token to the winner and the bid to the treasury.' : 'No one bid, so settling sends the token to the treasury. It is not burned.'} ${data.paused ? 'Because auctions are paused, no new auction starts.' : 'It also starts the next auction.'}`}
              />
            ) : null}
            {canSettle ? (
              <Button
                block
                variant={state === 'active' ? 'secondary' : 'primary'}
                onClick={() => void submit('settle')}
                disabled={Boolean(busy) || !walletReady || Boolean(error)}
                loading={busy === 'settle'}
              >
                {busy === 'settle'
                  ? 'Settling'
                  : method === 'settle_auction'
                    ? 'Settle (no new auction)'
                    : 'Settle and start the next auction'}
              </Button>
            ) : null}
            {!walletReady ? (
              <p className={note}>
                Connect a wallet on {getNetworkConfig(config.name).label} to bid, settle or claim a refund.
              </p>
            ) : null}

            <Section title="Bids" level={3}>
              {data.bids?.length ? (
                <div>
                  {data.bids.map((bid) => (
                    <ListRow
                      key={bid.event_id}
                      href={daoRoute(routeId, `members/${bid.bidder}`)}
                      media={<Avatar address={bid.bidder} size="sm" yours={bid.bidder === session.address} />}
                      title={bid.bidder === session.address ? 'You' : shortAddress(bid.bidder)}
                      meta={bid.timestamp ? relativeTime(bid.timestamp) : undefined}
                      trailing={<Amount value={formatAuctionAmount(bid.amount)} unit={paymentToken} />}
                    />
                  ))}
                </div>
              ) : (
                <p className={note}>No bids yet. New bids can take a moment to show up.</p>
              )}
            </Section>

            <Disclosure title="Technical details">
              {data.config.payment_token ? <Address value={data.config.payment_token} label="Payment token" /> : null}
              <Address value={config.auctionContractId} label="Auction contract" />
            </Disclosure>
          </div>
        </div>
      ) : null}

      {message ? <Callout variant="warning" title={message} /> : null}
      {config.auctionContractId ? <AuctionHistory key={historyRevision} config={config} daoId={daoId} /> : null}
    </PageSection>
  );
}
