import { notFound } from 'next/navigation';

import { HolderTokenDetail } from '@/components/token-holder/token-detail';
import { holderTokenId } from '@/lib/member-directory/validation';

export default async function TokenPage({ params }: { params: Promise<{ daoId: string; tokenId: string }> }) {
  const { tokenId } = await params;
  let id: number;
  try {
    id = holderTokenId(tokenId);
  } catch {
    notFound();
  }
  return <HolderTokenDetail tokenId={id} />;
}
