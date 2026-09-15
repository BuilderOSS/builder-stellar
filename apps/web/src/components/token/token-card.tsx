'use client';

import Image from 'next/image';
import Link from 'next/link';

import { Card, Heading, ShortId, Text } from '@/components/ui';
import { getDaoAccountRole } from '@/lib/account-role';
import { getDaoNetworkConfig, getDefaultDaoNetwork } from '@/lib/dao-config';
import { useTokenMetadata } from '@/lib/token-queries';

export function TokenCard({ tokenId, owner }: { tokenId: number; owner: string }) {
  const { data, error, isLoading } = useTokenMetadata(tokenId);
  const role = getDaoAccountRole(getDaoNetworkConfig(getDefaultDaoNetwork()), owner);

  return (
    <Card p="4">
      {isLoading ? (
        <Text className="lede" style={{ margin: 0 }}>
          Loading token...
        </Text>
      ) : error ? (
        <Text className="lede" style={{ margin: 0 }}>
          {error.message}
        </Text>
      ) : data ? (
        <div style={{ display: 'grid', gap: '10px' }}>
          <Link href={`/token/${tokenId}`} style={{ color: 'inherit', textDecoration: 'none' }}>
            <div style={{ display: 'grid', gap: '10px' }}>
              <Image
                src={data.image}
                alt={data.name}
                width={216}
                height={216}
                unoptimized
                style={{ width: '100%', height: 'auto', borderRadius: '16px' }}
              />
              <div>
                <Text className="label" style={{ marginBottom: '4px' }}>
                  Token #{tokenId}
                </Text>
                <Heading style={{ fontSize: '1.1rem', margin: 0 }}>{data.name}</Heading>
              </div>
            </div>
          </Link>
          <Text
            className="lede"
            style={{
              display: '-webkit-box',
              fontSize: '0.86rem',
              margin: 0,
              overflow: 'hidden',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: 2
            }}
          >
            {data.description}
          </Text>
          <div style={{ display: 'grid', gap: '6px' }}>
            <Text className="lede" style={{ margin: 0, fontSize: '0.84rem' }}>
              Symbol: {data.attributes.find((attribute) => attribute.trait_type === 'Token Symbol')?.value ?? '—'}
            </Text>
            <ShortId value={owner} label={role ? `Owner · ${role}` : 'Owner'} />
          </div>
        </div>
      ) : null}
    </Card>
  );
}
