import { brandCard, SHARE_CARD_CONTENT_TYPE, SHARE_CARD_SIZE } from '@/lib/og/share-card';

export const alt = 'Discover tribes on Tribe Builder, DAOs on Stellar.';
export const size = SHARE_CARD_SIZE;
export const contentType = SHARE_CARD_CONTENT_TYPE;

export default function Image() {
  return brandCard('Discover tribes');
}
