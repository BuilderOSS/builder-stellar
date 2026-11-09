'use client';

import { MoreHorizontal } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { css } from 'styled-system/css';

import {
  Button,
  Callout,
  Dialog,
  Field,
  FieldHelperText,
  FieldLabel,
  IconButton,
  Input,
  Menu,
  Select,
  Sheet
} from '@/components/ui';
import { describeContractError } from '@/lib/contract-errors';
import {
  currentChanges,
  isUpgradeApproved,
  normalizeHash,
  platformActions,
  readUploadedCode,
  validateCurrent,
  validateRegistration,
  validateUpgradePath
} from '@/lib/platform/actions';
import { CURRENT_SLOTS, type CurrentSlot, IMPLEMENTATION_NAMES, type PlatformConfig } from '@/lib/platform/config';
import type { PlatformState, RegistryImplementation } from '@/lib/platform/registry';
import { useTransactionFeedback } from '@/lib/transaction-feedback';

import { PlatformRegistry } from './platform-registry';

const form = css({ display: 'grid', gap: '4' });
const headerActions = css({ display: 'flex', gap: '2', flexWrap: 'wrap' });
const muted = css({ textStyle: 'caption', color: 'ink.muted', m: '0' });
const changes = css({ m: '0', pl: '5', display: 'grid', gap: '1', textStyle: 'body' });

type Sheet =
  | { kind: 'register' }
  | { kind: 'approve'; from?: string }
  | { kind: 'current'; slot?: CurrentSlot; hash?: string }
  | null;

const label = (row: RegistryImplementation) => `${row.name} ${row.version} · ${row.hash.slice(0, 8)}…`;
const errorText = (failure: unknown) =>
  describeContractError(failure, 'manager') ?? (failure instanceof Error ? failure.message : String(failure));

