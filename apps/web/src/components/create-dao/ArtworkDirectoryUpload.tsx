'use client';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui';
import { cidToUrls, UPLOAD_POLICIES, validateImageDimensions } from '@/lib/pinata-upload';
import { useAuthSessionStore } from '@/stores/auth-session-store';

import type { ArtworkPlan } from './artwork-configuration';
import { inspectArtworkDirectory } from './artwork-configuration';
import { uploadResponseJson } from './dao-image-upload';
import styles from './workspace-styles';

export function ArtworkDirectoryUpload({
  onComplete,
  disabled
}: {
  onComplete: (plan: ArtworkPlan) => void;
  disabled: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const wallet = useAuthSessionStore((s) => s.address);
  const auth = useAuthSessionStore((s) => s.authStatus);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    input.current?.setAttribute('webkitdirectory', '');
  }, []);
  const upload = async () => {
    if (busy || disabled || !wallet || auth !== 'authenticated') return;
    setBusy(true);
    setError('');
    try {
      const inspected = inspectArtworkDirectory(files);
      for (const file of files) {
        const bitmap = await createImageBitmap(file);
        try {
          const dimensions = validateImageDimensions(bitmap.width, bitmap.height, UPLOAD_POLICIES['artwork-directory']);
          if (!dimensions.valid) throw new Error(`${file.name}: ${dimensions.error}`);
        } finally {
          bitmap.close();
        }
      }
      const authorization = await uploadResponseJson(
        await fetch('/api/pinata/generate-jwt', { method: 'POST', signal: AbortSignal.timeout(30_000) })
      );
      if (typeof authorization.jwt !== 'string') throw new Error('Upload authorization is unavailable');
      const form = new FormData();
      files.forEach((file, index) => form.append('file', file, `artwork/${inspected.paths[index]}`));
      form.append('pinataMetadata', JSON.stringify({ name: 'DAO artwork' }));
      const uploaded = await uploadResponseJson(
        await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
          method: 'POST',
          headers: { Authorization: `Bearer ${authorization.jwt}` },
          body: form,
          signal: AbortSignal.timeout(120_000)
        })
      );
      if (typeof uploaded.IpfsHash !== 'string') throw new Error('Directory upload did not return a CID');
      const pinned = await uploadResponseJson(
        await fetch('/api/pinata/pin-cid', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cid: uploaded.IpfsHash, name: 'DAO artwork' }),
          signal: AbortSignal.timeout(30_000)
        })
      );
      if (pinned.success !== true) throw new Error('Directory pin could not be verified');
      if (useAuthSessionStore.getState().address !== wallet) throw new Error('Wallet changed during upload');
      onComplete({
        baseUri: `${cidToUrls(uploaded.IpfsHash).ipfsUri}/`,
        extension: inspected.extension,
        properties: inspected.properties,
        confirmedBatches: 0
      });
      setFiles([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={styles.stack}>
      <label htmlFor="artwork-directory" className={styles.label}>
        Artwork directory
      </label>
      <input
        ref={input}
        id="artwork-directory"
        type="file"
        multiple
        disabled={disabled || busy}
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          const selected = Array.from(e.target.files ?? []);
          try {
            inspectArtworkDirectory(selected);
            setFiles(selected);
            setError('');
          } catch (err) {
            setError((err as Error).message);
            setFiles([]);
          }
        }}
      />
      <p className={styles.muted}>collection/layer/item.png · Same extension · Up to 16 layers and 1,000 files</p>
      <Button
        type="button"
        variant="outline"
        disabled={disabled || busy || !files.length || !wallet || auth !== 'authenticated'}
        onClick={() => void upload()}
      >
        {busy ? 'Uploading directory…' : `Upload ${files.length || ''} artwork files`}
      </Button>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
