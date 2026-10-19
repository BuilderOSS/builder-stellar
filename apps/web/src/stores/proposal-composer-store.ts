'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { ProposalActionType, ProposalQueuedAction, ValidationResult } from '@/lib/proposal-actions/types';
import { migrateDraftsV3 } from '@/lib/proposal-changes/migrate-drafts';
import { moveQueueItem, removeFromQueue, replaceInQueue } from '@/lib/proposal-changes/queue';

export type ProposalMetadata = {
  title: string;
  description: string;
  url: string;
};

export type EditingState = {
  mode: 'create' | 'edit';
  actionType: ProposalActionType;
  index?: number;
  draftData: any;
};

export type ProposalDraft = {
  step: 1 | 2 | 3;
  metadata: ProposalMetadata;
  queuedActions: ProposalQueuedAction[];
  editingState: EditingState | null;
  validationErrors: ValidationResult | null;
  formMessage: string;
  busy: boolean;
  updatedAt: number;
};

type ProposalComposerActions = {
  setStep: (address: string, daoId: string, step: 1 | 2 | 3) => void;
  nextStep: (address: string, daoId: string) => void;
  prevStep: (address: string, daoId: string) => void;
  updateMetadata: (address: string, daoId: string, patch: Partial<ProposalMetadata>) => void;
  /** Start a new action of a type the member picked, from its live value when known. Nothing is pre-selected. */
  beginCreate: (address: string, daoId: string, actionType: ProposalActionType, draftData?: unknown) => void;
  beginEdit: (address: string, daoId: string, index: number) => void;
  updateDraft: (address: string, daoId: string, draftData: any) => void;
  changeActionType: (address: string, daoId: string, actionType: ProposalActionType) => void;
  saveAction: (address: string, daoId: string, action: ProposalQueuedAction) => void;
  replaceAction: (address: string, daoId: string, index: number, action: ProposalQueuedAction) => void;
  cancelEdit: (address: string, daoId: string) => void;
  removeAction: (address: string, daoId: string, index: number) => void;
  reorderActions: (address: string, daoId: string, fromIndex: number, toIndex: number) => void;
  /**
   * Add changes to the proposal. Never moves the composer to another step and never touches the
   * proposal's title or description. With `replaces`, the new actions take the replaced ones' place.
   */
  addChanges: (address: string, daoId: string, actions: ProposalQueuedAction[], replaces?: string[]) => void;
  /** Swap queued actions (a bundle as a whole) for new ones, keeping their position. */
  replaceById: (address: string, daoId: string, ids: string[], actions: ProposalQueuedAction[]) => void;
  /** Take an action out; an action inside a bundle takes its whole bundle with it. */
  removeById: (address: string, daoId: string, id: string) => void;
  removeBundle: (address: string, daoId: string, bundleId: string) => void;
  /** Move a queue row (a bundle with all its steps) to another row's place. */
  moveItem: (address: string, daoId: string, fromItem: number, toItem: number) => void;
  /** Put back an earlier queue, for undo. */
  restore: (address: string, daoId: string, queuedActions: ProposalQueuedAction[]) => void;
  setValidationErrors: (address: string, daoId: string, errors: ValidationResult | null) => void;
  clearValidationErrors: (address: string, daoId: string) => void;
  setFormMessage: (address: string, daoId: string, message: string) => void;
  clearFormMessage: (address: string, daoId: string) => void;
  setBusy: (address: string, daoId: string, busy: boolean) => void;
  reset: (address: string, daoId: string) => void;
  resetDraft: (address: string, daoId: string) => void;
};

type ProposalComposerStore = {
  draftsByWallet: Record<string, Record<string, ProposalDraft>>;
} & ProposalComposerActions;

const emptyMetadata: ProposalMetadata = { title: '', description: '', url: '' };

