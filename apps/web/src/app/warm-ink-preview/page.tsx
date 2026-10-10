import { notFound } from 'next/navigation';

import { WarmInkPreview } from '@/components/warm-ink-preview';
import { WarmInkShellPreview } from '@/components/warm-ink-shell-preview';

export default async function WarmInkPreviewPage({ searchParams }: { searchParams: Promise<{ shell?: string }> }) {
  if (process.env.NODE_ENV !== 'development') notFound();
  if ((await searchParams).shell === 'dao') return <WarmInkShellPreview />;
  return <WarmInkPreview />;
}
