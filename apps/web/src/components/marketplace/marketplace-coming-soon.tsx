import type { Route } from 'next';
import Link from 'next/link';

import styles from './marketplace.module.css';

/** Compatibility export for the dashboard owner; this now links to the usable marketplace. */
export function MarketplaceComingSoon({ daoName, daoHref }: { daoName?: string; daoHref?: string }) {
  const communityPath = daoHref?.match(/^\/dao\/(C[A-Z2-7]{55})(?:\/marketplace)?\/?$/);
  const href = communityPath ? `/dao/${communityPath[1]}/marketplace` : '/marketplace';
  return (
    <section className={styles.scoped}>
      <div className={styles.panel}>
        <div className={styles.stack}>
          <p className={styles.eyebrow}>Community ownership</p>
          <h2>{daoName ? `${daoName} marketplace` : 'Explore the community marketplace'}</h2>
          <p>
            Discover community primary offers and member resales. Primary purchases mint a new NFT to the buyer and fund
            the DAO Treasury; secondary offers trade an existing escrowed token.
          </p>
          <Link className={styles.button} href={href as Route}>
            Browse marketplace →
          </Link>
        </div>
      </div>
    </section>
  );
}
