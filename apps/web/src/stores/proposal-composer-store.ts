'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { ProposalActionType, ProposalQueuedAction, ValidationResult } from '@/lib/proposal-actions/types';

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
  prepopulatedFrom?: string;
  updatedAt: number;
};

type ProposalComposerActions = {
  setStep: (address: string, daoId: string, step: 1 | 2 | 3) => void;
  nextStep: (address: string, daoId: string) => void;
  prevStep: (address: string, daoId: string) => void;
  updateMetadata: (address: string, daoId: string, patch: Partial<ProposalMetadata>) => void;
  beginCreate: (address: string, daoId: string, actionType?: ProposalActionType) => void;
  beginEdit: (address: string, daoId: string, index: number) => void;
  updateDraft: (address: string, daoId: string, draftData: any) => void;
  changeActionType: (address: string, daoId: string, actionType: ProposalActionType) => void;
  saveAction: (address: string, daoId: string, action: ProposalQueuedAction) => void;
  cancelEdit: (address: string, daoId: string) => void;
  removeAction: (address: string, daoId: string, index: number) => void;
  reorderActions: (address: string, daoId: string, fromIndex: number, toIndex: number) => void;
  addAdminAction: (data: {
    address: string;
    daoId: string;
    metadata: ProposalMetadata;
    action: ProposalQueuedAction;
    source?: string;
  }) => void;
  replaceDraft: (
    address: string,
    daoId: string,
    data: { metadata: ProposalMetadata; action?: ProposalQueuedAction; source?: string }
  ) => void;
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
  prepopulatedFrom: undefined,
  updatedAt: 0
});

const emptyDraft = createEmptyDraft();

const memoryStorage = {
  getItem: (_name: string) => null,
  setItem: (_name: string, _value: string) => undefined,
  removeItem: (_name: string) => undefined
};

const LEGACY_STORAGE_KEY = 'dao.proposal-drafts.v2';
const storage = createJSONStorage(() => {
  if (typeof window === 'undefined') return memoryStorage;

  // v3 intentionally discards unscoped v2 drafts rather than assigning them to an unknown wallet.
  window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  return window.localStorage;
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

      beginCreate: async (address, daoId, actionType = 'mint-governance-token') => {
        const { getActionHandler } = await import('@/lib/proposal-actions/registry');
        const handler = getActionHandler(actionType);
        updateDaoDraft(set, address, daoId, (draft) =>
          withUpdatedAt(draft, {
            editingState: { mode: 'create', actionType, draftData: handler.getDefaultValues() },
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

      addAdminAction: ({ address, daoId, metadata, action, source }) =>
        updateDaoDraft(set, address, daoId, (draft) =>
          withUpdatedAt(draft, {
            metadata:
              draft.queuedActions.length > 0 ||
              draft.editingState !== null ||
              Object.values(draft.metadata).some(Boolean)
                ? draft.metadata
                : metadata,
            queuedActions: [...draft.queuedActions, action],
            step: 1,
            validationErrors: null,
            formMessage: 'Action added to proposal draft',
            prepopulatedFrom: source
          })
        ),

      replaceDraft: (address, daoId, { metadata, action, source }) =>
        updateDaoDraft(set, address, daoId, () =>
          withUpdatedAt(createEmptyDraft(), {
            metadata,
            queuedActions: action ? [action] : [],
            prepopulatedFrom: source
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
      name: 'dao.proposal-drafts.v3',
      storage,
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
                  prepopulatedFrom: draft.prepopulatedFrom,
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

export const selectHasDraft = (address: string | null, daoId: string) => (state: ProposalComposerStore) => {
  if (!address) return false;
  const draft = state.draftsByWallet[normalizeWalletAddress(address)]?.[daoId];
  return Boolean(
    draft && (draft.queuedActions.length > 0 || draft.editingState || Object.values(draft.metadata).some(Boolean))
  );
};

export const selectCanProceedToStep2 = (address: string | null, daoId: string) => (state: ProposalComposerStore) => {
  const draft = selectDraft(address, daoId)(state);
  return (
    draft.metadata.title.trim().length > 0 &&
    draft.metadata.description.trim().length > 0 &&
    draft.queuedActions.length > 0
  );
};

export const selectIsEditing = (address: string | null, daoId: string) => (state: ProposalComposerStore) =>
  selectDraft(address, daoId)(state).editingState?.mode === 'edit';

export const selectEditingIndex = (address: string | null, daoId: string) => (state: ProposalComposerStore) =>
  selectDraft(address, daoId)(state).editingState?.index;

export const selectValidationErrors = (address: string | null, daoId: string) => (state: ProposalComposerStore) =>
  selectDraft(address, daoId)(state).validationErrors;
