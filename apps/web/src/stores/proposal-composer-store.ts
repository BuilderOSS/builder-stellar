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
  setStep: (daoId: string, step: 1 | 2 | 3) => void;
  nextStep: (daoId: string) => void;
  prevStep: (daoId: string) => void;
  updateMetadata: (daoId: string, patch: Partial<ProposalMetadata>) => void;
  beginCreate: (daoId: string, actionType?: ProposalActionType) => void;
  beginEdit: (daoId: string, index: number) => void;
  updateDraft: (daoId: string, draftData: any) => void;
  changeActionType: (daoId: string, actionType: ProposalActionType) => void;
  saveAction: (daoId: string, action: ProposalQueuedAction) => void;
  cancelEdit: (daoId: string) => void;
  removeAction: (daoId: string, index: number) => void;
  reorderActions: (daoId: string, fromIndex: number, toIndex: number) => void;
  addAdminAction: (data: {
    daoId: string;
    metadata: ProposalMetadata;
    action: ProposalQueuedAction;
    source?: string;
  }) => void;
  replaceDraft: (
    daoId: string,
    data: { metadata: ProposalMetadata; action?: ProposalQueuedAction; source?: string }
  ) => void;
  setValidationErrors: (daoId: string, errors: ValidationResult | null) => void;
  clearValidationErrors: (daoId: string) => void;
  setFormMessage: (daoId: string, message: string) => void;
  clearFormMessage: (daoId: string) => void;
  setBusy: (daoId: string, busy: boolean) => void;
  reset: (daoId: string) => void;
  resetDraft: (daoId: string) => void;
};