/** The registry with the platform admin's actions: register, approve, latest, current, revoke. */
export function PlatformRegistryAdmin({
  config,
  state,
  admin,
  networkReady,
  onChanged
}: {
  config: PlatformConfig;
  state: PlatformState;
  admin: string;
  networkReady: boolean;
  onChanged: () => Promise<unknown>;
}) {
  const tx = useTransactionFeedback(config.name);
  const [sheet, setSheet] = useState<Sheet>(null);
  // Each opening gets a new key, so a sheet starts from its props instead of resetting in an effect.
  const [opened, setOpened] = useState(0);
  const openSheet = (next: NonNullable<Sheet>) => {
    setError('');
    setOpened((n) => n + 1);
    setSheet(next);
  };
  const [revoking, setRevoking] = useState<RegistryImplementation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const keepRef = useRef<HTMLButtonElement>(null);

  async function run(labelText: string, done: string, work: () => Promise<string>) {
    setBusy(true);
    setError('');
    tx.start(labelText);
    try {
      tx.success(done, await work());
      setSheet(null);
      setRevoking(null);
    } catch (failure) {
      tx.fail(failure, `${labelText} stopped`, 'manager');
      setError(errorText(failure));
    } finally {
      setBusy(false);
      await onChanged();
    }
  }

  const disabled = !networkReady || busy;
  const rowActions = (row: RegistryImplementation) => {
    const slot = (Object.entries(CURRENT_SLOTS) as Array<[CurrentSlot, string]>).find(
      ([, name]) => name === row.name
    )?.[0];
    return (
      <Menu
        label={`Actions for ${label(row)}`}
        trigger={
          <IconButton variant="ghost" size="sm" label={`Actions for ${label(row)}`} disabled={disabled}>
            <MoreHorizontal aria-hidden="true" />
          </IconButton>
        }
        items={[
          {
            value: 'latest',
            label: row.latest ? 'Already the latest' : 'Set as latest',
            disabled: row.latest || row.revoked,
            onSelect: () =>
              void run(`Set ${row.name} ${row.version} as latest`, `${row.name} ${row.version} is the latest`, () =>
                platformActions.setLatest(config, admin, row)
              )
          },
          ...(slot
            ? [
                {
                  value: 'current',
                  label: row.current ? 'New tribes already get this' : 'Use for new tribes',
                  disabled: Boolean(row.current) || row.revoked,
                  onSelect: () => openSheet({ kind: 'current', slot, hash: row.hash })
                }
              ]
            : []),
          {
            value: 'approve',
            label: 'Approve an upgrade from this',
            onSelect: () => openSheet({ kind: 'approve', from: row.hash })
          },
          { separator: true, value: 'sep' },
          {
            value: 'revoke',
            label: row.revoked ? 'Already revoked' : 'Revoke',
            tone: 'danger',
            disabled: row.revoked,
            onSelect: () => {
              setError('');
              setRevoking(row);
            }
          }
        ]}
      />
    );
  };

  return (
    <>
      <PlatformRegistry
        state={state}
        rowActions={rowActions}
        action={
          <span className={headerActions}>
            <Button variant="ghost" size="sm" disabled={disabled} onClick={() => openSheet({ kind: 'current' })}>
              New tribes get…
            </Button>
            <Button variant="secondary" size="sm" disabled={disabled} onClick={() => openSheet({ kind: 'register' })}>
              Register
            </Button>
          </span>
        }
      />
      {error && !sheet && !revoking ? (
        <Callout variant="error" title="That change didn't go through" description={error} role="alert" />
      ) : null}

      <RegisterSheet
        key={`register-${opened}`}
        open={sheet?.kind === 'register'}
        onClose={() => setSheet(null)}
        config={config}
        state={state}
        busy={busy}
        error={error}
        disabled={disabled}
        onSubmit={(input) =>
          run(`Register ${input.name} ${input.version}`, `${input.name} ${input.version} registered`, () =>
            platformActions.register(config, admin, input)
          )
        }
      />
      <ApproveSheet
        key={`approve-${opened}`}
        open={sheet?.kind === 'approve'}
        initialFrom={sheet?.kind === 'approve' ? sheet.from : undefined}
        onClose={() => setSheet(null)}
        config={config}
        state={state}
        busy={busy}
        error={error}
        disabled={disabled}
        onSubmit={(from, to) =>
          run(`Approve ${label(from)} → ${to.version}`, `Upgrade to ${to.name} ${to.version} approved`, () =>
            platformActions.approveUpgrade(config, admin, from.hash, to.hash)
          )
        }
      />
      <CurrentSheet
        key={`current-${opened}`}
        open={sheet?.kind === 'current'}
        preset={
          sheet?.kind === 'current' && sheet.slot && sheet.hash ? { slot: sheet.slot, hash: sheet.hash } : undefined
        }
        onClose={() => setSheet(null)}
        state={state}
        busy={busy}
        error={error}
        disabled={disabled}
        onSubmit={(choice) =>
          run('Change what new tribes get', 'New tribes get the chosen versions', () =>
            platformActions.setCurrent(config, admin, choice)
          )
        }
      />

      <Dialog
        open={revoking !== null}
        onOpenChange={(open) => (!open && !busy ? setRevoking(null) : undefined)}
        role="alertdialog"
        title={revoking ? `Revoke ${revoking.name} ${revoking.version}?` : 'Revoke'}
        description="This can't be undone. New tribes can't be deployed from it, tribes can't upgrade to it, and a pending tribe running it can't launch until it upgrades. Tribes already running it keep working."
        initialFocusEl={() => keepRef.current}
        footer={
          <>
            <Button ref={keepRef} variant="ghost" disabled={busy} onClick={() => setRevoking(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              loading={busy}
              disabled={disabled}
              onClick={() =>
                revoking &&
                void run(
                  `Revoke ${revoking.name} ${revoking.version}`,
                  `${revoking.name} ${revoking.version} revoked`,
                  () => platformActions.revoke(config, admin, revoking)
                )
              }
            >
              Revoke
            </Button>
          </>
        }
      >
        {revoking && revoking.usedBy ? (
          <p className={muted}>
            {revoking.usedBy} {revoking.usedBy === 1 ? 'module runs' : 'modules run'} this version now.
          </p>
        ) : null}
        {error && revoking ? <Callout variant="error" title="Not revoked" description={error} role="alert" /> : null}
      </Dialog>
    </>
  );
}

function RegisterSheet({
  open,
  onClose,
  config,
  state,
  busy,
  error,
  disabled,
  onSubmit
}: {
  open: boolean;
  onClose: () => void;
  config: PlatformConfig;
  state: PlatformState;
  busy: boolean;
  error: string;
  disabled: boolean;
  onSubmit: (input: { name: string; version: string; hash: string }) => void;
}) {
  const [input, setInput] = useState({ name: '', version: '', hash: '' });
  const [touched, setTouched] = useState(false);
  const [checked, setChecked] = useState<{ hash: string; state: 'found' | 'missing' | 'error'; bytes?: number } | null>(
    null
  );
  const errors = validateRegistration(input, state.implementations);
  const hash = normalizeHash(input.hash);
  const checkable = open && !errors.hash && Boolean(hash);
  const code: { hash: string; state: 'checking' | 'found' | 'missing' | 'error'; bytes?: number } | null = !checkable
    ? null
    : checked?.hash === hash
      ? checked
      : { hash, state: 'checking' };

  // Check the code exists on chain once the hash is well formed.
  useEffect(() => {
    if (!checkable) return;
    let live = true;
    readUploadedCode(config, hash)
      .then(
        (found) => live && setChecked(found ? { hash, state: 'found', bytes: found.bytes } : { hash, state: 'missing' })
      )
      .catch(() => live && setChecked({ hash, state: 'error' }));
    return () => {
      live = false;
    };
  }, [config, checkable, hash]);

  const codeOk = code?.hash === hash && code.state === 'found';
  const valid = !errors.name && !errors.version && !errors.hash && codeOk;
  const show = (field: 'name' | 'version' | 'hash') => (touched || input[field]) && errors[field];

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => (!next && !busy ? onClose() : undefined)}
      title="Register an implementation"
      description="Upload the code first with the deploy scripts; this records it in the registry. Registering doesn't change what's latest or what new tribes get."
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={disabled || (touched && !valid)}
            onClick={() => {
              setTouched(true);
              if (valid) onSubmit(input);
            }}
          >
            {input.name && input.version.trim() ? `Register ${input.name} ${input.version.trim()}` : 'Register'}
          </Button>
        </>
      }
    >
      <div className={form}>
        <Field>
          <FieldLabel htmlFor="register-name">Module</FieldLabel>
          <Select
            id="register-name"
            value={input.name}
            onChange={(e) => setInput({ ...input, name: e.target.value })}
            aria-invalid={Boolean(show('name')) || undefined}
          >
            <option value="">Choose…</option>
            {IMPLEMENTATION_NAMES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
          {show('name') ? <FieldHelperText tone="error">{errors.name}</FieldHelperText> : null}
        </Field>
        <Field>
          <FieldLabel htmlFor="register-version">Version</FieldLabel>
          <Input
            id="register-version"
            value={input.version}
            placeholder="0.4.1"
            onChange={(e) => setInput({ ...input, version: e.target.value })}
            aria-invalid={Boolean(show('version')) || undefined}
          />
          {show('version') ? <FieldHelperText tone="error">{errors.version}</FieldHelperText> : null}
        </Field>
        <Field>
          <FieldLabel htmlFor="register-hash">Code hash</FieldLabel>
          <Input
            id="register-hash"
            value={input.hash}
            spellCheck={false}
            autoComplete="off"
            className={css({ textStyle: 'mono' })}
            placeholder="64 hexadecimal characters"
            onChange={(e) => setInput({ ...input, hash: e.target.value })}
            aria-invalid={Boolean(show('hash') || code?.state === 'missing') || undefined}
          />
          {show('hash') ? (
            <FieldHelperText tone="error">{errors.hash}</FieldHelperText>
          ) : code?.hash === hash ? (
            code.state === 'checking' ? (
              <FieldHelperText>Looking for this code on chain…</FieldHelperText>
            ) : code.state === 'found' ? (
              <FieldHelperText>Code found on chain · {Math.round((code.bytes ?? 0) / 1024)} KB</FieldHelperText>
            ) : code.state === 'missing' ? (
              <FieldHelperText tone="error">
                No uploaded code has this hash. Upload it with the deploy scripts first.
              </FieldHelperText>
            ) : (
              <FieldHelperText tone="error">Couldn't check the chain for this code. Try again.</FieldHelperText>
            )
          ) : null}
        </Field>
        {error ? <Callout variant="error" title="Not registered" description={error} role="alert" /> : null}
      </div>
    </Sheet>
  );
}

