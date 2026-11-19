/**
 * The legal wrapper export (docs/LEGAL_EXPORT.md): a structured bundle a tribe forwards to a DAO
 * registrar such as MIDAO for due diligence. It combines what the chain and index already say about
 * the tribe (contracts, voting rules, treasury, who owns and who votes with the membership tokens)
 * with the things only the founders can state (the proposed legal name, purpose, entity type,
 * managers, a Representative Agent and a contact).
 *
 * Nothing here is legal advice and nothing leaves the browser: the bundle is built client-side and
 * downloaded. Each rule follows MIDAO's published guidance (docs.midao.org, read 2026-11-18) and the
 * bundle links the exact page in `sources`, so a registrar can correct our reading.
 */

import { formatDuration } from '@/lib/duration';

export const LEGAL_EXPORT_SCHEMA = 'https://tribes.build/schemas/legal-export/v2';

/** MIDAO: anyone who owns 25% or more of the governance rights is a beneficial owner (category A). */
export const BENEFICIAL_OWNER_BPS = 2_500;

/** The MIDAO pages each rule in the bundle comes from. */
export const MIDAO_SOURCES = {
  registration: 'https://docs.midao.org/rmi-dao-llc-registration-and-compliance/registration-process',
  naming:
    'https://docs.midao.org/rmi-dao-llc-registration-and-compliance/naming-your-dao-llc-and-dba-doing-business-as',
  beneficialOwnership:
    'https://docs.midao.org/rmi-dao-llc-registration-and-compliance/kyc-kyb-and-beneficial-ownership-reporting',
  entityType: 'https://docs.midao.org/dao-llc-structuring/non-profit-vs.-for-profit',
  operatingAgreement: 'https://docs.midao.org/dao-llc-structuring/dao-llc-operating-agreements-and-amendments',
  smartContracts: 'https://docs.midao.org/dao-llc-structuring/use-of-smart-contracts',
  members: 'https://docs.midao.org/dao-llc-structuring/members-membership-interests-managing-members',
  fees: 'https://docs.midao.org/midao-pricing-and-services/pricing-cost-comparison-and-payments'
} as const;

/**
 * MIDAO: the name ends in "DAO LLC". The optional space is between the project name and "DAO LLC"
 * ("MIDAO LLC" or "MI DAO LLC"), so the check is only that the name ends with that phrase; the
 * phrase itself keeps its space ("DAOLLC" is not a DAO LLC name).
 */
const LEGAL_NAME_RE = /DAO LLC$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ACCOUNT_RE = /^[GC][A-Z2-7]{55}$/;
const USD_RE = /^\d{1,13}(\.\d{1,2})?$/;

export const MIN_PURPOSE_LENGTH = 20;
export const MAX_PURPOSE_LENGTH = 2_000;
export const MAX_MANAGERS = 10;
export const MAX_CONTRIBUTIONS = 20;

export type EntityType = 'non-profit' | 'for-profit' | 'undecided';

export const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  'non-profit': 'Non-profit',
  'for-profit': 'For-profit',
  undecided: 'Not decided yet'
};

/** MIDAO: a non-profit DAO LLC's purpose is charitable, educational, scientific or similar good works. */
export type NonProfitPurpose = '' | 'charitable' | 'educational' | 'scientific' | 'religious' | 'other-good-works';

export const NON_PROFIT_PURPOSE_LABELS: Record<Exclude<NonProfitPurpose, ''>, string> = {
  charitable: 'Charitable',
  educational: 'Educational',
  scientific: 'Scientific',
  religious: 'Religious',
  'other-good-works': 'Other good works'
};

export type UsMembers = 'yes' | 'no' | 'unknown';

export type Manager = { name: string; role: string; wallet: string };

