// src/stores/create-dao-store.ts

'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export const DEFAULT_DAO_IMAGE_URL = 'https://builder-stellar-web.vercel.app/images/dao-logo.png';
export const LOCAL_DEFAULT_DAO_IMAGE_URL = '/images/dao-logo.png';

/**
 * Membership mode defines how tokens are allocated in the DAO
 * - founders: Fixed list of founder allocations
 * - marketplace: Recurring token buy/sell via marketplace
 * - auctions: Token minting via auctions
 */
export type MembershipMode = 'founders' | 'marketplace' | 'auctions';

/**
 * Basic information about the DAO
 */
type BasicInfo = {
  tokenName: string;
  tokenSymbol: string;
  tokenUri: string;
  projectUri: string;
  description: string;
  contractImage: string;
  rendererBase: string;
};

/**
 * Purpose and membership configuration
 */
type PurposeConfig = {
  purpose: string;
  membershipMode: MembershipMode;
};

/**
 * Governance parameters
 */
type GovernanceConfig = {
  votingDelay: number; // seconds
  votingPeriod: number; // seconds
  quorumBps: number; // basis points (0-10000)
  proposalThresholdBps: number; // basis points (0-10000)
};

/**
 * Founder allocation
 */
export type FounderAllocation = {
  address: string;
  amount: number;
};

/**
 * State
 */
type CreateDaoState = {
  basicInfo: BasicInfo;
  purpose: PurposeConfig;
  governance: GovernanceConfig;
  launchAdmin: string;
  busy: boolean;
  formMessage: string;
  validationErrors: Record<string, string>;
};

/**
 * Actions
 */
type CreateDaoActions = {
  // Update form sections
  updateBasicInfo: (patch: Partial<BasicInfo>) => void;
  updatePurpose: (patch: Partial<PurposeConfig>) => void;
  updateGovernance: (patch: Partial<GovernanceConfig>) => void;
  updateLaunchAdmin: (address: string) => void;

  // Validation
  setValidationError: (field: string, error: string) => void;
  clearValidationError: (field: string) => void;
  clearAllValidationErrors: () => void;

  // UI feedback
  setFormMessage: (message: string) => void;
  clearFormMessage: () => void;
  setBusy: (busy: boolean) => void;

  // Reset
  reset: () => void;
};

export type CreateDaoStore = CreateDaoState & CreateDaoActions;

const initialState: CreateDaoState = {
  basicInfo: {
    tokenName: '',
    tokenSymbol: '',
    tokenUri: 'https://builder-stellar-web.vercel.app/api/dao/{daoId}/token/',
    projectUri: 'https://test-dao-stellar-web.vercel.app',
    description: '',
    contractImage: DEFAULT_DAO_IMAGE_URL,
    rendererBase: 'https://builder-stellar-web.vercel.app/api/render/'
  },
  purpose: {
    purpose: '',
    membershipMode: 'auctions'
  },
  governance: {
    votingDelay: 86400, // 24 hours
    votingPeriod: 259200, // 3 days
    quorumBps: 1000, // 10%
    proposalThresholdBps: 100 // 1%
  },
  launchAdmin: '',
  busy: false,
  formMessage: '',
  validationErrors: {}
};

const memoryStorage = {
  getItem: (_name: string) => null,
  setItem: (_name: string, _value: string) => undefined,
  removeItem: (_name: string) => undefined
};

const storage = createJSONStorage(() => (typeof window === 'undefined' ? memoryStorage : window.localStorage));

export const useCreateDaoStore = create<CreateDaoStore>()(
  persist(
    (set) => ({
      ...initialState,

      // Update form sections
      updateBasicInfo: (patch) =>
        set((state) => ({
          basicInfo: { ...state.basicInfo, ...patch }
        })),

      updatePurpose: (patch) =>
        set((state) => ({
          purpose: { ...state.purpose, ...patch }
        })),

      updateGovernance: (patch) =>
        set((state) => ({
          governance: { ...state.governance, ...patch }
        })),

      updateLaunchAdmin: (address) => set({ launchAdmin: address }),

      // Validation
      setValidationError: (field, error) =>
        set((state) => ({
          validationErrors: { ...state.validationErrors, [field]: error }
        })),

      clearValidationError: (field) =>
        set((state) => {
          const { [field]: _, ...rest } = state.validationErrors;
          return { validationErrors: rest };
        }),

      clearAllValidationErrors: () => set({ validationErrors: {} }),

      // UI feedback
      setFormMessage: (formMessage) => set({ formMessage }),
      clearFormMessage: () => set({ formMessage: '' }),
      setBusy: (busy) => set({ busy }),

      // Reset
      reset: () => set(initialState)
    }),
    {
      name: 'dao.create-dao.v4',
      version: 4,
      storage,
      skipHydration: true,
      partialize: (state) => ({
        basicInfo: state.basicInfo,
        purpose: state.purpose,
        governance: state.governance,
        launchAdmin: state.launchAdmin
      }),
      migrate: (persistedState, version) => {
        const persisted = persistedState as Partial<CreateDaoState>;

        // Version < 4: Remove old artwork/auction/founders fields
        if (version < 4) {
          // Remove old fields (implicit - just don't restore them)
        }

        return persisted as CreateDaoState;
      },
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<CreateDaoState>;
        const merged = { ...currentState, ...persisted } as CreateDaoStore;

        // Restore default URLs if they're missing
        if (!merged.basicInfo?.tokenUri) {
          merged.basicInfo = {
            ...merged.basicInfo,
            tokenUri: initialState.basicInfo.tokenUri
          };
        }
        if (!merged.basicInfo?.projectUri) {
          merged.basicInfo = {
            ...merged.basicInfo,
            projectUri: initialState.basicInfo.projectUri
          };
        }
        if (!merged.basicInfo?.contractImage) {
          merged.basicInfo = {
            ...merged.basicInfo,
            contractImage: initialState.basicInfo.contractImage
          };
        }
        if (!merged.basicInfo?.rendererBase) {
          merged.basicInfo = {
            ...merged.basicInfo,
            rendererBase: initialState.basicInfo.rendererBase
          };
        }

        return merged;
      }
    }
  )
);
