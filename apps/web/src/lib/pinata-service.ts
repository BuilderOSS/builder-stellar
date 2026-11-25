import { cidToUrls, getPreferredGatewayHost, UPLOAD_POLICIES, UploadType } from './pinata-upload';

/**
 * Custom error classes for Pinata operations
 */
export class PinataError extends Error {
  constructor(
    message: string,
    public code?: string,
    public status?: number
  ) {
    super(message);
    this.name = 'PinataError';
  }
}

export class InvalidRequestError extends PinataError {
  constructor(message: string) {
    super(message, 'INVALID_REQUEST', 400);
    this.name = 'InvalidRequestError';
  }
}

export class AuthenticationError extends PinataError {
  constructor(message: string = 'Authentication failed') {
    super(message, 'AUTH_FAILED', 401);
    this.name = 'AuthenticationError';
  }
}

export class RateLimitError extends PinataError {
  constructor(public retryAfter: number = 60) {
    super(`Rate limit exceeded. Retry after ${retryAfter}s`, 'RATE_LIMITED', 429);
    this.name = 'RateLimitError';
  }
}

export class NotFoundError extends PinataError {
  constructor(message: string = 'Resource not found') {
    super(message, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

export class BackendFailedError extends PinataError {
  constructor(message: string = 'Pinata service error') {
    super(message, 'BACKEND_FAILED', 500);
    this.name = 'BackendFailedError';
  }
}

/**
 * Folder upload keys. Pinata has no expiry for API keys and publishes no cap on how many an
 * account holds, so each key this app creates is single-use and named with its deadline
 * (`tribes-folder-upload-<epoch seconds>`). The browser gives the upload two minutes; a key
 * still unrevoked after UPLOAD_KEY_TTL_MS is revoked by the sweep.
 */
export const UPLOAD_KEY_PREFIX = 'tribes-folder-upload-';
export const UPLOAD_KEY_TTL_MS = 15 * 60 * 1000;
/** Pages of Pinata's key list one sweep reads, and keys it revokes, at most. */
export const UPLOAD_KEY_SWEEP_PAGE_LIMIT = 5;
export const UPLOAD_KEY_SWEEP_REVOKE_LIMIT = 50;
const PINATA_KEY_CALL_TIMEOUT_MS = 10_000;
const UPLOAD_KEY_NAME = /^tribes-folder-upload-(\d{1,12})$/;

export type UploadKey = { jwt: string; keyId: string; expiresAt: Date };

export function uploadKeyName(expiresAt: Date): string {
  return `${UPLOAD_KEY_PREFIX}${Math.ceil(expiresAt.getTime() / 1000)}`;
}

/** The deadline (epoch milliseconds) in an upload key's name, or null for any other name. */
export function uploadKeyDeadline(name: unknown): number | null {
  const match = typeof name === 'string' ? UPLOAD_KEY_NAME.exec(name) : null;
  return match ? Number(match[1]) * 1000 : null;
}

/**
 * Pinata API service for file uploads and IPFS pinning
 */
export class PinataService {
  private jwt: string;
  private apiUrl = 'https://api.pinata.cloud';
  private uploadUrl = 'https://uploads.pinata.cloud';

  constructor() {
    const jwt = process.env.PINATA_JWT;
    if (!jwt) {
      throw new Error('PINATA_JWT environment variable is required');
    }
    this.jwt = jwt;
  }

  /**
   * Creates a signed upload URL from Pinata for direct browser uploads
   * The URL expires after 30 minutes
   */
  async createSignedUploadUrl(uploadType: UploadType): Promise<string> {
    try {
      // Single files (images, a claim list) get their own type and size; only the artwork folder is a
      // directory. A claim list fell through to `directory`, so Pinata refused its JSON (BUG-CAP-3).
      const uploadPolicy =
        uploadType === 'dao-image' || uploadType === 'markdown-image' || uploadType === 'claim-list'
          ? {
              max_file_size: UPLOAD_POLICIES[uploadType].maxBytes,
              allow_mime_types: [...UPLOAD_POLICIES[uploadType].allowedMimes]
            }
          : {
              max_file_size: 100 * 1024 * 1024,
              allow_mime_types: ['directory']
            };

      const response = await fetch(`${this.uploadUrl}/v3/files/sign`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.jwt}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          expires: 30,
          date: Math.floor(Date.now() / 1000),
          ...uploadPolicy
        })
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        this.handleApiError(response.status, error);
      }

      const data = await response.json();
      const signedUrl = data.data?.signedUrl ?? data.data;
      if (typeof signedUrl !== 'string' || !signedUrl) {
        throw new BackendFailedError('Signed URL not returned from Pinata');
      }

      return signedUrl;
    } catch (error) {
      if (error instanceof PinataError) throw error;
      throw new BackendFailedError(error instanceof Error ? error.message : 'Failed to create signed upload URL');
    }
  }

