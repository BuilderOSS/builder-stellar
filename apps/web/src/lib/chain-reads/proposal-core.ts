/**
 * The stored form of a Governor proposal (contracts/governor/src/storage.rs
 * `StoredProposal`, D38): `(proposer, bytes)` with the numeric fields packed
 * big-endian: vote_snapshot u32, vote_start u64, vote_end u64, eta u64,
 * state u8, seq u32, quorum u128.
 */
import { Address, scValToNative, xdr } from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';

export const PACKED_PROPOSAL_LEN = 4 + 8 + 8 + 8 + 1 + 4 + 16;

export type StoredProposal = {
  proposer: string;
  voteSnapshot: number;
  voteStart: number;
  voteEnd: number;
  eta: number;
  /** stellar_governance ProposalState discriminant (0 Pending … 7 Executed). */
  state: number;
  seq: number;
  quorum: bigint;
};

function seconds(value: bigint, field: string) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(`Invalid proposal ${field}.`);
  return number;
}

/** Decode a `ProposalTime(id)` entry's value. Throws on any other shape. */
export function decodeStoredProposal(value: xdr.ScVal): StoredProposal {
  const native = scValToNative(value) as unknown;
  if (!Array.isArray(native) || native.length !== 2 || typeof native[0] !== 'string')
    throw new Error('Invalid proposal entry.');
  const bytes = Buffer.from(native[1] as Uint8Array);
  if (bytes.length !== PACKED_PROPOSAL_LEN) throw new Error('Invalid proposal entry.');
  const state = bytes[28]!;
  if (state > 7) throw new Error('Invalid proposal state.');
  return {
    proposer: native[0],
    voteSnapshot: bytes.readUInt32BE(0),
    voteStart: seconds(bytes.readBigUInt64BE(4), 'vote_start'),
    voteEnd: seconds(bytes.readBigUInt64BE(12), 'vote_end'),
    eta: seconds(bytes.readBigUInt64BE(20), 'eta'),
    state,
    seq: bytes.readUInt32BE(29),
    quorum: (bytes.readBigUInt64BE(33) << 64n) | bytes.readBigUInt64BE(41)
  };
}

/** A packed `StoredProposal` value (contracts/governor/src/storage.rs, D38). */
export function packedProposal(fields: {
  proposer: string;
  voteSnapshot: number;
  voteStart: number;
  voteEnd: number;
  eta: number;
  state: number;
  seq: number;
  quorum: bigint;
}): xdr.ScVal {
  const bytes = Buffer.alloc(PACKED_PROPOSAL_LEN);
  bytes.writeUInt32BE(fields.voteSnapshot, 0);
  bytes.writeBigUInt64BE(BigInt(fields.voteStart), 4);
  bytes.writeBigUInt64BE(BigInt(fields.voteEnd), 12);
  bytes.writeBigUInt64BE(BigInt(fields.eta), 20);
  bytes[28] = fields.state;
  bytes.writeUInt32BE(fields.seq, 29);
  bytes.writeBigUInt64BE(fields.quorum >> 64n, 33);
  bytes.writeBigUInt64BE(fields.quorum & ((1n << 64n) - 1n), 41);
  return xdr.ScVal.scvVec([new Address(fields.proposer).toScVal(), xdr.ScVal.scvBytes(bytes)]);
}
