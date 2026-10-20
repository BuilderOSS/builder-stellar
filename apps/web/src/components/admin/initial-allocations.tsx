'use client';

import { useState } from 'react';
import useSWR from 'swr';

import { Address, Callout, HelpTip, ListRow, Pagination, Section, Skeleton } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { directoryFetch, directoryKey } from '@/lib/member-directory/hooks';

type Allocations = { items: { address: string; amount: string }[]; total: number; hasMore: boolean };

export function InitialAllocations() {
  const { daoId } = useDaoContext();
  const [page, setPage] = useState(0);
  const { data, error, isLoading } = useSWR(directoryKey(daoId, 'initial-allocations', page), () =>
    directoryFetch<Allocations>(
      `/api/dao/${encodeURIComponent(daoId)}/initial-allocations?limit=25&offset=${page * 25}`
    )
  );
  return (
    <Section
      title={
        <>
          Initial allocations{' '}
          <HelpTip label="Initial allocations">
            Tokens minted before launch, including founder mints and any launch-drive claims. These are original
            recipients; later transfers do not change this history.
          </HelpTip>
        </>
      }
    >
      {isLoading ? <Skeleton /> : null}
      {error ? (
        <Callout variant="warning" title="Initial allocations did not load" description={error.message} />
      ) : null}
      {data && !error ? (
        <>
          {data.items.length ? (
            data.items.map((item) => (
              <ListRow
                key={item.address}
                title={<Address value={item.address} compact />}
                trailing={`${item.amount} ${item.amount === '1' ? 'token' : 'tokens'}`}
              />
            ))
          ) : (
            <p>No pre-launch token allocations are indexed.</p>
          )}
          <Pagination
            label="Initial allocation pages"
            page={page + 1}
            hasPrevious={page > 0}
            hasNext={data.hasMore}
            onPrevious={() => setPage(page - 1)}
            onNext={() => setPage(page + 1)}
          />
        </>
      ) : null}
    </Section>
  );
}
