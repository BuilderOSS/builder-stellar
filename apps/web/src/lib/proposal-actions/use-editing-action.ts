'use client';

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

import { useDaoContext } from '@/contexts/dao-context';
import type { ProposalQueuedAction } from '@/lib/proposal-actions/types';
import { useAuthSessionStore } from '@/stores/auth-session-store';
import { selectDraft, useProposalComposerStore } from '@/stores/proposal-composer-store';

import { ACTION_PARAM } from './action-request';

/** The `?action=` id on this page's URL, read on the client only. */
function readActionParam() {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(ACTION_PARAM);
}

// replaceState fires no event, so clearing the param tells its readers directly.
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('popstate', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('popstate', listener);
  };
}

function clearActionParam() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has(ACTION_PARAM)) return;
  url.searchParams.delete(ACTION_PARAM);
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  listeners.forEach((listener) => listener());
}

/**
 * The edit round trip: a queued action's Edit opens its page with `?action=<id>`, the page loads that
 * action (and the rest of its bundle) into its form, and saving replaces it by id, in the same place.
 */
export function useEditingAction({
  accepts,
  onLoad
}: {
  /** Whether this page (or this form on it) makes the action. */
  accepts: (action: ProposalQueuedAction) => boolean;
  onLoad: (action: ProposalQueuedAction, bundle: ProposalQueuedAction[]) => void;
}) {
  const { daoId } = useDaoContext();
  const address = useAuthSessionStore((state) => state.address);
  const queued = useProposalComposerStore(selectDraft(address || null, daoId)).queuedActions;
  // The server render has no URL query; the client reads it after hydrating.
  const id = useSyncExternalStore(subscribe, readActionParam, () => null);
  const loaded = useRef<string | null>(null);
  // The latest callbacks, for the load effect; Next's bundled React has no useEffectEvent yet.
  const latest = useRef({ accepts, onLoad });
  useEffect(() => {
    latest.current = { accepts, onLoad };
  });

  const found = id ? (queued.find((action) => action.id === id) ?? null) : null;
  const editing = found && accepts(found) ? found : null;
  const bundle = editing?.bundleId
    ? queued.filter((action) => action.bundleId === editing.bundleId)
    : editing
      ? [editing]
      : [];

  useEffect(() => {
    if (!found || loaded.current === found.id || !latest.current.accepts(found)) return;
    loaded.current = found.id;
    latest.current.onLoad(
      found,
      found.bundleId ? queued.filter((action) => action.bundleId === found.bundleId) : [found]
    );
  }, [found, queued]);

  /** Stop editing: after the action is saved, or when the member cancels. */
  const done = useCallback(() => clearActionParam(), []);

  return { editing, bundle, replaces: editing ? [editing.id] : undefined, done };
}
