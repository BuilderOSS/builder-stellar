import { Client as TokenClient } from '@builder-stellar/token-bindings';
import { StrKey, TransactionBuilder } from '@stellar/stellar-sdk';
import { z } from 'zod';

import { DEPLOYMENT_ID } from '@/config/deployments.generated';
import { getDaoNetworkConfigById, readSource } from '@/lib/dao-config';
import { getDeploymentConfig } from '@/lib/deployment-config';
import { getGoldskyClaims } from '@/lib/goldsky';
import { readHolderValue, requireHolderAddress } from '@/lib/token-holder/read';

import { readClaimLists } from './chain';
import { claimListState } from './claim-list';
import { assertClaimSimulation, claimMinterClient } from './client';
import { assertClaimActor, assertClaimScope, ClaimError } from './identity';
import { MAX_CLAIM_PER_CALL } from './limits';
import { claimAmount, hashBytes, verifyClaimProof } from './proof';
import { assertClaimEnvelope } from './transaction';
import type { ClaimAction, ClaimHistory, ClaimListView, ClaimState, PreparedClaim } from './types';

export { MAX_CLAIM_PER_CALL };

export const claimActionSchema = z
  .object({
    listId: z.number().int().min(0).max(0xffffffff),
    leafAmount: z.string().refine((value) => {
      try {
        claimAmount(value);
        return true;
      } catch {
        return false;
      }
    }),
    mintNow: z.number().int().min(1).max(MAX_CLAIM_PER_CALL),
    proof: z.array(z.string().regex(/^[0-9a-f]{64}$/i)).max(32),
    maxPrice: z.string().regex(/^(0|[1-9]\d{0,37})$/)
  })
  .strict();

function bool(value: unknown) {
  if (typeof value !== 'boolean') throw new Error('Invalid token boolean result.');
  return value;
}

function allowanceValue(value: unknown) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new Error('Invalid mint allowance.');
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
  const { config } = await claimScope(daoId);
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
  const token = new TokenClient({ ...options, contractId: config.tokenContractId });
  // The ClaimMinter the Token's own registry names, not the index's word for it.
  const registered = readHolderValue(await token.module({ kind: 'claims' }), (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string' || !StrKey.isValidContract(value)) throw new Error('Invalid registered ClaimMinter.');
    return value;
  });
  // The app drives only a ClaimMinter the Manager deployed: the index lists a claims module only
  // then (a contract registered by vote under `claims` is role `module` there). Anything else
  // could ask members to sign arbitrary calls under a claims-shaped review.
  if (registered && registered !== config.claimsContractId)
    throw new ClaimError(
      'This community registered a claims module the platform did not deploy (or that is not indexed yet), so the app will not prepare claims against it.',
      409
    );
  const [live, admin, allowance] = await Promise.all([
    token.is_live().then((tx) => readHolderValue(tx, bool)),
    token.admin().then((tx) => readHolderValue(tx, requireHolderAddress)),
    registered ? token.mint_allowance({ module: registered }).then((tx) => readHolderValue(tx, allowanceValue)) : null
  ]);
  const minter = registered ? claimMinterClient({ ...options, contractId: registered }) : null;
  const [chain, paymentAsset] = minter
    ? await Promise.all([
        readClaimLists(minter, address),
        minter.payment_asset().then((tx) =>
          readHolderValue(tx, (value) => {
            if (typeof value !== 'string' || !StrKey.isValidContract(value)) throw new Error('Invalid payment asset.');
            return value;
          })
        )
      ])
    : [{ nextListId: 0, lists: [] }, null];
  const scope = { network: config.passphrase, token: config.tokenContractId };
  const lists: ClaimListView[] = await Promise.all(
    chain.lists.map(async (list) => ({
      ...list,
      claimList: await claimListState({ root: list.root, treeUri: list.treeUri }, scope, address)
    }))
  );
  return {
    deploymentId: DEPLOYMENT_ID,
    daoId: config.tokenContractId,
    tokenContractId: config.tokenContractId,
    claimsContractId: registered,
    network: config.name,
    address,
    authenticated,
    live,
    admin,
    allowance,
    paymentAsset,
    nextListId: chain.nextListId,
    ledger: null,
    lists
  };
}

