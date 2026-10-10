import type { DaoNetworkConfig } from './dao-config';
import { daoRoute } from './dao-routes';

export type DaoNavKey = 'home' | 'vote' | 'auction' | 'market' | 'treasury' | 'members' | 'claims' | 'manage';

export type DaoNavItem = {
  key: DaoNavKey;
  label: string;
  href: string;
  /** Match only the exact path (the DAO home). */
  exact?: boolean;
};

export type DaoNav = {
  /** Bottom tab bar on phones: Home, Vote, slot 3, Treasury (More is added by the shell). */
  tabs: DaoNavItem[];
  /** Everything not in `tabs`, shown in the More sheet on phones. */
  more: DaoNavItem[];
  /** Left rail from md: main destinations in order. */
  rail: DaoNavItem[];
  /** Rail items pinned to the bottom (Manage). */
  railFooter: DaoNavItem[];
  slot3: Extract<DaoNavKey, 'auction' | 'market' | 'members'>;
};

type NavCapabilities = Pick<
  DaoNetworkConfig,
  'auctionContractId' | 'auctionEnabled' | 'marketplaceContractId' | 'marketplaceEnabled' | 'minterContractId'
>;

export function hasAuction(config: NavCapabilities) {
  // A disabled auction can be reactivated, so it stays reachable; a DAO
  // without an auction contract never had one.
  return Boolean(config.auctionContractId);
}

export function hasMarketplace(config: NavCapabilities) {
  return Boolean(config.marketplaceContractId) && config.marketplaceEnabled !== false;
}

/**
 * Slot 3 of the community tab bar: Auction when the community runs (or can
 * resume) auctions, else Market when its marketplace is enabled, else Members.
 */
export function resolveSlot3(config: NavCapabilities): DaoNav['slot3'] {
  if (hasAuction(config) && config.auctionEnabled !== false) return 'auction';
  if (hasMarketplace(config)) return 'market';
  return 'members';
}

export function resolveDaoNav(daoId: string, config: NavCapabilities, { canManage }: { canManage: boolean }): DaoNav {
  const items: Record<DaoNavKey, DaoNavItem> = {
    home: { key: 'home', label: 'Home', href: daoRoute(daoId), exact: true },
    vote: { key: 'vote', label: 'Vote', href: daoRoute(daoId, 'proposals') },
    auction: { key: 'auction', label: 'Auction', href: daoRoute(daoId, 'auctions') },
    market: { key: 'market', label: 'Market', href: daoRoute(daoId, 'marketplace') },
    treasury: { key: 'treasury', label: 'Treasury', href: daoRoute(daoId, 'treasury') },
    members: { key: 'members', label: 'Members', href: daoRoute(daoId, 'members') },
    claims: { key: 'claims', label: 'Claims', href: daoRoute(daoId, 'claims') },
    manage: { key: 'manage', label: 'Manage', href: daoRoute(daoId, 'admin') }
  };

  const slot3 = resolveSlot3(config);
  const available = (key: DaoNavKey) => {
    switch (key) {
      case 'auction':
        return hasAuction(config);
      case 'market':
        return hasMarketplace(config);
      case 'claims':
        return Boolean(config.minterContractId);
      case 'manage':
        return canManage;
      default:
        return true;
    }
  };

  const tabs = (['home', 'vote', slot3, 'treasury'] as DaoNavKey[]).map((key) => items[key]);
  const more = (['auction', 'market', 'members', 'claims', 'manage'] as DaoNavKey[])
    .filter((key) => key !== slot3 && available(key))
    .map((key) => items[key]);
  const rail = (['home', 'vote', 'auction', 'market', 'treasury', 'members', 'claims'] as DaoNavKey[])
    .filter(available)
    .map((key) => items[key]);
  const railFooter = available('manage') ? [items.manage] : [];

  return { tabs, more, rail, railFooter, slot3 };
}

/**
 * The single active item for a pathname: exact items match only themselves,
 * others match their path and anything below it; the longest match wins.
 */
export function activeNavKey<T extends { href: string; exact?: boolean }>(pathname: string, items: T[]): T | undefined {
  let best: T | undefined;
  for (const item of items) {
    const href = decodeURIComponent(item.href);
    const path = decodeURIComponent(pathname);
    const matches = item.exact ? path === href : path === href || path.startsWith(`${href}/`);
    if (matches && (!best || href.length > decodeURIComponent(best.href).length)) best = item;
  }
  return best;
}
