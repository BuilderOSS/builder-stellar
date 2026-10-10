import { beforeEach, expect, it, vi } from 'vitest';

import { prepareDaoImage, uploadDaoImage } from './dao-image-upload';

const bitmap = { width: 512, height: 512, close: vi.fn() };
beforeEach(() => {
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
  bitmap.width = bitmap.height = 512;
  vi.stubGlobal('document', {
    createElement: () => ({
      getContext: () => ({ drawImage: vi.fn() }),
      toDataURL: () => 'data:image/webp;base64,AAAA'
    })
  });
});
it('keeps a bounded browser preview separate from the deployment URL', async () => {
  const image = await prepareDaoImage(new File(['bytes'], 'logo.png', { type: 'image/png' }));
  expect(image).toEqual({ preview: 'data:image/webp;base64,AAAA', filename: 'logo.webp' });
  expect(bitmap.close).toHaveBeenCalled();
});
it('rejects non-images, oversized and nonsquare images before uploading', async () => {
  await expect(prepareDaoImage(new File(['text'], 'file.txt', { type: 'text/plain' }))).rejects.toThrow(
    'Invalid file type'
  );
  bitmap.height = 400;
  await expect(prepareDaoImage(new File(['bytes'], 'logo.png', { type: 'image/png' }))).rejects.toThrow('square');
});
it('uses signed upload and verified completion contracts, returning only a durable HTTP URL', async () => {
  const file = new File(['bytes'], 'logo.webp', { type: 'image/webp' });
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ signedUrl: 'https://uploads.pinata.cloud/test', uploadId: 'upload-1' }))
    .mockResolvedValueOnce(Response.json({ data: { cid: 'bafytest' } }))
    .mockResolvedValueOnce(Response.json({ gatewayUrl: 'https://gateway.example/ipfs/bafytest' }));
  vi.stubGlobal('fetch', fetch);
  expect(await uploadDaoImage(file)).toBe('https://gateway.example/ipfs/bafytest');
  const authorization = fetch.mock.calls[0];
  expect(authorization[0]).toBe('/api/uploads/pinata-url');
  expect(JSON.parse(authorization[1].body)).toEqual({
    uploadType: 'dao-image',
    filename: file.name,
    mimeType: file.type,
    sizeBytes: file.size
  });
  expect(fetch.mock.calls[1][1].body.get('file')).toBe(file);
  expect(JSON.parse(fetch.mock.calls[2][1].body)).toMatchObject({ uploadId: 'upload-1', cid: 'bafytest' });
});
it('surfaces authentication/feature errors and never treats an unverified upload as durable', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'Unauthenticated' }, { status: 401 })));
  await expect(uploadDaoImage(new File(['x'], 'logo.png', { type: 'image/png' }))).rejects.toThrow('Unauthenticated');
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(Response.json({ signedUrl: 'https://uploads.pinata.cloud/test', uploadId: 'upload-1' }))
      .mockResolvedValueOnce(Response.json({ data: { cid: 'bafytest' } }))
      .mockResolvedValueOnce(Response.json({ gatewayUrl: 'data:image/png;base64,AAAA' }))
  );
  await expect(uploadDaoImage(new File(['x'], 'logo.png', { type: 'image/png' }))).rejects.toThrow('durable');
});
