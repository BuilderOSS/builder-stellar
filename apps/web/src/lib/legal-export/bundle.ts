/**
 * The legal wrapper export (docs/LEGAL_EXPORT.md): a structured bundle a tribe forwards to a DAO
 * registrar such as MIDAO for due diligence. It combines what the chain and index already say about
 * the tribe (contracts, voting rules, treasury, who holds voting power) with the few things only the
 * founders can state (the proposed legal name, purpose, entity type, managers and a contact).
 *
 * Nothing here is legal advice and nothing leaves the browser: the bundle is built client-side and
 * downloaded. The thresholds follow MIDAO's published guidance (docs.midao.org) and are marked as
 * such in the bundle, so a registrar can correct them.
 */

import { formatDuration } from '@/lib/duration';

export const LEGAL_EXPORT_SCHEMA = 'https://tribes.build/schemas/legal-export/v1';

/** MIDAO: anyone with 25% or more of the governance rights completes KYC (category A). */
export const BENEFICIAL_OWNER_BPS = 2_500;

/** MIDAO: "Every DAO LLC must have 'DAO LLC' at the end of the entity name"; the space is optional. */
const LEGAL_NAME_RE = /\bDAO ?LLC$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ACCOUNT_RE = /^[GC][A-Z2-7]{55}$/;

export const MIN_PURPOSE_LENGTH = 20;
export const MAX_PURPOSE_LENGTH = 2_000;
export const MAX_MANAGERS = 10;

export type EntityType = 'non-profit' | 'for-profit' | 'undecided';

export const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  'non-profit': 'Non-profit',
  'for-profit': 'For-profit',
  undecided: 'Not decided yet'
};

export type Manager = { name: string; role: string; wallet: string };

/** What the founders fill in. */
export type EntityDraft = {
  legalName: string;
  tradeName: string;
  entityType: EntityType;
  purpose: string;
  managers: Manager[];
  contact: { name: string; email: string; role: string };
  notes: string;
};

export type DraftErrors = Partial<Record<'legalName' | 'purpose' | 'contactName' | 'contactEmail', string>> & {
  managers?: Record<number, string>;
};

export function suggestLegalName(tribeName: string) {
  const name = tribeName.trim().replace(/\s+/g, ' ');
  if (!name) return '';
  return LEGAL_NAME_RE.test(name) ? name : `${name.replace(/\s+DAO$/i, '')} DAO LLC`;
}

