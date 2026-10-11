import { CircleCheck } from 'lucide-react';
import { css } from 'styled-system/css';

import { Address, Callout, Chip, Disclosure, Skeleton } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import type { UpgradeModule } from '@/lib/admin-module-versions';
import { releaseNote } from '@/lib/release-notes';
import { useUpgradeRelease } from '@/lib/upgrade-release';

const stack = css({ display: 'grid', gap: '2.5' });
const row = css({ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2' });
const versions = css({ textStyle: 'mono', fontSize: '0.8125rem', color: 'ink.muted' });
const body = css({ textStyle: 'body', color: 'ink', m: '0' });
const muted = css({ textStyle: 'caption', color: 'ink.muted', m: '0' });
const hashes = css({ display: 'grid', gap: '2', m: '0' });
const term = css({ textStyle: 'caption', color: 'ink.muted' });
const hash = css({ m: '0', textStyle: 'mono', fontSize: '0.75rem', overflowWrap: 'anywhere' });

/**
 * A module upgrade, in members' words. The Builder registry (the Manager) says whether this exact
 * upgrade is approved; an approved one reads as routine, and only an unapproved, withdrawn or
 * uncheckable one warns. The contract checks approval again when the proposal runs either way.
 */
export function UpgradeActionDetail({
  module,
  label,
  fromHash,
  toHash,
  contract
}: {
  /** The module's address, shown with the hashes. */
  contract: string;
  module: UpgradeModule;
  label: string;
  fromHash: string;
  toHash: string;
}) {
  const { daoConfig } = useDaoContext();
  const { data, isLoading } = useUpgradeRelease(daoConfig, fromHash, toHash);
  const note = data?.toVersion ? releaseNote(module, data.toVersion) : null;

  const technical = (
    <Disclosure title="Technical details">
      <Address value={contract} label="Contract" compact />
      <dl className={hashes}>
        <div>
          <dt className={term}>Current code (WASM hash)</dt>
          <dd className={hash}>{fromHash}</dd>
        </div>
        <div>
          <dt className={term}>New code (WASM hash)</dt>
          <dd className={hash}>{toHash}</dd>
        </div>
      </dl>
    </Disclosure>
  );

  if (isLoading && !data) {
    return (
      <div className={stack} role="status" aria-busy="true">
        <span className="sr-only">Checking this release</span>
        <Skeleton className={css({ width: '40', height: '6', borderRadius: 'full' })} />
        <Skeleton className={css({ height: '4' })} />
        {technical}
      </div>
    );
  }

  if (data?.approved && !data.revoked) {
    return (
      <div className={stack}>
        <div className={row}>
          <Chip tone="success">
            <CircleCheck aria-hidden="true" />
            Approved release
          </Chip>
          {data.fromVersion && data.toVersion ? (
            <span className={versions}>
              {data.fromVersion} → {data.toVersion}
            </span>
          ) : null}
        </div>
        {note ? <p className={body}>{note}</p> : null}
        <p className={muted}>
          {label} moves to a release approved for Builder communities. Tokens, votes, the treasury and history carry
          over unchanged.
        </p>
        {technical}
      </div>
    );
  }

  return (
    <div className={stack}>
      {data?.revoked ? (
        <Callout
          variant="error"
          title="This release was withdrawn"
          description="Builder withdrew this release, so the upgrade will fail when the proposal runs and nothing changes."
        />
      ) : data ? (
        <Callout
          variant="warning"
          title="This release isn't approved"
          description="The Builder registry doesn't approve this upgrade, so it will fail when the proposal runs and nothing changes. Check where this proposal came from before voting."
        />
      ) : (
        <Callout
          variant="warning"
          title="Couldn't check this release"
          description="The contract still checks approval when the proposal runs: an unapproved upgrade fails and changes nothing."
        />
      )}
      {technical}
    </div>
  );
}
