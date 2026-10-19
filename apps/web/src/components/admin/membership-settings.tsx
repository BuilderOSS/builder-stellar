'use client';

import { Client as TokenClient } from '@builder-stellar/token-bindings';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { useState } from 'react';
import { css } from 'styled-system/css';
import { Stack } from 'styled-system/jsx';

import { ModulesCard } from '@/components/admin/modules/modules-card';
import { PageSection } from '@/components/page-section';
import { ChangeSubmit } from '@/components/proposal-changes/change-submit';
import { EditingChangeNotice } from '@/components/proposal-changes/editing-change-notice';
import { PendingValue, usePendingChanges } from '@/components/proposal-changes/pending-value';
import { Badge, Callout, Card, FieldHelperText, Heading, Skeleton, Switch, Text } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { type MembershipState, useMembershipState } from '@/lib/membership-state';
import { getActionHandler } from '@/lib/proposal-actions/registry';
import type { ProposalActionType } from '@/lib/proposal-actions/types';
import { CHANGE_SOURCES } from '@/lib/proposal-changes/change-request';
import { useEditingChange } from '@/lib/proposal-changes/use-editing-change';
import { useProposeChange } from '@/lib/proposal-changes/use-propose-change';
import { restoreArchivedState } from '@/lib/restore-archived-client';
import { waitForConfirmation } from '@/lib/transaction-confirmation';
import { useTransactionFeedback } from '@/lib/transaction-feedback';
import { signWithWallet } from '@/lib/wallet-sign';
import { useAuthSessionStore } from '@/stores/auth-session-store';

const UNLIMITED = 0xffffffff;
const KIND_LABELS: Record<string, string> = {
  auction: 'Auction',
  marketplace: 'Marketplace',
  claims: 'Claims',
  circle: 'Circle'
};
const row = css({ display: 'flex', gap: '2', flexWrap: 'wrap', alignItems: 'center' });
const settingRow = css({
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: '3',
  py: '3',
  borderBottomWidth: '1px',
  borderColor: 'rule',
  _last: { borderBottomWidth: '0' }
});
const settingText = css({ display: 'grid', gap: '0.5', minW: '0', flex: '1 1 16rem' });
const settingLabel = css({ textStyle: 'body', fontWeight: '600', color: 'ink' });

/** The Token calls the launch admin makes from here in Setup. */
type DirectCall =
  | { fn: 'set_transfers_locked'; args: { locked: boolean } }
  | { fn: 'set_members_only_delegation' | 'set_dao_recovery'; args: { enabled: boolean } }
  | { fn: 'increase_mint_allowance' | 'decrease_mint_allowance'; args: { module: string; amount: number } };

function assemble(client: TokenClient, call: DirectCall) {
  switch (call.fn) {
    case 'set_transfers_locked':
      return client.set_transfers_locked(call.args);
    case 'set_members_only_delegation':
      return client.set_members_only_delegation(call.args);
    case 'set_dao_recovery':
      return client.set_dao_recovery(call.args);
    case 'increase_mint_allowance':
      return client.increase_mint_allowance(call.args);
    case 'decrease_mint_allowance':
      return client.decrease_mint_allowance(call.args);
  }
}

function kindLabel(kind: string) {
  return KIND_LABELS[kind] ?? kind.replace(/^custom_/, '').replace(/_/g, ' ');
}

const SWITCHES = [
  {
    key: 'transfersLocked',
    type: 'set-transfers-locked',
    fn: 'set_transfers_locked',
    label: 'Lock memberships',
    on: 'Tokens move only by sale from the tribe, by giving them back to the DAO or by a DAO vote.',
    off: 'Members can transfer and sell their tokens freely.'
  },
  {
    key: 'membersOnlyDelegation',
    type: 'set-members-only-delegation',
    fn: 'set_members_only_delegation',
    label: 'Members-only delegation',
    on: 'Members can delegate their votes only to themselves or another member.',
    off: 'Members can delegate their votes to anyone.'
  },
  {
    key: 'daoRecovery',
    type: 'set-dao-recovery',
    fn: 'set_dao_recovery',
    label: 'DAO recovery',
    on: 'A proposal can move any membership to a new wallet, for example after a lost key.',
    off: 'Only a member can move their own token.'
  }
] as const;

/**
 * Manage → Membership: the membership switches (docs/designs/locked-tokens.md), each registered
 * module's mint allowance, and the transfer agents. In Setup the launch admin changes them
 * directly; after launch every change is a proposal action.
 */
