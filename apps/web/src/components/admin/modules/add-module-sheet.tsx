'use client';

import { Client as ManagerClient } from '@builder-stellar/manager-bindings';
import { ChevronLeft, Store, Ticket, Timer } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { css } from 'styled-system/css';

import { AuctionReservePriceField } from '@/components/auction/auction-reserve-price-field';
import {
  Button,
  Callout,
  ChoiceGroup,
  type ChoiceOption,
  DurationInput,
  Field,
  FieldHelperText,
  FieldLabel,
  Heading,
  Input,
  Select,
  Skeleton,
  Switch,
  Text
} from '@/components/ui';
import { Sheet } from '@/components/ui/sheet';
import { decimalToStroops } from '@/lib/auction-values';
import { creationAssets } from '@/lib/create-dao-schema';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { getDeploymentConfig } from '@/lib/deployment-config';
import { feeBpsFromPercent } from '@/lib/marketplace/amount';
import { sendAndConfirm, walletClientOptions } from '@/lib/minter/direct';
import {
  attachAvailability,
  isModuleKind,
  MODULE_COPY,
  MODULE_KINDS,
  type ModuleConfigs,
  type ModuleKind,
  specValue,
  validateModuleConfig
} from '@/lib/modules/kinds';
import { actionCount, buildAttachPlan, type PlanStep } from '@/lib/modules/plans';
import { planActions } from '@/lib/modules/requests';
import { checkAttach, useAttachReads } from '@/lib/modules/use-module-reads';
import type { ActionRequest } from '@/lib/proposal-actions/action-request';
import type { ProposeResult } from '@/lib/proposal-actions/propose-action';
import { useTransactionFeedback } from '@/lib/transaction-feedback';

import { afterTheVote, type CheckState, ModuleCheck, PlanList, useSafetyDelay } from './module-parts';

const ICONS: Record<ModuleKind, React.ReactNode> = {
  auction: <Timer aria-hidden="true" />,
  marketplace: <Store aria-hidden="true" />,
  claims: <Ticket aria-hidden="true" />
};

const stack = css({ display: 'grid', gap: '4' });
// The tile centres its icon; it belongs beside the first line of the title.
const iconTop = css({ alignSelf: 'flex-start', display: 'inline-flex', mt: '0.5' });
const term = css({ display: 'block', textStyle: 'caption', color: 'ink.faint', mt: '1.5' });
const why = css({ display: 'block', textStyle: 'caption', color: 'warning', fontWeight: '500', mt: '1.5' });
const review = css({ display: 'grid', gap: '1' });
const delay = css({ textStyle: 'caption', color: 'ink.muted', m: '0' });
const backRow = css({ display: 'flex' });

