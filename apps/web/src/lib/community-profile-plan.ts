import { type DaoProfile, serializeProfile } from '@/lib/dao-profile';

/** What a community's profile is made of: the token's name and symbol plus the profile JSON. */
export type CommunityProfile = {
  name: string;
  symbol: string;
  profile: DaoProfile;
};

export type ProfileStep =
  | { type: 'set-token-metadata'; values: { name: string; symbol: string }; title: string; detail: string }
  | {
      type: 'update-dao-profile';
      values: { expectedSeq: number; profile: string };
      title: string;
      detail: string;
    };

const same = (a: string, b: string) => a.trim() === b.trim();
const linksKey = (profile: DaoProfile) =>
  JSON.stringify(profile.links.map(({ label, url }) => [label.trim(), url.trim()]));

/** Which parts of the profile JSON differ, in members' words. */
export function profileChanges(current: DaoProfile, next: DaoProfile): string[] {
  const changes: string[] = [];
  if (!same(next.description, current.description)) changes.push('description');
  if (linksKey(next) !== linksKey(current)) changes.push('links');
  if (!same(next.image, current.image)) changes.push('image');
  return changes;
}

/**
 * The contract calls a profile edit needs, in a stable order: name and symbol
 * share one `set_metadata` call on the token; description, links and image are
 * one `update_profile` call on Metadata that names the revision it replaces.
 */
export function buildProfilePlan(
  current: CommunityProfile,
  edits: Partial<CommunityProfile>,
  currentSeq: number | null
): ProfileStep[] {
  const next = { ...current, ...edits };
  const steps: ProfileStep[] = [];
  if (!same(next.name, current.name) || !same(next.symbol, current.symbol))
    steps.push({
      type: 'set-token-metadata',
      values: { name: next.name.trim(), symbol: next.symbol.trim() },
      title: 'Rename the community',
      detail: `${current.name} (${current.symbol}) → ${next.name.trim()} (${next.symbol.trim()})`
    });
  const changes = profileChanges(current.profile, next.profile);
  if (changes.length)
    steps.push({
      type: 'update-dao-profile',
      values: { expectedSeq: currentSeq ?? -1, profile: serializeProfile(next.profile) },
      title: 'Update the profile',
      detail: `New ${changes.join(', ')}`
    });
  return steps;
}
