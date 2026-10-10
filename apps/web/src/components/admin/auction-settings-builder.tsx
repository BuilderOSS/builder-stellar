'use client';

import { Client as AuctionClient } from '@builder-stellar/auction-bindings';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { Pause, Play } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { css } from 'styled-system/css';

import { AdminProposalDraftDialog } from '@/components/admin/admin-proposal-draft-dialog';
import {
  ActionBar,
  AmountInput,
  Button,
  Callout,
  Checkbox,
  Chip,
  ChoiceGroup,
  DurationInput,
  FieldLabel,
  Input
} from '@/components/ui';
import { card, muted, title } from '@/components/ui/panel-styles';
import { adminReadOptions } from '@/lib/admin-surfaces';
import {
  type AuctionEdits,
  type AuctionSettings,
  type AuctionStep,
  buildAuctionChangePlan,
  changedSettings
} from '@/lib/auction-change-plan';
import { decimalToStroops, formatStroops } from '@/lib/auction-values';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { formatDuration } from '@/lib/duration';
import { getActionHandler } from '@/lib/proposal-actions/registry';
import { waitForConfirmation } from '@/lib/transaction-confirmation';
import { useTransactionFeedback } from '@/lib/transaction-feedback';
import { useAdminProposalDraft } from '@/lib/use-admin-proposal-draft';
import { signWithWallet } from '@/lib/wallet-sign';
import { useAuthSessionStore } from '@/stores/auth-session-store';

const fieldGrid = css({
  display: 'grid',
  gap: '5',
  gridTemplateColumns: { base: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }
});
const field = css({ display: 'grid', gap: '1.5', alignContent: 'start', minW: '0' });
const hintRow = css({ display: 'flex', alignItems: 'center', gap: '3', flexWrap: 'wrap' });
const hint = css({ textStyle: 'caption', color: 'ink.muted', m: '0' });
const undo = css({
  p: '0',
  bg: 'transparent',
  border: '0',
  color: 'signal',
  textStyle: 'caption',
  fontWeight: '600',
  cursor: 'pointer',
  _hover: { textDecoration: 'underline' },
  _focusVisible: { outline: '2px solid', outlineColor: 'signal', outlineOffset: '2px', borderRadius: 'sm' }
});
// The "Changed" chip fades in; it never moves, so there is nothing to reduce for motion.
const changedChip = css({
  transitionProperty: 'opacity',
  transitionDuration: 'fast',
  transitionTimingFunction: 'ease',
  '@starting-style': { opacity: '0' }
});
const planBox = css({
  display: 'grid',
  gap: '3',
  p: '4',
  borderRadius: 'control',
  boxShadow: 'inset 0 0 0 1px token(colors.signal.edge)'
});
const planTitle = css({ textStyle: 'subheading', m: '0' });
const stepList = css({ listStyle: 'none', m: '0', p: '0', display: 'grid', gap: '2', counterReset: 'step' });
// Steps arrive as edits are made: a short rise and fade, CSS only, no exit animation.
const stepRow = css({
  display: 'grid',
  gridTemplateColumns: 'auto auto minmax(0, 1fr)',
  alignItems: 'start',
  gap: '2.5',
  counterIncrement: 'step',
  opacity: '1',
  transform: 'translateY(0)',
  transitionProperty: 'opacity, transform',
  transitionDuration: '180ms',
  transitionTimingFunction: 'out',
  '@starting-style': { opacity: '0', transform: 'translateY(4px)' },
  _motionReduce: { transform: 'none', '@starting-style': { transform: 'none' } },
  _before: {
    content: 'counter(step)',
    textStyle: 'mono',
    fontSize: '0.8125rem',
    color: 'ink.muted',
    minW: '4',
    lineHeight: '1.5rem'
  }
});
const stepIcon = css({
  display: 'grid',
  placeItems: 'center',
  width: '6',
  height: '6',
  color: 'ink.muted',
  '& svg': { width: '4', height: '4' }
});
const stepText = css({ display: 'grid', gap: '0.5', minW: '0' });
const stepTitle = css({ textStyle: 'body', fontWeight: '600', color: 'ink', lineHeight: '1.5rem' });
const stepDetail = css({ textStyle: 'mono', fontSize: '0.8125rem', color: 'ink.muted', overflowWrap: 'anywhere' });
const footer = css({ display: 'flex', justifyContent: 'flex-end', gap: '2', flexWrap: 'wrap' });

