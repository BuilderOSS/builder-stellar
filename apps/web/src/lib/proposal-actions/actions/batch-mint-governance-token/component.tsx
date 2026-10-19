'use client';

import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { HStack, Stack } from 'styled-system/jsx';

import { Button, FieldHelperText, FieldLabel, HelpTip, IconButton, Input } from '@/components/ui';
import { CsvFileButton, SampleCsvLink } from '@/components/wallet-csv-import';
import { MAX_BATCH_MINT, MAX_BATCH_RECIPIENTS } from '@/lib/batch-mint-budget';
import { parseWalletCsv } from '@/lib/wallet-csv';

import type { ActionFormProps } from '../../types';
import { batchMintEntries, type BatchMintGovernanceTokenData, type MintAllocation } from './types';

export function BatchMintGovernanceTokenForm({
  value,
  onChange,
  disabled,
  validationErrors
}: ActionFormProps<BatchMintGovernanceTokenData>) {
  const [importError, setImportError] = useState('');
  const entries = batchMintEntries(value);
  const errors = validationErrors && !validationErrors.valid ? (validationErrors.fields ?? {}) : {};
  const fieldError = (index: number, name: string) =>
    errors[`${value.allocations?.length ? `allocations.${index}.` : ''}${name}`];
  function change(rows: MintAllocation[]) {
    onChange({
      recipient: rows[0]?.recipient ?? '',
      amount: rows[0]?.amount ?? '1',
      ...(rows.length > 1 ? { allocations: rows } : {})
    });
  }
  return (
    <Stack gap="3">
      <div>
        <FieldLabel>
          Recipients{' '}
          <HelpTip label="Mint limits">
            Each transaction has a contract event limit. It fits up to {MAX_BATCH_MINT} tokens to one recipient, or{' '}
            {MAX_BATCH_RECIPIENTS} recipients with one token each. Adding recipients reduces the token total that fits.
          </HelpTip>
        </FieldLabel>
      </div>
      {entries.map((entry, index) => (
        <Stack key={index} gap="2">
          <HStack justifyContent="space-between" gap="2">
            <FieldLabel htmlFor={`mint-recipient-${index}`}>Recipient {index + 1}</FieldLabel>
            {entries.length > 1 ? (
              <IconButton
                type="button"
                size="sm"
                flexShrink="0"
                label={`Remove recipient ${index + 1}`}
                disabled={disabled}
                onClick={() => change(entries.filter((_, i) => i !== index))}
              >
                <X aria-hidden="true" />
              </IconButton>
            ) : null}
          </HStack>
          <Input
            id={`mint-recipient-${index}`}
            value={entry.recipient}
            aria-invalid={Boolean(fieldError(index, 'recipient')) || undefined}
            aria-describedby={fieldError(index, 'recipient') ? `mint-recipient-error-${index}` : undefined}
            disabled={disabled}
            placeholder="G… or C…"
            onChange={(event) =>
              change(entries.map((row, i) => (i === index ? { ...row, recipient: event.target.value } : row)))
            }
          />
          {fieldError(index, 'recipient') ? (
            <FieldHelperText tone="error" id={`mint-recipient-error-${index}`}>
              {fieldError(index, 'recipient')}
            </FieldHelperText>
          ) : null}
          <FieldLabel htmlFor={`mint-amount-${index}`}>Tokens</FieldLabel>
          <Input
            id={`mint-amount-${index}`}
            type="number"
            min="1"
            max={MAX_BATCH_MINT}
            step="1"
            value={entry.amount}
            aria-invalid={Boolean(fieldError(index, 'amount')) || undefined}
            aria-describedby={fieldError(index, 'amount') ? `mint-amount-error-${index}` : undefined}
            disabled={disabled}
            onChange={(event) =>
              change(entries.map((row, i) => (i === index ? { ...row, amount: event.target.value } : row)))
            }
          />
          {fieldError(index, 'amount') ? (
            <FieldHelperText tone="error" id={`mint-amount-error-${index}`}>
              {fieldError(index, 'amount')}
            </FieldHelperText>
          ) : null}
        </Stack>
      ))}
      {validationErrors && !validationErrors.valid ? (
        <FieldHelperText tone="error">{validationErrors.message}</FieldHelperText>
      ) : null}
      <div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled || entries.length >= MAX_BATCH_RECIPIENTS}
          onClick={() => change([...entries, { recipient: '', amount: '1' }])}
        >
          <Plus aria-hidden="true" />
          Add recipient
        </Button>
        <CsvFileButton
          disabled={disabled}
          onError={setImportError}
          onRead={(text) => {
            const parsed = parseWalletCsv(text);
            if (parsed.problems.length || !parsed.rows.length || parsed.rows.length > MAX_BATCH_RECIPIENTS) {
              setImportError(parsed.problems[0]?.message ?? `Choose 1 to ${MAX_BATCH_RECIPIENTS} recipient rows.`);
              return;
            }
            setImportError('');
            change(parsed.rows.map((row) => ({ recipient: row.address, amount: row.amount })));
          }}
        >
          Upload CSV
        </CsvFileButton>
        <SampleCsvLink />
      </div>
      {importError ? <FieldHelperText tone="error">{importError}</FieldHelperText> : null}
    </Stack>
  );
}
