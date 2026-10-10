import { decimalToStroops, formatStroops } from './auction-values';
import { formatDuration } from './duration';

export type AuctionStepType =
  | 'pause-auction'
  | 'cancel-auction'
  | 'set-auction-reserve-price'
  | 'set-auction-duration'
  | 'set-auction-time-buffer'
  | 'set-auction-min-bid-increment'
  | 'unpause-auction';

export type AuctionStep = {
  type: AuctionStepType;
  /** Input for the action handler's validate/serialize. */
  values: Record<string, string>;
  title: string;
  /** "from → to" for setting changes; empty for pause/resume. */
  detail: string;
};

export type AuctionSettings = {
  /** Reserve price in stroops (contract units). */
  reservePrice: string;
  duration: number;
  timeBuffer: number;
  minBidIncrement: number;
};

export type AuctionEdits = {
  /** Reserve price as typed, in whole asset units (e.g. "5" or "2.5"). */
  reservePrice?: string;
  duration?: number;
  timeBuffer?: number;
  minBidIncrement?: number;
};

const long = (seconds: number) => formatDuration(seconds, { style: 'long' });

/** Which edits actually differ from the live values (blank or unparsable reserve counts as unchanged). */
export function changedSettings(current: AuctionSettings, edits: AuctionEdits) {
  const reserve = edits.reservePrice?.trim();
  const reserveStroops = reserve ? decimalToStroops(reserve) : null;
  return {
    reservePrice: reserveStroops !== null && reserveStroops !== BigInt(current.reservePrice),
    duration: edits.duration !== undefined && edits.duration !== current.duration,
    timeBuffer: edits.timeBuffer !== undefined && edits.timeBuffer !== current.timeBuffer,
    minBidIncrement: edits.minBidIncrement !== undefined && edits.minBidIncrement !== current.minBidIncrement
  };
}

/**
 * The ordered steps for an auction settings change. The contract only accepts setting changes while
 * auctions are paused, so a running auction gets a pause first and (if asked) a resume last; both run
 * inside the same proposal. During setup the admin applies settings directly, with no pause/resume.
 */
export function buildAuctionChangePlan({
  live,
  paused,
  mode,
  current,
  edits,
  cancel = false,
  after,
  assetCode = ''
}: {
  live: boolean;
  paused: boolean;
  mode: 'proposal' | 'direct';
  current: AuctionSettings;
  edits: AuctionEdits;
  cancel?: boolean;
  after: 'resume' | 'keep';
  assetCode?: string;
}): AuctionStep[] {
  const changed = changedSettings(current, edits);
  const unit = assetCode ? ` ${assetCode}` : '';
  const settings: AuctionStep[] = [];
  if (changed.reservePrice)
    settings.push({
      type: 'set-auction-reserve-price',
      values: { reservePrice: edits.reservePrice!.trim() },
      title: 'Change the starting price',
      detail: `${formatStroops(current.reservePrice)}${unit} → ${edits.reservePrice!.trim()}${unit}`
    });
  if (changed.duration)
    settings.push({
      type: 'set-auction-duration',
      values: { value: String(edits.duration) },
      title: 'Change how long each auction runs',
      detail: `${long(current.duration)} → ${long(edits.duration!)}`
    });
  if (changed.timeBuffer)
    settings.push({
      type: 'set-auction-time-buffer',
      values: { value: String(edits.timeBuffer) },
      title: 'Change the late-bid extension',
      detail: `${long(current.timeBuffer)} → ${long(edits.timeBuffer!)}`
    });
  if (changed.minBidIncrement)
    settings.push({
      type: 'set-auction-min-bid-increment',
      values: { value: String(edits.minBidIncrement) },
      title: 'Change the minimum bid increase',
      detail: `${current.minBidIncrement}% → ${edits.minBidIncrement}%`
    });

  if (mode === 'direct' || !live) return settings;

  const steps: AuctionStep[] = [];
  const cancelling = cancel;
  const wantsResume = after === 'resume';
  // Anything that needs a paused auction, or an explicit choice to stop the running auction.
  const needsPause = !paused && (settings.length > 0 || cancelling || !wantsResume);
  if (needsPause) steps.push({ type: 'pause-auction', values: {}, title: 'Pause auctions', detail: '' });
  if (cancelling)
    steps.push({
      type: 'cancel-auction',
      values: {},
      title: 'Cancel the current auction',
      detail: 'Refunds the top bid and sends the token to the treasury'
    });
  steps.push(...settings);
  // Resume only if something actually stopped (this proposal's pause, or auctions already paused).
  if (wantsResume && (needsPause || paused))
    steps.push({ type: 'unpause-auction', values: {}, title: 'Resume auctions', detail: '' });
  return steps;
}
