'use client';
import type { DaoAddresses } from '@builder-stellar/manager-bindings';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  configuredCreationNetwork,
  type CreateDaoSection,
  creationAssets,
  type CreationNetwork,
  type DraftConfiguration,
  OPEN_MEMBERSHIP
} from '@/lib/create-dao-schema';
import { siteHref, withSiteOrigin } from '@/lib/site';

export const DEFAULT_DAO_IMAGE_URL = siteHref('/images/dao-logo.png');
// token_uri appends `?contract=<token>&token=<id>` (served by /api/render).
export const DEFAULT_RENDERER_BASE = siteHref('/api/render');
export const LOCAL_DEFAULT_DAO_IMAGE_URL = '/images/dao-logo.png';
// Artwork types are also consumed by the reusable layer preview and starter registry.
export type ArtworkProperty = { name: string; items: string[] };
export type ArtworkSource =
  | { kind: 'uploaded'; baseUri: string; extension: string; properties: ArtworkProperty[]; gatewayUrl?: string }
  | { kind: 'starter'; collectionId: string; properties: ArtworkProperty[] }
  | { kind: 'generated'; seed: string };
export type WorkspaceScope = { network: CreationNetwork; deployment: string; wallet: string | null };
export type SubmissionStatus = 'signed' | 'submitted' | 'rejected' | 'expired' | 'confirmed' | 'failed';
export type SignedSubmission = {
  hash?: string;
  signedTxXdr?: string;
  expiresAt?: number;
  acceptedAt?: number;
};
export type DeploymentRecord = {
  nonce: string;
  deployer: string;
  addresses?: DaoAddresses;
  status: 'prepared' | SubmissionStatus;
  configuration?: DraftConfiguration;
  configurationFingerprint?: string;
  confirmedBy?: 'transaction' | 'manager-state';
  error?: string;
} & SignedSubmission;
export type LocalDaoDraft = {
  id: string;
  scope: WorkspaceScope;
  configuration: DraftConfiguration;
  imagePreview: string | null;
  imageFilename: string;
  section: CreateDaoSection;
  createdAt: number;
  updatedAt: number;
  deployment?: DeploymentRecord;
};
export function defaultConfiguration(network: CreationNetwork = configuredCreationNetwork()): DraftConfiguration {
  const paymentAsset = creationAssets(network).find((a) => a.code === 'XLM')?.contractId ?? '';
  return {
    basicInfo: {
      tokenName: '',
      tokenSymbol: '',
      slug: '',
      description: '',
      contractImage: DEFAULT_DAO_IMAGE_URL,
      links: [],
      rendererBase: DEFAULT_RENDERER_BASE
    },
    auction: { enabled: true, paymentAsset, reservePrice: '1', duration: 86400, timeBuffer: 900 },
    marketplace: { enabled: false, paymentAsset, secondaryFeeBps: 500 },
    claims: { enabled: false },
    tokenSettings: { ...OPEN_MEMBERSHIP },
    governance: { votingDelay: 86400, votingPeriod: 259200, queueDelay: 3600, quorumBps: 1000, proposalThreshold: 1 }
  };
}
export function sameWorkspace(scope: WorkspaceScope, other: WorkspaceScope) {
  return scope.network === other.network && scope.deployment === other.deployment && scope.wallet === other.wallet;
}
export function visibleDraft(draft: LocalDaoDraft, scope: WorkspaceScope) {
  return (
    draft.scope.network === scope.network &&
    draft.scope.deployment === scope.deployment &&
    (draft.scope.wallet === null || draft.scope.wallet === scope.wallet)
  );
}
export const CREATE_WORKSPACE_KEY = 'dao.create-dao.v4';
const recoveryKey = (draft: LocalDaoDraft) =>
  `${CREATE_WORKSPACE_KEY}.recovery:${JSON.stringify([draft.scope.network, draft.scope.deployment, draft.id])}`;
