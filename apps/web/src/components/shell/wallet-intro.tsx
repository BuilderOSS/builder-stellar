'use client';

import { Wallet } from 'lucide-react';
import { css } from 'styled-system/css';

import { Button, Sheet } from '@/components/ui';

const list = css({ display: 'grid', gap: '4', listStyle: 'none', m: '0', p: '0' });
const item = css({ display: 'grid', gap: '1' });
const heading = css({ textStyle: 'subheading', m: '0' });
const body = css({ textStyle: 'body', color: 'ink.muted', m: '0' });

/**
 * What a wallet is and what signing means, shown once before the first Connect and reopenable
 * from the You sheet. `onContinue` is only offered when there is something to connect.
 */
export function WalletIntro({
  open,
  onOpenChange,
  networkLabel,
  onContinue
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  networkLabel: string;
  onContinue?: () => void;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Before you connect"
      description="A minute on wallets, if they're new to you."
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
            It&apos;s an app that holds your Stellar account. It&apos;s how you hold a membership, bid and vote. Tribes
            Builder never holds your funds and can&apos;t move them without your approval.
          </p>
        </li>
        <li className={item}>
          <p className={heading}>Which wallets work</p>
          <p className={body}>
            In a browser: Freighter, xBull, LOBSTR, Albedo, Hana and others. On a phone, a wallet that supports
            WalletConnect, such as Freighter Mobile, when it&apos;s offered. Set it to {networkLabel}.
          </p>
        </li>
        <li className={item}>
          <p className={heading}>What signing means</p>
          <p className={body}>
            First you sign a short message to sign in. It&apos;s free and moves nothing. Later, each bid, vote or
            proposal asks your wallet to approve one transaction, and your wallet shows what it does and its network
            fee, a fraction of a cent, before you say yes.
          </p>
        </li>
        <li className={item}>
          <p className={heading}>You&apos;ll need a little XLM</p>
          <p className={body}>Your account needs some XLM to exist on Stellar and to pay network fees.</p>
        </li>
      </ul>
    </Sheet>
  );
}
