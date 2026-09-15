// src/stores/proposal-composer-store.ts

'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { ProposalActionType, ProposalQueuedAction, ValidationResult } from '@/lib/proposal-actions/types';

/**
 * Proposal metadata
 */
type ProposalMetadata = {
  title: string;
  description: string;
  url: string;
};

/**
 * Editing state for non-destructive editing
 */
type EditingState = {
  mode: 'create' | 'edit';
  actionType: ProposalActionType;
  index?: number;
  draftData: any;
};

/**
 * State
 */
type ProposalComposerState = {
  step: 1 | 2 | 3;
  metadata: ProposalMetadata;
  queuedActions: ProposalQueuedAction[];
  editingState: EditingState | null;
  validationErrors: ValidationResult | null;
  formMessage: string;
  busy: boolean;
  prepopulatedFrom?: string; // Analytics tracking
};

/**
 * Actions
 */
type ProposalComposerActions = {
  // Wizard
  setStep: (step: 1 | 2 | 3) => void;
  nextStep: () => void;
  prevStep: () => void;

  // Metadata
  updateMetadata: (patch: Partial<ProposalMetadata>) => void;

  // Action editing
  beginCreate: (actionType?: ProposalActionType) => void;
  beginEdit: (index: number) => void;
  updateDraft: (draftData: any) => void;
  changeActionType: (actionType: ProposalActionType) => void;
  saveAction: (action: ProposalQueuedAction) => void;
  cancelEdit: () => void;

  // Queue management
  removeAction: (index: number) => void;
  reorderActions: (fromIndex: number, toIndex: number) => void;

  // Prepopulation (KEY FEATURE)
  prepopulate: (data: {
    metadata?: Partial<ProposalMetadata>;
    actions?: ProposalQueuedAction[];
    step?: 1 | 2 | 3;
    source?: string;
  }) => void;

  // Validation
  setValidationErrors: (errors: ValidationResult | null) => void;
  clearValidationErrors: () => void;

  // UI feedback
  setFormMessage: (message: string) => void;
  clearFormMessage: () => void;
  setBusy: (busy: boolean) => void;

  // Reset
  reset: () => void;
  resetDraft: () => void;
};

type ProposalComposerStore = ProposalComposerState & ProposalComposerActions;

const initialState: ProposalComposerState = {
  step: 1,
  metadata: { title: '', description: '', url: '' },
  queuedActions: [],
  editingState: null,
  validationErrors: null,
  formMessage: '',
  busy: false,
  prepopulatedFrom: undefined
};

const memoryStorage = {
  getItem: (_name: string) => null,
  setItem: (_name: string, _value: string) => undefined,
  removeItem: (_name: string) => undefined
};

const storage = createJSONStorage(() => (typeof window === 'undefined' ? memoryStorage : window.localStorage));

export const useProposalComposerStore = create<ProposalComposerStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      // Wizard navigation
      setStep: (step) => set({ step }),
      nextStep: () => set((state) => ({ step: Math.min(3, state.step + 1) as 1 | 2 | 3 })),
      prevStep: () => set((state) => ({ step: Math.max(1, state.step - 1) as 1 | 2 | 3 })),

      // Metadata
      updateMetadata: (patch) => set((state) => ({ metadata: { ...state.metadata, ...patch } })),

      // Action editing
      beginCreate: async (actionType = 'mint-governance-token') => {
        // Dynamically import to avoid circular deps
        const { getActionHandler } = await import('@/lib/proposal-actions/registry');
        const handler = getActionHandler(actionType);

        set({
          editingState: {
            mode: 'create',
            actionType,
            draftData: handler.getDefaultValues()
          }
        });
      },

      beginEdit: async (index) => {
        const { queuedActions } = get();
        const action = queuedActions[index];
        if (!action) return;

        // Dynamically import to avoid circular deps
        const { getActionHandler } = await import('@/lib/proposal-actions/registry');
        const handler = getActionHandler(action.type);

        set({
          editingState: {
            mode: 'edit',
            actionType: action.type,
            index,
            draftData: handler.deserialize(action)
          }
        });
      },

      updateDraft: (draftData) =>
        set((state) => {
          if (!state.editingState) return state;
          return { editingState: { ...state.editingState, draftData } };
        }),

      changeActionType: async (actionType) => {
        // Dynamically import to avoid circular deps
        const { getActionHandler } = await import('@/lib/proposal-actions/registry');
        const handler = getActionHandler(actionType);

        set((state) => {
          if (!state.editingState) return state;
          return {
            editingState: {
              ...state.editingState,
              actionType,
              draftData: handler.getDefaultValues()
            }
          };
        });
      },

      saveAction: (action) =>
        set((state) => {
          const { editingState, queuedActions } = state;
          if (!editingState) return state;

          if (editingState.mode === 'edit' && editingState.index !== undefined) {
            const nextActions = [...queuedActions];
            nextActions[editingState.index] = action;
            return {
              queuedActions: nextActions,
              editingState: null,
              formMessage: 'Action updated'
            };
          } else {
            return {
              queuedActions: [...queuedActions, action],
              editingState: null,
              formMessage: 'Action added'
            };
          }
        }),

      cancelEdit: () => set({ editingState: null, formMessage: '' }),

      // Queue management
      removeAction: (index) =>
        set((state) => {
          const nextActions = [...state.queuedActions];
          nextActions.splice(index, 1);
          return { queuedActions: nextActions, formMessage: 'Action removed' };
        }),

      reorderActions: (fromIndex, toIndex) =>
        set((state) => {
          const nextActions = [...state.queuedActions];
          const [removed] = nextActions.splice(fromIndex, 1);
          nextActions.splice(toIndex, 0, removed);
          return { queuedActions: nextActions };
        }),

      // Prepopulation
      prepopulate: ({ metadata, actions, step, source }) =>
        set((state) => ({
          metadata: metadata ? { ...state.metadata, ...metadata } : state.metadata,
          queuedActions: actions || state.queuedActions,
          step: step || state.step,
          prepopulatedFrom: source
        })),

      // Validation
      setValidationErrors: (validationErrors) => set({ validationErrors }),
      clearValidationErrors: () => set({ validationErrors: null }),

      // UI feedback
      setFormMessage: (formMessage) => set({ formMessage }),
      clearFormMessage: () => set({ formMessage: '' }),
      setBusy: (busy) => set({ busy }),

      // Reset
      reset: () => set(initialState),
      resetDraft: () => set({ editingState: null, validationErrors: null })
    }),
    {
      name: 'dao.proposal-composer.v1',
      storage,
      partialize: (state) => ({
        step: state.step,
        metadata: state.metadata,
        queuedActions: state.queuedActions,
        editingState: state.editingState,
        prepopulatedFrom: state.prepopulatedFrom
      })
    }
  )
);

// Selectors for derived state
export const selectCanProceedToStep2 = (state: ProposalComposerStore) =>
  state.metadata.title.trim().length > 0 &&
  state.metadata.description.trim().length > 0 &&
  state.queuedActions.length > 0;

export const selectIsEditing = (state: ProposalComposerStore) => state.editingState?.mode === 'edit';

export const selectEditingIndex = (state: ProposalComposerStore) => state.editingState?.index;

export const selectValidationErrors = (state: ProposalComposerStore) => state.validationErrors;
