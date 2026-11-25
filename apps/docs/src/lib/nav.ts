// The information architecture (docs/plans/walkthroughs-and-docs.md §5.2), in reading
// order. It drives the sidebar, the mobile nav sheet, Previous and Next links, the
// home page and static params. Every page here has content/<slug>.mdx (nav.test.ts).

export type DocPage = {
  /** URL path without slashes at either end, and the content file name. */
  slug: string;
  title: string;
  /** One line under the title, and the search and meta description. */
  summary: string;
};

export type DocSection = {
  id: string;
  title: string;
  /** Shown under the section heading on its landing list. */
  intro?: string;
  pages: DocPage[];
};

const guide = (area: string, page: string, title: string, summary: string): DocPage => ({
  slug: `guides/${area}/${page}`,
  title,
  summary
});

export const NAV: DocSection[] = [
  {
    id: 'start',
    title: 'Start here',
    pages: [
      {
        slug: 'start/what-is-tribe-builder',
        title: 'What is Tribe Builder',
        summary: 'Software for groups that hold funds and make decisions together.'
      },
      { slug: 'start/whats-a-tribe', title: 'What’s a tribe', summary: 'A DAO, explained in plain words.' },
      {
        slug: 'start/first-10-minutes',
        title: 'Your first 10 minutes',
        summary: 'Get a wallet, connect, join a tribe, and vote.'
      },
      {
        slug: 'start/build-your-first-tribe',
        title: 'Build your first tribe',
        summary: 'A short overview of the steps, with links to each guide.'
      }
    ]
  },
  {
    id: 'concepts',
    title: 'Concepts',
    intro: 'Plain words first, then the DAO term.',
    pages: [
      {
        slug: 'concepts/tribes-and-daos',
        title: 'Tribes and DAOs',
        summary: 'What a tribe is, and what makes it a DAO.'
      },
      {
        slug: 'concepts/wallets-and-stellar',
        title: 'Wallets and Stellar basics',
        summary: 'Accounts, XLM, fees, testnet and mainnet, signing and submitting.'
      },
      {
        slug: 'concepts/membership-tokens',
        title: 'Membership tokens',
        summary: 'Each membership is an NFT with one vote, art, and traits.'
      },
      {
        slug: 'concepts/votes-and-delegation',
        title: 'Votes and delegation',
        summary: 'How votes are counted and delegated, and why voting power is fixed when a proposal is made.'
      },
      {
        slug: 'concepts/proposals',
        title: 'Proposals',
        summary: 'The lifecycle, threshold, quorum, voting period, and safety delay.'
      },
      {
        slug: 'concepts/treasury',
        title: 'The Treasury',
        summary: 'Who can move funds, and why no single person can.'
      },
      {
        slug: 'concepts/modules',
        title: 'Modules',
        summary: 'Auctions, the market, and claims: how modules are added, removed, and capped.'
      },
      {
        slug: 'concepts/setup-and-launch',
        title: 'Setup versus launched',
        summary: 'The launch admin, and what “Requires DAO governance” means.'
      },
      {
        slug: 'concepts/vote-sources',
        title: 'Vote sources',
        summary: 'Token-weighted votes, approved adapters, and NQG (planned).'
      },
      {
        slug: 'concepts/upgrades',
        title: 'Upgrades',
        summary: 'Upgradability, the Manager, upgrade notices, revocation, and who decides.'
      },
      {
        slug: 'concepts/storage-and-renewal',
        title: 'Storage and renewal',
        summary: 'What expires on chain, and who renews it.'
      },
      {
        slug: 'concepts/safety-and-security',
        title: 'Safety and security model',
        summary: 'What the contracts enforce, what the platform can and can’t do, and what to check.'
      }
    ]
  },
  {
    id: 'guides',
    title: 'Guides',
    intro: 'One guide for each thing you can do in the app.',
    pages: [
      guide('create', 'identity', 'Create a tribe: identity', 'Name, symbol, image, and description.'),
      guide('create', 'membership', 'Create a tribe: membership', 'How people join: auctions, sales, or invites.'),
      guide('create', 'voting', 'Create a tribe: voting rules', 'How long decisions take, and what can change later.'),
      guide(
        'create',
        'review-and-deploy',
        'Create a tribe: review and create',
        'Check every setting, then create the tribe.'
      ),
      guide('setup', 'artwork', 'Set up: artwork', 'Upload the layers your tokens are drawn from.'),
      guide('setup', 'founders', 'Set up: founders', 'Tokens for the people starting the tribe.'),
      guide('setup', 'slug', 'Set up: your link', 'Choose an available link for people to share.'),
      guide('setup', 'contracts', 'Set up: contracts', 'Review the contracts your tribe runs on.'),
      guide('setup', 'launch', 'Launch your tribe', 'Pass control of every setting to the tribe.'),
      guide('setup', 'assurance-drives', 'Assurance drives', 'Launch only when enough people commit.'),
      guide('proposals', 'write', 'Write a proposal', 'Explain the reason, then add the actions.'),
      guide('proposals', 'actions', 'Choose actions', 'Payments, settings, and the other action groups.'),
      guide('proposals', 'vote', 'Vote', 'For, Against, or Abstain, with a reason.'),
      guide('proposals', 'queue-and-execute', 'Queue and execute', 'After a vote passes and the safety delay ends.'),
      guide('proposals', 'cancel', 'Cancel a proposal', 'Who can cancel, and when.'),
      guide('auctions', 'bid', 'Bid in an auction', 'Place a bid, and what happens if you’re outbid.'),
      guide('auctions', 'settle', 'Settle an auction', 'End an auction and start the next.'),
      guide('auctions', 'refunds', 'Auction refunds', 'How to get your XLM back.'),
      guide('auctions', 'settings', 'Auction settings', 'Reserve price, duration, and increments.'),
      guide('marketplace', 'sell', 'Sell a token', 'Approve, then list.'),
      guide('marketplace', 'buy', 'Buy a token', 'Buy a listed membership.'),
      guide('marketplace', 'cancel', 'Cancel a listing', 'Remove a token from sale.'),
      guide(
        'marketplace',
        'pools',
        'Marketplace pools',
        'Buy a new membership from a quick-buy pool, and how a pool is opened and restocked.'
      ),
      guide('marketplace', 'treasury-purchases', 'Treasury purchases', 'The tribe buys through a proposal.'),
      guide('claims', 'create', 'Make a claim list', 'Who can claim, and how much.'),
      guide('claims', 'claim', 'Claim', 'Receive what a claim list holds for you.'),
      guide('claims', 'refund', 'Claim refunds', 'What happens to unclaimed funds.'),
      guide('members', 'find', 'Find members', 'The member directory and profiles.'),
      guide('members', 'delegate', 'Delegate your votes', 'Let someone else vote with your tokens.'),
      guide('members', 'transfer', 'Transfer a token', 'Send a membership to another wallet.'),
      guide('members', 'approvals', 'Approvals', 'Let a contract or person move a token for you.'),
      guide('manage', 'profile', 'Manage: profile', 'Name, image, description, and links.'),
      guide('manage', 'token', 'Manage: token', 'Token settings after launch.'),
      guide('manage', 'governance', 'Manage: governance', 'Voting rules, changed by vote.'),
      guide('manage', 'auction', 'Manage: auction', 'Auction settings, changed by vote.'),
      guide('manage', 'marketplace', 'Manage: marketplace', 'Marketplace settings, changed by vote.'),
      guide('legal', 'export', 'Legal entity export', 'Prepare a bundle for MIDAO.'),
      guide('platform', 'operators', 'Running the platform', 'The platform page, for operators.')
    ]
  },
  {
    id: 'reference',
    title: 'Reference',
    pages: [
      {
        slug: 'reference/glossary',
        title: 'Glossary',
        summary: 'Every term, in plain words with the DAO term beneath.'
      },
      {
        slug: 'reference/proposal-actions',
        title: 'Proposal actions',
        summary: 'Every action a proposal can run.'
      },
      {
        slug: 'reference/limits-and-timings',
        title: 'Limits and timings',
        summary: 'Minimum and maximum values, and waiting times.'
      },
      { slug: 'reference/error-messages', title: 'Error messages', summary: 'What each error means and what to do.' },
      {
        slug: 'reference/contract-addresses',
        title: 'Contract addresses',
        summary: 'The contracts on each network.'
      },
      { slug: 'reference/faq', title: 'FAQ', summary: 'Common questions and answers.' },
      {
        slug: 'reference/troubleshooting',
        title: 'Troubleshooting',
        summary: 'What to check when something does not work.'
      },
      { slug: 'reference/changelog', title: 'Changelog', summary: 'What changed, and when.' }
    ]
  }
];

