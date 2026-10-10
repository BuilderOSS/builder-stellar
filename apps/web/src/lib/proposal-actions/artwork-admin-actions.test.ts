import { describe, expect, it } from 'vitest';

import {
  addArtworkPropertiesHandler,
  type ArtworkPropertiesDraft,
  artworkSettingHandlers,
  validateArtworkProperties,
  validateArtworkSetting
} from './artwork-admin-actions';
import type { BuildContext } from './types';

const batch: ArtworkPropertiesDraft = {
  names: ['Head'],
  items: [{ name: 'One', property_id: 0, is_new_property: true }],
  ipfsGroup: { base_uri: 'ipfs://collection', extension: '.png' }
};
describe('metadata admin ABI handlers for lead registration', () => {
  it('uses current struct/vector arguments without encoding or invented caller fields', () => {
    expect(validateArtworkProperties(batch).valid).toBe(true);
    expect(
      addArtworkPropertiesHandler.buildCallVector(batch, { config: { metadataContractId: 'metadata' } } as BuildContext)
    ).toEqual({ target: 'metadata', function: 'add_properties', args: [batch.names, batch.items, batch.ipfsGroup] });
  });
  it('rejects empty and oversized calls, orphan new properties, and invalid references', () => {
    expect(validateArtworkProperties({ ...batch, items: [] }).valid).toBe(false);
    expect(validateArtworkProperties({ ...batch, items: Array(31).fill(batch.items[0]) }).valid).toBe(false);
    expect(validateArtworkProperties({ ...batch, names: ['Head', 'Body'] }).valid).toBe(false);
    expect(validateArtworkProperties({ ...batch, items: [{ ...batch.items[0], property_id: 16 }] }).valid).toBe(false);
    expect(
      validateArtworkProperties({ ...batch, ipfsGroup: { base_uri: 'javascript:bad', extension: '.svg' } }).valid
    ).toBe(false);
  });
  it('allows append-only calls with no new properties', () => {
    expect(
      validateArtworkProperties({
        ...batch,
        names: [],
        items: [{ ...batch.items[0], property_id: 4, is_new_property: false }]
      }).valid
    ).toBe(true);
  });
  it('restricts metadata URLs and maps all four settings to the current ABI', () => {
    expect(validateArtworkSetting('javascript:alert(1)', 'set-artwork-renderer').valid).toBe(false);
    expect(validateArtworkSetting('https://renderer.example', 'set-artwork-renderer').valid).toBe(true);
    expect(validateArtworkSetting('ipfs://image', 'set-artwork-contract-image').valid).toBe(true);
    expect(
      artworkSettingHandlers.map(
        (handler) =>
          handler.buildCallVector({ value: 'https://example.test' }, {
            config: { metadataContractId: 'metadata' }
          } as BuildContext).function
      )
    ).toEqual(['update_renderer_base', 'update_description', 'update_project_uri', 'update_contract_image']);
  });
});
