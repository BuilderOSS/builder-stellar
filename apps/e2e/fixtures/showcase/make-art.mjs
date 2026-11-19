#!/usr/bin/env node
// Draws the Lamplight showcase tribe's trait layers (docs/qa/SHOWCASE_TRIBE.md) as SVG and renders
// each one to a transparent PNG: fixtures/showcase/art/<layer>/<trait>.png. The renderer stacks them
// in layer order. Run: node apps/e2e/fixtures/showcase/make-art.mjs [--preview]
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const sharp = createRequire(join(here, '../../../web/package.json'))('sharp');
const OUT = join(here, 'art');
const SIZE = 720;

const svg = (body, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080" width="${SIZE}" height="${SIZE}"><defs>${defs}</defs>${body}</svg>`;

const METAL = '#9a7650';
const METAL_DARK = '#6e5236';

// 0: the backdrop, a flat field with a faint horizon so the lantern has somewhere to hang.
const backdrops = {
  dusk: ['#1f2740', '#283252'],
  ink: ['#17161b', '#211f26'],
  paper: ['#eee5d3', '#e3d7c0'],
  moss: ['#26352c', '#30443a'],
  clay: ['#a65a43', '#b86a50']
};

// 1: the glow, a soft light behind the lantern, tinting its paper.
const glows = {
  amber: '#ffb347',
  rose: '#ff7f8f',
  teal: '#4fd1c5',
  indigo: '#8c8cff',
  saffron: '#ffd23f'
};

// 2: the lantern body: paper (translucent, so the glow shows through), ribs, caps and the cord.
const cord = `<line x1="540" y1="0" x2="540" y2="300" stroke="${METAL}" stroke-width="10"/>`;
const PAPER = 'fill="#fff6e6" fill-opacity="0.62"';
const RIB = `stroke="${METAL_DARK}" stroke-opacity="0.55" stroke-width="6" fill="none"`;
const caps = (topW, botW, topY, botY) =>
  `<rect x="${540 - topW / 2}" y="${topY}" width="${topW}" height="34" rx="10" fill="${METAL}"/>` +
  `<rect x="${540 - botW / 2}" y="${botY}" width="${botW}" height="34" rx="10" fill="${METAL}"/>`;
const lanterns = {
  round: {
    defs: '<clipPath id="c"><ellipse cx="540" cy="585" rx="235" ry="255"/></clipPath>',
    body:
      cord +
      `<ellipse cx="540" cy="585" rx="235" ry="255" ${PAPER}/>` +
      `<g clip-path="url(#c)">${[400, 460, 520, 585, 650, 710, 770].map((y) => `<line x1="280" x2="800" y1="${y}" y2="${y}" ${RIB}/>`).join('')}</g>` +
      `<ellipse cx="540" cy="585" rx="235" ry="255" ${RIB}/>` +
      caps(170, 170, 318, 820)
  },
  faceted: {
    body:
      cord +
      `<polygon points="540,330 745,445 745,725 540,840 335,725 335,445" ${PAPER}/>` +
      `<polyline points="335,445 540,560 745,445" ${RIB}/><line x1="540" y1="560" x2="540" y2="840" ${RIB}/>` +
      `<polygon points="540,330 745,445 745,725 540,840 335,725 335,445" stroke="${METAL}" stroke-width="12" fill="none" stroke-linejoin="round"/>` +
      caps(120, 120, 300, 836)
  },
  tall: {
    body:
      cord +
      `<rect x="405" y="330" width="270" height="520" rx="36" ${PAPER}/>` +
      [450, 495, 540, 585, 630].map((x) => `<line x1="${x}" x2="${x}" y1="340" y2="840" ${RIB}/>`).join('') +
      `<rect x="405" y="330" width="270" height="520" rx="36" stroke="${METAL}" stroke-width="12" fill="none"/>` +
      caps(310, 310, 306, 836)
  },
  bell: {
    body:
      cord +
      `<path d="M470 330 C470 420 330 470 330 700 C330 790 400 830 540 830 C680 830 750 790 750 700 C750 470 610 420 610 330 Z" ${PAPER}/>` +
      `<path d="M500 340 C500 440 400 520 400 700 C400 780 440 815 470 822" ${RIB}/><path d="M580 340 C580 440 680 520 680 700 C680 780 640 815 610 822" ${RIB}/><line x1="540" y1="340" x2="540" y2="828" ${RIB}/>` +
      `<path d="M470 330 C470 420 330 470 330 700 C330 790 400 830 540 830 C680 830 750 790 750 700 C750 470 610 420 610 330 Z" stroke="${METAL}" stroke-width="12" fill="none"/>` +
      caps(170, 300, 306, 822)
  }
};

// 3: the flame, softened so it reads as light inside the paper.
const FLAME_DEFS =
  '<filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>';
const flamePath = (cx, base, w, h) =>
  `M${cx} ${base - h} C${cx + w * 0.2} ${base - h * 0.6} ${cx + w * 0.55} ${base - h * 0.4} ${cx + w * 0.5} ${base - h * 0.18} C${cx + w * 0.45} ${base} ${cx - w * 0.45} ${base} ${cx - w * 0.5} ${base - h * 0.18} C${cx - w * 0.55} ${base - h * 0.4} ${cx - w * 0.2} ${base - h * 0.6} ${cx} ${base - h} Z`;
const flame = (cx, base, w, h) =>
  `<g filter="url(#b)"><path d="${flamePath(cx, base, w, h)}" fill="#ffb02e" fill-opacity="0.9"/><path d="${flamePath(cx, base - 4, w * 0.5, h * 0.55)}" fill="#fff4c2"/></g>`;
const flames = {
  steady: flame(540, 690, 90, 170),
  tall: flame(540, 700, 80, 250),
  twin: flame(495, 690, 70, 150) + flame(585, 690, 70, 150),
  ember: `<g filter="url(#b)"><ellipse cx="540" cy="660" rx="60" ry="34" fill="#ff8a3d" fill-opacity="0.9"/><ellipse cx="540" cy="655" rx="28" ry="16" fill="#ffe08a"/></g>`
};

// 4: a detail at the base or the top.
const details = {
  plain: '',
  tassel:
    `<line x1="540" y1="868" x2="540" y2="905" stroke="${METAL}" stroke-width="8"/><circle cx="540" cy="912" r="13" fill="${METAL}"/>` +
    [-18, -9, 0, 9, 18]
      .map(
        (dx) =>
          `<line x1="${540 + dx * 0.4}" y1="920" x2="${540 + dx}" y2="1010" stroke="#c4453a" stroke-width="7" stroke-linecap="round"/>`
      )
      .join(''),
  beads:
    `<line x1="540" y1="868" x2="540" y2="1030" stroke="${METAL}" stroke-width="5"/>` +
    [905, 950, 992, 1030]
      .map(
        (y, i) =>
          `<circle cx="540" cy="${y}" r="${20 - i * 2}" fill="${['#4fb0a5', '#e8c35a', '#c4453a', '#f2ede2'][i]}"/>`
      )
      .join(''),
  handle: `<path d="M455 312 C455 200 625 200 625 312" stroke="${METAL}" stroke-width="12" fill="none" stroke-linecap="round"/>`
};

const layers = {
  '0-backdrop': Object.fromEntries(
    Object.entries(backdrops).map(([name, [top, bottom]]) => [
      name,
      {
        body: `<rect width="1080" height="1080" fill="${top}"/><rect y="760" width="1080" height="320" fill="${bottom}"/>`
      }
    ])
  ),
  '1-glow': Object.fromEntries(
    Object.entries(glows).map(([name, color]) => [
      name,
      {
        defs: `<radialGradient id="g"><stop offset="0" stop-color="${color}" stop-opacity="0.95"/><stop offset="0.45" stop-color="${color}" stop-opacity="0.55"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`,
        body: `<circle cx="540" cy="585" r="420" fill="url(#g)"/>`
      }
    ])
  ),
  '2-lantern': lanterns,
  '3-flame': Object.fromEntries(Object.entries(flames).map(([name, body]) => [name, { defs: FLAME_DEFS, body }])),
  '4-detail': Object.fromEntries(Object.entries(details).map(([name, body]) => [name, { body }]))
};

for (const [layer, items] of Object.entries(layers)) {
  mkdirSync(join(OUT, layer), { recursive: true });
  for (const [name, { body, defs }] of Object.entries(items)) {
    const png = await sharp(Buffer.from(svg(body, defs)))
      .png({ compressionLevel: 9 })
      .toBuffer();
    writeFileSync(join(OUT, layer, `${name}.png`), png);
  }
}

// The tribe image: one composite (docs/qa/SHOWCASE_TRIBE.md, Identity).
{
  const names = Object.keys(layers);
  const [base, ...rest] = ['dusk', 'amber', 'round', 'steady', 'tassel'].map((trait, i) =>
    join(OUT, names[i], `${trait}.png`)
  );
  writeFileSync(
    join(here, 'cover.png'),
    await sharp(base)
      .composite(rest.map((input) => ({ input })))
      .png()
      .toBuffer()
  );
}

if (process.argv.includes('--preview')) {
  const pick = [
    ['dusk', 'amber', 'round', 'steady', 'tassel'],
    ['paper', 'rose', 'faceted', 'twin', 'plain'],
    ['ink', 'teal', 'tall', 'tall', 'handle'],
    ['moss', 'saffron', 'bell', 'ember', 'beads'],
    ['clay', 'indigo', 'round', 'tall', 'handle'],
    ['paper', 'amber', 'bell', 'steady', 'tassel']
  ];
  const names = Object.keys(layers);
  const tiles = [];
  for (const combo of pick) {
    const [base, ...rest] = combo.map((trait, i) => join(OUT, names[i], `${trait}.png`));
    const full = await sharp(base)
      .composite(rest.map((input) => ({ input })))
      .png()
      .toBuffer();
    tiles.push(await sharp(full).resize(360, 360).png().toBuffer());
  }
  const sheet = await sharp({ create: { width: 360 * 3, height: 360 * 2, channels: 4, background: '#000' } })
    .composite(tiles.map((input, i) => ({ input, left: (i % 3) * 360, top: Math.floor(i / 3) * 360 })))
    .png()
    .toBuffer();
  const out = process.argv[process.argv.indexOf('--preview') + 1] ?? join(here, 'preview.png');
  writeFileSync(out, sheet);
  console.log(out);
}
