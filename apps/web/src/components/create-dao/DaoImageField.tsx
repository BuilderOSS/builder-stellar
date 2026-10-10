'use client';
import { useRef, useState } from 'react';

import { Button } from '@/components/ui';
import { useAuthSessionStore } from '@/stores/auth-session-store';
import { DEFAULT_DAO_IMAGE_URL, LOCAL_DEFAULT_DAO_IMAGE_URL, useCreateDaoStore } from '@/stores/create-dao-store';

import { prepareDaoImage, uploadDaoImage } from './dao-image-upload';
import styles from './workspace-styles';

export function DaoImageField() {
  const input = useRef<HTMLInputElement>(null);
  const selection = useRef(0);
  const preview = useCreateDaoStore((s) => s.imagePreview);
  const image = useCreateDaoStore((s) => s.basicInfo.contractImage);
  const fieldError = useCreateDaoStore((s) => s.validationErrors.contractImage);
  const address = useAuthSessionStore((s) => s.address);
  const auth = useAuthSessionStore((s) => s.authStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const select = async (file: File) => {
    setError('');
    const id = useCreateDaoStore.getState().activeDraftId;
    const selected = ++selection.current;
    try {
      const image = await prepareDaoImage(file);
      if (useCreateDaoStore.getState().activeDraftId === id && selected === selection.current)
        useCreateDaoStore.getState().setImagePreview(image.preview, image.filename);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read this image');
    }
  };
  const upload = async () => {
    if (busy || !preview || !address || auth !== 'authenticated') return;
    setBusy(true);
    setError('');
    const store = useCreateDaoStore.getState();
    const id = store.activeDraftId;
    try {
      const blob = await (await fetch(preview)).blob();
      const file = new File([blob], store.imageFilename || 'dao-image.png', { type: blob.type });
      const gatewayUrl = await uploadDaoImage(file);
      if (
        useCreateDaoStore.getState().activeDraftId !== id ||
        useAuthSessionStore.getState().address !== address ||
        useCreateDaoStore.getState().imagePreview !== preview
      )
        throw new Error('Workspace changed. Return to the original draft to upload again.');
      store.updateBasicInfo({ contractImage: gatewayUrl });
      store.setImagePreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed. Your preview is still saved locally.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={styles.stack}>
      <button
        id="contractImage"
        type="button"
        className={styles.image}
        aria-label="Choose DAO image"
        data-invalid={Boolean(fieldError)}
        aria-describedby={fieldError ? 'contractImage-error' : undefined}
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        {/* Data previews and gateway URLs are deliberately not passed through the Next image optimizer. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={preview || (image === DEFAULT_DAO_IMAGE_URL ? LOCAL_DEFAULT_DAO_IMAGE_URL : image)}
          alt="DAO image preview"
          onError={(event) => {
            if (!event.currentTarget.src.endsWith(LOCAL_DEFAULT_DAO_IMAGE_URL))
              event.currentTarget.src = LOCAL_DEFAULT_DAO_IMAGE_URL;
          }}
        />
        <span>{preview ? 'Local preview' : 'Change image'}</span>
      </button>
      <input
        ref={input}
        type="file"
        hidden
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          if (e.target.files?.[0]) void select(e.target.files[0]);
          e.target.value = '';
        }}
      />
      {preview ? (
        <>
          <Button
            size="sm"
            type="button"
            variant="outline"
            disabled={busy || !address || auth !== 'authenticated'}
            onClick={() => void upload()}
          >
            {busy ? 'Uploading…' : 'Upload image'}
          </Button>
          <Button
            size="sm"
            type="button"
            variant="plain"
            disabled={busy}
            onClick={() => useCreateDaoStore.getState().setImagePreview(null)}
          >
            Use saved image
          </Button>
          {!address || auth !== 'authenticated' ? <p className={styles.muted}>Connect and sign in to upload.</p> : null}
        </>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {fieldError ? (
        <p className={styles.error} id="contractImage-error">
          {fieldError}
        </p>
      ) : null}
      {image !== DEFAULT_DAO_IMAGE_URL ? (
        <Button
          type="button"
          size="sm"
          variant="plain"
          disabled={busy}
          onClick={() => {
            useCreateDaoStore.getState().updateBasicInfo({ contractImage: DEFAULT_DAO_IMAGE_URL });
            useCreateDaoStore.getState().setImagePreview(null);
          }}
        >
          Reset image
        </Button>
      ) : null}
    </div>
  );
}
