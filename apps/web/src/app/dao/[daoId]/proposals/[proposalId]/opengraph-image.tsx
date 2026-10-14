import { proposalCard } from '@/lib/og/cards';
import { SHARE_CARD_CONTENT_TYPE, SHARE_CARD_SIZE, shareCardOr } from '@/lib/og/share-card';

export const alt = 'A proposal on Tribe Builder: its title, status and the For, Against and Abstain votes so far.';
export const size = SHARE_CARD_SIZE;
export const contentType = SHARE_CARD_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ daoId: string; proposalId: string }> }) {
  const { daoId, proposalId } = await params;
  return shareCardOr(() => proposalCard(daoId, proposalId), { section: 'Proposal', maxAge: 300 });
}
