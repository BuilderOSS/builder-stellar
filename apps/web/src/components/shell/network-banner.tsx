'use client';

import { TriangleAlert } from 'lucide-react';
import { css } from 'styled-system/css';

import { useWalletSession } from './wallet-session';

const banner = css({
  display: 'flex',
  alignItems: 'flex-start',
  gap: '3',
  p: '3.5',
  mb: '5',
  borderRadius: 'card',
  bg: 'warning.wash',
  color: 'ink',
  '& svg': { width: '5', height: '5', color: 'warning', flexShrink: '0', mt: '0.5' }
});
const title = css({ textStyle: 'subheading', fontSize: '0.9375rem', m: '0' });
const body = css({ textStyle: 'caption', fontSize: '0.875rem', color: 'ink.muted', m: '0', mt: '0.5' });

/**
 * Wallet on the wrong network: say so once, at the top. Reading stays
 * available; signing is refused centrally by `signWithWallet`.
 */
export function NetworkBanner() {
  const wallet = useWalletSession();
  if (!wallet.isAuthenticated || !wallet.networkIssue) return null;
  return (
    <div className={banner} role="alert">
      <TriangleAlert aria-hidden="true" />
      <div>
        <p className={title}>Switch your wallet to {wallet.network.label}</p>
        <p className={body}>{wallet.networkIssue} You can keep browsing; transactions are paused until it matches.</p>
      </div>
    </div>
  );
}
