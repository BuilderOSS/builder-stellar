import { Gavel, Landmark, Store, Users, Vote } from 'lucide-react';
import type { Route } from 'next';
import NextLink from 'next/link';
import { css, sva } from 'styled-system/css';

import { type ActivityCategory, formatActivity, relativeTime } from '@/lib/activity-feed';
import type { DashboardFeedItem, GoldskyActivityItem } from '@/lib/goldsky-queries';

const ICONS: Record<ActivityCategory, typeof Vote> = {
  Governance: Vote,
  Auction: Gavel,
  Market: Store,
  Membership: Users,
  DAO: Landmark
};

const row = sva({
  slots: ['root', 'icon', 'body', 'title', 'detail', 'time'],
  base: {
    root: {
      display: 'grid',
      gridTemplateColumns: 'auto minmax(0, 1fr) auto',
      alignItems: 'start',
      gap: '3',
      py: '3',
      color: 'ink',
      textDecoration: 'none',
      borderBottomWidth: '1px',
      borderColor: 'rule',
      _last: { borderBottomWidth: '0' }
    },
    icon: {
      display: 'grid',
      placeItems: 'center',
      width: '8',
      height: '8',
      borderRadius: 'full',
      bg: 'hover',
      color: 'ink.muted',
      '& svg': { width: '4', height: '4' }
    },
    body: { minW: '0' },
    title: { textStyle: 'body', fontWeight: '600', m: '0' },
    detail: { textStyle: 'caption', color: 'ink.muted', m: '0', mt: '0.5', overflowWrap: 'anywhere' },
    time: { textStyle: 'caption', color: 'ink.muted', whiteSpace: 'nowrap', pt: '0.5' }
  },
  variants: {
    link: {
      true: {
        root: {
          mx: '-2',
          px: '2',
          borderRadius: 'control',
          '@media (hover: hover) and (pointer: fine)': { _hover: { bg: 'hover' } },
          _focusVisible: { outline: '2px solid', outlineColor: 'signal', outlineOffset: '-2px' }
        }
      }
    }
  }
});

const communityLabel = css({ color: 'ink.muted', fontWeight: '500' });

type FeedItem = (GoldskyActivityItem | DashboardFeedItem) & {
  token_name?: string | null;
};

/**
 * What happened, in plain sentences. Pass `showCommunity` on cross-community
 * feeds so each row says where it happened.
 */
export function ActivityList({
  items,
  daoIdFor,
  showCommunity = false
}: {
  items: FeedItem[];
  daoIdFor: (item: FeedItem) => string;
  showCommunity?: boolean;
}) {
  return (
    <div>
      {items.map((item) => {
        const daoId = daoIdFor(item);
        const formatted = formatActivity(item, daoId);
        const Icon = ICONS[formatted.category] ?? Landmark;
        const classes = row({ link: Boolean(formatted.href) });
        const content = (
          <>
            <span className={classes.icon} aria-hidden="true">
              <Icon />
            </span>
            <span className={classes.body}>
              <p className={classes.title}>
                {formatted.title}
                {showCommunity && item.token_name ? <span className={communityLabel}> · {item.token_name}</span> : null}
              </p>
              {formatted.detail ? <p className={classes.detail}>{formatted.detail}</p> : null}
            </span>
            <time className={classes.time}>{relativeTime(item.timestamp)}</time>
          </>
        );
        return formatted.href ? (
          <NextLink key={item.activity_id} href={formatted.href as Route} className={classes.root}>
            {content}
          </NextLink>
        ) : (
          <div key={item.activity_id} className={classes.root}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
