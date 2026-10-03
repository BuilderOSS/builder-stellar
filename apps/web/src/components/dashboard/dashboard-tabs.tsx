'use client';

import { Compass, Newspaper, Store, Timer } from 'lucide-react';
import type { Route } from 'next';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';

export type DashboardTab = 'feed' | 'discover' | 'pending' | 'marketplace';

const tabs: { id: DashboardTab; label: string; icon: typeof Newspaper }[] = [
  { id: 'feed', label: 'Feed', icon: Newspaper },
  { id: 'discover', label: 'Discover', icon: Compass },
  { id: 'pending', label: 'Launch queue', icon: Timer },
  { id: 'marketplace', label: 'Marketplace', icon: Store }
];

function isDashboardTab(value: string | null, visibleTabs: typeof tabs): value is DashboardTab {
  return visibleTabs.some((tab) => tab.id === value);
}

export function DashboardTabs({
  children,
  showPending = false
}: {
  children: (tab: DashboardTab) => ReactNode;
  showPending?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const visibleTabs = showPending ? tabs : tabs.filter((tab) => tab.id !== 'pending');
  const requestedTab = searchParams.get('tab');
  const activeTab: DashboardTab = isDashboardTab(requestedTab, visibleTabs) ? requestedTab : 'feed';

  function selectTab(tab: DashboardTab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.replace(`${pathname}?${params.toString()}` as Route, { scroll: false });
  }

  return (
    <>
      <nav className="dashboard-tabs" aria-label="Dashboard views" role="tablist">
        {visibleTabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className="dashboard-tab"
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            onClick={() => selectTab(id)}
          >
            <Icon aria-hidden="true" size={16} />
            {label}
          </button>
        ))}
      </nav>
      <div role="tabpanel" aria-label={`${visibleTabs.find((tab) => tab.id === activeTab)?.label} content`}>
        {children(activeTab)}
      </div>
    </>
  );
}
