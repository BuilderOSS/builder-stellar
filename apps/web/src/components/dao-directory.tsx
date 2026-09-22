'use client';

import { ArrowUpRight, Search } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Badge, Card, Heading, Input, Text } from '@/components/ui';
import type { DaoConfig } from '@/lib/dao-db';
import { daoRoute } from '@/lib/dao-routes';

function shortenAddress(value: string) {
  if (value.length <= 18) return value;
  return `${value.slice(0, 7)}…${value.slice(-7)}`;
}

function formatCreatedDate(value: string | null) {
  if (!value) return 'Creation date unavailable';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Creation date unavailable';

  return `Created ${date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;
}

function networkLabel(network: DaoConfig['network']) {
  if (network === 'public') return 'Mainnet';
  if (network === 'local') return 'Local';
  return 'Testnet';
}

function daoName(dao: DaoConfig) {
  return dao.token_name || dao.label || 'Unnamed DAO';
}

export function DaoDirectory({ daos }: { daos: DaoConfig[] }) {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const filteredDaos = daos.filter((dao) => {
    if (!normalizedQuery) return true;

    return [daoName(dao), dao.token_symbol, dao.label, dao.dao_id, dao.token_address].some((value) =>
      value?.toLowerCase().includes(normalizedQuery)
    );
  });

  return (
    <section className="discovery-directory" aria-labelledby="dao-directory-title">
      <div className="discovery-toolbar">
        <label className="discovery-search">
          <span className="sr-only">Search DAOs</span>
          <Search aria-hidden="true" size={18} />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Search by name, symbol, or contract"
            aria-label="Search DAOs by name, symbol, or contract"
          />
        </label>
        <Text className="discovery-results" role="status" aria-live="polite">
          {filteredDaos.length} {filteredDaos.length === 1 ? 'DAO' : 'DAOs'}
        </Text>
      </div>

      <div className="discovery-directory__heading">
        <div>
          <p className="eyebrow" id="dao-directory-title">
            Available communities
          </p>
          <Heading style={{ fontSize: '1.35rem', margin: '6px 0 0' }}>Choose a DAO to explore</Heading>
        </div>
        <Text className="lede discovery-directory__hint">Every card opens the full governance dashboard.</Text>
      </div>

      {filteredDaos.length ? (
        <div className="discovery-grid">
          {filteredDaos.map((dao) => (
            <Link key={dao.dao_id} href={daoRoute(dao.dao_id)} className="discovery-card-link">
              <Card className="interactive-card discovery-card" p="5">
                <div className="discovery-card__topline">
                  <div className="discovery-card__identity">
                    <Text className="label">{dao.token_symbol || 'DAO'}</Text>
                    <Heading className="discovery-card__title">{daoName(dao)}</Heading>
                  </div>
                  <ArrowUpRight aria-hidden="true" className="discovery-card__arrow" size={18} />
                </div>

                <Text className="discovery-card__description">
                  {dao.token_description ||
                    'A Stellar community with onchain governance, membership, and treasury activity.'}
                </Text>

                <div className="discovery-card__badges">
                  <Badge>{dao.status === 'operational' ? 'Operational' : 'Pending'}</Badge>
                  <Badge>{networkLabel(dao.network)}</Badge>
                </div>

                <div className="discovery-card__footer">
                  <div>
                    <Text className="label">Token contract</Text>
                    <Text className="mono discovery-card__address" title={dao.token_address}>
                      {shortenAddress(dao.token_address)}
                    </Text>
                  </div>
                  <Text className="discovery-card__date">{formatCreatedDate(dao.created_at)}</Text>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty-state discovery-empty-state" role="status">
          <p className="eyebrow">No matches</p>
          <Heading style={{ fontSize: '1.25rem', margin: '8px 0' }}>No DAO fits that search</Heading>
          <Text className="lede">Try a different name, symbol, or contract address.</Text>
        </div>
      )}
    </section>
  );
}
