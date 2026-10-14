import { auctionCard } from '@/lib/og/cards';
import { SHARE_CARD_CONTENT_TYPE, SHARE_CARD_SIZE, shareCardOr } from '@/lib/og/share-card';

export const alt = 'A tribe’s auction on Tribes Builder: the token up for bid, the top bid and the time left.';
export const size = SHARE_CARD_SIZE;
export const contentType = SHARE_CARD_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ daoId: string }> }) {
  const { daoId } = await params;
  return shareCardOr(() => auctionCard(daoId), { section: 'Auction', maxAge: 60 });
}
