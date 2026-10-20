'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

import { useDaoContext } from '@/contexts/dao-context';
import { daoRoute } from '@/lib/dao-routes';
import { useAuthSessionStore } from '@/stores/auth-session-store';

import type { ActionRequest } from './action-request';
import { showAddedToast } from './action-toast';
import { type AddedNotice, proposeAction, type ProposeResult, resolvePendingAction } from './propose-action';
import type { ActionResolution } from './review';

/** The toast after an action lands, with Review going to the composer. Shared by the hook and the dialog. */
export function useAddedNotice() {
  const { routeId } = useDaoContext();
  const router = useRouter();
  return useCallback(
    (notice: AddedNotice) => showAddedToast(notice, () => router.push(daoRoute(routeId, 'proposals/create'))),
    [router, routeId]
  );
}

/**
 * Add an action to this tribe's proposal draft from any page. It validates every action, adds it with an
 * undo toast, or opens ProposeActionDialog when it repeats, clashes or is high-risk. It never navigates.
 */
export function useProposeAction() {
  const { daoId, daoConfig } = useDaoContext();
  const address = useAuthSessionStore((state) => state.address);
  const notify = useAddedNotice();

  const propose = useCallback(
    (request: ActionRequest, options: { onAdded?: () => void } = {}): ProposeResult =>
      proposeAction({ address, daoId, config: daoConfig, request, notify, onAdded: options.onAdded }),
    [address, daoId, daoConfig, notify]
  );

  return { propose, canPropose: Boolean(address) };
}

/** For ProposeActionDialog: answer the pending action. */
export function useResolvePendingAction() {
  const notify = useAddedNotice();
  return useCallback((resolution: ActionResolution | 'cancel') => resolvePendingAction(resolution, notify), [notify]);
}
