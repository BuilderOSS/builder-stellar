import { NextRequest, NextResponse } from 'next/server';

import { AuthError, authErrorResponse } from '@/lib/auth/server';
import { AuthenticationError, getPinataService, PinataError, type UploadKey } from '@/lib/pinata-service';
import { issuePinToken } from '@/lib/pinata-upload-auth';
import { sweepExpiredUploadKeys } from '@/lib/pinata-upload-keys';
import { requireUploadAccount, UploadAccessError, uploadAccessErrorResponse } from '@/lib/upload-access';
import { uploadsDisabledResponse } from '@/lib/uploads-disabled-response';
import { uploadsEnabled } from '@/lib/uploads-enabled';

/**
 * POST /api/pinata/generate-jwt
 *
 * Creates a Pinata key for one directory upload to Pinata's legacy endpoint: pinFileToIPFS
 * only, one use. pin-cid revokes it when it confirms the upload; a key whose upload never got
 * that far is revoked by the sweep after its deadline (`expiresAt`, 15 minutes).
 *
 * Response:
 * {
 *   jwt: string (JWT token for Pinata API)
 *   pinToken: string (for pin-cid; names this key so pin-cid can revoke it)
 *   expiresAt: ISO8601 timestamp (the key's deadline)
 * }
 *
 * Error responses:
 * - 401: Unauthenticated
 * - 429: Rate limit exceeded
 * - 500: Service error
 */
export async function POST(_request: NextRequest): Promise<NextResponse> {
  try {
    // The deployment's upload switch covers directory uploads too.
    if (!uploadsEnabled()) return uploadsDisabledResponse();

    // A funded account, and a few keys per account at a time: each key is a paid upload.
    const session = await requireUploadAccount('generate-jwt');

    const pinataService = getPinataService();
    // Revoke the keys abandoned uploads left behind (at most every few minutes on an instance).
    await sweepExpiredUploadKeys(pinataService);
    let key: UploadKey;
    try {
      key = await pinataService.generateUploadKey();
    } catch (jwtError) {
      console.error('[/api/pinata/generate-jwt] Failed to generate JWT:', jwtError);
      if (jwtError instanceof AuthenticationError) {
        return NextResponse.json(
          {
            error: 'IPFS service authentication failed. The server may not be configured correctly.',
            code: 'SERVICE_AUTH_FAILED',
            details: process.env.NODE_ENV === 'development' ? jwtError.message : undefined
          },
          { status: 500 }
        );
      }
      throw jwtError;
    }

    return NextResponse.json(
      {
        jwt: key.jwt,
        // pin-cid confirms the uploaded directory only with this token, for this account, and
        // revokes the key it names.
        pinToken: issuePinToken(session.address, Date.now(), key.keyId),
        expiresAt: key.expiresAt.toISOString()
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return authErrorResponse(error);
    }

    if (error instanceof UploadAccessError) {
      return uploadAccessErrorResponse(error);
    }

    if (error instanceof PinataError) {
      console.error('[/api/pinata/generate-jwt] Pinata service error:', {
        code: error.code,
        message: error.message,
        status: error.status
      });
      return NextResponse.json(
        {
          error: error.message || 'Failed to generate upload token',
          code: error.code || 'SERVICE_ERROR',
          status: error.status
        },
        { status: error.status || 500 }
      );
    }

    console.error('[/api/pinata/generate-jwt] Unexpected error:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    return NextResponse.json(
      {
        error: 'Failed to generate upload token. Please try again later.',
        code: 'INTERNAL_SERVER_ERROR',
        retryable: true
      },
      { status: 500 }
    );
  }
}
