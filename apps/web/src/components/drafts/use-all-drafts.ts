'use client';

import { useEffect, useMemo } from 'react';

import { useLocalDrafts } from '@/components/local-workspace/local-drafts';
import { useOptionalDaoContext } from '@/contexts/dao-context';
import { daoRouteId } from '@/lib/dao-routes';
import { useDashboardData } from '@/lib/goldsky-queries';
import { useAuthSessionStore } from '@/stores/auth-session-store';
import { useCreateDaoStore } from '@/stores/create-dao-store';
import { normalizeWalletAddress, useProposalComposerStore } from '@/stores/proposal-composer-store';

import { collectDrafts, type CommunityRef, createdToken, type DraftItem } from './collect-drafts';
import { retireCreatedDraft } from './retire-created-draft';

const NO_DRAFTS = {};

/** Every draft on this browser (proposals for the connected wallet, plus new DAOs) and how to discard one. */
export function useAllDrafts() {
  const address = useAuthSessionStore((state) => state.address);
  const walletKey = address ? normalizeWalletAddress(address) : '';
  const proposalDrafts = useProposalComposerStore(
    (state) => (walletKey && state.draftsByWallet[walletKey]) || NO_DRAFTS
  );
  const resetProposal = useProposalComposerStore((state) => state.reset);
  const { drafts: daoDrafts, hydrated } = useLocalDrafts();
  const { data } = useDashboardData(address ?? '');
  const current = useOptionalDaoContext();

  const communities = useMemo(() => {
    const map = new Map<string, CommunityRef>();
    for (const dao of data?.myDaos ?? [])
      map.set(dao.dao_id, {
        name: dao.token_name || dao.token_symbol || 'Unnamed tribe',
        routeId: daoRouteId({ daoId: dao.dao_id, slug: dao.slug })
      });
    if (current)
      map.set(current.daoId, { name: current.daoConfig.tokenName || 'This tribe', routeId: current.routeId });
    return map;
  }, [data, current]);

  const items = useMemo(
    () => collectDrafts({ proposalDrafts, daoDrafts, communities }),
    [proposalDrafts, daoDrafts, communities]
  );

  // A created community that now shows in your communities is done with its draft: clear it out.
  useEffect(() => {
    if (!hydrated) return;
    for (const draft of daoDrafts) {
      const token = createdToken(draft);
      if (token && communities.has(token)) retireCreatedDraft(draft);
    }
  }, [hydrated, daoDrafts, communities]);

  function discard(item: DraftItem) {
    if (!item.discardable) return;
    if (item.kind === 'proposal') {
      if (address) resetProposal(address, item.id);
      return;
    }
    const draft = daoDrafts.find((d) => d.id === item.id);
    if (draft && item.created) retireCreatedDraft(draft);
    else useCreateDaoStore.getState().deleteDraft(item.id);
  }

  return { items, hydrated, signedIn: Boolean(address), discard };
}
