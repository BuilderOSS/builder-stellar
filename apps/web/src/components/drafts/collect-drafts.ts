import { relativeTime } from '@/lib/activity-feed';
import { daoRoute } from '@/lib/dao-routes';
import type { LocalDaoDraft } from '@/stores/create-dao-store';
import { type ProposalDraft, proposalDraftHasContent } from '@/stores/proposal-composer-store';

export type DraftItem = {
  kind: 'proposal' | 'dao';
  /** daoId for proposal drafts, draft id for DAO drafts. */
  id: string;
  title: string;
  meta: string;
  href: string;
  updatedAt: number;
  /** False for a DAO draft whose deployment record must be kept for recovery. */
  discardable: boolean;
};

export type CommunityRef = { name: string; routeId: string };

const shortId = (id: string) => (id.length > 12 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id);
const saved = (updatedAt: number, now: number) =>
  updatedAt ? `saved ${relativeTime(Math.floor(updatedAt / 1000), now)}` : 'saved on this browser';

/** Where a DAO-creation draft stands once it has been sent; nothing to add while it is only a draft. */
export function daoDraftStatus(draft: LocalDaoDraft) {
  return draft.deployment?.status === 'confirmed'
    ? 'Created, in setup'
    : draft.deployment
      ? 'Creating, needs a check'
      : '';
}

/**
 * Every draft on this browser in one list, newest first: proposal drafts for the connected wallet and
 * DAO-creation drafts. Untouched drafts (opened but never filled in) are left out.
 */
export function collectDrafts({
  proposalDrafts,
  daoDrafts,
  communities,
  now = Date.now()
}: {
  proposalDrafts: Record<string, ProposalDraft>;
  daoDrafts: LocalDaoDraft[];
  communities: Map<string, CommunityRef>;
  now?: number;
}): DraftItem[] {
  const proposals: DraftItem[] = Object.entries(proposalDrafts)
    .filter(([, draft]) => proposalDraftHasContent(draft))
    .map(([daoId, draft]) => {
      const community = communities.get(daoId);
      const count = draft.queuedActions.length;
      return {
        kind: 'proposal',
        id: daoId,
        title: draft.metadata.title.trim() || 'Untitled proposal',
        meta: [
          community?.name ?? shortId(daoId),
          count ? `${count} ${count === 1 ? 'change' : 'changes'}` : 'no changes yet',
          saved(draft.updatedAt, now)
        ].join(' · '),
        href: daoRoute(community?.routeId ?? daoId, 'proposals/create'),
        updatedAt: draft.updatedAt,
        discardable: true
      };
    });
  const daos: DraftItem[] = daoDrafts
    .filter((draft) => draft.deployment || draft.configuration.basicInfo.tokenName.trim())
    .map((draft) => ({
      kind: 'dao',
      id: draft.id,
      title: draft.configuration.basicInfo.tokenName.trim() || 'Untitled DAO',
      meta: [daoDraftStatus(draft), saved(draft.updatedAt, now)].filter(Boolean).join(' · '),
      href: `/create?draft=${encodeURIComponent(draft.id)}`,
      updatedAt: draft.updatedAt,
      discardable: !draft.deployment || draft.deployment.status === 'failed'
    }));
  return [...proposals, ...daos].sort((a, b) => b.updatedAt - a.updatedAt);
}
