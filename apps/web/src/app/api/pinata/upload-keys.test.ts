import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The upload gate is tested in lib/upload-access.test.ts; here every call is ALICE's, funded.
const account = vi.hoisted(() => ({ address: 'GALICE' }));
vi.mock('@/lib/upload-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/upload-access')>()),
  requireUploadAccount: vi.fn(async () => ({ address: account.address, network: 'testnet', authMethod: 'sep53' }))
}));
vi.mock('@/lib/uploads-enabled', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/uploads-enabled')>()),
  uploadsEnabled: () => true
}));

import { resetPinataService, UPLOAD_KEY_TTL_MS } from '@/lib/pinata-service';
import { issuePinToken, readPinToken } from '@/lib/pinata-upload-auth';
import { resetUploadKeySweep } from '@/lib/pinata-upload-keys';

import { POST as generateJwt } from './generate-jwt/route';
import { POST as pinCid } from './pin-cid/route';

const CID = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** A fake Pinata: the calls it got, keys it handed out, and what it holds. */
function fakePinata({ files = [CID], listed = [] as unknown[], revokeStatus = 200 } = {}) {
  const calls: { method: string; url: string; body?: unknown }[] = [];
  let next = 0;
  const fetchMock = vi.fn(async (input: URL | string, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, body });
    if (url.endsWith('/users/generateApiKey')) {
      next += 1;
      return json({ JWT: `upload-jwt-${next}`, pinata_api_key: `key-${next}`, pinata_api_secret: 'secret' });
    }
    if (url.endsWith('/users/revokeApiKey')) return json(revokeStatus === 200 ? {} : { error: 'no' }, revokeStatus);
    if (url.startsWith('https://api.pinata.cloud/v3/api_keys'))
      return json({ keys: url.includes('offset') ? [] : listed });
    if (url.startsWith('https://api.pinata.cloud/v3/files/public')) {
      const cid = new URL(url).searchParams.get('cid');
      return json({ data: { files: files.includes(cid ?? '') ? [{ cid, size: 10 }] : [] } });
    }
    throw new Error(`unexpected Pinata call ${method} ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  const revoked = () =>
    calls.filter((c) => c.url.endsWith('/users/revokeApiKey')).map((c) => (c.body as { apiKey: string }).apiKey);
  return { calls, revoked };
}

const post = (body?: unknown) =>
  new Request('https://tribes.build/api/pinata/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  }) as never;

describe('folder upload keys', () => {
  beforeEach(() => {
    vi.stubEnv('PINATA_JWT', 'admin-jwt');
    vi.stubEnv('UPLOAD_TOKEN_SECRET', 'u'.repeat(32));
    resetPinataService();
    resetUploadKeySweep();
    account.address = 'GALICE';
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('generate-jwt hands out a one-use key whose pin token names it, with a 15-minute deadline', async () => {
    const pinata = fakePinata();
    const before = Date.now();
    const response = await generateJwt(post());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.jwt).toBe('upload-jwt-1');
    expect(readPinToken(body.pinToken, 'GALICE')).toEqual({ keyId: 'key-1' });
    const deadline = Date.parse(body.expiresAt);
    expect(deadline).toBeGreaterThanOrEqual(before + UPLOAD_KEY_TTL_MS);
    expect(deadline).toBeLessThanOrEqual(Date.now() + UPLOAD_KEY_TTL_MS);
    const created = pinata.calls.find((c) => c.url.endsWith('/users/generateApiKey'))!;
    expect(created.body).toMatchObject({ maxUses: 1, keyName: `tribes-folder-upload-${Math.ceil(deadline / 1000)}` });
  });

  it('pin-cid confirms the upload, then revokes the key that made it', async () => {
    const pinata = fakePinata();
    const { pinToken } = await (await generateJwt(post())).json();
    const response = await pinCid(post({ cid: CID, pinToken }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, cid: CID });
    expect(pinata.revoked()).toEqual(['key-1']);
    const order = pinata.calls.map((c) => c.url.replace('https://api.pinata.cloud', ''));
    expect(order.indexOf('/users/revokeApiKey')).toBeGreaterThan(
      order.findIndex((u) => u.startsWith('/v3/files/public'))
    );
  });

  it('pin-cid revokes the key when the upload is not in the account too', async () => {
    const pinata = fakePinata({ files: [] });
    const { pinToken } = await (await generateJwt(post())).json();
    const response = await pinCid(post({ cid: CID, pinToken }));
    expect(response.status).toBe(404);
    expect(pinata.revoked()).toEqual(['key-1']);
  });

  it('pin-cid still confirms when Pinata refuses the revoke, and logs it', async () => {
    const pinata = fakePinata({ revokeStatus: 500 });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { pinToken } = await (await generateJwt(post())).json();
    expect((await pinCid(post({ cid: CID, pinToken }))).status).toBe(200);
    expect(pinata.revoked()).toEqual(['key-1']);
    expect(error).toHaveBeenCalledWith('[pinata-upload-keys] revoke failed:', expect.any(String));
  });

  it('pin-cid refuses another account’s token, and revokes nothing', async () => {
    const pinata = fakePinata();
    const { pinToken } = await (await generateJwt(post())).json();
    account.address = 'GBOB';
    const response = await pinCid(post({ cid: CID, pinToken }));
    expect(response.status).toBe(403);
    expect(pinata.revoked()).toEqual([]);
    expect(pinata.calls.some((c) => c.url.includes('/v3/files/public'))).toBe(false);
  });

  it('pin-cid accepts a pin token issued before tokens named their key, and revokes nothing', async () => {
    const pinata = fakePinata();
    const response = await pinCid(post({ cid: CID, pinToken: issuePinToken('GALICE') }));
    expect(response.status).toBe(200);
    expect(pinata.revoked()).toEqual([]);
  });

  it('generate-jwt first revokes the keys abandoned uploads left past their deadline, once per interval', async () => {
    const past = `tribes-folder-upload-${Math.ceil((Date.now() - 60_000) / 1000)}`;
    const pinata = fakePinata({
      listed: [
        { key: 'abandoned', name: past, revoked: false },
        { key: 'operator', name: 'tribes-prod', revoked: false }
      ]
    });
    await generateJwt(post());
    await generateJwt(post());
    expect(pinata.revoked()).toEqual(['abandoned']);
    // One sweep: its first page, then the empty page that ends the list; the second call sweeps nothing.
    const listed = pinata.calls.filter((c) => c.url.startsWith('https://api.pinata.cloud/v3/api_keys'));
    expect(listed.map((c) => new URL(c.url).searchParams.get('offset'))).toEqual([null, '2']);
    const urls = pinata.calls.map((c) => c.url);
    expect(urls.indexOf('https://api.pinata.cloud/users/revokeApiKey')).toBeLessThan(
      urls.indexOf('https://api.pinata.cloud/users/generateApiKey')
    );
  });
});
