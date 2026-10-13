import type { ReactNode } from 'react';

import { DaoShell } from '@/components/shell/dao-shell';
import { DaoProvider } from '@/contexts/dao-context';
import { getDaoNetworkConfigById } from '@/lib/dao-config';
import { resolveDaoId } from '@/lib/dao-db';
import { plainSummary } from '@/lib/dao-profile';

interface DaoLayoutProps {
  children: ReactNode;
  params: Promise<{ daoId: string }>;
}

export async function generateMetadata({ params }: { params: Promise<{ daoId: string }> }) {
  const { daoId: routeId } = await params;

  try {
    const daoConfig = await getDaoNetworkConfigById(await resolveDaoId(routeId));
    return {
      title: daoConfig.tokenName || 'Community',
      // First line of the verified profile description, as plain text.
      description: plainSummary(daoConfig.profile.description) || 'A community on Builder.'
    };
  } catch {
    return {
      title: 'Community not found',
      description: "We couldn't find that community."
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
