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
  if (data.claimedBy) return <p role="alert">/dao/{slug} is taken by another community. Pick another link.</p>;
  return (
    <p role="status">
      /dao/{slug} is available. It becomes yours when you launch; another community that launches first with the same
      link takes it.
      {data.pendingRequests
        ? ` ${data.pendingRequests} ${data.pendingRequests === 1 ? 'community in setup has' : 'communities in setup have'} asked for it too.`
        : ''}
    </p>
  );
}
