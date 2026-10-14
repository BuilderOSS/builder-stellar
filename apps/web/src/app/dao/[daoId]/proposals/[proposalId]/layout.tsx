import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { proposalCard } from '@/lib/og/cards';
import { SITE_NAME } from '@/lib/site';

/** A shared proposal link previews with its title; the page itself renders on the client. */
export async function generateMetadata({
  params
}: {
  params: Promise<{ daoId: string; proposalId: string }>;
}): Promise<Metadata> {
  const { daoId, proposalId } = await params;
  try {
    const card = await proposalCard(daoId, proposalId);
    const status = card.chips?.[0]?.label;
    const description = status ? `${card.subtitle}. ${status}.` : card.subtitle;
    return {
      title: card.title,
      description,
      openGraph: { title: card.title, description, siteName: SITE_NAME, type: 'article' }
    };
  } catch {
    return {};
  }
}

export default function ProposalLayout({ children }: { children: ReactNode }) {
  return children;
}
