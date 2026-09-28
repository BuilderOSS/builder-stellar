import { z } from 'zod';

/**
 * Canonical IPFS gateway URLs - fallback order
 * The first gateway is tried first, then others in order.
 * Matches the list used in the render API.
 */
const IPFS_GATEWAY_HOSTS = [
  'nouns-builder.mypinata.cloud',
  'gateway.pinata.cloud',
  'ipfs.io',
  'magic.decentralized-content.com',
  'dweb.link',
  'w3s.link',
  'nft.storage',
  'cf-ipfs.com'
];

/**
 * Upload policy configuration for different asset types.
 * Defines MIME allowlist, size limits, dimension constraints, and path validation.
 */
export const UPLOAD_POLICIES = {
  'dao-image': {
    allowedMimes: ['image/png', 'image/jpeg', 'image/webp'],
    maxBytes: 5 * 1024 * 1024, // 5MB
    maxDimensionPixels: 4000,
    minDimensionPixels: 128,
    requiresSquare: true,
    description: 'DAO identity image (PNG, JPEG, or WebP)'
  },
  'artwork-directory': {
    allowedMimes: ['image/png', 'image/jpeg', 'image/webp'],
    maxBytesPerFile: 2 * 1024 * 1024, // 2MB per file
    maxTotalBytes: 100 * 1024 * 1024, // 100MB total
    maxDimensionPixels: 4000,
    minDimensionPixels: 64,
    requiresSquare: true,
    maxFilesPerDirectory: 1000,
    description: 'Token artwork directory (PNG, JPEG, or WebP)'
  }
} as const;

export type UploadType = keyof typeof UPLOAD_POLICIES;

/**
 * Validates that an upload type is supported.
 */
export function isValidUploadType(type: unknown): type is UploadType {
  return typeof type === 'string' && type in UPLOAD_POLICIES;
}

/**
 * Upload authorization record.
 * Created server-side and returned to browser for direct upload.
 */
export interface UploadAuthorization {
  uploadId: string;
  signedUrl: string;
  expiresAt: Date;
  uploadType: UploadType;
  expectedMimes: string[];
  maxBytes: number;
}

/**
 * Resolved upload result after server-side completion verification.
 */
export interface UploadResult {
  cid: string;
  ipfsUri: string;
  gatewayUrl: string;
  mimeType: string;
  sizeBytes: number;
  filename: string;
}

/**
 * Converts an IPFS CID to both canonical and gateway URL forms.
 */
export function cidToUrls(cid: string, preferredGatewayHost?: string): { ipfsUri: string; gatewayUrl: string } {
  const ipfsUri = `ipfs://${cid}`;

  // Use provided gateway or first in fallback list
  const gatewayHost = preferredGatewayHost || IPFS_GATEWAY_HOSTS[0];
  const gatewayUrl = `https://${gatewayHost}/ipfs/${cid}`;

  return { ipfsUri, gatewayUrl };
}

/**
 * Normalizes a bare CID or ipfs:// CID entered by a user.
 * The resolved gateway is still checked by the caller before it is accepted.
 */
export function normalizeIpfsCid(value: string): string | null {
  const trimmed = value.trim();
  const cid = trimmed.startsWith('ipfs://') ? trimmed.slice('ipfs://'.length) : trimmed;

  if (cid.length < 10 || cid.length > 128 || !/^[a-zA-Z0-9]+$/.test(cid)) {
    return null;
  }

  return cid;
}

/**
 * Gets the preferred IPFS gateway host.
 * Falls back to hardcoded list if environment variable is not set.
 */
export function getPreferredGatewayHost(): string {
  const envHost = process.env.NEXT_PUBLIC_PINATA_GATEWAY;
  if (envHost && IPFS_GATEWAY_HOSTS.includes(envHost)) {
    return envHost;
  }

  // Also try the first entry even if not in the hardcoded list
  // (in case user has a custom gateway)
  if (envHost) {
    return envHost;
  }

  return IPFS_GATEWAY_HOSTS[0];
}

/**
 * Validates image dimensions and aspect ratio.
 */
export function validateImageDimensions(
  width: number,
  height: number,
  policy: (typeof UPLOAD_POLICIES)[UploadType]
): { valid: boolean; error?: string } {
  if (width < policy.minDimensionPixels || height < policy.minDimensionPixels) {
    return {
      valid: false,
      error: `Image dimensions must be at least ${policy.minDimensionPixels}x${policy.minDimensionPixels}`
    };
  }

  if (width > policy.maxDimensionPixels || height > policy.maxDimensionPixels) {
    return {
      valid: false,
      error: `Image dimensions cannot exceed ${policy.maxDimensionPixels}x${policy.maxDimensionPixels}`
    };
  }

  if (policy.requiresSquare && width !== height) {
    return {
      valid: false,
      error: `Image must be square (width: ${width}px, height: ${height}px)`
    };
  }

  return { valid: true };
}

/**
 * Validates MIME type against policy.
 */
