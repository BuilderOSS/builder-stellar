import type { Route } from 'next';

export function daoRoute(daoId: string, path = ''): Route {
  return `/dao/${encodeURIComponent(daoId)}${path}` as Route;
}

export function daoAdminRoute(daoId: string, section = ''): Route {
  return daoRoute(daoId, `/admin${section}`);
}
