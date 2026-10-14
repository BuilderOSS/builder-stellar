'use client';

import { LogOut, Moon, Settings, Sun, SunMoon, Wallet } from 'lucide-react';
import type { Route } from 'next';
import NextLink from 'next/link';
import { css } from 'styled-system/css';

import { DraftRow } from '@/components/drafts/draft-row';
import { useAllDrafts } from '@/components/drafts/use-all-drafts';
import { Address, Avatar, Button, Chip, ListRow, SegmentedControl, Sheet, Skeleton, Text } from '@/components/ui';
import { setThemePreference, useThemePreference } from '@/components/warm-ink-theme';
import { useOptionalDaoContext } from '@/contexts/dao-context';
import { useCloseOnNavigate } from '@/hooks/use-close-on-navigate';
import { useDaoMembership } from '@/hooks/use-dao-membership';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { daoRoute } from '@/lib/dao-routes';
import { DISCORD_URL } from '@/lib/site';
import { hasSeenWalletIntro } from '@/lib/wallet-intro';
import { isWarmInkPreference } from '@/lib/warm-ink-theme';

import { BuilderDaoCredit } from './brand-mark';
import { formatXlmBalance, useWalletSession } from './wallet-session';

const block = css({ display: 'grid', gap: '3', py: '4', borderBottomWidth: '1px', borderColor: 'rule' });
const identity = css({ display: 'flex', alignItems: 'center', gap: '3' });
const stat = css({ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '3' });
const statLabel = css({ textStyle: 'caption', color: 'ink.muted' });
const statValue = css({ textStyle: 'body', fontWeight: '600', fontVariantNumeric: 'tabular-nums' });
const heading = css({ textStyle: 'label', color: 'ink.muted', m: '0' });
const allLink = css({
  textStyle: 'caption',
  fontWeight: '600',
  color: 'signal',
  textDecoration: 'none',
  _hover: { textDecoration: 'underline' }
});
const dot = css({
  width: '2',
  height: '2',
  borderRadius: 'full',
  bg: 'success',
  '&[data-issue]': { bg: 'warning' }
});
const networkRow = css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '3' });
const networkStatus = css({
  display: 'flex',
  alignItems: 'center',
  gap: '2',
  textStyle: 'caption',
  color: 'ink.muted'
});
// One line where it fits; wraps on narrow screens, each separator travelling with the link after it.
// Link buttons line up with the text above them.
const flushLink = css({ px: '0' });
const footerLinks = css({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  rowGap: '1',
  textStyle: 'caption',
  color: 'ink.muted',
  '& a': { color: 'inherit', textDecoration: 'none', _hover: { color: 'ink' } },
  '& > * + *::before': { content: '"·"', px: '2', color: 'ink.faint' }
});

const DRAFTS_SHOWN = 3;

/** Your latest drafts, each with a discard, and a way to see them all. */
function YouDrafts() {
  const { items, hydrated, discard } = useAllDrafts();
  return (
    <section className={block} aria-labelledby="you-drafts-title">
      <div className={css({ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '3' })}>
        <h3 id="you-drafts-title" className={heading}>
          Drafts
        </h3>
        {items.length ? (
          <NextLink href={'/drafts' as Route} className={allLink}>
            {items.length > DRAFTS_SHOWN ? `All ${items.length}` : 'All drafts'}
          </NextLink>
        ) : null}
      </div>
      {!hydrated ? (
        <Skeleton className={css({ height: '10' })} />
      ) : items.length ? (
        <div>
          {items.slice(0, DRAFTS_SHOWN).map((item) => (
            <DraftRow key={`${item.kind}:${item.id}`} item={item} onDiscard={discard} />
          ))}
        </div>
      ) : (
        <p className={statLabel}>No drafts. Build a tribe or write a proposal and it saves here as you go.</p>
      )}
    </section>
  );
}

function MembershipBlock({ config, daoId }: { config: DaoNetworkConfig; daoId: string }) {
  const routeId = useOptionalDaoContext()?.routeId ?? daoId;
  const { member, isMember, isLoading, isLaunchAdmin, tokenCount, votingPower } = useDaoMembership(config);

  return (
    <section className={block} aria-label={`Your membership in ${config.tokenName}`}>
      <div className={stat}>
        <h3 className={heading}>{config.tokenName}</h3>
        {isMember ? <Chip tone="yours">Member</Chip> : isLaunchAdmin ? <Chip tone="yours">Launch admin</Chip> : null}
      </div>
      {isLoading ? (
        <Skeleton className={css({ height: '10' })} />
      ) : isMember && member ? (
        <>
          <div className={stat}>
            <span className={statLabel}>Tokens</span>
            <span className={statValue}>{tokenCount.toString()}</span>
          </div>
          <div className={stat}>
            <span className={statLabel}>Voting power</span>
            <span className={statValue}>{votingPower.toString()}</span>
          </div>
          <div className={stat}>
            <span className={statLabel}>Votes go to</span>
            <span className={statValue}>
              {!member.delegated_to || member.delegated_to === member.address ? 'You' : 'A delegate'}
            </span>
          </div>
          <NextLink
            href={daoRoute(routeId, `members/${member.address}`)}
            className={css({ textStyle: 'label', color: 'signal' })}
          >
            View your tokens and delegation
          </NextLink>
        </>
      ) : (
        <Text size="sm">You don&apos;t hold a token here yet. Win an auction or buy one on the market to vote.</Text>
      )}
    </section>
  );
}

