'use client';

import { useState } from 'react';
import { Stack } from 'styled-system/jsx';

import { FieldHelperText, FieldLabel, Input, Select } from '@/components/ui';
import { getTreasuryAssets, type TreasuryAsset } from '@/lib/assets-config';
import { getStellarAddressError, isValidStellarAddress } from '@/lib/validation';

const CUSTOM_VALUE = '__custom__';

export type AuctionNetwork = 'testnet' | 'public' | 'local';

function assetLabel(asset: TreasuryAsset) {
  return `${asset.code} · ${asset.name}`;
}

export function AuctionPaymentTokenSelect({
  network,
  value,
  onChange,
  disabled = false,
  error,
  id = 'auction-payment-token'
}: {
  network: AuctionNetwork;
  value: string;
  onChange: (contractId: string) => void;
  disabled?: boolean;
  error?: string;
  id?: string;
}) {
  const [customSelected, setCustomSelected] = useState(false);
  const assets = getTreasuryAssets(network);
  const selectedAsset = assets.find((asset) => asset.contractId === value);
  const isCustom = customSelected || Boolean(value && !selectedAsset);
  const selectValue = isCustom ? CUSTOM_VALUE : value;
  const customError = isCustom && value && !isValidStellarAddress(value) ? getStellarAddressError(value) : undefined;

  return (
    <Stack gap="2">
      <FieldLabel htmlFor={id}>Payment token</FieldLabel>
      <Select
        id={id}
        value={selectValue}
        onChange={(event) => {
          const nextValue = event.target.value;
          setCustomSelected(nextValue === CUSTOM_VALUE);
          onChange(nextValue === CUSTOM_VALUE ? '' : nextValue);
        }}
        disabled={disabled}
      >
        <option value="">Select a payment token</option>
        {assets.map((asset) => (
          <option key={asset.contractId ?? asset.code} value={asset.contractId ?? ''} disabled={!asset.contractId}>
            {assetLabel(asset)}
          </option>
        ))}
        <option value={CUSTOM_VALUE}>Custom SAC contract</option>
      </Select>
      {isCustom || selectValue === CUSTOM_VALUE ? (
        <Input
          id={`${id}-custom`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="C..."
          disabled={disabled}
          aria-label="Custom SAC contract address"
        />
      ) : null}
      {selectedAsset?.contractId ? (
        <FieldHelperText>
          {assetLabel(selectedAsset)} · {selectedAsset.contractId}
        </FieldHelperText>
      ) : null}
      {error || customError ? (
        <FieldHelperText style={{ color: 'var(--negative)' }}>{error || customError}</FieldHelperText>
      ) : null}
    </Stack>
  );
}
