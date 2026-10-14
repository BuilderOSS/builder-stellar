export const SITE_NAME = 'Tribes Builder';
export const SITE_DESCRIPTION =
  'Gather your people, pool what you put in, and decide together. A DAO on Stellar: shared treasury, onchain votes, NFT membership.';

const DEFAULT_SITE_URL = 'https://tribes.build';

/** Public origin for absolute metadata URLs, from NEXT_PUBLIC_SITE_URL (inlined at build). */
export function siteUrl(): URL {
  try {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL?.trim() || DEFAULT_SITE_URL);
  } catch {
    return new URL(DEFAULT_SITE_URL);
  }
}
