// One source for terms (docs/plans/walkthroughs-and-docs.md §5.5). The app's
// GlossaryTerm popover, the docs glossary page, and guide tooltips read this, so the
// copy can't drift. Plain words first, the DAO term one line beneath (DESIGN.md, Voice).

export type GlossaryEntry = {
  /** The word as it appears in the UI. */
  term: string;
  /** What it means, for someone new to DAOs. */
  plain: string;
  /** The DAO term or mechanism, for crypto natives. */
  dao: string;
  /** Anchor on the docs glossary page. */
  slug: string;
};

export const GLOSSARY = {
  treasury: {
    term: 'Treasury',
    plain: 'The funds the tribe holds together. They move only when a proposal passes and runs.',
    dao: 'An onchain treasury contract. Every payment in and out is public.',
    slug: 'treasury'
  },
  proposal: {
    term: 'Proposal',
    plain:
      'A suggestion that members vote on, such as paying someone or changing a setting. If it passes, its actions run exactly as written.',
    dao: 'A governance proposal with onchain actions.',
    slug: 'proposal'
  },
  delegate: {
    term: 'Delegate',
    plain: 'Someone you let vote with your tokens. You keep the tokens, and you can change your delegate at any time.',
    dao: 'Vote delegation: your voting power moves, and your NFTs stay in your wallet.',
    slug: 'delegate'
  },
  quorum: {
    term: 'Quorum',
    plain:
      'How many For and Abstain votes a proposal needs before it can pass, so a few people can’t decide for everyone.',
    dao: 'The Governor’s quorum, a share of all votes. After launch it changes only by vote.',
    slug: 'quorum'
  },
  'launch-admin': {
    term: 'Launch admin',
    plain:
      'The wallet that sets a tribe up before it launches. At launch, every setting passes to the tribe’s treasury.',
    dao: 'Setup authority only. After launch, changes require DAO governance.',
    slug: 'launch-admin'
  },
  'safety-delay': {
    term: 'Safety delay',
    plain: 'The wait between a vote passing and the proposal running, so members can review what will happen.',
    dao: 'The Governor’s queue delay, a timelock.',
    slug: 'safety-delay'
  }
} as const satisfies Record<string, GlossaryEntry>;

export type GlossaryKey = keyof typeof GLOSSARY;

export const GLOSSARY_KEYS = Object.keys(GLOSSARY) as GlossaryKey[];

/** Entries sorted by term, for the docs glossary page. */
export function glossaryEntries(): Array<GlossaryEntry & { key: GlossaryKey }> {
  return GLOSSARY_KEYS.map((key) => ({ key, ...GLOSSARY[key] })).sort((a, b) => a.term.localeCompare(b.term, 'en'));
}

export const DOCS_GLOSSARY_PATH = '/reference/glossary';

/** Where a term is explained on the docs site. Pass the docs origin for a link from the app. */
export function glossaryHref(key: GlossaryKey, origin = ''): string {
  return `${origin}${DOCS_GLOSSARY_PATH}#${GLOSSARY[key].slug}`;
}
