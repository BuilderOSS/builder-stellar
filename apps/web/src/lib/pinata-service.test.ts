import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PinataService,
  UPLOAD_KEY_SWEEP_PAGE_LIMIT,
  UPLOAD_KEY_SWEEP_REVOKE_LIMIT,
  UPLOAD_KEY_TTL_MS,
  uploadKeyDeadline,
  uploadKeyName
} from './pinata-service';

describe('PinataService.createSignedUploadUrl', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubEnv('PINATA_JWT', 'test-jwt');
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: 'https://uploads.example/signed' }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  const policyFor = async (type: Parameters<PinataService['createSignedUploadUrl']>[0]) => {
    await new PinataService().createSignedUploadUrl(type);
    return JSON.parse(fetchMock.mock.calls[0]![1].body as string) as {
      allow_mime_types: string[];
      max_file_size: number;
    };
  };

  it('lets a claim list upload JSON (BUG-CAP-3)', async () => {
    const policy = await policyFor('claim-list');
    expect(policy.allow_mime_types).toEqual(['application/json']);
    expect(policy.max_file_size).toBe(12 * 1024 * 1024);
  });

  it('keeps images to their own types', async () => {
    expect((await policyFor('dao-image')).allow_mime_types).toEqual(['image/png', 'image/jpeg', 'image/webp']);
  });

  it('keeps the artwork folder a directory upload', async () => {
    expect((await policyFor('artwork-directory')).allow_mime_types).toEqual(['directory']);
  });
});

