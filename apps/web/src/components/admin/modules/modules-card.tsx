'use client';

import { MoreHorizontal, Plus } from 'lucide-react';
import { useState } from 'react';
import { css } from 'styled-system/css';
import { Stack } from 'styled-system/jsx';

import {
  Badge,
  Button,
  Callout,
  Card,
  FieldHelperText,
  Heading,
  IconButton,
  ListRow,
  Menu,
  ShortId,
  Text
} from '@/components/ui';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { isModuleKind, MODULE_COPY, type ModuleKind, UNLIMITED_ALLOWANCE } from '@/lib/modules/kinds';
import type { ChangeRequest } from '@/lib/proposal-changes/change-request';
import type { ProposeResult } from '@/lib/proposal-changes/propose-change';

import { AddModuleSheet } from './add-module-sheet';
import { AllowanceSheet } from './allowance-sheet';
import { RemoveModuleSheet } from './remove-module-sheet';

export type ModuleRowData = {
  kind: string;
  /** The index lists it as this DAO's module of its kind: the Manager deployed it. */
  vouched: boolean;
  address: string;
  nonVoting: boolean;
  allowance: number;
  agent: boolean;
  /** Votes the module holds, its own and delegated to it (review 2 C3: modules can be delegates). */
  votes: bigint;
};

const row = css({ display: 'flex', gap: '2', flexWrap: 'wrap', alignItems: 'center' });
const moduleMeta = css({ display: 'grid', gap: '1.5', justifyItems: 'start' });
const header = css({
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: '3',
  flexWrap: 'wrap'
});
const reason = css({
  display: 'block',
  textStyle: 'caption',
  color: 'ink.muted',
  fontWeight: '400',
  whiteSpace: 'normal'
});

function kindLabel(kind: string) {
  return isModuleKind(kind) ? MODULE_COPY[kind].rowLabel : kind.replace(/^custom_/, '').replace(/_/g, ' ');
}

/** Open or closed, for the two modules that have such a state; null for the rest. */
function openState(module: ModuleRowData, config: DaoNetworkConfig, live: boolean): 'open' | 'closed' | null {
  if (!live || !module.vouched) return null;
  if (module.kind === 'auction') return config.auctionPaused === null ? null : config.auctionPaused ? 'closed' : 'open';
  if (module.kind === 'marketplace')
    return config.marketplaceEnabled === null ? null : config.marketplaceEnabled ? 'open' : 'closed';
  return null;
}

/**
 * The Modules card of Manage → Membership: what the tribe can do, one row per module, with a way to
 * add a module, open one that is closed, change its allowance, or remove it
 * (docs/designs/module-attach-ui.md).
 */
