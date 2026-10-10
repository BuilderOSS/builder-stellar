'use client';

import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { Check } from 'lucide-react';
import { useState } from 'react';
import { css } from 'styled-system/css';

import { AdminProposalDraftDialog } from '@/components/admin/admin-proposal-draft-dialog';
import { Address, Button, Callout, Chip, Disclosure, Skeleton } from '@/components/ui';
import { card, muted, title } from '@/components/ui/panel-styles';
import { useDaoContext } from '@/contexts/dao-context';
import { treasuryIsAdmin } from '@/lib/admin-proposals';
import { assertAdminCallSupported } from '@/lib/admin-registered-call';
import { MODULE_LABELS, type ModuleUpdate, type ModuleUpdateStatus } from '@/lib/module-updates';
import { getActionHandler } from '@/lib/proposal-actions/registry';
import { releaseNote } from '@/lib/release-notes';
import { waitForConfirmation } from '@/lib/transaction-confirmation';
import { useTransactionFeedback } from '@/lib/transaction-feedback';
import { useAdminProposalDraft } from '@/lib/use-admin-proposal-draft';
import { upgradeModuleDirectly, useModuleUpdates } from '@/lib/use-module-updates';
import { useAuthSessionStore } from '@/stores/auth-session-store';

const list = css({ listStyle: 'none', m: '0', p: '0' });
const row = css({
  display: 'grid',
  gap: '2',
  py: '4',
  borderBottomWidth: '1px',
  borderColor: 'rule',
  _last: { borderBottomWidth: '0' }
});
const statusCol = css({ display: 'inline-flex', justifyContent: 'flex-end', minW: '48' });
const compactRow = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '3',
  minH: '12',
  borderBottomWidth: '1px',
  borderColor: 'rule',
  _last: { borderBottomWidth: '0' }
});
const rowHead = css({
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: '3',
  flexWrap: 'wrap'
});
const name = css({ textStyle: 'body', fontWeight: '600', color: 'ink', m: '0' });
const version = css({ textStyle: 'mono', fontSize: '0.8125rem', color: 'ink.muted' });
const note = css({ textStyle: 'caption', color: 'ink.muted', m: '0' });
const hashes = css({
  display: 'grid',
  gap: '2',
  '& code': { textStyle: 'mono', fontSize: '0.75rem', overflowWrap: 'anywhere' }
});
const actions = css({ display: 'flex', gap: '2', flexWrap: 'wrap', alignItems: 'center' });
const upToDate = css({
  display: 'flex',
  alignItems: 'center',
  gap: '2',
  textStyle: 'body',
  color: 'ink',
  m: '0',
  '& svg': { color: 'success' }
});

const STATUS: Record<ModuleUpdateStatus, { label: string; tone: 'success' | 'live' | 'outline' | 'danger' }> = {
  current: { label: 'Up to date', tone: 'success' },
  available: { label: 'Upgrade available', tone: 'live' },
  'not-approved': { label: 'Newer release not approved', tone: 'outline' },
  withdrawn: { label: 'Version withdrawn', tone: 'danger' }
};

const arrow = (update: ModuleUpdate) => `${update.current} → ${update.next?.version ?? '?'}`;

/**
 * Contract updates for one community: what can be updated, what each release changes, and one way
 * to do it. In setup the launch admin applies updates directly; after launch they go into proposals.
 */
