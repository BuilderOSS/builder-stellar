'use client';
import Link from 'next/link';

import styles from '@/components/create-dao/workspace.module.css';
import { LocalDrafts } from '@/components/local-workspace/local-drafts';
import { WalletControls } from '@/components/wallet-controls';

export default function DraftsPage() {
  return (
    <div className="page-shell">
      <div className={styles.workspace}>
        <header className={styles.header}>
          <Link href="/">Builder Lobby</Link>
          <WalletControls />
        </header>
        <main>
          <h1 className="page-title">Your drafts</h1>
          <LocalDrafts />
        </main>
      </div>
    </div>
  );
}
