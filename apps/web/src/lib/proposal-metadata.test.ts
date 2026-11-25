import { describe, expect, it } from 'vitest';

import {
  decodeProposalMetadata,
  encodeProposalMetadata,
  normalizeUrl,
  parseProposalMetadata,
  validateProposalMetadataDraft
} from './proposal-metadata';

const draft = (url: string) => ({ title: 'Fund the garden', description: 'Seeds and tools.', url });

describe('proposal links', () => {
  // The chain stores any text, so a proposal made outside the app can carry any link.
  it('drops a link with an unsafe scheme when a proposal is read', () => {
    for (const url of [
      'javascript:alert(1)',
      ' JavaScript:alert(1)',
      'data:text/html,<b>x</b>',
      'vbscript:x',
      'file:///etc/passwd'
    ]) {
      const description = JSON.stringify({ title: 'T', description: 'D', url });
      expect(decodeProposalMetadata(description)?.url, url).toBe('');
      expect(parseProposalMetadata(description).url, url).toBe('');
    }
  });

  it('drops an unsafe link from the loose decoder too', () => {
    expect(decodeProposalMetadata('{"title":"T","url":"javascript:alert(1)"')?.url).toBe('');
  });

  it('keeps web and IPFS links and completes a bare address', () => {
    expect(normalizeUrl('https://forum.example/t/1')).toBe('https://forum.example/t/1');
    expect(normalizeUrl('http://forum.example')).toBe('http://forum.example');
    expect(normalizeUrl('ipfs://bafyplan')).toBe('ipfs://bafyplan');
    expect(normalizeUrl('forum.example/t/1')).toBe('https://forum.example/t/1');
    expect(normalizeUrl('localhost:3000/plan')).toBe('https://localhost:3000/plan');
  });

  it('never writes an unsafe link and says why it was refused', () => {
    expect(JSON.parse(encodeProposalMetadata(draft('javascript:alert(1)'))).url).toBe('');
    expect(validateProposalMetadataDraft(draft('javascript:alert(1)'))).toEqual({
      valid: false,
      message: 'Links must start with https://, http:// or ipfs://.'
    });
    expect(validateProposalMetadataDraft(draft('https://forum.example')).valid).toBe(true);
    expect(validateProposalMetadataDraft(draft('')).valid).toBe(true);
  });
});
