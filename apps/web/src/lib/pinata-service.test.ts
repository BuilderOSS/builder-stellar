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
