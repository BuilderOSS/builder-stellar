import { isValidHttpUrl } from '@/lib/validation';

export async function uploadResponseJson(response: Response) {
  const value = await response.json();
  if (!response.ok)
    throw new Error(
      typeof value.error === 'string' ? value.error : value.error?.message || value.message || 'Image upload failed'
    );
  return value;
}
/** Upload one image through the session-gated Pinata flow. Returns both the `ipfs://` URI and a gateway URL. */
export async function uploadImage(
  file: File,
  uploadType: 'dao-image' | 'markdown-image'
): Promise<{ ipfsUri: string; gatewayUrl: string }> {
  const metadata = { uploadType, filename: file.name, mimeType: file.type, sizeBytes: file.size };
  const authorization = await uploadResponseJson(
    await fetch('/api/uploads/pinata-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': crypto.randomUUID() },
      body: JSON.stringify(metadata),
      signal: AbortSignal.timeout(30_000)
    })
  );
  if (typeof authorization.signedUrl !== 'string' || typeof authorization.uploadId !== 'string')
    throw new Error('Invalid upload authorization');
  const form = new FormData();
  form.append('file', file);
  form.append('network', 'public');
  const uploaded = await uploadResponseJson(
    await fetch(authorization.signedUrl, { method: 'POST', body: form, signal: AbortSignal.timeout(60_000) })
  );
  const cid = uploaded.data?.cid;
  if (typeof cid !== 'string') throw new Error('Upload did not return a CID');
  const result = await uploadResponseJson(
    await fetch('/api/uploads/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...metadata, uploadId: authorization.uploadId, cid }),
      signal: AbortSignal.timeout(30_000)
    })
  );
  if (typeof result.gatewayUrl !== 'string' || !isValidHttpUrl(result.gatewayUrl))
    throw new Error('Upload did not return a durable image URL');
  if (typeof result.ipfsUri !== 'string' || !result.ipfsUri.startsWith('ipfs://'))
    throw new Error('Upload did not return an IPFS address');
  return { ipfsUri: result.ipfsUri, gatewayUrl: result.gatewayUrl };
}
