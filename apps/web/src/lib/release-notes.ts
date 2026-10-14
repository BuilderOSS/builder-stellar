import type { UpgradeModule } from '@/lib/admin-module-versions';

/**
 * What each release changes, in members' words. The Manager's registry only stores a version and a
 * hash, so this is what voters read before approving an upgrade. Add an entry with every release in
 * releases/contracts.json (see docs/CONTRACT_UPGRADES.md).
 */
export const RELEASE_NOTES: Partial<Record<UpgradeModule, Record<string, string>>> = {
  governor: {
    '0.2.0':
      'Members can comment on proposals, for discussion and updates. Comments are public and permanent, and anyone can post one. Vote reasons are now capped at about 1,350 words. Proposals and votes stay as they are.'
  },
  auction: {
    '0.2.0':
      'Bidders can add a short comment to a bid, shown with it on the auction page. The current auction and its bids carry over.'
  },
  marketplace: {
    '0.2.0':
      'Anyone can comment on a listing. A resale token keeps its comments across listings. Listings and sales stay as they are.'
  },
  token: {
    '0.2.0':
      'Renaming the tribe (name or symbol) now shows up everywhere in the app. Nothing else changes: tokens, votes and owners stay as they are.'
  }
};

export function releaseNote(module: UpgradeModule, version: string) {
  return RELEASE_NOTES[module]?.[version] ?? null;
}
