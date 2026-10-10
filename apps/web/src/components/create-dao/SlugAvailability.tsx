'use client';
import { useEffect, useState } from 'react';
import useSWR from 'swr';

import { isValidSlug } from '@/lib/create-dao-schema';

type SlugStatus = { valid: boolean; claimedBy?: string | null; pendingRequests?: number; message?: string };

/**
 * A slug is taken only once a DAO launches with it. Creating a DAO only
 * requests the slug; the first requester to launch claims it permanently.
 */
export function SlugAvailability({ slug }: { slug: string }) {
  const [debounced, setDebounced] = useState(slug);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(slug), 400);
    return () => clearTimeout(timer);
  }, [slug]);
  const { data } = useSWR<SlugStatus>(isValidSlug(debounced) ? `/api/slugs/${debounced}` : null, (url: string) =>
    fetch(url, { cache: 'no-store' }).then((response) => response.json())
  );
  if (!isValidSlug(slug) || !data || data.message) return null;
  if (data.claimedBy)
    return (
      <p role="alert">
        “{slug}” is taken: a launched DAO owns it permanently. Choose another slug (creation would fail).
      </p>
    );
  return (
    <p role="status">
      “{slug}” is available. Creating only requests it; the slug is claimed when your DAO launches, and another DAO that
      launches first with the same slug takes it.
      {data.pendingRequests
        ? ` ${data.pendingRequests} pending DAO${data.pendingRequests === 1 ? ' has' : 's have'} requested it already.`
        : ''}
    </p>
  );
}