export function ModulesCard({
  config,
  daoId,
  address,
  modules,
  live,
  canAct,
  frozen,
  busy,
  message,
  propose,
  onMessage,
  onChanged,
  onChangeAllowance,
  onProposeOpen
}: {
  config: DaoNetworkConfig;
  daoId: string;
  address: string | null;
  modules: ModuleRowData[];
  live: boolean;
  canAct: boolean;
  frozen: boolean;
  busy: boolean;
  message: string | null;
  propose: (request: ChangeRequest) => ProposeResult;
  onMessage: (text: string) => void;
  onChanged: () => void;
  /** Returns a problem to show, or null once the change was signed or added to the draft. */
  onChangeAllowance: (module: ModuleRowData, direction: 'increase' | 'decrease', amount: string) => string | null;
  onProposeOpen: (kind: 'auction' | 'marketplace') => void;
}) {
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<ModuleRowData | null>(null);
  const [allowing, setAllowing] = useState<ModuleRowData | null>(null);
  const present = new Set(modules.map((entry) => entry.kind).filter((kind): kind is ModuleKind => isModuleKind(kind)));
  const editable = canAct && !frozen && !busy;

  function removeReason(module: ModuleRowData) {
    if (!live) return 'Only a vote can remove a module, so this works after launch.';
    if (!isModuleKind(module.kind)) return 'Only modules Tribe Builder deployed can be removed here.';
    return null;
  }

  return (
    <>
      <Card p="5">
        <Stack gap="3">
          <div className={header}>
            <Stack gap="1">
              <Heading size="heading">Modules</Heading>
              <Text size="sm">
                Add-ons that let your tribe auction, sell or hand out memberships. Each mints only up to its allowance.
              </Text>
            </Stack>
            <Button variant="secondary" size="sm" disabled={!editable} onClick={() => setAdding(true)}>
              <Plus aria-hidden="true" />
              Add a module
            </Button>
          </div>

          {modules.length ? (
            <div>
              {modules.map((module) => {
                const state = openState(module, config, live);
                const removeBlocked = removeReason(module);
                return (
                  <ListRow
                    key={module.address}
                    title={kindLabel(module.kind)}
                    meta={
                      // Badges sit under the contract, where they can wrap; the trailing slot never does.
                      <span className={moduleMeta}>
                        <ShortId value={module.address} label="Contract" />
                        <span className={row}>
                          {state === 'open' ? <Badge tone="live">Open</Badge> : null}
                          {state === 'closed' ? <Badge tone="warning">Closed</Badge> : null}
                          {module.vouched ? null : <Badge tone="warning">Not deployed by Tribe Builder</Badge>}
                          {module.nonVoting ? <Badge>Holds tokens without votes</Badge> : null}
                          {module.agent ? <Badge>Can move memberships</Badge> : null}
                          {module.votes > 0n ? (
                            <Badge tone="warning">
                              {module.votes.toString()} {module.votes === 1n ? 'vote' : 'votes'}
                            </Badge>
                          ) : null}
                        </span>
                        {state === 'closed' && (module.kind === 'auction' || module.kind === 'marketplace') ? (
                          <span className={row}>
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={!editable || !live}
                              onClick={() => onProposeOpen(module.kind as 'auction' | 'marketplace')}
                            >
                              {module.kind === 'auction' ? 'Propose starting auctions' : 'Propose opening'}
                            </Button>
                          </span>
                        ) : null}
                      </span>
                    }
                    trailing={
                      <>
                        <Badge>
                          {module.allowance >= UNLIMITED_ALLOWANCE
                            ? 'No limit'
                            : `${module.allowance.toLocaleString()} to mint`}
                        </Badge>
                        <Menu
                          label={`${kindLabel(module.kind)} options`}
                          trigger={
                            <IconButton label={`${kindLabel(module.kind)} options`} size="sm">
                              <MoreHorizontal aria-hidden="true" />
                            </IconButton>
                          }
                          items={[
                            {
                              value: 'allowance',
                              label: 'Change allowance',
                              disabled: !editable,
                              onSelect: () => setAllowing(module)
                            },
                            { separator: true, value: 'sep' },
                            {
                              value: 'remove',
                              label: (
                                <span>
                                  Remove from tribe…
                                  {removeBlocked ? <span className={reason}>{removeBlocked}</span> : null}
                                </span>
                              ),
                              tone: 'danger',
                              disabled: !editable || Boolean(removeBlocked),
                              onSelect: () => setRemoving(module)
                            }
                          ]}
                        />
                      </>
                    }
                  />
                );
              })}
            </div>
          ) : (
            <Text size="sm">This tribe has no modules yet.</Text>
          )}

          {frozen ? (
            <FieldHelperText>
              Modules are locked in for the launch drive. After launch, changes go through proposals.
            </FieldHelperText>
          ) : null}
          {message ? <Callout variant="info" title={message} /> : null}
        </Stack>
      </Card>

      <AddModuleSheet
        open={adding}
        onOpenChange={setAdding}
        config={config}
        daoId={daoId}
        address={address}
        live={live}
        present={present}
        registered={modules.length}
        propose={propose}
        onMessage={onMessage}
        onChanged={onChanged}
      />
      <RemoveModuleSheet
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        config={config}
        daoId={daoId}
        address={address}
        module={removing && isModuleKind(removing.kind) ? { ...removing, kind: removing.kind } : null}
        propose={propose}
        onMessage={onMessage}
      />
      <AllowanceSheet
        open={allowing !== null}
        onOpenChange={(open) => !open && setAllowing(null)}
        title={allowing ? `${kindLabel(allowing.kind)} mint allowance` : 'Mint allowance'}
        allowance={allowing?.allowance ?? 0}
        live={live}
        onChange={(direction, amount) => (allowing ? onChangeAllowance(allowing, direction, amount) : null)}
      />
    </>
  );
}
