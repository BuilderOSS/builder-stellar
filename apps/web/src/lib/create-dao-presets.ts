import { configuredCreationNetwork, type DraftConfiguration } from './create-dao-schema';

type Auction = DraftConfiguration['auction'];
type Marketplace = DraftConfiguration['marketplace'];
type Governance = DraftConfiguration['governance'];

/** How people join a community. A type only switches auctions and the market on or off. */
export const MEMBERSHIP_TYPES = [
  {
    id: 'auction',
    title: 'Daily auction',
    description: 'One new token is auctioned each day. Every sale funds the treasury. The Nouns way.',
    recommended: true,
    auction: true,
    marketplace: false
  },
  {
    id: 'auction-resale',
    title: 'Auction + resale',
    description: 'Daily auctions, and members can resell their tokens to others.',
    recommended: false,
    auction: true,
    marketplace: true
  },
  {
    id: 'fixed-price',
    title: 'Fixed-price sales',
    description: 'The community lists tokens at a set price, decided by vote.',
    recommended: false,
    auction: false,
    marketplace: true
  },
  {
    id: 'invite',
    title: 'Invite only',
    description: 'No sales. Founders hand out tokens to members during Setup.',
    recommended: false,
    auction: false,
    marketplace: false
  }
] as const;

export type MembershipTypeId = (typeof MEMBERSHIP_TYPES)[number]['id'];

export function membershipTypeOf(auction: Pick<Auction, 'enabled'>, marketplace: Pick<Marketplace, 'enabled'>) {
  return MEMBERSHIP_TYPES.find((type) => type.auction === auction.enabled && type.marketplace === marketplace.enabled)!;
}

const MINUTE = 60;
const HOUR = 3600;
const DAY = 86400;

type Pace = {
  id: string;
  title: string;
  description: string;
  recommended: boolean;
  testnetOnly: boolean;
  governance: Governance;
};

const ALL_PACES: Pace[] = [
  {
    id: 'super-fast',
    title: 'Super fast',
    description: 'Votes and auctions take minutes. For trying things out on testnet.',
    recommended: false,
    testnetOnly: true,
    governance: {
      votingDelay: 5 * MINUTE,
      votingPeriod: 10 * MINUTE,
      queueDelay: 5 * MINUTE,
      quorumBps: 100,
      proposalThreshold: 1
    }
  },
  {
    id: 'fast',
    title: 'Fast',
    description: 'Votes open in 5 minutes and run an hour. For small, active groups.',
    recommended: false,
    testnetOnly: false,
    governance: {
      votingDelay: 5 * MINUTE,
      votingPeriod: HOUR,
      queueDelay: 10 * MINUTE,
      quorumBps: 500,
      proposalThreshold: 1
    }
  },
  {
    id: 'balanced',
    title: 'Balanced',
    description: 'Votes open after a day and run 3 days. A good start for most communities.',
    recommended: true,
    testnetOnly: false,
    governance: { votingDelay: DAY, votingPeriod: 3 * DAY, queueDelay: HOUR, quorumBps: 1000, proposalThreshold: 1 }
  },
  {
    id: 'deliberate',
    title: 'Deliberate',
    description: 'Votes open after 2 days and run a week. For bigger decisions and bigger groups.',
    recommended: false,
    testnetOnly: false,
    governance: { votingDelay: 2 * DAY, votingPeriod: 7 * DAY, queueDelay: DAY, quorumBps: 2000, proposalThreshold: 2 }
  }
];

/** Voting paces offered on this network; Super fast is testnet only. */
export function votingPaces(network = configuredCreationNetwork()) {
  return ALL_PACES.filter((pace) => !pace.testnetOnly || network === 'testnet');
}

export function votingPaceOf(governance: Governance, network = configuredCreationNetwork()) {
  return (
    votingPaces(network).find((pace) =>
      (Object.keys(pace.governance) as (keyof Governance)[]).every((key) => pace.governance[key] === governance[key])
    ) ?? null
  );
}

/** Super fast also makes auctions take minutes, so testers can go round the whole loop quickly. */
const QUICK_AUCTION = { duration: 5 * MINUTE, timeBuffer: MINUTE };
const STANDARD_AUCTION = { duration: DAY, timeBuffer: 15 * MINUTE };

/**
 * The patch for picking a pace: its governance values, plus quick auctions for Super fast.
 * Leaving Super fast restores standard auctions only if they are still the quick values,
 * so anything set by hand in Advanced is kept.
 */
export function applyVotingPace(pace: Pace, auction: Pick<Auction, 'duration' | 'timeBuffer'>) {
  const quick = auction.duration === QUICK_AUCTION.duration && auction.timeBuffer === QUICK_AUCTION.timeBuffer;
  return {
    governance: { ...pace.governance },
    auction: pace.id === 'super-fast' ? { ...QUICK_AUCTION } : quick ? { ...STANDARD_AUCTION } : null
  };
}
