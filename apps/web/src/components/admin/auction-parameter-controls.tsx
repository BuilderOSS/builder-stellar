'use client';

import { Client as AuctionClient } from '@builder-stellar/auction-bindings';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { useState } from 'react';
import { Stack } from 'styled-system/jsx';

import { AdminProposalDraftDialog } from '@/components/admin/admin-proposal-draft-dialog';
import { DurationInput } from '@/components/admin/duration-input';
import { Button, Callout, Card, Heading, Input, Text } from '@/components/ui';
import { adminReadOptions } from '@/lib/admin-surfaces';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { getActionHandler } from '@/lib/proposal-actions/registry';
import { waitForConfirmation } from '@/lib/transaction-confirmation';
import { useTransactionFeedback } from '@/lib/transaction-feedback';
import { useAdminProposalDraft } from '@/lib/use-admin-proposal-draft';
import { signWithWallet } from '@/lib/wallet-sign';
import { useAuthSessionStore } from '@/stores/auth-session-store';

type Setting = 'set-auction-duration' | 'set-auction-time-buffer' | 'set-auction-min-bid-increment';
export function AuctionParameterControls({
  daoId,
  config,
  paused,
  live,
  admin,
  canPropose,
  values,
  cancellable,
  busy,
  onBusyChange: setBusy,
  refresh
}: {
  daoId: string;
  config: DaoNetworkConfig;
  paused: boolean;
  live: boolean;
  admin: boolean;
  canPropose: boolean;
  values: { duration: number; timeBuffer: number; increment: number };
  cancellable: boolean;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  refresh: () => Promise<unknown>;
}) {
  const session = useAuthSessionStore();
  const draft = useAdminProposalDraft();
  const tx = useTransactionFeedback(config.name);
  const [edits, setEdits] = useState<Partial<Record<Setting, string>>>({});
  const [message, setMessage] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const networkReady =
    !session.walletNetworkIssue &&
    (!session.walletNetworkPassphrase || session.walletNetworkPassphrase === config.passphrase);
  const context = { config, session: { address: session.address, kit: StellarWalletsKit } };
  const settings = [
    { type: 'set-auction-duration' as const, label: 'Auction duration', value: values.duration },
    { type: 'set-auction-time-buffer' as const, label: 'Time buffer', value: values.timeBuffer },
    { type: 'set-auction-min-bid-increment' as const, label: 'Minimum bid increment (%)', value: values.increment }
  ];
  async function apply(type: Setting | 'cancel-auction', label: string) {
    if (!session.address || busy || !paused || !networkReady || (!admin && !canPropose)) return;
    if (type === 'cancel-auction' && (!live || !cancellable)) return;
    const handler = getActionHandler(type);
    const data = type === 'cancel-auction' ? {} : { value: edits[type] ?? '' };
    const validation = handler.validate(data, context);
    if (!validation.valid) return setMessage(validation.message);
    if (!admin) {
      draft.requestAdd({
        daoId,
        action: handler.serialize(data, context),
        source: `admin/auction/${type}`,
        metadata: {
          title: label,
          description:
            type === 'cancel-auction'
              ? 'Cancel the paused auction, refund its highest bid and transfer its unsold NFT to Treasury.'
              : `${label}: ${edits[type]}. Requires the auction to remain paused at execution.`,
          url: ''
        }
      });
      setConfirmCancel(false);
      return;
    }
    setBusy(true);
    setMessage('');
    tx.start(label);
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
      const value = Number(type === 'cancel-auction' ? 0 : edits[type]);
      const assembled =
        type === 'cancel-auction'
          ? await client.cancel_auction()
          : type === 'set-auction-duration'
            ? await client.set_duration({ duration: BigInt(value) })
            : type === 'set-auction-time-buffer'
              ? await client.set_time_buffer({ time_buffer: BigInt(value) })
              : await client.set_min_bid_increment({ min_bid_increment_percent: value });
      const sent = await assembled.signAndSend();
      const hash = sent.sendTransactionResponse?.hash ?? '';
      tx.submitted(`${label} submitted`, hash);
      await waitForConfirmation(hash, config.rpcUrl);
      tx.success(`${label} confirmed`, hash);
      setConfirmCancel(false);
      await refresh();
    } catch (error) {
      tx.fail(error, `${label} failed`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <AdminProposalDraftDialog pending={draft.pending} onCancel={draft.cancel} onResolve={draft.resolve} />
      <Card p="5">
        <Stack gap="4">
          <Heading size="heading">Auction parameters</Heading>
          <Text>
            Changes require a paused auction. Proposal execution checks the state again; pause first, then return here.
          </Text>
          {!paused ? <Callout variant="info" title="Pause auctions to change parameters" /> : null}
          {settings.map(({ type, label, value }) => (
            <Stack key={type} gap="2">
              <Text>
                Current {label.toLowerCase()}: {value}
                {type === 'set-auction-min-bid-increment' ? '%' : ' seconds'}
              </Text>
              {type === 'set-auction-min-bid-increment' ? (
                <label htmlFor="auction-min-increment">
                  Minimum bid increment (%)
                  <Input
                    id="auction-min-increment"
                    name="auction-min-increment"
                    autoComplete="off"
                    type="number"
                    min={1}
                    max={100}
                    step={1}
                    value={edits[type] ?? String(value)}
                    disabled={busy || !paused || (!admin && !canPropose)}
                    onChange={(event) => setEdits((current) => ({ ...current, [type]: event.target.value }))}
                  />
                </label>
              ) : (
                <DurationInput
                  id={type}
                  label={label}
                  value={Number(edits[type] ?? value)}
                  disabled={busy || !paused || (!admin && !canPropose)}
                  onChange={(next) => setEdits((current) => ({ ...current, [type]: String(next) }))}
                  helperText={
                    type === 'set-auction-duration'
                      ? '5 minutes to 30 days.'
                      : '1 second to 1 day. Extends an auction when a bid arrives near its end.'
                  }
                />
              )}
              <Button
                type="button"
                variant="secondary"
                disabled={
                  busy ||
                  !paused ||
                  !networkReady ||
                  (!admin && !canPropose) ||
                  !edits[type] ||
                  Number(edits[type]) === value
                }
                onClick={() => void apply(type, label)}
              >
                {admin ? 'Apply' : 'Add to proposal'}
              </Button>
            </Stack>
          ))}
          <Heading size="heading">Cancel current auction</Heading>
          <Text>
            Cancellation refunds the highest bid (or records a withdrawable refund if transfer fails) and sends the
            unsold NFT to Treasury. It does not resume auctions.
          </Text>
          {confirmCancel ? (
            <div role="group" aria-label="Confirm auction cancellation">
              <Callout variant="warning" title="Cancel this paused, unsettled auction?" />
              <Button
                type="button"
                disabled={busy || !paused || !networkReady || !live || !cancellable || (!admin && !canPropose)}
                onClick={() => void apply('cancel-auction', 'Cancel auction')}
              >
                {admin ? 'Confirm cancellation' : 'Add cancellation to proposal'}
              </Button>
              <Button type="button" variant="ghost" disabled={busy} onClick={() => setConfirmCancel(false)}>
                Keep auction
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="secondary"
              disabled={busy || !paused || !live || !cancellable || (!admin && !canPropose)}
              onClick={() => setConfirmCancel(true)}
            >
              Review cancellation
            </Button>
          )}
          {!cancellable ? <Text>No unsettled auction is available to cancel.</Text> : null}
          {message ? (
            <div role="status">
              <Callout variant="warning" title={message} />
            </div>
          ) : null}
        </Stack>
      </Card>
    </>
  );
}