export async function claimHistory(daoId: string, offset: number): Promise<ClaimHistory> {
  const { config } = await claimScope(daoId);
  const history = await getGoldskyClaims(config.tokenContractId, { limit: 20, offset });
  return { ...history, deploymentId: DEPLOYMENT_ID, daoId: config.tokenContractId };
}

function listOpenForClaims(list: ClaimListView, now: number) {
  if (now >= list.expiresAt) throw new ClaimError('This claim list has expired.', 409);
  if (list.assurance?.state === 'failed')
    throw new ClaimError('This assurance drive failed: it only refunds now.', 409);
}

export async function prepareClaim(
  daoId: string,
  actor: { address: string; network: string },
  action: ClaimAction
): Promise<PreparedClaim> {
  const { config } = await claimScope(daoId);
  assertClaimActor(actor, config);
  const state = await currentClaims(daoId, actor);
  if (!state.claimsContractId) throw new ClaimError('This community has no claims module.');
  const list = state.lists.find((item) => item.listId === action.listId);
  if (!list) throw new ClaimError('This claim list is unavailable. Refresh before reviewing.', 409);
  listOpenForClaims(list, Math.floor(Date.now() / 1000));
  if (BigInt(list.price) > BigInt(action.maxPrice))
    throw new ClaimError('The list price is above the price you reviewed. Refresh before reviewing.', 409);
  const leaf = claimAmount(action.leafAmount);
  const claimed = BigInt(list.claimed ?? 0);
  if (claimed + BigInt(action.mintNow) > leaf)
    throw new ClaimError('That is more than is left of your allocation on this list.', 409);
  if (list.minted + action.mintNow > list.total) throw new ClaimError('Not enough of this list is left.', 409);
  if (!verifyClaimProof(actor.address, action.leafAmount, action.proof, list.root))
    throw new ClaimError('This proof does not match your address, amount and the list root.');
  const client = claimMinterClient({
    contractId: state.claimsContractId,
    rpcUrl: config.rpcUrl,
    networkPassphrase: config.passphrase,
    publicKey: actor.address,
    allowHttp: config.name === 'local'
  });
  const tx = await client.claim(
    {
      list_id: action.listId,
      claimer: actor.address,
      leaf_amount: leaf,
      mint_now: action.mintNow,
      proof: action.proof.map(hashBytes),
      max_price: BigInt(action.maxPrice)
    },
    { timeoutInSeconds: 180 }
  );
  assertClaimSimulation(tx);
  if (tx.needsNonInvokerSigningBy().length) throw new ClaimError('Additional signatures are unsupported.');
  // Recheck after simulation: the review must refer to the same ClaimMinter, list root and price.
  const latest = await currentClaims(daoId, actor);
  const again = latest.lists.find((item) => item.listId === action.listId);
  if (
    latest.claimsContractId !== state.claimsContractId ||
    !again ||
    again.root !== list.root ||
    again.price !== list.price ||
    again.claimed !== list.claimed
  )
    throw new ClaimError('The claim list changed during simulation. Review again.', 409);
  const xdr = tx.toXdr();
  const envelope = TransactionBuilder.fromXDR(xdr, config.passphrase);
  const prepared: PreparedClaim = {
    deploymentId: DEPLOYMENT_ID,
    daoId,
    tokenContractId: config.tokenContractId,
    claimsContractId: state.claimsContractId,
    address: actor.address,
    networkPassphrase: config.passphrase,
    rpcUrl: config.rpcUrl,
    listId: action.listId,
    leafAmount: action.leafAmount,
    mintNow: action.mintNow,
    maxPrice: action.maxPrice,
    cost: (BigInt(list.price) * BigInt(action.mintNow)).toString(),
    asset: list.asset,
    xdr,
    fee: envelope.fee
  };
  assertClaimEnvelope(envelope, prepared, action);
  return prepared;
}
