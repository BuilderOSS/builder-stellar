import { execFileSync } from 'node:child_process';

import { timelineKeyName } from './identities.ts';

/** Testnet's native XLM Stellar Asset Contract (`stellar contract id asset --asset native`). */
export const NATIVE_SAC = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';

function invokeNative(source: string, args: string[], send: 'yes' | 'no') {
  return execFileSync(
    'stellar',
    [
      'contract',
      'invoke',
      '--id',
      NATIVE_SAC,
      '--source-account',
      source,
      '--network',
      'testnet',
      '--send',
      send,
      '--',
      ...args
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  ).trim();
}

/** An address's XLM balance in stroops, read from the native SAC (works for contracts and accounts). */
export function xlmBalance(address: string): bigint {
  const out = invokeNative(timelineKeyName('e2e-operator'), ['balance', '--id', address], 'no');
  return BigInt(JSON.parse(out) as string);
}

/**
 * Fixture setup only, never the flow under test: make sure the treasury holds at least
 * `minStroops`, topping it up from the timeline's e2e-operator with a direct SAC transfer. @matrix
 * projects run in parallel and each may try; a transfer that loses the race is fine as long as the
 * treasury ends up funded.
 */
export function ensureTreasuryFunded(treasury: string, minStroops: bigint, topUpStroops = 50_000_000n) {
  if (xlmBalance(treasury) >= minStroops) return false;
  const operator = timelineKeyName('e2e-operator');
  const from = execFileSync('stellar', ['keys', 'address', operator], { encoding: 'utf8' }).trim();
  try {
    invokeNative(operator, ['transfer', '--from', from, '--to', treasury, '--amount', String(topUpStroops)], 'yes');
  } catch (error) {
    if (xlmBalance(treasury) < minStroops) throw error;
  }
  return true;
}

/** Stroops as the app writes XLM: "10.5" for 105000000n, no trailing zeros. */
export function stroopsToXlm(stroops: bigint) {
  const whole = stroops / 10_000_000n;
  const fraction = (stroops % 10_000_000n).toString().padStart(7, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}
