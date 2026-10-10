/** What a community's profile is made of, as stored on chain. */
export type CommunityProfile = {
  name: string;
  symbol: string;
  /** Token base URI; carried through unchanged when renaming. */
  uri: string;
  image: string;
  description: string;
  website: string;
};

export type ProfileStep =
  | { type: 'set-token-metadata'; values: { name: string; symbol: string; uri: string }; title: string; detail: string }
  | {
      type: 'set-artwork-contract-image' | 'set-artwork-description' | 'set-artwork-project-uri';
      values: { value: string };
      title: string;
      detail: string;
    };

const same = (a: string, b: string) => a.trim() === b.trim();
const clip = (value: string, max = 60) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

/**
 * The contract calls a profile edit needs, in a stable order. Name and symbol share one
 * `set_metadata` call; the image, description and website are separate Metadata settings.
 */
export function buildProfilePlan(current: CommunityProfile, edits: Partial<CommunityProfile>): ProfileStep[] {
  const next = { ...current, ...edits };
  const steps: ProfileStep[] = [];
  if (!same(next.name, current.name) || !same(next.symbol, current.symbol))
    steps.push({
      type: 'set-token-metadata',
      values: { name: next.name.trim(), symbol: next.symbol.trim(), uri: current.uri },
      title: 'Rename the community',
      detail: `${current.name} (${current.symbol}) → ${next.name.trim()} (${next.symbol.trim()})`
    });
  if (!same(next.image, current.image))
    steps.push({
      type: 'set-artwork-contract-image',
      values: { value: next.image.trim() },
      title: 'Change the image',
      detail: 'New collection image'
    });
  if (!same(next.description, current.description))
    steps.push({
      type: 'set-artwork-description',
      values: { value: next.description.trim() },
      title: 'Change the description',
      detail: `“${clip(next.description.trim())}”`
    });
  if (!same(next.website, current.website))
    steps.push({
      type: 'set-artwork-project-uri',
      values: { value: next.website.trim() },
      title: 'Change the website',
      detail: `${current.website || 'none'} → ${next.website.trim()}`
    });
  return steps;
}

/** Renames only reach the app from token 0.2.0 on (it adds the MetadataUpdated event). */
export function tokenReportsRenames(version: string | undefined) {
  if (!version) return false;
  const [major, minor] = version.split('.').map((part) => Number.parseInt(part, 10));
  return major > 0 || (major === 0 && minor >= 2);
}