export function emptyDraft(tribeName: string, description: string): EntityDraft {
  return {
    legalName: suggestLegalName(tribeName),
    tradeName: tribeName.trim(),
    entityType: 'undecided',
    purpose: description.trim().slice(0, MAX_PURPOSE_LENGTH),
    managers: [],
    contact: { name: '', email: '', role: '' },
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

  if (!draft.contact.name.trim()) errors.contactName = 'Who should the registrar contact?';
  const email = draft.contact.email.trim();
  if (email && !EMAIL_RE.test(email)) errors.contactEmail = 'Enter a valid email address, or leave it empty.';

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

/** A holder's share of the voting supply, in basis points, rounded down. */
export function shareBps(votingPower: bigint, votingSupply: bigint) {
  if (votingSupply <= 0n || votingPower <= 0n) return 0;
  return Number((votingPower * 10_000n) / votingSupply);
}

export type Holder = { address: string; votingPower: bigint };

export type KycCategory = 'A' | 'B' | 'C';

/**
 * Who a registrar would ask to verify, under MIDAO's three categories: holders of 25% or more of
 * the voting power (A); if none, every manager (B); if none, any member (C).
 */
export function kycAssessment(holders: Holder[], votingSupply: bigint, managers: Manager[]) {
  const owners = holders
    .map((holder) => ({ ...holder, bps: shareBps(holder.votingPower, votingSupply) }))
    .filter((holder) => holder.bps >= BENEFICIAL_OWNER_BPS)
    .sort((a, b) => b.bps - a.bps);
  const category: KycCategory = owners.length ? 'A' : managers.length ? 'B' : 'C';
  return { category, owners };
}

export const KYC_CATEGORY_TEXT: Record<KycCategory, string> = {
  A: 'Holders of 25% or more of the voting power are beneficial owners and complete KYC.',
  B: 'No holder has 25% of the voting power, so every listed manager completes KYC.',
  C: 'No holder has 25% of the voting power and no managers are listed, so at least one member completes KYC.'
};

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
  members: { count: number | null; holders: Holder[] };
};

/** The JSON bundle. Bigints become strings; every derived figure says where it came from. */
export function buildBundle(draft: EntityDraft, facts: ChainFacts) {
  const votingSupply = facts.token.votingSupply ? BigInt(facts.token.votingSupply) : 0n;
  const managers = draft.managers.map((m) => ({
    name: m.name.trim(),
    role: m.role.trim(),
    wallet: m.wallet.trim() || null
  }));
  const kyc = kycAssessment(facts.members.holders, votingSupply, draft.managers);
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
      purpose: draft.purpose.trim(),
      management: managers.length
        ? 'Algorithmic, through the smart contracts below, with listed managers'
        : 'Algorithmic, through the smart contracts below',
      managers
    },
    contact: {
      name: draft.contact.name.trim(),
      email: draft.contact.email.trim() || null,
      role: draft.contact.role.trim() || null
    },
    tribe: facts.tribe,
    blockchain: { network: 'Stellar', environment: facts.network, networkPassphrase: facts.networkPassphrase },
    membership: {
      record: 'On chain: membership tokens of the token contract below',
      tokenName: facts.token.name,
      tokenSymbol: facts.token.symbol,
      votingModel: 'One token, one vote, with delegation',
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
    smartContracts: facts.contracts,
    treasury: facts.treasury,
    beneficialOwnership: {
      basis: 'MIDAO guidance: 25% or more of governance rights (docs.midao.org); confirm with the registrar',
      thresholdBps: BENEFICIAL_OWNER_BPS,
      category: kyc.category,
      explanation: KYC_CATEGORY_TEXT[kyc.category],
      holdersAtOrAboveThreshold: kyc.owners.map((owner) => ({
        address: owner.address,
        votingPower: owner.votingPower.toString(),
        shareBps: owner.bps
      })),
      measuredAt: facts.generatedAt
    },
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

/** A readable summary of the same bundle, for people rather than intake systems. */
export function bundleToMarkdown(bundle: LegalBundle) {
  const lines: string[] = [
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
    `- **Entity type:** ${ENTITY_TYPE_LABELS[bundle.entity.entityType]}`,
    `- **Management:** ${bundle.entity.management}`,
    '',
    '### Purpose',
    '',
    bundle.entity.purpose,
    ''
  ];
  if (bundle.entity.managers.length) {
    lines.push('### Managers', '', '| Name | Role | Wallet |', '| --- | --- | --- |');
    for (const m of bundle.entity.managers) lines.push(`| ${m.name} | ${orDash(m.role)} | ${orDash(m.wallet)} |`);
    lines.push('');
  }
  lines.push(
    '## Contact',
    '',
    `- **Name:** ${bundle.contact.name}`,
    `- **Email:** ${orDash(bundle.contact.email)}`,
    `- **Role:** ${orDash(bundle.contact.role)}`,
    '',
    '## Tribe',
    '',
    `- **Name:** ${bundle.tribe.name}`,
    `- **Page:** ${bundle.tribe.url}`,
    `- **Status:** ${bundle.tribe.status === 'operational' ? 'Live' : 'In setup'}`,
    `- **Network:** Stellar ${bundle.blockchain.environment}`
  );
  for (const link of bundle.tribe.links) lines.push(`- **${link.label}:** ${link.url}`);
  lines.push(
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
    lines.push(
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
  lines.push('## Smart contracts', '', '| Role | Address |', '| --- | --- |');
  for (const c of bundle.smartContracts) lines.push(`| ${c.role} | [${c.address}](${c.explorerUrl}) |`);
  lines.push('', '## Treasury', '', `- **Address:** ${bundle.treasury.address}`);
  if (bundle.treasury.balances === null) lines.push('- **Balances:** could not be read when this was generated');
  else if (!bundle.treasury.balances.length) lines.push('- **Balances:** empty');
  else for (const b of bundle.treasury.balances) lines.push(`- **${b.asset}:** ${b.amount}`);
  const bo = bundle.beneficialOwnership;
  lines.push('', '## Beneficial ownership', '', `${bo.explanation} (Category ${bo.category}; ${bo.basis}.)`, '');
  if (bo.holdersAtOrAboveThreshold.length) {
    lines.push('| Address | Voting power | Share |', '| --- | --- | --- |');
    for (const h of bo.holdersAtOrAboveThreshold)
      lines.push(`| ${h.address} | ${h.votingPower} | ${percent(h.shareBps)} |`);
    lines.push('');
  }
  lines.push(`Measured at ${bo.measuredAt}; voting power changes as tokens move.`);
  if (bundle.notes) lines.push('', '## Notes', '', bundle.notes);
  return `${lines.join('\n')}\n`;
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
