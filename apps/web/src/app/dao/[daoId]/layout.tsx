import type { ReactNode } from 'react';

import { DaoShell } from '@/components/shell/dao-shell';
import { DaoProvider } from '@/contexts/dao-context';
import { getDaoNetworkConfigById } from '@/lib/dao-config';
import { resolveDaoId } from '@/lib/dao-db';
import { plainSummary } from '@/lib/dao-profile';
import { SITE_NAME } from '@/lib/site';

interface DaoLayoutProps {
  children: ReactNode;
  params: Promise<{ daoId: string }>;
}

export async function generateMetadata({ params }: { params: Promise<{ daoId: string }> }) {
  const { daoId: routeId } = await params;

  try {
    const daoConfig = await getDaoNetworkConfigById(await resolveDaoId(routeId));
    const title = daoConfig.tokenName || 'Tribe';
    // First line of the verified profile description, as plain text.
    const description = plainSummary(daoConfig.profile.description) || 'A tribe on Tribes Builder.';
    return {
      title,
      description,
      // Share previews show the tribe, not the site name; the image comes from opengraph-image.tsx.
      openGraph: { title, description, siteName: SITE_NAME, type: 'website' }
    };
  } catch {
    return {
      title: 'Tribe not found',
      description: "We couldn't find that tribe."
    };
  }
}

export default async function DaoLayout({ children, params }: DaoLayoutProps) {
  // The route segment is a token contract id or a slug; everything below uses the canonical id.
  const daoId = await resolveDaoId((await params).daoId);

  // Load DAO configuration from database
  const daoConfig = await getDaoNetworkConfigById(daoId);

  return (
    <DaoProvider daoId={daoId} daoConfig={daoConfig}>
      <DaoShell>{children}</DaoShell>
    </DaoProvider>
  );
}
