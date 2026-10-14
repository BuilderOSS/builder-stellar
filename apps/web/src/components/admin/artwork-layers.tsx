'use client';

import { Client as MetadataClient } from '@builder-stellar/metadata-bindings';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { css } from 'styled-system/css';
import useSWR from 'swr';

import {
  Address,
  Callout,
  Card,
  Disclosure,
  FallbackImage,
  Field,
  FieldLabel,
  Heading,
  IconButton,
  Pagination,
  Select,
  Skeleton,
  Text
} from '@/components/ui';
import { adminReadOptions } from '@/lib/admin-surfaces';
import { layerUrl } from '@/lib/chain-reads/token-layers';
import type { DaoNetworkConfig } from '@/lib/dao-config';

const PAGE = 24;

const head = css({ display: 'flex', flexWrap: 'wrap', alignItems: 'end', justifyContent: 'space-between', gap: '3' });
const controls = css({ display: 'flex', alignItems: 'flex-end', gap: '2' });
const grid = css({
  display: 'grid',
  gap: '3',
  gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 96px), 1fr))',
  listStyle: 'none',
  m: '0',
  p: '0'
});
const item = css({ display: 'grid', gap: '1.5', minW: '0', m: '0' });
const thumb = css({
  aspectRatio: '1',
  width: '100%',
  borderRadius: 'control',
  bg: 'hover',
  objectFit: 'cover',
  outline: '1px solid',
  outlineColor: 'imageEdge',
  outlineOffset: '-1px'
});
const caption = css({
  textStyle: 'caption',
  color: 'ink.muted',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
});
const technical = css({ display: 'grid', gap: '2', '& p': { m: '0', overflowWrap: 'anywhere' } });

type Layer = { id: number; name: string; count: number };

/** Folder names carry their stacking order ("0-backgrounds"); the list order already shows it. */
export function layerLabel(name: string) {
  return name.replace(/^\d+[-_.\s]+/, '') || name;
}

/** Every layer's items as thumbnails, a page at a time, read straight from the artwork contract. */
export function ArtworkLayers({
  config,
  address,
  layers,
  groupCount,
  refreshing,
  onRefresh
}: {
  config: DaoNetworkConfig;
  address: string | null;
  layers: Layer[];
  groupCount: number;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const [picked, setPicked] = useState(0);
  const [page, setPage] = useState(0);
  const layer = layers[Math.min(picked, layers.length - 1)];
  const items = useSWR(
    layer ? ['artwork-layer-page', config.metadataContractId, config.rpcUrl, address, layer.id, page] : null,
    async () => {
      const client = new MetadataClient(adminReadOptions(config, config.metadataContractId, address));
      const rows = (
        await client.get_items({ property_id: layer!.id, start: page * PAGE, limit: PAGE })
      ).result.unwrap();
      // Items on one page almost always share one upload; read each IPFS group once.
      const slots = [...new Set(rows.map((row) => row.reference_slot))];
      const groups = new Map(
        await Promise.all(
          slots.map(async (slot) => [slot, (await client.get_ipfs_group({ index: slot })).result] as const)
        )
      );
      return rows.map((row) => {
        const group = groups.get(row.reference_slot);
        return { name: row.name, url: group ? layerUrl(group.base_uri, layer!.name, row.name, group.extension) : null };
      });
    }
  );

  return (
    <Card p="5">
      <div className={css({ display: 'grid', gap: '4', minW: '0' })}>
        <div className={head}>
          <div>
            <Heading size="heading">Layers</Heading>
            <Text color="ink.muted">
              {layers.length
                ? `${layers.length} ${layers.length === 1 ? 'layer' : 'layers'}. Each token takes one item from every layer.`
                : 'No artwork yet.'}
            </Text>
          </div>
          <div className={controls}>
            {layers.length ? (
              <Field className={css({ minW: '48' })}>
                <FieldLabel htmlFor="artwork-layer">Layer</FieldLabel>
                <Select
                  id="artwork-layer"
                  value={layer?.id ?? 0}
                  onChange={(event) => {
                    setPicked(Number(event.target.value));
                    setPage(0);
                  }}
                >
                  {layers.map((option) => (
                    <option key={option.id} value={option.id}>
                      {layerLabel(option.name)} ({option.count.toLocaleString()})
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <IconButton label="Refresh the artwork" disabled={refreshing} onClick={onRefresh}>
              <RefreshCw aria-hidden="true" />
            </IconButton>
          </div>
        </div>

        {items.error ? (
          <Callout variant="error" title="These items didn't load" description={items.error.message} />
        ) : null}
        {layer ? (
          <ul className={grid} aria-label={`${layerLabel(layer.name)} items`} aria-busy={items.isLoading}>
            {items.isLoading
              ? Array.from({ length: Math.min(PAGE, layer.count) }, (_, index) => (
                  <li key={index} className={item}>
                    <Skeleton className={thumb} />
                    <Skeleton className={css({ height: '3', width: '70%' })} />
                  </li>
                ))
              : items.data?.map((entry, index) => (
                  <li key={`${page}:${index}`} className={item}>
                    {entry.url ? (
                      <FallbackImage src={entry.url} alt="" errorFallbackSrc="" className={thumb} loading="lazy" />
                    ) : (
                      <div className={thumb} aria-hidden="true" />
                    )}
                    <span className={caption} title={entry.name}>
                      {entry.name}
                    </span>
                  </li>
                ))}
          </ul>
        ) : null}
        {layer ? (
          <Pagination
            label={`${layerLabel(layer.name)} pages`}
            page={page + 1}
            hasPrevious={page > 0}
            hasNext={(page + 1) * PAGE < layer.count}
            onPrevious={() => setPage(page - 1)}
            onNext={() => setPage(page + 1)}
            disabled={items.isLoading}
          />
        ) : null}

        <Disclosure>
          <TechnicalDetails config={config} address={address} groupCount={groupCount} />
        </Disclosure>
      </div>
    </Card>
  );
}

/** The contract and every IPFS upload the layers point at: mounted only when opened. */
function TechnicalDetails({
  config,
  address,
  groupCount
}: {
  config: DaoNetworkConfig;
  address: string | null;
  groupCount: number;
}) {
  const groups = useSWR(['artwork-ipfs-groups', config.metadataContractId, config.rpcUrl, groupCount], async () => {
    const client = new MetadataClient(adminReadOptions(config, config.metadataContractId, address));
    return Promise.all(
      Array.from({ length: groupCount }, async (_, index) => (await client.get_ipfs_group({ index })).result)
    );
  });
  return (
    <div className={technical}>
      <Address value={config.metadataContractId} label="Artwork contract" />
      <Text color="ink.muted">
        {groupCount} IPFS {groupCount === 1 ? 'upload' : 'uploads'}. A layer image is the upload address, then the layer
        and item names, then the file extension.
      </Text>
      {groups.data?.map((group, index) =>
        group ? (
          <Text key={index} textStyle="mono" fontSize="0.75rem">
            {index}: {group.base_uri} · {group.extension}
          </Text>
        ) : null
      )}
      {groups.error ? <Text color="ink.muted">The upload list didn&apos;t load.</Text> : null}
    </div>
  );
}
