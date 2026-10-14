'use client';

import { ArrowRight, ExternalLink, Plus } from 'lucide-react';
import { useState } from 'react';
import { css } from 'styled-system/css';

import { ActivityList } from '@/components/activity/activity-list';
import { CommunityCard, type CommunitySummary } from '@/components/community/community-card';
import { communityGrid, toCommunitySummary } from '@/components/community/community-grid';
import { BuilderDaoCredit } from '@/components/shell/brand-mark';
import { useWalletSession } from '@/components/shell/wallet-session';
import { Button, ButtonLink, Callout, EmptyState, Section, Skeleton } from '@/components/ui';
import { useHomeDao } from '@/hooks/use-home-dao';
import type { DaoConfig } from '@/lib/dao-db';
import { plainSummary } from '@/lib/dao-profile';
import { useDashboardData } from '@/lib/goldsky-queries';
import { SOURCE_URL } from '@/lib/site';

import { HomeDrafts } from './home-drafts';

const ACTIVITY_SHOWN = 5;
const SUGGESTIONS_SHOWN = 4;

const more = css({ display: 'flex', justifyContent: 'center', pt: '2' });
const hero = css({ display: 'grid', gap: '5', py: { base: '6', md: '12' }, maxW: '760px' });
const heroTitle = css({
  fontFamily: 'display',
  fontWeight: '800',
  fontSize: { base: '2.5rem', md: '4rem' },
  lineHeight: '0.98',
  letterSpacing: '-0.03em',
  m: '0',
  textWrap: 'balance'
});
const heroBody = css({
  textStyle: 'body',
  fontSize: { base: '1.0625rem', md: '1.25rem' },
  color: 'ink.muted',
  m: '0',
  maxW: '56ch'
});
const heroActions = css({ display: 'flex', flexWrap: 'wrap', gap: '2' });
const greeting = css({ textStyle: 'display', fontSize: { base: '1.875rem', md: '2.5rem' }, m: '0' });
const page = css({ display: 'grid', gap: { base: '10', md: '14' } });
const steps = css({
  display: 'grid',
  gap: '4',
  listStyle: 'none',
  m: '0',
  p: '0',
  counterReset: 'step',
  md: { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }
});
const step = css({
  display: 'grid',
  gap: '1.5',
  counterIncrement: 'step',
  _before: {
    content: 'counter(step)',
    display: 'grid',
    placeItems: 'center',
    width: '8',
    height: '8',
    mb: '1',
    borderRadius: 'full',
    bg: 'signal.wash',
    color: 'signal',
    fontWeight: '700'
  }
});
const stepTitle = css({ textStyle: 'subheading', m: '0' });
const stepBody = css({ textStyle: 'body', color: 'ink.muted', m: '0' });
const hood = css({
  display: 'grid',
  gap: '4',
  listStyle: 'none',
  m: '0',
  p: '0',
  sm: { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' },
  lg: { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }
});
const hoodItem = css({ display: 'grid', gap: '0.5', pt: '3', borderTopWidth: '1px', borderColor: 'rule' });
const hoodTitle = css({ textStyle: 'label', m: '0' });
const hoodBody = css({ textStyle: 'caption', color: 'ink.muted', m: '0' });
const credit = css({
  textStyle: 'caption',
  color: 'ink.muted',
  m: '0',
  '& a': { color: 'ink', _hover: { color: 'signal' } }
});

function SignedOutHome({ daos }: { daos: DaoConfig[] }) {
  const featured = daos.slice(0, 8).map((dao) => toCommunitySummary(dao));
  return (
    <div className={page}>
      <section className={hero} aria-labelledby="home-title">
        <h1 id="home-title" className={heroTitle}>
          Build a tribe.
        </h1>
        <p className={heroBody}>
          Gather your people, pool what you put in, and decide together. A DAO on Stellar: shared treasury, onchain
          votes, NFT membership. Fees cost a fraction of a cent.
        </p>
        <div className={heroActions}>
          <ButtonLink href="/create" size="lg">
            Build a tribe
          </ButtonLink>
          <ButtonLink href="/discover" variant="secondary" size="lg">
            Find a tribe
          </ButtonLink>
        </div>
      </section>

      {featured.length ? (
        <Section
          title="Happening now"
          action={
            <ButtonLink href="/discover" variant="ghost" size="sm">
              See all
              <ArrowRight aria-hidden="true" />
            </ButtonLink>
          }
        >
          <div className={communityGrid}>
            {featured.map((community) => (
              <CommunityCard key={community.id} community={community} />
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="How it works">
        <ol className={steps}>
          <li className={step}>
            <p className={stepTitle}>Gather your people</p>
            <p className={stepBody}>
              Build a tribe with a name, art and a link to share, or join one that already exists. Each member holds a
              token, and each token is one vote.
            </p>
          </li>
          <li className={step}>
            <p className={stepTitle}>Pool a treasury</p>
            <p className={stepBody}>
              People join through an auction, a sale or a claim list, and what they pay goes to the tribe&apos;s
              treasury. Anyone can add more.
            </p>
          </li>
          <li className={step}>
            <p className={stepTitle}>Decide together</p>
            <p className={stepBody}>
              Members put ideas to a vote. The treasury only moves when a vote passes, and everyone can see where it
              went.
            </p>
          </li>
        </ol>
      </Section>

      <Section
        title="Under the hood"
        description="For people who know DAOs: what a tribe runs on."
        action={
          <ButtonLink href={SOURCE_URL} variant="ghost" size="sm" external>
            Source on GitHub
            <ExternalLink aria-hidden="true" />
          </ButtonLink>
        }
      >
        <ul className={hood}>
          <li className={hoodItem}>
            <p className={hoodTitle}>Open-source Soroban contracts</p>
            <p className={hoodBody}>MIT licensed. Every tribe deploys its own token, governor and treasury.</p>
          </li>
          <li className={hoodItem}>
            <p className={hoodTitle}>Built on Nouns Builder</p>
            <p className={hoodBody}>The Nouns Builder DAO model, ported to Stellar.</p>
          </li>
          <li className={hoodItem}>
            <p className={hoodTitle}>One NFT, one vote</p>
            <p className={hoodBody}>Membership is an NFT. Holders vote or delegate their votes.</p>
          </li>
          <li className={hoodItem}>
            <p className={hoodTitle}>An onchain treasury</p>
            <p className={hoodBody}>Funds sit in the tribe&apos;s own contract and move only by a passed vote.</p>
          </li>
          <li className={hoodItem}>
            <p className={hoodTitle}>Anyone can execute a ready proposal</p>
            <p className={hoodBody}>Once a vote passes and its safety delay ends, any wallet can run the proposal.</p>
          </li>
          <li className={hoodItem}>
            <p className={hoodTitle}>Fees a fraction of a cent</p>
            <p className={hoodBody}>Stellar network fees for voting, bidding and proposing.</p>
          </li>
        </ul>
      </Section>

      <p className={credit}>
        Tribes Builder · DAOs on Stellar · <BuilderDaoCredit />
      </p>
    </div>
  );
}

function SignedInHome({ daos, pendingDaos }: { daos: DaoConfig[]; pendingDaos: DaoConfig[] }) {
  const wallet = useWalletSession();
  const { home } = useHomeDao();
  const { data, error, isLoading } = useDashboardData(wallet.address);
  const mine: CommunitySummary[] = (data?.myDaos ?? []).map((dao) => {
    const full = daos.find((item) => item.dao_id === dao.dao_id);
    const summary = full
      ? toCommunitySummary(full)
      : {
          id: dao.dao_id,
          name: dao.token_name || dao.token_symbol || 'Unnamed tribe',
          symbol: dao.token_symbol,
          description: plainSummary(dao.description),
          image: dao.image,
          status: dao.status
        };
    return { ...summary, yours: dao.dao_id === home?.id ? 'Home' : 'Member' };
  });
  mine.sort((a, b) => (a.yours === 'Home' ? -1 : b.yours === 'Home' ? 1 : 0));
  const setup = pendingDaos.map((dao) => toCommunitySummary(dao, 'Launch admin'));
  const [showAllActivity, setShowAllActivity] = useState(false);
  // Buy again first: open auctions and listings where you're already a member,
  // then live ones elsewhere, then the rest.
  const available = (community: CommunitySummary) => Boolean(community.auctionLive || community.forSale);
  const backIn = mine.filter(available);
  const elsewhere = daos
    .filter((dao) => !mine.some((item) => item.id === dao.dao_id))
    .map((dao) => toCommunitySummary(dao));
  const suggestions = [
    ...backIn,
    ...elsewhere.filter(available),
    ...elsewhere.filter((community) => !available(community))
  ].slice(0, SUGGESTIONS_SHOWN);
  const upForGrabs = suggestions.some(available);
  const activity = data?.feed.items ?? [];

  return (
    <div className={page}>
      <header className={css({ display: 'grid', gap: '2', pt: { base: '2', md: '4' } })}>
        <h1 className={greeting}>Welcome back</h1>
        <p className={heroBody}>Here&apos;s what&apos;s happening in your tribes.</p>
      </header>

      {setup.length ? (
        <Section title="Finish setting up" description="Only you can see these: your wallet is their launch admin.">
          <div className={communityGrid}>
            {setup.map((community) => (
              <CommunityCard key={community.id} community={community} />
            ))}
          </div>
        </Section>
      ) : null}

      <Section
        id="your-tribes"
        title="Your tribes"
        action={
          <ButtonLink href="/create" variant="secondary" size="sm">
            <Plus aria-hidden="true" />
            Build a tribe
          </ButtonLink>
        }
      >
        {error ? (
          <Callout variant="error" title="Your tribes didn't load" description="Try again in a moment." />
        ) : isLoading ? (
          <div className={communityGrid} role="status" aria-busy="true">
            <span className="sr-only">Loading your tribes</span>
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className={css({ aspectRatio: '0.8', borderRadius: 'card' })} />
            ))}
          </div>
        ) : mine.length ? (
          <div className={communityGrid}>
            {mine.map((community) => (
              <CommunityCard key={community.id} community={community} />
            ))}
          </div>
        ) : (
          <EmptyState title="You're not in a tribe yet" action={<ButtonLink href="/discover">Find a tribe</ButtonLink>}>
            Win an auction or buy a token to become a member. Your tribes will show up here.
          </EmptyState>
        )}
      </Section>

      {suggestions.length ? (
        <Section
          title={upForGrabs ? 'Up for grabs' : 'Discover more'}
          description={
            backIn.length
              ? "Auctions and tokens for sale in your tribes first, then what's open elsewhere."
              : upForGrabs
                ? 'Auctions taking bids and tokens for sale right now.'
                : undefined
          }
          action={
            <ButtonLink href="/discover" variant="ghost" size="sm">
              See all
              <ArrowRight aria-hidden="true" />
            </ButtonLink>
          }
        >
          <div className={communityGrid}>
            {suggestions.map((community) => (
              <CommunityCard key={community.id} community={community} />
            ))}
          </div>
        </Section>
      ) : null}

      <HomeDrafts />

      {activity.length ? (
        <Section title="Recent activity">
          <ActivityList
            items={showAllActivity ? activity : activity.slice(0, ACTIVITY_SHOWN)}
            daoIdFor={(item) => ('dao_id' in item ? item.dao_id : '')}
            showCommunity
          />
          {activity.length > ACTIVITY_SHOWN ? (
            <div className={more}>
              <Button
                variant="secondary"
                size="sm"
                aria-expanded={showAllActivity}
                onClick={() => setShowAllActivity((open) => !open)}
              >
                {showAllActivity ? 'Show less' : 'Show more'}
              </Button>
            </div>
          ) : null}
        </Section>
      ) : null}
    </div>
  );
}

/** Tribes Builder home: a real welcome when signed out, your tribes when signed in. */
export function HomeView({
  daos,
  pendingDaos,
  loadError
}: {
  daos: DaoConfig[];
  pendingDaos: DaoConfig[];
  loadError: boolean;
}) {
  const wallet = useWalletSession();
  return (
    <>
      {loadError ? (
        <Callout
          variant="error"
          title="Tribes didn't load"
          description="Try again in a moment, or open a tribe directly if you have its link."
        >
          <div>
            <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </div>
        </Callout>
      ) : null}
      {wallet.isAuthenticated ? <SignedInHome daos={daos} pendingDaos={pendingDaos} /> : <SignedOutHome daos={daos} />}
    </>
  );
}
