'use client';
import { useEffect, useState } from 'react';
import useSWR from 'swr';

import { isValidSlug } from '@/lib/create-dao-schema';

type SlugStatus = { valid: boolean; claimedBy?: string | null; pendingRequests?: number; message?: string };

/**
 * A slug is taken only once a DAO launches with it. Creating a DAO only
 * requests the slug; the first requester to launch claims it.
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
  if (data.claimedBy) return <p role="alert">/dao/{slug} is taken by another tribe. Choose a different link.</p>;
  return (
    <p role="status">
      /dao/{slug} is available. It is reserved for your tribe only when it launches. If another tribe launches with the
      same link first, the link goes to that tribe.
      {data.pendingRequests
        ? ` ${data.pendingRequests} ${data.pendingRequests === 1 ? 'tribe in setup has' : 'tribes in setup have'} asked for it too.`
        : ''}
    </p>
  );
}
