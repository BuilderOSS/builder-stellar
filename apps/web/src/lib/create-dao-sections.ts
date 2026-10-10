import type { ZodError } from 'zod';

import { type CreateDaoSection, type DraftConfiguration, sectionSchemas } from './create-dao-schema';

/** The create form's sections, in the order they unlock. `stored` is the draft's persisted progress value. */
export const FORM_SECTIONS = [
  {
    id: 'identity',
    stored: 'basicInfo',
    title: 'Identity',
    description: 'Your name, picture and what the community is about. This is how people find you.'
  },
  {
    id: 'membership',
    stored: 'membership',
    title: 'Membership',
    description: 'Pick how people become members. Fine-tune prices and timings later.'
  },
  {
    id: 'voting',
    stored: 'governance',
    title: 'Voting',
    description: 'Pick a pace for decisions. The exact rules are in Advanced settings.'
  },
  {
    id: 'review',
    stored: 'review',
    title: 'Review and create',
    description: 'Everything above in plain words. Nothing is signed until you press Create.'
  }
] as const satisfies ReadonlyArray<{ id: string; stored: CreateDaoSection; title: string; description: string }>;

export type FormSectionId = (typeof FORM_SECTIONS)[number]['id'];
export type FieldError = { key: string; message: string };

/** How many sections are open for a draft's saved progress (always at least the first). */
export function unlockedCount(stored: CreateDaoSection | undefined) {
  const index = FORM_SECTIONS.findIndex((section) => section.stored === stored);
  return index < 0 ? 1 : index + 1;
}

/**
 * Store keys for a Zod error. Fields are keyed as the inputs are: identity and voting fields by name
 * (`tokenName`, `quorumBps`), auction and market fields by path (`auction.reservePrice`).
 */
export function errorsFromZod(error: ZodError, prefix = ''): FieldError[] {
  return error.issues.map((issue) => {
    const parts = issue.path.map(String);
    const path = ['basicInfo', 'governance'].includes(parts[0]) ? parts.slice(1) : parts;
    return { key: [prefix, ...path].filter(Boolean).join('.'), message: issue.message };
  });
}

type FormState = Pick<DraftConfiguration, 'basicInfo' | 'auction' | 'marketplace' | 'governance'>;

/** Every problem in one section, keyed for the store. The review section has nothing of its own to check. */
export function validateSection(id: FormSectionId, state: FormState): FieldError[] {
  const errors: FieldError[] = [];
  const check = (result: { success: boolean; error?: ZodError }, prefix = '') => {
    if (!result.success && result.error) errors.push(...errorsFromZod(result.error, prefix));
  };
  if (id === 'identity') {
    check(sectionSchemas.basicInfo.safeParse(state.basicInfo));
    // Description and website live under Identity on the page, though the schema groups them with membership.
    check(sectionSchemas.membership.shape.basicInfo.safeParse(state.basicInfo));
  } else if (id === 'membership') {
    check(sectionSchemas.membership.shape.auction.safeParse(state.auction), 'auction');
    check(sectionSchemas.membership.shape.marketplace.safeParse(state.marketplace), 'marketplace');
  } else if (id === 'voting') {
    check(sectionSchemas.governance.safeParse(state.governance));
  }
  // One message per field: the first is the most useful.
  return errors.filter((error, index) => errors.findIndex((other) => other.key === error.key) === index);
}

/** Which section a field key belongs to, so a field's own section revalidates it. */
export function sectionOfKey(key: string): FormSectionId | null {
  if (key.startsWith('auction.') || key.startsWith('marketplace.')) return 'membership';
  if (['votingDelay', 'votingPeriod', 'queueDelay', 'quorumBps', 'proposalThreshold'].includes(key)) return 'voting';
  if (['tokenName', 'tokenSymbol', 'slug', 'contractImage', 'description', 'projectUri'].includes(key))
    return 'identity';
  return null;
}
