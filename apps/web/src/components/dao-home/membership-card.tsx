'use client';

import { css, sva } from 'styled-system/css';

import { Avatar, ButtonLink, Chip, Skeleton } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { useDaoMembership } from '@/hooks/use-dao-membership';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { hasAuction, hasMarketplace } from '@/lib/dao-nav';
import { daoRoute } from '@/lib/dao-routes';

const card = sva({
  slots: ['root', 'head', 'title', 'stats', 'stat', 'value', 'label', 'body'],
  base: {
    root: {
      display: 'grid',
      gap: '4',
      p: '5',
      borderRadius: 'card',
      bg: 'surface',
      boxShadow: 'raised'
    },
    head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '3' },
    title: { textStyle: 'heading', m: '0' },
    stats: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '3' },
    stat: { display: 'grid', gap: '0.5', p: '3', borderRadius: 'control', bg: 'brass.wash' },
    value: { textStyle: 'title', fontSize: '1.375rem', color: 'brass', fontVariantNumeric: 'tabular-nums' },
    label: { textStyle: 'caption', color: 'ink.muted' },
    body: { textStyle: 'body', color: 'ink.muted', m: '0' }
  },
  variants: {
    yours: {
      true: { root: { boxShadow: 'inset 0 0 0 1px token(colors.brass.edge)' } }
    }
  }
});

/**
 * "This is yours": the viewer's stake in the community, or how to get one.
 */
export function MembershipCard({ config }: { config: DaoNetworkConfig }) {
  const { routeId } = useDaoContext();
  const membership = useDaoMembership(config);
  const classes = card({ yours: membership.isMember });

  if (!membership.address) {
    return (
      <section className={classes.root} aria-labelledby="membership-title">
        <h2 id="membership-title" className={classes.title}>
          Your membership
        </h2>
        <p className={classes.body}>Connect your wallet to see your tokens and votes here.</p>
      </section>
    );
  }

  if (membership.isLoading) {
    return (
      <section className={classes.root} role="status" aria-busy="true">
        <span className="sr-only">Loading your membership</span>
        <Skeleton className={css({ height: '6', width: '40' })} />
        <Skeleton className={css({ height: '20' })} />
      </section>
    );
  }

  if (!membership.isMember || !membership.member) {
    const way = hasAuction(config) ? 'auction' : hasMarketplace(config) ? 'market' : null;
    return (
      <section className={classes.root} aria-labelledby="membership-title">
        <h2 id="membership-title" className={classes.title}>
          Join {config.tokenName}
        </h2>
        <p className={classes.body}>
          Members hold a token. Each token is a vote on how the community and its treasury move.
        </p>
        {way ? (
          <ButtonLink href={daoRoute(routeId, way === 'auction' ? 'auctions' : 'marketplace')} variant="secondary">
            {way === 'auction' ? 'Bid in the auction' : 'Find a token on the market'}
          </ButtonLink>
        ) : null}
      </section>
    );
  }

  const delegated = Boolean(
    membership.member.delegated_to && membership.member.delegated_to !== membership.member.address
  );

  return (
    <section className={classes.root} aria-labelledby="membership-title">
      <div className={classes.head}>
        <h2 id="membership-title" className={classes.title}>
          Your membership
        </h2>
        <Avatar address={membership.address} size="sm" yours />
      </div>
      <div className={classes.stats}>
        <div className={classes.stat}>
          <span className={classes.value}>{membership.tokenCount.toString()}</span>
          <span className={classes.label}>{membership.tokenCount === 1n ? 'Token' : 'Tokens'}</span>
        </div>
        <div className={classes.stat}>
          <span className={classes.value}>{membership.votingPower.toString()}</span>
          <span className={classes.label}>Votes</span>
        </div>
      </div>
      <div className={css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '3' })}>
        <span className={classes.label}>{delegated ? 'Your votes go to a delegate' : 'You vote for yourself'}</span>
        {delegated ? <Chip>Delegated</Chip> : null}
      </div>
      <ButtonLink href={daoRoute(routeId, `members/${membership.address}`)} variant="secondary">
        Tokens and delegation
      </ButtonLink>
    </section>
  );
}
