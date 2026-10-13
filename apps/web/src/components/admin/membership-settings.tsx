'use client';

import { Client as TokenClient } from '@builder-stellar/token-bindings';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { useState } from 'react';
import { css } from 'styled-system/css';
import { Stack } from 'styled-system/jsx';
import useSWR from 'swr';

import { AdminProposalDraftDialog } from '@/components/admin/admin-proposal-draft-dialog';
import { PageSection } from '@/components/page-section';
import {
  Badge,
  Button,
  Callout,
  Card,
  Field,
  FieldHelperText,
  FieldLabel,
  Heading,
  Input,
  ListRow,
  Select,
  ShortId,
  Skeleton,
  Switch,
  Text
} from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { adminReadOptions } from '@/lib/admin-surfaces';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { getActionHandler } from '@/lib/proposal-actions/registry';
import type { ProposalActionType } from '@/lib/proposal-actions/types';
import { restoreArchivedState } from '@/lib/restore-archived-client';
import { waitForConfirmation } from '@/lib/transaction-confirmation';
import { useTransactionFeedback } from '@/lib/transaction-feedback';
import { useAdminProposalDraft } from '@/lib/use-admin-proposal-draft';
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

type ModuleView = {
  kind: string;
  address: string;
  nonVoting: boolean;
  allowance: number;
  agent: boolean;
  /** Votes the module holds, its own and delegated to it (review 2 C3: modules can be delegates). */
  votes: bigint;
};
type MembershipState = {
  admin: string;
  live: boolean;
  settings: { transfersLocked: boolean; membersOnlyDelegation: boolean; daoRecovery: boolean };
  modules: ModuleView[];
};

