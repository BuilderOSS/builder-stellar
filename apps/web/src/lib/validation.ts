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

export const MAX_TOKEN_SYMBOL_LENGTH = 12;

/**
 * Validate token symbol format
 */
export function isValidTokenSymbol(symbol: string): boolean {
  if (!symbol || symbol.trim().length === 0) return false;
  if (symbol.length > MAX_TOKEN_SYMBOL_LENGTH) return false;
  // Only alphanumeric characters
  return /^[A-Z0-9]+$/.test(symbol);
}
