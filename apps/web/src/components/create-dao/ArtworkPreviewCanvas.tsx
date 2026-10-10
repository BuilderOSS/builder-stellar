'use client';
import { useRef } from 'react';

import { Button } from '@/components/ui';
import { useArtworkPreview } from '@/hooks/useArtworkPreview';
import type { ArtworkProperty, ArtworkSource } from '@/stores/create-dao-store';

import styles from './workspace.module.css';

export function ArtworkPreviewCanvas({
  source,
  orderedLayers
}: {
  source: Extract<ArtworkSource, { kind: 'uploaded' }>;
  orderedLayers: ArtworkProperty[];
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const preview = useArtworkPreview({ source, orderedLayers, canvasRef: canvas });
  return (
    <div className={styles.stack} style={{ gap: 10 }}>
      <canvas
        ref={canvas}
        width={400}
        height={400}
        aria-label="Randomized layered artwork preview"
        style={{
          width: 'min(100%, 260px)',
          aspectRatio: '1',
          border: '1px solid var(--border-default)',
          borderRadius: 12
        }}
      />
      <p className={styles.muted} role="status">
        {preview.error ||
          (preview.hasErrors
            ? 'Some layer images could not be loaded. Check the directory paths.'
            : preview.isLoading
              ? `Loading preview… ${preview.loadingProgress}%`
              : 'Preview only. On-chain artwork is set by the signed batches below.')}
      </p>
      <Button type="button" size="sm" variant="outline" onClick={preview.reload} disabled={preview.isLoading}>
        Shuffle preview
      </Button>
    </div>
  );
}