export const createEmptyDraft = (): ProposalDraft => ({
  step: 1,
  metadata: { ...emptyMetadata },
  queuedActions: [],
  editingState: null,
  validationErrors: null,
  formMessage: '',
  busy: false,
  updatedAt: 0
});

const emptyDraft = createEmptyDraft();

/**
 * Drop queued actions (and an in-progress edit) whose type is no longer supported, e.g. a draft saved
 * before an action type was removed. Returns the cleaned drafts plus how many actions were removed.
 */
export function sanitizeDrafts(
  draftsByWallet: Record<string, Record<string, ProposalDraft>>,
  isKnownType: (type: string) => boolean
): { draftsByWallet: Record<string, Record<string, ProposalDraft>>; removed: number } {
  let removed = 0;
  const result: Record<string, Record<string, ProposalDraft>> = {};
  for (const [wallet, drafts] of Object.entries(draftsByWallet ?? {})) {
    result[wallet] = {};
    for (const [daoId, draft] of Object.entries(drafts ?? {})) {
      const queued = Array.isArray(draft.queuedActions) ? draft.queuedActions : [];
      const kept = queued.filter((action) => action && isKnownType(action.type));
      let dropped = queued.length - kept.length;
      let editingState = draft.editingState ?? null;
      if (editingState && !isKnownType(editingState.actionType)) {
        editingState = null;
        dropped += 1;
      } else if (editingState?.mode === 'edit' && editingState.index !== undefined && dropped > 0) {
        // Indices shifted; abandon the in-progress edit rather than editing the wrong action.
        editingState = null;
      }
      removed += dropped;
      result[wallet][daoId] =
        dropped > 0
          ? {
              ...draft,
              queuedActions: kept,
              editingState,
              formMessage: `${dropped} unsupported action${dropped === 1 ? ' was' : 's were'} removed from this draft`
            }
          : draft;
    }
  }
  return { draftsByWallet: result, removed };
}

const memoryStorage = {
  getItem: (_name: string) => null,
  setItem: (_name: string, _value: string) => undefined,
  removeItem: (_name: string) => undefined
};

export const STORAGE_KEY = 'dao.proposal-drafts.v4';
const V3_STORAGE_KEY = 'dao.proposal-drafts.v3';
const V2_STORAGE_KEY = 'dao.proposal-drafts.v2';

/** A saved v3 store as v4, or null when there is nothing to carry over. */
export function migrateStoredV3(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { state?: { draftsByWallet?: Record<string, Record<string, any>> } };
    return JSON.stringify({ state: { draftsByWallet: migrateDraftsV3(parsed.state?.draftsByWallet) }, version: 0 });
  } catch {
    return null;
  }
}

const storage = createJSONStorage(() => {
  if (typeof window === 'undefined') return memoryStorage;
  const local = window.localStorage;

  // v3 intentionally discarded unscoped v2 drafts rather than assigning them to an unknown wallet.
  local.removeItem(V2_STORAGE_KEY);
  return {
    getItem: (name: string) => {
      const current = local.getItem(name);
      if (current !== null || name !== STORAGE_KEY) return current;
      // v4 stamps each action with its source and stores open-pool closing times as unix seconds.
      const migrated = migrateStoredV3(local.getItem(V3_STORAGE_KEY));
      if (migrated) {
        local.setItem(STORAGE_KEY, migrated);
        local.removeItem(V3_STORAGE_KEY);
      }
      return migrated;
    },
    setItem: (name: string, value: string) => local.setItem(name, value),
    removeItem: (name: string) => local.removeItem(name)
  };
});

function withUpdatedAt(draft: ProposalDraft, patch: Partial<ProposalDraft>): ProposalDraft {
  return { ...draft, ...patch, updatedAt: Date.now() };
}

export function normalizeWalletAddress(address: string) {
  return address.trim().toUpperCase();
}

