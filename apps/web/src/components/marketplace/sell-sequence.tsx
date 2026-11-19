'use client';

import { useState } from 'react';
import { css } from 'styled-system/css';

import { Button, Callout, Dialog, ProgressSteps } from '@/components/ui';
import { APPROVAL_EXPIRED } from '@/lib/marketplace/errors';
import { fetchMarketplaceApproval } from '@/lib/marketplace/hooks';
import { needsApprovalRead, resolveSellStep, type SellStep } from '@/lib/marketplace/sell';

import { reviewMuted, TransactionDetails } from './trade-review';
import { useMarketplaceSigner } from './use-marketplace-signer';

const stepTitle = css({ textStyle: 'label', color: 'ink', m: '0' });
const body = css({ textStyle: 'body', color: 'ink.muted', m: '0' });

function stepToken(step: SellStep) {
  if ('tokenId' in step.action) return step.action.tokenId;
  return 'id' in step.action ? step.action.id : '';
}

/**
 * The guided signatures for selling: each step is checked, signed and confirmed in turn,
 * with progress and why it is needed. Allow is skipped when the market already has a live
 * permission, and List goes back to Allow when the permission has run out.
 */
export function SellSequence({
  daoId,
  title,
  intro,
  steps,
  onStepConfirmed,
  onClose
}: {
  daoId: string;
  title: string;
  /** Shown above the steps, for example how many signatures this takes. */
  intro?: string;
  steps: SellStep[];
  onStepConfirmed?: (step: SellStep, hash: string) => void;
  onClose: () => void;
}) {
  const signer = useMarketplaceSigner(daoId);
  const { session, network, allowed, prepared, busy, message, hash, confirmed } = signer;
  const [index, setIndex] = useState(0);
  const [skipped, setSkipped] = useState<number[]>([]);
  const [finished, setFinished] = useState(false);
  const current = steps[index];
  const tokenId = current ? stepToken(current) : '';

  /** Arrive at step `at`: read the live permission when it matters, then prepare that step. */
  async function check(at: number) {
    let next = at;
    if (needsApprovalRead(steps[at])) {
      const approved = await signer.exclusive(async () => {
        signer.setMessage('Checking whether the market already has your permission…');
        try {
          return await fetchMarketplaceApproval(daoId, stepToken(steps[at]!), session.address ?? '');
        } catch {
          return null;
        }
      });
      if (approved === null) {
        signer.setMessage("We couldn't check the market's permission for your token. Try again.");
        return;
      }
      const resolved = resolveSellStep(steps, at, approved);
      if (resolved.skipped) setSkipped((items) => [...items.filter((item) => item !== at), at]);
      if (resolved.expired) {
        setSkipped((items) => items.filter((item) => item !== resolved.index));
        setIndex(resolved.index);
        signer.reset(APPROVAL_EXPIRED);
        return;
      }
      next = resolved.index;
    }
    setIndex(next);
    const error = await signer.prepare(steps[next]!.action);
    if (error === APPROVAL_EXPIRED) {
      const allow = steps.findIndex((item) => item.kind === 'approve');
      if (allow >= 0) {
        setSkipped((items) => items.filter((item) => item !== allow));
        setIndex(allow);
        signer.reset(APPROVAL_EXPIRED);
      }
    }
  }

  async function sign() {
    if (!current) return;
    const confirmedHash = await signer.sign(current.action);
    if (!confirmedHash) return;
    onStepConfirmed?.(current, confirmedHash);
    if (index + 1 < steps.length) {
      setIndex(index + 1);
      signer.reset(`Step ${index + 1} is confirmed. Next: ${steps[index + 1]!.label.toLowerCase()}.`);
      await check(index + 1);
    } else {
      setFinished(true);
    }
  }

  const done = finished && confirmed;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      closeOnInteractOutside={!busy}
      title={title}
      description={network.label}
      footer={
        done ? (
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="ghost" disabled={busy} onClick={onClose}>
              {index > 0 ? 'Stop here' : 'Close'}
            </Button>
            <Button
              disabled={!allowed || (Boolean(hash) && !confirmed)}
              loading={busy}
              onClick={prepared ? sign : () => void check(index)}
            >
              {prepared ? 'Sign and send' : 'Check'}
            </Button>
          </>
        )
      }
    >
      {intro ? <p className={body}>{intro}</p> : null}
      <ProgressSteps
        steps={steps.map((item, at) => ({
          id: `${item.kind}-${at}`,
          label: skipped.includes(at) ? `${item.label} (already allowed)` : item.label
        }))}
        current={done ? steps.length : index}
      />
      {current && !done ? (
        <div>
          <p className={stepTitle}>
            Step {index + 1} of {steps.length}: {current.label}
          </p>
          <p className={body}>{current.why}</p>
        </div>
      ) : null}
      {tokenId ? <p className={reviewMuted}>Token #{tokenId}</p> : null}
      {!allowed ? (
        <Callout variant="warning" title={session.walletNetworkIssue || 'Connect your wallet to trade.'} />
      ) : null}
      {message === APPROVAL_EXPIRED ? (
        <Callout variant="warning" title={APPROVAL_EXPIRED} role="alert" />
      ) : (
        <p className={reviewMuted} role="status" aria-live="polite">
          {done ? 'All steps are confirmed. The market can take a few seconds to show the change.' : message}
        </p>
      )}
      {index > 0 && !done && !prepared && !hash ? (
        <p className={reviewMuted}>
          The steps you confirmed stay done if you stop here. You can continue later from the Market page.
        </p>
      ) : null}
      <TransactionDetails prepared={prepared} hash={hash} network={network} />
    </Dialog>
  );
}
