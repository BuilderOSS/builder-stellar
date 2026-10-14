import { brandCard, SHARE_CARD_CONTENT_TYPE, SHARE_CARD_SIZE } from '@/lib/og/share-card';
import { SITE_NAME } from '@/lib/site';

export const alt = `${SITE_NAME}: Build a tribe. A DAO on Stellar with a shared treasury, onchain votes and NFT membership.`;
export const size = SHARE_CARD_SIZE;
export const contentType = SHARE_CARD_CONTENT_TYPE;

export default function Image() {
  return brandCard();
}