describe('PinataService.verifyCid', () => {
  const fetchMock = vi.fn();
  const CID = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';

  beforeEach(() => {
    vi.stubEnv('PINATA_JWT', 'test-jwt');
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  const files = (entries: unknown[]) =>
    new Response(JSON.stringify({ data: { files: entries, next_page_token: '' } }), { status: 200 });

  it('reads the account’s file list by CID and never pins', async () => {
    fetchMock.mockResolvedValue(files([{ cid: CID, size: 1234, name: 'logo.png' }]));
    await expect(new PinataService().verifyCid(CID)).resolves.toEqual({ size: 1234, name: 'logo.png' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(`https://api.pinata.cloud/v3/files/public?cid=${CID}&limit=10`);
    expect(init?.method ?? 'GET').toBe('GET');
    expect(String(url)).not.toContain('pin_by_cid');
  });

  it('is not found when the account holds no file with that CID', async () => {
    fetchMock.mockResolvedValue(files([{ cid: 'bafyother', size: 1 }]));
    await expect(new PinataService().verifyCid(CID)).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });
});

describe('PinataService upload keys', () => {
  const fetchMock = vi.fn();
  const NOW = Date.UTC(2026, 10, 25, 12, 0, 0);
  const seconds = (ms: number) => Math.ceil(ms / 1000);

  beforeEach(() => {
    vi.stubEnv('PINATA_JWT', 'admin-jwt');
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  it('creates a one-use pinFileToIPFS key named with its 15-minute deadline', async () => {
    fetchMock.mockResolvedValue(json({ JWT: 'upload-jwt', pinata_api_key: 'key-1', pinata_api_secret: 's' }));
    const key = await new PinataService().generateUploadKey(NOW);
    expect(key).toEqual({ jwt: 'upload-jwt', keyId: 'key-1', expiresAt: new Date(NOW + UPLOAD_KEY_TTL_MS) });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.pinata.cloud/users/generateApiKey');
    const body = JSON.parse(init.body as string);
    expect(body.keyName).toBe(`tribes-folder-upload-${seconds(NOW + UPLOAD_KEY_TTL_MS)}`);
    expect(uploadKeyDeadline(body.keyName)).toBe(NOW + UPLOAD_KEY_TTL_MS);
    expect(body.maxUses).toBe(1);
    expect(body.permissions.endpoints.pinning).toMatchObject({ pinFileToIPFS: true, pinByHash: false, unpin: false });
  });

  it('refuses a key without its ID, which it could never revoke', async () => {
    fetchMock.mockResolvedValue(json({ JWT: 'upload-jwt' }));
    await expect(new PinataService().generateUploadKey(NOW)).rejects.toMatchObject({ code: 'BACKEND_FAILED' });
  });

  it('reads a deadline only from its own key names', () => {
    expect(uploadKeyName(new Date(NOW))).toBe(`tribes-folder-upload-${seconds(NOW)}`);
    expect(uploadKeyDeadline(`tribes-folder-upload-${seconds(NOW)}`)).toBe(NOW);
    for (const other of [
      'Single Use Upload JWT',
      'tribes-prod',
      'tribes-folder-upload-',
      'tribes-folder-upload-12x',
      `x-tribes-folder-upload-${seconds(NOW)}`,
      null,
      7
    ]) {
      expect(uploadKeyDeadline(other)).toBeNull();
    }
  });

  it('revokes a key by its ID', async () => {
    fetchMock.mockResolvedValue(json({}, 200));
    await new PinataService().revokeUploadKey('key-1');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.pinata.cloud/users/revokeApiKey');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ apiKey: 'key-1' });
  });

  it('sweeps only its own expired, unrevoked keys, page by page', async () => {
    const past = `tribes-folder-upload-${seconds(NOW - 60_000)}`;
    const future = `tribes-folder-upload-${seconds(NOW + 60_000)}`;
    const pages = [
      [
        { key: 'expired-1', name: past, revoked: false },
        { key: 'live', name: future, revoked: false },
        { key: 'gone', name: past, revoked: true },
        { key: 'operator', name: 'tribes-prod', revoked: false },
        { key: 'older-app-key', name: 'Single Use Upload JWT', revoked: false }
      ],
      [
        { key: 'expired-2', name: past, revoked: false },
        { key: 'expired-1', name: past, revoked: false }
      ],
      []
    ];
    const listed: URL[] = [];
    const revoked: string[] = [];
    fetchMock.mockImplementation(async (url: URL | string, init?: RequestInit) => {
      if (String(url).startsWith('https://api.pinata.cloud/v3/api_keys')) {
        listed.push(new URL(String(url)));
        return json({ keys: pages[listed.length - 1] ?? [], count: 7 });
      }
      revoked.push(JSON.parse(init!.body as string).apiKey);
      return json({}, 200);
    });

    await expect(new PinataService().revokeExpiredUploadKeys(NOW)).resolves.toBe(2);
    expect(revoked).toEqual(['expired-1', 'expired-2']);
    expect(
      listed.map((url) => [
        url.searchParams.get('name'),
        url.searchParams.get('revoked'),
        url.searchParams.get('offset')
      ])
    ).toEqual([
      ['tribes-folder-upload-', null, null],
      ['tribes-folder-upload-', null, '5'],
      ['tribes-folder-upload-', null, '7']
    ]);
  });

  it('stops after its page and revoke limits, and leaves the rest to the next sweep', async () => {
    const past = `tribes-folder-upload-${seconds(NOW - 60_000)}`;
    let page = 0;
    fetchMock.mockImplementation(async (url: URL | string) => {
      if (String(url).startsWith('https://api.pinata.cloud/v3/api_keys')) {
        page += 1;
        return json({
          keys: Array.from({ length: 20 }, (_, i) => ({ key: `k${page}-${i}`, name: past, revoked: false }))
        });
      }
      return json({}, 200);
    });
    await expect(new PinataService().revokeExpiredUploadKeys(NOW)).resolves.toBe(UPLOAD_KEY_SWEEP_REVOKE_LIMIT);
    expect(page).toBeLessThanOrEqual(UPLOAD_KEY_SWEEP_PAGE_LIMIT);
  });

  it('skips a key Pinata refuses to revoke and goes on, but stops on a refused credential', async () => {
    const past = `tribes-folder-upload-${seconds(NOW - 60_000)}`;
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const revoked: string[] = [];
    let status = 400;
    fetchMock.mockImplementation(async (url: URL | string, init?: RequestInit) => {
      if (String(url).startsWith('https://api.pinata.cloud/v3/api_keys'))
        return json({
          keys: String(url).includes('offset')
            ? []
            : [
                { key: 'stale', name: past },
                { key: 'next', name: past }
              ]
        });
      const key = JSON.parse(init!.body as string).apiKey;
      if (key === 'stale') return json({ error: { message: 'already revoked' } }, status);
      revoked.push(key);
      return json({}, 200);
    });
    await expect(new PinataService().revokeExpiredUploadKeys(NOW)).resolves.toBe(1);
    expect(revoked).toEqual(['next']);
    expect(error).toHaveBeenCalledWith('[pinata-upload-keys] could not revoke an expired key:', 'already revoked');

    status = 403;
    await expect(new PinataService().revokeExpiredUploadKeys(NOW)).rejects.toMatchObject({ code: 'AUTH_FAILED' });
    error.mockRestore();
  });

  it('fails the sweep when the key list is refused, so the caller logs it', async () => {
    fetchMock.mockResolvedValue(json({ error: { message: 'forbidden' } }, 403));
    await expect(new PinataService().revokeExpiredUploadKeys(NOW)).rejects.toMatchObject({ code: 'AUTH_FAILED' });
  });
});
