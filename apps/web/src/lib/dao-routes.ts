import type { Route } from 'next';

export function daoRoute(daoId: string, path = ''): Route {
  const normalizedPath = path ? `/${path.replace(/^\/+/, '')}` : '';
  return `/dao/${encodeURIComponent(daoId)}${normalizedPath}` as Route;
}

export function daoAdminRoute(daoId: string, section = ''): Route {
  return daoRoute(daoId, `/admin${section}`);
}
