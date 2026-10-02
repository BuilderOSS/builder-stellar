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
 * Artwork property (trait) for DAO token artwork
 */
export type ArtworkProperty = {
  name: string;
  items: string[];
};

/**
 * Artwork configuration for IPFS-based collections (legacy)
 */
export type ArtworkConfig = {
  ipfs: {
    baseUri: string;
    extension: string;
  };
  properties: ArtworkProperty[];
};

/**
 * DAO image source (legacy)
 */
export type DaoImageSource =
  | { kind: 'default'; gatewayUrl: string }
  | { kind: 'generated'; model: string; prompt: string; ipfsUri: string; gatewayUrl: string }
  | { kind: 'uploaded'; filename: string; ipfsUri: string; gatewayUrl: string }
  | { kind: 'url'; gatewayUrl: string }
  | { kind: 'legacy-unconfirmed' };

/**
 * Artwork source - can be uploaded, generated, or from starter collection
 */
export type ArtworkSource =
  | {
      kind: 'uploaded';
      baseUri: string;
      extension: string;
      properties: ArtworkProperty[];
      gatewayUrl?: string;
    }
  | {
      kind: 'starter';
      collectionId: string;
      properties: ArtworkProperty[];
    }
  | {
      kind: 'generated';
      seed: string;
    };

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
  // Backwards compatibility for legacy components (no longer used in creation flow)
  artworkSource?: ArtworkSource | null;
  artwork?: ArtworkConfig;
  daoImageSource?: DaoImageSource;
  auction?: { enabled: boolean; duration: number };
  founders?: FounderAllocation[];
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

  // Backwards compatibility for legacy components (no longer used in creation flow)
  setArtworkSource: (source: ArtworkSource) => void;
  clearArtworkSource: () => void;
  updateArtwork: (patch: Partial<ArtworkConfig>) => void;
  addArtworkItem: () => void;
  removeArtworkItem: (index: number) => void;
  setDaoImageSource: (source: DaoImageSource) => void;
  updateAuction: (patch: Partial<{ enabled: boolean; duration: number }>) => void;
  addFounder: (founder?: FounderAllocation) => void;
  removeFounder: (index: number) => void;
  updateFounder: (index: number, founder: Partial<FounderAllocation>) => void;
  replaceFounders: (founders: FounderAllocation[]) => void;
  addArtworkProperty: () => void;
  removeArtworkProperty: (index: number) => void;
  updateArtworkProperty: (index: number, property: Partial<ArtworkProperty>) => void;

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

      // Backwards compatibility for artwork components
      setArtworkSource: (source) => set({ artworkSource: source }),
      clearArtworkSource: () => set({ artworkSource: null }),
      updateArtwork: (patch) =>
        set((state) => ({
          artwork: { ...state.artwork, ...patch }
        })),
      addArtworkItem: () => {
        // No-op for backwards compatibility
        return;
      },
      removeArtworkItem: () => {
        // No-op for backwards compatibility
        return;
      },
      setDaoImageSource: (source) => set({ daoImageSource: source }),
      updateAuction: (patch) =>
        set((state) => ({
          auction: { ...state.auction, ...patch }
        })),

      // Backwards compatibility for founder components
      addFounder: (founder) =>
        set((state) => ({
          founders: [...(state.founders ?? []), founder ?? { address: '', amount: 0 }]
        })),

      removeFounder: (index) =>
        set((state) => ({
          founders: (state.founders ?? []).filter((_, i) => i !== index)
        })),

      updateFounder: (index, founder) =>
        set((state) => ({
          founders: (state.founders ?? []).map((f, i) => (i === index ? { ...f, ...founder } : f))
        })),

      replaceFounders: (founders) => set({ founders }),

      // Backwards compatibility for artwork properties
      addArtworkProperty: () =>
        set((state) => {
          if (!state.artworkSource || state.artworkSource.kind === 'generated') {
            return state;
          }
          return {
            artworkSource: {
              ...state.artworkSource,
              properties: [...state.artworkSource.properties, { name: '', items: [] }]
            }
          };
        }),

      removeArtworkProperty: (index) =>
        set((state) => {
          if (!state.artworkSource || state.artworkSource.kind === 'generated') {
            return state;
          }
          return {
            artworkSource: {
              ...state.artworkSource,
              properties: state.artworkSource.properties.filter((_, i) => i !== index)
            }
          };
        }),

      updateArtworkProperty: (index, property) =>
        set((state) => {
          if (!state.artworkSource || state.artworkSource.kind === 'generated') {
            return state;
          }
          return {
            artworkSource: {
              ...state.artworkSource,
              properties: state.artworkSource.properties.map((p, i) => (i === index ? { ...p, ...property } : p))
            }
          };
        }),

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
