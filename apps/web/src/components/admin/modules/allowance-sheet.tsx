'use client';

import { useState } from 'react';
import { css } from 'styled-system/css';

import { Button, Field, FieldHelperText, FieldLabel, Input } from '@/components/ui';
import { Sheet } from '@/components/ui/sheet';
import { UNLIMITED_ALLOWANCE } from '@/lib/modules/kinds';

const stack = css({ display: 'grid', gap: '4' });
const buttons = css({ display: 'flex', gap: '2', flexWrap: 'wrap' });

/**
 * Change how many memberships a module may still mint. It adds the amount up or down rather than
 * replacing it, so a second list's grant never erases the first.
 */
export function AllowanceSheet({
  open,
  onOpenChange,
  title,
  allowance,
  live,
  onChange
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  allowance: number;
  live: boolean;
  onChange: (direction: 'increase' | 'decrease', amount: string) => string | null;
}) {
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next)
      setTimeout(() => {
        setAmount('');
        setError('');
      }, 250);
  }

  function submit(direction: 'increase' | 'decrease') {
    const problem = onChange(direction, amount.trim());
    if (problem) setError(problem);
    else handleOpenChange(false);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={handleOpenChange}
      title={title}
      description="A module mints only up to its allowance. Pools and claim lists need one before they open."
    >
      <div className={stack}>
        <Field>
          <FieldLabel htmlFor="module-allowance-amount">Memberships to add or take away</FieldLabel>
          <Input
            id="module-allowance-amount"
            inputMode="numeric"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
              setError('');
            }}
          />
          <FieldHelperText>
            {allowance >= UNLIMITED_ALLOWANCE
              ? 'It has no limit now.'
              : `It can mint ${allowance.toLocaleString()} more now.`}
          </FieldHelperText>
          {error ? <FieldHelperText tone="error">{error}</FieldHelperText> : null}
        </Field>
        <div className={buttons}>
          <Button type="button" onClick={() => submit('increase')}>
            {live ? 'Propose raising it' : 'Raise allowance'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => submit('decrease')}>
            {live ? 'Propose lowering it' : 'Lower allowance'}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
