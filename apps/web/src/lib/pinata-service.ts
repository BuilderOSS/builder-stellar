import { cidToUrls, getPreferredGatewayHost, UploadType } from './pinata-upload';

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
 * Pinata API service for file uploads and IPFS pinning
 */
export class PinataService {
  private jwt: string;
  private apiUrl = 'https://api.pinata.cloud';

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
      const response = await fetch(`${this.apiUrl}/v3/files/sign`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.jwt}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          uploadType: uploadType,
          expiresIn: 1800 // 30 minutes
        })
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        this.handleApiError(response.status, error);
      }

      const data = await response.json();
      if (!data.data?.signedUrl) {
        throw new BackendFailedError('Signed URL not returned from Pinata');
      }

      return data.data.signedUrl;
    } catch (error) {
      if (error instanceof PinataError) throw error;
      throw new BackendFailedError(error instanceof Error ? error.message : 'Failed to create signed upload URL');
    }
  }

  /**
   * Verifies a CID exists on Pinata and retrieves its metadata
   */
  async verifyCid(cid: string): Promise<{ size: number; name?: string }> {
    try {
      const response = await fetch(`${this.apiUrl}/v3/files/${cid}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.jwt}`
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new NotFoundError(`CID ${cid} not found on Pinata`);
        }
        const error = await response.json().catch(() => ({}));
        this.handleApiError(response.status, error);
      }

      const data = await response.json();
      return {
        size: data.data?.size || 0,
        name: data.data?.name
      };
    } catch (error) {
      if (error instanceof PinataError) throw error;
      throw new BackendFailedError(error instanceof Error ? error.message : 'Failed to verify CID');
    }
  }

  /**
   * Pins a CID to IPFS for redundancy
   * Ensures the content is replicated across Pinata's infrastructure
   */
  async pinCidToIPFS(cid: string, name?: string): Promise<void> {
    try {
      const response = await fetch(`${this.apiUrl}/v3/pin_files/${cid}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.jwt}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          cidVersion: 1,
          name: name || cid
        })
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        this.handleApiError(response.status, error);
      }

      // Response indicates pin was added to queue or already pinned
      await response.json();
    } catch (error) {
      if (error instanceof PinataError) throw error;
      throw new BackendFailedError(error instanceof Error ? error.message : 'Failed to pin CID to IPFS');
    }
  }

  /**
   * Generates a single-use JWT for directory uploads to the legacy Pinata endpoint
   * The JWT has restricted permissions (pinFileToIPFS only) and expires after one use
   */
  async generateUploadJwt(): Promise<string> {
    try {
      const response = await fetch(`${this.apiUrl}/users/generateApiKey`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.jwt}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          keyName: 'Single Use Upload JWT',
          maxUses: 1, // Single use only
          permissions: {
            endpoints: {
              pinning: {
                pinFileToIPFS: true,
                // All other endpoints disabled for security
                pinByHash: false,
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

      const data = await response.json();
      if (!data.JWT) {
        throw new BackendFailedError('JWT not returned from Pinata');
      }

      return data.JWT;
    } catch (error) {
      if (error instanceof PinataError) throw error;
      throw new BackendFailedError(error instanceof Error ? error.message : 'Failed to generate upload JWT');
    }
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
