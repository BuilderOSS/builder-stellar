import type { ReactNode } from 'react';
import { getDaoNetworkConfigById } from '@/lib/dao-config';
import { DaoProvider } from '@/contexts/dao-context';
import { DaoShell } from '@/components/dao-shell';

interface DaoLayoutProps {
  children: ReactNode;
  params: Promise<{ daoId: string }>;
}

export async function generateMetadata({ params }: { params: Promise<{ daoId: string }> }) {
  const { daoId } = await params;

  try {
    const daoConfig = await getDaoNetworkConfigById(daoId);
    return {
      title: daoConfig.tokenName || 'DAO',
      description: daoConfig.tokenDescription || 'Decentralized Autonomous Organization'
    };
  } catch {
    return {
      title: 'DAO Not Found',
      description: 'The requested DAO could not be found'
    };
  }
}

export default async function DaoLayout({ children, params }: DaoLayoutProps) {
  const { daoId } = await params;

  // Load DAO configuration from database
  const daoConfig = await getDaoNetworkConfigById(daoId);

  return (
    <DaoProvider daoId={daoId} daoConfig={daoConfig}>
      <DaoShell>{children}</DaoShell>
    </DaoProvider>
  );
}
