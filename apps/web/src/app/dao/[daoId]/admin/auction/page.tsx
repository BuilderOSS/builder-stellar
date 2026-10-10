'use client';

import { Client as AuctionClient } from '@builder-stellar/auction-bindings';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { useState } from 'react';
import { Stack } from 'styled-system/jsx';
import useSWR from 'swr';

import { AdminReservePriceForm } from '@/components/admin/admin-action-forms';
import { AdminProposalDraftDialog } from '@/components/admin/admin-proposal-draft-dialog';
import { AdminSurfaceNav as AdminSectionNav } from '@/components/admin/admin-surface-nav';
import { AuctionParameterControls } from '@/components/admin/auction-parameter-controls';
import { PageSection } from '@/components/page-section';
import { Badge, Button, Callout, Card, Heading, ShortId, Text } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { treasuryIsAdmin } from '@/lib/admin-proposals';
import { useContractAdmin } from '@/lib/admin-queries';
import { adminReadOptions, useAdminTokenState } from '@/lib/admin-surfaces';
import { decimalToStroops, formatStroops } from '@/lib/auction-values';
import { getActionHandler } from '@/lib/proposal-actions/registry';
import { waitForConfirmation } from '@/lib/transaction-confirmation';
import { useTransactionFeedback } from '@/lib/transaction-feedback';
import { useAdminProposalDraft } from '@/lib/use-admin-proposal-draft';
import { signWithWallet } from '@/lib/wallet-sign';
import { useAuthSessionStore } from '@/stores/auth-session-store';

type AuctionStatus = {
  status: 'not-launched' | 'paused' | 'active';
  paused: boolean;
  auction: { token_id: string; settled: boolean } | null;
  config: {
    duration: string | number;
    reserve_price: string;
    time_buffer: string | number;
    payment_token: string;
    min_bid_increment_percent: number;
  };
};
async function fetcher(url: string): Promise<AuctionStatus> {
  const response = await fetch(url, { cache: 'no-store' });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || 'Auction status unavailable');
  return payload;
}