export function AddModuleSheet({
  open,
  onOpenChange,
  config,
  daoId,
  address,
  live,
  present,
  registered,
  propose,
  onMessage,
  onChanged
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: DaoNetworkConfig;
  daoId: string;
  address: string | null;
  /** After launch every change is a proposal; before it the launch admin signs directly. */
  live: boolean;
  present: ReadonlySet<ModuleKind>;
  registered: number;
  propose: (request: ActionRequest) => ProposeResult;
  /** A problem to show beside the card, when the change could not be added. */
  onMessage: (text: string) => void;
  onChanged: () => void;
}) {
  const assets = useMemo(() => creationAssets(config.name), [config.name]);
  const firstAsset = (assets.find((asset) => asset.code === 'XLM') ?? assets[0])?.contractId ?? '';
  const [kind, setKind] = useState<ModuleKind | null>(null);
  const [asset, setAsset] = useState(firstAsset);
  const [reserve, setReserve] = useState('1');
  const [duration, setDuration] = useState(86_400);
  const [buffer, setBuffer] = useState(300);
  const [fee, setFee] = useState('2.5');
  const [openIt, setOpenIt] = useState(true);
  const [result, setResult] = useState<{ key: string; value: CheckState } | null>(null);
  const [submitError, setSubmitError] = useState('');
  const [busy, setBusy] = useState(false);
  const tx = useTransactionFeedback(config.name);
  const direct = !live;
  const safetyDelay = useSafetyDelay(daoId);

  // Closing resets the form once the sheet has slid away, so its content never changes while it leaves.
  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (next) return;
    setTimeout(() => {
      setKind(null);
      setOpenIt(true);
      setBusy(false);
      setSubmitError('');
    }, 250);
  }

  const assetCode = assets.find((entry) => entry.contractId === asset)?.code ?? '';
  const moduleConfig = useMemo((): ModuleConfigs[ModuleKind] | null => {
    if (kind === 'auction') {
      const stroops = decimalToStroops(reserve);
      return {
        paymentAsset: asset,
        reservePrice: stroops === null ? '' : stroops.toString(),
        duration: String(duration),
        timeBuffer: String(buffer)
      };
    }
    if (kind === 'marketplace') {
      const bps = feeBpsFromPercent(fee);
      return { paymentAsset: asset, feeBps: bps === null ? '' : String(bps) };
    }
    return kind === 'claims' ? { paymentAsset: asset } : null;
  }, [kind, asset, reserve, duration, buffer, fee]);
  const problem = kind && moduleConfig ? validateModuleConfig(kind, moduleConfig as never) : null;
  const reads = useAttachReads(config, kind, address);
  const ready = Boolean(kind && moduleConfig && !problem && reads.data && !reads.data.present);

  const steps = useMemo((): PlanStep[] | null => {
    if (!ready || !kind || !moduleConfig || !reads.data) return null;
    const full = buildAttachPlan({
      kind,
      config: moduleConfig as never,
      moduleNumber: reads.data.moduleNumber,
      predicted: reads.data.predicted,
      open: openIt
    });
    // In Setup the Manager registers the module as it creates it, so one signed call does it all.
    return direct ? [{ ...full[0]!, title: `Deploy ${MODULE_COPY[kind].noun} and add it to your tribe` }] : full;
  }, [ready, kind, moduleConfig, reads.data, openIt, direct]);

  const checkKey = ready ? JSON.stringify([kind, moduleConfig, reads.data]) : '';
  useEffect(() => {
    if (!ready || !kind || !moduleConfig || !reads.data) return;
    let stale = false;
    const key = checkKey;
    const timer = setTimeout(() => {
      void checkAttach({ config, address, kind, moduleConfig: moduleConfig as never, reads: reads.data! }).then(
        (outcome) => {
          if (stale) return;
          setResult({
            key,
            value:
              outcome.state === 'ok'
                ? {
                    state: 'ok',
                    message: 'Checked just now. This should run as planned.',
                    detail: direct
                      ? 'The Manager creates it and registers it for you.'
                      : `Step 1 simulated on the chain. The rest checked against what it says now, as module number ${reads.data!.moduleNumber} of this kind.`
                  }
                : { state: 'fail', message: 'This would not run', detail: outcome.message }
          });
        }
      );
    }, 450);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
    // The key stands for the inputs the check depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkKey]);
  // Until the result for these exact inputs arrives, the check is still running.
  const check: CheckState = reads.data?.present
    ? {
        state: 'fail',
        message: 'This would not run',
        detail: 'This tribe already has one of these. Remove it first to replace it.'
      }
    : submitError
      ? { state: 'fail', message: 'This would not run', detail: submitError }
      : result && result.key === checkKey
        ? result.value
        : { state: 'checking' };

  const options: ChoiceOption[] = MODULE_KINDS.map((entry) => {
    const copy = MODULE_COPY[entry];
    const reason = attachAvailability(entry, present, registered);
    return {
      value: entry,
      label: copy.title,
      icon: <span className={iconTop}>{ICONS[entry]}</span>,
      disabled: Boolean(reason),
      description: (
        <>
          {copy.goal}
          <span className={term}>{copy.term}</span>
          {reason ? <span className={why}>{reason}</span> : null}
        </>
      )
    };
  });

  async function submit() {
    if (!kind || !moduleConfig || !steps || !reads.data || !address) return;
    setSubmitError('');
    const noun = MODULE_COPY[kind].noun;
    const title = `Add ${noun} to the tribe`;
    if (direct) {
      setBusy(true);
      tx.start(title);
      try {
        const manager = new ManagerClient(walletClientOptions(config, address, getDeploymentConfig().managerAddress));
        const hash = await sendAndConfirm(
          await manager.create_module({
            token: config.tokenContractId,
            spec: specValue(kind, moduleConfig as never) as never,
            expected_n: reads.data.moduleNumber
          }),
          config.rpcUrl
        );
        tx.success(title, hash);
        handleOpenChange(false);
        onChanged();
      } catch (error) {
        tx.fail(error, `${title} failed`);
      } finally {
        setBusy(false);
      }
      return;
    }
    try {
      const request = planActions({
        steps,
        config,
        address,
        title,
        note: `${steps.map((entry) => entry.title).join('. ')}.`
      });
      handleOpenChange(false);
      // A review dialog may follow, so let this sheet finish closing first.
      requestAnimationFrame(() => {
        const result = propose(request);
        if (result.outcome === 'invalid') onMessage(result.message);
      });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Check the values.');
    }
  }

  const choosing = kind === null;
  const canSubmit = Boolean(steps && address && check.state === 'ok') && !busy;
  const cta =
    direct && kind ? `Add ${MODULE_COPY[kind].noun}` : `Add ${steps ? actionCount(steps) : 'actions'} to your proposal`;

  return (
    <Sheet
      open={open}
      onOpenChange={handleOpenChange}
      title={choosing ? 'Add a module' : `Set up ${MODULE_COPY[kind].noun}`}
      description={
        choosing
          ? live
            ? 'Pick what your tribe can do next. Members vote on it first, and nothing changes until it passes.'
            : 'Pick what your tribe can do next. You are the launch admin, so it is signed straight away.'
          : undefined
      }
      footer={
        choosing ? undefined : (
          <Button loading={busy} disabled={!canSubmit} onClick={() => void submit()}>
            {cta}
          </Button>
        )
      }
    >
      {choosing ? (
        <ChoiceGroup
          label="Module"
          variant="tile"
          options={options}
          value={null}
          onValueChange={(value) => isModuleKind(value) && setKind(value)}
        />
      ) : (
        <div className={stack}>
          <div className={backRow}>
            <Button variant="ghost" size="sm" onClick={() => setKind(null)}>
              <ChevronLeft aria-hidden="true" />
              Back
            </Button>
          </div>
          <Text size="sm">{MODULE_COPY[kind].goal} You can change all of this later by vote.</Text>

          <Field>
            <FieldLabel htmlFor="module-asset">{kind === 'claims' ? 'Lists are priced in' : 'Price asset'}</FieldLabel>
            <Select id="module-asset" value={asset} onChange={(event) => setAsset(event.target.value)}>
              {assets.map((entry) => (
                <option key={entry.contractId} value={entry.contractId}>
                  {entry.code}
                </option>
              ))}
            </Select>
            {kind === 'claims' ? (
              <FieldHelperText>Each list sets its own price, free or in this asset.</FieldHelperText>
            ) : null}
          </Field>

          {kind === 'auction' ? (
            <>
              <AuctionReservePriceField
                id="module-reserve"
                value={reserve}
                onChange={setReserve}
                tokenCode={assetCode}
                error={decimalToStroops(reserve) === null ? 'Enter an amount with up to 7 decimal places.' : undefined}
              />
              <DurationInput id="module-duration" label="Each auction runs" value={duration} onChange={setDuration} />
              <DurationInput id="module-buffer" label="Late-bid extension" value={buffer} onChange={setBuffer} />
              <Switch
                label="Start the first auction when this passes"
                description="Otherwise it stays closed until you propose opening it."
                checked={openIt}
                onCheckedChange={setOpenIt}
                disabled={direct}
              />
            </>
          ) : null}

          {kind === 'marketplace' ? (
            <>
              <Field>
                <FieldLabel htmlFor="module-fee">Resale fee</FieldLabel>
                <Input
                  id="module-fee"
                  value={fee}
                  inputMode="decimal"
                  onChange={(event) => setFee(event.target.value)}
                />
                <FieldHelperText>Percent of each resale, paid to the treasury. At most 25.</FieldHelperText>
              </Field>
              <Switch
                label="Open it when this passes"
                description="Resale and pools stay closed until it is opened."
                checked={openIt}
                onCheckedChange={setOpenIt}
                disabled={direct}
              />
            </>
          ) : null}

          {kind === 'claims' ? (
            <Callout
              variant="info"
              title="Lists open separately"
              description="After this passes, publish a list in Manage → Claims. It adds the allowance it needs for you."
            />
          ) : null}

          {problem ? <FieldHelperText tone="error">{problem}</FieldHelperText> : null}

          <div className={review}>
            <Heading size="heading">{direct ? 'What happens' : 'When this passes, in order'}</Heading>
            <p className={delay}>
              {direct
                ? 'Signed now. It joins the launch checks; nothing opens until you launch.'
                : `${afterTheVote(safetyDelay)} If any step fails, none of them run.`}
            </p>
            {steps ? (
              <PlanList steps={steps} label="Steps" />
            ) : reads.error ? (
              <FieldHelperText tone="error">
                The chain could not be read just now. Close this and try again.
              </FieldHelperText>
            ) : (
              <Skeleton className={css({ height: '8rem' })} />
            )}
          </div>

          {ready || (reads.data?.present ?? false) ? <ModuleCheck value={check} /> : null}
        </div>
      )}
    </Sheet>
  );
}
