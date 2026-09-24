// src/stores/create-dao-store.ts

'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * Artwork property with items
 */
export type ArtworkProperty = {
  name: string;
  items: string[];
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
 * Artwork and NFT configuration
 */
type ArtworkConfig = {
  ipfs: {
    baseUri: string;
    extension: string;
  };
  properties: ArtworkProperty[];
};

/**
 * Auction settings
 */
type AuctionConfig = {
  enabled: boolean;
  duration: number; // seconds
  reservePrice: string; // stroops
  timeBuffer: number; // seconds
  paymentAsset: string; // Stellar asset address
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
  artwork: ArtworkConfig;
  auction: AuctionConfig;
  governance: GovernanceConfig;
  founders: FounderAllocation[];
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
  updateArtwork: (patch: Partial<ArtworkConfig>) => void;
  updateAuction: (patch: Partial<AuctionConfig>) => void;
  updateGovernance: (patch: Partial<GovernanceConfig>) => void;
  updateLaunchAdmin: (address: string) => void;

  // Artwork property management
  addArtworkProperty: () => void;
  removeArtworkProperty: (index: number) => void;
  updateArtworkProperty: (index: number, property: ArtworkProperty) => void;
  addArtworkItem: (propertyIndex: number, item: string) => void;
  removeArtworkItem: (propertyIndex: number, itemIndex: number) => void;

  // Founder management
  addFounder: (founder: FounderAllocation) => void;
  removeFounder: (index: number) => void;
  updateFounder: (index: number, founder: FounderAllocation) => void;

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

type CreateDaoStore = CreateDaoState & CreateDaoActions;

const initialState: CreateDaoState = {
  basicInfo: {
    tokenName: '',
    tokenSymbol: '',
    tokenUri: 'https://builder-stellar-web.vercel.app/api/dao/{daoId}/token/',
    projectUri: 'https://test-dao-stellar-web.vercel.app',
    description: '',
    contractImage: 'https://builder-stellar-web.vercel.app/images/dao-logo.png',
    rendererBase: 'https://builder-stellar-web.vercel.app/api/render/'
  },
  artwork: {
    ipfs: {
      baseUri: 'ipfs://bafybeihcsfjvnjmzivm4gxgt75zwajtfxumyxd7j6ibvloykpg4sx47uca/',
      extension: '.png'
    },
    properties: [
      {
        name: '0-backgrounds',
        items: ['bg-cool', 'bg-warm']
      },
      {
        name: '1-bodies',
        items: ['body-rust', 'body-blue-sky', 'body-darkbrown']
      },
      {
        name: '2-accessories',
        items: ['accessory-txt-cc2', 'accessory-txt-ico', 'accessory-flash']
      },
      {
        name: '3-heads',
        items: ['head-hotdog', 'head-ufo', 'head-goldcoin']
      },
      {
        name: '4-glasses',
        items: ['glasses-square-teal', 'glasses-square-guava', 'glasses-square-black-rgb']
      }
    ]
  },
  auction: {
    enabled: true,
    duration: 86400, // 24 hours
    reservePrice: '1000000000', // 100 XLM
    timeBuffer: 300, // 5 minutes
    paymentAsset: ''
  },
  governance: {
    votingDelay: 86400, // 24 hours
    votingPeriod: 259200, // 3 days
    quorumBps: 1000, // 10%
    proposalThresholdBps: 100 // 1%
  },
  founders: [],
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

      updateArtwork: (patch) =>
        set((state) => ({
          artwork: { ...state.artwork, ...patch }
        })),

      updateAuction: (patch) =>
        set((state) => ({
          auction: { ...state.auction, ...patch }
        })),

      updateGovernance: (patch) =>
        set((state) => ({
          governance: { ...state.governance, ...patch }
        })),

      updateLaunchAdmin: (address) => set({ launchAdmin: address }),

      // Artwork property management
      addArtworkProperty: () =>
        set((state) => {
          if (state.artwork.properties.length >= 16) {
            return {
              formMessage: 'Maximum 16 properties allowed',
              validationErrors: { ...state.validationErrors, properties: 'Maximum 16 properties allowed' }
            };
          }
          return {
            artwork: {
              ...state.artwork,
              properties: [...state.artwork.properties, { name: '', items: [] }]
            }
          };
        }),

      removeArtworkProperty: (index) =>
        set((state) => {
          const properties = [...state.artwork.properties];
          properties.splice(index, 1);
          return {
            artwork: { ...state.artwork, properties }
          };
        }),

      updateArtworkProperty: (index, property) =>
        set((state) => {
          const properties = [...state.artwork.properties];
          properties[index] = property;
          return {
            artwork: { ...state.artwork, properties }
          };
        }),

      addArtworkItem: (propertyIndex, item) =>
        set((state) => {
          const properties = [...state.artwork.properties];
          properties[propertyIndex] = {
            ...properties[propertyIndex],
            items: [...properties[propertyIndex].items, item]
          };
          return {
            artwork: { ...state.artwork, properties }
          };
        }),

      removeArtworkItem: (propertyIndex, itemIndex) =>
        set((state) => {
          const properties = [...state.artwork.properties];
          const items = [...properties[propertyIndex].items];
          items.splice(itemIndex, 1);
          properties[propertyIndex] = {
            ...properties[propertyIndex],
            items
          };
          return {
            artwork: { ...state.artwork, properties }
          };
        }),

      // Founder management
      addFounder: (founder) =>
        set((state) => ({
          founders: [...state.founders, founder]
        })),

      removeFounder: (index) =>
        set((state) => {
          const founders = [...state.founders];
          founders.splice(index, 1);
          return { founders };
        }),

      updateFounder: (index, founder) =>
        set((state) => {
          const founders = [...state.founders];
          founders[index] = founder;
          return { founders };
        }),

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
      name: 'dao.create-dao.v1',
      storage,
      skipHydration: true,
      partialize: (state) => ({
        basicInfo: state.basicInfo,
        artwork: state.artwork,
        auction: state.auction,
        governance: state.governance,
        founders: state.founders,
        launchAdmin: state.launchAdmin
      }),
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<CreateDaoState>;
        const merged = { ...currentState, ...persisted } as CreateDaoStore;

        // If persisted artwork has no properties, use the default ones
        if (merged.artwork?.properties?.length === 0) {
          merged.artwork = initialState.artwork;
        }

        // If persisted artwork has no IPFS base URI, use the default one
        if (!merged.artwork?.ipfs?.baseUri) {
          merged.artwork = {
            ...merged.artwork,
            ipfs: initialState.artwork.ipfs
          };
        }

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

export const selectTotalFounderAllocation = (state: CreateDaoStore) =>
  state.founders.reduce((sum, f) => sum + f.amount, 0);
