/**
 * Client-side localStorage cache for artwork directory uploads.
 * Caches the IPFS CID for uploaded file sets to avoid re-uploading
 * identical directories.
 */

const CACHE_PREFIX = 'BUILDER/IPFSUploadCache';
const EXPIRY_PREFIX = 'BUILDER/IPFSUploadCacheExpiry';
const CACHE_DURATION_HOURS = 24;

export interface CachedUpload {
  cid: string;
  uri: string;
  timestamp: number;
}

/**
 * Get a cached upload by file hash
 * Returns null if not found or expired
 */
export function getCachedUpload(fileHash: string): CachedUpload | null {
  try {
    const cached = localStorage.getItem(`${CACHE_PREFIX}/${fileHash}`);
    if (!cached) return null;

    const expiry = localStorage.getItem(`${EXPIRY_PREFIX}/${fileHash}`);
    if (expiry && Date.now() > parseInt(expiry, 10)) {
      // Cache expired, clean up
      localStorage.removeItem(`${CACHE_PREFIX}/${fileHash}`);
      localStorage.removeItem(`${EXPIRY_PREFIX}/${fileHash}`);
      return null;
    }

    const uploadData = JSON.parse(cached) as CachedUpload;
    return uploadData;
  } catch (error) {
    console.warn('[upload-cache] Failed to retrieve cached upload:', error);
    return null;
  }
}

/**
 * Cache an upload result
 */
export function cacheUpload(fileHash: string, cid: string): void {
  try {
    const uploadData: CachedUpload = {
      cid,
      uri: `ipfs://${cid}`,
      timestamp: Date.now(),
    };

    localStorage.setItem(`${CACHE_PREFIX}/${fileHash}`, JSON.stringify(uploadData));

    // Set expiry
    const expiryTime = Date.now() + CACHE_DURATION_HOURS * 60 * 60 * 1000;
    localStorage.setItem(`${EXPIRY_PREFIX}/${fileHash}`, expiryTime.toString());
  } catch (error) {
    console.warn('[upload-cache] Failed to cache upload:', error);
  }
}

/**
 * Clear all cached uploads
 */
export function clearAllCaches(): void {
  try {
    const keys = Object.keys(localStorage);
    keys.forEach((key) => {
      if (key.startsWith(CACHE_PREFIX) || key.startsWith(EXPIRY_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
  } catch (error) {
    console.warn('[upload-cache] Failed to clear caches:', error);
  }
}

/**
 * Clear specific cached upload
 */
export function clearCachedUpload(fileHash: string): void {
  try {
    localStorage.removeItem(`${CACHE_PREFIX}/${fileHash}`);
    localStorage.removeItem(`${EXPIRY_PREFIX}/${fileHash}`);
  } catch (error) {
    console.warn('[upload-cache] Failed to clear cached upload:', error);
  }
}
