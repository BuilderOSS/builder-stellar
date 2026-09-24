'use client';

import { Download, Upload } from 'lucide-react';
import { useRef, useState } from 'react';

import { Button, Text } from '@/components/ui';
import { MAX_FOUNDERS, parseFoundersCsv } from '@/lib/founders-csv';
import type { FounderAllocation } from '@/stores/create-dao-store';

const TEMPLATE =
  'address,amount\nGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA,10\nGBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB,25\n';

export function FounderCsvUpload({ onParsed }: { onParsed: (founders: FounderAllocation[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');

  const handleFile = async (file?: File) => {
    if (!file) return;
    setError('');
    setIsProcessing(true);

    try {
      const founders = await parseFoundersCsv(file);
      onParsed(founders);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not process this CSV.');
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'founders-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="founder-csv-upload">
      <div className="founder-csv-upload__heading">
        <div>
          <Text style={{ fontWeight: 650 }}>Import a founder list</Text>
          <Text style={{ color: 'var(--gray-11)', fontSize: '0.875rem' }}>
            Add multiple initial founders at once. Importing a file replaces the list below.
          </Text>
        </div>
        <Button type="button" variant="outline" onClick={downloadTemplate} disabled={isProcessing}>
          <Download size={15} />
          Template
        </Button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={(event) => {
          void handleFile(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      <div
        className={`founder-csv-upload__dropzone${isDragging ? ' is-dragging' : ''}${isProcessing ? ' is-processing' : ''}`}
        role="button"
        tabIndex={isProcessing ? -1 : 0}
        aria-disabled={isProcessing}
        onClick={() => {
          if (!isProcessing) inputRef.current?.click();
        }}
        onKeyDown={(event) => {
          if (!isProcessing && (event.key === 'Enter' || event.key === ' ')) inputRef.current?.click();
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!isProcessing) setIsDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          event.preventDefault();
          setIsDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          void handleFile(event.dataTransfer.files[0]);
        }}
      >
        <Upload size={20} aria-hidden="true" />
        <div>
          <Text style={{ fontWeight: 650 }}>
            {isProcessing ? 'Checking founder list...' : isDragging ? 'Drop CSV to import' : 'Drop a CSV or browse'}
          </Text>
          <Text style={{ color: 'var(--gray-11)', fontSize: '0.8rem' }}>
            Required columns: address, amount. Up to {MAX_FOUNDERS} founders.
          </Text>
        </div>
      </div>

      {error && (
        <Text className="founder-csv-upload__error" role="alert">
          {error}
        </Text>
      )}
    </div>
  );
}
