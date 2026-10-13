import { Asset } from '@stellar/stellar-sdk';
import { z } from 'zod';

import { getNetworkConfig } from '@/config/networks';

import { getTreasuryAssets } from './assets-config';
import { decimalToStroops, MIN_RESERVE_PRICE_STROOPS } from './auction-values';
import {
  isProfileImageUrl,
  isProfileLinkUrl,
  MAX_LINK_LABEL,
  MAX_PROFILE_BYTES,
  MAX_PROFILE_LINKS,
  profileBytes
} from './dao-profile';
import {
  MAX_MARKETPLACE_FEE_BPS,
  validateQueueDelay,
  validateVotingDelay,
  validateVotingPeriod
} from './governance-limits';
import {
  isValidHttpUrl,
  isValidStellarAddress,
  isValidTokenSymbol,
  MAX_TOKEN_NAME_BYTES,
  MAX_TOKEN_SYMBOL_LENGTH,
  utf8Length
} from './validation';

export type CreationNetwork = 'testnet' | 'public' | 'local';
export const configuredCreationNetwork = (): CreationNetwork => {
  const value = process.env.NEXT_PUBLIC_NETWORK;
  return value === 'public' || value === 'local' ? value : 'testnet';
};
export const creationAssets = (network: CreationNetwork) =>
  getTreasuryAssets(network)
    .filter((asset) => ['USDC', 'XLM'].includes(asset.code) && asset.contractId)
    .map((asset) =>
      network === 'local' && asset.isNative
        ? { ...asset, contractId: Asset.native().contractId(getNetworkConfig(network).networkPassphrase) }
        : asset
    );
const withinContractString = (value: string) => new TextEncoder().encode(value).length <= 256;
const httpUrl = z
  .string()
  .refine(isValidHttpUrl, 'Enter an HTTP or HTTPS URL')
  .refine(withinContractString, 'Use at most 256 UTF-8 bytes');
const templatedUrl = httpUrl.refine(
  (value) => withinContractString(value.replaceAll('{daoId}', 'C'.repeat(56))),
  'The resolved DAO URL must fit within 256 UTF-8 bytes'
);
const timing = (validate: (seconds: number) => string | null) =>
  z
    .number()
    .int()
    .superRefine((seconds, ctx) => {
      const error = validate(seconds);
      if (error) ctx.addIssue({ code: 'custom', message: error });
    });
/** Mirrors the Manager's `validate_slug`: 4-63 chars of [a-z0-9-], no leading/trailing/doubled hyphen. */
export function isValidSlug(value: string) {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value) && value.length >= 4 && value.length <= 63;
}
const identitySchema = z.object({
  slug: z.string().refine(isValidSlug, 'Use 4-63 lowercase letters, numbers or single hyphens'),
  tokenName: z
    .string()
    .trim()
    .min(2, 'Use at least 2 characters')
    .refine((value) => utf8Length(value) <= MAX_TOKEN_NAME_BYTES, `Use at most ${MAX_TOKEN_NAME_BYTES} characters`)
    // The on-chain token JSON copies the name verbatim (InvalidName).
    .refine(
      (value) => !/["\\\u0000-\u001f\u007f]/.test(value),
      'Names cannot contain quotes, backslashes or line breaks'
    ),
  tokenSymbol: z
    .string()
    .refine(isValidTokenSymbol, `Use capital letters or numbers, up to ${MAX_TOKEN_SYMBOL_LENGTH} characters`),
  contractImage: z.string().refine(isProfileImageUrl, 'Use an https:// or ipfs:// image address')
});
const profileLinkSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, 'Give this link a label')
    .refine((value) => [...value].length <= MAX_LINK_LABEL, `Labels are at most ${MAX_LINK_LABEL} characters`),
  url: z.string().trim().refine(isProfileLinkUrl, 'Links start with https://, http://, mailto: or ipfs://')
});
/** The community profile (description in markdown, links, image) must fit MAX_PROFILE_BYTES serialized. */
const profileFits = (info: { description: string; links: { label: string; url: string }[]; contractImage: string }) =>
  profileBytes({ description: info.description, links: info.links, image: info.contractImage }) <= MAX_PROFILE_BYTES;
