'use client';
import styles from '@/components/create-dao/workspace.module.css';
import { LocalDrafts } from '@/components/local-workspace/local-drafts';

export default function DraftsPage() {
  return (
    <div className={styles.workspace}>
      <h1 className="page-title">Your drafts</h1>
      <LocalDrafts />
    </div>
  );
}
