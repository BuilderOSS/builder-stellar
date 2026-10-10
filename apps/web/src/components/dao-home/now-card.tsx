'use client';

import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import type { ReactNode } from 'react';
import { css, sva } from 'styled-system/css';

import { ButtonLink, Chip, Countdown, Skeleton } from '@/components/ui';
import { formatAuctionAmount } from '@/lib/auction-history/state';
import { daoRoute } from '@/lib/dao-routes';
import { useTokenMetadata } from '@/lib/token-queries';

export type HomeAuction = {
  status: 'active' | 'disabled' | 'not-launched' | 'paused';
  auction: {
    token_id: string;
    start_time: string;
    end_time: string;
    highest_bid: string;
    highest_bidder: string | null;
    settled: boolean;
  } | null;
  config: { reserve_price: string; min_bid_increment_percent: number; payment_token: string | null };
  paused: boolean;
};

const card = sva({
  slots: ['root', 'art', 'body', 'title', 'text', 'meta', 'action'],
  base: {
    root: {
      display: 'grid',
      gap: '4',
      p: { base: '5', md: '6' },
      borderRadius: 'sheet',
      bg: 'surface',
      boxShadow: 'raised',
      md: { gridTemplateColumns: 'auto minmax(0, 1fr)', alignItems: 'center', gap: '6' }
    },
    art: {
      width: { base: '100%', md: '44' },
      maxW: { base: '64', md: 'none' },
      aspectRatio: '1',
      borderRadius: 'card',
      overflow: 'hidden',
      bg: 'hover',
      outline: '1px solid',
      outlineColor: 'imageEdge',
      outlineOffset: '-1px',
      '& img': { width: '100%', height: '100%', objectFit: 'cover' }
    },
    body: { display: 'grid', gap: '2', alignContent: 'start', minW: '0' },
    title: { textStyle: 'title', fontSize: { base: '1.375rem', md: '1.625rem' }, m: '0' },
    text: { textStyle: 'body', color: 'ink.muted', m: '0', maxW: '56ch' },
    meta: { display: 'flex', flexWrap: 'wrap', gap: '2', alignItems: 'center' },
    action: { display: 'flex', flexWrap: 'wrap', gap: '2', mt: '2' }
  }
});

const big = css({ textStyle: 'title', fontSize: '1.25rem', color: 'ink', fontVariantNumeric: 'tabular-nums' });
const label = css({ textStyle: 'caption', color: 'ink.muted' });
const figures = css({ display: 'flex', flexWrap: 'wrap', gap: { base: '5', md: '8' }, py: '1' });

function AuctionArt({ daoId, tokenId }: { daoId: string; tokenId: number }) {
  const { data, isLoading } = useTokenMetadata(daoId, tokenId);
  if (isLoading) return <Skeleton className={css({ width: '100%', height: '100%' })} />;
  return data ? <Image src={data.image} alt={data.name} width={352} height={352} unoptimized /> : null;
}

function Shell({
  title,
  text,
  meta,
  action,
  art
}: {
  title: ReactNode;
  text?: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  art?: ReactNode;
}) {
  const classes = card();
  return (
    <section className={classes.root} aria-labelledby="dao-now-title">
      {art ? <div className={classes.art}>{art}</div> : null}
      <div className={classes.body}>
        {meta ? <div className={classes.meta}>{meta}</div> : null}
        <h2 id="dao-now-title" className={classes.title}>
          {title}
        </h2>
        {text ? <div className={classes.text}>{text}</div> : null}
        {action ? <div className={classes.action}>{action}</div> : null}
      </div>
    </section>
  );
}

/**
 * The one thing to do here right now. Live auction beats open votes beats
 * quiet states; launch admins see their setup first.
 */
