import { contract, StrKey, xdr } from '@stellar/stellar-sdk';

import type { DaoNetworkConfig } from '@/lib/dao-config';

import type { ClaimState } from './types';

export const ALICE = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 1));
export const BOB = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 2));
export const TOKEN = StrKey.encodeContract(Buffer.alloc(32, 3));
export const MINTER = StrKey.encodeContract(Buffer.alloc(32, 4));
export const TREASURY = StrKey.encodeContract(Buffer.alloc(32, 5));
export const config = {
  name: 'testnet',
  tokenContractId: TOKEN,
  treasuryContractId: TREASURY,
  adminAddress: ALICE,
  passphrase: 'Test SDF Network ; September 2015',
  rpcUrl: 'https://rpc.example'
} as DaoNetworkConfig;
export const state: ClaimState = {
  deploymentId: 'deployment-a',
  daoId: TOKEN,
  tokenContractId: TOKEN,
  minterContractId: MINTER,
  network: 'testnet',
  address: ALICE,
  authenticated: true,
  live: true,
  mintAuthority: true,
  owner: TREASURY,
  ledger: 123,
  merkle: { root: '00'.repeat(32), round: 2, claimed: null },
  allowlist: { amount: '9007199254740993', round: 3, member: true, claimed: null }
};

/** Contract source ABI fixture (contract.rs and errors.rs); not production bindings. */
export function minterSpec(
  overrides: { amountType?: xdr.ScSpecTypeDef; output?: xdr.ScSpecTypeDef; liveError?: number } = {}
) {
  const address = xdr.ScSpecTypeDef.scSpecTypeAddress();
  const u128 = overrides.amountType ?? xdr.ScSpecTypeDef.scSpecTypeU128();
  const bytes32 = xdr.ScSpecTypeDef.scSpecTypeBytesN(new xdr.ScSpecTypeBytesN({ n: 32 }));
  const vec = (elementType: xdr.ScSpecTypeDef) =>
    xdr.ScSpecTypeDef.scSpecTypeVec(new xdr.ScSpecTypeVec({ elementType }));
  const result =
    overrides.output ??
    xdr.ScSpecTypeDef.scSpecTypeResult(
      new xdr.ScSpecTypeResult({
        okType: xdr.ScSpecTypeDef.scSpecTypeVoid(),
        errorType: xdr.ScSpecTypeDef.scSpecTypeUdt(new xdr.ScSpecTypeUdt({ name: 'MinterError' }))
      })
    );
  const fn = (name: string, inputs: [string, xdr.ScSpecTypeDef][]) =>
    xdr.ScSpecEntry.scSpecEntryFunctionV0(
      new xdr.ScSpecFunctionV0({
        doc: '',
        name,
        inputs: inputs.map(([name, type]) => new xdr.ScSpecFunctionInputV0({ doc: '', name, type })),
        outputs: [result]
      })
    );
  const errors = {
    InvalidAmount: 2,
    InvalidTokenId: 3,
    BatchTooLarge: 4,
    MerkleRootNotSet: 5,
    AllowlistNotSet: 6,
    NotInAllowlist: 7,
    AlreadyClaimed: 8,
    MerkleProofInvalid: 9,
    InvalidInput: 10,
    TokenContractError: 11,
    TokenNotLive: overrides.liveError ?? 13
  };
  return new contract.Spec([
    fn('mint_allowlist', [
      ['token_id', address],
      ['recipient', address],
      ['amount', u128]
    ]),
    fn('mint_merkle', [
      ['token_id', address],
      ['recipient', address],
      ['amount', u128],
      ['proof', vec(bytes32)]
    ]),
    fn('set_merkle_root', [
      ['token_id', address],
      ['root', bytes32]
    ]),
    fn('set_allowlist', [
      ['token_id', address],
      ['addresses', vec(address)],
      ['fixed_amount', u128]
    ]),
    fn('mint_batch', [
      ['token_id', address],
      ['recipients', vec(address)],
      ['amounts', vec(u128)]
    ]),
    xdr.ScSpecEntry.scSpecEntryUdtErrorEnumV0(
      new xdr.ScSpecUdtErrorEnumV0({
        doc: '',
        lib: '',
        name: 'MinterError',
        cases: Object.entries(errors).map(([name, value]) => new xdr.ScSpecUdtErrorEnumCaseV0({ doc: '', name, value }))
      })
    )
  ]);
}