function ApproveSheet({
  open,
  initialFrom,
  onClose,
  config,
  state,
  busy,
  error,
  disabled,
  onSubmit
}: {
  open: boolean;
  initialFrom?: string;
  onClose: () => void;
  config: PlatformConfig;
  state: PlatformState;
  busy: boolean;
  error: string;
  disabled: boolean;
  onSubmit: (from: RegistryImplementation, to: RegistryImplementation) => void;
}) {
  const [fromHash, setFromHash] = useState(initialFrom ?? '');
  const [toHash, setToHash] = useState('');
  const [approvedPath, setApprovedPath] = useState<{ path: string; approved: boolean } | null>(null);

  const from = state.implementations.find((r) => r.hash === fromHash);
  const to = state.implementations.find((r) => r.hash === toHash);
  const targets = state.implementations.filter(
    (r) => !r.revoked && from && r.name === from.name && r.hash !== from.hash
  );
  const problem = validateUpgradePath(from, to);

  const path = from && to && !problem ? `${from.hash}:${to.hash}` : null;
  const approved = path && approvedPath?.path === path ? approvedPath.approved : null;

  useEffect(() => {
    if (!path) return;
    const [fromPath, toPath] = path.split(':') as [string, string];
    let live = true;
    isUpgradeApproved(config, fromPath, toPath)
      .then((value) => live && setApprovedPath({ path, approved: value }))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [config, path]);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => (!next && !busy ? onClose() : undefined)}
      title="Approve an upgrade path"
      description="Tribes can upgrade from one version to another only along approved paths, and only by their own vote."
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={disabled || Boolean(problem) || approved === true}
            onClick={() => from && to && onSubmit(from, to)}
          >
            {to ? `Approve upgrade to ${to.version}` : 'Approve'}
          </Button>
        </>
      }
    >
      <div className={form}>
        <Field>
          <FieldLabel htmlFor="approve-from">From</FieldLabel>
          <Select id="approve-from" value={fromHash} onChange={(e) => (setFromHash(e.target.value), setToHash(''))}>
            <option value="">Choose…</option>
            {state.implementations.map((row) => (
              <option key={row.hash} value={row.hash}>
                {label(row)}
                {row.revoked ? ' (revoked)' : ''}
              </option>
            ))}
          </Select>
          <FieldHelperText>
            A revoked version can still be the starting point, so tribes can move off it.
          </FieldHelperText>
        </Field>
        <Field>
          <FieldLabel htmlFor="approve-to">To</FieldLabel>
          <Select id="approve-to" value={toHash} disabled={!from} onChange={(e) => setToHash(e.target.value)}>
            <option value="">
              {from
                ? targets.length
                  ? 'Choose…'
                  : 'No other active version of this module'
                : 'Choose the starting version first'}
            </option>
            {targets.map((row) => (
              <option key={row.hash} value={row.hash}>
                {label(row)}
              </option>
            ))}
          </Select>
          {approved ? <FieldHelperText>This path is already approved.</FieldHelperText> : null}
        </Field>
        {error ? <Callout variant="error" title="Not approved" description={error} role="alert" /> : null}
      </div>
    </Sheet>
  );
}

