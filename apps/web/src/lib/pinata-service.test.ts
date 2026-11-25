import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PinataService } from './pinata-service';

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