/** Live reads: the switches, every registered module with its allowance, and the transfer agents. */
function useMembershipState(config: DaoNetworkConfig, address?: string | null) {
  return useSWR(
    config.tokenContractId ? ['membership-state', config.tokenContractId, config.rpcUrl, address || ''] : null,
    async (): Promise<MembershipState> => {
      const token = new TokenClient(adminReadOptions(config, config.tokenContractId, address));
      const [admin, live, settings, modules, agents] = await Promise.all([
        token.admin(),
        token.is_live(),
        token.settings(),
        token.modules(),
        token.transfer_agents()
      ]);
      const [allowances, votes] = await Promise.all([
        Promise.all(
          modules.result.map((entry) => token.mint_allowance({ module: entry.address }).then((tx) => tx.result))
        ),
        Promise.all(modules.result.map((entry) => token.get_votes({ account: entry.address }).then((tx) => tx.result)))
      ]);
      return {
        admin: admin.result,
        live: live.result,
        settings: {
          transfersLocked: settings.result.transfers_locked,
          membersOnlyDelegation: settings.result.members_only_delegation,
          daoRecovery: settings.result.dao_recovery
        },
        modules: modules.result.map((entry, index) => ({
          kind: entry.kind,
          address: entry.address,
          nonVoting: entry.non_voting,
          allowance: allowances[index] ?? 0,
          agent: agents.result.includes(entry.address),
          votes: votes[index] ?? 0n
        }))
      };
    }
  );
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
    on: 'Tokens move only by sale from the community, by giving them back to the DAO or by a DAO vote.',
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
  const proposalDraft = useAdminProposalDraft();
  const tx = useTransactionFeedback(config.name);
  const [busy, setBusy] = useState(false);
  const [allowance, setAllowance] = useState({ module: '', amount: '' });
  const [message, setMessage] = useState('');

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

  async function direct(call: DirectCall, label: string) {
    if (!address) return;
    setBusy(true);
    setMessage('');
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

  function propose(type: ProposalActionType, values: Record<string, unknown>, title: string) {
    if (!address) return;
    const handler = getActionHandler(type);
    const context = { config, session: { address, kit: StellarWalletsKit } };
    const validation = handler.validate(values, context);
    if (!validation.valid) {
      setMessage(validation.message ?? 'Check the values.');
      return;
    }
    proposalDraft.requestAddBatch({
      daoId,
      requests: [
        {
          daoId,
          action: handler.serialize(values, context),
          source: `admin/membership/${type}`,
          metadata: { title, description: title, url: '' }
        }
      ],
      onAdded: () => setMessage(`${title}: added to the proposal draft.`)
    });
  }

  function changeSwitch(entry: (typeof SWITCHES)[number], enabled: boolean) {
    const verb = enabled ? 'Turn on' : 'Turn off';
    const label = `${verb} ${entry.label.toLowerCase()}`;
    if (!isLaunchAdmin) return propose(entry.type, { enabled }, label);
    void direct(
      entry.fn === 'set_transfers_locked'
        ? { fn: entry.fn, args: { locked: enabled } }
        : { fn: entry.fn, args: { enabled } },
      label
    );
  }

  function changeAllowance(direction: 'increase' | 'decrease') {
    const amount = Number(allowance.amount);
    if (!allowance.module || !Number.isInteger(amount) || amount < 1) {
      setMessage('Choose a module and a whole number of tokens.');
      return;
    }
    const title = `${direction === 'decrease' ? 'Lower' : 'Raise'} a mint allowance by ${amount}`;
    if (!isLaunchAdmin)
      return propose('change-mint-allowance', { module: allowance.module, amount: String(amount), direction }, title);
    void direct(
      {
        fn: direction === 'decrease' ? 'decrease_mint_allowance' : 'increase_mint_allowance',
        args: { module: allowance.module, amount }
      },
      title
    );
  }

  return (
    <>
      <AdminProposalDraftDialog
        pending={proposalDraft.pending}
        onCancel={proposalDraft.cancel}
        onResolve={proposalDraft.resolve}
      />
      <PageSection
        title="Membership"
        description={
          data.live
            ? 'Requires DAO governance: each change here is added to a proposal draft.'
            : 'Setup: the launch admin changes these directly.'
        }
      >
        <Stack gap="4">
          {message ? <Callout variant="info" title={message} /> : null}
          {!canAct ? (
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
              {SWITCHES.map((entry) => {
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
              })}
              {data.live && !data.settings.transfersLocked ? (
                <FieldHelperText>
                  Locking takes away every member’s way out by sale. The proposal review flags it.
                </FieldHelperText>
              ) : null}
            </Stack>
          </Card>

          <Card p="5">
            <Stack gap="3">
              <Heading size="heading">Modules</Heading>
              <Text size="sm">
                A module mints only up to its allowance. Pools and claim lists need one before they open.
              </Text>
              {data.modules.length ? (
                <div>
                  {data.modules.map((module) => (
                    <ListRow
                      key={module.address}
                      title={kindLabel(module.kind)}
                      meta={<ShortId value={module.address} label="Contract" />}
                      trailing={
                        <span className={row}>
                          {module.nonVoting ? <Badge>Holds tokens without votes</Badge> : null}
                          {module.agent ? <Badge>Can move memberships</Badge> : null}
                          {module.votes > 0n ? (
                            <Badge tone="warning">
                              {module.votes.toString()} {module.votes === 1n ? 'vote' : 'votes'}
                            </Badge>
                          ) : null}
                          <Badge>
                            {module.allowance >= UNLIMITED
                              ? 'Unlimited'
                              : `${module.allowance.toLocaleString()} to mint`}
                          </Badge>
                        </span>
                      }
                    />
                  ))}
                </div>
              ) : (
                <Text size="sm">This community has no modules yet.</Text>
              )}
              {data.modules.length ? (
                <Stack gap="2">
                  <Field>
                    <FieldLabel htmlFor="membership-allowance-module">Module</FieldLabel>
                    <Select
                      id="membership-allowance-module"
                      value={allowance.module}
                      disabled={!canAct || busy}
                      onChange={(event) => setAllowance({ ...allowance, module: event.target.value })}
                    >
                      <option value="">Choose a module</option>
                      {data.modules.map((module) => (
                        <option key={module.address} value={module.address}>
                          {kindLabel(module.kind)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="membership-allowance-amount">Tokens</FieldLabel>
                    <Input
                      id="membership-allowance-amount"
                      inputMode="numeric"
                      value={allowance.amount}
                      disabled={!canAct || busy}
                      onChange={(event) => setAllowance({ ...allowance, amount: event.target.value.trim() })}
                    />
                  </Field>
                  <div className={row}>
                    <Button type="button" disabled={!canAct || busy} onClick={() => changeAllowance('increase')}>
                      {data.live ? 'Propose raising it' : 'Raise allowance'}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={!canAct || busy}
                      onClick={() => changeAllowance('decrease')}
                    >
                      {data.live ? 'Propose lowering it' : 'Lower allowance'}
                    </Button>
                  </div>
                </Stack>
              ) : null}
              <FieldHelperText>
                Modules that can move memberships were named when the community was created; after launch a proposal can
                add or remove one (Proposals → Change a transfer agent).
              </FieldHelperText>
            </Stack>
          </Card>
        </Stack>
      </PageSection>
    </>
  );
}