/**
 * Everything about "you": wallet, membership in the current community,
 * places (Home, drafts), appearance and sign-out.
 */
export function YouSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  useCloseOnNavigate(() => onOpenChange(false));
  const wallet = useWalletSession();
  const openIntro = () => {
    onOpenChange(false);
    wallet.openWalletIntro();
  };
  const dao = useOptionalDaoContext();
  const preference = useThemePreference();

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="You"
      hideTitle
      footerLayout="stack"
      footer={
        <>
          <SegmentedControl
            fill
            label="Appearance"
            value={preference}
            onValueChange={(next) => {
              if (isWarmInkPreference(next)) setThemePreference(next);
            }}
            options={[
              { value: 'dark', label: 'Dark', icon: <Moon aria-hidden="true" /> },
              { value: 'light', label: 'Light', icon: <Sun aria-hidden="true" /> },
              { value: 'system', label: 'System', icon: <SunMoon aria-hidden="true" /> }
            ]}
          />
          <nav className={footerLinks} aria-label="Legal and community">
            <span>
              <NextLink href={'/privacy' as Route}>Privacy</NextLink>
            </span>
            <span>
              <NextLink href={'/terms' as Route}>Terms</NextLink>
            </span>
            <span>
              <NextLink href={'/disclaimer' as Route}>Disclaimer</NextLink>
            </span>
            <span>
              <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer">
                Discord
              </a>
            </span>
            <span>
              <BuilderDaoCredit />
            </span>
          </nav>
        </>
      }
    >
      {wallet.isAuthenticated ? (
        <section className={block} aria-label="Wallet">
          <div className={identity}>
            <Avatar address={wallet.address} size="lg" />
            <div className={css({ minW: '0', flex: '1' })}>
              <Address value={wallet.address} copyLabel="Copy address" />
            </div>
          </div>
          <div className={stat}>
            <span className={statLabel}>Balance</span>
            <span className={statValue}>
              {wallet.balanceLoading ? (
                <Skeleton className={css({ width: '20', height: '4' })} />
              ) : (
                formatXlmBalance(wallet.balance)
              )}
            </span>
          </div>
          <div className={networkRow}>
            <span className={networkStatus}>
              <span className={dot} data-issue={wallet.networkIssue ? '' : undefined} aria-hidden="true" />
              {wallet.networkIssue || `Connected on ${wallet.network.label}`}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await wallet.disconnect();
                onOpenChange(false);
              }}
            >
              <LogOut aria-hidden="true" />
              Disconnect
            </Button>
          </div>
          <div>
            <Button variant="link" size="sm" className={flushLink} onClick={openIntro}>
              How wallets work
            </Button>
          </div>
        </section>
      ) : (
        <section className={block} aria-label="Wallet">
          <p className={css({ textStyle: 'heading', m: '0' })}>Connect a wallet</p>
          <Text>
            Your wallet is how you vote, bid and hold membership. Tribes Builder never holds your funds and can&apos;t
            move them without your signature.
          </Text>
          <Button
            onClick={() => {
              // The first Connect opens the wallet intro; it shouldn't stack on this sheet.
              if (!hasSeenWalletIntro()) onOpenChange(false);
              void wallet.connect();
            }}
            loading={wallet.isAuthBusy}
            block
          >
            <Wallet aria-hidden="true" />
            {wallet.isAuthBusy ? 'Check your wallet' : 'Connect wallet'}
          </Button>
          <div className={networkStatus}>
            <span className={dot} aria-hidden="true" />
            Tribes Builder is on {wallet.network.label}
          </div>
          <div>
            <Button variant="link" size="sm" className={flushLink} onClick={openIntro}>
              How wallets work
            </Button>
          </div>
        </section>
      )}

      {dao ? <MembershipBlock config={dao.daoConfig} daoId={dao.daoId} /> : null}

      {dao ? (
        <section className={block} aria-label="Places">
          <ListRow
            href={daoRoute(dao.daoId, 'admin')}
            media={<Settings aria-hidden="true" />}
            title="Manage"
            meta="Settings, roles and setup"
          />
        </section>
      ) : null}

      <YouDrafts />
    </Sheet>
  );
}
