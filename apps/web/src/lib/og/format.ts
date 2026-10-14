import type { StatusTone } from '@/lib/brand-colors';
import { proposalStateDisplay, proposalStateTone } from '@/lib/proposal-state';

const STROOPS = 10_000_000n;

/** An amount in 7-decimal base units, rounded for a card: "1,250 XLM", "0.5 USDC". */
export function formatCardAmount(baseUnits: string | bigint, code?: string): string {
  const value = BigInt(baseUnits);
  const whole = value / STROOPS;
  const fraction = Number(value % STROOPS) / Number(STROOPS);
  const number =
    whole >= 1000n
      ? new Intl.NumberFormat('en-US').format(whole)
      : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(whole) + fraction);
  return code ? `${number} ${code}` : number;
}

/** Time left as a card shows it: "2d 4h", "3h 12m", "8m", or "Ended". */
export function formatTimeLeft(endSeconds: number, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const left = endSeconds - nowSeconds;
  if (left <= 0) return 'Ended';
  const days = Math.floor(left / 86_400);
  const hours = Math.floor((left % 86_400) / 3600);
  const minutes = Math.max(1, Math.floor((left % 3600) / 60));
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address;
}

/** The status chip for a proposal state label, always a word plus a colour. */
export function proposalChip(label: string): { label: string; tone: StatusTone } {
  return { label: proposalStateDisplay(label), tone: proposalStateTone(label) };
}
