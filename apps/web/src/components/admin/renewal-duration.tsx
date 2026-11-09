'use client';

import { css } from 'styled-system/css';

import { FieldLabel, Input, SegmentedControl } from '@/components/ui';

const controls = css({ display: 'grid', gap: '3', maxW: '32rem' });
const customRow = css({ display: 'flex', alignItems: 'center', gap: '2' });
const days = css({ maxW: '8rem' });
const muted = css({ textStyle: 'body', color: 'ink.muted', m: '0' });

/** The day count a renewal duration picker holds, or NaN while "Other" is empty. */
export function chosenDays(preset: string, custom: string) {
  return preset === 'custom' ? Number(custom) : Number(preset);
}

/**
 * "Renew for" presets plus a custom number of days, shared by a tribe's Renewal tab and the
 * platform page. Changing it calls `onChange`, which should drop any quote for the old period.
 */
export function RenewalDuration({
  id,
  presets,
  preset,
  custom,
  minDays = 1,
  maxDays,
  onChange
}: {
  id: string;
  presets: string[];
  preset: string;
  custom: string;
  minDays?: number;
  maxDays: number;
  onChange: (next: { preset: string; custom: string }) => void;
}) {
  const value = chosenDays(preset, custom);
  const valid = Number.isInteger(value) && value >= minDays && value <= maxDays;
  return (
    <div className={controls}>
      <SegmentedControl
        label="Renew for"
        value={preset}
        onValueChange={(next) => onChange({ preset: next, custom })}
        options={[...presets.map((p) => ({ value: p, label: `${p} days` })), { value: 'custom', label: 'Other' }]}
      />
      {preset === 'custom' ? (
        <div className={customRow}>
          <FieldLabel htmlFor={id}>Days</FieldLabel>
          <Input
            id={id}
            className={days}
            inputMode="numeric"
            value={custom}
            placeholder={String(maxDays)}
            aria-invalid={(custom !== '' && !valid) || undefined}
            onChange={(event) => onChange({ preset, custom: event.target.value.replace(/\D/g, '') })}
          />
          <span className={muted}>{minDays > 1 ? `${minDays} to ${maxDays}` : `up to ${maxDays}`}</span>
        </div>
      ) : null}
    </div>
  );
}
