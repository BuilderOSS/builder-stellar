/** Manage sections, grouped: the side nav and the Manage overview both read this list. */
export type ManageSection = {
  key: string;
  label: string;
  meta: string;
  /** Path under the community's admin route. */
  section: string;
  exact?: boolean;
  /** Needed before launch; tagged while the community is in setup. */
  requiredForLaunch?: boolean;
  /** An optional module: the section shows only when the community has it. */
  module?: keyof ManageModules;
};

export type ManageModules = { auction: boolean; marketplace: boolean; claims: boolean };

export const MANAGE_GROUPS: Array<{ title: string; items: ManageSection[] }> = [
  {
    title: 'Overview',
    items: [{ key: 'overview', label: 'Overview', meta: 'Your access and pending changes', section: '', exact: true }]
  },
  {
    title: 'Community',
    items: [
      { key: 'profile', label: 'Community profile', meta: 'Name, link, image and description', section: '/profile' }
    ]
  },
  {
    title: 'Membership',
    items: [
      { key: 'token', label: 'Mint tokens', meta: 'Create new membership tokens', section: '/token' },
      {
        key: 'founders',
        label: 'Founder tokens',
        meta: 'Tokens for the founding team',
        section: '/founders',
        requiredForLaunch: true
      },
      {
        key: 'claims',
        label: 'Claim lists',
        meta: 'Tokens listed people can claim',
        section: '/claims',
        module: 'claims'
      },
      {
        key: 'artwork',
        label: 'Artwork',
        meta: 'The art every token is drawn from',
        section: '/artwork',
        requiredForLaunch: true
      }
    ]
  },
  {
    title: 'Rules',
    items: [
      { key: 'governance', label: 'Voting rules', meta: 'Timing, quorum and who can propose', section: '/governance' },
      {
        key: 'owner',
        label: 'Membership',
        meta: 'How tokens move, delegation and module allowances',
        section: '/owner'
      }
    ]
  },
  {
    title: 'Selling',
    items: [
      { key: 'auction', label: 'Auction', meta: 'Pause, pricing and timing', section: '/auction', module: 'auction' },
      {
        key: 'marketplace',
        label: 'Market',
        meta: 'Listings, fees and pausing',
        section: '/marketplace',
        module: 'marketplace'
      }
    ]
  },
  {
    title: 'System',
    items: [
      {
        key: 'upgrades',
        label: 'Contract upgrades',
        meta: 'Keep contracts on their latest release',
        section: '/upgrades'
      },
      {
        key: 'renewal',
        label: 'Storage renewal',
        meta: 'When data expires, and renewing it in one go',
        section: '/renewal'
      }
    ]
  }
];

/** Every section, hidden ones too, so a page reached by its URL can still name itself. */
export const MANAGE_SECTIONS = MANAGE_GROUPS.flatMap((group) => group.items);

/** The groups this community shows: optional-module sections only where it has the module. */
export function manageGroups(modules: ManageModules) {
  return MANAGE_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.module || modules[item.module])
  })).filter((group) => group.items.length);
}