/** What the founders fill in. */
export type EntityDraft = {
  legalName: string;
  tradeName: string;
  entityType: EntityType;
  nonProfitPurpose: NonProfitPurpose;
  purpose: string;
  /** For-profit only: how profits are allocated, in the founders' words. */
  profitAllocation: string;
  /** For-profit only: whether any member is a US person (MIDAO notes the IRS Form 8832 election). */
  usMembers: UsMembers;
  managers: Manager[];
  /** MIDAO files Form 1 with the consent of a Representative Agent. */
  representativeAgent: { name: string; role: string };
  contact: { name: string; email: string; role: string };
  /** Initial contributions beyond the Treasury, one per line: domains, accounts, IP. */
  contributions: string;
  /** Treasury plus funding in USD, an estimate: MIDAO's fees are tiered by it. */
  fundingUsdEstimate: string;
  notes: string;
};

export type DraftField =
  'legalName' | 'purpose' | 'nonProfitPurpose' | 'contactName' | 'contactEmail' | 'fundingUsdEstimate';

export type DraftErrors = Partial<Record<DraftField, string>> & { managers?: Record<number, string> };

export function suggestLegalName(tribeName: string) {
  const name = tribeName.trim().replace(/\s+/g, ' ');
  if (!name) return '';
  if (LEGAL_NAME_RE.test(name)) return name;
  // "Lantern DAO" and "MIDAO" become "Lantern DAO LLC" and "MIDAO LLC"; anything else gains " DAO LLC".
  return /DAO$/i.test(name) ? `${name} LLC` : `${name} DAO LLC`;
}

export function emptyDraft(tribeName: string, description: string): EntityDraft {
  return {
    legalName: suggestLegalName(tribeName),
    tradeName: tribeName.trim(),
    entityType: 'undecided',
    nonProfitPurpose: '',
    purpose: description.trim().slice(0, MAX_PURPOSE_LENGTH),
    profitAllocation: '',
    usMembers: 'unknown',
    managers: [],
    representativeAgent: { name: '', role: '' },
    contact: { name: '', email: '', role: '' },
    contributions: '',
    fundingUsdEstimate: '',
    notes: ''
  };
}

export function validateDraft(draft: EntityDraft): DraftErrors {
  const errors: DraftErrors = {};
  const legalName = draft.legalName.trim();
  if (!legalName) errors.legalName = 'Enter the name you want to register.';
  else if (!LEGAL_NAME_RE.test(legalName)) errors.legalName = 'A Marshall Islands DAO LLC name ends with “DAO LLC”.';

  const purpose = draft.purpose.trim();
  if (purpose.length < MIN_PURPOSE_LENGTH) errors.purpose = 'Say in a sentence or two what the tribe does.';
  else if (purpose.length > MAX_PURPOSE_LENGTH) errors.purpose = `At most ${MAX_PURPOSE_LENGTH} characters.`;

  if (draft.entityType === 'non-profit' && !draft.nonProfitPurpose)
    errors.nonProfitPurpose = 'Choose the kind of good works the tribe does.';

  if (!draft.contact.name.trim()) errors.contactName = 'Who should the registrar contact?';
  const email = draft.contact.email.trim();
  if (email && !EMAIL_RE.test(email)) errors.contactEmail = 'Enter a valid email address, or leave it empty.';

  const usd = draft.fundingUsdEstimate.trim().replace(/,/g, '');
  if (usd && !USD_RE.test(usd)) errors.fundingUsdEstimate = 'Enter an amount in US dollars, such as 45000.';

  const managers: Record<number, string> = {};
  draft.managers.forEach((manager, i) => {
    if (!manager.name.trim()) managers[i] = 'Enter a name, or remove this manager.';
    else if (manager.wallet.trim() && !ACCOUNT_RE.test(manager.wallet.trim()))
      managers[i] = 'A Stellar address starts with G or C and has 56 characters.';
  });
  if (Object.keys(managers).length) errors.managers = managers;
  return errors;
}

export function hasErrors(errors: DraftErrors) {
  return Object.keys(errors).length > 0;
}

/** A part's share of a whole, in basis points, rounded down. */
export function shareBps(part: bigint, whole: bigint) {
  if (whole <= 0n || part <= 0n) return 0;
  return Number((part * 10_000n) / whole);
}

export type Holder = { address: string; ownedTokens: bigint; votingPower: bigint };

/** A Stellar account (G…) is a person or company; a contract (C…) needs a look-through. */
export type HolderKind = 'account' | 'contract' | 'tribe-contract';