export function NowCard({
  daoId,
  name,
  isLaunchSetup,
  auction,
  auctionLoading,
  auctionError,
  proposalsLoading,
  proposalsError,
  activeProposals,
  hasAuctionModule,
  auctionEnabled,
  assetCode,
  now
}: {
  daoId: string;
  name: string;
  isLaunchSetup: boolean;
  auction: HomeAuction | undefined;
  auctionLoading: boolean;
  auctionError: Error | undefined;
  proposalsLoading: boolean;
  proposalsError: Error | undefined;
  activeProposals: number;
  hasAuctionModule: boolean;
  auctionEnabled: boolean | null;
  assetCode: string;
  now: number | null;
}) {
  if (isLaunchSetup) {
    return (
      <Shell
        meta={<Chip tone="warning">In setup</Chip>}
        title="Finish setting up your community"
        text="Add artwork, mint founder tokens and choose what runs at launch. Members can join once you launch."
        action={
          <ButtonLink href="#launch-checklist">
            Open launch checklist
            <ArrowRight aria-hidden="true" />
          </ButtonLink>
        }
      />
    );
  }

  if (auctionError && proposalsError) {
    return (
      <Shell
        title="We couldn't load what's happening"
        text="Votes and the auction didn't load. Pull to refresh, or try again in a moment."
      />
    );
  }

  const live = auction?.status === 'active' && auction.auction && !auction.paused ? auction.auction : null;
  if (live) {
    const endsAt = Number(live.end_time);
    const ended = now !== null && endsAt <= now;
    const hasBid = live.highest_bid !== '0';
    return (
      <Shell
        art={<AuctionArt daoId={daoId} tokenId={Number(live.token_id)} />}
        meta={
          <>
            <Chip tone="live">{ended ? 'Auction ended' : 'Auction live'}</Chip>
            {activeProposals ? (
              <Chip>
                {activeProposals} vote{activeProposals === 1 ? '' : 's'} open
              </Chip>
            ) : null}
          </>
        }
        title={`${name} #${live.token_id}`}
        text={
          <div className={figures}>
            <div>
              <div className={label}>{hasBid ? 'Top bid' : 'Starting at'}</div>
              <div className={big}>
                {formatAuctionAmount(hasBid ? live.highest_bid : auction?.config.reserve_price)} {assetCode}
              </div>
            </div>
            <div>
              <div className={label}>{ended ? 'Ended' : 'Ends in'}</div>
              <div className={big}>{ended ? 'Ready to settle' : <Countdown endsAt={endsAt} />}</div>
            </div>
          </div>
        }
        action={<ButtonLink href={daoRoute(daoId, 'auctions')}>{ended ? 'Settle auction' : 'Place a bid'}</ButtonLink>}
      />
    );
  }

  if (activeProposals) {
    return (
      <Shell
        meta={<Chip tone="live">Voting open</Chip>}
        title={`${activeProposals} proposal${activeProposals === 1 ? ' needs' : 's need'} votes`}
        text="Members decide together. Read what's proposed and cast your vote before it closes."
        action={<ButtonLink href={daoRoute(daoId, 'proposals')}>Go vote</ButtonLink>}
      />
    );
  }

  if (auctionLoading || proposalsLoading) {
    return (
      <section className={card().root} role="status" aria-busy="true">
        <span className="sr-only">Loading what&apos;s happening</span>
        <div className={css({ display: 'grid', gap: '3' })}>
          <Skeleton className={css({ width: '52', height: '7' })} />
          <Skeleton className={css({ width: '80', maxW: '100%', height: '4' })} />
        </div>
      </section>
    );
  }

  if (auctionError) {
    return (
      <Shell
        title="The auction didn't load"
        text="Votes and activity are below. The auction is temporarily unavailable."
        action={
          <ButtonLink href={daoRoute(daoId, 'auctions')} variant="secondary">
            View auction
          </ButtonLink>
        }
      />
    );
  }

  const quiet =
    auction?.status === 'paused'
      ? { title: 'Auctions are paused', text: 'Bidding and settlement are on hold for now.' }
      : auctionEnabled === false
        ? { title: 'All quiet for now', text: "This community doesn't run auctions. New proposals will show up here." }
        : auction?.status === 'not-launched'
          ? { title: 'The first auction is coming', text: 'Auctions are set up and will start once launched.' }
          : { title: 'All quiet for now', text: 'No votes are open and no auction is running.' };

  return (
    <Shell
      title={quiet.title}
      text={quiet.text}
      action={
        hasAuctionModule ? (
          <ButtonLink href={daoRoute(daoId, 'auctions')} variant="secondary">
            View auction
          </ButtonLink>
        ) : (
          <ButtonLink href={daoRoute(daoId, 'proposals')} variant="secondary">
            See past votes
          </ButtonLink>
        )
      }
    />
  );
}
