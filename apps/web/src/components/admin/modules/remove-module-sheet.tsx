'use client';

import { Check, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { css } from 'styled-system/css';

import { Button, Callout, Checkbox, FieldHelperText, Heading, Skeleton } from '@/components/ui';
import { Sheet } from '@/components/ui/sheet';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { MODULE_COPY, type ModuleKind } from '@/lib/modules/kinds';
import { actionCount, buildDetachPlan, type PlanStep } from '@/lib/modules/plans';
import { moduleReadiness, type ReadinessRow } from '@/lib/modules/readiness';
import { planRequests } from '@/lib/modules/requests';
import { checkDetach, useModuleFacts } from '@/lib/modules/use-module-reads';
import type { AdminProposalBatchRequest } from '@/lib/use-admin-proposal-draft';

import { afterTheVote, type CheckState, ModuleCheck, PlanList, useSafetyDelay } from './module-parts';

export type RemovableModule = { kind: ModuleKind; address: string; allowance: number; agent: boolean };

const stack = css({ display: 'grid', gap: '4' });
const rows = css({ display: 'grid' });
const item = css({
  display: 'grid',
  gridTemplateColumns: '20px 1fr',
  gap: '3',
  py: '3',
  borderBottomWidth: '1px',
  borderColor: 'rule',
  _last: { borderBottomWidth: '0' }
});
const itemTitle = css({ textStyle: 'body', fontWeight: '600', color: 'ink' });
const itemDetail = css({ textStyle: 'caption', color: 'ink.muted', mt: '0.5' });
const itemControl = css({ mt: '2.5' });
const ok = css({ color: 'success', width: '5', height: '5', mt: '0.5' });
const warn = css({ color: 'warning', width: '5', height: '5', mt: '0.5' });
const review = css({ display: 'grid', gap: '1' });
const delay = css({ textStyle: 'caption', color: 'ink.muted', m: '0' });

function cleanupLabel(row: ReadinessRow, pools: number) {
  return row.cleanup === 'pools'
    ? `Also close ${pools === 1 ? 'the pool' : 'the pools'} and sweep the memberships back to the treasury`
    : 'Pause and cancel the running auction first';
}

export function RemoveModuleSheet({
  open,
  onOpenChange,
  config,
  daoId,
  address,
  module,
  addBatch,
  onAdded
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: DaoNetworkConfig;
  daoId: string;
  address: string | null;
  module: RemovableModule | null;
  addBatch: (request: AdminProposalBatchRequest) => void;
  onAdded: (text: string) => void;
}) {
  const noun = module ? MODULE_COPY[module.kind].noun : 'the module';
  const safetyDelay = useSafetyDelay(daoId);
  const read = useModuleFacts(
    config,
    daoId,
    open && module
      ? { kind: module.kind, address: module.address, allowance: module.allowance, transferAgent: module.agent }
      : null,
    address
  );
  const [sweep, setSweep] = useState(true);
  const [cancel, setCancel] = useState(true);
  const [result, setResult] = useState<{ key: string; value: CheckState } | null>(null);
  const [submitError, setSubmitError] = useState('');

  // Closing resets the choices once the sheet has slid away, so its content never changes while it leaves.
  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (next) return;
    setTimeout(() => {
      setSweep(true);
      setCancel(true);
      setSubmitError('');
    }, 250);
  }

  const checklist = useMemo(() => (read.facts ? moduleReadiness(read.facts) : []), [read.facts]);
  const hasPools = checklist.some((row) => row.cleanup === 'pools');
  const hasAuction = checklist.some((row) => row.cleanup === 'auction');
  const steps = useMemo((): PlanStep[] | null => {
    if (!module || !read.facts) return null;
    return buildDetachPlan({
      kind: module.kind,
      address: module.address,
      pools: hasPools && sweep ? read.facts.pools : [],
      cancelAuction: hasAuction && cancel
    });
  }, [module, read.facts, hasPools, sweep, hasAuction, cancel]);

  const moduleAddress = module?.address ?? '';
  const checkKey = open && moduleAddress ? `${moduleAddress}:${address ?? ''}` : '';
  useEffect(() => {
    if (!checkKey) return;
    let stale = false;
    const key = checkKey;
    void checkDetach({ config, address, module: moduleAddress }).then((outcome) => {
      if (stale) return;
      setResult({
        key,
        value:
          outcome.state === 'ok'
            ? {
                state: 'ok',
                message: 'Checked just now. This should run as planned.',
                detail:
                  'The removal was simulated on the chain. The clean-up steps depend on each other, so they run in order when it passes.'
              }
            : { state: 'fail', message: 'This would not run', detail: outcome.message }
      });
    });
    return () => {
      stale = true;
    };
    // The key stands for the inputs the check depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkKey]);
  const check: CheckState = submitError
    ? { state: 'fail', message: 'This would not run', detail: submitError }
    : result && result.key === checkKey
      ? result.value
      : { state: 'checking' };

  function submit() {
    if (!module || !steps || !address) return;
    setSubmitError('');
    const title = `Remove ${noun} from the tribe`;
    try {
      const requests = planRequests({
        steps,
        config,
        address,
        daoId,
        title,
        description: `${steps.map((entry) => entry.title).join('. ')}.`
      });
      handleOpenChange(false);
      // The draft asks for its own confirmation, so let this sheet finish closing first.
      requestAnimationFrame(() =>
        addBatch({ daoId, requests, onAdded: () => onAdded(`${title}: added to the proposal draft.`) })
      );
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Check the values.');
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={handleOpenChange}
      title={`Remove ${noun}?`}
      description="It stops being part of your tribe. The contract stays on the network, but it can no longer mint or hold memberships for you."
      footer={
        <Button disabled={!steps || !address || check.state !== 'ok'} onClick={submit}>
          {`Add ${steps ? actionCount(steps) : 'actions'} to your proposal`}
        </Button>
      }
    >
      <div className={stack}>
        {read.error ? (
          <Callout
            variant="error"
            title="This module could not be read"
            description="Close this and try again. Nothing was changed."
          />
        ) : read.isLoading || !read.facts ? (
          <Skeleton className={css({ height: '14rem' })} />
        ) : (
          <>
            <div className={rows} role="list" aria-label="Before you remove it">
              {checklist.map((row) => (
                <div key={row.id} className={item} role="listitem">
                  {row.tone === 'ok' ? (
                    <Check className={ok} aria-label="Fine" />
                  ) : (
                    <TriangleAlert className={warn} aria-label="Worth a look" />
                  )}
                  <div>
                    <div className={itemTitle}>{row.title}</div>
                    <div className={itemDetail}>{row.detail}</div>
                    {row.cleanup ? (
                      <div className={itemControl}>
                        <Checkbox
                          label={cleanupLabel(
                            row,
                            read.facts?.pools.filter((pool) => pool.open || pool.inStock > 0).length ?? 0
                          )}
                          checked={row.cleanup === 'pools' ? sweep : cancel}
                          onCheckedChange={row.cleanup === 'pools' ? setSweep : setCancel}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            <div className={review}>
              <Heading size="heading">When this passes, in order</Heading>
              <p className={delay}>{afterTheVote(safetyDelay)}</p>
              {steps ? <PlanList steps={steps} label="Steps" /> : null}
            </div>
            <ModuleCheck value={check} />
            {checklist.some((row) => row.tone === 'warn') ? (
              <FieldHelperText>
                Warnings never block a removal, and the proposal members vote on repeats them.
              </FieldHelperText>
            ) : null}
          </>
        )}
      </div>
    </Sheet>
  );
}
