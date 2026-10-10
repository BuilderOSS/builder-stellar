import type { UpgradeModule } from '@/lib/admin-module-versions';

/**
 * What each release changes, in members' words. The Manager's registry only stores a version and a
 * hash, so this is what voters read before approving an upgrade. Add an entry with every release in
 * releases/contracts.json (see docs/CONTRACT_UPGRADES.md).
 */
export const RELEASE_NOTES: Partial<Record<UpgradeModule, Record<string, string>>> = {
  token: {
    '0.2.0':
      'Renaming the community (name or symbol) now shows up everywhere in the app. Nothing else changes: tokens, votes and owners stay as they are.'
  }
};

export function releaseNote(module: UpgradeModule, version: string) {
  return RELEASE_NOTES[module]?.[version] ?? null;
}
