import { TOKEN_DESCRIPTION, TOKEN_NAME, TOKEN_SYMBOL } from './token-config';

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function toColor(value: number) {
  return `#${Math.floor(value * 0xffffff)
    .toString(16)
    .padStart(6, '0')}`;
}

function escapeXml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function buildTokenMetadata(tokenId: number, baseUrl: string) {
  const normalizedBase = baseUrl.replace(/\/$/, '');
  return {
    name: `${TOKEN_NAME} #${tokenId}`,
    description: TOKEN_DESCRIPTION,
    image: `${normalizedBase}/api/token/${tokenId}/image.svg`,
    attributes: [
      { trait_type: 'Token ID', value: String(tokenId) },
      { trait_type: 'Token Symbol', value: TOKEN_SYMBOL },
      { trait_type: 'DAO Role', value: 'Voting' }
    ]
  };
}

export function buildTokenImageSvg(tokenId: number) {
  const rng = mulberry32(tokenId ?? 1);
  const background = toColor(rng());
  const accent = toColor(rng());
  const accent2 = toColor(rng());
  const shape = Math.floor(rng() * 3);
  const title = `${TOKEN_NAME} #${tokenId}`;
  const x = 24 + Math.floor(rng() * 24);
  const y = 24 + Math.floor(rng() * 24);
  const size = 96 + Math.floor(rng() * 72);

  const shapeMarkup =
    shape === 0
      ? `<circle cx="128" cy="128" r="${Math.max(36, Math.floor(size / 2))}" fill="${accent}" opacity="0.9" />`
      : shape === 1
        ? `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="28" fill="${accent}" opacity="0.9" transform="rotate(${Math.floor(rng() * 45)} 128 128)" />`
        : `<polygon points="128,40 216,200 40,200" fill="${accent}" opacity="0.9" />`;

  const innerMarkup = `<circle cx="${88 + Math.floor(rng() * 80)}" cy="${88 + Math.floor(rng() * 80)}" r="${28 + Math.floor(rng() * 32)}" fill="${accent2}" opacity="0.7" />`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="none" role="img" aria-label="DAO vote token ${tokenId}">
  <rect width="256" height="256" rx="32" fill="${background}"/>
  ${shapeMarkup}
  ${innerMarkup}
  <text x="24" y="222" fill="white" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="24" font-weight="700">${escapeXml(title)}</text>
  <text x="24" y="244" fill="rgba(171,200,229,0.9)" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="12" font-weight="500">${escapeXml(TOKEN_SYMBOL)} governance token</text>
</svg>`;
}
