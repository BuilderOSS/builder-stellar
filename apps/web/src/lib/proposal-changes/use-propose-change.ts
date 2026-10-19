'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

import { useDaoContext } from '@/contexts/dao-context';
import { daoRoute } from '@/lib/dao-routes';
import { useAuthSessionStore } from '@/stores/auth-session-store';

import type { ChangeRequest } from './change-request';
import { showAddedToast } from './change-toast';
import { type AddedNotice, proposeChange, type ProposeResult, resolvePendingChange } from './propose-change';
import type { ChangeResolution } from './review';

/** The toast after a change lands, with Review going to the composer. Shared by the hook and the dialog. */
export function useAddedNotice() {
  const { routeId } = useDaoContext();
  const router = useRouter();
  return useCallback(
    (notice: AddedNotice) => showAddedToast(notice, () => router.push(daoRoute(routeId, 'proposals/create'))),
    [router, routeId]
  );
}

/**
 * Add a change to this tribe's proposal draft from any page. It validates every action, adds it with an
 * undo toast, or opens ProposeChangeDialog when it repeats, clashes or is high-risk. It never navigates.
 */
export function useProposeChange() {
  const { daoId, daoConfig } = useDaoContext();
  const address = useAuthSessionStore((state) => state.address);
  const notify = useAddedNotice();

  const propose = useCallback(
    (request: ChangeRequest, options: { onAdded?: () => void } = {}): ProposeResult =>
      proposeChange({ address, daoId, config: daoConfig, request, notify, onAdded: options.onAdded }),
    [address, daoId, daoConfig, notify]
  );

  return { propose, canPropose: Boolean(address) };
}

/** For ProposeChangeDialog: answer the pending change. */
export function useResolvePendingChange() {
  const notify = useAddedNotice();
  return useCallback((resolution: ChangeResolution | 'cancel') => resolvePendingChange(resolution, notify), [notify]);
}
