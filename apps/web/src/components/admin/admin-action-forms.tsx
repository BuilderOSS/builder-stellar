'use client';

import { Stack } from 'styled-system/jsx';

import { FieldHelperText, FieldLabel, Input, Select } from '@/components/ui';
import type { ActionFormProps } from '@/lib/proposal-actions/types';

export type AdminAuthorityDraft = { authority: string; enabled: boolean };
export type AdminValueDraft = { value: string };
export type AdminReservePriceDraft = { reservePrice: string };
export type AdminPaymentTokenDraft = { paymentToken: string };

function ErrorText({ message }: { message?: string }) {
  return message ? <FieldHelperText style={{ color: '#f87171' }}>{message}</FieldHelperText> : null;
}

export function AuthorityActionForm({
  value,
  onChange,
  disabled,
  validationErrors,
  showEnabled = true
}: ActionFormProps<AdminAuthorityDraft> & { showEnabled?: boolean }) {
  return (
    <Stack gap="2">
      <FieldLabel htmlFor="admin-authority">Authority</FieldLabel>
      <Input
        id="admin-authority"
        value={value.authority}
        onChange={(event) => onChange({ ...value, authority: event.target.value })}
        placeholder="Address or contract id"
        disabled={disabled}
      />
      <ErrorText
        message={validationErrors && !validationErrors.valid ? validationErrors.fields?.authority : undefined}
      />
      {showEnabled ? (
        <>
          <FieldLabel htmlFor="admin-authority-action">Action</FieldLabel>
          <Select
            id="admin-authority-action"
            value={value.enabled ? 'grant' : 'revoke'}
            onChange={(event) => onChange({ ...value, enabled: event.target.value === 'grant' })}
            disabled={disabled}
          >
            <option value="grant">Grant authority</option>
            <option value="revoke">Revoke authority</option>
          </Select>
        </>
      ) : null}
      <FieldHelperText>
        {value.enabled ? 'This address will be granted access.' : 'This address will lose access.'}
      </FieldHelperText>
    </Stack>
  );
}

export function AuthorityProposalActionForm(props: ActionFormProps<AdminAuthorityDraft>) {
  return <AuthorityActionForm {...props} showEnabled />;
}

export function AdminValueForm({ value, onChange, disabled, validationErrors }: ActionFormProps<AdminValueDraft>) {
  return (
    <Stack gap="2">
      <FieldLabel htmlFor="admin-value">New value</FieldLabel>
      <Input
        id="admin-value"
        value={value.value}
        onChange={(event) => onChange({ value: event.target.value })}
        inputMode="numeric"
        disabled={disabled}
      />
      <ErrorText message={validationErrors && !validationErrors.valid ? validationErrors.fields?.value : undefined} />
    </Stack>
  );
}

export function AdminReservePriceForm({
  value,
  onChange,
  disabled,
  validationErrors
}: ActionFormProps<AdminReservePriceDraft>) {
  return (
    <Stack gap="2">
      <FieldLabel htmlFor="admin-reserve-price">Reserve price</FieldLabel>
      <Input
        id="admin-reserve-price"
        value={value.reservePrice}
        onChange={(event) => onChange({ reservePrice: event.target.value })}
        inputMode="decimal"
        placeholder="For example 10"
        disabled={disabled}
      />
      <ErrorText
        message={validationErrors && !validationErrors.valid ? validationErrors.fields?.reservePrice : undefined}
      />
      <FieldHelperText>Use up to 7 decimal places.</FieldHelperText>
    </Stack>
  );
}

export function AdminPaymentTokenForm({
  value,
  onChange,
  disabled,
  validationErrors
}: ActionFormProps<AdminPaymentTokenDraft>) {
  return (
    <Stack gap="2">
      <FieldLabel htmlFor="admin-payment-token">Payment token</FieldLabel>
      <Input
        id="admin-payment-token"
        value={value.paymentToken}
        onChange={(event) => onChange({ paymentToken: event.target.value })}
        placeholder="SAC contract address"
        disabled={disabled}
      />
      <ErrorText
        message={validationErrors && !validationErrors.valid ? validationErrors.fields?.paymentToken : undefined}
      />
    </Stack>
  );
}
