'use client';

import { FileText, Home, LogOut, Moon, Settings, Sun, SunMoon, Wallet } from 'lucide-react';
import type { Route } from 'next';
import NextLink from 'next/link';
import { css } from 'styled-system/css';

import { Address, Avatar, Button, Chip, ListRow, SegmentedControl, Sheet, Skeleton, Text } from '@/components/ui';
import { setThemePreference, useThemePreference } from '@/components/warm-ink-theme';
import { useOptionalDaoContext } from '@/contexts/dao-context';
import { useCloseOnNavigate } from '@/hooks/use-close-on-navigate';
import { useDaoMembership } from '@/hooks/use-dao-membership';
import { useHomeDao } from '@/hooks/use-home-dao';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { daoRoute } from '@/lib/dao-routes';
import { isWarmInkPreference } from '@/lib/warm-ink-theme';

import { BuilderDaoCredit } from './brand-mark';
import { formatXlmBalance, useWalletSession } from './wallet-session';

const block = css({ display: 'grid', gap: '3', py: '4', borderBottomWidth: '1px', borderColor: 'rule' });
const identity = css({ display: 'flex', alignItems: 'center', gap: '3' });
const stat = css({ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '3' });
const statLabel = css({ textStyle: 'caption', color: 'ink.muted' });
const statValue = css({ textStyle: 'body', fontWeight: '600', fontVariantNumeric: 'tabular-nums' });
const heading = css({ textStyle: 'label', color: 'ink.muted', m: '0' });
const dot = css({
  width: '2',
  height: '2',
  borderRadius: 'full',
  bg: 'success',
  '&[data-issue]': { bg: 'warning' }
});
const networkRow = css({ display: 'flex', alignItems: 'center', gap: '2', textStyle: 'caption', color: 'ink.muted' });
const footerLinks = css({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '4',
  pt: '4',
  textStyle: 'caption',
  color: 'ink.muted',
  '& a': { color: 'inherit', textDecoration: 'none', _hover: { color: 'ink' } }
});

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
  const dao = useOptionalDaoContext();
  const preference = useThemePreference();
  const { home, setHome } = useHomeDao();
  const isHome = Boolean(dao && home?.id === dao.daoId);

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="You" hideTitle>
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
            <span className={dot} data-issue={wallet.networkIssue ? '' : undefined} aria-hidden="true" />
            {wallet.networkIssue || `Connected on ${wallet.network.label}`}
          </div>
        </section>
      ) : (
        <section className={block} aria-label="Wallet">
          <p className={css({ textStyle: 'heading', m: '0' })}>Connect a wallet</p>
          <Text>
            Your wallet is how you vote, bid and hold membership. Builder never holds your funds and can&apos;t move
            them without your signature.
          </Text>
          <Button onClick={() => void wallet.connect()} loading={wallet.isAuthBusy} block>
            <Wallet aria-hidden="true" />
            {wallet.isAuthBusy ? 'Check your wallet' : 'Connect wallet'}
          </Button>
          <div className={networkRow}>
            <span className={dot} aria-hidden="true" />
            Builder is on {wallet.network.label}
          </div>
        </section>
      )}

      {dao ? <MembershipBlock config={dao.daoConfig} daoId={dao.daoId} /> : null}

      <section className={block} aria-label="Places">
        {dao ? (
          <ListRow
            media={<Home aria-hidden="true" />}
            title={isHome ? 'Your home community' : 'Make this your home community'}
            meta="Opens first on this browser"
            trailing={
              <Button
                variant="secondary"
                size="sm"
                aria-pressed={isHome}
                onClick={() => setHome(isHome ? null : { id: dao.daoId, name: dao.daoConfig.tokenName })}
              >
                {isHome ? 'Remove' : 'Set home'}
              </Button>
            }
          />
        ) : home ? (
          <ListRow
            href={daoRoute(home.id)}
            media={<Home aria-hidden="true" />}
            title={home.name}
            meta="Home community"
          />
        ) : null}
        <ListRow
          href="/drafts"
          media={<FileText aria-hidden="true" />}
          title="Drafts"
          meta="Communities you started on this browser"
        />
        {dao ? (
          <ListRow
            href={daoRoute(dao.daoId, 'admin')}
            media={<Settings aria-hidden="true" />}
            title="Manage"
            meta="Settings, roles and setup"
          />
        ) : null}
      </section>

      <section className={block} aria-label="Appearance">
        <h3 className={heading}>Appearance</h3>
        <SegmentedControl
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
      </section>

      {wallet.isAuthenticated ? (
        <div className={css({ pt: '4' })}>
          <Button
            variant="ghost"
            onClick={async () => {
              await wallet.disconnect();
              onOpenChange(false);
            }}
          >
            <LogOut aria-hidden="true" />
            Disconnect
          </Button>
        </div>
      ) : null}

      <nav className={footerLinks} aria-label="Legal">
        <NextLink href={'/privacy' as Route}>Privacy</NextLink>
        <NextLink href={'/terms' as Route}>Terms</NextLink>
        <NextLink href={'/disclaimer' as Route}>Disclaimer</NextLink>
        <BuilderDaoCredit />
      </nav>
    </Sheet>
  );
}
