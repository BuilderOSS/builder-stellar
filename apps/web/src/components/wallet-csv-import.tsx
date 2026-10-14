'use client';

import { Download, Upload } from 'lucide-react';
import { useRef } from 'react';
import { css } from 'styled-system/css';

import { Button } from '@/components/ui';
import { MAX_WALLET_CSV_BYTES, SAMPLE_WALLET_CSV_URL } from '@/lib/wallet-csv';

export const WALLET_CSV_ACCEPT = '.csv,.tsv,.txt,text/csv,text/plain';

/** A dropped or chosen wallet CSV as text, or a reason it can't be one. */
export async function readWalletCsv(file: File): Promise<string> {
  if (!/\.(csv|tsv|txt)$/i.test(file.name) && !file.type.startsWith('text/'))
    throw new Error('Choose a .csv file. Spreadsheets can save one with File → Download → CSV.');
  if (file.size > MAX_WALLET_CSV_BYTES) throw new Error('That file is too big for a wallet list (2 MB at most).');
  return file.text();
}

const sampleLink = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '1.5',
  textStyle: 'label',
  color: 'signal',
  px: '2',
  minH: '9',
  borderRadius: 'control',
  textDecoration: 'none',
  '& svg': { width: '4', height: '4' },
  '@media (hover: hover) and (pointer: fine)': { _hover: { bg: 'hover' } },
  _focusVisible: { outline: '2px solid', outlineColor: 'signal', outlineOffset: '2px' }
});

/** The example CSV: a header row, an address and an amount per row, and a note column to show extras are fine. */
export function SampleCsvLink() {
  return (
    <a href={SAMPLE_WALLET_CSV_URL} download="wallets-sample.csv" className={sampleLink}>
      <Download aria-hidden="true" />
      Download a sample
    </a>
  );
}

/** A button that picks a wallet CSV and hands back its text and name. */
export function CsvFileButton({
  children,
  disabled,
  onRead,
  onError
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onRead: (text: string, name: string) => void;
  onError: (message: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={WALLET_CSV_ACCEPT}
        hidden
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          readWalletCsv(file).then(
            (text) => onRead(text, file.name),
            (error: Error) => onError(error.message)
          );
        }}
      />
      <Button variant="ghost" size="sm" disabled={disabled} onClick={() => input.current?.click()}>
        <Upload aria-hidden="true" />
        {children}
      </Button>
    </>
  );
}