export const HOLDER_KIND_TEXT: Record<HolderKind, string> = {
  account: 'Stellar account',
  contract: 'Smart contract or multisig: confirm KYB and who controls it',
  'tribe-contract': "The tribe's own contract: not a beneficial owner"
};

export function holderKind(address: string, tribeContracts: readonly string[]): HolderKind {
  if (tribeContracts.includes(address)) return 'tribe-contract';
  return address.startsWith('C') ? 'contract' : 'account';
}

/** `unknown` when the holders or the minted supply couldn't be read: never guess a category. */
export type KycCategory = 'A' | 'B' | 'C' | 'unknown';

export type AssessedHolder = Holder & { kind: HolderKind; ownershipBps: number; votingBps: number };

/**
 * Who a registrar would ask to verify, under MIDAO's three categories.
 *
 * MIDAO counts who *owns* 25% or more of the governance rights, so the main basis here is
 * membership tokens owned, of all tokens minted. Voting power (which includes delegated votes) is
 * reported beside it for the registrar to weigh, since a delegate does not own the votes it casts.
 * Tokens held by the tribe's own contracts (Treasury, Auction, Marketplace) are listed but are not
 * a beneficial owner.
 *
 * Category A: anyone owning 25% or more. If none, B: every manager. If none, C: any member.
 */
export function kycAssessment(
  holders: Holder[] | null,
  supply: { minted: bigint | null; voting: bigint | null },
  managers: Manager[],
  tribeContracts: readonly string[]
): { category: KycCategory; owners: AssessedHolder[]; votingOnly: AssessedHolder[]; tribeHeld: AssessedHolder[] } {
  // Without the holders or the minted supply, "no one owns 25%" would be a guess.
  if (holders === null || supply.minted === null)
    return { category: 'unknown', owners: [], votingOnly: [], tribeHeld: [] };
  const minted = supply.minted;
  const assessed: AssessedHolder[] = holders.map((holder) => ({
    ...holder,
    kind: holderKind(holder.address, tribeContracts),
    ownershipBps: shareBps(holder.ownedTokens, minted),
    votingBps: shareBps(holder.votingPower, supply.voting ?? 0n)
  }));
  const byOwnership = assessed
    .filter((h) => h.ownershipBps >= BENEFICIAL_OWNER_BPS)
    .sort((a, b) => b.ownershipBps - a.ownershipBps);
  const owners = byOwnership.filter((h) => h.kind !== 'tribe-contract');
  const tribeHeld = byOwnership.filter((h) => h.kind === 'tribe-contract');
  const votingOnly = assessed
    .filter(
      (h) =>
        h.kind !== 'tribe-contract' &&
        h.votingBps >= BENEFICIAL_OWNER_BPS &&
        !owners.some((o) => o.address === h.address)
    )
    .sort((a, b) => b.votingBps - a.votingBps);
  const category: KycCategory = owners.length ? 'A' : managers.length ? 'B' : 'C';
  return { category, owners, votingOnly, tribeHeld };
}

export const KYC_CATEGORY_TEXT: Record<KycCategory, string> = {
  A: 'Members who own 25% or more of the membership tokens are beneficial owners and complete KYC.',
  B: 'No member owns 25% or more of the membership tokens, so every listed manager is a beneficial owner and completes KYC.',
  C: 'No member owns 25% or more of the membership tokens and no managers are listed, so the registrar asks any member to complete KYC. MIDAO does not treat a category C member as a beneficial owner, but still reports them.',
  unknown:
    "The token holders or the number of tokens minted couldn't be read, so the category isn't known. Export again once they load, before sending this to a registrar."
};

/** "Category A", or "Category not known" when it couldn't be worked out. */
export function kycCategoryTitle(category: KycCategory) {
  return category === 'unknown' ? 'Category not known' : `Category ${category}`;
}

