import { Buffer } from 'buffer';

const PREFIX = 'data:application/json;base64,';

export type TokenJson = {
  name: string;
  image: string;
  attributes: Array<{ trait_type: string; value: string }>;
};

/** Decode the `data:` URI the token's `token_uri()` returns into its SEP-50 JSON. */
export function decodeTokenUri(uri: string): TokenJson {
  if (!uri.startsWith(PREFIX)) throw new Error('token_uri is not a base64 JSON data URI.');
  const value: unknown = JSON.parse(Buffer.from(uri.slice(PREFIX.length), 'base64').toString('utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('token_uri JSON is not an object.');
  const json = value as Partial<TokenJson>;
  if (typeof json.name !== 'string' || typeof json.image !== 'string' || !Array.isArray(json.attributes))
    throw new Error('token_uri JSON is missing name, image or attributes.');
  return json as TokenJson;
}
