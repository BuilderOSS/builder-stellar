import { Client as TokenClient } from '@builder-stellar/token-bindings';
import { rpc, StrKey, TransactionBuilder } from '@stellar/stellar-sdk';
import type { AssembledTransaction } from '@stellar/stellar-sdk/contract';
import { z } from 'zod';

import { shortAddress } from '@/lib/activity-feed';
import { type DaoNetworkConfig, readSource } from '@/lib/dao-config';
import { getDeploymentConfig } from '@/lib/deployment-config';
import { directoryScope } from '@/lib/member-directory/query';
import { holderTokenId, memberAddress } from '@/lib/member-directory/validation';
import { throwIfRestoreNeeded } from '@/lib/restore-required';

import {
  currentTokenHolder,
  holderBalance,
  holderDelegate,
  holderSettings,
  holderVotes,
  readHolderValue
} from './read';
import type { HolderAction, HolderPrepared } from './types';

export class HolderError extends Error {
  constructor(
    message: string,
    public readonly status = 422
  ) {
    super(message);
  }
}
const id = z
  .string()
  .max(10)
  .refine((value) => {
    try {
      holderTokenId(value);
      return true;
    } catch {
      return false;
    }
  });
const address = z
  .string()
  .max(56)
  .transform((value, ctx) => {
    try {
      return memberAddress(value);
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Invalid Stellar address.' });
      return z.NEVER;
    }
  });
// `afterLedger`: the ledger of the holder's last confirmed action, so the next one is simulated on
// state that includes it (BUG-W11-5).
const after = { afterLedger: id.optional() };
export const holderActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('transfer'), tokenId: id, destination: address, ...after }).strict(),
  z
    .object({ action: z.literal('approve'), tokenId: id, destination: address, expirationLedger: id, ...after })
    .strict(),
  z.object({ action: z.literal('revoke'), tokenId: id, ...after }).strict(),
  z.object({ action: z.literal('delegate'), tokenId: id, destination: address, ...after }).strict()
]);
export function holderClient(config: DaoNetworkConfig, address: string) {
  return new TokenClient({
    contractId: config.tokenContractId,
    rpcUrl: config.rpcUrl,
    networkPassphrase: config.passphrase,
    publicKey: readSource(address),
    allowHttp: config.name === 'local'
  });
}
export async function assertHolderOwner(client: Pick<TokenClient, 'owner_of'>, tokenId: number, address: string) {
  const owner = await currentTokenHolder(client, tokenId);
  if (owner !== address) throw new HolderError('You no longer own this token. Refresh before trying again.', 409);
}
export function holderXdr(tx: AssembledTransaction<void>) {
  throwIfRestoreNeeded(tx);
  void tx.simulationData;
  if (tx.needsNonInvokerSigningBy().some((address) => StrKey.isValidEd25519PublicKey(address)))
    throw new HolderError('This action needs another account signature. Nothing was submitted.');
  return tx.toXdr();
}
/**
 * Prepare a holder action. With `afterLedger`, a simulation run on that ledger or an earlier one is
 * thrown away and run again: its footprint would miss the vote checkpoint the real transaction
 * creates in a later ledger, and the signed transaction would fail on chain.
 */
export async function prepareHolderAction(
  daoId: string,
  actor: { address: string; network: string },
  action: HolderAction & { afterLedger?: string },
  { attempts = 5, pauseMs = 2_000 }: { attempts?: number; pauseMs?: number } = {}
): Promise<HolderPrepared> {
  const after = action.afterLedger ? Number(action.afterLedger) : 0;
  for (let attempt = 1; ; attempt++) {
    const { prepared, simulatedAt } = await prepareOnce(daoId, actor, action);
    // Strictly after: simulated in the last action's own ledger, a vote checkpoint written then is
    // updated in place, while the real transaction lands later and needs a new checkpoint key.
    if (!after || simulatedAt === null || simulatedAt > after) return prepared;
    if (attempt >= attempts)
      throw new HolderError(
        'The network doesn’t show your last transaction yet. Wait a few seconds, then review again.',
        409
      );
    await new Promise((resolve) => setTimeout(resolve, pauseMs));
  }
}

