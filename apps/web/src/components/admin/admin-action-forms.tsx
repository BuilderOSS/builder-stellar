'use client';

import { Stack } from 'styled-system/jsx';

import { AuctionPaymentTokenSelect } from '@/components/auction/auction-payment-token-select';
import { AuctionReservePriceField } from '@/components/auction/auction-reserve-price-field';
import { Callout, FieldHelperText, FieldLabel, Input, Select } from '@/components/ui';
import { getConfiguredAuctionNetwork } from '@/lib/auction-values';
import { expiryInputValue } from '@/lib/expiry-time';
import { MAX_MARKETPLACE_FEE_BPS } from '@/lib/governance-limits';
import { feePercentText } from '@/lib/marketplace/amount';
import { marketplaceAssetCodes, marketplaceAssets } from '@/lib/marketplace/readiness';
import type { ActionFormProps } from '@/lib/proposal-actions/types';

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

function ErrorText({ message, id }: { message?: string; id?: string }) {
  return message ? (
    <FieldHelperText tone="error" id={id}>
      {message}
    </FieldHelperText>
  ) : null;
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

export function AdminValueForm({
  value,
  onChange,
  disabled,
  validationErrors,
  hint
}: ActionFormProps<AdminValueDraft> & { hint?: string }) {
  const error = validationErrors && !validationErrors.valid ? validationErrors.fields?.value : undefined;
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
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? 'resale-fee-error' : 'resale-fee-hint'}
      />
      {error ? (
        <ErrorText message={error} id="resale-fee-error" />
      ) : (
        <FieldHelperText id="resale-fee-hint">
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
  validationErrors
}: ActionFormProps<AdminReservePriceDraft>) {
  return (
    <Stack gap="1">
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
  network = getConfiguredAuctionNetwork()
}: ActionFormProps<AdminPaymentTokenDraft>) {
  return (
    <Stack gap="1">
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

/**
 * The market's own assets (XLM or USDC for the network): buyers can only pay in those, so a price
 * in anything else could never be paid. A value outside the list (an older draft) shows as unchosen.
 */
function MarketAssetSelect({
  id,
  network,
  value,
  onChange,
  disabled,
  error,
  consequence
}: {
  id: string;
  network: NonNullable<ActionFormProps<unknown>['network']>;
  value: string;
  onChange: (contractId: string) => void;
  disabled: boolean;
  error?: string;
  /** Ends the helper sentence: what happens with any other asset. */
  consequence: string;
}) {
  const assets = marketplaceAssets(network);
  const codes = marketplaceAssetCodes(network);
  return (
    <>
      <FieldLabel htmlFor={id}>Buyers pay in</FieldLabel>
      <Select
        id={id}
        value={assets.some((asset) => asset.contractId === value) ? value : ''}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? `${id}-error` : `${id}-hint`}
      >
        <option value="">Choose {codes}</option>
        {assets.map((asset) => (
          <option key={asset.contractId} value={asset.contractId}>
            {asset.code} · {asset.name}
          </option>
        ))}
      </Select>
      {error ? (
        <ErrorText message={error} id={`${id}-error`} />
      ) : (
        <FieldHelperText id={`${id}-hint`}>
          Buyers pay from their wallets in {codes}, the only assets the market takes, {consequence}
        </FieldHelperText>
      )}
    </>
  );
}

export function MarketPaymentAssetForm({
  value,
  onChange,
  disabled,
  validationErrors,
  network = getConfiguredAuctionNetwork()
}: ActionFormProps<AdminPaymentTokenDraft>) {
  return (
    <Stack gap="2">
      <MarketAssetSelect
        id="market-payment-asset"
        network={network}
        value={value.paymentToken}
        onChange={(paymentToken) => onChange({ paymentToken })}
        disabled={disabled}
        error={validationErrors && !validationErrors.valid ? validationErrors.fields?.paymentToken : undefined}
        consequence="so new listings can only be priced in one of them. Open listings keep the asset they were listed in."
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
      <MarketAssetSelect
        id="pool-asset"
        network={network}
        value={value.asset}
        onChange={(asset) => set({ asset })}
        disabled={disabled}
        error={fields?.asset}
        consequence="so a pool priced in anything else could never sell."
      />
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
        value={expiryInputValue(value.expiresAt)}
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