export type ChainFacts = {
  generatedAt: string;
  network: string;
  networkPassphrase: string;
  tribe: {
    name: string;
    daoId: string;
    url: string;
    status: 'pending' | 'operational';
    links: Array<{ label: string; url: string }>;
  };
  token: {
    name: string;
    symbol: string;
    /** Tokens minted, from the index. */
    totalSupply: string | null;
    /** Tokens that carry votes: the Treasury, Auction and Marketplace hold the rest. */
    votingSupply: string | null;
    transfersLocked: boolean;
    membersOnlyDelegation: boolean;
    daoRecovery: boolean;
  };
  /** Where voting power comes from (docs/designs/governance-adapter.md); null when unread. */
  voteSource: { address: string; isToken: boolean } | null;
  launchModes: { auction: boolean; claims: boolean; marketplace: boolean };
  contracts: Array<{ role: string; address: string; explorerUrl: string }>;
  governance: {
    votingDelaySeconds: number | null;
    votingPeriodSeconds: number | null;
    proposalThreshold: string | null;
    quorumBps: number | null;
    safetyDelaySeconds: number | null;
  } | null;
  treasury: { address: string; balances: Array<{ asset: string; amount: string }> | null };
  /** Null when the holder rankings couldn't be read. */
  members: { count: number | null; holders: Holder[] | null };
};

const lines = (text: string, max: number) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, max);

function votingModel(facts: ChainFacts) {
  if (!facts.voteSource || facts.voteSource.isToken) return 'One token, one vote, with delegation';
  return `Weighted by an approved vote source (${facts.voteSource.address}); membership is still the token`;
}

