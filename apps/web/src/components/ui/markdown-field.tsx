'use client';

import { Bold, ImagePlus, Italic, Link2, List, Quote } from 'lucide-react';
import { type ClipboardEvent, type DragEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { css, cx } from 'styled-system/css';

import {
  dropPlaceholder,
  imageMarkdown,
  insertBlock,
  insertLink,
  type MarkdownEdit,
  prefixLines,
  resolvePlaceholder,
  uploadPlaceholder,
  wrapSelection
} from '@/lib/markdown-edit';
import { validateFileSize, validateMimeType } from '@/lib/pinata-upload';
import { uploadImage } from '@/lib/upload-image';

import { IconButton } from './button';
import { FieldHelperText } from './field';
import { Markdown, type MarkdownVariant } from './markdown';
import { SegmentedControl } from './segmented-control';
import { Textarea } from './textarea';

const bar = css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '2', flexWrap: 'wrap' });
const tools = css({ display: 'flex', alignItems: 'center', gap: '0.5' });
const textarea = css({ fontFamily: 'body', minH: '32', resize: 'vertical' });
const preview = css({
  minH: '32',
  px: '3.5',
  py: '3',
  borderWidth: '1px',
  borderColor: 'rule',
  borderRadius: 'control',
  bg: 'raised'
});
const empty = css({ textStyle: 'body', color: 'ink.muted', m: '0' });
const dropping = css({ outline: '2px dashed', outlineColor: 'signal', outlineOffset: '2px' });

type Upload = (file: File) => Promise<string>;

/**
 * A plain textarea that writes markdown: a small toolbar, ⌘B / ⌘I / ⌘K, Write and Preview, and,
 * for rich text, images that upload to IPFS when dropped, pasted or picked. Images are stored as
 * `ipfs://` links so they never depend on one gateway.
 */
