import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { AuthError, authErrorResponse, requireAuthenticatedSession } from '@/lib/auth/server';
import { AuthenticationError, getPinataService, PinataError, RateLimitError } from '@/lib/pinata-service';
import { createUploadAuthorization, isValidUploadType, validateFileSize, validateMimeType } from '@/lib/pinata-upload';
import { storeAuthorization } from '@/lib/pinata-upload-auth';

/**
 * Request validation schema for signed URL generation
 */
const PinataUrlRequestSchema = z.object({
  uploadType: z.enum(['dao-image', 'artwork-directory']),
  mimeType: z.string(),
  sizeBytes: z.number().int().positive(),
  filename: z.string().min(1)
});

type _PinataUrlRequest = z.infer<typeof PinataUrlRequestSchema>;

/**
 * Same-origin upload request validation.
 */
function validateCsrfToken(request: NextRequest): boolean {
  const csrfToken = request.headers.get('x-csrf-token');
  const origin = request.headers.get('origin');
  const requestUrl = new URL(request.url);

  if (origin && new URL(origin).origin !== requestUrl.origin) {
    return false;
  }

  return !!csrfToken;
}

/**
 * POST /api/uploads/pinata-url
 *
 * Generates a signed URL for direct browser upload to Pinata.
 *
 * Request body:
 * {
 *   uploadType: 'dao-image' | 'artwork-directory'
 *   mimeType: string (e.g., 'image/png')
 *   sizeBytes: number
 *   filename: string
 * }
 *
 * Response:
 * {
 *   uploadId: string (for tracking authorization)
 *   signedUrl: string (use this to upload directly to Pinata)
 *   expiresAt: ISO8601 timestamp
 *   uploadType: string
 *   expectedMimes: string[]
 *   maxBytes: number
 * }
 *
 * Error responses:
 * - 401: Unauthenticated
 * - 403: CSRF validation failed
 * - 404: Upload feature disabled
 * - 422: Invalid input or validation failed
 * - 500: Service error
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown> = {};

  try {
    // Check if feature is enabled
    if (process.env.NEXT_PUBLIC_PINATA_UPLOADS_ENABLED !== 'true') {
      return NextResponse.json({ error: 'File uploads are not enabled', code: 'FEATURE_DISABLED' }, { status: 404 });
    }

    // Validate CSRF token
    if (!validateCsrfToken(request)) {
      return NextResponse.json({ error: 'CSRF validation failed', code: 'CSRF_INVALID' }, { status: 403 });
    }

    // Check authentication
    await requireAuthenticatedSession();

    // Parse and validate request body
    body = await request.json().catch(() => ({}));

    const validationResult = PinataUrlRequestSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid input',
          code: 'VALIDATION_ERROR',
          details: validationResult.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message
          }))
        },
        { status: 422 }
      );
    }

    const data = validationResult.data;

    // Validate upload type
    if (!isValidUploadType(data.uploadType)) {
      return NextResponse.json({ error: 'Invalid upload type', code: 'INVALID_UPLOAD_TYPE' }, { status: 422 });
    }

    // Validate MIME type
    const mimeValidation = validateMimeType(data.mimeType, data.uploadType);
    if (!mimeValidation.valid) {
      return NextResponse.json({ error: mimeValidation.error, code: 'INVALID_MIME_TYPE' }, { status: 422 });
    }

    // Validate file size
    const sizeValidation = validateFileSize(data.sizeBytes, data.uploadType);
    if (!sizeValidation.valid) {
      return NextResponse.json({ error: sizeValidation.error, code: 'FILE_TOO_LARGE' }, { status: 422 });
    }

    // Generate signed URL from Pinata API
    const pinataService = getPinataService();
    const signedUrl = await pinataService.createSignedUploadUrl(data.uploadType);

    // Create authorization record (will be verified on completion)
    const authorization = createUploadAuthorization(data.uploadType, signedUrl);

    // Store authorization for verification during completion
    const uploadId = storeAuthorization(authorization.uploadId, authorization);

    return NextResponse.json(
      {
        uploadId,
        signedUrl: authorization.signedUrl,
        expiresAt: authorization.expiresAt.toISOString(),
        uploadType: authorization.uploadType,
        expectedMimes: authorization.expectedMimes,
        maxBytes: authorization.maxBytes
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return authErrorResponse(error);
    }

    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON in request body', code: 'JSON_PARSE_ERROR' }, { status: 422 });
    }

    // Handle Pinata service errors
    if (error instanceof RateLimitError) {
      console.warn('[/api/uploads/pinata-url] Rate limit exceeded for user');
      return NextResponse.json(
        {
          error: 'Too many upload requests. Please wait before trying again.',
          code: 'RATE_LIMITED',
          retryAfter: error.retryAfter
        },
        {
          status: 429,
          headers: {
            'Retry-After': error.retryAfter.toString()
          }
        }
      );
    }

    if (error instanceof AuthenticationError) {
      console.error('[/api/uploads/pinata-url] IPFS service authentication failed:', {
        message: error.message
      });
      return NextResponse.json(
        {
          error: 'IPFS service authentication failed. The server may not be configured correctly.',
          code: 'SERVICE_AUTH_FAILED',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined
        },
        { status: 500 }
      );
    }

    if (error instanceof PinataError) {
      console.error('[/api/uploads/pinata-url] IPFS service error:', {
        code: error.code,
        message: error.message,
        status: error.status,
        uploadType: body?.uploadType
      });
      return NextResponse.json(
        {
          error: error.message || 'Failed to generate upload URL',
          code: error.code || 'SERVICE_ERROR',
          status: error.status
        },
        { status: error.status || 500 }
      );
    }

    console.error('[/api/uploads/pinata-url] Unexpected error:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      uploadType: body?.uploadType
    });

    return NextResponse.json(
      {
        error: 'Failed to generate upload URL. Please try again later.',
        code: 'INTERNAL_SERVER_ERROR',
        retryable: true
      },
      { status: 500 }
    );
  }
}