export default function AuctionAdminPage() {
  const { daoId, daoConfig: config } = useDaoContext();
  const session = useAuthSessionStore();
  const tx = useTransactionFeedback(config.name);
  const draft = useAdminProposalDraft();
  const [busy, setBusy] = useState(false);
  const [reservePrice, setReservePrice] = useState('');
  const [message, setMessage] = useState('');
  const { data, error, mutate, isLoading } = useSWR<AuctionStatus>(
    config.auctionContractId ? `/api/dao/${encodeURIComponent(daoId)}/auctions` : null,
    fetcher
  );
  const token = useAdminTokenState(config, session.address);
  const admin = useContractAdmin(config, 'auction', session.address || config.launchAdmin);
  const direct = Boolean(session.address && admin.data === session.address);
  const canPropose = Boolean(session.address && token.data?.live && treasuryIsAdmin(config, admin.data));
  const allowed = direct || canPropose;
  const live = token.data?.live === true;
  const networkReady =
    !session.walletNetworkIssue &&
    (!session.walletNetworkPassphrase || session.walletNetworkPassphrase === config.passphrase);

  async function apply(type: 'pause-auction' | 'unpause-auction' | 'set-auction-reserve-price') {
    if (!session.address || !data || busy || !allowed || !networkReady) return;
    if (type !== 'set-auction-reserve-price' && !live) return;
    if (type === 'set-auction-reserve-price' && !data.paused) return;
    const handler = getActionHandler(type);
    const values = type === 'set-auction-reserve-price' ? { reservePrice } : {};
    const context = { config, session: { address: session.address, kit: StellarWalletsKit } };
    const validation = handler.validate(values, context);
    if (!validation.valid) return setMessage(validation.message);
    if (!direct) {
      draft.requestAdd({
        daoId,
        action: handler.serialize(values, context),
        source: `admin/auction/${type}`,
        metadata: {
          title: handler.label,
          description:
            type === 'set-auction-reserve-price'
              ? `Set reserve price to ${reservePrice}. Auction must remain paused at execution.`
              : type === 'pause-auction'
                ? 'Pause bidding and auction progression.'
                : 'Resume auction activity; this may create and mint the next auction token.',
          url: ''
        }
      });
      return;
    }
    setBusy(true);
    setMessage('');
    tx.start(handler.label);
    try {
      const client = new AuctionClient({
        ...adminReadOptions(config, config.auctionContractId, session.address),
        signTransaction: (xdr, opts) =>
          signWithWallet(xdr, {
            ...opts,
            address: session.address!,
            networkPassphrase: config.passphrase
          })
      });
      const assembled =
        type === 'pause-auction'
          ? await client.pause({ caller: session.address })
          : type === 'unpause-auction'
            ? await client.unpause({ caller: session.address })
            : await client.set_reserve_price({ reserve_price: decimalToStroops(reservePrice)! });
      const sent = await assembled.signAndSend();
      const hash = sent.sendTransactionResponse?.hash ?? '';
      tx.submitted(`${handler.label} submitted`, hash);
      await waitForConfirmation(hash, config.rpcUrl);
      tx.success(`${handler.label} confirmed`, hash);
      await mutate();
    } catch (failure) {
      tx.fail(failure, 'Auction update failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AdminProposalDraftDialog pending={draft.pending} onCancel={draft.cancel} onResolve={draft.resolve} />
      <PageSection
        title="Auction controls"
        description="Review current auction state, update paused parameters, and prepare governance actions."
      >
        <Stack gap="4">
          <AdminSectionNav daoId={daoId} active="/auction" />
          {!config.auctionContractId ? <Callout variant="info" title="No auction module configured" /> : null}
          {error || admin.error || token.error ? (
            <Callout
              variant="error"
              title="Auction controls could not be loaded"
              description={(error || admin.error || token.error).message}
            />
          ) : null}
          {isLoading || token.isLoading || admin.isLoading ? (
            <Text role="status">Loading live auction state…</Text>
          ) : null}
          <Button
            type="button"
            variant="outline"
            disabled={busy || isLoading}
            onClick={() => void Promise.all([mutate(), admin.mutate(), token.mutate()])}
          >
            Refresh live values
          </Button>
          {!allowed ? (
            <Callout
              variant="info"
              title="Read-only auction view"
              description="Connect the current admin during setup. After launch, Treasury-administered updates go through governance."
            />
          ) : null}
          {message ? (
            <div role="status">
              <Callout variant="warning" title={message} />
            </div>
          ) : null}
          {data ? (
            <>
              <Card p="5">
                <Stack gap="3">
                  <Badge>{live ? (data.paused ? 'Paused' : 'Active') : 'Setup'}</Badge>
                  <Heading style={{ fontSize: '1.2rem' }}>Current auction</Heading>
                  {data.auction ? (
                    <Text>
                      Token #{data.auction.token_id} · {data.auction.settled ? 'Settled' : 'Unsettled'}
                    </Text>
                  ) : (
                    <Text>No current auction token.</Text>
                  )}
                  {!live ? (
                    <Callout
                      variant="info"
                      title="Launch from the DAO checklist"
                      description="The Manager starts configured auctions at launch. Pause, resume and cancellation are not setup actions."
                    />
                  ) : null}
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <Button
                      type="button"
                      disabled={busy || !allowed || !live || data.paused}
                      onClick={() => void apply('pause-auction')}
                    >
                      {direct ? 'Pause auctions' : 'Propose pause'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy || !allowed || !live || !data.paused}
                      onClick={() => void apply('unpause-auction')}
                    >
                      {direct ? 'Resume auctions' : 'Propose resume'}
                    </Button>
                  </div>
                  <Text>
                    Payment asset: fixed at creation for launch validation; permanently locked by the first auction.
                  </Text>
                  <ShortId value={data.config.payment_token} label="Payment token" />
                  <Text>Current reserve: {formatStroops(data.config.reserve_price)} payment-token units.</Text>
                  <AdminReservePriceForm
                    value={{ reservePrice }}
                    onChange={(value) => setReservePrice(value.reservePrice)}
                    disabled={busy || !allowed || !data.paused}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy || !allowed || !data.paused || !reservePrice}
                    onClick={() => void apply('set-auction-reserve-price')}
                  >
                    {direct ? 'Apply reserve price' : 'Add reserve price to proposal'}
                  </Button>
                  {!data.paused ? (
                    <Text>
                      Pause auctions before changing the reserve or other parameters. These actions do not automatically
                      resume auctions.
                    </Text>
                  ) : null}
                </Stack>
              </Card>
              <AuctionParameterControls
                daoId={daoId}
                config={config}
                paused={data.paused}
                live={live}
                admin={direct}
                canPropose={canPropose}
                values={{
                  duration: Number(data.config.duration),
                  timeBuffer: Number(data.config.time_buffer),
                  increment: data.config.min_bid_increment_percent
                }}
                cancellable={Boolean(data.auction && !data.auction.settled)}
                busy={busy}
                onBusyChange={setBusy}
                refresh={mutate}
              />
            </>
          ) : null}
        </Stack>
      </PageSection>
    </>
  );
}
