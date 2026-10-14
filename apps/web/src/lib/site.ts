export const SITE_NAME = 'Tribe Builder';
export const SITE_DESCRIPTION =
  'Gather your people, pool what you put in, and decide together. A DAO on Stellar: shared treasury, onchain votes, NFT membership.';
export const SOURCE_URL = 'https://github.com/BuilderOSS/builder-stellar';
/** Community and support: questions, problems and legal requests all start here. */
export const DISCORD_URL = 'https://discord.gg/bTygNksyRb';

const DEFAULT_SITE_URL = 'https://tribes.build';

/**
 * The app's old production host. Testnet tribes deployed before the rename keep its URLs in their
 * on-chain image and renderer settings, so that host keeps serving /api and /images (see
 * docs/DAO_DEPLOYMENT.md). New values never use it: drafts are moved to the site URL below.
 */
export const LEGACY_SITE_ORIGIN = 'https://builder-stellar-web.vercel.app';

/** Public origin for absolute URLs, from NEXT_PUBLIC_SITE_URL (inlined at build). */
export function siteUrl(): URL {
  try {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL?.trim() || DEFAULT_SITE_URL);
  } catch {
    return new URL(DEFAULT_SITE_URL);
  }
}

/** An absolute URL on the public site, such as `siteHref('/api/render')`. */
export function siteHref(path: string): string {
  return new URL(path, siteUrl()).toString();
}

/** Moves a URL on the legacy host to the same path on the public site; anything else is unchanged. */
export function withSiteOrigin(url: string): string {
  return url.startsWith(`${LEGACY_SITE_ORIGIN}/`) ? siteHref(url.slice(LEGACY_SITE_ORIGIN.length)) : url;
}
