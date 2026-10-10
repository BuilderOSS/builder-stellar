import { formatStroops } from '@/lib/auction-values';
import type { DashboardFeedItem, GoldskyActivityItem } from '@/lib/goldsky-queries';

type ActivityItem =
  | Pick<GoldskyActivityItem, 'event_name' | 'topics' | 'args' | 'token_id' | 'amount' | 'summary'>
  | Pick<DashboardFeedItem, 'event_name' | 'topics' | 'args' | 'token_id' | 'amount' | 'summary'>;

function parseObject(value: string | null) {
  if (!value) return {} as Record<string, unknown>;

  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {} as Record<string, unknown>;
  }
}

function firstValue(...values: unknown[]) {
  const value = values.find((candidate) => candidate !== null && candidate !== undefined && candidate !== '');
  return value === undefined ? undefined : String(value);
}

function tokenId(item: ActivityItem, topics: Record<string, unknown>, args: Record<string, unknown>) {
  return firstValue(item.token_id, topics.token_id, args.token_id);
}

function formatAuctionAmount(value: unknown) {
  if (value === null || value === undefined || value === '') return 'an unknown amount';

  try {
    return formatStroops(String(value));
  } catch {
    return String(value);
  }
}

export function formatActivitySummary(item: ActivityItem) {
  const topics = parseObject(item.topics);
  const args = parseObject(item.args);
  const eventName = (item.event_name ?? '').toLowerCase().replace(/_/g, '');
  const id = tokenId(item, topics, args);
  const token = id === undefined ? 'token unavailable' : `token ${id}`;
  const amount = firstValue(item.amount, args.amount);

  switch (eventName) {
    case 'bidplaced':
      return `Bid of ${formatAuctionAmount(amount)} placed on ${token}`;
    case 'auctioncreated':
      return `Auction created for ${token}`;
    case 'auctionsettled':
      return `Auction settled for ${token}`;
    case 'bidrefunded':
      return `Bid of ${formatAuctionAmount(amount)} refunded for ${token}`;
    case 'auctioncancelled':
      return `Auction cancelled for ${token}`;
    case 'mint':
    case 'mintwithminter': {
      const recipient = firstValue(topics.to, topics.owner, args.to, args.owner) ?? 'recipient';
      return `Minted token ${id ?? 'unavailable'} to ${recipient}`;
    }
    case 'seedgenerated':
      return `Seed generated for ${token}`;
    case 'mintbatchwithminter':
    case 'seedsgenerated': {
      // One event per batch_mint for the id range [first_token_id, first_token_id + count).
      const first = Number(firstValue(topics.first_token_id, args.first_token_id));
      const count = Number(firstValue(args.count));
      if (!Number.isFinite(first) || !Number.isFinite(count) || count < 1) return item.summary;
      const range = count === 1 ? `token ${first}` : `${count} tokens (${first}–${first + count - 1})`;
      return eventName === 'seedsgenerated' ? `Seeds generated for ${range}` : `Minted ${range}`;
    }
    case 'batchmint':
      return `Minted ${firstValue(item.amount, args.amount) ?? 'a batch of'} tokens`;
    default:
      return item.summary.replace(/\b(?:token|amount) unknown\b/gi, 'unavailable');
  }
}