/** Every page in reading order, with its section. */
export const PAGES: Array<DocPage & { section: DocSection }> = NAV.flatMap((section) =>
  section.pages.map((page) => ({ ...page, section }))
);

export function pageHref(slug: string): string {
  return `/${slug}/`;
}

export function findPage(slug: string) {
  return PAGES.find((page) => page.slug === slug);
}

/** Previous and next pages in reading order, for the links at the foot of every page. */
export function neighbours(slug: string) {
  const index = PAGES.findIndex((page) => page.slug === slug);
  return {
    previous: index > 0 ? PAGES[index - 1] : undefined,
    next: index >= 0 && index < PAGES.length - 1 ? PAGES[index + 1] : undefined
  };
}

/** The two paths on the home page (decision 1A). Each opens an ordered sequence of guides. */
export const PATHS = [
  {
    title: 'I’m joining a tribe',
    meta: 'Connect, bid, vote, and delegate',
    slug: 'start/first-10-minutes'
  },
  {
    title: 'I’m starting a tribe',
    meta: 'Create, set up, and launch a tribe, then hold its first vote',
    slug: 'start/build-your-first-tribe'
  }
] as const;

/** The core ideas row on the home page. */
export const CORE_IDEAS = [
  { label: 'What’s a tribe', slug: 'start/whats-a-tribe' },
  { label: 'Votes', slug: 'concepts/votes-and-delegation' },
  { label: 'Proposals', slug: 'concepts/proposals' },
  { label: 'Treasury', slug: 'concepts/treasury' },
  { label: 'Modules', slug: 'concepts/modules' },
  { label: 'Upgrades', slug: 'concepts/upgrades' }
] as const;

/** Offered when a search finds nothing, and on the 404 page. */
export const POPULAR = ['start/first-10-minutes', 'guides/proposals/vote', 'guides/create/identity'] as const;