/** The JSON bundle. Bigints become strings; every derived figure says where it came from. */
export function buildBundle(draft: EntityDraft, facts: ChainFacts) {
  const managers = draft.managers.map((m) => ({
    name: m.name.trim(),
    role: m.role.trim(),
    wallet: m.wallet.trim() || null
  }));
  const tribeContracts = facts.contracts.map((c) => c.address);
  const kyc = kycAssessment(
    facts.members.holders,
    {
      minted: facts.token.totalSupply === null ? null : BigInt(facts.token.totalSupply),
      voting: facts.token.votingSupply === null ? null : BigInt(facts.token.votingSupply)
    },
    draft.managers,
    tribeContracts
  );
  const live = facts.tribe.status === 'operational';
  const agent = { name: draft.representativeAgent.name.trim(), role: draft.representativeAgent.role.trim() };
  const governedByToken = !facts.voteSource || facts.voteSource.isToken;
  const holderRow = (h: AssessedHolder) => ({
    address: h.address,
    kind: h.kind,
    kindNote: HOLDER_KIND_TEXT[h.kind],
    tokensOwned: h.ownedTokens.toString(),
    ownershipShareBps: h.ownershipBps,
    votingPower: h.votingPower.toString(),
    votingShareBps: h.votingBps
  });
  return {
    $schema: LEGAL_EXPORT_SCHEMA,
    generatedAt: facts.generatedAt,
    generatedBy: 'Tribe Builder (tribes.build)',
    disclaimer:
      'Prepared from public on-chain data and the founders’ own answers to help a DAO registrar’s intake. It is not legal advice and does not replace independent legal counsel.',
    entity: {
      proposedLegalName: draft.legalName.trim(),
      tradeName: draft.tradeName.trim() || null,
      jurisdiction: 'Republic of the Marshall Islands (DAO LLC), proposed',
      entityType: draft.entityType,
      entityTypeNote:
        'MIDAO: the choice between non-profit and for-profit cannot be converted later; changing it means forming a new entity.',
      nonProfitPurposeCategory: draft.entityType === 'non-profit' ? draft.nonProfitPurpose || null : null,
      purpose: draft.purpose.trim(),
      forProfit:
        draft.entityType === 'for-profit'
          ? { profitAllocation: draft.profitAllocation.trim() || null, usMembers: draft.usMembers }
          : null,
      management: managers.length
        ? 'Governance delegated to the smart contracts below under the operating agreement, with listed managers acting off chain'
        : 'Governance delegated to the smart contracts below under the operating agreement',
      managers,
      representativeAgent: agent.name ? agent : null,
      representativeAgentNote:
        'MIDAO files Form 1, the consent of a Representative Agent, with the formation documents.'
    },
    contact: {
      name: draft.contact.name.trim(),
      email: draft.contact.email.trim() || null,
      role: draft.contact.role.trim() || null
    },
    operatingAgreementProfile: {
      entityType: draft.entityType,
      membershipTracking: 'blockchain',
      voting: governedByToken ? 'one-token-one-vote' : 'vote-source-weighted',
      governance: 'smart-contract',
      treasuryCommittee: 'none: the Treasury executes only proposals that passed',
      note: 'MIDAO matches its operating agreement template to these four choices. The agreement prevails over the smart contracts where they conflict, and may delegate governance to them.'
    },
    tribe: facts.tribe,
    blockchain: { network: 'Stellar', environment: facts.network, networkPassphrase: facts.networkPassphrase },
    membership: {
      record: 'On chain: membership tokens of the token contract below',
      tokenName: facts.token.name,
      tokenSymbol: facts.token.symbol,
      votingModel: votingModel(facts),
      voteSource: facts.voteSource && !facts.voteSource.isToken ? facts.voteSource.address : null,
      totalSupply: facts.token.totalSupply,
      votingSupply: facts.token.votingSupply,
      memberCount: facts.members.count,
      transfersLocked: facts.token.transfersLocked,
      membersOnlyDelegation: facts.token.membersOnlyDelegation,
      daoRecovery: facts.token.daoRecovery,
      issuance: {
        auctions: facts.launchModes.auction,
        claimLists: facts.launchModes.claims,
        marketplace: facts.launchModes.marketplace
      }
    },
    governance: facts.governance
      ? {
          executor: 'Treasury contract, only after a proposal passes and its safety delay ends',
          votingDelaySeconds: facts.governance.votingDelaySeconds,
          votingPeriodSeconds: facts.governance.votingPeriodSeconds,
          proposalThreshold: facts.governance.proposalThreshold,
          quorumBps: facts.governance.quorumBps,
          safetyDelaySeconds: facts.governance.safetyDelaySeconds,
          upgrades:
            'Each contract upgrades only by a passed proposal, to a version the Tribe Builder registry has published and approved'
        }
      : null,
    smartContracts: facts.contracts.map((c) => ({ ...c, status: live ? 'live' : 'deployed, not yet live' })),
    treasury: facts.treasury,
    initialContributions: {
      treasuryAddress: facts.treasury.address,
      items: lines(draft.contributions, MAX_CONTRIBUTIONS)
    },
    fees: {
      treasuryAndFundingUsdEstimate: draft.fundingUsdEstimate.trim().replace(/,/g, '') || null,
      note: 'An estimate from the founders. MIDAO tiers its registration and annual fees by treasury plus funding in US dollars.'
    },
    beneficialOwnership: {
      basis:
        'MIDAO: anyone who owns 25% or more of the governance rights. Measured here as membership tokens owned, of all tokens minted; voting power, which includes delegated votes, is shown beside it. Confirm the measure with the registrar.',
      thresholdBps: BENEFICIAL_OWNER_BPS,
      category: kyc.category,
      explanation: KYC_CATEGORY_TEXT[kyc.category],
      ownershipDenominator: { tokensMinted: facts.token.totalSupply },
      votingDenominator: { tokensWithVotes: facts.token.votingSupply },
      owners: kyc.owners.map(holderRow),
      votingPowerAtOrAboveThreshold: kyc.votingOnly.map(holderRow),
      heldByTribeContracts: kyc.tribeHeld.map(holderRow),
      measuredAt: facts.generatedAt
    },
    sources: MIDAO_SOURCES,
    notes: draft.notes.trim() || null
  };
}

export type LegalBundle = ReturnType<typeof buildBundle>;

const percent = (bps: number | null) =>
  bps === null ? 'unknown' : `${(bps / 100).toLocaleString('en-GB', { maximumFractionDigits: 2 })}%`;
const duration = (seconds: number | null) =>
  seconds === null ? 'unknown' : formatDuration(seconds, { style: 'long' });
const orDash = (value: string | number | null | undefined) =>
  value === null || value === undefined || value === '' ? '—' : String(value);