function updateDaoDraft(
  set: (updater: (state: ProposalComposerStore) => Partial<ProposalComposerStore>) => void,
  address: string,
  daoId: string,
  update: (draft: ProposalDraft) => ProposalDraft
) {
  const walletAddress = normalizeWalletAddress(address);
  if (!walletAddress) return;

  set((state) => {
    const walletDrafts = state.draftsByWallet[walletAddress] ?? {};
    const current = walletDrafts[daoId] ?? createEmptyDraft();
    return {
      draftsByWallet: {
        ...state.draftsByWallet,
        [walletAddress]: { ...walletDrafts, [daoId]: update(current) }
      }
    };
  });
}

export const useProposalComposerStore = create<ProposalComposerStore>()(
  persist(
    (set, get) => ({
      draftsByWallet: {},

      setStep: (address, daoId, step) => updateDaoDraft(set, address, daoId, (draft) => withUpdatedAt(draft, { step })),
      nextStep: (address, daoId) =>
        updateDaoDraft(set, address, daoId, (draft) =>
          withUpdatedAt(draft, { step: Math.min(3, draft.step + 1) as 1 | 2 | 3 })
        ),
      prevStep: (address, daoId) =>
        updateDaoDraft(set, address, daoId, (draft) =>
          withUpdatedAt(draft, { step: Math.max(1, draft.step - 1) as 1 | 2 | 3 })
        ),

      updateMetadata: (address, daoId, patch) =>
        updateDaoDraft(set, address, daoId, (draft) =>
          withUpdatedAt(draft, { metadata: { ...draft.metadata, ...patch } })
        ),

      beginCreate: async (address, daoId, actionType, draftData) => {
        const { getActionHandler } = await import('@/lib/proposal-actions/registry');
        const handler = getActionHandler(actionType);
        updateDaoDraft(set, address, daoId, (draft) =>
          withUpdatedAt(draft, {
            editingState: { mode: 'create', actionType, draftData: draftData ?? handler.getDefaultValues() },
            validationErrors: null,
            formMessage: ''
          })
        );
      },

      beginEdit: async (address, daoId, index) => {
        const walletAddress = normalizeWalletAddress(address);
        const current = get().draftsByWallet[walletAddress]?.[daoId] ?? emptyDraft;
        const action = current.queuedActions[index];
        if (!action) return;

        const { getActionHandler } = await import('@/lib/proposal-actions/registry');
        const handler = getActionHandler(action.type);
        updateDaoDraft(set, address, daoId, (draft) =>
          withUpdatedAt(draft, {
            editingState: { mode: 'edit', actionType: action.type, index, draftData: handler.deserialize(action) },
            validationErrors: null,
            formMessage: ''
          })
        );
      },

      updateDraft: (address, daoId, draftData) =>
        updateDaoDraft(set, address, daoId, (draft) =>
          draft.editingState ? withUpdatedAt(draft, { editingState: { ...draft.editingState, draftData } }) : draft
        ),

      changeActionType: async (address, daoId, actionType) => {
        const { getActionHandler } = await import('@/lib/proposal-actions/registry');
        const handler = getActionHandler(actionType);
        updateDaoDraft(set, address, daoId, (draft) =>
          draft.editingState
            ? withUpdatedAt(draft, {
                editingState: { ...draft.editingState, actionType, draftData: handler.getDefaultValues() },
                validationErrors: null
              })
            : draft
        );
      },

      saveAction: (address, daoId, action) =>
        updateDaoDraft(set, address, daoId, (draft) => {
          const editingState = draft.editingState;
          if (!editingState) return draft;

          if (editingState.mode === 'edit' && editingState.index !== undefined) {
            const queuedActions = [...draft.queuedActions];
            queuedActions[editingState.index] = action;
            return withUpdatedAt(draft, { queuedActions, editingState: null, formMessage: 'Action updated' });
          }

          return withUpdatedAt(draft, {
            queuedActions: [...draft.queuedActions, action],
            editingState: null,
            formMessage: 'Action added'
          });
        }),

      replaceAction: (address, daoId, index, action) =>
        updateDaoDraft(set, address, daoId, (draft) => {
          if (!draft.queuedActions[index]) return draft;
          const queuedActions = [...draft.queuedActions];
          queuedActions[index] = action;
          return withUpdatedAt(draft, { queuedActions, formMessage: 'Action replaced in proposal draft' });
        }),

      cancelEdit: (address, daoId) =>
        updateDaoDraft(set, address, daoId, (draft) => withUpdatedAt(draft, { editingState: null, formMessage: '' })),

      removeAction: (address, daoId, index) =>
        updateDaoDraft(set, address, daoId, (draft) => {
          const queuedActions = [...draft.queuedActions];
          queuedActions.splice(index, 1);
          const editingState = draft.editingState;
          const nextEditingState =
            editingState?.index === undefined
              ? editingState
              : editingState.index === index
                ? null
                : editingState.index > index
                  ? { ...editingState, index: editingState.index - 1 }
                  : editingState;
          return withUpdatedAt(draft, { queuedActions, editingState: nextEditingState, formMessage: 'Action removed' });
        }),

      reorderActions: (address, daoId, fromIndex, toIndex) =>
        updateDaoDraft(set, address, daoId, (draft) => {
          const queuedActions = [...draft.queuedActions];
          const [removed] = queuedActions.splice(fromIndex, 1);
          queuedActions.splice(toIndex, 0, removed);
          return withUpdatedAt(draft, { queuedActions });
        }),

      addChanges: (address, daoId, actions, replaces) =>
        updateDaoDraft(set, address, daoId, (draft) =>
          withUpdatedAt(draft, {
            queuedActions: replaces?.length
              ? replaceInQueue(draft.queuedActions, replaces, actions)
              : [...draft.queuedActions, ...actions],
            validationErrors: null
          })
        ),

      replaceById: (address, daoId, ids, actions) =>
        updateDaoDraft(set, address, daoId, (draft) =>
          withUpdatedAt(draft, { queuedActions: replaceInQueue(draft.queuedActions, ids, actions) })
        ),

      removeById: (address, daoId, id) =>
        updateDaoDraft(set, address, daoId, (draft) => {
          const queuedActions = removeFromQueue(draft.queuedActions, [id]);
          // An edit of a removed action has nothing left to save into.
          const editingIndex = draft.editingState?.index;
          const editedId = editingIndex === undefined ? undefined : draft.queuedActions[editingIndex]?.id;
          const editingState =
            editedId === undefined
              ? draft.editingState
              : queuedActions.some((action) => action.id === editedId)
                ? { ...draft.editingState!, index: queuedActions.findIndex((action) => action.id === editedId) }
                : null;
          return withUpdatedAt(draft, { queuedActions, editingState });
        }),

      removeBundle: (address, daoId, bundleId) =>
        updateDaoDraft(set, address, daoId, (draft) =>
          withUpdatedAt(draft, {
            queuedActions: draft.queuedActions.filter((action) => action.bundleId !== bundleId),
            editingState: draft.editingState?.mode === 'edit' ? null : draft.editingState
          })
        ),

      moveItem: (address, daoId, fromItem, toItem) =>
        updateDaoDraft(set, address, daoId, (draft) =>
          withUpdatedAt(draft, {
            queuedActions: moveQueueItem(draft.queuedActions, fromItem, toItem),
            // Indices move with the rows; an open edit would save into the wrong place.
            editingState: draft.editingState?.mode === 'edit' ? null : draft.editingState
          })
        ),

      restore: (address, daoId, queuedActions) =>
        updateDaoDraft(set, address, daoId, (draft) =>
          withUpdatedAt(draft, {
            queuedActions,
            editingState: draft.editingState?.mode === 'edit' ? null : draft.editingState
          })
        ),

      setValidationErrors: (address, daoId, validationErrors) =>
        updateDaoDraft(set, address, daoId, (draft) => withUpdatedAt(draft, { validationErrors })),
      clearValidationErrors: (address, daoId) =>
        updateDaoDraft(set, address, daoId, (draft) => withUpdatedAt(draft, { validationErrors: null })),
      setFormMessage: (address, daoId, formMessage) =>
        updateDaoDraft(set, address, daoId, (draft) => withUpdatedAt(draft, { formMessage })),
      clearFormMessage: (address, daoId) =>
        updateDaoDraft(set, address, daoId, (draft) => withUpdatedAt(draft, { formMessage: '' })),
      setBusy: (address, daoId, busy) => updateDaoDraft(set, address, daoId, (draft) => withUpdatedAt(draft, { busy })),
      reset: (address, daoId) =>
        set((state) => {
          const walletAddress = normalizeWalletAddress(address);
          if (!walletAddress) return state;
          const walletDrafts = { ...(state.draftsByWallet[walletAddress] ?? {}) };
          delete walletDrafts[daoId];
          return { draftsByWallet: { ...state.draftsByWallet, [walletAddress]: walletDrafts } };
        }),
      resetDraft: (address, daoId) =>
        updateDaoDraft(set, address, daoId, (draft) =>
          withUpdatedAt(draft, { editingState: null, validationErrors: null, formMessage: '' })
        )
    }),
    {
      name: STORAGE_KEY,
      storage,
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        void import('@/lib/proposal-actions/registry').then(({ isRegisteredActionType }) => {
          const { draftsByWallet, removed } = sanitizeDrafts(state.draftsByWallet, isRegisteredActionType);
          if (removed > 0) useProposalComposerStore.setState({ draftsByWallet });
        });
      },
      partialize: (state) => ({
        draftsByWallet: Object.fromEntries(
          Object.entries(state.draftsByWallet).map(([address, drafts]) => [
            address,
            Object.fromEntries(
              Object.entries(drafts).map(([daoId, draft]) => [
                daoId,
                {
                  step: draft.step,
                  metadata: draft.metadata,
                  queuedActions: draft.queuedActions,
                  editingState: draft.editingState,
                  updatedAt: draft.updatedAt,
                  validationErrors: null,
                  formMessage: '',
                  busy: false
                }
              ])
            )
          ])
        )
      })
    }
  )
);

