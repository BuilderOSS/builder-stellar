import { GovernorError } from '@builder-stellar/governor-bindings';
import { Buffer } from 'buffer';
import { describe, expect, it } from 'vitest';

import { describeContractError } from './contract-errors';
import { simulatedProposalId } from './proposal-id';

describe('simulatedProposalId', () => {
  it('reads the id a successful simulation returns', () => {
    const id = Buffer.alloc(32, 0xab);
    expect(simulatedProposalId(id, GovernorError)).toBe('ab'.repeat(32));
    expect(simulatedProposalId(new Uint8Array(id), GovernorError)).toBe('ab'.repeat(32));
  });

  it('turns a refused proposal into the contract error it is (BUG-W02-6)', () => {
    // The bindings' Err, as AssembledTransaction#result returns it for Error(Contract, #5001).
    const refused = { error: { message: 'ProposalAlreadyExists' }, isErr: () => true };
    let thrown: unknown;
    try {
      simulatedProposalId(refused, GovernorError);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(describeContractError(thrown, 'governor')).toBe('This proposal already exists. (code 5001)');
  });

  it('keeps an unknown error name and treats no result as no id', () => {
    expect(() => simulatedProposalId({ error: { message: 'Mystery' } }, GovernorError)).toThrow('Mystery');
    expect(simulatedProposalId(undefined, GovernorError)).toBe('');
  });
});
