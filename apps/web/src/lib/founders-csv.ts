import Papa from 'papaparse';

import type { FounderAllocation } from '@/stores/create-dao-store';

import { getStellarAddressError, isValidStellarAddress } from './validation';

export const MAX_FOUNDERS = 100;
export const MAX_FOUNDER_ALLOCATION = 10_000;

type FounderCsvRow = {
  address?: string;
  amount?: string;
  [key: string]: string | undefined;
};

function formatRowErrors(errors: string[]) {
  return `${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n...and ${errors.length - 5} more errors` : ''}`;
}

export function parseFoundersCsv(file: File): Promise<FounderAllocation[]> {
  return new Promise((resolve, reject) => {
    if (file.type !== 'text/csv' && !file.name.toLowerCase().endsWith('.csv')) {
      reject(new Error('Please choose a CSV file.'));
      return;
    }

    if (file.size > 1024 * 1024) {
      reject(new Error('CSV files must be smaller than 1 MB.'));
      return;
    }

    Papa.parse<FounderCsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim().toLowerCase(),
      complete: (results) => {
        if (results.errors.length > 0) {
          reject(new Error(`Could not read this CSV: ${results.errors[0].message}`));
          return;
        }

        const fields = (results.meta.fields ?? []).map((field) => field.trim().toLowerCase());
        const missingHeaders = ['address', 'amount'].filter((header) => !fields.includes(header));
        if (missingHeaders.length > 0) {
          reject(new Error(`Missing required columns: ${missingHeaders.join(', ')}.`));
          return;
        }

        if (results.data.length === 0) {
          reject(new Error('This CSV does not contain any founder rows.'));
          return;
        }

        if (results.data.length > MAX_FOUNDERS) {
          reject(new Error(`You can import up to ${MAX_FOUNDERS} founders at a time.`));
          return;
        }

        const errors: string[] = [];
        const seen = new Set<string>();
        const founders: FounderAllocation[] = [];

        results.data.forEach((row, index) => {
          const rowNumber = index + 2;
          const address = row.address?.trim() ?? '';
          const amountText = row.amount?.trim() ?? '';

          if (!address) {
            errors.push(`Row ${rowNumber}: Address is required.`);
            return;
          }

          const addressKey = address.toLowerCase();
          if (seen.has(addressKey)) {
            errors.push(`Row ${rowNumber}: This founder address is duplicated.`);
            return;
          }
          seen.add(addressKey);

          const addressError = getStellarAddressError(address);
          if (!isValidStellarAddress(address)) {
            errors.push(`Row ${rowNumber}: ${addressError ?? 'Enter a valid Stellar address.'}`);
            return;
          }

          if (!/^\d+$/.test(amountText)) {
            errors.push(`Row ${rowNumber}: Allocation must be a positive whole number.`);
            return;
          }

          const amount = Number(amountText);
          if (!Number.isSafeInteger(amount) || amount <= 0) {
            errors.push(`Row ${rowNumber}: Allocation must be a positive whole number.`);
            return;
          }

          if (amount > MAX_FOUNDER_ALLOCATION) {
            errors.push(
              `Row ${rowNumber}: Allocation cannot exceed ${MAX_FOUNDER_ALLOCATION.toLocaleString()} tokens.`
            );
            return;
          }

          founders.push({ address, amount });
        });

        const total = founders.reduce((sum, founder) => sum + founder.amount, 0);
        if (total > MAX_FOUNDER_ALLOCATION) {
          errors.push(`Total allocation cannot exceed ${MAX_FOUNDER_ALLOCATION.toLocaleString()} tokens.`);
        }

        if (errors.length > 0) {
          reject(new Error(formatRowErrors(errors)));
          return;
        }

        resolve(founders);
      },
      error: (error) => reject(new Error(`Could not read this CSV: ${error.message}`))
    });
  });
}
