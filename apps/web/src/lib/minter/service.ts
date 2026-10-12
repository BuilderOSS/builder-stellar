import { Client as TokenClient } from '@builder-stellar/token-bindings';
import { rpc, StrKey, TransactionBuilder } from '@stellar/stellar-sdk';
import { z } from 'zod';

import { DEPLOYMENT_ID } from '@/config/deployments.generated';
import { getDaoNetworkConfigById, readSource } from '@/lib/dao-config';
import { getDeploymentConfig } from '@/lib/deployment-config';
import { getGoldskyMinterClaims, hasIndexedClaim } from '@/lib/goldsky';
import { readHolderValue, requireHolderAddress } from '@/lib/token-holder/read';

import { claimListState } from './claim-list';
import { assertClaimSimulation, minterClient } from './client';
import { assertClaimActor, assertClaimScope, ClaimError } from './identity';
import { claimAmount, hashBytes, verifyClaimProof } from './proof';
import { readClaimStorage } from './storage';
import { assertClaimEnvelope } from './transaction';
import type { ClaimAction, ClaimHistory, ClaimState, PreparedClaim } from './types';

const round = z.number().int().min(0).max(0xffffffff);
export const claimActionSchema = z
  .object({
    method: z.literal('merkle'),
    round,
    amount: z.string().refine((value) => {
      try {
        claimAmount(value);
        return true;
      } catch {
        return false;
      }
    }),
    proof: z.array(z.string().regex(/^[0-9a-f]{64}$/i)).max(32)
  })
  .strict();
function bool(value: unknown) {
  if (typeof value !== 'boolean') throw new Error('Invalid token boolean result.');
  return value;
}

export async function claimScope(daoId: string) {
  const config = await getDaoNetworkConfigById(daoId); // existing scoped read model, no new Prisma queries
  assertClaimScope(DEPLOYMENT_ID, daoId, config);
  const network = getDeploymentConfig();
  if (
    config.name !== network.name ||
    config.passphrase !== network.networkPassphrase ||
    config.rpcUrl !== network.rpcUrl
  )
    throw new ClaimError('DAO network does not match this deployment.', 503);
  return { config, network };
}

export async function currentClaims(
  daoId: string,
  actor: { address: string; network: string } | null
): Promise<ClaimState> {
  const { config, network } = await claimScope(daoId);
  const authenticated = Boolean(
    actor && actor.network === config.name && StrKey.isValidEd25519PublicKey(actor.address)
  );
  const address = authenticated ? actor!.address : null;
  const options = {
    rpcUrl: config.rpcUrl,
    networkPassphrase: config.passphrase,
    publicKey: readSource(address, config.launchAdmin),
    allowHttp: config.name === 'local'
  };
  void network;
  const token = new TokenClient({ ...options, contractId: config.tokenContractId });
  // The Minter pinned at launch (token.minter()), not the Manager's current registration.
  const minter = readHolderValue(await token.minter(), (value) => {
    if (value === null) return null;
    if (typeof value !== 'string' || !StrKey.isValidContract(value)) throw new Error('Invalid pinned Minter.');
    return value;
  });
  const [live, admin, authority] = await Promise.all([
    token.is_live().then((tx) => readHolderValue(tx, bool)),
    token.admin().then((tx) => readHolderValue(tx, requireHolderAddress)),
    minter ? token.mint_authority({ authority: minter }).then((tx) => readHolderValue(tx, bool)) : false
  ]);
  const state = minter
    ? await readClaimStorage(
        new rpc.Server(config.rpcUrl, { allowHttp: config.name === 'local' }),
        minter,
        config.tokenContractId,
        address
      )
    : { ledger: null, merkle: { root: null, treeUri: null, round: null, claimed: null } };
  const claimList = await claimListState(
    state.merkle,
    { network: config.passphrase, token: config.tokenContractId },
    address
  );
  return {
    deploymentId: DEPLOYMENT_ID,
    daoId: config.tokenContractId,
    tokenContractId: config.tokenContractId,
    minterContractId: minter,
    network: config.name,
    address,
    authenticated,
    live,
    admin,
    mintAuthority: authority,
    ...state,
    claimList
  };
}

export async function claimHistory(daoId: string, offset: number): Promise<ClaimHistory> {
  const { config } = await claimScope(daoId);
  const history = await getGoldskyMinterClaims(config.tokenContractId, { limit: 20, offset });
  return { ...history, deploymentId: DEPLOYMENT_ID, daoId: config.tokenContractId };
}

export async function prepareClaim(
  daoId: string,
  actor: { address: string; network: string },
  action: ClaimAction
): Promise<PreparedClaim> {
  const { config } = await claimScope(daoId);
  assertClaimActor(actor, config);
  const state = await currentClaims(daoId, actor);
  if (!state.live || !state.minterContractId || !state.mintAuthority)
    throw new ClaimError('Claims require a Live token and the pinned Minter’s mint authority.');
  const current = state.merkle;
  if (current.round === null || current.round !== action.round)
    throw new ClaimError('The claim round is unavailable or changed. Refresh before reviewing.', 409);
  if (current.claimed === true) throw new ClaimError('You already claimed in the current round.', 409);
  // No claim marker on chain: the index is the second opinion before simulating.
  if (current.claimed === null && (await hasIndexedClaim(config.tokenContractId, actor.address, current.round)))
    throw new ClaimError(
      'The index shows a claim by this address in the current round. Refresh before reviewing.',
      409
    );
  const amount = action.amount;
  if (!state.merkle.root || !verifyClaimProof(actor.address, amount, action.proof, state.merkle.root))
    throw new ClaimError('This proof does not match your address, amount and the current root.');
  const client = await minterClient({
    contractId: state.minterContractId,
    rpcUrl: config.rpcUrl,
    networkPassphrase: config.passphrase,
    publicKey: actor.address,
    allowHttp: config.name === 'local'
  });
  const args = { token_id: config.tokenContractId, recipient: actor.address, amount: claimAmount(amount) };
  const tx = await client.mint_merkle({ ...args, proof: action.proof.map(hashBytes) }, { timeoutInSeconds: 180 });
  assertClaimSimulation(tx);
  if (tx.needsNonInvokerSigningBy().length) throw new ClaimError('Additional signatures are unsupported.');
  // Recheck after simulation: review must refer to the same registered minter/root/amount/round.
  const latest = await currentClaims(daoId, actor);
  if (
    latest.minterContractId !== state.minterContractId ||
    !latest.live ||
    !latest.mintAuthority ||
    latest.merkle.round !== action.round ||
    latest.merkle.claimed === true ||
    latest.merkle.root !== state.merkle.root
  )
    throw new ClaimError('Claim configuration changed during simulation. Review again.', 409);
  const xdr = tx.toXdr();
  const envelope = TransactionBuilder.fromXDR(xdr, config.passphrase);
  const prepared: PreparedClaim = {
    deploymentId: DEPLOYMENT_ID,
    daoId,
    tokenContractId: config.tokenContractId,
    minterContractId: state.minterContractId,
    address: actor.address,
    networkPassphrase: config.passphrase,
    rpcUrl: config.rpcUrl,
    method: action.method,
    round: action.round,
    amount,
    xdr,
    fee: envelope.fee
  };
  assertClaimEnvelope(envelope, prepared, action);
  return prepared;
}
