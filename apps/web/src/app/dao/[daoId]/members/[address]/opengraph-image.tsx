import { memberCard } from '@/lib/og/cards';
import { SHARE_CARD_CONTENT_TYPE, SHARE_CARD_SIZE, shareCardOr } from '@/lib/og/share-card';

export const alt = 'A tribe member on Tribe Builder: their tokens, ringed in brass, and their votes.';
export const size = SHARE_CARD_SIZE;
export const contentType = SHARE_CARD_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ daoId: string; address: string }> }) {
  const { daoId, address } = await params;
  return shareCardOr(() => memberCard(daoId, address), { section: 'Member', maxAge: 3600 });
}