function withRecoverySnapshots(drafts: LocalDaoDraft[]) {
  if (typeof window === 'undefined') return drafts;
  const snapshots = new Map(drafts.map((draft) => [draft.id, draft]));
  const storage = window.localStorage;
  const prefix = `${CREATE_WORKSPACE_KEY}.recovery:`;
  for (let index = 0; index < storage.length; index++) {
    const name = storage.key(index);
    if (!name?.startsWith(prefix)) continue;
    const recovered = JSON.parse(storage.getItem(name)!) as LocalDaoDraft;
    migrateCreationWorkspace({ drafts: [recovered] });
    if (name !== recoveryKey(recovered) || !recovered.deployment)
      throw new Error('Local deployment recovery data is damaged');
    snapshots.set(recovered.id, recovered);
  }
  return Array.from(snapshots.values()).map((draft) => {
    const raw = window.localStorage.getItem(recoveryKey(draft));
    if (!raw) return draft;
    const recovered = JSON.parse(raw) as LocalDaoDraft;
    if (
      recovered.id !== draft.id ||
      recovered.scope.network !== draft.scope.network ||
      recovered.scope.deployment !== draft.scope.deployment ||
      !recovered.deployment
    )
      throw new Error('Local deployment recovery data is damaged');
    return recovered;
  });
}
/**
 * Drafts before the storage diet had a single website (`projectUri`) and a token
 * URI (`tokenUri`). The profile has labelled links and the token URI is built
 * on chain, so the website becomes a "Website" link and the URI is dropped.
 */
function withLinks(info: Record<string, unknown>): DraftConfiguration['basicInfo'] {
  const { projectUri, tokenUri: _tokenUri, ...rest } = info;
  void _tokenUri;
  const links = Array.isArray(rest.links)
    ? rest.links
    : typeof projectUri === 'string' && projectUri.trim()
      ? [{ label: 'Website', url: projectUri.trim() }]
      : [];
  return { ...rest, links } as DraftConfiguration['basicInfo'];
}
/**
 * Drafts that haven't been submitted move their image and renderer from the old host to the site
 * URL. Submitted drafts keep theirs: recovery checks them against the signed transaction.
 */
