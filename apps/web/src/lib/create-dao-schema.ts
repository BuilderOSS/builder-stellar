import { Asset } from '@stellar/stellar-sdk';
import { z } from 'zod';

import { getNetworkConfig } from '@/config/networks';

import { getTreasuryAssets } from './assets-config';
import { decimalToStroops, MIN_RESERVE_PRICE_STROOPS } from './auction-values';
import { validateQueueDelay, validateVotingDelay, validateVotingPeriod } from './governance-limits';
import { isValidHttpUrl, isValidStellarAddress, isValidTokenSymbol } from './validation';

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
/** Mirrors the Manager's `validate_slug`: 3-32 chars of [a-z0-9-], no leading/trailing/doubled hyphen. */
export function isValidSlug(value: string) {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value) && value.length >= 4 && value.length <= 63;
}
const identitySchema = z.object({
  slug: z.string().refine(isValidSlug, 'Use 4-63 lowercase letters, numbers or single hyphens'),
  tokenName: z
    .string()
    .trim()
    .min(2, 'Use at least 2 characters')
    .max(80)
    .refine(withinContractString, 'Use at most 256 UTF-8 bytes'),
  tokenSymbol: z.string().refine(isValidTokenSymbol, 'Use uppercase letters or numbers, up to 12 characters'),
  contractImage: httpUrl
});
const basicInfoSchema = identitySchema.extend({
  description: z
    .string()
    .trim()
    .min(12, 'Use at least 12 characters')
    .max(240)
    .refine(withinContractString, 'Use at most 256 UTF-8 bytes'),
  projectUri: httpUrl,
  tokenUri: templatedUrl,
  rendererBase: templatedUrl
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
  secondaryFeeBps: z.number().int().min(0).max(10_000)
});
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
  governance: governanceSchema
});
export const createDaoSchema = draftConfigurationSchema.extend({
  launchAdmin: z.string().refine(isValidStellarAddress, 'Connect a valid Stellar wallet')
});
export type DraftConfiguration = z.infer<typeof draftConfigurationSchema>;
export type CreateDaoFormData = z.infer<typeof createDaoSchema>;
export function validateCreationAssets(config: DraftConfiguration, network: CreationNetwork) {
  const allowed = new Set(creationAssets(network).map((asset) => asset.contractId));
  if (!allowed.has(config.auction.paymentAsset) || !allowed.has(config.marketplace.paymentAsset))
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
    basicInfo: basicInfoSchema.pick({ description: true, projectUri: true }),
    auction: auctionSchema,
    marketplace: marketplaceSchema
  }),
  governance: governanceSchema
};
