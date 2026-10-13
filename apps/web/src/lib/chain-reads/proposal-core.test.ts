import { Keypair, xdr } from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';
import { describe, expect, it } from 'vitest';

import { decodeStoredProposal, PACKED_PROPOSAL_LEN, packedProposal } from './proposal-core';

describe('stored proposals', () => {
  it('round-trips every field, including a quorum above 64 bits', () => {
    const fields = {
      proposer: Keypair.random().publicKey(),
      voteSnapshot: 4_000_000_000,
      voteStart: 1_700_000_000,
      voteEnd: 1_700_300_000,
      eta: 1_700_600_000,
      state: 7,
      seq: 123,
      quorum: (1n << 70n) + 5n
    };
    expect(decodeStoredProposal(packedProposal(fields))).toEqual(fields);
  });
  it('rejects other shapes', () => {
    expect(() => decodeStoredProposal(xdr.ScVal.scvU32(1))).toThrow('Invalid proposal entry');
    const short = xdr.ScVal.scvVec([
      xdr.ScVal.scvString(Keypair.random().publicKey()),
      xdr.ScVal.scvBytes(Buffer.alloc(PACKED_PROPOSAL_LEN - 1))
    ]);
    expect(() => decodeStoredProposal(short)).toThrow('Invalid proposal entry');
  });
});