function CurrentSheet({
  open,
  preset,
  onClose,
  state,
  busy,
  error,
  disabled,
  onSubmit
}: {
  open: boolean;
  preset?: { slot: CurrentSlot; hash: string };
  onClose: () => void;
  state: PlatformState;
  busy: boolean;
  error: string;
  disabled: boolean;
  onSubmit: (choice: Record<CurrentSlot, string>) => void;
}) {
  const { current, implementations } = state;
  const [choice, setChoice] = useState<Partial<Record<CurrentSlot, string>>>(() => ({
    ...(current ?? {}),
    ...(preset ? { [preset.slot]: preset.hash } : {})
  }));

  const errors = validateCurrent(choice, implementations);
  const valid = Object.keys(errors).length === 0;
  const diff = useMemo(() => currentChanges(current, choice, implementations), [current, choice, implementations]);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => (!next && !busy ? onClose() : undefined)}
      title="What new tribes get"
      description="The versions create_dao and create_module deploy. Existing tribes are not changed."
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={disabled || !valid || diff.length === 0}
            onClick={() => valid && onSubmit(choice as Record<CurrentSlot, string>)}
          >
            {diff.length ? `Save ${diff.length} ${diff.length === 1 ? 'change' : 'changes'}` : 'No changes'}
          </Button>
        </>
      }
    >
      <div className={form}>
        {(Object.entries(CURRENT_SLOTS) as Array<[CurrentSlot, string]>).map(([slot, name]) => {
          const options = state.implementations.filter(
            (r) => r.name === name && (!r.revoked || r.hash === choice[slot])
          );
          return (
            <Field key={slot}>
              <FieldLabel htmlFor={`current-${slot}`}>{name}</FieldLabel>
              <Select
                id={`current-${slot}`}
                value={choice[slot] ?? ''}
                aria-invalid={Boolean(errors[slot]) || undefined}
                onChange={(e) => setChoice({ ...choice, [slot]: e.target.value })}
              >
                <option value="">Choose…</option>
                {options.map((row) => (
                  <option key={row.hash} value={row.hash}>
                    {row.version} · {row.hash.slice(0, 8)}…{row.revoked ? ' (revoked)' : ''}
                  </option>
                ))}
              </Select>
              {errors[slot] ? <FieldHelperText tone="error">{errors[slot]}</FieldHelperText> : null}
            </Field>
          );
        })}
        {diff.length ? (
          <div>
            <p className={muted}>Changes</p>
            <ul className={changes}>
              {diff.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {error ? <Callout variant="error" title="Not saved" description={error} role="alert" /> : null}
      </div>
    </Sheet>
  );
}