async function prepareOnce(
  daoId: string,
  actor: { address: string; network: string },
  action: HolderAction
): Promise<{ prepared: HolderPrepared; simulatedAt: number | null }> {
  const { config, deploymentId, daoId: token } = await directoryScope(daoId);
  const deployment = getDeploymentConfig();
  if (
    actor.network !== config.name ||
    config.name !== deployment.name ||
    config.passphrase !== deployment.networkPassphrase
  )
    throw new HolderError('Authenticate on this DAO’s network before continuing.', 401);
  if (!StrKey.isValidEd25519PublicKey(actor.address))
    throw new HolderError('An authenticated account is required.', 401);
  const tokenId = holderTokenId(action.tokenId);
  const client = holderClient(config, actor.address);
  await assertHolderOwner(client, tokenId, actor.address);
  const options = { timeoutInSeconds: 180 };
  // The membership switches as the Token holds them now (docs/designs/locked-tokens.md):
  // checked here so the member gets a plain answer instead of a failed simulation.
  const settings = readHolderValue(await client.settings(), holderSettings);
  const treasury = config.treasuryContractId;
  let tx: AssembledTransaction<void>;
  let summary: string;
  if (action.action === 'transfer') {
    if (action.destination === actor.address) throw new HolderError('Choose a different recipient.');
    const giveBack = action.destination === treasury;
    if (settings.transfers_locked && !giveBack)
      throw new HolderError(
        'Memberships in this tribe are locked. You can give your token back to the tribe, or approve the tribe to move it by a vote.',
        409
      );
    tx = await client.transfer(
      { from: actor.address, to: memberAddress(action.destination), token_id: tokenId },
      options
    );
    summary = giveBack
      ? `Give token #${tokenId} back to the tribe Treasury (${shortAddress(treasury)}). You will no longer own it, and it carries no vote while the Treasury holds it.`
      : `Transfer token #${tokenId} to ${action.destination}. You will no longer own it. Its voting unit moves to the recipient’s delegate.`;
  } else if (action.action === 'approve') {
    if (settings.transfers_locked && action.destination !== treasury)
      throw new HolderError(
        'Memberships in this tribe are locked. You can only approve the tribe Treasury, so a proposal can move this token.',
        409
      );
    const expiration = holderTokenId(action.expirationLedger);
    const latest = await new rpc.Server(config.rpcUrl, { allowHttp: config.name === 'local' }).getLatestLedger();
    if (expiration <= latest.sequence) throw new HolderError('The approval must end in the future.');
    if (action.destination === actor.address) throw new HolderError('Choose a different spender.');
    tx = await client.approve(
      {
        owner: actor.address,
        spender: memberAddress(action.destination),
        token_id: tokenId,
        expiration_ledger: expiration
      },
      options
    );
    summary =
      action.destination === treasury
        ? `Allow the tribe Treasury (${shortAddress(treasury)}) to transfer only token #${tokenId} until network position ${expiration}, so a proposal members pass can move it. This replaces its single-token approval; ownership does not change until a proposal runs.`
        : `Allow ${action.destination} to transfer only token #${tokenId} until network position ${expiration}. This replaces its single-token approval; ownership does not change.`;
  } else if (action.action === 'revoke') {
    // The pinned NFT Base removes the single-token approval at expiration ledger 0.
    // A valid spender address is still required; the holder form shows the live one (get_approved) first.
    tx = await client.approve(
      { owner: actor.address, spender: actor.address, token_id: tokenId, expiration_ledger: 0 },
      options
    );
    summary = `Revoke the single-token approval for #${tokenId} immediately. This does not revoke collection-wide operator permissions or transfer ownership.`;
  } else {
    const [balance, votes, delegate] = await Promise.all([
      client.balance({ account: actor.address }).then((tx) => readHolderValue(tx, holderBalance)),
      client.get_votes({ account: actor.address }).then((tx) => readHolderValue(tx, holderVotes)),
      client.get_delegate({ account: actor.address }).then((tx) => readHolderValue(tx, holderDelegate))
    ]);
    const delegatee = memberAddress(action.destination);
    if (settings.members_only_delegation && delegatee !== actor.address) {
      const [held, modules] = await Promise.all([
        client.balance({ account: delegatee }).then((tx) => readHolderValue(tx, holderBalance)),
        client.modules().then((tx) => tx.result)
      ]);
      const custody =
        delegatee === treasury || modules.some((entry) => entry.non_voting && entry.address === delegatee);
      if (held === 0 || custody)
        throw new HolderError(
          'This tribe only lets you delegate to members: someone who holds a token. Tokens listed for sale don’t count.',
          409
        );
    }
    tx = await client.delegate({ account: actor.address, delegatee }, options);
    summary = `Delegate the voting units of all ${balance} tokens you own to ${action.destination}. Current delegate: ${delegate ?? 'none'}. Your current voting power is ${votes.toString()} (including votes received). Ownership and received delegations do not change. Self-delegating returns your own voting units to you.`;
  }
  const xdr = holderXdr(tx);
  const envelope = TransactionBuilder.fromXDR(xdr, config.passphrase);
  if (!('source' in envelope) || envelope.source !== actor.address)
    throw new HolderError('Unexpected transaction source.', 503);
  const simulation = (tx as { simulation?: { latestLedger?: number } }).simulation;
  return {
    prepared: {
      deploymentId,
      daoId: token,
      address: actor.address,
      tokenContractId: token,
      tokenId,
      networkPassphrase: config.passphrase,
      rpcUrl: config.rpcUrl,
      xdr,
      fee: envelope.fee,
      summary
    },
    simulatedAt: typeof simulation?.latestLedger === 'number' ? simulation.latestLedger : null
  };
}
