'use client';

import { ArrowRight, Plus } from 'lucide-react';
import { css } from 'styled-system/css';

import { ActivityList } from '@/components/activity/activity-list';
import { CommunityCard, type CommunitySummary } from '@/components/community/community-card';
import { communityGrid, toCommunitySummary } from '@/components/community/community-grid';
import { LocalDrafts } from '@/components/local-workspace/local-drafts';
import { useWalletSession } from '@/components/shell/wallet-session';
import { Button, ButtonLink, Callout, EmptyState, Section, Skeleton } from '@/components/ui';
import { useHomeDao } from '@/hooks/use-home-dao';
import type { DaoConfig } from '@/lib/dao-db';
import { useDashboardData } from '@/lib/goldsky-queries';

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
const credit = css({ textStyle: 'caption', color: 'ink.muted', m: '0' });

function SignedOutHome({ daos }: { daos: DaoConfig[] }) {
  const featured = daos.slice(0, 8).map((dao) => toCommunitySummary(dao));
  return (
    <div className={page}>
      <section className={hero} aria-labelledby="home-title">
        <h1 id="home-title" className={heroTitle}>
          Your community. Your rules. Your treasury.
        </h1>
        <p className={heroBody}>
          Start a DAO with your people, vote on what happens next, and see exactly where the shared money goes. All on
          Stellar, with fees that cost a fraction of a cent.
        </p>
        <div className={heroActions}>
          <ButtonLink href="/discover" size="lg">
            Find a community
          </ButtonLink>
          <ButtonLink href="/create" variant="secondary" size="lg">
            Start a DAO
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
            <p className={stepTitle}>Start or find a community</p>
            <p className={stepBody}>Give it a name, art and a treasury. Or join one that already exists.</p>
          </li>
          <li className={step}>
            <p className={stepTitle}>Members get a token</p>
            <p className={stepBody}>Win one in the auction or buy one on the market. Each token is a vote.</p>
          </li>
          <li className={step}>
            <p className={stepTitle}>Decide together</p>
            <p className={stepBody}>
              Anyone can propose. Members vote, and the treasury only moves when a vote passes.
            </p>
          </li>
        </ol>
      </Section>

      <p className={credit}>Built on Nouns Builder, for communities on Stellar.</p>
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
          name: dao.token_name || dao.token_symbol || 'Unnamed community',
          symbol: dao.token_symbol,
          description: dao.token_description,
          image: dao.contract_image,
          status: dao.status
        };
    return { ...summary, yours: dao.dao_id === home?.id ? 'Home' : 'Member' };
  });
  mine.sort((a, b) => (a.yours === 'Home' ? -1 : b.yours === 'Home' ? 1 : 0));
  const setup = pendingDaos.map((dao) => toCommunitySummary(dao, 'Launch admin'));
  const suggestions = daos
    .filter((dao) => !mine.some((item) => item.id === dao.dao_id))
    .slice(0, 4)
    .map((dao) => toCommunitySummary(dao));

  return (
    <div className={page}>
      <header className={css({ display: 'grid', gap: '2', pt: { base: '2', md: '4' } })}>
        <h1 className={greeting}>Welcome back</h1>
        <p className={heroBody}>Here&apos;s what&apos;s happening in your communities.</p>
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
        title="Your communities"
        action={
          <ButtonLink href="/create" variant="ghost" size="sm">
            <Plus aria-hidden="true" />
            Start one
          </ButtonLink>
        }
      >
        {error ? (
          <Callout variant="error" title="Your communities didn't load" description="Try again in a moment." />
        ) : isLoading ? (
          <div className={communityGrid} role="status" aria-busy="true">
            <span className="sr-only">Loading your communities</span>
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
          <EmptyState
            title="You're not in a community yet"
            action={<ButtonLink href="/discover">Find a community</ButtonLink>}
          >
            Win an auction or buy a token to become a member. Your communities will show up here.
          </EmptyState>
        )}
      </Section>

      {data?.feed.items.length ? (
        <Section title="Recent activity">
          <ActivityList
            items={data.feed.items}
            daoIdFor={(item) => ('dao_id' in item ? item.dao_id : '')}
            showCommunity
          />
        </Section>
      ) : null}

      {suggestions.length ? (
        <Section
          title="Discover more"
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

      <LocalDrafts />
    </div>
  );
}

/** Builder home: a real welcome when signed out, your communities when signed in. */
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
          title="Communities didn't load"
          description="Try again in a moment, or open a community directly if you have its link."
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
