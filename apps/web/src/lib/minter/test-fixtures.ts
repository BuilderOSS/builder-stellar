import { StrKey } from '@stellar/stellar-sdk';

import type { DaoNetworkConfig } from '@/lib/dao-config';

import type { ClaimListView, ClaimState } from './types';

export const ALICE = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 1));
export const BOB = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 2));
export const TOKEN = StrKey.encodeContract(Buffer.alloc(32, 3));
export const CLAIMS = StrKey.encodeContract(Buffer.alloc(32, 4));
export const TREASURY = StrKey.encodeContract(Buffer.alloc(32, 5));
export const XLM = StrKey.encodeContract(Buffer.alloc(32, 6));
export const config = {
  name: 'testnet',
  tokenContractId: TOKEN,
  treasuryContractId: TREASURY,
  governorContractId: StrKey.encodeContract(Buffer.alloc(32, 7)),
  auctionContractId: '',
  marketplaceContractId: '',
  metadataContractId: '',
  claimsContractId: CLAIMS,
  adminAddress: TREASURY,
  passphrase: 'Test SDF Network ; September 2015',
  rpcUrl: 'https://rpc.example'
} as DaoNetworkConfig;
export const list: ClaimListView = {
  listId: 2,
  root: '00'.repeat(32),
  treeUri: 'ipfs://bafytree',
  asset: XLM,
  price: '50',
  expiresAt: 2_000_000_000,
  total: 10,
  minted: 3,
  claimers: 2,
  assurance: null,
  claimed: 0,
  escrowed: '0',
  claimList: { status: 'none' }
};
export const state: ClaimState = {
  deploymentId: 'deployment-a',
  daoId: TOKEN,
  tokenContractId: TOKEN,
  claimsContractId: CLAIMS,
  network: 'testnet',
  address: ALICE,
  authenticated: true,
  live: true,
  allowance: 7,
  paymentAsset: XLM,
  nextListId: 1,
  admin: TREASURY,
  ledger: null,
  lists: [list]
};
