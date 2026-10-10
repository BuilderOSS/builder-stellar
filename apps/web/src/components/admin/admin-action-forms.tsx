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
export type CreatePrimaryListingDraft = { price: string; expiresAt: string };
export type CancelPrimaryListingDraft = { listingId: string };

function ErrorText({ message }: { message?: string }) {
  return message ? <FieldHelperText tone="error">{message}</FieldHelperText> : null;
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

export function CreatePrimaryListingForm({
  value,
  onChange,
  disabled,
  validationErrors
}: ActionFormProps<CreatePrimaryListingDraft>) {
  const fields = validationErrors && !validationErrors.valid ? validationErrors.fields : undefined;
  return (
    <Stack gap="2">
      <FieldLabel htmlFor="primary-listing-price">Price (marketplace payment asset)</FieldLabel>
      <Input
        id="primary-listing-price"
        value={value.price}
        onChange={(event) => onChange({ ...value, price: event.target.value })}
        inputMode="decimal"
        placeholder="100"
        disabled={disabled}
      />
      <ErrorText message={fields?.price} />
      <FieldLabel htmlFor="primary-listing-expires">Expires at</FieldLabel>
      <Input
        id="primary-listing-expires"
        type="datetime-local"
        value={value.expiresAt}
        onChange={(event) => onChange({ ...value, expiresAt: event.target.value })}
        disabled={disabled}
      />
      <ErrorText message={fields?.expiresAt} />
      <FieldHelperText>
        The buyer receives a newly minted token. The listing is priced in the marketplace payment asset at the time it
        is created.
      </FieldHelperText>
    </Stack>
  );
}

export function CancelPrimaryListingForm({
  value,
  onChange,
  disabled,
  validationErrors
}: ActionFormProps<CancelPrimaryListingDraft>) {
  return (
    <Stack gap="2">
      <FieldLabel htmlFor="primary-listing-id">Primary listing id</FieldLabel>
      <Input
        id="primary-listing-id"
        value={value.listingId}
        onChange={(event) => onChange({ listingId: event.target.value })}
        inputMode="numeric"
        disabled={disabled}
      />
      <ErrorText message={validationErrors && !validationErrors.valid ? validationErrors.fields?.value : undefined} />
    </Stack>
  );
}