export function validateMimeType(mimeType: string, uploadType: UploadType): { valid: boolean; error?: string } {
  const policy = UPLOAD_POLICIES[uploadType];
  if (uploadType === 'artwork-directory' && mimeType === 'directory') {
    return { valid: true };
  }
  const allowedMimes: readonly string[] = 'allowedMimes' in policy ? policy.allowedMimes : [];

  if (!allowedMimes.includes(mimeType)) {
    return {
      valid: false,
      error: `Invalid file type. Allowed: ${allowedMimes.join(', ')}. Received: ${mimeType}`
    };
  }

  return { valid: true };
}

/**
 * Validates file size against policy.
 */
export function validateFileSize(sizeBytes: number, uploadType: UploadType): { valid: boolean; error?: string } {
  const policy = UPLOAD_POLICIES[uploadType];

  if (uploadType === 'artwork-directory' && 'maxTotalBytes' in policy && sizeBytes > policy.maxTotalBytes) {
    const maxMB = Math.round(policy.maxTotalBytes / 1024 / 1024);
    return {
      valid: false,
      error: `Directory exceeds maximum size of ${maxMB}MB`
    };
  }

  // Check per-file limit
  if ('maxBytesPerFile' in policy && sizeBytes > policy.maxBytesPerFile) {
    const maxMB = Math.round(policy.maxBytesPerFile / 1024 / 1024);
    return {
      valid: false,
      error: `File exceeds maximum size of ${maxMB}MB`
    };
  }

  // Check single-file limit (for DAO image)
  if ('maxBytes' in policy && sizeBytes > policy.maxBytes) {
    const maxMB = Math.round(policy.maxBytes / 1024 / 1024);
    return {
      valid: false,
      error: `File exceeds maximum size of ${maxMB}MB`
    };
  }

  return { valid: true };
}

/**
 * Validates a complete upload against policy.
 */
export function validateUpload(
  uploadType: UploadType,
  mimeType: string,
  sizeBytes: number,
  width?: number,
  height?: number
): { valid: boolean; error?: string } {
  // Validate MIME type
  const mimeValidation = validateMimeType(mimeType, uploadType);
  if (!mimeValidation.valid) {
    return mimeValidation;
  }

  // Validate file size
  const sizeValidation = validateFileSize(sizeBytes, uploadType);
  if (!sizeValidation.valid) {
    return sizeValidation;
  }

  // Validate dimensions if provided
  if (width !== undefined && height !== undefined) {
    const policy = UPLOAD_POLICIES[uploadType];
    const dimensionValidation = validateImageDimensions(width, height, policy);
    if (!dimensionValidation.valid) {
      return dimensionValidation;
    }
  }

  return { valid: true };
}

/**
 * Schema for upload completion verification.
 * Server-side validation of upload metadata.
 */
export const UploadCompletionSchema = z.object({
  uploadId: z.string(),
  cid: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().positive(),
  uploadType: z.enum(['dao-image', 'artwork-directory'])
});

export type UploadCompletion = z.infer<typeof UploadCompletionSchema>;

/**
 * Validates upload completion data.
 * Ensures the uploaded content matches the authorization.
 */
export function validateUploadCompletion(
  completion: unknown,
  authorization: UploadAuthorization
): { valid: boolean; error?: string } {
  const parseResult = UploadCompletionSchema.safeParse(completion);
  if (!parseResult.success) {
    return {
      valid: false,
      error: `Invalid upload completion data: ${parseResult.error.message}`
    };
  }

  const data = parseResult.data;

  // Verify upload ID matches
  if (data.uploadId !== authorization.uploadId) {
    return {
      valid: false,
      error: 'Upload ID mismatch'
    };
  }

  // Verify upload type matches
  if (data.uploadType !== authorization.uploadType) {
    return {
      valid: false,
      error: 'Upload type mismatch'
    };
  }

  // Verify MIME type matches one of the authorized formats
  if (!authorization.expectedMimes.includes(data.mimeType)) {
    return {
      valid: false,
      error: `MIME type mismatch. Expected one of ${authorization.expectedMimes.join(', ')}, got ${data.mimeType}`
    };
  }

  // Verify size is within limits
  if (data.sizeBytes > authorization.maxBytes) {
    return {
      valid: false,
      error: `File size exceeds authorized limit of ${authorization.maxBytes} bytes`
    };
  }

  return { valid: true };
}

/**
 * Generates a unique upload ID for tracking authorization and completion.
 */
export function generateUploadId(): string {
  return `upload-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Creates an upload authorization that will be given to the browser.
 * The signed URL is a single-use, expiring authorization from Pinata.
 */
export function createUploadAuthorization(
  uploadType: UploadType,
  signedUrl: string,
  expirationSeconds: number = 3600
): UploadAuthorization {
  const policy = UPLOAD_POLICIES[uploadType];
  const expectedMimes = 'allowedMimes' in policy ? Array.from(policy.allowedMimes) : ['image/png'];
  const maxBytes = 'maxBytes' in policy ? policy.maxBytes : policy.maxBytesPerFile;

  return {
    uploadId: generateUploadId(),
    signedUrl,
    expiresAt: new Date(Date.now() + expirationSeconds * 1000),
    uploadType,
    expectedMimes,
    maxBytes
  };
}
