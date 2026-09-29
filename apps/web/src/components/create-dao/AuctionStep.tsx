// components/create-dao/AuctionStep.tsx

'use client';

import { useEffect } from 'react';
import { Stack } from 'styled-system/jsx';

import { DurationInput } from '@/components/admin/duration-input';
import { AuctionPaymentTokenSelect } from '@/components/auction/auction-payment-token-select';
import { AuctionReservePriceField } from '@/components/auction/auction-reserve-price-field';
import { Card, Heading, Text } from '@/components/ui';
import { getTreasuryAssets } from '@/lib/assets-config';
import { getConfiguredAuctionNetwork, validateReservePrice } from '@/lib/auction-values';
import { validateDuration } from '@/lib/validation';
import { useCreateDaoStore } from '@/stores/create-dao-store';

export function AuctionStep() {
  const auction = useCreateDaoStore((s) => s.auction);
  const updateAuction = useCreateDaoStore((s) => s.updateAuction);
  const validationErrors = useCreateDaoStore((s) => s.validationErrors);
  const setValidationError = useCreateDaoStore((s) => s.setValidationError);
  const clearValidationError = useCreateDaoStore((s) => s.clearValidationError);

  const handleDurationChange = (seconds: number) => {
    updateAuction({ duration: seconds });
    if (auction.enabled) {
      const error = validateDuration(seconds, 300); // Min 5 minutes
      if (error) {
        setValidationError('auctionDuration', error);
      } else {
        clearValidationError('auctionDuration');
      }
    }
  };

  const handleTimeBufferChange = (seconds: number) => {
    updateAuction({ timeBuffer: seconds });
    if (auction.enabled) {
      const error = validateDuration(seconds, 60); // Min 1 minute
      if (error) {
        setValidationError('timeBuffer', error);
      } else {
        clearValidationError('timeBuffer');
      }
    }
  };

  const handleReservePriceChange = (value: string) => {
    updateAuction({ reservePrice: value });
    if (auction.enabled) {
      const error = validateReservePrice(value);
      if (error) setValidationError('reservePrice', error);
      else clearValidationError('reservePrice');
    }
  };

  const handlePaymentAssetChange = (value: string) => {
    updateAuction({ paymentAsset: value });
    if (auction.enabled) {
      if (!value) setValidationError('paymentAsset', 'Payment token is required when auction is enabled');
      else clearValidationError('paymentAsset');
    }
  };

  const network = getConfiguredAuctionNetwork();
  const selectedAsset = getTreasuryAssets(network).find((asset) => asset.contractId === auction.paymentAsset);

  useEffect(() => {
    if (!auction.enabled || auction.paymentAsset) return;
    const defaultAsset = getTreasuryAssets(network).find((asset) => asset.isNative && asset.contractId);
    if (defaultAsset?.contractId) updateAuction({ paymentAsset: defaultAsset.contractId });
  }, [auction.enabled, auction.paymentAsset, network, updateAuction]);

  return (
    <Stack gap="4">
      <Card p="5">
        <Stack gap="4">
          <div>
            <Heading as="h2" style={{ fontSize: '1.25rem', marginBottom: '8px' }}>
              How will people mint?
            </Heading>
            <Text style={{ color: 'var(--gray-11)', fontSize: '0.875rem' }}>
              Timed auctions are optional and can be changed later.
            </Text>
          </div>

          <Stack gap="2">
            <Text style={{ fontWeight: 600 }}>Do you want to use timed auctions?</Text>
            <div className="auction-choice-group" role="radiogroup" aria-label="Timed auction preference">
              <label className={`auction-choice${auction.enabled ? ' is-selected' : ''}`} htmlFor="auctionEnabled">
                <input
                  type="radio"
                  id="auctionEnabled"
                  name="auctionMode"
                  checked={auction.enabled}
                  onChange={() => updateAuction({ enabled: true })}
                />
                <span>
                  <Text style={{ fontWeight: 650 }}>Yes, use timed auctions</Text>
                  <Text style={{ color: 'var(--gray-11)', fontSize: '0.8125rem' }}>Sell new NFTs through bidding.</Text>
                </span>
              </label>
              <label className={`auction-choice${!auction.enabled ? ' is-selected' : ''}`} htmlFor="auctionDisabled">
                <input
                  type="radio"
                  id="auctionDisabled"
                  name="auctionMode"
                  checked={!auction.enabled}
                  onChange={() => updateAuction({ enabled: false })}
                />
                <span>
                  <Text style={{ fontWeight: 650 }}>No, keep auctions off</Text>
                  <Text style={{ color: 'var(--gray-11)', fontSize: '0.8125rem' }}>
                    You can turn them on later if you change your mind.
                  </Text>
                </span>
              </label>
            </div>
          </Stack>

          {auction.enabled && (
            <>
              <Stack gap="2">
                <DurationInput
                  id="duration"
                  label="Auction duration"
                  value={auction.duration}
                  onChange={handleDurationChange}
                  helperText="How long each auction lasts. Minimum 5 minutes."
                />
                {validationErrors.auctionDuration && (
                  <Text style={{ color: 'var(--error-9)', fontSize: '0.875rem' }}>
                    {validationErrors.auctionDuration}
                  </Text>
                )}
              </Stack>

              <AuctionReservePriceField
                value={auction.reservePrice}
                onChange={handleReservePriceChange}
                tokenCode={selectedAsset?.code}
                error={validationErrors.reservePrice}
                id="reservePrice"
              />

              <Stack gap="2">
                <DurationInput
                  id="timeBuffer"
                  label="Time buffer"
                  value={auction.timeBuffer}
                  onChange={handleTimeBufferChange}
                  helperText="Extra time added when a bid arrives near the end. Minimum 1 minute."
                />
                {validationErrors.timeBuffer && (
                  <Text style={{ color: 'var(--error-9)', fontSize: '0.875rem' }}>{validationErrors.timeBuffer}</Text>
                )}
              </Stack>

              <AuctionPaymentTokenSelect
                network={network}
                value={auction.paymentAsset}
                onChange={handlePaymentAssetChange}
                error={validationErrors.paymentAsset}
                id="paymentAsset"
              />
            </>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}
