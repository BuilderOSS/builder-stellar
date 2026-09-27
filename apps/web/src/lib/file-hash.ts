/**
 * File hash utility for deduplicating artwork uploads.
 * Creates a SHA256 hash based on file metadata (not content) to quickly
 * identify when the same set of files has been uploaded before.
 */

/**
 * Hash file metadata to create a fingerprint for the file set
 * Hashing metadata rather than content avoids expensive file reads
 */
export async function hashFiles(files: File[]): Promise<string> {
  // Create a deterministic string representation of file metadata
  const fileMetadata = files.map((file) => ({
    name: file.name,
    size: file.size,
    lastModified: file.lastModified,
    type: file.type,
  }));

  const metadataString = JSON.stringify(fileMetadata);
  const encoder = new TextEncoder();
  const data = encoder.encode(metadataString);

  // Use Web Crypto API for SHA256 hashing (available in browsers and Node 15+)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);

  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  return `0x${hashHex}`;
}

/**
 * Quick synchronous hash for cases where async isn't needed
 * Uses a simple checksum instead of crypto (faster but less collision-resistant)
 */
export function quickHashFiles(files: File[]): string {
  let hash = 5381;
  for (const file of files) {
    for (let i = 0; i < file.name.length; i++) {
      hash = (hash << 5) + hash + file.name.charCodeAt(i);
      hash = hash & hash; // Convert to 32bit integer
    }
    hash = (hash << 5) + hash + file.size;
    hash = (hash << 5) + hash + file.lastModified;
  }
  return `0x${(hash >>> 0).toString(16)}`;
}
