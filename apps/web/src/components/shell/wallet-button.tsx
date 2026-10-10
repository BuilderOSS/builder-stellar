'use client';

import { Wallet } from 'lucide-react';
import { css } from 'styled-system/css';

import { Avatar, Button, shortenId } from '@/components/ui';

import { useWalletSession } from './wallet-session';

// A 44px avatar on phones; from md a pill with the short address, paired with the community switcher.
const trigger = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '2',
  minW: 'touch',
  minH: 'touch',
  p: '0',
  bg: 'transparent',
  border: '0',
  borderRadius: 'full',
  color: 'ink.muted',
  cursor: 'pointer',
  transitionProperty: 'background-color, color, scale',
  transitionDuration: 'fast, fast, press',
  transitionTimingFunction: 'ease, ease, token(easings.out)',
  _active: { scale: '0.96' },
  _focusVisible: { outline: '2px solid', outlineColor: 'signal', outlineOffset: '2px' },
  md: { pl: '1.5', pr: '3.5', bg: 'surface', boxShadow: 'inset 0 0 0 1px token(colors.rule)' },
  '@media (hover: hover) and (pointer: fine)': { _hover: { color: 'ink', md: { bg: 'hover' } } },
  _motionReduce: { _active: { scale: '1' } }
});
const avatarSlot = css({ position: 'relative', display: 'inline-grid', placeItems: 'center', flexShrink: '0' });
// Always 4…4, so the pill never changes width and nothing in the bar shifts.
const shortAddress = css({
  display: { base: 'none', md: 'inline' },
  textStyle: 'mono',
  fontSize: '0.8125rem',
  fontVariantNumeric: 'tabular-nums'
});
const status = css({
  position: 'absolute',
  right: '0',
  bottom: '0',
  width: '2.5',
  height: '2.5',
  borderRadius: 'full',
  bg: 'success',
  boxShadow: '0 0 0 2px token(colors.canvas)',
  '&[data-issue]': { bg: 'warning' }
});

/**
 * Top-bar wallet entry: "Connect" when signed out; when signed in, your avatar (with a network
 * dot) and, from md, the short address so you can tell which account is about to sign.
 * Opens the You sheet.
 */
export function WalletButton({ onOpenYou }: { onOpenYou: () => void }) {
  const wallet = useWalletSession();

  if (wallet.isAuthenticated) {
    const short = shortenId(wallet.address, 4, 4);
    return (
      <button
        type="button"
        className={trigger}
        onClick={onOpenYou}
        aria-haspopup="dialog"
        aria-label={`You, connected as ${short}${wallet.networkIssue ? ', wallet on the wrong network' : ''}`}
      >
        <span className={avatarSlot}>
          <Avatar address={wallet.address} size="md" />
          <span className={status} data-issue={wallet.networkIssue ? '' : undefined} aria-hidden="true" />
        </span>
        <span className={shortAddress} aria-hidden="true">
          {short}
        </span>
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
