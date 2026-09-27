import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { AuthError, requireAuthenticatedSession, authErrorResponse } from '@/lib/auth/server';
import {
  cidToUrls,
  getPreferredGatewayHost,
  validateUploadCompletion,
  UploadCompletionSchema,
} from '@/lib/pinata-upload';
import {
  getPinataService,
  PinataError,
  NotFoundError,
  BackendFailedError,
} from '@/lib/pinata-service';
import { getAuthorization } from '@/app/api/uploads/pinata-url/route';


/**
 * POST /api/uploads/complete
 *
 * Verifies an uploaded file and returns the finalized IPFS URLs.
 *
 * Request body:
 * {
 *   uploadId: string (returned from /api/uploads/pinata-url)
 *   cid: string (IPFS content identifier)
 *   filename: string
 *   mimeType: string
 *   sizeBytes: number
 *   uploadType: 'dao-image' | 'artwork-directory'
 * }
 *
 * Response:
 * {
 *   cid: string
 *   ipfsUri: string (ipfs://...)
 *   gatewayUrl: string (https://...)
 *   mimeType: string
 *   sizeBytes: number
 *   filename: string
 * }
 *
 * Error responses:
 * - 401: Unauthenticated
 * - 404: Upload authorization not found
 * - 410: Authorization expired
 * - 422: Validation failed
 * - 500: Service error
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Check if feature is enabled
    if (process.env.NEXT_PUBLIC_PINATA_UPLOADS_ENABLED !== 'true') {
      return NextResponse.json(
        { error: 'File uploads are not enabled', code: 'FEATURE_DISABLED' },
        { status: 404 }
      );
    }

    // Check authentication
    const session = await requireAuthenticatedSession();

    // Parse and validate request body
    const body = await request.json().catch(() => ({}));

    const validationResult = UploadCompletionSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid input',
          code: 'VALIDATION_ERROR',
          details: validationResult.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
        { status: 422 }
      );
    }

    const completion = validationResult.data;

    // Look up the authorization
    const authorization = getAuthorization(completion.uploadId);

    if (!authorization) {
      console.warn(`[/api/uploads/complete] Authorization not found for upload ${completion.uploadId}`);
      return NextResponse.json(
        {
          error: 'Upload authorization not found. Your upload session may have expired. Please try again.',
          code: 'AUTHORIZATION_NOT_FOUND',
        },
        { status: 404 }
      );
    }

    // Verify authorization hasn't expired
    if (authorization.expiresAt < new Date()) {
      console.warn(`[/api/uploads/complete] Authorization expired for upload ${completion.uploadId}`);
      return NextResponse.json(
        {
          error: 'Upload authorization has expired. Your session lasted too long. Please try uploading again.',
          code: 'AUTHORIZATION_EXPIRED',
        },
        { status: 410 }
      );
    }

    // Validate completion data against authorization
    const completionValidation = validateUploadCompletion(completion, authorization);

    if (!completionValidation.valid) {
      return NextResponse.json(
        { error: completionValidation.error, code: 'VALIDATION_FAILED' },
        { status: 422 }
      );
    }

    // Verify CID with Pinata API
    // Fetch metadata from Pinata to verify:
    // - CID exists and is accessible
    // - File size is reasonable
    const pinataService = getPinataService();
    const cidMetadata = await pinataService.verifyCid(completion.cid);

    // Verify file size matches
    if (cidMetadata.size > 0 && cidMetadata.size !== completion.sizeBytes) {
      console.warn(
        `[/api/uploads/complete] Size mismatch for ${completion.cid}: expected ${completion.sizeBytes}, got ${cidMetadata.size}`
      );
      // Allow slight discrepancies (< 5%) due to encoding differences
      const sizeDiscrepancy = Math.abs(cidMetadata.size - completion.sizeBytes) / completion.sizeBytes;
      if (sizeDiscrepancy > 0.05) {
        return NextResponse.json(
          {
            error: 'Uploaded file size does not match reported size',
            code: 'SIZE_MISMATCH',
          },
          { status: 422 }
        );
      }
    }

    // Pin CID to IPFS for redundancy
    try {
      await pinataService.pinCidToIPFS(completion.cid, completion.filename);
    } catch (pinError) {
      // Log the error but don't fail the request
      // The CID is already on Pinata, pinning is just for redundancy
      console.warn('[/api/uploads/complete] Failed to pin CID to IPFS:', pinError);
    }

    // Convert CID to URLs
    const { ipfsUri, gatewayUrl } = cidToUrls(completion.cid, getPreferredGatewayHost());

    return NextResponse.json(
      {
        cid: completion.cid,
        ipfsUri,
        gatewayUrl,
        mimeType: completion.mimeType,
        sizeBytes: completion.sizeBytes,
        filename: completion.filename,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return authErrorResponse(error);
    }

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body', code: 'JSON_PARSE_ERROR' },
        { status: 422 }
      );
    }

    // Handle Pinata verification errors
    if (error instanceof NotFoundError) {
      console.warn(`[/api/uploads/complete] CID not found on IPFS: ${(error as any).cid}`);
      return NextResponse.json(
        {
          error: 'Uploaded content not found on IPFS. The upload may not have completed successfully. Please try uploading again.',
          code: 'CID_NOT_FOUND',
        },
        { status: 404 }
      );
    }

    if (error instanceof BackendFailedError) {
      console.error('[/api/uploads/complete] Backend error during verification:', {
        message: error.message,
        cid: (error as any).cid,
      });
      return NextResponse.json(
        {
          error: error.message || 'IPFS service error during verification',
          code: error.code || 'SERVICE_ERROR',
        },
        { status: error.status || 500 }
      );
    }

    if (error instanceof PinataError) {
      console.error('[/api/uploads/complete] IPFS service error:', {
        code: error.code,
        message: error.message,
        status: error.status,
        cid: (error as any).cid,
      });
      return NextResponse.json(
        {
          error: error.message || 'Failed to verify upload with IPFS',
          code: error.code || 'SERVICE_ERROR',
          status: error.status,
        },
        { status: error.status || 500 }
      );
    }

    console.error('[/api/uploads/complete] Unexpected error:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      cid: (error as any)?.cid,
    });

    return NextResponse.json(
      {
        error: 'Failed to complete upload. Please try again later.',
        code: 'INTERNAL_SERVER_ERROR',
        retryable: true,
      },
      { status: 500 }
    );
  }
}