export function MembershipSettings() {
  const { daoId, daoConfig: config } = useDaoContext();
  const session = useAuthSessionStore();
  const address = session.authStatus === 'authenticated' ? session.address : null;
  const state = useMembershipState(config, address);
  const { propose: proposeChange } = useProposeChange();
  const pendingSwitches = usePendingChanges(SWITCHES.map((entry) => entry.type));
  // Edit from a queued switch: the page shows which one, and adding the other value replaces it.
  const editing = useEditingChange({
    accepts: (action) => SWITCHES.some((entry) => entry.type === action.type),
    onLoad: () => undefined
  });
  const tx = useTransactionFeedback(config.name);
  const [busy, setBusy] = useState(false);
  // Shown beside the card whose action produced it, not at the top of a long page.
  const [message, setMessage] = useState<{ where: 'switches' | 'modules'; text: string } | null>(null);

  if (state.isLoading || !state.data)
    return (
      <PageSection
        title="Membership"
        description="How tokens move, who members can delegate to, and what modules may mint."
      >
        {state.error ? (
          <Callout
            variant="error"
            title="Membership settings could not be read"
            description={String(state.error.message ?? state.error)}
          />
        ) : (
          <Skeleton className={css({ height: '12rem' })} />
        )}
      </PageSection>
    );

  const data = state.data;
  const isLaunchAdmin = Boolean(address && !data.live && data.admin === address);
  const governed = data.live && data.admin === config.treasuryContractId;
  const canAct = isLaunchAdmin || (governed && Boolean(address));
  // An open launch drive hands the Token to the Treasury before launch: nothing changes until it launches.
  const frozen = !data.live && data.admin === config.treasuryContractId;

  async function direct(call: DirectCall, label: string) {
    if (!address) return;
    setBusy(true);
    setMessage(null);
    try {
      tx.start(label);
      const client = new TokenClient({
        contractId: config.tokenContractId,
        rpcUrl: config.rpcUrl,
        networkPassphrase: config.passphrase,
        publicKey: address,
        ...restoreArchivedState,
        signTransaction: async (xdr: string, opts?: { networkPassphrase?: string; address?: string }) =>
          signWithWallet(xdr, {
            networkPassphrase: opts?.networkPassphrase ?? config.passphrase,
            address: opts?.address ?? address
          })
      });
      const sent = await (await assemble(client, call)).signAndSend();
      const hash = sent.sendTransactionResponse?.hash ?? '';
      tx.submitted(label, hash);
      await waitForConfirmation(hash, config.rpcUrl);
      tx.success(label, hash);
      void state.mutate();
    } catch (error) {
      tx.fail(error, `${label} failed`);
    } finally {
      setBusy(false);
    }
  }

  function propose(
    type: ProposalActionType,
    values: Record<string, unknown>,
    note: string,
    where: 'switches' | 'modules',
    replaces?: string[]
  ) {
    if (!address) return;
    const handler = getActionHandler(type);
    const context = { config, session: { address, kit: StellarWalletsKit } };
    const validation = handler.validate(values, context);
    if (!validation.valid) {
      setMessage({ where, text: validation.message ?? 'Check the values.' });
      return;
    }
    setMessage(null);
    const result = proposeChange(
      { actions: [handler.serialize(values, context)], source: CHANGE_SOURCES.membership, note, replaces },
      { onAdded: () => editing.done() }
    );
    if (result.outcome === 'invalid') setMessage({ where, text: result.message });
  }

  function changeSwitch(entry: (typeof SWITCHES)[number], enabled: boolean) {
    const verb = enabled ? 'Turn on' : 'Turn off';
    const label = `${verb} ${entry.label.toLowerCase()}`;
    if (!isLaunchAdmin) {
      // A switch already in the proposal is flipped back by replacing it, not by adding a second one.
      const queued = pendingSwitches.find((action) => action.type === entry.type);
      return propose(
        entry.type,
        { enabled },
        `${label}. ${enabled ? entry.on : entry.off}`,
        'switches',
        queued ? [queued.id] : undefined
      );
    }
    void direct(
      entry.fn === 'set_transfers_locked'
        ? { fn: entry.fn, args: { locked: enabled } }
        : { fn: entry.fn, args: { enabled } },
      label
    );
  }

  /** Returns a problem for the allowance sheet to show, or null once it was signed or drafted. */
  function changeAllowance(
    module: MembershipState['modules'][number],
    direction: 'increase' | 'decrease',
    amountText: string
  ): string | null {
    const amount = Number(amountText);
    if (!Number.isInteger(amount) || amount < 1 || amount > UNLIMITED) return 'Enter a whole number of memberships.';
    const name = kindLabel(module.kind).toLowerCase();
    const more = direction === 'decrease' ? 'fewer' : 'more';
    const title = `${direction === 'decrease' ? 'Lower' : 'Raise'} the ${name} mint allowance by ${amount}`;
    if (!isLaunchAdmin) {
      propose(
        'change-mint-allowance',
        { module: module.address, amount: String(amount), direction },
        `${title}: the ${name} module (${module.address}) can mint ${amount} ${more} ${amount === 1 ? 'token' : 'tokens'}.`,
        'modules'
      );
      return null;
    }
    void direct(
      {
        fn: direction === 'decrease' ? 'decrease_mint_allowance' : 'increase_mint_allowance',
        args: { module: module.address, amount }
      },
      title
    );
    return null;
  }

  function proposeOpen(kind: 'auction' | 'marketplace') {
    if (kind === 'auction')
      propose('unpause-auction', {}, 'Start the first auction of this tribe’s auction module.', 'modules');
    else propose('unpause-marketplace', {}, 'Open the market so sales can begin.', 'modules');
  }

  return (
    <>
      <PageSection
        title="Membership"
        description={
          data.live
            ? 'Requires DAO governance: each change here is added to a proposal draft.'
            : 'Setup: the launch admin changes these directly.'
        }
      >
        <Stack gap="4">
          {frozen ? (
            <Callout
              variant="info"
              title="Locked in for the launch drive"
              description="The tribe belongs to its treasury until it launches. After launch, changes go through proposals."
            />
          ) : !canAct ? (
            <Callout
              variant="warning"
              title={
                data.live ? 'Connect a wallet to draft proposals' : 'Connect the launch admin wallet to change these'
              }
            />
          ) : null}

          <Card p="5">
            <Stack gap="3">
              <Heading size="heading">How memberships work</Heading>
              {data.live ? (
                // Once Live a change is a proposal, so show the state and a propose button, not a toggle.
                <div>
                  <EditingChangeNotice editing={editing.editing} onCancel={editing.done} />
                  {SWITCHES.map((entry) => {
                    const enabled = data.settings[entry.key];
                    const queued = pendingSwitches.find((action) => action.type === entry.type);
                    // With a change waiting, the button offers the other value of what the proposal will set.
                    const next = queued ? queued.enabled !== true : !enabled;
                    return (
                      <div key={entry.key} className={settingRow}>
                        <div className={settingText}>
                          <span className={row}>
                            <span className={settingLabel}>{entry.label}</span>
                            <Badge tone={enabled ? 'live' : 'neutral'}>{enabled ? 'On' : 'Off'}</Badge>
                          </span>
                          <Text size="sm">{enabled ? entry.on : entry.off}</Text>
                          <PendingValue
                            pending={queued}
                            describe={(action) => (action.enabled ? 'Turn on' : 'Turn off')}
                          />
                        </div>
                        {queued && queued.enabled !== enabled ? null : (
                          <ChangeSubmit
                            direct={false}
                            variant="secondary"
                            size="sm"
                            proposeLabel={next ? 'Turn on in proposal' : 'Turn off in proposal'}
                            disabled={!canAct || busy}
                            onClick={() => changeSwitch(entry, next)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                SWITCHES.map((entry) => {
                  const enabled = data.settings[entry.key];
                  return (
                    <Switch
                      key={entry.key}
                      label={entry.label}
                      description={enabled ? entry.on : entry.off}
                      checked={enabled}
                      disabled={!canAct || busy}
                      onCheckedChange={(next) => changeSwitch(entry, next)}
                    />
                  );
                })
              )}
              {data.live && !data.settings.transfersLocked ? (
                <FieldHelperText>
                  Locking takes away every member’s way out by sale. The proposal review flags it.
                </FieldHelperText>
              ) : null}
              {message?.where === 'switches' ? <Callout variant="info" title={message.text} /> : null}
            </Stack>
          </Card>

          <ModulesCard
            config={config}
            daoId={daoId}
            address={address}
            modules={data.modules}
            live={data.live}
            canAct={canAct}
            frozen={frozen}
            busy={busy}
            message={message?.where === 'modules' ? message.text : null}
            propose={proposeChange}
            onMessage={(text) => setMessage({ where: 'modules', text })}
            onChanged={() => void state.mutate()}
            onChangeAllowance={changeAllowance}
            onProposeOpen={proposeOpen}
          />
        </Stack>
      </PageSection>
    </>
  );
}
