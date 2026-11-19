'use client';

import { css, cx } from 'styled-system/css';

import { Address, Button, Callout, Dialog } from '@/components/ui';
import type { NetworkName } from '@/config/networks';
import { getExplorerTxUrl } from '@/lib/explorer-links';
import { formatMarketplaceAmount } from '@/lib/marketplace/amount';
import type { MarketplaceAction, MarketplacePrepared } from '@/lib/marketplace/types';

import { useMarketplaceSigner } from './use-marketplace-signer';

const line = css({ textStyle: 'body', color: 'ink', m: '0' });
export const reviewMuted = css({ textStyle: 'caption', color: 'ink.muted', m: '0' });
const quote = css({ textStyle: 'body', color: 'ink', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', m: '0' });
export const reviewBox = css({ display: 'grid', gap: '2', p: '3.5', borderRadius: 'control', bg: 'raised' });

const ACTION_TITLE: Record<MarketplaceAction['action'], string> = {
  buy: 'Buy this token',
  restock: 'Stock this pool',
  comment: 'Post your comment',
  cancel: 'Cancel your listing',
  expire: 'Return the token from an ended listing',
  approve: 'Allow the market to hold your token',
  list: 'List your token',
  revoke: 'Remove the permission',
  trustline: 'Add a USDC trustline'
};

/** The prepared summary, its network fee and, once signed, the transaction. */
export function TransactionDetails({
  prepared,
  hash,
  network
}: {
  prepared: MarketplacePrepared | null;
  hash: string;
  network: { name: NetworkName };
}) {
  return (
    <>
      {prepared ? (
        <div className={reviewBox}>
          <p className={line}>{prepared.summary}</p>
          <p className={line}>
            Network fee: <strong>{formatMarketplaceAmount(prepared.fee)} XLM</strong>
          </p>
          <Address value={prepared.address} label="Signer" compact />
        </div>
      ) : null}
      {hash ? (
        <div className={reviewBox}>
          <Address
            value={hash}
            label="Transaction"
            compact
            explorerUrl={network.name !== 'local' ? getExplorerTxUrl(network.name, hash) : undefined}
          />
        </div>
      ) : null}
    </>
  );
}

export function TradeReview({
  daoId,
  action,
  onClose,
  onConfirmed
}: {
  daoId: string;
  action: MarketplaceAction;
  onClose: () => void;
  /** Called once the transaction confirms, with its hash. */
  onConfirmed?: (hash: string) => void;
}) {
  const signer = useMarketplaceSigner(daoId);
  const { session, network, allowed, prepared, busy, message, hash, confirmed } = signer;
  async function sign() {
    const confirmedHash = await signer.sign(action);
    if (confirmedHash) onConfirmed?.(confirmedHash);
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
            <Button disabled={!allowed} loading={busy} onClick={prepared ? sign : () => void signer.prepare(action)}>
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
      {'body' in action ? <p className={cx(reviewBox, quote)}>{action.body}</p> : null}
      {!allowed ? (
        <Callout variant="warning" title={session.walletNetworkIssue || 'Connect your wallet to trade.'} />
      ) : null}
      <p className={reviewMuted} role="status" aria-live="polite">
        {message}
      </p>
      <TransactionDetails prepared={prepared} hash={hash} network={network} />
    </Dialog>
  );
}