function withSiteUrls(draft: LocalDaoDraft, info: DraftConfiguration['basicInfo']): DraftConfiguration['basicInfo'] {
  if (draft.deployment) return info;
  return {
    ...info,
    contractImage: typeof info.contractImage === 'string' ? withSiteOrigin(info.contractImage) : info.contractImage,
    rendererBase: typeof info.rendererBase === 'string' ? withSiteOrigin(info.rendererBase) : info.rendererBase
  };
}
function withProfileLinks(draft: LocalDaoDraft): LocalDaoDraft {
  return {
    ...draft,
    configuration: {
      ...draft.configuration,
      basicInfo: withSiteUrls(draft, withLinks(draft.configuration.basicInfo as unknown as Record<string, unknown>)),
      // Drafts saved before claims and membership rules existed: no claims, an open community.
      claims: draft.configuration.claims ?? { enabled: false },
      tokenSettings: draft.configuration.tokenSettings ?? { ...OPEN_MEMBERSHIP }
    }
  };
}
export function migrateCreationWorkspace(value: unknown): { drafts: LocalDaoDraft[]; activeDraftId: string | null } {
  const old = (value ?? {}) as Record<string, any>;
  if (Array.isArray(old.drafts)) {
    if (
      old.drafts.some(
        (draft) =>
          !draft ||
          typeof draft.id !== 'string' ||
          !draft.scope ||
          !draft.configuration?.basicInfo ||
          !draft.configuration?.auction ||
          !draft.configuration?.marketplace ||
          !draft.configuration?.governance
      )
    )
      throw new Error('Local draft data is damaged. The original browser data has been preserved.');
    return { drafts: old.drafts.map(withProfileLinks), activeDraftId: old.activeDraftId ?? null };
  }
  if (!old.basicInfo) return { drafts: [], activeDraftId: null };
  const config = defaultConfiguration();
  const basicInfo = withLinks({ ...config.basicInfo, ...old.basicInfo });
  if (typeof basicInfo.rendererBase !== 'string' || !basicInfo.rendererBase.trim())
    basicInfo.rendererBase = config.basicInfo.rendererBase;
  const image = old.basicInfo.contractImage;
  const preview = typeof image === 'string' && image.startsWith('data:image/') ? image : null;
  const draft: LocalDaoDraft = {
    id: 'migrated-v5',
    scope: { network: configuredCreationNetwork(), deployment: 'unassigned', wallet: old.launchAdmin || null },
    configuration: {
      ...config,
      basicInfo: {
        ...basicInfo,
        rendererBase: withSiteOrigin(basicInfo.rendererBase),
        contractImage: preview ? DEFAULT_DAO_IMAGE_URL : withSiteOrigin(image || DEFAULT_DAO_IMAGE_URL)
      },
      governance: { ...config.governance, ...old.governance },
      auction: { ...config.auction, enabled: old.purpose?.membershipMode === 'auctions' },
      marketplace: { ...config.marketplace, enabled: old.purpose?.membershipMode === 'marketplace' }
    },
    imagePreview: preview,
    imageFilename: 'draft-image.png',
    section: 'basicInfo',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  return { drafts: [draft], activeDraftId: draft.id };
}
type Store = DraftConfiguration & {
  drafts: LocalDaoDraft[];
  activeDraftId: string | null;
  imagePreview: string | null;
  imageFilename: string;
  section: CreateDaoSection;
  validationErrors: Record<string, string>;
  initialize: (scope: WorkspaceScope, requestedId?: string) => string;
  newDraft: (scope: WorkspaceScope) => string;
  resumeDraft: (id: string) => void;
  duplicateDraft: (id: string) => string;
  deleteDraft: (id: string) => void;
  updateBasicInfo: (patch: Partial<DraftConfiguration['basicInfo']>) => void;
  updateAuction: (patch: Partial<DraftConfiguration['auction']>) => void;
  updateMarketplace: (patch: Partial<DraftConfiguration['marketplace']>) => void;
  updateClaims: (patch: Partial<DraftConfiguration['claims']>) => void;
  updateTokenSettings: (patch: Partial<DraftConfiguration['tokenSettings']>) => void;
  updateGovernance: (patch: Partial<DraftConfiguration['governance']>) => void;
  setImagePreview: (image: string | null, filename?: string) => void;
  setSection: (section: CreateDaoSection) => void;
  setValidationError: (field: string, error: string) => void;
  clearValidationError: (field: string) => void;
  clearAllValidationErrors: () => void;
  recordDeployment: (id: string, record: DeploymentRecord) => void;
};
let storageError = '';
let readFailed = false;
export function creationStorageError() {
  return storageError;
}
export function assertCreationSaved() {
  if (storageError) throw new Error(storageError);
  if (typeof window === 'undefined') throw new Error('Local recovery storage is unavailable');
}
const storage = createJSONStorage(() => ({
  getItem: (key: string) => {
    try {
      const raw = typeof window === 'undefined' ? null : window.localStorage.getItem(key);
      if (raw) {
        const envelope = JSON.parse(raw);
        const migrated = migrateCreationWorkspace(envelope.state);
        const drafts = withRecoverySnapshots(migrated.drafts);
        if (Array.isArray(envelope.state?.drafts)) envelope.state = { ...envelope.state, drafts };
        readFailed = false;
        return JSON.stringify(envelope);
      }
      readFailed = false;
      return raw;
    } catch {
      readFailed = true;
      storageError = 'Cannot read local drafts. Existing data is preserved; autosave and deployment are disabled.';
      return null;
    }
  },
  setItem: (key: string, value: string) => {
    if (typeof window === 'undefined') return;
    if (readFailed) return;
    try {
      window.localStorage.setItem(key, value);
      storageError = '';
    } catch {
      storageError = 'Could not save this draft. Free browser storage or remove an image before deploying.';
    }
  },
  removeItem: (key: string) => {
    if (typeof window !== 'undefined') window.localStorage.removeItem(key);
  }
}));
const editor = (draft: LocalDaoDraft) => ({
  ...draft.configuration,
  activeDraftId: draft.id,
  imagePreview: draft.imagePreview,
  imageFilename: draft.imageFilename,
  section: draft.section,
  validationErrors: {}
});
function latestDrafts(fallback: LocalDaoDraft[]) {
  if (typeof window === 'undefined' || readFailed) return fallback;
  try {
    const raw = window.localStorage.getItem(CREATE_WORKSPACE_KEY);
    return withRecoverySnapshots(raw ? migrateCreationWorkspace(JSON.parse(raw).state).drafts : fallback);
  } catch {
    readFailed = true;
    storageError = 'Cannot read local drafts. Existing data is preserved; autosave and deployment are disabled.';
    return fallback;
  }
}
export const useCreateDaoStore = create<Store>()(
  persist(
    (set, get) => {
      // Read the durable collection for every write. A stale tab must not erase another
      // tab's saved hash, claimed scope, new draft, or confirmed recovery snapshot.
      const saveState = (patch: Partial<Store>) =>
        set({ ...patch, drafts: patch.drafts ?? latestDrafts(get().drafts) });
      const update = (
        patch: { [Key in keyof DraftConfiguration]?: Partial<DraftConfiguration[Key]> } & {
          imagePreview?: string | null;
          imageFilename?: string;
          section?: CreateDaoSection;
        }
      ) => {
        const current = get();
        const drafts = latestDrafts(current.drafts);
        const draft = drafts.find((d) => d.id === current.activeDraftId);
        if (!draft) return;
        if (draft.deployment) {
          saveState({ ...editor(draft), drafts });
          return;
        }
        const config = {
          basicInfo: { ...draft.configuration.basicInfo, ...patch.basicInfo },
          auction: { ...draft.configuration.auction, ...patch.auction },
          marketplace: { ...draft.configuration.marketplace, ...patch.marketplace },
          claims: { ...draft.configuration.claims, ...patch.claims },
          tokenSettings: { ...draft.configuration.tokenSettings, ...patch.tokenSettings },
          governance: { ...draft.configuration.governance, ...patch.governance }
        };
        const next = {
          ...draft,
          configuration: config,
          updatedAt: Date.now(),
          imagePreview: patch.imagePreview === undefined ? draft.imagePreview : patch.imagePreview,
          imageFilename: patch.imageFilename ?? draft.imageFilename,
          section: patch.section ?? draft.section
        };
        saveState({ ...editor(next), drafts: drafts.map((d) => (d.id === draft.id ? next : d)) });
      };
      return {
        ...defaultConfiguration(),
        drafts: [],
        activeDraftId: null,
        imagePreview: null,
        imageFilename: '',
        section: 'basicInfo',
        validationErrors: {},
        newDraft: (scope) => {
          const id = crypto.randomUUID();
          const draft: LocalDaoDraft = {
            id,
            scope,
            configuration: defaultConfiguration(scope.network),
            imagePreview: null,
            imageFilename: '',
            section: 'basicInfo',
            createdAt: Date.now(),
            updatedAt: Date.now()
          };
          saveState({ ...editor(draft), drafts: [...latestDrafts(get().drafts), draft] });
          return id;
        },
        initialize: (scope, requestedId) => {
          const drafts = latestDrafts(get().drafts).map((d) =>
            d.scope.deployment === 'unassigned' &&
            d.scope.network === scope.network &&
            (!d.scope.wallet || d.scope.wallet === scope.wallet)
              ? { ...d, scope: { ...d.scope, deployment: scope.deployment } }
              : d
          );
          saveState({ drafts });
          const id = requestedId ?? get().activeDraftId;
          const draft =
            drafts.find((d) => d.id === id && visibleDraft(d, scope)) ??
            (!requestedId
              ? drafts.filter((d) => sameWorkspace(d.scope, scope)).sort((a, b) => b.updatedAt - a.updatedAt)[0]
              : undefined);
          if (requestedId && !draft)
            throw new Error('Draft not found in this wallet, network, and deployment workspace.');
          if (draft) {
            get().resumeDraft(draft.id);
            return draft.id;
          }
          return get().newDraft(scope);
        },
        resumeDraft: (id) => {
          const d = latestDrafts(get().drafts).find((d) => d.id === id);
          if (d) saveState(editor(d));
        },
        duplicateDraft: (id) => {
          const drafts = latestDrafts(get().drafts);
          const old = drafts.find((d) => d.id === id);
          if (!old) throw new Error('Draft not found');
          const copy = structuredClone(old);
          copy.id = crypto.randomUUID();
          delete copy.deployment;
          copy.configuration.basicInfo.tokenName = `${copy.configuration.basicInfo.tokenName} copy`.slice(0, 80);
          copy.createdAt = copy.updatedAt = Date.now();
          copy.section = 'basicInfo';
          saveState({ drafts: [...drafts, copy] });
          return copy.id;
        },
        deleteDraft: (id) => {
          const drafts = latestDrafts(get().drafts);
          const d = drafts.find((d) => d.id === id);
          // A failed attempt has nothing to recover and a confirmed one already exists on the network;
          // anything in between may still land, so its record stays until it resolves.
          if (d?.deployment && d.deployment.status !== 'failed' && d.deployment.status !== 'confirmed')
            throw new Error('Keep this deployment record for recovery. It cannot be deleted.');
          if (d?.deployment && typeof window !== 'undefined') window.localStorage.removeItem(recoveryKey(d));
          saveState({
            drafts: drafts.filter((d) => d.id !== id),
            ...(get().activeDraftId === id ? { activeDraftId: null } : {})
          });
        },
        updateBasicInfo: (patch) => update({ basicInfo: patch }),
        updateAuction: (patch) => update({ auction: patch }),
        updateMarketplace: (patch) => update({ marketplace: patch }),
        updateClaims: (patch) => update({ claims: patch }),
        updateTokenSettings: (patch) => update({ tokenSettings: patch }),
        updateGovernance: (patch) => update({ governance: patch }),
        setImagePreview: (imagePreview, imageFilename = '') => update({ imagePreview, imageFilename }),
        setSection: (section) => update({ section }),
        setValidationError: (field, error) =>
          saveState({ validationErrors: { ...get().validationErrors, [field]: error } }),
        clearValidationError: (field) => {
          const errors = { ...get().validationErrors };
          delete errors[field];
          saveState({ validationErrors: errors });
        },
        clearAllValidationErrors: () => saveState({ validationErrors: {} }),
        recordDeployment: (id, deployment) => {
          const drafts = latestDrafts(get().drafts);
          const draft = drafts.find((d) => d.id === id);
          if (!draft) throw new Error('Deployment draft not found');
          if (
            draft.deployment &&
            (draft.deployment.nonce !== deployment.nonce || draft.deployment.deployer !== deployment.deployer)
          )
            throw new Error('The saved deployment nonce and deployer cannot be replaced');
          if (
            draft.deployment?.configuration &&
            deployment.configuration &&
            JSON.stringify(draft.deployment.configuration) !== JSON.stringify(deployment.configuration)
          )
            throw new Error('The frozen deployment configuration cannot be replaced');
          if (
            draft.deployment?.configurationFingerprint &&
            draft.deployment.configurationFingerprint !== deployment.configurationFingerprint
          )
            throw new Error('The frozen deployment configuration cannot be replaced');
          const snapshot = {
            ...draft,
            configuration: deployment.configuration ?? draft.configuration,
            scope: { ...draft.scope, wallet: deployment.deployer },
            deployment,
            updatedAt: Date.now()
          };
          // This per-draft key is written only by the Web-Locked deployment operation,
          // never by form autosave. Even a racing stale autosave cannot erase its hash.
          try {
            if (typeof window !== 'undefined')
              window.localStorage.setItem(recoveryKey(snapshot), JSON.stringify(snapshot));
          } catch {
            storageError = 'Could not save the deployment recovery snapshot. Free browser storage before signing.';
            throw new Error(storageError);
          }
          saveState({ drafts: drafts.map((d) => (d.id === id ? snapshot : d)) });
        }
      };
    },
    {
      name: CREATE_WORKSPACE_KEY,
      version: 7,
      storage,
      skipHydration: true,
      partialize: (state) => ({ drafts: state.drafts, activeDraftId: state.activeDraftId }),
      migrate: migrateCreationWorkspace,
      merge: (value, current) => {
        const saved = migrateCreationWorkspace(value);
        const active = saved.drafts.find((d) => d.id === (current.activeDraftId ?? saved.activeDraftId));
        return { ...current, ...saved, ...(active ? editor(active) : {}) };
      }
    }
  )
);
