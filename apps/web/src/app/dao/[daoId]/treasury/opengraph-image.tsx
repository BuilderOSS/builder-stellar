import { tribeCard } from '@/lib/og/cards';
import { SHARE_CARD_CONTENT_TYPE, SHARE_CARD_SIZE, shareCardOr } from '@/lib/og/share-card';

export const alt = 'Treasury of a tribe on Tribe Builder: its art, name and member count.';
export const size = SHARE_CARD_SIZE;
export const contentType = SHARE_CARD_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ daoId: string }> }) {
  const { daoId } = await params;
  return shareCardOr(() => tribeCard(daoId, 'Treasury'), { maxAge: 3600 });
}
