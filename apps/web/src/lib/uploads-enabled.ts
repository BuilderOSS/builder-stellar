/**
 * IPFS uploads (Pinata) are switched on for this deployment. NEXT_PUBLIC_, so the browser and the
 * server read the same build-time value. Every upload route checks it, the directory routes too
 * (BUG-W03-4: they skipped it, so the switch didn't cover artwork folders).
 */
export function uploadsEnabled() {
  return process.env.NEXT_PUBLIC_PINATA_UPLOADS_ENABLED === 'true';
}

/** What the upload buttons say while uploads are off. */
export const UPLOADS_OFF_NOTE = 'Uploads are off on this deployment.';
