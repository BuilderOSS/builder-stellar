import fs from 'node:fs';
import path from 'node:path';

// Screenshots from the capture pipeline (docs plan §5.6):
//   public/shots/<id>/{desktop,mobile}-{light,dark}.webp
//   public/shots/<id>/manifest.json
// Read at build time; the site is static.

export const DEVICES = ['desktop', 'mobile'] as const;
export const THEMES = ['light', 'dark'] as const;
export type Device = (typeof DEVICES)[number];
export type Theme = (typeof THEMES)[number];

/** A marker's target, as fractions of the image (0 to 1). */
export type Box = { x: number; y: number; w: number; h: number };

export type ShotManifest = {
  id: string;
  /** The app commit the images were captured from. */
  appCommit: string;
  /** The testnet ledger at capture time. */
  ledger?: number;
  capturedAt: string;
  variants: Partial<Record<Device, { width: number; height: number; viewport: { width: number; height: number } }>>;
  markers?: Array<{
    /** The step number shown in the disc. Defaults to the marker's position, from 1. */
    n?: number;
    /** Names the target for assistive technology: "the New proposal button". */
    label: string;
    box: Partial<Record<Device, Box>>;
  }>;
};

export type ShotVariant = {
  device: Device;
  width: number;
  height: number;
  src: Record<Theme, string>;
  markers: Array<{ n: number; label: string; box: Box }>;
};

export type ResolvedShot = { id: string; manifest: ShotManifest; variants: ShotVariant[] };

export const SHOTS_DIR = path.join(process.cwd(), 'public', 'shots');
const ID_PATTERN = /^[a-z0-9_-]+(\/[a-z0-9_-]+)*$/;

export class ShotError extends Error {}

function isFraction(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

/** A box must sit inside the image. A capture that drew one outside it is a bug, so the build fails. */
export function assertBox(id: string, box: Box, device: Device) {
  const ok =
    [box.x, box.y, box.w, box.h].every(isFraction) &&
    box.w > 0 &&
    box.h > 0 &&
    box.x + box.w <= 1 &&
    box.y + box.h <= 1;
  if (!ok) throw new ShotError(`Shot ${id}: a ${device} marker box falls outside the image (${JSON.stringify(box)}).`);
}

/**
 * The variants to render for one manifest: a device appears only when both theme images
 * exist, so the frame never shows a broken image.
 */
export function resolveShot(
  id: string,
  manifest: ShotManifest,
  exists: (file: string) => boolean = (file) => fs.existsSync(path.join(SHOTS_DIR, id, file))
): ResolvedShot {
  if (manifest.id !== id) throw new ShotError(`Shot ${id}: manifest id is ${manifest.id}.`);
  const variants: ShotVariant[] = [];
  for (const device of DEVICES) {
    const meta = manifest.variants[device];
    if (!meta) continue;
    if (!THEMES.every((theme) => exists(`${device}-${theme}.webp`))) continue;
    const markers = (manifest.markers ?? []).flatMap((marker, index) => {
      const box = marker.box[device];
      if (!box) return [];
      assertBox(id, box, device);
      return [{ n: marker.n ?? index + 1, label: marker.label, box }];
    });
    variants.push({
      device,
      width: meta.width,
      height: meta.height,
      src: { light: `/shots/${id}/${device}-light.webp`, dark: `/shots/${id}/${device}-dark.webp` },
      markers
    });
  }
  return { id, manifest, variants };
}

/** Null when the shot hasn't been captured yet: the figure then says "Screenshot coming". */
export function loadShot(id: string): ResolvedShot | null {
  if (!ID_PATTERN.test(id)) throw new ShotError(`Shot id "${id}" must be lower-case path segments.`);
  const file = path.join(SHOTS_DIR, id, 'manifest.json');
  if (!fs.existsSync(file)) return null;
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8')) as ShotManifest;
  const shot = resolveShot(id, manifest);
  return shot.variants.length > 0 ? shot : null;
}
