'use client';

import { useMemo } from 'react';

import { useLocalDrafts } from '@/components/local-workspace/local-drafts';
import { useOptionalDaoContext } from '@/contexts/dao-context';
import { daoRouteId } from '@/lib/dao-routes';
import { useDashboardData } from '@/lib/goldsky-queries';
import { useAuthSessionStore } from '@/stores/auth-session-store';
import { useCreateDaoStore } from '@/stores/create-dao-store';
import { normalizeWalletAddress, useProposalComposerStore } from '@/stores/proposal-composer-store';

import { collectDrafts, type CommunityRef, type DraftItem } from './collect-drafts';

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
        name: dao.token_name || dao.token_symbol || 'Unnamed community',
        routeId: daoRouteId({ daoId: dao.dao_id, slug: dao.slug })
      });
    if (current)
      map.set(current.daoId, { name: current.daoConfig.tokenName || 'This community', routeId: current.routeId });
    return map;
  }, [data, current]);

  const items = useMemo(
    () => collectDrafts({ proposalDrafts, daoDrafts, communities }),
    [proposalDrafts, daoDrafts, communities]
  );

  function discard(item: DraftItem) {
    if (!item.discardable) return;
    if (item.kind === 'proposal') {
      if (address) resetProposal(address, item.id);
    } else {
      useCreateDaoStore.getState().deleteDraft(item.id);
    }
  }

  return { items, hydrated, signedIn: Boolean(address), discard };
}
