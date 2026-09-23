'use client';

import Image from 'next/image';
import Link from 'next/link';

import { Card, Heading, Skeleton, Text } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { getDaoAccountRole } from '@/lib/account-role';
import { daoRoute } from '@/lib/dao-routes';
import { useTokenMetadata } from '@/lib/token-queries';

export function TokenCard({ tokenId, owner }: { tokenId: number; owner: string }) {
  const { daoId, daoConfig } = useDaoContext();
  const { data, error, isLoading } = useTokenMetadata(daoId, tokenId);
  const role = getDaoAccountRole(daoConfig, owner);

  return (
    <Card p="3" className="membership-token-card" style={{ overflow: 'hidden', minWidth: 0 }}>
      {isLoading ? (
        <div role="status" aria-busy="true">
          <span className="sr-only">Loading token</span>
          <Skeleton style={{ width: '100%', aspectRatio: '1', borderRadius: '10px' }} />
          <Skeleton style={{ width: '70%', height: '1.1em', marginTop: '12px' }} />
          <Skeleton style={{ width: '86%', height: '0.8em', marginTop: '10px' }} />
        </div>
      ) : error ? (
        <Text className="lede" style={{ margin: 0 }}>
          {error.message}
        </Text>
      ) : data ? (
        <div className="membership-token-card__content">
          <Link href={daoRoute(daoId, `token/${tokenId}`)} style={{ color: 'inherit', textDecoration: 'none' }}>
            <div style={{ display: 'grid', gap: '12px' }}>
              <Image
                src={data.image}
                alt={data.name}
                width={216}
                height={216}
                unoptimized
                style={{
                  width: '100%',
                  height: 'auto',
                  borderRadius: '10px',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border-default)'
                }}
              />
              <div>
                <Heading style={{ fontSize: '1.1rem', margin: 0 }}>{data.name}</Heading>
              </div>
            </div>
          </Link>
          <div className="membership-token-card__owner">
            <Text className="label" style={{ margin: 0 }}>
              {role ? `Owner · ${role}` : 'Owner'}
            </Text>
            <Link
              className="membership-token-card__owner-link mono"
              href={daoRoute(daoId, `members/${owner}`)}
              title={`View ${owner}'s profile`}
            >
              {owner.slice(0, 6)}…{owner.slice(-6)}
            </Link>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
