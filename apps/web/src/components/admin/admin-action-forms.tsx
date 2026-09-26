'use client';

import { Stack } from 'styled-system/jsx';

import { AdminDraftActionPreview } from '@/components/admin/admin-draft-action-preview';
import { AuctionPaymentTokenSelect } from '@/components/auction/auction-payment-token-select';
import { AuctionReservePriceField } from '@/components/auction/auction-reserve-price-field';
import { FieldHelperText, FieldLabel, Input, Select } from '@/components/ui';
import { getConfiguredAuctionNetwork } from '@/lib/auction-values';
import type { ActionFormProps, ProposalQueuedAction } from '@/lib/proposal-actions/types';

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
  showEnabled = true,
  draftPreview
}: ActionFormProps<AdminAuthorityDraft> & { showEnabled?: boolean; draftPreview?: ProposalQueuedAction }) {
  return (
    <Stack gap="2">
      {draftPreview && <AdminDraftActionPreview action={draftPreview} compact />}
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

export function AdminValueForm({
  value,
  onChange,
  disabled,
  validationErrors,
  draftPreview
}: ActionFormProps<AdminValueDraft> & { draftPreview?: ProposalQueuedAction }) {
  return (
    <Stack gap="2">
      {draftPreview && <AdminDraftActionPreview action={draftPreview} compact />}
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
  validationErrors,
  draftPreview
}: ActionFormProps<AdminReservePriceDraft> & { draftPreview?: ProposalQueuedAction }) {
  return (
    <Stack gap="1">
      {draftPreview && <AdminDraftActionPreview action={draftPreview} compact />}
      <AuctionReservePriceField
        value={value.reservePrice}
        onChange={(reservePrice) => onChange({ reservePrice })}
        error={validationErrors && !validationErrors.valid ? validationErrors.fields?.reservePrice : undefined}
        disabled={disabled}
        id="admin-reserve-price"
      />
    </Stack>
  );
}

export function AdminPaymentTokenForm({
  value,
  onChange,
  disabled,
  validationErrors,
  network = getConfiguredAuctionNetwork(),
  draftPreview
}: ActionFormProps<AdminPaymentTokenDraft> & { draftPreview?: ProposalQueuedAction }) {
  return (
    <Stack gap="1">
      {draftPreview && <AdminDraftActionPreview action={draftPreview} compact />}
      <AuctionPaymentTokenSelect
        network={network}
        value={value.paymentToken}
        onChange={(paymentToken) => onChange({ paymentToken })}
        error={validationErrors && !validationErrors.valid ? validationErrors.fields?.paymentToken : undefined}
        disabled={disabled}
        id="admin-payment-token"
      />
    </Stack>
  );
}
