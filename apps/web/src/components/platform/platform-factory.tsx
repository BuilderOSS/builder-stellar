'use client';

import { useState } from 'react';
import { css } from 'styled-system/css';

import { Address, Button, Callout, Chip, ConfirmAction, DurationInput, ListRow, Section } from '@/components/ui';
import { SECONDS_PER_LEDGER } from '@/lib/chain-reads/renewal';
import { describeContractError } from '@/lib/contract-errors';
import { platformActions, validateUpgradeDelay } from '@/lib/platform/actions';
import type { PlatformConfig } from '@/lib/platform/config';
import type { PlatformState } from '@/lib/platform/registry';
import { useTransactionFeedback } from '@/lib/transaction-feedback';

import { ledgerSpan, whenLedger } from './format';

const rows = css({ display: 'grid' });
const delayForm = css({ display: 'grid', gap: '3', maxW: '32rem', pt: '2' });
const muted = css({ textStyle: 'caption', color: 'ink.muted', m: '0' });
const actions = css({ display: 'flex', gap: '2', flexWrap: 'wrap', alignItems: 'center' });

/** The factory switch, the Manager's upgrade notice, and who administers it. */
export function PlatformFactory({
  config,
  state,
  admin,
  networkReady,
  onChanged
}: {
  config: PlatformConfig;
  state: PlatformState;
  /** The signed-in platform admin's address; null keeps the section read-only. */
  admin: string | null;
  networkReady: boolean;
  onChanged: () => Promise<unknown>;
}) {
  const tx = useTransactionFeedback(config.name);
  const [busy, setBusy] = useState<'pause' | 'delay' | null>(null);
  const [error, setError] = useState('');
  const [delaySeconds, setDelaySeconds] = useState<number | null>(null);

  const current = state.upgradeDelay;
  const draftLedgers = delaySeconds === null ? null : Math.round(delaySeconds / SECONDS_PER_LEDGER);
  const delayError = draftLedgers === null ? null : validateUpgradeDelay(draftLedgers);
  const delayChanged = draftLedgers !== null && draftLedgers !== current;

  async function run(kind: 'pause' | 'delay', label: string, done: string, work: () => Promise<string>) {
    setBusy(kind);
    setError('');
    tx.start(label);
    try {
      const hash = await work();
      tx.success(done, hash);
      if (kind === 'delay') setDelaySeconds(null);
    } catch (failure) {
      tx.fail(failure, `${label} stopped`, 'manager');
      setError(
        describeContractError(failure, 'manager') ?? (failure instanceof Error ? failure.message : String(failure))
      );
    } finally {
      setBusy(null);
      await onChanged();
    }
  }

  const paused = state.factoryPaused;
  const canAct = Boolean(admin) && networkReady && busy === null;

  return (
    <Section
      id="factory"
      title="Factory and admin"
      description="Who runs the registry, and whether new tribes can be created."
    >
      <div className={rows}>
        <ListRow
          title="New tribes"
          wrap
          meta={
            paused === null
              ? "Couldn't be read."
              : paused
                ? 'Paused: no new tribes or modules, launches or link changes. Existing tribes keep working.'
                : 'Open: anyone can build a tribe.'
          }
          trailing={
            paused === null ? null : (
              <span className={actions}>
                <Chip tone={paused ? 'danger' : 'success'}>{paused ? 'Paused' : 'Open'}</Chip>
                {admin ? (
                  paused ? (
                    <ConfirmAction
                      trigger={
                        <Button variant="secondary" size="sm" disabled={!canAct}>
                          Resume new tribes
                        </Button>
                      }
                      title="Resume new tribes?"
                      description="Anyone can create, launch and rename tribes again."
                      confirmLabel="Resume new tribes"
                      tone="primary"
                      busy={busy === 'pause'}
                      onConfirm={() =>
                        run('pause', 'Resume new tribes', 'New tribes resumed', () =>
                          platformActions.unpauseFactory(config, admin)
                        )
                      }
                    />
                  ) : (
                    <ConfirmAction
                      trigger={
                        <Button variant="danger" size="sm" disabled={!canAct}>
                          Pause new tribes
                        </Button>
                      }
                      title="Pause new tribes?"
                      description="New tribes and modules can't be created, launched or renamed until you resume. Existing tribes keep working."
                      confirmLabel="Pause new tribes"
                      tone="danger"
                      busy={busy === 'pause'}
                      onConfirm={() =>
                        run('pause', 'Pause new tribes', 'New tribes paused', () =>
                          platformActions.pauseFactory(config, admin)
                        )
                      }
                    />
                  )
                ) : null}
              </span>
            )
          }
        />
        <ListRow
          title="Upgrade notice"
          wrap
          meta={
            current === null
              ? "Couldn't be read."
              : `A Tribe Builder upgrade waits ${ledgerSpan(current)} after it is approved${
                  state.pendingDelay
                    ? ` · changes to ${ledgerSpan(state.pendingDelay.ledgers)} about ${whenLedger(state.pendingDelay.effectiveLedger, state.latestLedger)}`
                    : ''
                }`
          }
          trailing={current === null ? null : <Chip>{ledgerSpan(current)}</Chip>}
        />
        <ListRow
          title="Admin"
          wrap
          meta={state.admin ? <Address value={state.admin} label="Platform admin" compact /> : 'Not set'}
        />
        {state.pendingAdmin ? (
          <ListRow
            title="Admin handover pending"
            wrap
            meta={<Address value={state.pendingAdmin} label="Proposed admin" compact />}
            trailing={<Chip tone="warning">Pending</Chip>}
          />
        ) : null}
        <ListRow
          title="Tribe Builder version"
          wrap
          meta={
            state.managerVersion
              ? `${state.managerVersion}${state.managerHash ? ` · code ${state.managerHash.slice(0, 8)}…` : ''}`
              : "Couldn't be read."
          }
          trailing={<Address value={state.managerAddress} label="Manager" compact />}
        />
      </div>

      {admin && current !== null ? (
        <div className={delayForm}>
          <DurationInput
            id="platform-upgrade-delay"
            label="Change the upgrade notice"
            value={delaySeconds ?? current * SECONDS_PER_LEDGER}
            onChange={setDelaySeconds}
            invalid={Boolean(delayError)}
            showSeconds={false}
          />
          <p className={muted}>
            {delayError ??
              (draftLedgers !== null && draftLedgers < current
                ? `A shorter notice applies only after the current ${ledgerSpan(current)} has passed.`
                : 'A longer notice applies at once.')}
          </p>
          <div className={actions}>
            <Button
              variant="secondary"
              loading={busy === 'delay'}
              disabled={!canAct || !delayChanged || Boolean(delayError)}
              onClick={() =>
                void run('delay', 'Change the upgrade notice', 'Upgrade notice changed', () =>
                  platformActions.setUpgradeDelay(config, admin, draftLedgers!)
                )
              }
            >
              {delayChanged && draftLedgers !== null ? `Set notice to ${ledgerSpan(draftLedgers)}` : 'Set notice'}
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <Callout variant="error" title="That change didn't go through" description={error} role="alert" />
      ) : null}
    </Section>
  );
}
