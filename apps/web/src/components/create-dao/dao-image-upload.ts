import { UPLOAD_POLICIES, validateFileSize, validateImageDimensions, validateMimeType } from '@/lib/pinata-upload';
import { uploadImage } from '@/lib/upload-image';

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

export async function uploadDaoImage(file: File): Promise<string> {
  return (await uploadImage(file, 'dao-image')).gatewayUrl;
}

export { uploadResponseJson } from '@/lib/upload-image';
