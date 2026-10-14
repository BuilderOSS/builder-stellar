import { tokenCard } from '@/lib/og/cards';
import { SHARE_CARD_CONTENT_TYPE, SHARE_CARD_SIZE, shareCardOr } from '@/lib/og/share-card';

export const alt = 'A membership token on Tribes Builder: its art, name and holder.';
export const size = SHARE_CARD_SIZE;
export const contentType = SHARE_CARD_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ daoId: string; tokenId: string }> }) {
  const { daoId, tokenId } = await params;
  return shareCardOr(() => tokenCard(daoId, tokenId), { section: 'Token', maxAge: 3600 });
}
