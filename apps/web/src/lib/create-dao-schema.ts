import { z } from 'zod';

import {
  getStellarAddressError,
  isValidHttpUrl,
  isValidStellarAddress,
  isValidTokenSymbol,
  validateDuration
} from './validation';

const addressSchema = z
  .string()
  .trim()
  .superRefine((address, context) => {
    if (!isValidStellarAddress(address)) {
      context.addIssue({ code: 'custom', message: getStellarAddressError(address) ?? 'Invalid Stellar address' });
    }
  });

const basicInfoSchema = z.object({
  tokenName: z
    .string()
    .trim()
    .min(2, 'Token name must be at least 2 characters')
    .max(80, 'Token name must be 80 characters or less'),
  tokenSymbol: z.string().refine(isValidTokenSymbol, 'Token symbol must be uppercase alphanumeric, max 12 characters'),
  tokenUri: z.string().refine(isValidHttpUrl, 'Token URI must be a valid HTTP/HTTPS URL'),
  projectUri: z.string().refine(isValidHttpUrl, 'Project URI must be a valid HTTP/HTTPS URL'),
  description: z
    .string()
    .trim()
    .min(12, 'Description must be at least 12 characters')
    .max(240, 'Description must be 240 characters or less'),
  contractImage: z.string().refine(isValidHttpUrl, 'Contract image must be a valid HTTP/HTTPS URL'),
  rendererBase: z.string().refine(isValidHttpUrl, 'Renderer base must be a valid HTTP/HTTPS URL')
});

const governanceSchema = z
  .object({
    votingDelay: z.number().int('Voting delay must be a whole number'),
    votingPeriod: z.number().int('Voting period must be a whole number'),
    quorumBps: z.number().int().min(0).max(10000),
    proposalThresholdBps: z.number().int().min(0).max(10000)
  })
  .superRefine((governance, context) => {
    const votingDelayError = validateDuration(governance.votingDelay, 300);
    if (votingDelayError) context.addIssue({ code: 'custom', message: votingDelayError, path: ['votingDelay'] });

    const votingPeriodError = validateDuration(governance.votingPeriod, 10 * 60);
    if (votingPeriodError) context.addIssue({ code: 'custom', message: votingPeriodError, path: ['votingPeriod'] });
  });

const founderSchema = z.object({
  address: addressSchema,
  amount: z.number().int().positive('Amount must be greater than 0').max(10000, 'Amount cannot exceed 10,000 tokens')
});

const foundersArraySchema = z
  .array(founderSchema)
  .max(100, 'Maximum 100 founders allowed')
  .superRefine((founders, context) => {
    const total = founders.reduce((sum, founder) => sum + founder.amount, 0);
    if (total > 10000)
      context.addIssue({
        code: 'custom',
        message: `Total founder allocation (${total}) exceeds maximum of 10,000 tokens`
      });

    const addresses = founders.map((founder) => founder.address.toLowerCase());
    if (new Set(addresses).size !== addresses.length) {
      context.addIssue({ code: 'custom', message: 'Duplicate founder addresses are not allowed' });
    }
  });

/**
 * Membership mode defines how tokens are allocated
 * - founders: Fixed list of founder allocations
 * - marketplace: Recurring token buy/sell via marketplace
 * - auctions: Token minting via auctions
 */
export type MembershipMode = 'founders' | 'marketplace' | 'auctions';

const purposeSchema = z.object({
  purpose: z.string().trim().min(1, 'Purpose is required').max(500, 'Purpose must be 500 characters or less'),
  membershipMode: z.enum(['founders', 'marketplace', 'auctions'] as const)
});

export const foundersSchema = z.object({
  founders: foundersArraySchema
});

export const createDaoSchema = z.object({
  basicInfo: basicInfoSchema,
  purpose: purposeSchema,
  governance: governanceSchema,
  launchAdmin: addressSchema
});

export type CreateDaoFormData = z.infer<typeof createDaoSchema>;

export type CreateDaoSection = 'basicInfo' | 'governance' | 'purpose' | 'review';

export const CREATE_DAO_SECTIONS: Array<{
  id: CreateDaoSection;
  number: number;
  title: string;
  subtitle: string;
}> = [
  { id: 'basicInfo', number: 1, title: 'Basic information', subtitle: 'Name, symbol, and image' },
  { id: 'purpose', number: 2, title: 'Purpose & membership', subtitle: 'DAO goal and membership model' },
  { id: 'governance', number: 3, title: 'Governance', subtitle: 'Voting rules and thresholds' },
  { id: 'review', number: 4, title: 'Review and deploy', subtitle: 'Check everything before launch' }
];

export const sectionSchemas = {
  basicInfo: basicInfoSchema,
  purpose: purposeSchema,
  governance: governanceSchema
};
