'use client';

import { ArrowUpRight } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';

import { Card, Heading, Text } from '@/components/ui';
import { formatActivity, relativeTime } from '@/lib/activity-feed';
import { daoRoute } from '@/lib/dao-routes';
import type { DashboardFeedItem } from '@/lib/goldsky-queries';

function formatActivityDate(value: string | number | null) {
  if (!value) return 'Date unavailable';

  const numericValue = Number(value);
  const date = Number.isFinite(numericValue)
    ? new Date(numericValue > 1_000_000_000_000 ? numericValue : numericValue * 1000)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';

  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function row(item: DashboardFeedItem) {
  return formatActivity(item, item.dao_id);
}

function daoName(item: DashboardFeedItem) {
  return item.token_name || item.token_symbol || 'Unnamed DAO';
}

export function DashboardFeed({
  items,
  isLoading,
  error
}: {
  items: DashboardFeedItem[];
  isLoading: boolean;
  error?: string;
}) {
  return (
    <section className="dashboard-feed" aria-labelledby="dashboard-feed-title">
      <div className="dashboard-feed__heading">
        <div>
          <p className="eyebrow">Your communities</p>
          <Heading id="dashboard-feed-title" style={{ fontSize: '1.35rem', margin: '6px 0 0' }}>
            Recent activity
          </Heading>
        </div>
        <Text className="lede dashboard-feed__hint">Governance and onchain activity from your DAOs.</Text>
      </div>

      {isLoading ? <Text role="status">Loading recent activity...</Text> : null}
      {error ? <Text className="dashboard-feed__error">{error}</Text> : null}
      {!isLoading && !error && !items.length ? (
        <div className="empty-state dashboard-feed__empty" role="status">
          <p className="eyebrow">Nothing new yet</p>
          <Heading style={{ fontSize: '1.25rem', margin: '8px 0' }}>Your feed is waiting for activity</Heading>
          <Text className="lede">
            Proposals, votes, auctions, sales and allocations from your DAOs will appear here.
          </Text>
        </div>
      ) : null}
      {items.length ? (
        <div className="dashboard-feed__list">
          {items.map((item) => (
            <Card key={item.activity_id} className="dashboard-feed__item" p="4">
              <div className="dashboard-feed__item-topline">
                <Text className="label">
                  {daoName(item)} · {row(item).category}
                </Text>
                <time className="dashboard-feed__date" title={formatActivityDate(item.timestamp)}>
                  {relativeTime(item.timestamp)}
                </time>
              </div>
              <Heading style={{ fontSize: '1rem', margin: '8px 0 4px' }}>{row(item).title}</Heading>
              {row(item).detail ? <Text className="dashboard-feed__summary">{row(item).detail}</Text> : null}
              <Link
                className="dashboard-feed__link"
                href={(row(item).href as Route | undefined) ?? daoRoute(item.dao_id)}
              >
                {row(item).href ? 'View' : 'Open DAO'}
                <ArrowUpRight aria-hidden="true" size={14} />
              </Link>
            </Card>
          ))}
        </div>
      ) : null}
    </section>
  );
}
