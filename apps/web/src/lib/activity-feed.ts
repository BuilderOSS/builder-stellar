import { formatStroops } from '@/lib/auction-values';
import type { DashboardFeedItem, GoldskyActivityItem } from '@/lib/goldsky-queries';
import { parseProposalMetadata } from '@/lib/proposal-metadata';

type ActivityItem =
  | Pick<GoldskyActivityItem, 'event_name' | 'topics' | 'args' | 'token_id' | 'amount' | 'summary' | 'title'>
  | Pick<DashboardFeedItem, 'event_name' | 'topics' | 'args' | 'token_id' | 'amount' | 'summary' | 'title'>;
type LinkableItem = ActivityItem & { proposal_id?: string | null };

export type ActivityCategory = 'Governance' | 'Auction' | 'Market' | 'Membership' | 'DAO';

/** A feed row written for people: what happened, to what, by whom. */
export type FormattedActivity = {
  category: ActivityCategory;
  /** One plain sentence, e.g. "Bid 120 on #30". */
  title: string;
  /** Optional second line with the supporting detail. */
  detail?: string;
  /** Path inside the DAO (proposal, auction, marketplace) when one applies. */
  href?: string;
};

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

/** `GCLG…U6CO`: enough to recognise an account without a 56-character wall. */
export function shortAddress(value: string | undefined) {
  if (!value) return 'someone';
  return /^[GC][A-Z2-7]{55}$/.test(value) ? `${value.slice(0, 4)}…${value.slice(-4)}` : value;
}

/** Payment amounts are SAC base units with 7 decimals (XLM, USDC). */
function amount(value: string | undefined) {
  if (!value || !/^\d+$/.test(value)) return undefined;
  try {
    return formatStroops(value);
  } catch {
    return undefined;
  }
}

const VOTES = ['Against', 'For', 'Abstain'];