function SettingField({
  now,
  showNow = true,
  changed,
  onUndo,
  children
}: {
  now: string;
  /** Off when the input already says the current value in its own helper text. */
  showNow?: boolean;
  changed: boolean;
  onUndo: () => void;
  children: ReactNode;
}) {
  return (
    <div className={field}>
      {children}
      <div className={hintRow}>
        {showNow ? <p className={hint}>Now: {now}</p> : null}
        {changed ? (
          <span className={changedChip}>
            <Chip tone="live">Changed</Chip>
          </span>
        ) : null}
        {changed ? (
          <button type="button" className={undo} onClick={onUndo}>
            Undo
          </button>
        ) : null}
      </div>
    </div>
  );
}

function stepIconFor(type: AuctionStep['type']) {
  if (type === 'pause-auction') return <Pause aria-hidden="true" strokeWidth={1.75} />;
  if (type === 'unpause-auction') return <Play aria-hidden="true" strokeWidth={1.75} />;
  return null;
}

/**
 * Change auction settings in one go. Settings only change while auctions are paused, so a running
 * auction gets "pause" first and, if chosen, "resume" last, all inside the same proposal.
 */
export function AuctionSettingsBuilder({
  daoId,
  config,
  live,
  paused,
  current,
  assetCode,
  currentTokenId,
  cancellable,
  direct,
  canPropose,
  busy,
  onBusyChange: setBusy,
  refresh
}: {
  daoId: string;
  config: DaoNetworkConfig;
  live: boolean;
  paused: boolean;
  current: AuctionSettings;
  assetCode: string;
  currentTokenId?: string;
  cancellable: boolean;
  /** The connected wallet is the auction admin (setup): apply directly instead of proposing. */
  direct: boolean;
  canPropose: boolean;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  refresh: () => Promise<unknown>;
}) {
  const session = useAuthSessionStore();
  const draft = useAdminProposalDraft();
  const tx = useTransactionFeedback(config.name);
  const [edits, setEdits] = useState<AuctionEdits>({});
  const [cancel, setCancel] = useState(false);
  // Default to leaving auctions as they are now: running auctions resume, paused ones stay paused.
  const [after, setAfter] = useState<'resume' | 'keep'>(paused ? 'keep' : 'resume');
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState('');

  const mode = direct ? 'direct' : 'proposal';
  const canAct = direct || canPropose;
  const disabled = busy || !canAct;
  const networkReady =
    !session.walletNetworkIssue &&
    (!session.walletNetworkPassphrase || session.walletNetworkPassphrase === config.passphrase);
  const changed = changedSettings(current, edits);
  const steps = buildAuctionChangePlan({
    live,
    paused,
    mode,
    current,
    edits,
    cancel: cancel && cancellable,
    after,
    assetCode
  });
  const reserveInvalid = Boolean(edits.reservePrice?.trim()) && decimalToStroops(edits.reservePrice!) === null;
  const unit = assetCode ? ` ${assetCode}` : '';
  const long = (seconds: number) => formatDuration(seconds, { style: 'long' });
  const set = (patch: AuctionEdits) => {
    setMessage('');
    setEdits((previous) => ({ ...previous, ...patch }));
  };
  const reset = (key: keyof AuctionEdits) =>
    setEdits((previous) => {
      const next = { ...previous };
      delete next[key];
      return next;
    });
  const context = { config, session: { address: session.address, kit: StellarWalletsKit } };

  function validate() {
    for (const step of steps) {
      const result = getActionHandler(step.type).validate(step.values, context);
      if (!result.valid) {
        setMessage(result.message);
        return false;
      }
    }
    return true;
  }

  function addToProposal() {
    if (!steps.length || !validate()) return;
    draft.requestAddBatch({
      daoId,
      requests: steps.map((step) => ({
        daoId,
        action: getActionHandler(step.type).serialize(step.values, context),
        source: `admin/auction/${step.type}`,
        metadata: {
          title: step.title,
          description: step.detail ? `${step.title}: ${step.detail}.` : `${step.title}.`,
          url: ''
        }
      })),
      onAdded: () => {
        setEdits({});
        setCancel(false);
      }
    });
  }

  async function applyDirectly() {
    if (!session.address || !steps.length || !networkReady || !validate()) return;
    setBusy(true);
    setMessage('');
    const client = new AuctionClient({
      ...adminReadOptions(config, config.auctionContractId, session.address),
      signTransaction: (xdr, opts) =>
        signWithWallet(xdr, { ...opts, address: session.address!, networkPassphrase: config.passphrase })
    });
    try {
      for (const [index, step] of steps.entries()) {
        const label = steps.length > 1 ? `${step.title} (step ${index + 1} of ${steps.length})` : step.title;
        setProgress(label);
        tx.start(label);
        const assembled =
          step.type === 'set-auction-reserve-price'
            ? await client.set_reserve_price({ reserve_price: decimalToStroops(step.values.reservePrice)! })
            : step.type === 'set-auction-duration'
              ? await client.set_duration({ duration: BigInt(step.values.value) })
              : step.type === 'set-auction-time-buffer'
                ? await client.set_time_buffer({ time_buffer: BigInt(step.values.value) })
                : await client.set_min_bid_increment({ min_bid_increment_percent: Number(step.values.value) });
        const sent = await assembled.signAndSend();
        const hash = sent.sendTransactionResponse?.hash ?? '';
        tx.submitted(`${step.title} submitted`, hash);
        await waitForConfirmation(hash, config.rpcUrl);
        tx.success(`${step.title} confirmed`, hash);
        // Drop the edit that just landed, so a later failure leaves only what still needs doing.
        const key = (
          {
            'set-auction-reserve-price': 'reservePrice',
            'set-auction-duration': 'duration',
            'set-auction-time-buffer': 'timeBuffer',
            'set-auction-min-bid-increment': 'minBidIncrement'
          } as const
        )[step.type as 'set-auction-duration'];
        if (key) reset(key);
      }
    } catch (failure) {
      tx.fail(failure, 'Auction update failed');
    } finally {
      setProgress('');
      setBusy(false);
      await refresh();
    }
  }

  const submitLabel = direct
    ? steps.length
      ? `Apply ${steps.length} ${steps.length === 1 ? 'change' : 'changes'}`
      : 'Apply changes'
    : steps.length
      ? `Add ${steps.length} ${steps.length === 1 ? 'step' : 'steps'} to your proposal`
      : 'Add to your proposal';
  const submit = (
    <Button
      type="button"
      disabled={disabled || !steps.length || reserveInvalid || (direct && !networkReady)}
      loading={busy && Boolean(progress)}
      onClick={() => (direct ? void applyDirectly() : addToProposal())}
    >
      {submitLabel}
    </Button>
  );

  return (
    <>
      <AdminProposalDraftDialog pending={draft.pending} onCancel={draft.cancel} onResolve={draft.resolve} />
      <section className={card} aria-labelledby="auction-settings-title">
        <div>
          <h2 id="auction-settings-title" className={title}>
            Change auction settings
          </h2>
          <p className={muted}>
            {direct
              ? 'During setup, changes apply right away. Each one is its own signature.'
              : live
                ? 'Auctions pause while their settings change. We add the pause and resume steps for you.'
                : 'These go into a proposal for members to vote on.'}
          </p>
        </div>

        <div className={fieldGrid}>
          <SettingField
            now={`${formatStroops(current.reservePrice)}${unit}`}
            changed={changed.reservePrice}
            onUndo={() => reset('reservePrice')}
          >
            <FieldLabel htmlFor="auction-reserve-price">Starting price</FieldLabel>
            <AmountInput
              id="auction-reserve-price"
              unit={assetCode || 'units'}
              placeholder={formatStroops(current.reservePrice)}
              value={edits.reservePrice ?? ''}
              disabled={disabled}
              aria-invalid={reserveInvalid || undefined}
              onChange={(event) => set({ reservePrice: event.target.value })}
            />
          </SettingField>
          <SettingField
            now={`${current.minBidIncrement}%`}
            changed={changed.minBidIncrement}
            onUndo={() => reset('minBidIncrement')}
          >
            <FieldLabel htmlFor="auction-min-increment">Minimum bid increase (%)</FieldLabel>
            <Input
              id="auction-min-increment"
              name="auction-min-increment"
              type="number"
              inputMode="numeric"
              autoComplete="off"
              min={1}
              max={100}
              step={1}
              value={edits.minBidIncrement ?? current.minBidIncrement}
              disabled={disabled}
              onChange={(event) =>
                set({ minBidIncrement: Number.isFinite(event.target.valueAsNumber) ? event.target.valueAsNumber : 0 })
              }
            />
          </SettingField>
          <SettingField
            now={long(current.duration)}
            showNow={false}
            changed={changed.duration}
            onUndo={() => reset('duration')}
          >
            <DurationInput
              id="auction-duration"
              label="Each auction runs for"
              value={edits.duration ?? current.duration}
              disabled={disabled}
              showSeconds={false}
              helperText={`Now: ${long(current.duration)}. Between 5 minutes and 30 days.`}
              onChange={(duration) => set({ duration })}
            />
          </SettingField>
          <SettingField
            now={long(current.timeBuffer)}
            showNow={false}
            changed={changed.timeBuffer}
            onUndo={() => reset('timeBuffer')}
          >
            <DurationInput
              id="auction-time-buffer"
              label="A late bid adds"
              value={edits.timeBuffer ?? current.timeBuffer}
              disabled={disabled}
              helperText={`Now: ${long(current.timeBuffer)}. Up to 1 day; bids near the end extend the auction so everyone gets a fair chance.`}
              onChange={(timeBuffer) => set({ timeBuffer })}
            />
          </SettingField>
        </div>

        {live && !direct && cancellable ? (
          <Checkbox
            label="Also cancel the current auction"
            description={`Refunds the top bid${currentTokenId ? ` and sends token #${currentTokenId}` : ' and sends its token'} to the treasury.`}
            checked={cancel}
            disabled={disabled}
            onCheckedChange={setCancel}
          />
        ) : null}

        {live && !direct ? (
          <ChoiceGroup
            label="When the changes are done"
            value={after}
            disabled={disabled}
            onValueChange={(value) => setAfter(value as 'resume' | 'keep')}
            options={[
              { value: 'resume', label: 'Resume auctions', description: 'Bidding restarts with the new settings.' },
              { value: 'keep', label: 'Keep auctions paused', description: 'Resume later with its own vote.' }
            ]}
          />
        ) : null}

        <div className={planBox} aria-live="polite">
          <h3 className={planTitle}>{direct ? 'This will' : 'If the proposal passes, it will'}</h3>
          {steps.length ? (
            <ol className={stepList}>
              {steps.map((step) => (
                <li key={step.type} className={stepRow}>
                  <span className={stepIcon}>{stepIconFor(step.type)}</span>
                  <span className={stepText}>
                    <span className={stepTitle}>{step.title}</span>
                    {step.detail ? <span className={stepDetail}>{step.detail}</span> : null}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className={hint}>
              {live && !direct
                ? 'Change a setting, or choose what happens to auctions, to build a proposal.'
                : 'Change a setting to see what will happen.'}
            </p>
          )}
        </div>

        {message ? <Callout variant="warning" title={message} role="alert" /> : null}
        {progress ? (
          <p className={hint} role="status">
            {progress}…
          </p>
        ) : null}

        <div className={footer}>{submit}</div>
      </section>
      {steps.length ? <ActionBar mobileOnly>{submit}</ActionBar> : null}
    </>
  );
}