type ProposalComposerStore = {
  draftsByDaoId: Record<string, ProposalDraft>;
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

const storage = createJSONStorage(() => (typeof window === 'undefined' ? memoryStorage : window.localStorage));

function withUpdatedAt(draft: ProposalDraft, patch: Partial<ProposalDraft>): ProposalDraft {
  return { ...draft, ...patch, updatedAt: Date.now() };
}

function updateDaoDraft(
  set: (updater: (state: ProposalComposerStore) => Partial<ProposalComposerStore>) => void,
  daoId: string,
  update: (draft: ProposalDraft) => ProposalDraft
) {
  set((state) => {
    const current = state.draftsByDaoId[daoId] ?? createEmptyDraft();
    return { draftsByDaoId: { ...state.draftsByDaoId, [daoId]: update(current) } };
  });
}

export const useProposalComposerStore = create<ProposalComposerStore>()(
  persist(
    (set, get) => ({
      draftsByDaoId: {},

      setStep: (daoId, step) => updateDaoDraft(set, daoId, (draft) => withUpdatedAt(draft, { step })),
      nextStep: (daoId) =>
        updateDaoDraft(set, daoId, (draft) => withUpdatedAt(draft, { step: Math.min(3, draft.step + 1) as 1 | 2 | 3 })),
      prevStep: (daoId) =>
        updateDaoDraft(set, daoId, (draft) => withUpdatedAt(draft, { step: Math.max(1, draft.step - 1) as 1 | 2 | 3 })),

      updateMetadata: (daoId, patch) =>
        updateDaoDraft(set, daoId, (draft) => withUpdatedAt(draft, { metadata: { ...draft.metadata, ...patch } })),

      beginCreate: async (daoId, actionType = 'mint-governance-token') => {
        const { getActionHandler } = await import('@/lib/proposal-actions/registry');
        const handler = getActionHandler(actionType);
        updateDaoDraft(set, daoId, (draft) =>
          withUpdatedAt(draft, {
            editingState: { mode: 'create', actionType, draftData: handler.getDefaultValues() },
            validationErrors: null,
            formMessage: ''
          })
        );
      },

      beginEdit: async (daoId, index) => {
        const current = get().draftsByDaoId[daoId] ?? emptyDraft;
        const action = current.queuedActions[index];
        if (!action) return;

        const { getActionHandler } = await import('@/lib/proposal-actions/registry');
        const handler = getActionHandler(action.type);
        updateDaoDraft(set, daoId, (draft) =>
          withUpdatedAt(draft, {
            editingState: { mode: 'edit', actionType: action.type, index, draftData: handler.deserialize(action) },
            validationErrors: null,
            formMessage: ''
          })
        );
      },

      updateDraft: (daoId, draftData) =>
        updateDaoDraft(set, daoId, (draft) =>
          draft.editingState ? withUpdatedAt(draft, { editingState: { ...draft.editingState, draftData } }) : draft
        ),

      changeActionType: async (daoId, actionType) => {
        const { getActionHandler } = await import('@/lib/proposal-actions/registry');
        const handler = getActionHandler(actionType);
        updateDaoDraft(set, daoId, (draft) =>
          draft.editingState
            ? withUpdatedAt(draft, {
                editingState: { ...draft.editingState, actionType, draftData: handler.getDefaultValues() },
                validationErrors: null
              })
            : draft
        );
      },

      saveAction: (daoId, action) =>
        updateDaoDraft(set, daoId, (draft) => {
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

      cancelEdit: (daoId) =>
        updateDaoDraft(set, daoId, (draft) => withUpdatedAt(draft, { editingState: null, formMessage: '' })),

      removeAction: (daoId, index) =>
        updateDaoDraft(set, daoId, (draft) => {
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

      reorderActions: (daoId, fromIndex, toIndex) =>
        updateDaoDraft(set, daoId, (draft) => {
          const queuedActions = [...draft.queuedActions];
          const [removed] = queuedActions.splice(fromIndex, 1);
          queuedActions.splice(toIndex, 0, removed);
          return withUpdatedAt(draft, { queuedActions });
        }),

      addAdminAction: ({ daoId, metadata, action, source }) =>
        updateDaoDraft(set, daoId, (draft) =>
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

      replaceDraft: (daoId, { metadata, action, source }) =>
        updateDaoDraft(set, daoId, () =>
          withUpdatedAt(createEmptyDraft(), {
            metadata,
            queuedActions: action ? [action] : [],
            prepopulatedFrom: source
          })
        ),

      setValidationErrors: (daoId, validationErrors) =>
        updateDaoDraft(set, daoId, (draft) => withUpdatedAt(draft, { validationErrors })),
      clearValidationErrors: (daoId) =>
        updateDaoDraft(set, daoId, (draft) => withUpdatedAt(draft, { validationErrors: null })),
      setFormMessage: (daoId, formMessage) =>
        updateDaoDraft(set, daoId, (draft) => withUpdatedAt(draft, { formMessage })),
      clearFormMessage: (daoId) => updateDaoDraft(set, daoId, (draft) => withUpdatedAt(draft, { formMessage: '' })),
      setBusy: (daoId, busy) => updateDaoDraft(set, daoId, (draft) => withUpdatedAt(draft, { busy })),
      reset: (daoId) =>
        set((state) => {
          const draftsByDaoId = { ...state.draftsByDaoId };
          delete draftsByDaoId[daoId];
          return { draftsByDaoId };
        }),
      resetDraft: (daoId) =>
        updateDaoDraft(set, daoId, (draft) =>
          withUpdatedAt(draft, { editingState: null, validationErrors: null, formMessage: '' })
        )
    }),
    {
      name: 'dao.proposal-drafts.v2',
      storage,
      partialize: (state) => ({
        draftsByDaoId: Object.fromEntries(
          Object.entries(state.draftsByDaoId).map(([daoId, draft]) => [
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
      })
    }
  )
);

export const selectDraft = (daoId: string) => (state: ProposalComposerStore) =>
  state.draftsByDaoId[daoId] ?? emptyDraft;

export const selectHasDraft = (daoId: string) => (state: ProposalComposerStore) => {
  const draft = state.draftsByDaoId[daoId];
  return Boolean(
    draft && (draft.queuedActions.length > 0 || draft.editingState || Object.values(draft.metadata).some(Boolean))
  );
};

export const selectCanProceedToStep2 = (daoId: string) => (state: ProposalComposerStore) => {
  const draft = state.draftsByDaoId[daoId] ?? emptyDraft;
  return (
    draft.metadata.title.trim().length > 0 &&
    draft.metadata.description.trim().length > 0 &&
    draft.queuedActions.length > 0
  );
};

export const selectIsEditing = (daoId: string) => (state: ProposalComposerStore) =>
  state.draftsByDaoId[daoId]?.editingState?.mode === 'edit';

export const selectEditingIndex = (daoId: string) => (state: ProposalComposerStore) =>
  state.draftsByDaoId[daoId]?.editingState?.index;

export const selectValidationErrors = (daoId: string) => (state: ProposalComposerStore) =>
  state.draftsByDaoId[daoId]?.validationErrors ?? null;
