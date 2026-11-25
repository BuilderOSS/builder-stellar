import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalGateway = process.env.NEXT_PUBLIC_PINATA_GATEWAY;

beforeEach(() => vi.stubGlobal('React', React));

afterEach(() => {
  if (originalGateway === undefined) delete process.env.NEXT_PUBLIC_PINATA_GATEWAY;
  else process.env.NEXT_PUBLIC_PINATA_GATEWAY = originalGateway;
  vi.resetModules();
});

/** The gateway list is read once, when the module loads. */
async function render(src: string, gateway?: string) {
  if (gateway === undefined) delete process.env.NEXT_PUBLIC_PINATA_GATEWAY;
  else process.env.NEXT_PUBLIC_PINATA_GATEWAY = gateway;
  vi.resetModules();
  const { FallbackImage } = await import('./FallbackImage');
  return renderToStaticMarkup(<FallbackImage src={src} alt="Tribe image" errorFallbackSrc="/images/default.png" />);
}

describe('FallbackImage', () => {
  it('asks a dedicated Pinata gateway in CORS mode, so the request names this site', async () => {
    const html = await render('ipfs://bafkreiexample', 'nouns-builder.mypinata.cloud');

    expect(html).toContain('src="https://nouns-builder.mypinata.cloud/ipfs/bafkreiexample"');
    expect(html).toContain('crossorigin="anonymous"');
  });

  it('loads from a public gateway as a plain image', async () => {
    const html = await render('ipfs://bafkreiexample');

    expect(html).toContain('src="https://gateway.pinata.cloud/ipfs/bafkreiexample"');
    expect(html).not.toContain('crossorigin');
  });
});
