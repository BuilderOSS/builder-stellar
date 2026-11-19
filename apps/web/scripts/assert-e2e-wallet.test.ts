import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { E2E_SIGN_BINDING, E2E_WALLET_ID } from '../src/lib/e2e-wallet/protocol';
import { assertE2EWalletBuild, E2E_WALLET_MARKERS, findE2EWalletMarkers } from './assert-e2e-wallet.mjs';

const dirs: string[] = [];
function buildDir(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-wallet-assert-'));
  dirs.push(dir);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const clean = { 'static/chunks/app.js': 'console.log("tribes")', 'server/app/page.js': 'export {}' };
const leaked = { ...clean, 'static/chunks/wallet.js': 'productId:"e2e_wallet",x=globalThis.__e2eSign' };

describe('assert-e2e-wallet', () => {
  it('looks for the ids the module actually uses', () => {
    expect(E2E_WALLET_MARKERS).toEqual([E2E_WALLET_ID, E2E_SIGN_BINDING]);
  });

  it('passes a production build without the module', () => {
    expect(assertE2EWalletBuild({ distDir: buildDir(clean), enabled: false })).toMatch(/absent/);
  });

  it('fails a production build that contains the module, naming the file', () => {
    expect(() => assertE2EWalletBuild({ distDir: buildDir(leaked), enabled: false })).toThrow(
      /static\/chunks\/wallet\.js: e2e_wallet, __e2eSign/
    );
  });

  it('fails a leak in server output too', () => {
    const dir = buildDir({ ...clean, 'server/chunks/ssr.js': 'const id = "__e2eSign"' });
    expect(() => assertE2EWalletBuild({ distDir: dir, enabled: false })).toThrow(/server\/chunks\/ssr\.js/);
  });

  it('ignores the compiler cache', () => {
    const dir = buildDir({ ...clean, 'cache/webpack/client.json': '"e2e_wallet"' });
    expect(findE2EWalletMarkers(dir)).toEqual([]);
  });

  it('requires the module in the client bundle of a walkthrough build', () => {
    expect(assertE2EWalletBuild({ distDir: buildDir(leaked), enabled: true })).toMatch(/present/);
    expect(() => assertE2EWalletBuild({ distDir: buildDir(clean), enabled: true })).toThrow(/not in the client bundle/);
  });

  it('fails when there is no build to scan', () => {
    expect(() => assertE2EWalletBuild({ distDir: join(tmpdir(), 'no-such-build-dir'), enabled: false })).toThrow(
      /Cannot scan/
    );
  });
});
