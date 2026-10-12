'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { css } from 'styled-system/css';

import { AdminProposalDraftDialog } from '@/components/admin/admin-proposal-draft-dialog';
import { Button, Field, FieldHelperText, FieldLabel, SegmentedControl, Textarea } from '@/components/ui';
import { DEPLOYMENT_ID } from '@/config/deployments.generated';
import { useDaoContext } from '@/contexts/dao-context';
import { daoRoute } from '@/lib/dao-routes';
import { MAX_PROPOSAL_ACTIONS } from '@/lib/governance-limits';
import { allocationQueueAction } from '@/lib/minter/allocation-proposal';
import { claimFetch } from '@/lib/minter/hooks';
import { type AllocationDraft, buildAllocationDraft } from '@/lib/minter/proposal-actions';
import { buildClaimTree, type ClaimEntry, claimTreeJson, MAX_TREE_CLAIMS } from '@/lib/minter/tree';
import type { ClaimState } from '@/lib/minter/types';
import { uploadFile } from '@/lib/upload-image';
import { useProposalActions } from '@/lib/use-proposal-actions';
import { useAuthSessionStore } from '@/stores/auth-session-store';
import { selectDraft, useProposalComposerStore } from '@/stores/proposal-composer-store';

import styles from './claims-styles';

/** One recipient per line: an address and a whole-token amount, separated by a comma, space or tab. */
export function parseAllocationLines(text: string): ClaimEntry[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line, index) => {
      const parts = line.split(/[\s,;]+/).filter(Boolean);
      if (parts.length !== 2) throw new Error(`Line ${index + 1}: use an address and an amount.`);
      return { address: parts[0]!, amount: parts[1]! };
    });
}

type Mode = 'round' | 'batch';

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
  const [mode, setMode] = useState<Mode>('round');
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
      const entries = parseAllocationLines(text);
      let draft: AllocationDraft;
      if (mode === 'round') {
        // Build the tree here, publish the full list, then propose its root with the list's address.
        const tree = buildClaimTree(entries, {
          network: config.passphrase,
          token: config.tokenContractId,
          round: (state.merkle.round ?? 0) + 1
        });
        setResult(`Publishing the claim list (${entries.length} people, ${tree.tokenTotal} tokens)…`);
        const file = new File([claimTreeJson(tree)], `claim-list-round-${tree.round}.json`, {
          type: 'application/json'
        });
        const { ipfsUri } = await uploadFile(file, 'claim-list');
        if (ticket !== epoch.current) return;
        draft = { type: 'set-merkle-root', root: tree.merkleRoot, treeUri: ipfsUri };
      } else {
        draft = {
          type: 'minter-batch-mint',
          recipients: entries.map((entry) => entry.address),
          amounts: entries.map((entry) => entry.amount)
        };
      }
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
          title: mode === 'round' ? 'Open a claim round' : 'Allocate tokens',
          description:
            mode === 'round'
              ? 'Opens a claim round. The full claim list is published so anyone can check who can claim and how much.'
              : 'Mints tokens directly to the listed people when the proposal runs.',
          url: ''
        }
      });
    } catch (error) {
      setResult(error instanceof Error ? error.message : 'Invalid allocation list.');
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <div className={styles.review}>
      <h2>Prepare an allocation</h2>
      <SegmentedControl
        label="Allocation type"
        value={mode}
        onValueChange={(value) => {
          setMode(value as Mode);
          setResult('');
          cancelReview();
        }}
        options={[
          { value: 'round', label: 'Claim round' },
          { value: 'batch', label: 'Mint now' }
        ]}
      />
      <p>
        {mode === 'round'
          ? `People claim their own tokens. Up to ${MAX_TREE_CLAIMS.toLocaleString()} people; the full list is published to IPFS so anyone can check it. A new round lets earlier claimers claim again.`
          : 'Tokens are minted straight to up to 18 people when the proposal runs.'}{' '}
        Nothing is signed here: the allocation goes into a proposal members vote on.
      </p>
      <Field>
        <FieldLabel htmlFor="allocation-list">Recipients</FieldLabel>
        <Textarea
          id="allocation-list"
          className={css({ textStyle: 'mono', fontSize: '0.8125rem' })}
          rows={8}
          value={text}
          placeholder={'GABC… 5\nGDEF… 2'}
          onChange={(event) => {
            setText(event.target.value);
            setResult('');
            cancelReview();
          }}
        />
        <FieldHelperText>One per line: a Stellar address and a whole-token amount.</FieldHelperText>
      </Field>
      <div>
        <Button
          variant="secondary"
          disabled={!allowed || !!proposal.pending}
          loading={busy}
          onClick={() => void review()}
        >
          {mode === 'round' ? 'Publish the list and add to a proposal' : 'Add to a proposal'}
        </Button>
      </div>
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
