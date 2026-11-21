'use client';

import { Wallet } from 'lucide-react';
import { css } from 'styled-system/css';

import { Button, Sheet } from '@/components/ui';

/** Stellar's Friendbot, through the Stellar Lab page that funds a testnet account. */
export const TESTNET_FUND_URL = 'https://lab.stellar.org/account/fund';

const list = css({ display: 'grid', gap: '4', listStyle: 'none', m: '0', p: '0' });
const item = css({ display: 'grid', gap: '1' });
const heading = css({ textStyle: 'subheading', m: '0' });
const body = css({ textStyle: 'body', color: 'ink.muted', m: '0' });
const link = css({ color: 'signal', textDecoration: 'underline', textUnderlineOffset: '2px' });

/**
 * What a wallet is and what signing means, shown once before the first Connect and reopenable
 * from the You sheet. `onContinue` is only offered when there is something to connect.
 */
export function WalletIntro({
  open,
  onOpenChange,
  networkLabel,
  testnet = false,
  walletConnect = false,
  onContinue
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  networkLabel: string;
  /** On testnet, say where to get free test XLM. */
  testnet?: boolean;
  /** Mention phone wallets only when WalletConnect is configured (lib/wallet-kit.ts). */
  walletConnect?: boolean;
  onContinue?: () => void;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Before you connect"
      description="A short guide for people who are new to crypto wallets."
      footer={
        onContinue ? (
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Not now
            </Button>
            <Button onClick={onContinue}>
              <Wallet aria-hidden="true" />
              Connect wallet
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        )
      }
    >
      <ul className={list}>
        <li className={item}>
          <p className={heading}>A wallet is your account</p>
          <p className={body}>
            It&apos;s an app that holds your Stellar account. It&apos;s how you hold a membership, bid and vote. Tribe
            Builder never holds your funds and can&apos;t move them without your approval.
          </p>
        </li>
        <li className={item}>
          <p className={heading}>Which wallets work</p>
          <p className={body}>
            In a browser: Freighter, xBull, LOBSTR, Albedo, Hana and others.
            {walletConnect ? ' On a phone: a wallet that supports WalletConnect, such as Freighter Mobile.' : ''} Set it
            to {networkLabel}.
          </p>
        </li>
        <li className={item}>
          <p className={heading}>What signing means</p>
          <p className={body}>
            First you sign a short message to sign in. It&apos;s free and moves nothing. Later, each bid, vote or
            proposal asks your wallet to approve one transaction, and your wallet shows what it does and its network fee
            before you approve it.
          </p>
        </li>
        <li className={item}>
          <p className={heading}>You&apos;ll need some XLM</p>
          <p className={body}>Your account needs some XLM to exist on Stellar and to pay network fees.</p>
          {testnet ? (
            <p className={body}>
              On testnet, XLM is free and has no value. Fund your account with Stellar&apos;s{' '}
              <a className={link} href={TESTNET_FUND_URL} target="_blank" rel="noreferrer">
                Friendbot
              </a>
              . Some wallets, such as Freighter, can also fund a testnet account for you.
            </p>
          ) : null}
        </li>
      </ul>
    </Sheet>
  );
}
