'use client';

import NextLink from 'next/link';
import { css, sva } from 'styled-system/css';
import useSWR from 'swr';

import { Chip, Countdown, Crest, crestHueStyle, FallbackImage } from '@/components/ui';
import { useNow } from '@/hooks/use-now';
import { formatAuctionAmount } from '@/lib/auction-history/state';
import { daoRoute } from '@/lib/dao-routes';

export type CommunitySummary = {
  id: string;
  /** What links use: the claimed slug once launched; falls back to `id`. */
  routeId?: string;
  name: string;
  symbol?: string | null;
  description?: string | null;
  image?: string | null;
  status: 'pending' | 'operational' | string;
  hasAuction?: boolean;
  hasMarket?: boolean;
  /** e.g. "Home" or "Launch admin"; shown as a brass chip. */
  yours?: string;
};

type CardAuction = {
  status: 'active' | 'disabled' | 'not-launched' | 'paused';
  auction: {
    token_id: string;
    end_time: string;
    highest_bid: string;
    highest_bidder: string | null;
    settled: boolean;
  } | null;
  config: { reserve_price: string };
  paused: boolean;
};

async function fetchJson<T>(url: string) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error('unavailable');
  return (await response.json()) as T;
}

const card = sva({
  slots: ['root', 'art', 'fallback', 'liveTag', 'body', 'name', 'meta', 'description', 'footer'],
  base: {
    root: {
      display: 'grid',
      gridTemplateRows: 'auto 1fr',
      minW: '0',
      bg: 'surface',
      borderRadius: 'card',
      boxShadow: 'raised',
      overflow: 'hidden',
      color: 'ink',
      textDecoration: 'none',
      transitionProperty: 'translate, box-shadow',
      transitionDuration: 'pop',
      transitionTimingFunction: 'out',
      '@media (hover: hover) and (pointer: fine)': { _hover: { translate: '0 -2px', boxShadow: 'float' } },
      _focusVisible: { outline: '2px solid', outlineColor: 'signal', outlineOffset: '3px' },
      '@media (prefers-reduced-motion: reduce)': { _hover: { translate: '0 0' } }
    },
    art: {
      position: 'relative',
      aspectRatio: '1',
      overflow: 'hidden',
      bg: 'hover',
      '& img': { position: 'absolute', inset: '0', width: '100%', height: '100%', objectFit: 'cover' }
    },
    fallback: {
      position: 'absolute',
      inset: '0',
      display: 'grid',
      placeItems: 'center',
      bg: 'hsl(var(--crest-hue) 30% 18%)',
      _light: { bg: 'hsl(var(--crest-hue) 40% 90%)' }
    },
    liveTag: { position: 'absolute', left: '3', top: '3' },
    body: { display: 'grid', alignContent: 'start', gap: '1.5', p: '4' },
    name: { textStyle: 'heading', fontSize: '1.0625rem', m: '0', overflowWrap: 'anywhere' },
    meta: { textStyle: 'caption', color: 'ink.muted', m: '0', fontVariantNumeric: 'tabular-nums' },
    description: { textStyle: 'caption', fontSize: '0.875rem', color: 'ink.muted', m: '0', lineClamp: '2' },
    footer: { display: 'flex', flexWrap: 'wrap', gap: '1.5', mt: '1' }
  }
});

const strong = css({ color: 'ink', fontWeight: '600' });

/**
 * Art-first community card. The live auction token's art leads when there is
 * one; otherwise the community image; otherwise its tinted crest. Only
 * meaningful facts are shown — never "n/a".
 */
export function CommunityCard({ community }: { community: CommunitySummary }) {
  const classes = card();
  const auctionKey =
    community.hasAuction && community.status === 'operational'
      ? `/api/dao/${encodeURIComponent(community.id)}/auctions`
      : null;
  const { data: auction } = useSWR<CardAuction>(auctionKey, fetchJson, {
    revalidateOnFocus: false,
    shouldRetryOnError: false
  });
  const live =
    auction?.status === 'active' && auction.auction && !auction.paused && !auction.auction.settled
      ? auction.auction
      : null;
  const endsAt = live ? Number(live.end_time) : 0;
  const now = useNow();
  const ended = Boolean(live && now !== null && endsAt <= now);

  return (
    <NextLink href={daoRoute(community.routeId ?? community.id)} className={classes.root}>
      <div className={classes.art}>
        {live ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/render/${encodeURIComponent(community.id)}/${live.token_id}`}
            alt={`${community.name} #${live.token_id}`}
            loading="lazy"
          />
        ) : community.image ? (
          <FallbackImage src={community.image} alt="" errorFallbackSrc="" loading="lazy" />
        ) : (
          <span className={classes.fallback} style={crestHueStyle(community.id)} aria-hidden="true">
            <Crest name={community.name} seed={community.id} size="xl" />
          </span>
        )}
        {live ? (
          <span className={classes.liveTag}>
            <Chip tone={ended ? 'warning' : 'live'}>{ended ? 'Ready to settle' : 'Auction live'}</Chip>
          </span>
        ) : null}
      </div>
      <div className={classes.body}>
        <p className={classes.name}>
          {community.name}
          {live ? ` #${live.token_id}` : ''}
        </p>
        {live ? (
          <p className={classes.meta}>
            {ended && !live.highest_bidder ? (
              'No bids this round'
            ) : (
              <>
                {live.highest_bidder ? (ended ? 'Won for ' : 'Top bid ') : 'Starts at '}
                <span className={strong}>
                  {formatAuctionAmount(live.highest_bidder ? live.highest_bid : auction?.config.reserve_price)}
                </span>
                {ended ? null : (
                  <>
                    {' · '}
                    <Countdown endsAt={endsAt} /> left
                  </>
                )}
              </>
            )}
          </p>
        ) : community.description ? (
          <p className={classes.description}>{community.description}</p>
        ) : community.symbol ? (
          <p className={classes.meta}>{community.symbol}</p>
        ) : null}
        <div className={classes.footer}>
          {community.yours ? <Chip tone="yours">{community.yours}</Chip> : null}
          {community.status === 'pending' ? <Chip tone="warning">In setup</Chip> : null}
          {community.hasMarket ? <Chip tone="outline">Market</Chip> : null}
        </div>
      </div>
    </NextLink>
  );
}
