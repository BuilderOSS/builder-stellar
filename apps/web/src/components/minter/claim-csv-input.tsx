'use client';

import { FileText, Upload } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { css } from 'styled-system/css';

import { Button, FieldHelperText, FieldLabel, Textarea } from '@/components/ui';
import { readWalletCsv, SampleCsvLink, WALLET_CSV_ACCEPT } from '@/components/wallet-csv-import';

export type ClaimListSource = { kind: 'file'; name: string } | { kind: 'paste' };

const drop = css({
  display: 'grid',
  justifyItems: 'center',
  gap: '2',
  p: '6',
  borderRadius: 'control',
  borderWidth: '1px',
  borderStyle: 'dashed',
  borderColor: 'rule',
  bg: 'hover',
  textAlign: 'center',
  transitionProperty: 'border-color, background-color',
  transitionDuration: '150ms',
  transitionTimingFunction: 'ease',
  '&[data-dragging]': { borderColor: 'signal', bg: 'signal.wash' },
  '& svg': { width: '5', height: '5', color: 'ink.muted' },
  '& p': { m: '0' }
});
const dropTitle = css({ textStyle: 'label', color: 'ink' });
const file = css({
  display: 'flex',
  alignItems: 'center',
  gap: '3',
  p: '3',
  borderRadius: 'control',
  bg: 'hover',
  minW: '0',
  '& > svg': { width: '5', height: '5', color: 'ink.muted', flexShrink: '0' }
});
const fileName = css({
  textStyle: 'label',
  color: 'ink',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
});
const links = css({ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1', mt: '1' });

/**
 * Who can claim: a CSV dropped or chosen, or addresses pasted. Hands back the text and where it
 * came from; parsing and checking happen in the preview, so every source gets the same checks.
 */
export function ClaimCsvInput({
  text,
  source,
  rows,
  disabled,
  onChange
}: {
  text: string;
  source: ClaimListSource | null;
  /** Rows read from the current source, for the file summary. */
  rows: number;
  disabled: boolean;
  onChange: (text: string, source: ClaimListSource | null) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');

  async function read(picked: File | undefined) {
    setError('');
    if (!picked) return;
    try {
      onChange(await readWalletCsv(picked), { kind: 'file', name: picked.name });
    } catch (failure) {
      setError((failure as Error).message);
    }
  }

  const sample = <SampleCsvLink />;
  const picker = (
    <input
      ref={input}
      id={`${id}-file`}
      type="file"
      accept={WALLET_CSV_ACCEPT}
      hidden
      disabled={disabled}
      onChange={(event) => {
        void read(event.target.files?.[0]);
        event.target.value = '';
      }}
    />
  );

  return (
    <div className={css({ display: 'grid', gap: '2' })}>
      <FieldLabel htmlFor={source?.kind === 'paste' ? `${id}-paste` : `${id}-file`}>Who can claim</FieldLabel>
      {picker}
      {source?.kind === 'paste' ? (
        <>
          <Textarea
            id={`${id}-paste`}
            className={css({ textStyle: 'mono', fontSize: '0.8125rem' })}
            rows={8}
            value={text}
            disabled={disabled}
            placeholder={'address,amount\nGABC…,5\nGDEF…,2'}
            onChange={(event) => onChange(event.target.value, source)}
          />
          <FieldHelperText>One wallet per line: its address, then how many tokens it can claim.</FieldHelperText>
          <div className={links}>
            <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onChange('', null)}>
              <Upload aria-hidden="true" />
              Upload a CSV instead
            </Button>
            {sample}
          </div>
        </>
      ) : source?.kind === 'file' ? (
        <div className={file}>
          <FileText aria-hidden="true" />
          <div className={css({ minW: '0', flex: '1' })}>
            <p className={fileName} title={source.name}>
              {source.name}
            </p>
            <FieldHelperText>
              {rows.toLocaleString()} {rows === 1 ? 'row' : 'rows'} read
            </FieldHelperText>
          </div>
          <Button variant="ghost" size="sm" disabled={disabled} onClick={() => input.current?.click()}>
            Replace
          </Button>
          <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onChange('', null)}>
            Remove
          </Button>
        </div>
      ) : (
        <>
          <div
            className={drop}
            data-dragging={dragging ? '' : undefined}
            onDragOver={(event) => {
              event.preventDefault();
              if (!disabled) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              if (!disabled) void read(event.dataTransfer.files[0]);
            }}
          >
            <Upload aria-hidden="true" />
            <p className={dropTitle}>Drop a CSV here</p>
            <p className={css({ textStyle: 'caption', color: 'ink.muted' })}>
              Two columns: address and amount. A header row and extra columns, like a name, are fine.
            </p>
            <Button variant="secondary" size="sm" disabled={disabled} onClick={() => input.current?.click()}>
              Choose a file
            </Button>
          </div>
          <div className={links}>
            {sample}
            <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onChange('', { kind: 'paste' })}>
              Paste addresses instead
            </Button>
          </div>
        </>
      )}
      {error ? (
        <p role="alert" className={css({ textStyle: 'caption', color: 'danger', m: '0', fontWeight: '600' })}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
