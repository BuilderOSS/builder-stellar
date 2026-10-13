/**
 * The community profile (docs/STORAGE_DIET.md § 6).
 *
 * The profile JSON is event-only on chain: Metadata stores only its sha256
 * (`profile_hash()`) and a sequence number (`profile_seq()`), and emits the
 * string in `ProfileUpdated`. The indexer keeps the latest string byte-for-byte;
 * the app hashes those bytes and compares with the chain before showing them.
 *
 *   { "v": 1, "description": "Markdown.", "links": [{ "label": "Website", "url": "https://…" }], "image": "ipfs://…" }
 *
 * Readers are tolerant (unknown fields ignored, missing fields empty) and
 * enforce the same rules as writers: non-conforming links and images are
 * dropped, never shown.
 */

/** contracts/common `MAX_PROFILE_LENGTH`: the serialized JSON's UTF-8 byte cap. */
export const MAX_PROFILE_BYTES = 4_096;
export const MAX_PROFILE_LINKS = 8;
/** Code points, not bytes. */
export const MAX_LINK_LABEL = 32;

export type ProfileLink = { label: string; url: string };

export type DaoProfile = {
  description: string;
  links: ProfileLink[];
  /** An image URL (`ipfs://` or `https://`); empty when none. */
  image: string;
};

export const EMPTY_PROFILE: DaoProfile = { description: '', links: [], image: '' };

const LINK_SCHEME = /^(https?:\/\/|mailto:|ipfs:\/\/)\S+$/i;
const IMAGE_SCHEME = /^(https:\/\/|ipfs:\/\/)\S+$/i;

export function isProfileLinkUrl(url: string) {
  return LINK_SCHEME.test(url.trim());
}

export function isProfileImageUrl(url: string) {
  return IMAGE_SCHEME.test(url.trim());
}

function cleanLink(value: unknown): ProfileLink | null {
  if (!value || typeof value !== 'object') return null;
  const { label, url } = value as Record<string, unknown>;
  if (typeof label !== 'string' || typeof url !== 'string') return null;
  const trimmedLabel = label.trim();
  const trimmedUrl = url.trim();
  if (!trimmedLabel || [...trimmedLabel].length > MAX_LINK_LABEL || !isProfileLinkUrl(trimmedUrl)) return null;
  return { label: trimmedLabel, url: trimmedUrl };
}

/**
 * Read a profile string as stored on chain. Never throws: anything that is not
 * a JSON object yields the empty profile; bad links and images are dropped.
 */
export function parseProfile(raw: string | null | undefined): DaoProfile {
  if (!raw) return { ...EMPTY_PROFILE };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ...EMPTY_PROFILE };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...EMPTY_PROFILE };
  const record = value as Record<string, unknown>;
  const links = Array.isArray(record.links)
    ? record.links
        .map(cleanLink)
        .filter((link): link is ProfileLink => link !== null)
        .slice(0, MAX_PROFILE_LINKS)
    : [];
  const image = typeof record.image === 'string' && isProfileImageUrl(record.image) ? record.image.trim() : '';
  return {
    description: typeof record.description === 'string' ? record.description : '',
    links,
    image
  };
}

/** The exact string written on chain: `v` first, `image` only when set. */
export function serializeProfile(profile: DaoProfile): string {
  return JSON.stringify({
    v: 1,
    description: profile.description,
    links: profile.links.map(({ label, url }) => ({ label: label.trim(), url: url.trim() })),
    ...(profile.image.trim() ? { image: profile.image.trim() } : {})
  });
}

export function profileBytes(profile: DaoProfile): number {
  return new TextEncoder().encode(serializeProfile(profile)).length;
}

/** Problems a writer must fix before submitting; empty when valid. */
export function profileProblems(profile: DaoProfile): string[] {
  const problems: string[] = [];
  const bytes = profileBytes(profile);
  if (bytes > MAX_PROFILE_BYTES) {
    problems.push(`The profile is ${bytes - MAX_PROFILE_BYTES} bytes over the ${MAX_PROFILE_BYTES}-byte limit.`);
  }
  if (profile.links.length > MAX_PROFILE_LINKS) problems.push(`Use at most ${MAX_PROFILE_LINKS} links.`);
  profile.links.forEach((link, index) => {
    const n = index + 1;
    if (!link.label.trim()) problems.push(`Link ${n} needs a label.`);
    else if ([...link.label.trim()].length > MAX_LINK_LABEL)
      problems.push(`Link ${n}'s label is longer than ${MAX_LINK_LABEL} characters.`);
    if (!isProfileLinkUrl(link.url)) problems.push(`Link ${n} must start with https://, http://, mailto: or ipfs://.`);
  });
  if (profile.image.trim() && !isProfileImageUrl(profile.image)) {
    problems.push('The image must be an ipfs:// or https:// address.');
  }
  return problems;
}

/** Lowercase hex sha256 of the profile's UTF-8 bytes, as `profile_hash()` stores it. */
export async function profileHashHex(raw: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Whether the indexed string is exactly what the chain committed to. */
export async function profileMatchesHash(raw: string, chainHashHex: string): Promise<boolean> {
  return (await profileHashHex(raw)) === chainHashHex.trim().toLowerCase();
}

/**
 * A one-line plain-text summary of a markdown description for cards, link
 * previews and metadata: the first non-empty paragraph without markdown
 * syntax, cut at `max` characters.
 */
export function plainSummary(markdown: string, max = 200): string {
  const paragraph =
    markdown
      .split(/\n\s*\n/)
      .map((block) => block.trim())
      .find((block) => block && !/^(```|---|\*\*\*|!\[)/.test(block)) ?? '';
  const text = paragraph
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
