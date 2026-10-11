import { describe, expect, it } from 'vitest';

import {
  encodeProposalMetadata,
  PROPOSAL_DESCRIPTION_MAX_BYTES,
  proposalDescriptionBytes,
  validateProposalMetadataDraft
} from './proposal-metadata';

describe('proposal description budget', () => {
  it('counts the bytes of exactly what is submitted', () => {
    const draft = { title: 'Fund it', description: 'Café ☕', url: '' };
    expect(proposalDescriptionBytes(draft)).toBe(new TextEncoder().encode(encodeProposalMetadata(draft)).length);
  });

  it('rejects a proposal the Governor would refuse', () => {
    const fits = { title: 'Fund it', description: 'x'.repeat(4000), url: '' };
    expect(validateProposalMetadataDraft(fits).valid).toBe(true);
    const tooLong = { ...fits, description: 'x'.repeat(PROPOSAL_DESCRIPTION_MAX_BYTES) };
    expect(validateProposalMetadataDraft(tooLong)).toEqual({
      valid: false,
      message: 'This proposal is too long to submit. Shorten the text or move detail to the link.'
    });
  });
});
