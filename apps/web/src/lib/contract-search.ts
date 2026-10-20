import { StrKey } from '@stellar/stellar-sdk';

/** One of a tribe's contracts, as Discover search matches it. */
export type DaoContract = { role: string; label: string; id: string };

/**
 * What a search query says about contract IDs:
 * - `full`: a valid contract ID, matched exactly
 * - `short`: the shortened `CABCDE…UVWXYZ` form the app displays, matched by its ends
 * - `partial`: five or more ID characters, matched anywhere in an ID
 * - `account`: a valid account address (G…), which never names a tribe
 * - `malformed`: an ID's length and prefix but a bad checksum
 */
export type ContractQuery =
  | { kind: 'full'; id: string }
  | { kind: 'short'; head: string; tail: string }
  | { kind: 'partial'; text: string }
  | { kind: 'account' }
  | { kind: 'malformed' };

const ROLE_LABELS: Record<string, string> = {
  token: 'Token contract',
  governor: 'Governor contract',
  treasury: 'Treasury contract',
  metadata: 'Metadata contract',
  auction: 'Auction contract',
  marketplace: 'Market contract',
  claims: 'Claims contract',
  circle: 'Savings circle contract'
};

const ID_CHARS = /^[A-Z2-7]+$/;
const SHORT_FORM = /^(C[A-Z2-7]{3,})(?:…|\.{2,3})([A-Z2-7]{4,})$/;
const MIN_PARTIAL = 5;

/** A contract's label by its pipeline role; an external module is named from its registry kind. */
export function contractLabel(role: string, kind?: string | null) {
  if (ROLE_LABELS[role]) return ROLE_LABELS[role];
  const name = kind
    ?.replace(/^custom_/, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  return name ? `${name.charAt(0).toUpperCase()}${name.slice(1)} module` : 'Module';
}

/** The contracts a DAO record carries. The Manager is shared by every tribe, so it is left out. */
export function coreContracts(dao: {
  token_contract: string;
  governor_contract: string;
  treasury_contract: string | null;
  metadata_contract: string | null;
  auction_contract: string | null;
  marketplace_contract: string | null;
  claims_contract: string | null;
}): DaoContract[] {
  const entries: [string, string | null][] = [
    ['token', dao.token_contract],
    ['governor', dao.governor_contract],
    ['treasury', dao.treasury_contract],
    ['metadata', dao.metadata_contract],
    ['auction', dao.auction_contract],
    ['marketplace', dao.marketplace_contract],
    ['claims', dao.claims_contract]
  ];
  return entries.flatMap(([role, id]) => (id ? [{ role, label: contractLabel(role), id }] : []));
}

/** Reads a search query as a contract ID, or null when it can't be one. */
export function parseContractQuery(raw: string): ContractQuery | null {
  // Pasted IDs often carry line breaks or spaces; IDs are upper case.
  const text = raw.replace(/\s+/g, '').toUpperCase();
  if (!text) return null;
  if (text.length === 56 && text.startsWith('C') && ID_CHARS.test(text)) {
    return StrKey.isValidContract(text) ? { kind: 'full', id: text } : { kind: 'malformed' };
  }
  if (text.length === 56 && text.startsWith('G') && StrKey.isValidEd25519PublicKey(text)) return { kind: 'account' };
  const short = SHORT_FORM.exec(text);
  if (short) return { kind: 'short', head: short[1], tail: short[2] };
  if (text.length >= MIN_PARTIAL && ID_CHARS.test(text)) return { kind: 'partial', text };
  return null;
}

/** The first of a tribe's contracts the query names, or null. */
export function matchContract(query: ContractQuery | null, contracts: DaoContract[]): DaoContract | null {
  if (!query) return null;
  switch (query.kind) {
    case 'full':
      return contracts.find((contract) => contract.id === query.id) ?? null;
    case 'short':
      return (
        contracts.find((contract) => contract.id.startsWith(query.head) && contract.id.endsWith(query.tail)) ?? null
      );
    case 'partial':
      return contracts.find((contract) => contract.id.includes(query.text)) ?? null;
    default:
      return null;
  }
}
