'use client';

import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { useState } from 'react';
import { Stack } from 'styled-system/jsx';

import { AdminProposalDraftDialog } from '@/components/admin/admin-proposal-draft-dialog';
import { Badge, Button, Callout, Card, Heading, Input, ShortId, Text } from '@/components/ui';
import { readAdminModuleVersion, type UpgradeModule, useAdminModuleVersion } from '@/lib/admin-module-versions';
import { treasuryIsAdmin } from '@/lib/admin-proposals';
import { assertAdminCallSupported } from '@/lib/admin-registered-call';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { getAllActionHandlers } from '@/lib/proposal-actions/registry';
import { useAdminProposalDraft } from '@/lib/use-admin-proposal-draft';
import { useAuthSessionStore } from '@/stores/auth-session-store';

export function ModuleVersionCard({
  daoId,
  config,
  module
}: {
  daoId: string;
  config: DaoNetworkConfig;
  module: UpgradeModule;
}) {
  const session = useAuthSessionStore();
  const [hashInput, setHashInput] = useState('');
  const [targetHash, setTargetHash] = useState<string>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const state = useAdminModuleVersion(config, module, session.address, targetHash);
  const draft = useAdminProposalDraft();
  const handler = getAllActionHandlers().find((item) => String(item.type) === 'upgrade-dao-module');
  const canPropose = Boolean(state.data && session.address && treasuryIsAdmin(config, state.data.admin));
  async function propose() {
    if (!handler || !state.data?.target || !canPropose || busy) return;
    setBusy(true);
    try {
      const current = await readAdminModuleVersion(config, module, session.address, state.data.target.hash);
      if (
        !treasuryIsAdmin(config, current.admin) ||
        !current.approved ||
        current.target?.revoked ||
        current.fromHash === current.target?.hash
      )
        throw new Error(
          'This transition is no longer approved, admin rights changed, or the target is already active. Refresh the module.'
        );
      const values = { module, fromHash: current.fromHash, toHash: current.target!.hash };
      const context = { config, session: { address: session.address, kit: StellarWalletsKit } };
      const valid = handler.validate(values, context);
      if (!valid.valid) throw new Error(valid.message);
      assertAdminCallSupported(handler, values, context);
      draft.requestAdd({
        daoId,
        action: handler.serialize(values, context),
        source: `admin/upgrades/${module}`,
        metadata: {
          title: `Upgrade ${module} to ${current.target!.version}`,
          description: `Manager-approved transition ${current.fromHash} → ${current.target!.hash}. Review this release before execution.`,
          url: ''
        }
      });
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function proposeMigrate() {
    if (!state.data || !canPropose) return;
    const migrate = getAllActionHandlers().find((item) => String(item.type) === 'migrate-dao-module');
    if (!migrate) return setMessage('Storage migration is not registered in this build.');
    const context = { config, session: { address: session.address, kit: StellarWalletsKit } };
    draft.requestAdd({
      daoId,
      action: migrate.serialize({ module }, context),
      source: `admin/upgrades/${module}/migrate`,
      metadata: {
        title: `Migrate ${module} storage`,
        description: `Run the ${module} storage migration (current storage version ${state.data.storageVersion}). Add it right after an upgrade whose release changes storage; it fails with NothingToMigrate otherwise.`,
        url: ''
      }
    });
  }
  return (
    <>
      <AdminProposalDraftDialog pending={draft.pending} onCancel={draft.cancel} onResolve={draft.resolve} />
      <Card p="5">
        <Stack gap="3">
          <Heading size="heading" textTransform="capitalize">
            {module}
          </Heading>
          {state.isLoading ? <Text role="status">Reading version and Manager approval…</Text> : null}
          {state.error ? (
            <Callout variant="error" title="Module read failed" description={state.error.message} />
          ) : null}
          {state.data ? (
            <>
              <ShortId value={state.data.contractId} label="Contract" />
              {state.data.admin ? <ShortId value={state.data.admin} label="Current admin" /> : null}
              <Text>
                Current version: {state.data.version} · Storage version: {state.data.storageVersion}
              </Text>
              <Text overflowWrap="anywhere">Current WASM hash: {state.data.fromHash}</Text>
              <Badge>
                {state.data.source
                  ? state.data.source.revoked
                    ? 'Current implementation revoked'
                    : 'Current implementation registered'
                  : 'Current implementation not registered'}
              </Badge>
              {state.data.target ? (
                <>
                  <Text>Candidate version: {state.data.target.version}</Text>
                  <Text overflowWrap="anywhere">Candidate hash: {state.data.target.hash}</Text>
                  <Badge>
                    {state.data.fromHash === state.data.target.hash
                      ? 'Already current'
                      : state.data.approved
                        ? 'Transition approved'
                        : 'Transition not approved'}
                  </Badge>
                  {state.data.target.revoked ? (
                    <Callout variant="warning" title="Target implementation revoked" />
                  ) : null}
                </>
              ) : (
                <Text>
                  No candidate implementation found. The Manager API does not enumerate all approved transitions; check
                  a known hash below.
                </Text>
              )}
            </>
          ) : null}
          <label htmlFor={`upgrade-hash-${module}`}>
            Check a registered target hash
            <Input
              id={`upgrade-hash-${module}`}
              name={`upgrade-hash-${module}`}
              autoComplete="off"
              spellCheck={false}
              value={hashInput}
              onChange={(event) => setHashInput(event.target.value)}
              placeholder="64 hexadecimal characters…"
              disabled={busy}
            />
          </label>
          <Button
            type="button"
            variant="secondary"
            disabled={busy || state.isLoading}
            onClick={() => {
              if (!/^[a-f0-9]{64}$/i.test(hashInput.trim()))
                return setMessage('Enter a 64-character hexadecimal WASM hash.');
              setTargetHash(hashInput.trim().toLowerCase());
              setMessage('');
            }}
          >
            Check transition
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy || state.isLoading}
            onClick={() => void state.mutate()}
          >
            Refresh version and approval
          </Button>
          {handler && canPropose ? (
            <Button
              type="button"
              disabled={
                busy ||
                !state.data?.approved ||
                state.data.fromHash === state.data.target?.hash ||
                Boolean(session.walletNetworkIssue)
              }
              onClick={() => void propose()}
            >
              Review upgrade proposal
            </Button>
          ) : null}
          {canPropose ? (
            <Button type="button" variant="secondary" disabled={busy || !state.data} onClick={proposeMigrate}>
              Add storage migration to proposal
            </Button>
          ) : null}
          {!handler ? (
            <Text>
              Upgrade proposals need the upgrade-dao-module registry integration. Version and transition checks are
              available now; this view never deploys or upgrades code directly.
            </Text>
          ) : null}
          {message ? (
            <div role="status">
              <Callout variant="warning" title={message} />
            </div>
          ) : null}
        </Stack>
      </Card>
    </>
  );
}
