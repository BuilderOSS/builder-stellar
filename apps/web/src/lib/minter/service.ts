import { Client as ManagerClient } from '@builder-stellar/manager-bindings';
import { Client as TokenClient } from '@builder-stellar/token-bindings';
import { rpc, StrKey, TransactionBuilder } from '@stellar/stellar-sdk';
import { z } from 'zod';

import { DEPLOYMENT_ID } from '@/config/deployments.generated';
import { getDaoNetworkConfigById } from '@/lib/dao-config';
import { getDeploymentConfig } from '@/lib/deployment-config';
import { getGoldskyMinterClaims } from '@/lib/goldsky';
import { readHolderValue, requireHolderAddress } from '@/lib/token-holder/read';

import { assertClaimSimulation, minterClient } from './client';
import { assertClaimActor, assertClaimScope, ClaimError } from './identity';
import { claimAmount, hashBytes, verifyClaimProof } from './proof';
import { readClaimStorage } from './storage';
import { assertClaimEnvelope } from './transaction';
import type { ClaimAction, ClaimHistory, ClaimState, PreparedClaim } from './types';

const round = z.number().int().min(0).max(0xffffffff);
export const claimActionSchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('allowlist'), round }).strict(),
  z
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
    .strict()
]);
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
    publicKey: address ?? config.adminAddress,
    allowHttp: config.name === 'local'
  };
  const manager = new ManagerClient({ ...options, contractId: network.managerAddress });
  const minter = readHolderValue(await manager.get_platform_minter(), (value) => {
    if (value === null) return null;
    if (typeof value !== 'string' || !StrKey.isValidContract(value)) throw new Error('Invalid platform Minter.');
    return value;
  });
  const token = new TokenClient({ ...options, contractId: config.tokenContractId });
  const [live, owner, authority] = await Promise.all([
    token.is_live().then((tx) => readHolderValue(tx, bool)),
    token.owner().then((tx) => readHolderValue(tx, requireHolderAddress)),
    minter ? token.mint_authority({ authority: minter }).then((tx) => readHolderValue(tx, bool)) : false
  ]);
  const state = minter
    ? await readClaimStorage(
        new rpc.Server(config.rpcUrl, { allowHttp: config.name === 'local' }),
        minter,
        config.tokenContractId,
        address
      )
    : {
        ledger: null,
        merkle: { root: null, round: null, claimed: null },
        allowlist: { amount: null, round: null, member: null, claimed: null }
      };
  return {
    deploymentId: DEPLOYMENT_ID,
    daoId: config.tokenContractId,
    tokenContractId: config.tokenContractId,
    minterContractId: minter,
    network: config.name,
    address,
    authenticated,
    live,
    owner,
    mintAuthority: authority,
    ...state
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
    throw new ClaimError('Claims require a Live token and the current platform Minter’s mint authority.');
  const current = state[action.method];
  if (current.round === null || current.round !== action.round)
    throw new ClaimError('The allocation round is unavailable or changed. Refresh before reviewing.', 409);
  if (current.claimed === true) throw new ClaimError('You already claimed this method in the current round.', 409);
  const amount = action.method === 'merkle' ? action.amount : state.allowlist.amount;
  if (!amount) throw new ClaimError('The current allocation amount is unavailable.');
  if (
    action.method === 'merkle' &&
    (!state.merkle.root || !verifyClaimProof(actor.address, amount, action.proof, state.merkle.root))
  )
    throw new ClaimError('This supplied proof does not match your authenticated recipient, amount and current root.');
  // Missing membership can be absent/archived. Simulation, not history, is the final eligibility gate.
  if (action.method === 'allowlist' && state.allowlist.member === false)
    throw new ClaimError('You are not in the current allowlist.');
  const client = await minterClient({
    contractId: state.minterContractId,
    rpcUrl: config.rpcUrl,
    networkPassphrase: config.passphrase,
    publicKey: actor.address,
    allowHttp: config.name === 'local'
  });
  const args = { token_id: config.tokenContractId, recipient: actor.address, amount: claimAmount(amount) };
  const tx =
    action.method === 'merkle'
      ? await client.mint_merkle({ ...args, proof: action.proof.map(hashBytes) }, { timeoutInSeconds: 180 })
      : await client.mint_allowlist(args, { timeoutInSeconds: 180 });
  assertClaimSimulation(tx);
  if (tx.needsNonInvokerSigningBy().length) throw new ClaimError('Additional signatures are unsupported.');
  // Recheck after simulation: review must refer to the same registered minter/root/amount/round.
  const latest = await currentClaims(daoId, actor);
  if (
    latest.minterContractId !== state.minterContractId ||
    !latest.live ||
    !latest.mintAuthority ||
    latest[action.method].round !== action.round ||
    latest[action.method].claimed === true ||
    (action.method === 'merkle' ? latest.merkle.root !== state.merkle.root : latest.allowlist.amount !== amount)
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
