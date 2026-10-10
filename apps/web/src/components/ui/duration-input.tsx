'use client';

import { css } from 'styled-system/css';

import { clampDurationParts, combineDuration, type DurationParts, formatDuration, splitDuration } from '@/lib/duration';

import { FieldHelperText } from './field';
import { Input } from './input';

type DurationKey = keyof DurationParts;
type DurationDraftParts = Record<DurationKey, string>;

const INPUTS: Array<{ key: DurationKey; label: string; max?: number }> = [
  { key: 'days', label: 'Days' },
  { key: 'hours', label: 'Hours', max: 23 },
  { key: 'minutes', label: 'Minutes', max: 59 },
  { key: 'seconds', label: 'Seconds', max: 59 }
];

function parseValue(value: number | string | null | undefined) {
  const parsed = typeof value === 'string' ? Number(value) : Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function toDraftParts(value: number | string | null | undefined): DurationDraftParts {
  if (value === null || typeof value === 'undefined' || value === '') {
    return { days: '', hours: '', minutes: '', seconds: '' };
  }
  const parts = splitDuration(parseValue(value));
  return {
    days: String(parts.days),
    hours: String(parts.hours),
    minutes: String(parts.minutes),
    seconds: String(parts.seconds)
  };
}

function parseDraftParts(parts: DurationDraftParts) {
  return clampDurationParts({
    days: Number(parts.days || 0),
    hours: Number(parts.hours || 0),
    minutes: Number(parts.minutes || 0),
    seconds: Number(parts.seconds || 0)
  });
}

const fieldset = css({ display: 'grid', gap: '2', border: '0', p: '0', m: '0', minW: '0' });
const legend = css({ textStyle: 'label', color: 'ink', p: '0', mb: '1' });
const grid = css({ display: 'grid', gap: '2', gridTemplateColumns: 'repeat(auto-fit, minmax(72px, 1fr))' });
const part = css({ display: 'grid', gap: '1' });
const partLabel = css({ textStyle: 'micro', color: 'ink.muted' });
const total = css({ textStyle: 'caption', color: 'ink.muted', m: '0' });

/**
 * A duration entered as days, hours and minutes (and optionally seconds),
 * emitted as total seconds. Shows the result in words.
 */
export function DurationInput({
  id,
  label,
  value,
  onChange,
  helperText,
  disabled,
  showSeconds = true,
  invalid
}: {
  id: string;
  label: string;
  value: number | string | null | undefined;
  onChange: (seconds: number) => void;
  helperText?: string;
  disabled?: boolean;
  showSeconds?: boolean;
  invalid?: boolean;
}) {
  const parts = toDraftParts(value);
  const inputs = showSeconds ? INPUTS : INPUTS.filter((input) => input.key !== 'seconds');

  function emit(nextParts: DurationParts) {
    onChange(combineDuration(nextParts));
  }

  return (
    <fieldset className={fieldset} id={id}>
      <legend className={legend}>{label}</legend>
      <div className={grid}>
        {inputs.map((input) => (
          <div key={input.key} className={part}>
            <label className={partLabel} htmlFor={`${id}-${input.key}`}>
              {input.label}
            </label>
            <Input
              id={`${id}-${input.key}`}
              type="number"
              inputMode="numeric"
              min="0"
              max={typeof input.max === 'number' ? String(input.max) : undefined}
              step="1"
              value={parts[input.key]}
              placeholder="0"
              disabled={disabled}
              aria-invalid={invalid || undefined}
              onChange={(event) => emit(parseDraftParts({ ...parts, [input.key]: event.target.value }))}
              onBlur={() => {
                const clamped = parseDraftParts(parts);
                emit(
                  parseDraftParts({
                    ...parts,
                    [input.key]: String(
                      typeof input.max === 'number' ? Math.min(input.max, clamped[input.key]) : clamped[input.key]
                    )
                  })
                );
              }}
            />
          </div>
        ))}
      </div>
      {value !== '' && value != null && Number.isFinite(Number(value)) ? (
        <p className={total}>{formatDuration(Number(value), { style: 'long', maxUnits: 4 })}</p>
      ) : null}
      {helperText ? <FieldHelperText>{helperText}</FieldHelperText> : null}
    </fieldset>
  );
}
