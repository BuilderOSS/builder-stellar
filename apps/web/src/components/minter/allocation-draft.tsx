'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { AdminProposalDraftDialog } from '@/components/admin/admin-proposal-draft-dialog';
import { DEPLOYMENT_ID } from '@/config/deployments.generated';
import { useDaoContext } from '@/contexts/dao-context';
import { daoRoute } from '@/lib/dao-routes';
import { MAX_PROPOSAL_ACTIONS } from '@/lib/governance-limits';
import { allocationQueueAction } from '@/lib/minter/allocation-proposal';
import { claimFetch } from '@/lib/minter/hooks';
import { type AllocationDraft, buildAllocationDraft } from '@/lib/minter/proposal-actions';
import type { ClaimState } from '@/lib/minter/types';
import { useProposalActions } from '@/lib/use-proposal-actions';
import { useAuthSessionStore } from '@/stores/auth-session-store';
import { selectDraft, useProposalComposerStore } from '@/stores/proposal-composer-store';

import styles from './claims-styles';

export function AllocationDraftForm({ state }: { state?: ClaimState }) {
  const { daoId, daoConfig: config, routeId } = useDaoContext();
  const session = useAuthSessionStore();
  const proposal = useProposalActions();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const epoch = useRef(0);
  function cancelReview() {
    epoch.current += 1;
    proposal.cancel();
  }
  const [text, setText] = useState('');
  const [result, setResult] = useState('');
  const allowed =
    session.authStatus === 'authenticated' &&
    !!session.address &&
    !session.walletNetworkIssue &&
    state?.authenticated &&
    state.address === session.address &&
    state.network === config.name &&
    state.live &&
    state.mintAuthority &&
    state.admin === config.treasuryContractId &&
    !!config.minterContractId &&
    state.minterContractId === config.minterContractId &&
    !!config.minterSpec?.length;
  async function review() {
    if (locked.current) return;
    locked.current = true;
    const ticket = ++epoch.current;
    setBusy(true);
    try {
      if (!allowed)
        throw new Error(
          'Authenticate and verify the current Minter, Token admin, Live state and mint authority first.'
        );
      if (!state) throw new Error('Refresh current allocation state first.');
      if (text.length > 20000) throw new Error('Allocation JSON exceeds 20 KB.');
      const value: unknown = JSON.parse(text);
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Expected allocation JSON object.');
      const item = value as Record<string, unknown>;
      let draft: AllocationDraft;
      if (item.type === 'set-merkle-root' && Object.keys(item).length === 2 && typeof item.root === 'string')
        draft = { type: item.type, root: item.root };
      else if (
        item.type === 'set-allowlist' &&
        Object.keys(item).length === 3 &&
        typeof item.amount === 'string' &&
        Array.isArray(item.addresses) &&
        item.addresses.every((address) => typeof address === 'string')
      )
        draft = { type: item.type, addresses: item.addresses, amount: item.amount };
      else if (
        item.type === 'minter-batch-mint' &&
        Object.keys(item).length === 3 &&
        Array.isArray(item.recipients) &&
        item.recipients.every((address) => typeof address === 'string') &&
        Array.isArray(item.amounts) &&
        item.amounts.every((amount) => typeof amount === 'string')
      )
        draft = { type: item.type, recipients: item.recipients, amounts: item.amounts };
      else throw new Error('Use an exact supported draft shape. Amounts must be decimal strings, not JSON numbers.');
      setResult(
        JSON.stringify(
          buildAllocationDraft(draft, state, DEPLOYMENT_ID, config.tokenContractId, config.treasuryContractId),
          null,
          2
        )
      );
      const fresh = await claimFetch<ClaimState>(`/api/dao/${encodeURIComponent(config.tokenContractId)}/claims`);
      if (ticket !== epoch.current) return;
      const actor = useAuthSessionStore.getState();
      if (
        actor.authStatus !== 'authenticated' ||
        actor.address !== session.address ||
        actor.walletNetworkIssue ||
        !fresh.authenticated ||
        fresh.address !== actor.address
      )
        throw new Error('Authenticated account changed. Refresh and review again.');
      const action = allocationQueueAction(draft, fresh, config, DEPLOYMENT_ID);
      if (
        selectDraft(actor.address, daoId)(useProposalComposerStore.getState()).queuedActions.length >=
        MAX_PROPOSAL_ACTIONS
      )
        throw new Error('The draft already contains 20 actions. Edit it in the composer.');
      proposal.requestAdd({
        daoId,
        action,
        source: 'claims/allocations',
        metadata: {
          title: 'Update token allocation',
          description:
            'Review the registered Minter allocation, claim round changes, recipients and exact amounts before governance execution.',
          url: ''
        }
      });
    } catch (error) {
      setResult(error instanceof Error ? error.message : 'Invalid allocation JSON.');
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <div className={styles.review}>
      <h2>Validate an allocation draft</h2>
      <p>
        Review an allocation and add it to this community’s proposal queue. No signature is requested here. Governance
        voting, queueing and Treasury execution are required; no Merkle trees or proofs are generated.
      </p>
      <p className={styles.address}>
        {'{"type":"set-merkle-root","root":"64-character hex"}'}
        <br />
        {'{"type":"set-allowlist","addresses":["G…"],"amount":"5"}'}
        <br />
        {'{"type":"minter-batch-mint","recipients":["G…"],"amounts":["5"]}'}
      </p>
      <p>
        Review limit: 100 recipients. Replacing a root/list starts a new round and permits repeat claims. Batch mint is
        immediate admin allocation, not a claim round.
      </p>
      <label>
        Allocation JSON
        <textarea
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setResult('');
            cancelReview();
          }}
        />
      </label>
      <button disabled={!allowed || busy || !!proposal.pending} onClick={() => void review()}>
        {busy ? 'Refreshing allocation authority…' : 'Review allocation proposal'}
      </button>
      {result ? (
        <pre className={styles.address} role="status">
          {result}
        </pre>
      ) : null}
      <AdminProposalDraftDialog
        pending={proposal.pending}
        onCancel={cancelReview}
        onResolve={(resolution) => {
          if (locked.current) return;
          if (!allowed) {
            proposal.cancel();
            setResult('Allocation authority changed; review again.');
            return;
          }
          void (async () => {
            locked.current = true;
            const ticket = epoch.current;
            setBusy(true);
            try {
              const fresh = await claimFetch<ClaimState>(
                `/api/dao/${encodeURIComponent(config.tokenContractId)}/claims`
              );
              if (ticket !== epoch.current) return;
              const actor = useAuthSessionStore.getState();
              if (actor.authStatus !== 'authenticated' || actor.address !== session.address || actor.walletNetworkIssue)
                throw new Error('Authenticated account changed.');
              if (!fresh.authenticated || fresh.address !== session.address || !proposal.pending)
                throw new Error('Account changed; review again.');
              const queued = proposal.pending.action;
              allocationQueueAction(queued as unknown as AllocationDraft, fresh, config, DEPLOYMENT_ID);
              if (
                selectDraft(session.address, daoId)(useProposalComposerStore.getState()).queuedActions.length >=
                MAX_PROPOSAL_ACTIONS
              )
                throw new Error('Proposal action limit reached.');
              proposal.resolve(resolution);
              router.push(daoRoute(routeId, 'proposals/create'));
            } catch (error) {
              setResult(error instanceof Error ? error.message : 'Unable to add allocation.');
              proposal.cancel();
            } finally {
              locked.current = false;
              setBusy(false);
            }
          })();
        }}
      />
    </div>
  );
}