export function MarkdownField({
  id,
  value,
  onChange,
  variant = 'rich',
  rows = 7,
  placeholder,
  disabled,
  invalid,
  describedBy,
  images = variant === 'rich',
  canUpload = false,
  upload = async (file) => (await uploadImage(file, 'markdown-image')).ipfsUri
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  variant?: MarkdownVariant;
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  /** Offer image upload (rich text only by default). */
  images?: boolean;
  /** Uploading needs a signed-in wallet session. */
  canUpload?: boolean;
  /** Injected for tests; resolves to the image's `ipfs://` URI. */
  upload?: Upload;
}) {
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const [uploadError, setUploadError] = useState('');
  const [uploading, setUploading] = useState(0);
  const [dragging, setDragging] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  // Uploads finish after later typing, so placeholder swaps read the latest text, not a stale copy.
  // It follows the prop after each render and every change made here, so a fast upload never misses its placeholder.
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);
  function change(next: string) {
    latest.current = next;
    onChange(next);
  }

  function apply(edit: MarkdownEdit) {
    change(edit.value);
    requestAnimationFrame(() => {
      area.current?.focus();
      area.current?.setSelectionRange(edit.start, edit.end);
    });
  }
  function selection() {
    const el = area.current;
    return { start: el?.selectionStart ?? value.length, end: el?.selectionEnd ?? value.length };
  }
  const bold = () => apply(wrapSelection(value, selection().start, selection().end, '**'));
  const italic = () => apply(wrapSelection(value, selection().start, selection().end, '_'));
  const link = () => apply(insertLink(value, selection().start, selection().end));
  const list = () => apply(prefixLines(value, selection().start, selection().end, '- '));
  const quote = () => apply(prefixLines(value, selection().start, selection().end, '> '));

  async function addImages(files: File[]) {
    const pictures = files.filter((file) => file.type.startsWith('image/'));
    if (!pictures.length) return;
    setUploadError('');
    if (!canUpload) {
      setUploadError('Sign in with your wallet to add images.');
      return;
    }
    for (const file of pictures) {
      const type = validateMimeType(file.type, 'markdown-image');
      const size = validateFileSize(file.size, 'markdown-image');
      if (!type.valid || !size.valid) {
        setUploadError(type.error || size.error || 'This image can’t be added.');
        continue;
      }
      const marker = uploadPlaceholder(file.name, crypto.randomUUID().slice(0, 8));
      apply(insertBlock(latest.current, selection().end, marker));
      setUploading((count) => count + 1);
      try {
        const uri = await upload(file);
        change(resolvePlaceholder(latest.current, marker, imageMarkdown(file.name, uri)));
      } catch (error) {
        change(dropPlaceholder(latest.current, marker));
        setUploadError(
          error instanceof Error ? `Couldn’t upload ${file.name}: ${error.message}` : 'Image upload failed.'
        );
      } finally {
        setUploading((count) => count - 1);
      }
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
    const key = event.key.toLowerCase();
    if (key === 'b') bold();
    else if (key === 'i') italic();
    else if (key === 'k') link();
    else return;
    event.preventDefault();
  }
  function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (!images) return;
    const files = Array.from(event.clipboardData.files);
    if (files.some((file) => file.type.startsWith('image/'))) {
      event.preventDefault();
      void addImages(files);
    }
  }
  function onDrop(event: DragEvent<HTMLTextAreaElement>) {
    setDragging(false);
    if (!images || !event.dataTransfer.files.length) return;
    event.preventDefault();
    void addImages(Array.from(event.dataTransfer.files));
  }

  const busy = disabled || mode === 'preview';
  return (
    <div className={css({ display: 'grid', gap: '2' })}>
      <div className={bar}>
        <div className={tools} role="toolbar" aria-label="Formatting" aria-controls={id}>
          <IconButton label="Bold (⌘B)" size="sm" disabled={busy} onClick={bold}>
            <Bold aria-hidden="true" />
          </IconButton>
          <IconButton label="Italic (⌘I)" size="sm" disabled={busy} onClick={italic}>
            <Italic aria-hidden="true" />
          </IconButton>
          <IconButton label="Link (⌘K)" size="sm" disabled={busy} onClick={link}>
            <Link2 aria-hidden="true" />
          </IconButton>
          <IconButton label="List" size="sm" disabled={busy} onClick={list}>
            <List aria-hidden="true" />
          </IconButton>
          <IconButton label="Quote" size="sm" disabled={busy} onClick={quote}>
            <Quote aria-hidden="true" />
          </IconButton>
          {images ? (
            <IconButton
              label={canUpload ? 'Add an image' : 'Sign in to add images'}
              size="sm"
              disabled={busy || !canUpload}
              loading={uploading > 0}
              onClick={() => picker.current?.click()}
            >
              <ImagePlus aria-hidden="true" />
            </IconButton>
          ) : null}
        </div>
        <SegmentedControl
          id={`${id}-mode`}
          label="Write or preview"
          value={mode}
          onValueChange={(next) => setMode(next === 'preview' ? 'preview' : 'write')}
          options={[
            { value: 'write', label: 'Write' },
            { value: 'preview', label: 'Preview' }
          ]}
        />
      </div>

      {mode === 'write' ? (
        <Textarea
          ref={area}
          id={id}
          rows={rows}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={cx(textarea, dragging && dropping)}
          onChange={(event) => change(event.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onDragOver={(event) => {
            if (!images || !Array.from(event.dataTransfer.types).includes('Files')) return;
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        />
      ) : (
        <div className={preview} aria-label="Preview">
          {value.trim() ? (
            <Markdown source={value} variant={variant} />
          ) : (
            <p className={empty}>Nothing to preview yet.</p>
          )}
        </div>
      )}

      {images ? (
        <input
          ref={picker}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          hidden
          onChange={(event) => {
            void addImages(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />
      ) : null}
      {uploadError ? <FieldHelperText tone="error">{uploadError}</FieldHelperText> : null}
      <FieldHelperText>
        {images
          ? 'Markdown works: **bold**, _italic_, lists, links. Drop or paste images.'
          : 'Markdown works: **bold**, _italic_, lists, links.'}
      </FieldHelperText>
    </div>
  );
}
