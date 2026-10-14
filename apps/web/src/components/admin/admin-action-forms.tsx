'use client';

import { Stack } from 'styled-system/jsx';

import { AdminDraftActionPreview } from '@/components/admin/admin-draft-action-preview';
import { AuctionPaymentTokenSelect } from '@/components/auction/auction-payment-token-select';
import { AuctionReservePriceField } from '@/components/auction/auction-reserve-price-field';
import { Callout, FieldHelperText, FieldLabel, Input, Select } from '@/components/ui';
import { getConfiguredAuctionNetwork } from '@/lib/auction-values';
import { MAX_MARKETPLACE_FEE_BPS } from '@/lib/governance-limits';
import { feePercentText } from '@/lib/marketplace/amount';
import { marketplaceAssetCodes, marketplaceAssets } from '@/lib/marketplace/readiness';
import type { ActionFormProps, ProposalQueuedAction } from '@/lib/proposal-actions/types';

export type AdminAuthorityDraft = { authority: string; enabled: boolean };
export type AdminValueDraft = { value: string };
export type AdminReservePriceDraft = { reservePrice: string };
export type AdminPaymentTokenDraft = { paymentToken: string };
export type OpenPoolDraft = {
  price: string;
  asset: string;
  size: string;
  maxPerBuyer: string;
  maxSoldPerPeriod: string;
  periodHours: string;
  expiresAt: string;
};
export type PoolIdDraft = { poolId: string };

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
  draftPreview,
  hint
}: ActionFormProps<AdminValueDraft> & { draftPreview?: ProposalQueuedAction; hint?: string }) {
  const error = validationErrors && !validationErrors.valid ? validationErrors.fields?.value : undefined;
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
      {error ? <ErrorText message={error} /> : hint ? <FieldHelperText>{hint}</FieldHelperText> : null}
    </Stack>
  );
}

/** AdminValueForm with a unit hint ("In seconds."), for setting actions whose value has a unit. */
export function adminValueFormWithHint(hint: string) {
  return function AdminValueFormWithHint(props: ActionFormProps<AdminValueDraft>) {
    return <AdminValueForm {...props} hint={hint} />;
  };
}

/** The market shows its resale fee as a percent, so the form takes one; the proposal stores basis points. */
export function ResaleFeeForm({ value, onChange, disabled, validationErrors }: ActionFormProps<AdminValueDraft>) {
  const error = validationErrors && !validationErrors.valid ? validationErrors.fields?.value : undefined;
  return (
    <Stack gap="2">
      <FieldLabel htmlFor="resale-fee">Resale fee (%)</FieldLabel>
      <Input
        id="resale-fee"
        value={value.value}
        onChange={(event) => onChange({ value: event.target.value })}
        inputMode="decimal"
        placeholder="2.5"
        disabled={disabled}
      />
      {error ? (
        <ErrorText message={error} />
      ) : (
        <FieldHelperText>
          Sellers pay this share of each resale to the treasury, up to {feePercentText(MAX_MARKETPLACE_FEE_BPS)}%. Open
          listings keep the fee they were listed with.
        </FieldHelperText>
      )}
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

export function OpenPoolForm({
  value,
  onChange,
  disabled,
  validationErrors,
  network = getConfiguredAuctionNetwork()
}: ActionFormProps<OpenPoolDraft>) {
  const fields = validationErrors && !validationErrors.valid ? validationErrors.fields : undefined;
  const set = (patch: Partial<OpenPoolDraft>) => onChange({ ...value, ...patch });
  const assets = marketplaceAssets(network);
  const assetCodes = marketplaceAssetCodes(network);
  return (
    <Stack gap="2">
      <FieldLabel htmlFor="pool-price">Price per token</FieldLabel>
      <Input
        id="pool-price"
        value={value.price}
        onChange={(event) => set({ price: event.target.value })}
        inputMode="decimal"
        placeholder="100"
        disabled={disabled}
      />
      <ErrorText message={fields?.price} />
      <FieldLabel htmlFor="pool-asset">Buyers pay in</FieldLabel>
      <Select
        id="pool-asset"
        value={assets.some((asset) => asset.contractId === value.asset) ? value.asset : ''}
        onChange={(event) => set({ asset: event.target.value })}
        disabled={disabled}
      >
        <option value="">Choose {assetCodes}</option>
        {assets.map((asset) => (
          <option key={asset.contractId} value={asset.contractId}>
            {asset.code} · {asset.name}
          </option>
        ))}
      </Select>
      {fields?.asset ? (
        <ErrorText message={fields.asset} />
      ) : (
        <FieldHelperText>
          Buyers pay from their wallets in {assetCodes}, the only assets the market takes, so a pool priced in anything
          else could never sell.
        </FieldHelperText>
      )}
      <FieldLabel htmlFor="pool-size">Tokens in the pool</FieldLabel>
      <Input
        id="pool-size"
        value={value.size}
        onChange={(event) => set({ size: event.target.value })}
        inputMode="numeric"
        disabled={disabled}
      />
      <ErrorText message={fields?.size} />
      <FieldLabel htmlFor="pool-per-buyer">Most one wallet can buy</FieldLabel>
      <Input
        id="pool-per-buyer"
        value={value.maxPerBuyer}
        onChange={(event) => set({ maxPerBuyer: event.target.value })}
        inputMode="numeric"
        disabled={disabled}
      />
      <ErrorText message={fields?.maxPerBuyer} />
      <FieldLabel htmlFor="pool-rate">Most sales per period</FieldLabel>
      <Input
        id="pool-rate"
        value={value.maxSoldPerPeriod}
        onChange={(event) => set({ maxSoldPerPeriod: event.target.value })}
        inputMode="numeric"
        disabled={disabled}
      />
      <ErrorText message={fields?.maxSoldPerPeriod} />
      <FieldLabel htmlFor="pool-period">Period (hours)</FieldLabel>
      <Input
        id="pool-period"
        value={value.periodHours}
        onChange={(event) => set({ periodHours: event.target.value })}
        inputMode="numeric"
        disabled={disabled}
      />
      <ErrorText message={fields?.periodHours} />
      <FieldLabel htmlFor="pool-expires">Closes at</FieldLabel>
      <Input
        id="pool-expires"
        type="datetime-local"
        value={value.expiresAt}
        onChange={(event) => set({ expiresAt: event.target.value })}
        disabled={disabled}
      />
      <ErrorText message={fields?.expiresAt} />
      <FieldHelperText>
        The pool mints its tokens into the marketplace and sells them at this price. Give the marketplace a mint
        allowance of at least this many tokens earlier in the same proposal.
      </FieldHelperText>
      <Callout
        variant="warning"
        title="Each token sold adds a vote"
        description="A pool larger than today's voting supply could let buyers outvote the members who approve it. Keep pools small and the per-wallet limit low. Manage → Market shows the largest share one wallet could buy."
      />
    </Stack>
  );
}

export function PoolIdForm({ value, onChange, disabled, validationErrors }: ActionFormProps<PoolIdDraft>) {
  return (
    <Stack gap="2">
      <FieldLabel htmlFor="pool-id">Pool</FieldLabel>
      <Input
        id="pool-id"
        value={value.poolId}
        onChange={(event) => onChange({ poolId: event.target.value })}
        inputMode="numeric"
        disabled={disabled}
      />
      <ErrorText message={validationErrors && !validationErrors.valid ? validationErrors.fields?.poolId : undefined} />
    </Stack>
  );
}
