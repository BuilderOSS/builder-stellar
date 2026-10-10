'use client';

import Image from 'next/image';
import NextLink from 'next/link';
import { css, sva } from 'styled-system/css';

import { Avatar, Chip, Skeleton } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { getDaoAccountRole } from '@/lib/account-role';
import { daoRoute } from '@/lib/dao-routes';
import { useTokenMetadata } from '@/lib/token-queries';
import { useAuthSessionStore } from '@/stores/auth-session-store';

const card = sva({
  slots: ['root', 'art', 'body', 'name', 'owner'],
  base: {
    root: {
      display: 'grid',
      gap: '2.5',
      minW: '0',
      color: 'ink',
      textDecoration: 'none',
      borderRadius: 'card',
      _focusVisible: { outline: '2px solid', outlineColor: 'signal', outlineOffset: '3px' },
      '@media (hover: hover) and (pointer: fine)': { '&:hover img': { scale: '1.02' } }
    },
    art: {
      position: 'relative',
      aspectRatio: '1',
      overflow: 'hidden',
      borderRadius: 'card',
      bg: 'hover',
      outline: '1px solid',
      outlineColor: 'imageEdge',
      outlineOffset: '-1px',
      '& img': {
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        transitionProperty: 'scale',
        transitionDuration: '240ms',
        transitionTimingFunction: 'out'
      }
    },
    body: { display: 'grid', gap: '1', minW: '0' },
    name: {
      textStyle: 'subheading',
      fontSize: '0.9375rem',
      m: '0',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    },
    owner: { display: 'flex', alignItems: 'center', gap: '1.5', textStyle: 'caption', color: 'ink.muted', minW: '0' }
  }
});

const ownerText = css({ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });

/** A membership token: its art first, then name and who holds it. */
export function TokenCard({ tokenId, owner }: { tokenId: number; owner: string }) {
  const { daoId, daoConfig } = useDaoContext();
  const viewer = useAuthSessionStore((state) => state.address);
  const { data, error, isLoading } = useTokenMetadata(daoId, tokenId);
  const role = getDaoAccountRole(daoConfig, owner);
  const yours = Boolean(viewer && viewer === owner);
  const classes = card();

  if (isLoading) {
    return (
      <div className={classes.root} role="status" aria-busy="true">
        <span className="sr-only">Loading token #{tokenId}</span>
        <Skeleton className={css({ aspectRatio: '1', borderRadius: 'card' })} />
        <Skeleton className={css({ width: '70%', height: '4' })} />
      </div>
    );
  }

  return (
    <NextLink href={daoRoute(daoId, `token/${tokenId}`)} className={classes.root}>
      <div className={classes.art}>
        {data && !error ? <Image src={data.image} alt="" width={240} height={240} unoptimized /> : null}
      </div>
      <div className={classes.body}>
        <p className={classes.name}>{data?.name ?? `#${tokenId}`}</p>
        <span className={classes.owner}>
          {yours ? (
            <Chip tone="yours">Yours</Chip>
          ) : (
            <>
              <Avatar address={owner} size="xs" />
              <span className={ownerText}>{role ?? `${owner.slice(0, 4)}…${owner.slice(-4)}`}</span>
            </>
          )}
        </span>
      </div>
    </NextLink>
  );
}
