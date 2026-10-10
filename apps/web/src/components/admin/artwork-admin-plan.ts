import { artworkBatches, type ArtworkPlan } from '@/components/create-dao/artwork-configuration';
import type { ArtworkPropertiesDraft } from '@/lib/proposal-actions/artwork-admin-actions';

/** First-call IDs are relative for new properties; later-call IDs are absolute. */
export function artworkAppendPlan(plan: ArtworkPlan, existingCount: number): ArtworkPropertiesDraft[] {
  if (!Number.isInteger(existingCount) || existingCount < 0 || existingCount + plan.properties.length > 16)
    throw new Error('The metadata contract supports at most 16 properties in total.');
  return artworkBatches(plan.properties).map((batch, index) => ({
    names: batch.names,
    items: batch.items.map((item) => ({ ...item, property_id: item.property_id + (index === 0 ? 0 : existingCount) })),
    ipfsGroup: { base_uri: plan.baseUri, extension: plan.extension }
  }));
}
