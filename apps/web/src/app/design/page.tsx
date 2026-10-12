import type { Metadata } from 'next';

import { DesignCatalogue } from '@/components/design-catalogue';

// Shareable but unlisted: no nav link, and kept out of search results.
export const metadata: Metadata = { title: 'Design system', robots: { index: false, follow: false } };

/** Visual catalogue of every primitive, brand asset and token, in both themes. */
export default function DesignPage() {
  return <DesignCatalogue />;
}
