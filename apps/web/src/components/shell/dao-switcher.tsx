'use client';

import { Check, ChevronDown, Compass, House } from 'lucide-react';
import { useState } from 'react';
import { css } from 'styled-system/css';

import { Button, ButtonLink, Chip, Crest, EmptyState, ListRow, Sheet, Skeleton } from '@/components/ui';
import { useCloseOnNavigate } from '@/hooks/use-close-on-navigate';
import { useHomeDao } from '@/hooks/use-home-dao';
import { daoRoute } from '@/lib/dao-routes';
import { type DashboardDao, useDashboardData } from '@/lib/goldsky-queries';

import { useWalletSession } from './wallet-session';

const pill = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '2',
  minW: '0',
  maxW: '100%',
  minH: 'touch',
  pl: '1.5',
  pr: '3',
  py: '1',
  bg: 'surface',
  border: '0',
  borderRadius: 'full',
  boxShadow: 'inset 0 0 0 1px token(colors.rule)',
  color: 'ink',
  cursor: 'pointer',
  transitionProperty: 'background-color, scale',
  transitionDuration: 'press',
  transitionTimingFunction: 'out',
  _active: { scale: '0.97' },
  '@media (hover: hover) and (pointer: fine)': { _hover: { bg: 'hover' } },
  _focusVisible: { outline: '2px solid', outlineColor: 'signal', outlineOffset: '2px' }
});
const pillName = css({
  textStyle: 'body',
  fontWeight: '700',
  fontFamily: 'display',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
});
const chevron = css({ width: '4', height: '4', color: 'ink.muted', flexShrink: '0' });
const list = css({ display: 'grid', listStyle: 'none', m: '0', p: '0' });
const actions = css({ display: 'grid', gap: '2', pt: '4' });
const sectionTitle = css({ textStyle: 'label', color: 'ink.muted', mb: '1' });

function daoName(dao: Pick<DashboardDao, 'token_name' | 'token_symbol'>) {
  return dao.token_name || dao.token_symbol || 'Unnamed community';
}

/**
 * Community switcher: the current community as a pill in the top bar; tap to
 * jump to any community you belong to without leaving through Home.
 */
export function DaoSwitcher({
  current
}: {
  current: { id: string; name: string; image?: string | null; seed: string };
}) {
  const [open, setOpen] = useState(false);
  useCloseOnNavigate(() => setOpen(false));
  const wallet = useWalletSession();
  const { data, isLoading, error } = useDashboardData(wallet.isAuthenticated ? wallet.address : '');
  const { home } = useHomeDao();
  const myDaos = [...(data?.myDaos ?? [])].sort((a, b) =>
    a.dao_id === home?.id ? -1 : b.dao_id === home?.id ? 1 : daoName(a).localeCompare(daoName(b))
  );
  const currentIsMine = myDaos.some((dao) => dao.dao_id === current.id);

  return (
    <>
      <button
        type="button"
        className={pill}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`${current.name}. Switch community`}
      >
        <Crest name={current.name} seed={current.seed} src={current.image} size="sm" />
        <span className={pillName}>{current.name}</span>
        <ChevronDown aria-hidden="true" className={chevron} />
      </button>

      <Sheet open={open} onOpenChange={setOpen} title="Your communities">
        {!currentIsMine ? (
          <>
            <p className={sectionTitle}>Viewing</p>
            <ul className={list}>
              <ListRow
                as="li"
                media={<Crest name={current.name} seed={current.seed} src={current.image} />}
                title={current.name}
                trailing={<Check aria-label="Current community" />}
              />
            </ul>
          </>
        ) : null}

        {!wallet.isAuthenticated ? (
          <EmptyState
            title="Connect to see your communities"
            action={
              <Button variant="secondary" onClick={() => void wallet.connect()} loading={wallet.isAuthBusy}>
                Connect wallet
              </Button>
            }
          >
            Communities where you hold a token show up here.
          </EmptyState>
        ) : isLoading ? (
          <div className={css({ display: 'grid', gap: '3', py: '3' })}>
            <Skeleton className={css({ height: '12' })} />
            <Skeleton className={css({ height: '12' })} />
          </div>
        ) : error ? (
          <EmptyState title="Couldn't load your communities">Try again in a moment.</EmptyState>
        ) : myDaos.length === 0 ? (
          <EmptyState title="No memberships yet">Win an auction or buy a token to join a community.</EmptyState>
        ) : (
          <>
            {!currentIsMine ? <p className={sectionTitle}>Yours</p> : null}
            <ul className={list}>
              {myDaos.map((dao) => {
                const isCurrent = dao.dao_id === current.id;
                return (
                  <ListRow
                    key={dao.dao_id}
                    as="li"
                    href={daoRoute(dao.dao_id)}
                    media={<Crest name={daoName(dao)} seed={dao.dao_id} src={dao.contract_image} />}
                    title={daoName(dao)}
                    meta={dao.status === 'pending' ? 'In setup' : dao.token_symbol || undefined}
                    trailing={
                      isCurrent ? (
                        <Check aria-label="Current community" />
                      ) : dao.dao_id === home?.id ? (
                        <Chip tone="yours">Home</Chip>
                      ) : undefined
                    }
                  />
                );
              })}
            </ul>
          </>
        )}

        <div className={actions}>
          <ButtonLink href="/" variant="secondary" block>
            <House aria-hidden="true" />
            All communities
          </ButtonLink>
          <ButtonLink href="/discover" variant="ghost" block>
            <Compass aria-hidden="true" />
            Find more communities
          </ButtonLink>
        </div>
      </Sheet>
    </>
  );
}
