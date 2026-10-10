import { notFound } from 'next/navigation';

import { DesignCatalogue } from '@/components/design-catalogue';

export const metadata = { title: 'Design system' };

// Dev-only visual catalogue of every primitive in both themes.
export default function DesignPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <DesignCatalogue />;
}
