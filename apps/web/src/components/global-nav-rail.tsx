'use client';

import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { Box } from 'styled-system/jsx';

import { useDaoContext } from '@/contexts/dao-context';

export type NavRailItem = {
  id: string;
  label: string;
  href: string;
  reachable: boolean;
  complete?: boolean;
};

function DashIndicator({
  item,
  isActive,
  completionIndex,
  totalCompleted
}: {
  item: NavRailItem;
  isActive: boolean;
  completionIndex: number;
  totalCompleted: number;
}) {
  const getOpacity = () => {
    if (isActive) return 1;
    if (item.complete) {
      // Gradient trail effect: increase opacity based on position among completed items
      return 0.28 + (0.42 * completionIndex) / Math.max(totalCompleted, 1);
    }
    return 0.3;
  };

  const opacity = getOpacity();
  const baseColor = item.complete ? 'var(--action)' : 'var(--border-strong)';

  return (
    <Box
      as="div"
      style={{
        height: '3px',
        width: isActive ? '26px' : '18px',
        borderRadius: '1.5px',
        backgroundColor: baseColor,
        opacity,
        transition: 'all 300ms ease-in-out',
        ...(isActive && {
          background: 'linear-gradient(90deg, var(--action), var(--action-hover))',
          boxShadow: '0 0 10px rgba(73, 166, 255, 0.3)'
        })
      }}
      aria-hidden="true"
    />
  );
}

function NavRailTooltip({ label }: { label: string }) {
  return (
    <span
      style={{
        position: 'absolute',
        left: '100%',
        marginLeft: '12px',
        whiteSpace: 'nowrap',
        borderRadius: '9px',
        padding: '6px 10px',
        fontSize: '0.75rem',
        fontWeight: 500,
        color: 'var(--text-primary)',
        opacity: 0,
        pointerEvents: 'none',
        transition: 'opacity 150ms ease-in-out',
        background: 'var(--surface-2)',
        border: '1px solid var(--border-strong)',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.4)',
        zIndex: 1000
      }}
      className="group-hover-opacity-100 group-focus-visible-opacity-100 nav-tooltip"
    >
      {label}
    </span>
  );
}

function NavRailButton({
  item,
  isActive,
  completionIndex,
  totalCompleted,
  onClick
}: {
  item: NavRailItem;
  isActive: boolean;
  completionIndex: number;
  totalCompleted: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!item.reachable}
      aria-label={`${item.label}${item.complete ? ' (complete)' : ''}`}
      aria-current={isActive ? 'page' : undefined}
      style={{
        position: 'relative',
        background: 'none',
        border: 'none',
        padding: '8px 0',
        cursor: item.reachable ? 'pointer' : 'not-allowed',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: item.reachable ? 1 : 0.5
      }}
      className="group"
    >
      <DashIndicator
        item={item}
        isActive={isActive}
        completionIndex={completionIndex}
        totalCompleted={totalCompleted}
      />
      <NavRailTooltip label={item.label} />
    </button>
  );
}

export function GlobalNavRail({
  items,
  activeId,
  onNavigate
}: {
  items: NavRailItem[];
  activeId: string | null;
  onNavigate: (id: string, href: string) => void;
}) {
  const completedItems = items.filter((item) => item.complete);

  return (
    <nav
      aria-label="Main navigation"
      style={{
        position: 'fixed',
        left: '20px',
        top: '50%',
        transform: 'translateY(-50%)',
        flexDirection: 'column',
        gap: '15px',
        zIndex: 30
      }}
      className="nav-rail-desktop"
    >
      {items.map((item) => {
        const isActive = item.id === activeId;
        const completionIndex = completedItems.indexOf(item);

        return (
          <NavRailButton
            key={item.id}
            item={item}
            isActive={isActive}
            completionIndex={completionIndex}
            totalCompleted={completedItems.length}
            onClick={() => onNavigate(item.id, item.href)}
          />
        );
      })}
    </nav>
  );
}

