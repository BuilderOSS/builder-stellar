'use client';

import { createContext, useContext } from 'react';
import { Stack } from 'styled-system/jsx';

import type { AdminReservePriceDraft, AdminValueDraft } from '@/components/admin/admin-action-forms';
import { PercentageInput } from '@/components/admin/percentage-input';
import { AmountInput, DurationInput, FieldHelperText, FieldLabel, Input } from '@/components/ui';
import { MIN_RESERVE_PRICE_TOKENS } from '@/lib/auction-values';
import type { ActionFormProps } from '@/lib/proposal-actions/types';
import type { SettingValues } from '@/lib/proposal-changes/catalog';

/** The tribe's live settings, for forms that need a unit or a current value beyond their own draft. */
export const SettingValuesContext = createContext<SettingValues>({});

function fieldError(props: ActionFormProps<AdminValueDraft>) {
  return props.validationErrors && !props.validationErrors.valid ? props.validationErrors.fields?.value : undefined;
}

/** A duration setting in days, hours and minutes, stored as whole seconds like the contract takes it. */
export function durationSettingForm({
  id,
  label,
  helper,
  showSeconds = true
}: {
  id: string;
  label: string;
  helper: string;
  showSeconds?: boolean;
}) {
  return function DurationSettingForm(props: ActionFormProps<AdminValueDraft>) {
    const error = fieldError(props);
    return (
      <Stack gap="1">
        <DurationInput
          id={id}
          label={label}
          value={props.value.value}
          disabled={props.disabled}
          showSeconds={showSeconds}
          helperText={helper}
          onChange={(seconds) => props.onChange({ value: String(seconds) })}
        />
        {error ? <FieldHelperText tone="error">{error}</FieldHelperText> : null}
      </Stack>
    );
  };
}

/** Quorum as a percentage, stored as basis points. */
export function QuorumSettingForm(props: ActionFormProps<AdminValueDraft>) {
  const error = fieldError(props);
  return (
    <Stack gap="1">
      <PercentageInput
        id="setting-quorum"
        label="Quorum"
        value={props.value.value}
        disabled={props.disabled}
        min={0.01}
        helperText="Share of all votes that must be For or Abstain for a proposal to pass. With 100 votes, 10% means at least 10."
        onChange={(bps) => props.onChange({ value: String(bps) })}
      />
      {error ? <FieldHelperText tone="error">{error}</FieldHelperText> : null}
    </Stack>
  );
}

/** A whole-number setting: votes needed to propose, the minimum bid increase. */
export function wholeNumberSettingForm({ id, label, helper }: { id: string; label: string; helper: string }) {
  return function WholeNumberSettingForm(props: ActionFormProps<AdminValueDraft>) {
    const error = fieldError(props);
    return (
      <Stack gap="2">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <Input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          value={props.value.value}
          disabled={props.disabled}
          aria-invalid={error ? true : undefined}
          onChange={(event) => props.onChange({ value: event.target.value })}
        />
        <FieldHelperText tone={error ? 'error' : undefined}>{error ?? helper}</FieldHelperText>
      </Stack>
    );
  };
}

/** The auction's starting price, in the asset bids are paid in. */
export function StartingPriceSettingForm(props: ActionFormProps<AdminReservePriceDraft>) {
  const unit = useContext(SettingValuesContext).auction?.assetCode;
  const error =
    props.validationErrors && !props.validationErrors.valid ? props.validationErrors.fields?.reservePrice : undefined;
  return (
    <Stack gap="2">
      <FieldLabel htmlFor="setting-starting-price">Starting price</FieldLabel>
      <AmountInput
        id="setting-starting-price"
        unit={unit || 'units'}
        value={props.value.reservePrice}
        disabled={props.disabled}
        aria-invalid={error ? true : undefined}
        onChange={(event) => props.onChange({ reservePrice: event.target.value })}
      />
      <FieldHelperText tone={error ? 'error' : undefined}>
        {error ?? `At least ${MIN_RESERVE_PRICE_TOKENS}, up to 7 decimal places.`}
      </FieldHelperText>
    </Stack>
  );
}
