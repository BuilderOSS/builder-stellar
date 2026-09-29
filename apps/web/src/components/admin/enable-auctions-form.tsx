'use client';

import { Stack } from 'styled-system/jsx';

import { DurationInput } from '@/components/admin/duration-input';
import { AuctionPaymentTokenSelect } from '@/components/auction/auction-payment-token-select';
import { AuctionReservePriceField } from '@/components/auction/auction-reserve-price-field';
import { Button, Text } from '@/components/ui';
import type { NetworkName } from '@/config/networks';

export type EnableAuctionsValues = {
  duration: string;
  reservePrice: string;
  timeBuffer: string;
  paymentToken: string;
};

export type EnableAuctionsErrors = Partial<Record<keyof EnableAuctionsValues, string>>;

export function EnableAuctionsForm({
  value,
  onChange,
  onSubmit,
  network,
  errors,
  disabled,
  submitLabel
}: {
  value: EnableAuctionsValues;
  onChange: (value: EnableAuctionsValues) => void;
  onSubmit: () => void;
  network: NetworkName;
  errors: EnableAuctionsErrors;
  disabled?: boolean;
  submitLabel: string;
}) {
  return (
    <Stack gap="4">
      <div>
        <Text style={{ fontWeight: 650 }}>Auction setup</Text>
        <Text className="lede" style={{ margin: '4px 0 0' }}>
          Configure the first auction before enabling bidding. These settings apply to future auctions.
        </Text>
      </div>
      <DurationInput
        id="enable-auction-duration"
        label="Auction duration"
        value={value.duration}
        onChange={(duration) => onChange({ ...value, duration: duration ? String(duration) : '' })}
        helperText="How long each auction lasts. Minimum 5 minutes."
        disabled={disabled}
      />
      {errors.duration ? <Text style={{ color: 'var(--negative)', fontSize: '0.8rem' }}>{errors.duration}</Text> : null}
      <AuctionReservePriceField
        id="enable-auction-reserve-price"
        value={value.reservePrice}
        onChange={(reservePrice) => onChange({ ...value, reservePrice })}
        error={errors.reservePrice}
        disabled={disabled}
      />
      <DurationInput
        id="enable-auction-time-buffer"
        label="Time buffer"
        value={value.timeBuffer}
        onChange={(timeBuffer) => onChange({ ...value, timeBuffer: timeBuffer ? String(timeBuffer) : '' })}
        helperText="Extra time added when a bid arrives near the end. Minimum 1 minute."
        disabled={disabled}
      />
      {errors.timeBuffer ? (
        <Text style={{ color: 'var(--negative)', fontSize: '0.8rem' }}>{errors.timeBuffer}</Text>
      ) : null}
      <AuctionPaymentTokenSelect
        network={network}
        value={value.paymentToken}
        onChange={(paymentToken) => onChange({ ...value, paymentToken })}
        error={errors.paymentToken}
        disabled={disabled}
        id="enable-auction-payment-token"
      />
      <Button type="button" onClick={onSubmit} disabled={disabled}>
        {submitLabel}
      </Button>
    </Stack>
  );
}
