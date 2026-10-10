// lib/validation.ts

/**
 * Comprehensive validation utilities for DAO creation form
 */

/**
 * Validate Stellar address format (G... or C... with 56 characters)
 */
export function isValidStellarAddress(address: string): boolean {
  if (!address || typeof address !== 'string') return false;

  // Stellar addresses start with G (account) or C (contract) and are 56 chars
  const stellarAddressRegex = /^[GC][A-Z2-7]{55}$/;
  return stellarAddressRegex.test(address);
}

/**
 * Get user-friendly error message for invalid Stellar address
 */
export function getStellarAddressError(address: string): string | null {
  if (!address || address.trim().length === 0) {
    return 'Address is required';
  }
  if (!address.startsWith('G') && !address.startsWith('C')) {
    return 'Address must start with G (account) or C (contract)';
  }
  if (address.length !== 56) {
    return `Address must be exactly 56 characters (current: ${address.length})`;
  }
  if (!/^[GC][A-Z2-7]{55}$/.test(address)) {
    return 'Invalid address format (must contain only uppercase letters and digits 2-7)';
  }
  return null;
}

/**
 * Validate IPFS URI format
 */
export function isValidIpfsUri(uri: string): boolean {
  if (!uri || typeof uri !== 'string') return false;

  // Accept ipfs:// or https://ipfs.io/ or https://gateway.pinata.cloud/ etc
  return (
    uri.startsWith('ipfs://') ||
    uri.startsWith('https://ipfs.io/ipfs/') ||
    uri.startsWith('https://gateway.pinata.cloud/ipfs/') ||
    uri.startsWith('https://cloudflare-ipfs.com/ipfs/')
  );
}

/**
 * Validate HTTP/HTTPS URL format
 */
export function isValidHttpUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;

  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validate URL (HTTP/HTTPS or IPFS)
 */
export function isValidUrl(url: string): boolean {
  return isValidHttpUrl(url) || isValidIpfsUri(url);
}

/**
 * Validate basis points (0-10000)
 */
export function isValidBasisPoints(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 10000;
}

/**
 * Validate positive number
 */
export function isPositiveNumber(value: number): boolean {
  return typeof value === 'number' && !isNaN(value) && value > 0;
}

/**
 * Validate non-negative number
 */
export function isNonNegativeNumber(value: number): boolean {
  return typeof value === 'number' && !isNaN(value) && value >= 0;
}

/**
 * Validate artwork property has valid content
 */
export function validateArtworkProperty(property: { name: string; items: string[] }): string | null {
  if (!property.name || property.name.trim().length === 0) {
    return 'Property name is required';
  }
  if (property.items.length === 0) {
    return 'Property must have at least one item';
  }
  const emptyItems = property.items.filter((item) => !item || item.trim().length === 0);
  if (emptyItems.length > 0) {
    return `Property has ${emptyItems.length} empty item(s)`;
  }
  return null;
}

/**
 * Check for duplicate values in array
 */
export function hasDuplicates<T>(array: T[], keyFn: (item: T) => string): boolean {
  const seen = new Set<string>();
  for (const item of array) {
    const key = keyFn(item);
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

/**
 * Validate minimum duration (e.g., voting period, auction duration)
 */
export function validateDuration(seconds: number, minSeconds: number = 60): string | null {
  if (!isNonNegativeNumber(seconds)) {
    return 'Duration must be a positive number';
  }
  if (seconds < minSeconds) {
    return `Duration must be at least ${minSeconds} seconds (${Math.floor(minSeconds / 60)} minutes)`;
  }
  return null;
}

// Token metadata limits enforced on chain by the token (stellar-tokens non_fungible:
// MAX_NAME_LEN, MAX_SYMBOL_LEN, MAX_BASE_URI_LEN, all in bytes). Longer values make
// create_dao and set_metadata fail.
export const MAX_TOKEN_NAME_BYTES = 40;
export const MAX_TOKEN_SYMBOL_LENGTH = 10;
export const MAX_TOKEN_URI_BYTES = 200;
export const utf8Length = (value: string) => new TextEncoder().encode(value).length;

/**
 * Validate token symbol format
 */
export function isValidTokenSymbol(symbol: string): boolean {
  if (!symbol || symbol.trim().length === 0) return false;
  if (symbol.length > MAX_TOKEN_SYMBOL_LENGTH) return false;
  // Only alphanumeric characters
  return /^[A-Z0-9]+$/.test(symbol);
}

/**
 * Artwork upload validation constants (based on Pinata legacy endpoint requirements)
 */
export const ARTWORK_VALIDATION = {
  // Minimum image dimensions (staging uses 600px)
  MIN_IMAGE_DIMENSION: 600,
  // Maximum aggregate size for directory uploads (200MB like Pinata legacy)
  MAX_AGGREGATE_SIZE_BYTES: 200 * 1024 * 1024,
  // Maximum file size for single images (2MB)
  MAX_SINGLE_FILE_SIZE_BYTES: 2 * 1024 * 1024,
  // Maximum number of traits per collection
  MAX_TRAITS: 16,
  // Allowed MIME types for artwork
  ALLOWED_MIME_TYPES: ['image/png', 'image/svg+xml', 'image/jpeg', 'image/webp']
};

/**
 * Validate image dimensions
 * SVG images are exempt from dimension checks (they scale)
 */
export function validateImageDimensions(
  width: number | undefined,
  height: number | undefined,
  mimeType: string
): { valid: boolean; error?: string } {
  // SVG images don't need dimension validation
  if (mimeType === 'image/svg+xml') {
    return { valid: true };
  }

  // For raster images, require square dimensions
  if (!width || !height) {
    return { valid: false, error: 'Image dimensions could not be determined' };
  }

  if (width !== height) {
    return { valid: false, error: 'Image must be square (width = height)' };
  }

  if (width < ARTWORK_VALIDATION.MIN_IMAGE_DIMENSION || height < ARTWORK_VALIDATION.MIN_IMAGE_DIMENSION) {
    return {
      valid: false,
      error: `Image must be at least ${ARTWORK_VALIDATION.MIN_IMAGE_DIMENSION}x${ARTWORK_VALIDATION.MIN_IMAGE_DIMENSION}px (current: ${width}x${height}px)`
    };
  }

  return { valid: true };
}

/**
 * Validate that all files have the same MIME type
 */
export function validateMimeTypeConsistency(mimeTypes: string[]): { valid: boolean; error?: string } {
  if (mimeTypes.length === 0) {
    return { valid: true };
  }

  const uniqueMimeTypes = new Set(mimeTypes);
  if (uniqueMimeTypes.size > 1) {
    return {
      valid: false,
      error: `All files must have the same MIME type. Found: ${Array.from(uniqueMimeTypes).join(', ')}`
    };
  }

  return { valid: true };
}

/**
 * Validate aggregate file size
 */
export function validateAggregateFileSize(totalBytes: number): { valid: boolean; error?: string } {
  if (totalBytes > ARTWORK_VALIDATION.MAX_AGGREGATE_SIZE_BYTES) {
    const maxMB = ARTWORK_VALIDATION.MAX_AGGREGATE_SIZE_BYTES / (1024 * 1024);
    const totalMB = totalBytes / (1024 * 1024);
    return {
      valid: false,
      error: `Total file size exceeds ${maxMB}MB limit (current: ${totalMB.toFixed(2)}MB)`
    };
  }

  return { valid: true };
}