  /**
   * The operator's own public file with this CID: Pinata's v3 file list, filtered by CID.
   * It only reads, so a client-chosen CID is never pinned at the operator's cost; an upload
   * through a signed URL or an upload key is already pinned in this account. Throws
   * NotFoundError when the account holds no file with this CID.
   */
  async verifyCid(cid: string): Promise<{ size: number; name?: string }> {
    try {
      const url = new URL(`${this.apiUrl}/v3/files/public`);
      url.searchParams.set('cid', cid);
      url.searchParams.set('limit', '10');
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${this.jwt}` },
        signal: AbortSignal.timeout(15_000)
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        this.handleApiError(response.status, error);
      }

      const body = (await response.json()) as {
        data?: { files?: { cid?: unknown; size?: unknown; name?: unknown }[] };
      };
      const file = body.data?.files?.find((entry) => entry?.cid === cid);
      if (!file) throw new NotFoundError(`CID ${cid} is not an upload in this account`);
      const size = Number(file.size);
      return {
        size: Number.isFinite(size) && size >= 0 ? size : 0,
        ...(typeof file.name === 'string' ? { name: file.name } : {})
      };
    } catch (error) {
      if (error instanceof PinataError) throw error;
      throw new BackendFailedError(error instanceof Error ? error.message : 'Failed to verify CID');
    }
  }

  /**
   * Creates a Pinata key for one folder upload to the legacy `pinFileToIPFS` endpoint: that
   * endpoint only, one use (`maxUses: 1`). Pinata keys have no expiry, so the key's deadline
   * (UPLOAD_KEY_TTL_MS from now) is in its name, and `revokeExpiredUploadKeys` revokes it once
   * the deadline passes; `pin-cid` revokes it sooner, when it confirms the upload.
   */
  async generateUploadKey(now = Date.now()): Promise<UploadKey> {
    const expiresAt = new Date(now + UPLOAD_KEY_TTL_MS);
    try {
      const response = await fetch(`${this.apiUrl}/users/generateApiKey`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.jwt}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          keyName: uploadKeyName(expiresAt),
          maxUses: 1, // Single use only
          permissions: {
            endpoints: {
              pinning: {
                pinFileToIPFS: true,
                // All other endpoints disabled for security
                pinByHash: false,
                pinJSONToIPFS: false,
                pinJobs: false,
                unpin: false,
                userPinnedDataTotal: false
              }
            }
          }
        })
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        this.handleApiError(response.status, error);
      }

      const data = (await response.json()) as { JWT?: unknown; pinata_api_key?: unknown };
      if (typeof data.JWT !== 'string' || !data.JWT) {
        throw new BackendFailedError('JWT not returned from Pinata');
      }
      if (typeof data.pinata_api_key !== 'string' || !data.pinata_api_key) {
        throw new BackendFailedError('Key ID not returned from Pinata');
      }

      return { jwt: data.JWT, keyId: data.pinata_api_key, expiresAt };
    } catch (error) {
      if (error instanceof PinataError) throw error;
      throw new BackendFailedError(error instanceof Error ? error.message : 'Failed to generate upload JWT');
    }
  }

  /** Revokes one Pinata key by its ID (`pinata_api_key`). */
  async revokeUploadKey(keyId: string): Promise<void> {
    try {
      const response = await fetch(`${this.apiUrl}/users/revokeApiKey`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${this.jwt}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ apiKey: keyId }),
        signal: AbortSignal.timeout(PINATA_KEY_CALL_TIMEOUT_MS)
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        this.handleApiError(response.status, error);
      }
    } catch (error) {
      if (error instanceof PinataError) throw error;
      throw new BackendFailedError(error instanceof Error ? error.message : 'Failed to revoke upload key');
    }
  }

  /**
   * Revokes this app's upload keys whose deadline has passed: the keys of uploads that never
   * reached `pin-cid`. Reads Pinata's key list by name, a few pages at most, and revokes at most
   * UPLOAD_KEY_SWEEP_REVOKE_LIMIT keys per call; a later call takes the rest. Keys with any
   * other name are never touched. Returns how many keys it revoked.
   */
  async revokeExpiredUploadKeys(now = Date.now()): Promise<number> {
    const seen = new Set<string>();
    let revoked = 0;
    let offset = 0;
    for (let page = 0; page < UPLOAD_KEY_SWEEP_PAGE_LIMIT; page += 1) {
      const url = new URL(`${this.apiUrl}/v3/api_keys`);
      url.searchParams.set('name', UPLOAD_KEY_PREFIX);
      url.searchParams.set('revoked', 'false');
      if (offset) url.searchParams.set('offset', String(offset));
      let keys: unknown[];
      try {
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${this.jwt}` },
          signal: AbortSignal.timeout(PINATA_KEY_CALL_TIMEOUT_MS)
        });
        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          this.handleApiError(response.status, error);
        }
        const body = (await response.json()) as { keys?: unknown; data?: { keys?: unknown } };
        const listed = body.keys ?? body.data?.keys;
        keys = Array.isArray(listed) ? listed : [];
      } catch (error) {
        if (error instanceof PinataError) throw error;
        throw new BackendFailedError(error instanceof Error ? error.message : 'Failed to list upload keys');
      }

      let unseen = 0;
      for (const entry of keys) {
        const { key, name, revoked: isRevoked } = (entry ?? {}) as { key?: unknown; name?: unknown; revoked?: unknown };
        if (typeof key !== 'string' || !key || seen.has(key)) continue;
        seen.add(key);
        unseen += 1;
        const deadline = uploadKeyDeadline(name);
        if (isRevoked === true || deadline === null || deadline > now) continue;
        await this.revokeUploadKey(key);
        revoked += 1;
        if (revoked >= UPLOAD_KEY_SWEEP_REVOKE_LIMIT) return revoked;
      }
      // An empty page, or one with only keys already seen, is the end of the list.
      if (!unseen) break;
      offset += keys.length;
    }
    return revoked;
  }

  /**
   * Gets the gateway URL for a CID, respecting the preferred gateway host
   */
  getCidGatewayUrl(cid: string): string {
    const { gatewayUrl } = cidToUrls(cid, getPreferredGatewayHost());
    return gatewayUrl;
  }

  /**
   * Handles API errors and throws appropriate error types
   */
  private handleApiError(status: number, errorData: any): never {
    const message = errorData?.error?.message || errorData?.message || 'Unknown error';

    if (status === 401 || status === 403) {
      throw new AuthenticationError(message);
    }

    if (status === 429) {
      const retryAfter = parseInt((errorData?.retryAfter || errorData?.['retry-after'] || '60') as string, 10) || 60;
      throw new RateLimitError(retryAfter);
    }

    if (status === 400) {
      throw new InvalidRequestError(message);
    }

    if (status === 404) {
      throw new NotFoundError(message);
    }

    if (status >= 500) {
      throw new BackendFailedError(message);
    }

    throw new PinataError(message, `HTTP_${status}`, status);
  }
}

/**
 * Singleton instance of PinataService
 */
let pinataServiceInstance: PinataService | null = null;

/**
 * Gets or creates the Pinata service instance
 */
export function getPinataService(): PinataService {
  if (!pinataServiceInstance) {
    pinataServiceInstance = new PinataService();
  }
  return pinataServiceInstance;
}

/**
 * For testing purposes: reset the service instance
 */
export function resetPinataService(): void {
  pinataServiceInstance = null;
}
