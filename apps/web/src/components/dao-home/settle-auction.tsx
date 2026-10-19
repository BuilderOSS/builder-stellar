'use client';

import { Client as AuctionClient } from '@builder-stellar/auction-bindings';
import { useEffect, useRef, useState } from 'react';
import { useSWRConfig } from 'swr';

import { Button, HelpTip } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { prepareBuyerAction } from '@/lib/auction-history/actions';
import { useCurrentAuction } from '@/lib/auction-history/hooks';
import { assertAuctionWallet, settlementMethod } from '@/lib/auction-history/state';
import { restoreArchivedState } from '@/lib/restore-archived-client';
import { waitForConfirmation } from '@/lib/transaction-confirmation';
import { useTransactionFeedback } from '@/lib/transaction-feedback';
import { readSigningWallet, signWithWallet } from '@/lib/wallet-sign';
import { useAuthSessionStore } from '@/stores/auth-session-store';

/** The home action uses the same live settlement preparation as the auction page. */
export function SettleAuction() {
  const { daoId, daoConfig: config } = useDaoContext();
  const session = useAuthSessionStore();
  const auction = useCurrentAuction(config, daoId);
  const { mutate } = useSWRConfig();
  const tx = useTransactionFeedback(config.name);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const ready = Boolean(
    session.address && !session.walletNetworkIssue && session.walletNetworkPassphrase === config.passphrase
  );

  async function settle() {
    if (!ready || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    const address = session.address;
    async function checkWallet() {
      if (!mounted.current) throw new Error('Tribe changed. Review its auction before signing.');
      const current = useAuthSessionStore.getState();
      assertAuctionWallet(current.address, current.walletNetworkPassphrase, address, config.passphrase);
      const [wallet, network] = await readSigningWallet();
      assertAuctionWallet(wallet.address, network.networkPassphrase, address, config.passphrase);
      if (!mounted.current) throw new Error('Tribe changed. Review its auction before signing.');
    }
    try {
      tx.start('Settling the auction');
      await checkWallet();
      const live = await auction.mutate();
      const now = Math.floor(Date.now() / 1000);
      if (!live || !settlementMethod(live, now)) throw new Error('This auction cannot be settled now.');
      const client = new AuctionClient({
        contractId: config.auctionContractId,
        rpcUrl: config.rpcUrl,
        networkPassphrase: config.passphrase,
        publicKey: address,
        allowHttp: config.name === 'local',
        ...restoreArchivedState,
        signTransaction: async (xdr, opts) => {
          await checkWallet();
          if (
            (opts?.address && opts.address !== address) ||
            (opts?.networkPassphrase && opts.networkPassphrase !== config.passphrase)
          )
            throw new Error('Unexpected signing account or network.');
          return signWithWallet(xdr, { address, networkPassphrase: config.passphrase });
        }
      });
      const assembled = await prepareBuyerAction(client, live, address, 'settle', null, now);
      const sent = await assembled.signAndSend();
      const hash = sent.sendTransactionResponse?.hash ?? '';
      tx.submitted('Settlement sent', hash);
      await waitForConfirmation(hash, config.rpcUrl);
      tx.success('Auction settled', hash);
      await Promise.all([auction.mutate(), mutate(`/api/dao/${encodeURIComponent(daoId)}/auctions`)]);
    } catch (error) {
      tx.fail(error, 'Settlement failed', 'auction');
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <>
      <Button type="button" disabled={!ready || !auction.data} loading={busy} onClick={() => void settle()}>
        {busy ? 'Settling auction' : 'Settle auction'}
      </Button>
      {!ready ? (
        <HelpTip label="Settlement">Connect a wallet on this tribe’s network to settle the auction.</HelpTip>
      ) : null}
    </>
  );
}
