'use client';

import { Compass, Newspaper, Users } from 'lucide-react';
import type { Route } from 'next';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';

export type DashboardTab = 'feed' | 'my-daos' | 'discover' | 'marketplace';

const tabs: { id: DashboardTab; label: string; icon: typeof Newspaper }[] = [
  { id: 'feed', label: 'Feed', icon: Newspaper },
  { id: 'my-daos', label: 'My DAOs', icon: Users },
  { id: 'discover', label: 'Discover', icon: Compass }
];

function isDashboardTab(value: string | null): value is DashboardTab {
  return tabs.some((tab) => tab.id === value);
}

export function DashboardTabs({ children }: { children: (tab: DashboardTab) => ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const activeTab: DashboardTab = isDashboardTab(requestedTab) ? requestedTab : 'feed';

  function selectTab(tab: DashboardTab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.replace(`${pathname}?${params.toString()}` as Route, { scroll: false });
  }

  return (
    <>
      <nav className="dashboard-tabs" aria-label="Dashboard views" role="tablist">
        {tabs.map(({ id, label, icon: Icon }) => (
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
      <div role="tabpanel" aria-label={`${tabs.find((tab) => tab.id === activeTab)?.label} content`}>
        {children(activeTab)}
      </div>
    </>
  );
}