const basicInfoSchema = identitySchema
  .extend({
    description: z.string().trim().min(12, 'Use at least 12 characters'),
    links: z.array(profileLinkSchema).max(MAX_PROFILE_LINKS, `Use at most ${MAX_PROFILE_LINKS} links`),
    rendererBase: templatedUrl
  })
  .refine(profileFits, {
    path: ['description'],
    message: `The description, links and image together are over the ${MAX_PROFILE_BYTES}-byte limit`
  });
const auctionSchema = z.object({
  enabled: z.boolean(),
  paymentAsset: z.string().min(1, 'Choose a payment asset'),
  reservePrice: z.string().superRefine((value, ctx) => {
    const amount = decimalToStroops(value);
    if (amount === null || amount < MIN_RESERVE_PRICE_STROOPS || amount > (1n << 127n) - 1n)
      ctx.addIssue({ code: 'custom', message: 'Use an amount from 0.0001 with up to 7 decimal places (within i128)' });
  }),
  duration: z.number().int().min(300).max(2_592_000),
  timeBuffer: z.number().int().min(1).max(86_400)
});
const marketplaceSchema = z.object({
  enabled: z.boolean(),
  paymentAsset: z.string().min(1, 'Choose a payment asset'),
  secondaryFeeBps: z
    .number()
    .int()
    .min(0)
    .max(MAX_MARKETPLACE_FEE_BPS, 'The marketplace fee is at most 2,500 bps (25%).')
});
/** A ClaimMinter for invite and claim lists (registry kind `claims`), priced in the auction's asset. */
const claimsSchema = z.object({ enabled: z.boolean() });
/** The membership switches (docs/designs/locked-tokens.md); all off is an open community. */
const tokenSettingsSchema = z.object({
  transfersLocked: z.boolean(),
  membersOnlyDelegation: z.boolean(),
  daoRecovery: z.boolean()
});
export const OPEN_MEMBERSHIP = { transfersLocked: false, membersOnlyDelegation: false, daoRecovery: false };
const governanceSchema = z.object({
  votingDelay: timing(validateVotingDelay),
  votingPeriod: timing(validateVotingPeriod),
  queueDelay: timing(validateQueueDelay),
  quorumBps: z.number().int().min(1).max(10_000),
  proposalThreshold: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)
});
export const draftConfigurationSchema = z.object({
  basicInfo: basicInfoSchema,
  auction: auctionSchema,
  marketplace: marketplaceSchema,
  // Drafts saved before these existed open as an open community without claims.
  claims: claimsSchema.default({ enabled: false }),
  tokenSettings: tokenSettingsSchema.default(OPEN_MEMBERSHIP),
  governance: governanceSchema
});
export const createDaoSchema = draftConfigurationSchema.extend({
  launchAdmin: z.string().refine(isValidStellarAddress, 'Connect a valid Stellar wallet')
});
export type DraftConfiguration = z.infer<typeof draftConfigurationSchema>;
export type CreateDaoFormData = z.infer<typeof createDaoSchema>;
export function validateCreationAssets(config: DraftConfiguration, network: CreationNetwork) {
  const allowed = new Set(creationAssets(network).map((asset) => asset.contractId));
  // Only the modules the community is created with carry a payment asset; claims use the auction's.
  const used = [
    ...(config.auction.enabled || config.claims.enabled ? [config.auction.paymentAsset] : []),
    ...(config.marketplace.enabled ? [config.marketplace.paymentAsset] : [])
  ];
  if (used.some((asset) => !allowed.has(asset)))
    throw new Error('Payment assets must come from the registry for this draft’s network.');
}
export type CreateDaoSection = 'basicInfo' | 'membership' | 'governance' | 'review';
export const CREATE_DAO_SECTIONS: Array<{ id: CreateDaoSection; title: string }> = [
  { id: 'basicInfo', title: 'Identity' },
  { id: 'membership', title: 'Membership' },
  { id: 'governance', title: 'Governance' },
  { id: 'review', title: 'Review' }
];
export const sectionSchemas = {
  basicInfo: identitySchema,
  membership: z.object({
    basicInfo: z.object({
      description: z.string().trim().min(12, 'Use at least 12 characters'),
      links: z.array(profileLinkSchema).max(MAX_PROFILE_LINKS)
    }),
    auction: auctionSchema,
    marketplace: marketplaceSchema,
    claims: claimsSchema.default({ enabled: false }),
    tokenSettings: tokenSettingsSchema.default(OPEN_MEMBERSHIP)
  }),
  governance: governanceSchema
};