export function MobileNavRail({ items, activeId }: { items: NavRailItem[]; activeId: string | null }) {
  const activeIndex = items.findIndex((item) => item.id === activeId);
  const activeLabel = activeIndex !== -1 ? items[activeIndex].label : 'Navigation';

  return (
    <div
      style={{
        position: 'fixed',
        left: '12px',
        right: '12px',
        top: 'calc(4.75rem)',
        zIndex: 30,
        borderRadius: '12px',
        padding: '10px 14px',
        background: 'var(--surface-2)',
        border: '1px solid var(--border-strong)',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.4)',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px'
      }}
      className="nav-rail-mobile"
    >
      <span
        style={{
          fontSize: '0.75rem',
          fontWeight: 600,
          color: 'var(--text-secondary)'
        }}
      >
        {activeIndex + 1} · {activeLabel}
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
        {items.map((item) => {
          const isActive = item.id === activeId;
          return (
            <div
              key={item.id}
              style={{
                height: '3px',
                width: isActive ? '22px' : '12px',
                borderRadius: '1.5px',
                backgroundColor: 'var(--border-strong)',
                opacity: item.complete ? 0.8 : 0.3,
                transition: 'all 300ms ease-in-out',
                ...(isActive && {
                  background: 'linear-gradient(90deg, var(--action), var(--action-hover))',
                  opacity: 1
                })
              }}
              aria-hidden="true"
            />
          );
        })}
      </div>
    </div>
  );
}

/**
 * Composable hook to build nav rail items with context awareness
 */
export function useNavRailItems(): NavRailItem[] {
  const pathname = usePathname();
  const { daoId, daoConfig } = useDaoContext();

  return useMemo(() => {
    // Determine context
    const isAdmin = pathname.includes('/admin');
    const isDao = pathname.startsWith('/dao/');

    // Build core navigation items
    const items: NavRailItem[] = [
      {
        id: 'home',
        label: 'Home',
        href: isDao ? `/dao/${daoId}` : '/',
        reachable: true
      }
    ];

    if (isDao && daoId) {
      items.push(
        {
          id: 'dashboard',
          label: 'Dashboard',
          href: `/dao/${daoId}`,
          reachable: true
        },
        {
          id: 'proposals',
          label: 'Proposals',
          href: `/dao/${daoId}/proposals`,
          reachable: true
        },
        {
          id: 'treasury',
          label: 'Treasury',
          href: `/dao/${daoId}/treasury`,
          reachable: true
        },
        {
          id: 'auctions',
          label: 'Auctions',
          href: `/dao/${daoId}/auctions`,
          reachable: true
        },
        {
          id: 'members',
          label: 'Members',
          href: `/dao/${daoId}/members`,
          reachable: true
        },
        {
          id: 'marketplace',
          label: 'Marketplace',
          href: `/dao/${daoId}/marketplace`,
          reachable: true
        },
        {
          id: 'admin',
          label: 'Admin',
          href: `/dao/${daoId}/admin`,
          reachable: true
        }
      );

      // Add admin sub-items if on admin page
      if (isAdmin) {
        items.push(
          {
            id: 'admin-owner',
            label: 'Owner',
            href: `/dao/${daoId}/admin`,
            reachable: true
          },
          {
            id: 'admin-token',
            label: 'Token Admin',
            href: `/dao/${daoId}/admin/token`,
            reachable: true
          },
          {
            id: 'admin-governance',
            label: 'Governance',
            href: `/dao/${daoId}/admin/governance`,
            reachable: true
          },
          {
            id: 'admin-auction',
            label: 'Auctions',
            href: `/dao/${daoId}/admin/auction`,
            reachable: true,
            complete: daoConfig.auctionEnabled === true
          },
          {
            id: 'admin-artwork',
            label: 'Artwork',
            href: `/dao/${daoId}/admin/artwork`,
            reachable: true,
            complete: Boolean(daoConfig.metadataContractId)
          },
          {
            id: 'admin-founders',
            label: 'Founders',
            href: `/dao/${daoId}/admin/founders`,
            reachable: true
          },
          {
            id: 'admin-marketplace',
            label: 'Marketplace',
            href: `/dao/${daoId}/admin/marketplace`,
            reachable: true
          }
        );
      }
    }

    return items;
  }, [pathname, daoId, daoConfig]);
}

/**
 * Hook to detect active nav item from current pathname
 */
export function useActiveNavItem(items: NavRailItem[]): string | null {
  const pathname = usePathname();

  return useMemo(() => {
    if (pathname === '/') return 'home';

    for (const item of items) {
      const href = item.href.replace('[daoId]', '');
      if (pathname.startsWith(href) || pathname === item.href) {
        return item.id;
      }
    }

    return null;
  }, [pathname, items]);
}
