'use client';

import type { ReactNode } from 'react';
import { css } from 'styled-system/css';

import { Address, Chip, ListRow, Section } from '@/components/ui';
import { groupImplementations, type PlatformState, type RegistryImplementation } from '@/lib/platform/registry';

const groups = css({ display: 'grid', gap: '5' });
const groupTitle = css({ textStyle: 'label', color: 'ink', m: '0', mb: '1' });
const rows = css({ display: 'grid' });
const chips = css({ display: 'flex', gap: '1.5', flexWrap: 'wrap', alignItems: 'center' });
const trailing = css({ display: 'flex', gap: '2', alignItems: 'center' });

function rowChips(row: RegistryImplementation) {
  return (
    <span className={chips}>
      {row.revoked ? <Chip tone="danger">Revoked</Chip> : null}
      {row.latest ? <Chip tone="live">Latest</Chip> : null}
      {row.current ? <Chip tone="success">New tribes get this</Chip> : null}
      {row.running ? <Chip tone="success">Running</Chip> : null}
    </span>
  );
}

/**
 * The implementation registry, one group per module name, newest first. `rowActions` adds the
 * admin's menu to each row; without it the list is read-only.
 */
export function PlatformRegistry({
  state,
  action,
  rowActions
}: {
  state: PlatformState;
  action?: ReactNode;
  rowActions?: (row: RegistryImplementation) => ReactNode;
}) {
  const grouped = groupImplementations(state.implementations);
  return (
    <Section
      id="registry"
      title="Registry"
      description="Every registered version. New tribes are deployed from the current ones; tribes upgrade only to approved paths, by their own vote."
      action={action}
    >
      {grouped.length ? (
        <div className={groups}>
          {grouped.map((group) => (
            <div key={group.name}>
              <h3 className={groupTitle}>{group.name}</h3>
              <div className={rows}>
                {group.rows.map((row) => (
                  <ListRow
                    key={row.hash}
                    wrap
                    title={
                      <span className={chips}>
                        {row.version}
                        {rowChips(row)}
                      </span>
                    }
                    meta={
                      <>
                        <Address value={row.hash} label="Code hash" compact explorerUrl="" copyLabel="Copy code hash" />
                        {row.usedBy
                          ? `Run by ${row.usedBy} ${row.usedBy === 1 ? 'module' : 'modules'}`
                          : 'Not run by any tribe'}
                      </>
                    }
                    trailing={rowActions ? <span className={trailing}>{rowActions(row)}</span> : null}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className={css({ textStyle: 'caption', color: 'ink.muted', m: '0' })}>
          No registered implementations were found. The registry list comes from the index; check it is running.
        </p>
      )}
    </Section>
  );
}
