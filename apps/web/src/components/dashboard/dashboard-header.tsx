import { Menu } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { NetworkIndicator } from '@/components/network-indicator';
import { WalletControls } from '@/components/wallet-controls';
import { useAuthSessionStore } from '@/stores/auth-session-store';

interface DashboardHeaderProps {
  showMenuButton?: boolean;
  onMenuClick?: () => void;
}

export function DashboardHeader({ showMenuButton = false, onMenuClick }: DashboardHeaderProps) {
  const session = useAuthSessionStore();
  return (
    <header className="dashboard-header">
      {showMenuButton ? (
        <button className="dashboard-menu-button" type="button" aria-label="Open dashboard menu" onClick={onMenuClick}>
          <Menu aria-hidden="true" size={20} />
        </button>
      ) : null}
      <Link className="brand-lockup" href="/" aria-label="Builder Lobby home">
        <Image className="brand-mark" src="/icon.svg" alt="" aria-hidden="true" width={44} height={44} priority />
        <div className="brand-copy">
          <p className="brand-name">Builder</p>
          <p className="brand-kicker">DAO worlds on Stellar</p>
        </div>
      </Link>
      <div className="dashboard-header__actions">
        <NetworkIndicator isConnected={Boolean(session.address)} />
        <WalletControls />
      </div>
    </header>
  );
}