export function formatActivity(item: LinkableItem, daoId?: string): FormattedActivity {
  const topics = parseObject(item.topics);
  const args = parseObject(item.args);
  const event = (item.event_name ?? '').toLowerCase().replace(/_/g, '');
  const token = firstValue(item.token_id, topics.token_id, args.token_id);
  const tokenLabel = token === undefined ? 'a token' : `#${token}`;
  const value = amount(firstValue(item.amount, args.amount, args.price));
  const base = daoId ? `/dao/${daoId}` : undefined;
  const proposalId = firstValue(item.proposal_id, topics.proposal_id);
  const proposalHref = base && proposalId ? `${base}/proposals/${proposalId}` : undefined;
  const auctionHref = base ? `${base}/auctions` : undefined;
  const marketHref = base ? `${base}/marketplace` : undefined;

  switch (event) {
    case 'proposalcreated': {
      const title = parseProposalMetadata(firstValue(args.description) ?? '').title;
      return {
        category: 'Governance',
        title: `New proposal: ${title}`,
        detail: `Proposed by ${shortAddress(firstValue(topics.proposer))}`,
        href: proposalHref
      };
    }
    case 'votecast': {
      const support = VOTES[Number(firstValue(args.vote_type, args.support))] ?? 'on';
      const weight = firstValue(args.weight);
      const reason = firstValue(args.reason);
      return {
        category: 'Governance',
        title: `${shortAddress(firstValue(topics.voter))} voted ${support}${weight ? ` with ${weight} vote${weight === '1' ? '' : 's'}` : ''}`,
        detail: reason ? `“${reason}”` : undefined,
        href: proposalHref
      };
    }
    case 'proposalqueued':
      return { category: 'Governance', title: 'Proposal passed and queued for execution', href: proposalHref };
    case 'proposalexecuted':
      return { category: 'Governance', title: 'Proposal executed', href: proposalHref };
    case 'proposalcancelled':
      return { category: 'Governance', title: 'Proposal cancelled', href: proposalHref };
    case 'delegatechanged':
      return {
        category: 'Governance',
        title: `${shortAddress(firstValue(topics.delegator))} delegated votes to ${shortAddress(firstValue(args.to_delegate))}`
      };
    case 'auctioncreated':
      return { category: 'Auction', title: `Auction started for ${tokenLabel}`, href: auctionHref };
    case 'bidplaced':
      return {
        category: 'Auction',
        title: `${shortAddress(firstValue(topics.bidder))} bid ${value ?? 'on'}${value ? ` on ${tokenLabel}` : ` ${tokenLabel}`}`,
        href: auctionHref
      };
    case 'auctionsettled': {
      const winner = firstValue(topics.winner, args.winner);
      return {
        category: 'Auction',
        title: winner
          ? `${tokenLabel} won by ${shortAddress(winner)}${value ? ` for ${value}` : ''}`
          : `${tokenLabel} closed with no bids; it went to the treasury`,
        href: auctionHref
      };
    }
    case 'auctioncancelled':
      return { category: 'Auction', title: `Auction for ${tokenLabel} cancelled`, href: auctionHref };
    case 'primarylistingcreated':
      return { category: 'Market', title: `New token offered for ${value ?? 'sale'}`, href: marketHref };
    case 'primarylistingpurchased':
      return {
        category: 'Market',
        title: `${shortAddress(firstValue(topics.buyer))} bought new token ${tokenLabel}${value ? ` for ${value}` : ''}`,
        href: marketHref
      };
    case 'secondarylistingcreated':
      return { category: 'Market', title: `${tokenLabel} listed${value ? ` for ${value}` : ''}`, href: marketHref };
    case 'listingpurchased':
      return {
        category: 'Market',
        title: `${shortAddress(firstValue(topics.buyer))} bought ${tokenLabel}${value ? ` for ${value}` : ''}`,
        href: marketHref
      };
    case 'mintbatchwithminter': {
      const count = Number(firstValue(args.count));
      const first = Number(firstValue(topics.first_token_id, args.first_token_id));
      const range =
        Number.isFinite(count) && Number.isFinite(first) && count > 0
          ? count === 1
            ? `#${first}`
            : `#${first}–#${first + count - 1}`
          : undefined;
      return {
        category: 'Membership',
        title: `${Number.isFinite(count) && count > 0 ? count : 'Several'} tokens allocated`,
        detail: range ? `Tokens ${range}` : undefined
      };
    }
    case 'merkleclaimevent':
    case 'allowlistclaimevent':
      return {
        category: 'Membership',
        title: `${shortAddress(firstValue(topics.recipient, args.recipient))} claimed ${firstValue(item.amount, args.amount) ?? 'their'} token${firstValue(item.amount, args.amount) === '1' ? '' : 's'}`
      };
    case 'mintbatchevent':
      return {
        category: 'Membership',
        title: `${firstValue(args.total_amount, item.amount) ?? 'Tokens'} tokens allocated to ${firstValue(args.recipient_count) ?? 'several'} members`
      };
    case 'daolaunched':
      return { category: 'DAO', title: 'The DAO launched' };
    case 'upgraded':
      return {
        category: 'DAO',
        title: `Contract upgraded to version ${firstValue(args.version) ?? 'unknown'}`,
        detail: 'Verify the new code hash before trusting the release.'
      };
    default:
      return { category: 'DAO', title: item.title, detail: item.summary };
  }
}

/** Backwards-compatible one-line summary. */
export function formatActivitySummary(item: LinkableItem) {
  const formatted = formatActivity(item);
  return formatted.detail ? `${formatted.title} · ${formatted.detail}` : formatted.title;
}

/** "just now", "12m ago", "3h ago", "2d ago", then a date. */
export function relativeTime(value: string | number | null, now = Date.now()) {
  if (value === null || value === '') return '';
  const numeric = Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric > 1_000_000_000_000 ? numeric : numeric * 1000)
    : new Date(value);
  const time = date.getTime();
  if (Number.isNaN(time)) return '';
  const seconds = Math.max(0, Math.round((now - time) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 7 * 86_400) return `${Math.floor(seconds / 86_400)}d ago`;
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(date);
}
