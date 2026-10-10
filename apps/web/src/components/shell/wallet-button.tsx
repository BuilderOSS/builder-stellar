'use client';

import { Wallet } from 'lucide-react';
import { css } from 'styled-system/css';

import { Avatar, Button } from '@/components/ui';

import { useWalletSession } from './wallet-session';

const trigger = css({
  position: 'relative',
  display: 'inline-grid',
  placeItems: 'center',
  width: 'touch',
  height: 'touch',
  p: '0',
  bg: 'transparent',
  border: '0',
  borderRadius: 'full',
  cursor: 'pointer',
  transitionProperty: 'scale',
  transitionDuration: 'press',
  transitionTimingFunction: 'out',
  _active: { scale: '0.96' },
  _focusVisible: { outline: '2px solid', outlineColor: 'signal', outlineOffset: '2px' }
});
const status = css({
  position: 'absolute',
  right: '1',
  bottom: '1',
  width: '2.5',
  height: '2.5',
  borderRadius: 'full',
  bg: 'success',
  boxShadow: '0 0 0 2px token(colors.canvas)',
  '&[data-issue]': { bg: 'warning' }
});

/**
 * Top-bar wallet entry: "Connect" when signed out, your avatar (with a
 * network dot) when signed in. The avatar opens the You sheet.
 */
export function WalletButton({ onOpenYou }: { onOpenYou: () => void }) {
  const wallet = useWalletSession();

  if (wallet.isAuthenticated) {
    return (
      <button
        type="button"
        className={trigger}
        onClick={onOpenYou}
        aria-haspopup="dialog"
        aria-label={wallet.networkIssue ? 'You, wallet on the wrong network' : 'You'}
      >
        <Avatar address={wallet.address} size="md" />
        <span className={status} data-issue={wallet.networkIssue ? '' : undefined} aria-hidden="true" />
      </button>
    );
  }

  return (
    <Button size="sm" onClick={() => void wallet.connect()} loading={wallet.isAuthBusy} aria-label="Connect wallet">
      {wallet.isAuthBusy ? null : <Wallet aria-hidden="true" />}
      {wallet.isAuthBusy ? 'Check wallet' : 'Connect'}
    </Button>
  );
}
