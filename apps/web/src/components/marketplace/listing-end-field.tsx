'use client';

import { Field, FieldHelperText, FieldLabel, Input, SegmentedControl } from '@/components/ui';
import {
  formatListingEnd,
  LISTING_END_PRESETS,
  type ListingEndPreset,
  listingEndSeconds
} from '@/lib/marketplace/sell';

/** When a listing ends: 1, 7 or 30 days from now, or a custom local date and time. */
export function ListingEndField({
  id,
  preset,
  custom,
  disabled,
  onPresetChange,
  onCustomChange
}: {
  id: string;
  preset: ListingEndPreset;
  custom: string;
  disabled?: boolean;
  onPresetChange: (preset: ListingEndPreset) => void;
  onCustomChange: (value: string) => void;
}) {
  const end = listingEndSeconds(preset, custom);
  const endText = end === null ? null : formatListingEnd(end);
  return (
    <Field>
      <FieldLabel id={`${id}-label`}>Listing ends</FieldLabel>
      <SegmentedControl
        id={`${id}-preset`}
        label="Listing ends"
        value={preset}
        disabled={disabled}
        onValueChange={(value) => onPresetChange(value as ListingEndPreset)}
        options={LISTING_END_PRESETS}
      />
      {preset === 'custom' ? (
        <Input
          id={id}
          type="datetime-local"
          aria-label="Custom end, in your time"
          value={custom}
          disabled={disabled}
          onChange={(e) => onCustomChange(e.target.value)}
        />
      ) : null}
      <FieldHelperText>
        {endText ? `Ends ${endText}, your time.` : 'Choose a date and time in the future, in your time.'}
      </FieldHelperText>
    </Field>
  );
}
