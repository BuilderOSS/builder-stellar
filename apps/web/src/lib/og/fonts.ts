import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// Static OFL instances committed with the app (src/assets/fonts/OFL.txt), read from disk so share
// cards never fetch fonts at render time.
const FONT_DIR = join(process.cwd(), 'src/assets/fonts');

export type ShareCardFont = { name: string; data: ArrayBuffer; weight: 500 | 700; style: 'normal' };

let loading: Promise<ShareCardFont[]> | null = null;

async function load(file: string, name: string, weight: 500 | 700): Promise<ShareCardFont> {
  const buffer = await readFile(join(FONT_DIR, file));
  const data = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  return { name, data, weight, style: 'normal' };
}

/** Bricolage Grotesque 700 for titles, Figtree 500 and 700 for everything else. */
export function shareCardFonts(): Promise<ShareCardFont[]> {
  loading ??= Promise.all([
    load('BricolageGrotesque-Bold.ttf', 'Bricolage Grotesque', 700),
    load('Figtree-Medium.ttf', 'Figtree', 500),
    load('Figtree-Bold.ttf', 'Figtree', 700)
  ]).catch((error) => {
    // A card in the fallback face beats no card; try again on the next request.
    console.error('Share card fonts unavailable', error);
    loading = null;
    return [];
  });
  return loading;
}
