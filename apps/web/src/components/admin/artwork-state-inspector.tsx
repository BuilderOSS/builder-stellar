'use client';

import { Client as MetadataClient } from '@builder-stellar/metadata-bindings';
import { useState } from 'react';
import { css } from 'styled-system/css';
import { Stack } from 'styled-system/jsx';
import useSWR from 'swr';

import { Button, Callout, Card, Heading, Input, Text } from '@/components/ui';
import { adminReadOptions } from '@/lib/admin-surfaces';
import type { DaoNetworkConfig } from '@/lib/dao-config';

export function ArtworkStateInspector({
  config,
  address,
  propertyCount,
  groupCount
}: {
  config: DaoNetworkConfig;
  address: string | null;
  propertyCount: number;
  groupCount: number;
}) {
  const [property, setProperty] = useState(0);
  const [page, setPage] = useState(0);
  const [group, setGroup] = useState(0);
  const selected = Math.min(property, Math.max(0, propertyCount - 1));
  const selectedGroup = Math.min(group, Math.max(0, groupCount - 1));
  const data = useSWR(
    [
      'artwork-page',
      config.metadataContractId,
      config.rpcUrl,
      config.passphrase,
      address,
      selected,
      selectedGroup,
      page,
      propertyCount,
      groupCount
    ],
    async () => {
      const client = new MetadataClient(adminReadOptions(config, config.metadataContractId, address));
      const [items, count, ipfs] = await Promise.all([
        propertyCount
          ? client.get_items({ property_id: selected, start: page * 50, limit: 50 })
          : Promise.resolve(null),
        propertyCount ? client.items_count({ property_id: selected }) : Promise.resolve(null),
        groupCount ? client.get_ipfs_group({ index: selectedGroup }) : Promise.resolve(null)
      ]);
      return { items: items?.result.unwrap() ?? [], count: count?.result ?? 0, ipfs: ipfs?.result };
    }
  );
  return (
    <Card p="5">
      <Stack gap="3" className={css({ minWidth: '0', overflowWrap: 'anywhere' })}>
        <Heading size="heading">On-chain properties and IPFS references</Heading>
        <Text>
          {propertyCount} properties · {groupCount} IPFS groups
        </Text>
        {propertyCount ? (
          <label>
            Property ID{' '}
            <select
              name="artwork-property"
              autoComplete="off"
              className={css({ color: 'ink', bg: 'raised', minHeight: '44px' })}
              value={selected}
              onChange={(event) => {
                setProperty(Number(event.target.value));
                setPage(0);
              }}
            >
              {Array.from({ length: propertyCount }, (_, id) => (
                <option key={id} value={id}>
                  Property {id}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <Text>No artwork properties are configured yet.</Text>
        )}
        {data.isLoading ? <Text role="status">Loading artwork page…</Text> : null}
        {data.error ? (
          <Callout variant="error" title="Artwork page unavailable" description={data.error.message} />
        ) : null}
        <ol start={page * 50 + 1}>
          {data.data?.items.map((item, index) => (
            <li key={page * 50 + index}>
              Item ID {page * 50 + index}: {item.name} · IPFS group {item.reference_slot}
            </li>
          ))}
        </ol>
        {propertyCount ? (
          <div className={css({ display: 'flex', gap: '3', flexWrap: 'wrap' })}>
            <Button
              type="button"
              variant="outline"
              disabled={!page || data.isLoading}
              onClick={() => setPage((current) => current - 1)}
            >
              Previous items
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={data.isLoading || (page + 1) * 50 >= (data.data?.count ?? 0)}
              onClick={() => setPage((current) => current + 1)}
            >
              Next 50 items
            </Button>
          </div>
        ) : null}
        {groupCount ? (
          <>
            <label>
              IPFS group ID{' '}
              <Input
                name="artwork-ipfs-group"
                autoComplete="off"
                type="number"
                min={0}
                max={groupCount - 1}
                step={1}
                value={selectedGroup}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (Number.isInteger(next) && next >= 0 && next < groupCount) setGroup(next);
                }}
              />
            </label>
            <Text overflowWrap="anywhere">
              {data.data?.ipfs ? `${data.data.ipfs.base_uri} · ${data.data.ipfs.extension}` : 'No IPFS group found.'}
            </Text>
          </>
        ) : null}
      </Stack>
    </Card>
  );
}
