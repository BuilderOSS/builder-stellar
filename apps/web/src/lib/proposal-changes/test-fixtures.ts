import { Keypair, Networks, StrKey } from '@stellar/stellar-sdk';

import type { DaoNetworkConfig } from '@/lib/dao-config';
import type { ProposalQueuedAction } from '@/lib/proposal-actions/types';

export const contract = (byte: number) => StrKey.encodeContract(new Uint8Array(32).fill(byte));
export const wallet = (byte: number) => Keypair.fromRawEd25519Seed(new Uint8Array(32).fill(byte)).publicKey();

export const config = {
  name: 'testnet',
  rpcUrl: 'https://example.test',
  passphrase: Networks.TESTNET,
  tokenContractId: contract(1),
  governorContractId: contract(2),
  treasuryContractId: contract(3),
  auctionContractId: contract(4),
  marketplaceContractId: contract(5),
  metadataContractId: contract(6),
  claimsContractId: contract(7),
  launchAdmin: wallet(9),
  status: 'operational'
} as unknown as DaoNetworkConfig;

let counter = 0;
/** A queued action with a readable id, for queue tests. */
export function action(type: ProposalQueuedAction['type'], fields: Record<string, unknown> = {}): ProposalQueuedAction {
  counter += 1;
  return { id: `a${counter}`, type, recipient: '', amount: '', ...fields } as ProposalQueuedAction;
}

export const setting = (type: ProposalQueuedAction['type'], value: string) => action(type, { value, amount: value });
