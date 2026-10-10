'use client';

import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { useState } from 'react';
import { Stack } from 'styled-system/jsx';

import { AdminProposalDraftDialog } from '@/components/admin/admin-proposal-draft-dialog';
import { Badge, Button, Callout, Card, Heading, Input, ShortId, Text } from '@/components/ui';
import { readAdminModuleVersion, type UpgradeModule, useAdminModuleVersion } from '@/lib/admin-module-versions';
import { treasuryIsOwner } from '@/lib/admin-proposals';
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
  const canPropose = Boolean(state.data && session.address && treasuryIsOwner(config, state.data.owner));
  async function propose() {
    if (!handler || !state.data?.target || !canPropose || busy) return;
    setBusy(true);
    try {
      const current = await readAdminModuleVersion(config, module, session.address, state.data.target.hash);
      if (
        !treasuryIsOwner(config, current.owner) ||
        !current.approved ||
        current.target?.revoked ||
        current.fromHash === current.target?.hash
      )
        throw new Error(
          'This transition is no longer approved, ownership changed, or the target is already active. Refresh the module.'
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
  return (
    <>
      <AdminProposalDraftDialog pending={draft.pending} onCancel={draft.cancel} onResolve={draft.resolve} />
      <Card p="5">
        <Stack gap="3">
          <Heading style={{ fontSize: '1.2rem', textTransform: 'capitalize' }}>{module}</Heading>
          {state.isLoading ? <Text role="status">Reading version and Manager approval…</Text> : null}
          {state.error ? (
            <Callout variant="error" title="Module read failed" description={state.error.message} />
          ) : null}
          {state.data ? (
            <>
              <ShortId value={state.data.contractId} label="Contract" />
              {state.data.owner ? <ShortId value={state.data.owner} label="Current owner" /> : null}
              <Text>Current version: {state.data.version}</Text>
              <Text style={{ overflowWrap: 'anywhere' }}>Current WASM hash: {state.data.fromHash}</Text>
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
                  <Text style={{ overflowWrap: 'anywhere' }}>Candidate hash: {state.data.target.hash}</Text>
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
              {module === 'metadata' ? (
                <Text>
                  Metadata upgrade ownership has no public getter in this ABI. Upgrade proposal creation stays blocked;
                  artwork ownership is separately read from the Token.
                </Text>
              ) : null}
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
            variant="outline"
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
            variant="outline"
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
