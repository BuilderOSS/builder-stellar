import { Buffer } from 'buffer';
import { describe, expect, it } from 'vitest';

import { decodeTokenUri } from './token-json';

describe('token_uri data URI', () => {
  it('decodes the JSON the Metadata contract builds', () => {
    const json = {
      name: 'Lantern Club #12',
      image: 'https://r.example/api/render?contract=C&token=12',
      attributes: [{ trait_type: 'Head', value: 'crown' }]
    };
    const uri = `data:application/json;base64,${Buffer.from(JSON.stringify(json)).toString('base64')}`;
    expect(decodeTokenUri(uri)).toEqual(json);
  });

  it('refuses anything else', () => {
    expect(() => decodeTokenUri('https://example.com/1.json')).toThrow('data URI');
    expect(() => decodeTokenUri(`data:application/json;base64,${Buffer.from('[]').toString('base64')}`)).toThrow();
  });
});
