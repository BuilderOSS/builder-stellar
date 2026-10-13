'use client';

import { useRef, useState } from 'react';
import { css, cx } from 'styled-system/css';
import { useSWRConfig } from 'swr';

import { Address, Button, Callout, Dialog } from '@/components/ui';
import { DEPLOYMENT_ID } from '@/config/deployments.generated';
import { getDeploymentConfig } from '@/lib/deployment-config';
import { getExplorerTxUrl } from '@/lib/explorer-links';
import { formatMarketplaceAmount } from '@/lib/marketplace/amount';
import { marketplaceErrorMessage } from '@/lib/marketplace/errors';
import { marketplaceFetch } from '@/lib/marketplace/hooks';
import {
  assertMarketplaceTransaction,
  assertMarketplaceWallet,
  assertUnchangedMarketplaceEnvelope,
  confirmMarketplaceTransaction
} from '@/lib/marketplace/transaction';
import type { MarketplaceAction, MarketplacePrepared } from '@/lib/marketplace/types';
import { withArchivedRestore } from '@/lib/restore-archived-client';
import { readSigningWallet, signWithWallet } from '@/lib/wallet-sign';
import { useAuthSessionStore } from '@/stores/auth-session-store';

const line = css({ textStyle: 'body', color: 'ink', m: '0' });
const muted = css({ textStyle: 'caption', color: 'ink.muted', m: '0' });
const quote = css({ textStyle: 'body', color: 'ink', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', m: '0' });
const box = css({ display: 'grid', gap: '2', p: '3.5', borderRadius: 'control', bg: 'raised' });

const ACTION_TITLE: Record<MarketplaceAction['action'], string> = {
  buy: 'Buy this token',
  restock: 'Stock this pool',
  comment: 'Post your comment',
  cancel: 'Cancel your listing',
  expire: 'Clear an ended listing',
  approve: 'Allow the market to hold your token',
  list: 'List your token',
  revoke: 'Take back the permission',
  trustline: 'Add a USDC trustline'
};

export function TradeReview({
  daoId,
  action,
  onClose,
  onConfirmed
}: {
  daoId: string;
  action: MarketplaceAction;
  onClose: () => void;
  onConfirmed?: () => void;
}) {
  const session = useAuthSessionStore();
  const { mutate } = useSWRConfig();
  const [prepared, setPrepared] = useState<MarketplacePrepared | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Check the details first. Nothing is signed until you press Sign and send.');
  const [hash, setHash] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const inFlight = useRef(false);
  const network = getDeploymentConfig();
  const allowed = session.authStatus === 'authenticated' && Boolean(session.address) && !session.walletNetworkIssue;
  async function prepare() {
    if (inFlight.current || !allowed) return;
    inFlight.current = true;
    setBusy(true);
    setPrepared(null);
    setHash('');
    setMessage('Checking ownership, listing terms, balances and network fees…');
    try {
      const result = await withArchivedRestore(
        () =>
          marketplaceFetch<MarketplacePrepared>(`/api/dao/${encodeURIComponent(daoId)}/marketplace/prepare`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(action)
          }),
        {
          address: session.address ?? '',
          rpcUrl: network.rpcUrl,
          networkPassphrase: network.networkPassphrase,
          onRestoring: setMessage
        }
      );
      if (
        result.address !== session.address ||
        result.daoId !== daoId ||
        result.deploymentId !== DEPLOYMENT_ID ||
        result.networkPassphrase !== network.networkPassphrase
      )
        throw new Error('Transaction identity does not match this session.');
      setPrepared(result);
      setMessage('Looks good. Review the exact terms and network fee below.');
    } catch (error) {
      setMessage(marketplaceErrorMessage(error));
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }

  async function sign() {
    if (!prepared || inFlight.current || !allowed) return;
    inFlight.current = true;
    setBusy(true);
    setMessage('Checking the active wallet…');
    try {
      const [{ TransactionBuilder, rpc }] = await Promise.all([import('@stellar/stellar-sdk')]);
      const [wallet, walletNetwork] = await readSigningWallet();
      if (wallet.address !== useAuthSessionStore.getState().address) {
        throw new Error('The wallet account changed. Reconnect and authenticate before trading.');
      }
      assertMarketplaceWallet(
        wallet.address,
        walletNetwork.networkPassphrase,
        prepared.address,
        prepared.networkPassphrase,
        network.label
      );
      const unsigned = TransactionBuilder.fromXDR(prepared.xdr, prepared.networkPassphrase);
      try {
        assertMarketplaceTransaction(unsigned, prepared.address);
      } catch (error) {
        setPrepared(null);
        throw error;
      }
      setMessage('Waiting for your wallet signature…');
      const signed = await signWithWallet(prepared.xdr, {
        networkPassphrase: prepared.networkPassphrase,
        address: prepared.address
      });
      if (signed.signerAddress && signed.signerAddress !== prepared.address)
        throw new Error('Wallet signed with a different account.');
      const transaction = TransactionBuilder.fromXDR(signed.signedTxXdr, prepared.networkPassphrase);
      const txHash = assertUnchangedMarketplaceEnvelope(unsigned, transaction);
      setHash(txHash);
      setPrepared(null);
      setMessage('Submitting the signed transaction…');
      if (action.action === 'trustline') {
        const { Horizon } = await import('@stellar/stellar-sdk');
        const url =
          network.name === 'public'
            ? 'https://horizon.stellar.org'
            : network.name === 'testnet'
              ? 'https://horizon-testnet.stellar.org'
              : 'http://localhost:8000';
        await new Horizon.Server(url, { allowHttp: network.name === 'local' }).submitTransaction(transaction);
      } else {
        const server = new rpc.Server(prepared.rpcUrl, { allowHttp: network.name === 'local' });
        const submitted = await server.sendTransaction(transaction);
        if (submitted.status === 'ERROR')
          throw new Error('The network rejected this transaction. Refresh the listing and check again.');
        if (submitted.status === 'TRY_AGAIN_LATER')
          throw new Error(
            'The network is busy and has not accepted this transaction. Check its hash before preparing a retry.'
          );
        setMessage('Submitted. Waiting for on-chain confirmation…');
        await confirmMarketplaceTransaction(server, submitted.hash);
      }
      setConfirmed(true);
      setMessage(
        action.action === 'buy' && action.kind === 'pool'
          ? 'Confirmed. The token from the pool is yours. The market can take a few seconds to update.'
          : 'Confirmed. The market can take a few seconds to update.'
      );
      await mutate((key) => Array.isArray(key) && key[0] === 'marketplace' && key[1] === DEPLOYMENT_ID).catch(() => {
        setMessage('Confirmed. The market’s data is unavailable right now, so refresh before your next trade.');
      });
      onConfirmed?.();
    } catch (error) {
      setMessage(marketplaceErrorMessage(error));
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      closeOnInteractOutside={!busy}
      title={ACTION_TITLE[action.action]}
      description={network.label}
      footer={
        !confirmed && !hash ? (
          <>
            <Button variant="ghost" disabled={busy} onClick={onClose}>
              Close
            </Button>
            <Button disabled={!allowed} loading={busy} onClick={prepared ? sign : prepare}>
              {prepared ? 'Sign and send' : 'Check'}
            </Button>
          </>
        ) : (
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Done
          </Button>
        )
      }
    >
      {'id' in action ? (
        <p className={line}>
          {action.kind === 'pool' ? 'Pool' : 'Token'} #{action.id}
        </p>
      ) : null}
      {'tokenId' in action ? <p className={line}>Token #{action.tokenId}</p> : null}
      {'body' in action ? <p className={cx(box, quote)}>{action.body}</p> : null}
      {!allowed ? (
        <Callout variant="warning" title={session.walletNetworkIssue || 'Connect your wallet to trade.'} />
      ) : null}
      <p className={muted} role="status" aria-live="polite">
        {message}
      </p>
      {prepared ? (
        <div className={box}>
          <p className={line}>{prepared.summary}</p>
          <p className={line}>
            Network fee: <strong>{formatMarketplaceAmount(prepared.fee)} XLM</strong>
          </p>
          <Address value={prepared.address} label="Signer" compact />
        </div>
      ) : null}
      {hash ? (
        <div className={box}>
          <Address
            value={hash}
            label="Transaction"
            compact
            explorerUrl={network.name !== 'local' ? getExplorerTxUrl(network.name, hash) : undefined}
          />
        </div>
      ) : null}
    </Dialog>
  );
}
