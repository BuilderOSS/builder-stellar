import type { Route } from 'next';

export function daoRoute(daoId: string, path = ''): Route {
  const normalizedPath = path ? `/${path.replace(/^\/+/, '')}` : '';
  return `/dao/${encodeURIComponent(daoId)}${normalizedPath}` as Route;
}

/** The id a DAO's URLs should use: its claimed slug once launched, otherwise the token address. */
export function daoRouteId(dao: { daoId: string; slug?: string | null }) {
  return dao.slug || dao.daoId;
}

/**
 * The same page under the DAO's canonical id, or null when the URL already uses it.
 * Keeps the sub-path, query and hash: /dao/CABC…/proposals?x=1 → /dao/lantern-club/proposals?x=1
 */
export function canonicalDaoUrl(url: { pathname: string; search?: string; hash?: string }, routeId: string) {
  const match = /^\/dao\/([^/]+)(.*)$/.exec(url.pathname);
  if (!match) return null;
  let current = match[1];
  try {
    current = decodeURIComponent(current);
  } catch {
    // Leave a malformed segment as-is; it simply won't match.
  }
  if (current === routeId) return null;
  return `/dao/${encodeURIComponent(routeId)}${match[2]}${url.search ?? ''}${url.hash ?? ''}`;
}

export function daoAdminRoute(daoId: string, section = ''): Route {
  return daoRoute(daoId, `/admin${section}`);
}
