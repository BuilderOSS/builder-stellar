#!/usr/bin/env node
// Pins Lamplight's artwork folder (fixtures/showcase/art) to IPFS the same way the app's artwork
// upload does (artwork/<layer>/<trait>.png, one directory CID), and records the CID in state.json.
// The capture spec then answers the browser's own upload with this CID, so the key that pins never
// reaches the browser. Needs PINATA_JWT in apps/e2e/.env.local; prints only the CID.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const envFile = join(here, '../../.env.local');
if (existsSync(envFile)) process.loadEnvFile(envFile);
if (!process.env.PINATA_JWT) throw new Error('PINATA_JWT is missing from apps/e2e/.env.local');

const art = join(here, 'art');
const form = new FormData();
for (const layer of readdirSync(art).sort()) {
  for (const file of readdirSync(join(art, layer)).sort()) {
    form.append(
      'file',
      new Blob([readFileSync(join(art, layer, file))], { type: 'image/png' }),
      `artwork/${layer}/${file}`
    );
  }
}
form.append('pinataMetadata', JSON.stringify({ name: 'Lamplight artwork' }));
const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
  method: 'POST',
  headers: { Authorization: `Bearer ${process.env.PINATA_JWT}` },
  body: form
});
const body = await response.json();
if (!response.ok || typeof body.IpfsHash !== 'string')
  throw new Error(`Pinata refused the upload (${response.status})`);
const stateFile = join(here, 'state.json');
const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : {};
state.artCid = body.IpfsHash;
writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`);
console.log(body.IpfsHash);
