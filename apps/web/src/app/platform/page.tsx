import type { Metadata } from 'next';

import { PlatformOverview } from '@/components/platform/platform-overview';

// Public chain data, but an operator page: linked only for the platform admin, kept out of search.
export const metadata: Metadata = { title: 'Platform', robots: { index: false, follow: false } };

/** The operator's page: shared storage, every tribe's storage, the registry and the factory. */
export default function PlatformPage() {
  return <PlatformOverview />;
}