export const selectDraft = (address: string | null, daoId: string) => (state: ProposalComposerStore) => {
  if (!address) return emptyDraft;
  return state.draftsByWallet[normalizeWalletAddress(address)]?.[daoId] ?? emptyDraft;
};

/** Whether someone has started this draft: any action, an action being edited, or any proposal text. */
export function proposalDraftHasContent(draft: ProposalDraft | undefined) {
  return Boolean(
    draft && (draft.queuedActions.length > 0 || draft.editingState || Object.values(draft.metadata).some(Boolean))
  );
}

export const selectHasDraft = (address: string | null, daoId: string) => (state: ProposalComposerStore) => {
  if (!address) return false;
  return proposalDraftHasContent(state.draftsByWallet[normalizeWalletAddress(address)]?.[daoId]);
};

/**
 * Whether the composer can move on to Review. Changes can come before the "why": only a change is needed
 * here, and Review asks for the title and description before anything is signed.
 */
export const selectCanProceedToStep2 = (address: string | null, daoId: string) => (state: ProposalComposerStore) =>
  selectDraft(address, daoId)(state).queuedActions.length > 0;

export const selectIsEditing = (address: string | null, daoId: string) => (state: ProposalComposerStore) =>
  selectDraft(address, daoId)(state).editingState?.mode === 'edit';

export const selectEditingIndex = (address: string | null, daoId: string) => (state: ProposalComposerStore) =>
  selectDraft(address, daoId)(state).editingState?.index;

export const selectValidationErrors = (address: string | null, daoId: string) => (state: ProposalComposerStore) =>
  selectDraft(address, daoId)(state).validationErrors;