const yesNo = (value: boolean) => (value ? 'Yes' : 'No');
const US_MEMBERS_TEXT: Record<UsMembers, string> = { yes: 'Yes', no: 'No', unknown: 'Not known yet' };

type HolderRow = LegalBundle['beneficialOwnership']['owners'][number];

function holderTable(rows: HolderRow[]) {
  const out = [
    '| Address | Kind | Tokens owned | Share owned | Voting power | Share of votes |',
    '| --- | --- | --- | --- | --- | --- |'
  ];
  for (const h of rows)
    out.push(
      `| ${h.address} | ${h.kindNote} | ${h.tokensOwned} | ${percent(h.ownershipShareBps)} | ${h.votingPower} | ${percent(h.votingShareBps)} |`
    );
  return [...out, ''];
}

/** A readable summary of the same bundle, for people rather than intake systems. */
export function bundleToMarkdown(bundle: LegalBundle) {
  const out: string[] = [
    `# ${bundle.entity.proposedLegalName}: registrar intake summary`,
    '',
    `> ${bundle.disclaimer}`,
    '',
    `Generated ${bundle.generatedAt} by ${bundle.generatedBy}. Machine-readable version: the accompanying JSON (${bundle.$schema}).`,
    '',
    '## Entity',
    '',
    `- **Proposed legal name:** ${bundle.entity.proposedLegalName}`,
    `- **Trading name:** ${orDash(bundle.entity.tradeName)}`,
    `- **Jurisdiction:** ${bundle.entity.jurisdiction}`,
    `- **Entity type:** ${ENTITY_TYPE_LABELS[bundle.entity.entityType]}. ${bundle.entity.entityTypeNote}`
  ];
  if (bundle.entity.nonProfitPurposeCategory)
    out.push(`- **Non-profit purpose:** ${NON_PROFIT_PURPOSE_LABELS[bundle.entity.nonProfitPurposeCategory]}`);
  if (bundle.entity.forProfit) {
    out.push(`- **Profit allocation:** ${orDash(bundle.entity.forProfit.profitAllocation)}`);
    out.push(`- **Any US members:** ${US_MEMBERS_TEXT[bundle.entity.forProfit.usMembers]}`);
  }
  out.push(`- **Management:** ${bundle.entity.management}`, '', '### Purpose', '', bundle.entity.purpose, '');
  if (bundle.entity.managers.length) {
    out.push('### Managers', '', '| Name | Role | Wallet |', '| --- | --- | --- |');
    for (const m of bundle.entity.managers) out.push(`| ${m.name} | ${orDash(m.role)} | ${orDash(m.wallet)} |`);
    out.push('');
  }
  const agent = bundle.entity.representativeAgent;
  out.push(
    '### Representative Agent',
    '',
    agent ? `${agent.name}${agent.role ? `, ${agent.role}` : ''}.` : 'Not named yet.',
    bundle.entity.representativeAgentNote,
    '',
    '## Contact',
    '',
    `- **Name:** ${bundle.contact.name}`,
    `- **Email:** ${orDash(bundle.contact.email)}`,
    `- **Role:** ${orDash(bundle.contact.role)}`,
    '',
    '## Operating agreement profile',
    '',
    `- **Membership:** tracked on a blockchain`,
    `- **Voting:** ${bundle.operatingAgreementProfile.voting === 'one-token-one-vote' ? 'one token, one vote' : 'weighted by an approved vote source'}`,
    `- **Governance:** by smart contract`,
    `- **Treasury committee:** ${bundle.operatingAgreementProfile.treasuryCommittee}`,
    '',
    bundle.operatingAgreementProfile.note,
    '',
    '## Tribe',
    '',
    `- **Name:** ${bundle.tribe.name}`,
    `- **Page:** ${bundle.tribe.url}`,
    `- **Status:** ${bundle.tribe.status === 'operational' ? 'Live' : 'In setup'}`,
    `- **Network:** Stellar ${bundle.blockchain.environment}`
  );
  for (const link of bundle.tribe.links) out.push(`- **${link.label}:** ${link.url}`);
  out.push(
    '',
    '## Membership',
    '',
    `- **Record:** ${bundle.membership.record}`,
    `- **Token:** ${bundle.membership.tokenName} (${bundle.membership.tokenSymbol})`,
    `- **Voting model:** ${bundle.membership.votingModel}`,
    `- **Tokens minted:** ${orDash(bundle.membership.totalSupply)}`,
    `- **Tokens with votes:** ${orDash(bundle.membership.votingSupply)}`,
    `- **Members:** ${orDash(bundle.membership.memberCount)}`,
    `- **Transfers locked:** ${yesNo(bundle.membership.transfersLocked)}`,
    `- **Issued by auction / claim list / market:** ${yesNo(bundle.membership.issuance.auctions)} / ${yesNo(bundle.membership.issuance.claimLists)} / ${yesNo(bundle.membership.issuance.marketplace)}`,
    ''
  );
  if (bundle.governance) {
    const g = bundle.governance;
    out.push(
      '## Governance',
      '',
      `- **Executor:** ${g.executor}`,
      `- **Wait before voting opens:** ${duration(g.votingDelaySeconds)}`,
      `- **Voting period:** ${duration(g.votingPeriodSeconds)}`,
      `- **Votes needed to propose:** ${orDash(g.proposalThreshold)}`,
      `- **Quorum:** ${percent(g.quorumBps)} of tokens with votes`,
      `- **Safety delay before execution:** ${duration(g.safetyDelaySeconds)}`,
      `- **Upgrades:** ${g.upgrades}`,
      ''
    );
  }
  out.push('## Smart contracts', '', '| Role | Address | Status |', '| --- | --- | --- |');
  for (const c of bundle.smartContracts) out.push(`| ${c.role} | [${c.address}](${c.explorerUrl}) | ${c.status} |`);
  out.push('', '## Treasury', '', `- **Address:** ${bundle.treasury.address}`);
  if (bundle.treasury.balances === null) out.push('- **Balances:** could not be read when this was generated');
  else if (!bundle.treasury.balances.length) out.push('- **Balances:** empty');
  else for (const b of bundle.treasury.balances) out.push(`- **${b.asset}:** ${b.amount}`);
  out.push(
    '',
    '## Initial contributions',
    '',
    `- The Treasury contract: ${bundle.initialContributions.treasuryAddress}`
  );
  for (const item of bundle.initialContributions.items) out.push(`- ${item}`);
  out.push(
    '',
    '## Fees',
    '',
    `- **Treasury plus funding, estimated:** ${bundle.fees.treasuryAndFundingUsdEstimate ? `US$${bundle.fees.treasuryAndFundingUsdEstimate}` : 'not given'}`,
    `- ${bundle.fees.note}`
  );
  const bo = bundle.beneficialOwnership;
  out.push(
    '',
    '## Beneficial ownership',
    '',
    `**${kycCategoryTitle(bo.category)}.** ${bo.explanation}`,
    '',
    bo.basis,
    ''
  );
  if (bo.owners.length) out.push('### Beneficial owners', '', ...holderTable(bo.owners));
  if (bo.votingPowerAtOrAboveThreshold.length)
    out.push(
      '### Voting power at 25% or more without owning it',
      '',
      'Delegates casting votes for others. Listed for the registrar to weigh; they are not counted as owners here.',
      '',
      ...holderTable(bo.votingPowerAtOrAboveThreshold)
    );
  if (bo.heldByTribeContracts.length)
    out.push("### Held by the tribe's own contracts", '', ...holderTable(bo.heldByTribeContracts));
  out.push(`Measured at ${bo.measuredAt}; ownership and voting power change as tokens move.`, '', '## Sources', '');
  for (const [rule, url] of Object.entries(bundle.sources)) out.push(`- ${rule}: ${url}`);
  if (bundle.notes) out.push('', '## Notes', '', bundle.notes);
  return `${out.join('\n')}\n`;
}

/** `acme-dao-llc-2026-11-18`, from the proposed legal name. */
export function bundleFileStem(bundle: LegalBundle) {
  const slug = bundle.entity.proposedLegalName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return `${slug || 'tribe'}-${bundle.generatedAt.slice(0, 10)}`;
}
