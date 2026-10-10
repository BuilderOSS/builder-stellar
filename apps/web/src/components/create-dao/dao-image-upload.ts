import { UPLOAD_POLICIES, validateFileSize, validateImageDimensions, validateMimeType } from '@/lib/pinata-upload';
import { isValidHttpUrl } from '@/lib/validation';

export async function prepareDaoImage(file: File): Promise<{ preview: string; filename: string }> {
  const mime = validateMimeType(file.type, 'dao-image');
  const size = validateFileSize(file.size, 'dao-image');
  if (!mime.valid || !size.valid || !file.size) throw new Error(mime.error || size.error || 'Choose a nonempty image');
  const bitmap = await createImageBitmap(file);
  try {
    const dimensions = validateImageDimensions(bitmap.width, bitmap.height, UPLOAD_POLICIES['dao-image']);
    if (!dimensions.valid) throw new Error(dimensions.error);
    // A bounded local thumbnail avoids exhausting localStorage with a 5 MB base64 original.
    // This is also the exact image uploaded and deployed, not a temporary blob URL.
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = Math.min(512, bitmap.width);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image preview is unavailable in this browser');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const preview = canvas.toDataURL('image/webp', 0.9);
    const extension = preview.startsWith('data:image/webp;') ? 'webp' : 'png';
    return { preview, filename: `${file.name.replace(/\.[^.]+$/, '')}.${extension}` };
  } finally {
    bitmap.close();
  }
}

export async function uploadResponseJson(response: Response) {
  const value = await response.json();
  if (!response.ok)
    throw new Error(
      typeof value.error === 'string' ? value.error : value.error?.message || value.message || 'Image upload failed'
    );
  return value;
}
export async function uploadDaoImage(file: File): Promise<string> {
  const metadata = { uploadType: 'dao-image', filename: file.name, mimeType: file.type, sizeBytes: file.size };
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
  return result.gatewayUrl;
}