export function ContractUpdates() {
  const { daoId, daoConfig: config } = useDaoContext();
  const session = useAuthSessionStore();
  const { rows, plan, isLoading, error, mutate } = useModuleUpdates(config, session.address);
  const draft = useAdminProposalDraft();
  const tx = useTransactionFeedback(config.name);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const pending = config.status === 'pending';
  const admins = rows.flatMap((item) => (item.ok ? [item.state.admin] : []));
  const direct = Boolean(session.address && admins.length && admins.every((admin) => admin === session.address));
  const canPropose = Boolean(
    session.address && admins.length && admins.every((admin) => treasuryIsAdmin(config, admin))
  );
  const handler = getActionHandler('upgrade-dao-module');
  const context = { config, session: { address: session.address, kit: StellarWalletsKit } };

  function propose(updates: ModuleUpdate[]) {
    setMessage('');
    try {
      const requests = updates.map((update) => {
        const values = { module: update.module, fromHash: update.fromHash, toHash: update.next!.hash };
        const valid = handler.validate(values, context);
        if (!valid.valid) throw new Error(valid.message);
        assertAdminCallSupported(handler, values, context);
        return {
          daoId,
          action: handler.serialize(values, context),
          source: `admin/upgrades/${update.module}`,
          metadata: {
            title: `Upgrade ${MODULE_LABELS[update.module]} to ${update.next!.version}`,
            description:
              releaseNote(update.module, update.next!.version) ?? `Upgrade ${update.module} ${arrow(update)}.`,
            url: ''
          }
        };
      });
      draft.requestAddBatch({ daoId, requests });
    } catch (failure) {
      setMessage((failure as Error).message);
    }
  }

  async function applyAll() {
    if (!session.address || busy) return;
    setBusy(true);
    setMessage('');
    try {
      for (const [index, update] of plan.actionable.entries()) {
        const label = `Upgrade ${MODULE_LABELS[update.module]} (${index + 1} of ${plan.actionable.length})`;
        tx.start(label);
        const hash = await upgradeModuleDirectly(
          config,
          update.module,
          update.fromHash,
          update.next!.hash,
          session.address
        );
        tx.submitted(`${label} submitted`, hash);
        await waitForConfirmation(hash, config.rpcUrl);
        tx.success(`${MODULE_LABELS[update.module]} is on ${update.next!.version}`, hash);
      }
    } catch (failure) {
      tx.fail(failure, 'Upgrade failed');
    } finally {
      setBusy(false);
      await mutate();
    }
  }

  const count = plan.actionable.length;
  const plural = (n: number) => `${n} ${n === 1 ? 'upgrade' : 'upgrades'}`;

  return (
    <>
      <AdminProposalDraftDialog pending={draft.pending} onCancel={draft.cancel} onResolve={draft.resolve} />
      <section className={card} aria-labelledby="updates-title" aria-busy={isLoading || undefined}>
        {isLoading && !rows.length ? (
          <>
            <Skeleton className={css({ height: '6', width: '48' })} />
            <Skeleton className={css({ height: '4', width: '72' })} />
          </>
        ) : (
          <>
            <div>
              <h2 id="updates-title" className={title}>
                {count ? `${plural(count)} available` : 'Everything is up to date'}
              </h2>
              <p className={muted}>
                {count
                  ? pending
                    ? 'During setup you apply upgrades yourself. Each one is a signature.'
                    : 'Upgrades go to a vote like any other change.'
                  : 'New contract releases show up here when they are approved for your community.'}
              </p>
            </div>

            {plan.withdrawn.map((update) => (
              <Callout
                key={update.module}
                variant="error"
                title={`${MODULE_LABELS[update.module]} ${update.current} was withdrawn`}
                description={
                  pending
                    ? `Your community can't launch on a withdrawn version. ${update.next ? 'Apply the upgrade below first.' : 'Wait for a replacement release.'}`
                    : `It keeps working, but upgrade it as soon as you can.${update.next ? '' : ' A replacement release isn’t approved yet.'}`
                }
              />
            ))}

            {count ? (
              <ul className={list}>
                {plan.actionable.map((update) => (
                  <li key={update.module} className={row}>
                    <div className={rowHead}>
                      <p className={name}>{MODULE_LABELS[update.module]}</p>
                      <span className={version}>{arrow(update)}</span>
                    </div>
                    <p className={note}>
                      {releaseNote(update.module, update.next!.version) ?? 'No release notes for this version yet.'}
                    </p>
                  </li>
                ))}
              </ul>
            ) : !error ? (
              <p className={upToDate}>
                <Check aria-hidden="true" size={18} />
                Every contract is on its latest approved release.
              </p>
            ) : null}

            {count ? (
              direct ? (
                <div className={actions}>
                  <Button loading={busy} onClick={() => void applyAll()}>
                    Apply {plural(count)}
                  </Button>
                </div>
              ) : canPropose ? (
                <div className={actions}>
                  {plan.batch.length ? (
                    <Button disabled={busy} onClick={() => propose(plan.batch)}>
                      Add {plural(plan.batch.length)} to your proposal
                    </Button>
                  ) : null}
                  {plan.separate.map((update) => (
                    <Button key={update.module} variant="secondary" disabled={busy} onClick={() => propose([update])}>
                      Propose the {MODULE_LABELS[update.module]} upgrade
                    </Button>
                  ))}
                </div>
              ) : (
                <p className={note}>
                  {pending
                    ? 'Only the launch admin can apply upgrades during setup.'
                    : 'Connect a member wallet to propose these upgrades.'}
                </p>
              )
            ) : null}
            {plan.separate.length && canPropose && !direct ? (
              <p className={note}>
                Voting and Treasury run proposals themselves, so each upgrades in its own proposal.
              </p>
            ) : null}
            {error ? <Callout variant="error" title="Couldn't check for upgrades" description={error.message} /> : null}
            {message ? <Callout variant="warning" title={message} role="alert" /> : null}
          </>
        )}
      </section>

      <section className={card} aria-labelledby="modules-title">
        <h2 id="modules-title" className={title}>
          Contracts
        </h2>
        <ul className={list}>
          {rows.map((item) => (
            <li key={item.module} className={compactRow}>
              <p className={name}>{MODULE_LABELS[item.module]}</p>
              {item.ok ? (
                <span className={actions}>
                  <span className={version}>{item.update.current}</span>
                  {/* Fixed-width status column keeps the versions aligned down the list. */}
                  <span className={statusCol}>
                    <Chip tone={STATUS[item.update.status].tone}>{STATUS[item.update.status].label}</Chip>
                  </span>
                </span>
              ) : (
                <Chip tone="danger">Couldn&apos;t read</Chip>
              )}
            </li>
          ))}
        </ul>
        <Disclosure>
          <div className={css({ display: 'grid', gap: '4' })}>
            {rows.map((item) => (
              <div key={item.module} className={hashes}>
                <span className={css({ textStyle: 'label', color: 'ink' })}>{MODULE_LABELS[item.module]}</span>
                {item.ok ? (
                  <>
                    <Address value={item.state.contractId} label="Contract" />
                    <span className={note}>
                      Running <code>{item.state.fromHash}</code> · storage version {item.state.storageVersion}
                    </span>
                    {item.state.target ? (
                      <span className={note}>
                        Latest {item.state.target.version} <code>{item.state.target.hash}</code>
                        {item.state.target.revoked ? ' (withdrawn)' : ''}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className={note}>{item.error}</span>
                )}
              </div>
            ))}
          </div>
        </Disclosure>
      </section>
    </>
  );
}
