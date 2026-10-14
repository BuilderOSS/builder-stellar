import { duskTile } from '@/lib/brand-tile';

// Dusk tile icons for the web app manifest (app/manifest.ts). Maskable icons stay square:
// the platform cuts its own shape, and the glyph sits well inside the safe zone.
const ICONS: Record<string, { size: number; rounded: boolean }> = {
  'icon-192.png': { size: 192, rounded: true },
  'icon-512.png': { size: 512, rounded: true },
  'maskable-512.png': { size: 512, rounded: false }
};

export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(ICONS).map((icon) => ({ icon }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ icon: string }> }) {
  const icon = ICONS[(await params).icon];
  if (!icon) return new Response('Not found', { status: 404 });
  return duskTile(icon.size, { rounded: icon.rounded });
}
