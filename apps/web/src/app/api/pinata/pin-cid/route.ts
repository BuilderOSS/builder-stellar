import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { AuthError, authErrorResponse } from '@/lib/auth/server';
import { getPinataService, PinataError } from '@/lib/pinata-service';
import { verifyPinToken } from '@/lib/pinata-upload-auth';
import { requireUploadAccount, UploadAccessError, uploadAccessErrorResponse } from '@/lib/upload-access';
import { uploadsDisabledResponse } from '@/lib/uploads-disabled-response';
import { uploadsEnabled } from '@/lib/uploads-enabled';

/**
 * Request validation schema
 */
const PinCidRequestSchema = z.object({
  cid: z.string().min(1).max(128),
  name: z.string().max(128).optional(),
  /** From the generate-jwt call whose key uploaded this directory. */
  pinToken: z.string().min(1).max(512)
});

type _PinCidRequest = z.infer<typeof PinCidRequestSchema>;

/**
 * POST /api/pinata/pin-cid
 *
 * Confirms a directory upload: the CID must be a file in the operator's Pinata account, which
 * the upload key pinned. It reads only; it never pins the CID it is given. The name is kept
 * for older clients and ignored.
 *
 * Request body:
 * {
 *   cid: string (IPFS content identifier)
 *   name?: string (ignored)
 *   pinToken: string (returned by /api/pinata/generate-jwt to this account)
 * }
 *
 * Response:
 * {
 *   success: boolean
 *   cid: string
 * }
 *
 * Error responses:
 * - 401: Unauthenticated
 * - 403: Unfunded account, or no valid pin token for this account
 * - 422: Invalid input
 * - 429: Too many pins from this account
 * - 500: Service error
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown> = {};

  try {
    // The deployment's upload switch covers directory uploads too.
    if (!uploadsEnabled()) return uploadsDisabledResponse();

    const session = await requireUploadAccount('pin-cid');

    // Parse and validate request body
    body = await request.json().catch(() => ({}));

    const validationResult = PinCidRequestSchema.safeParse(body);
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

    const { cid, pinToken } = validationResult.data;
    if (!verifyPinToken(pinToken, session.address)) {
      return NextResponse.json(
        { error: 'This pin was not authorized for this account. Upload the folder again.', code: 'PIN_NOT_AUTHORIZED' },
        { status: 403 }
      );
    }

    // The upload key pinned the folder already: confirm it is in the operator's account (a read,
    // never a pin of a client-chosen CID).
    const pinataService = getPinataService();
    await pinataService.verifyCid(cid);

    return NextResponse.json(
      {
        success: true,
        cid
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

    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON in request body', code: 'JSON_PARSE_ERROR' }, { status: 422 });
    }

    if (error instanceof PinataError) {
      console.error('[/api/pinata/pin-cid] Pinata service error:', {
        cid: (error as any).cid,
        code: error.code,
        message: error.message,
        status: error.status
      });
      return NextResponse.json(
        {
          error: error.message || 'Failed to pin content to IPFS',
          code: error.code || 'SERVICE_ERROR',
          status: error.status
        },
        { status: error.status || 500 }
      );
    }

    console.error('[/api/pinata/pin-cid] Unexpected error:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      cid: body.cid
    });

    return NextResponse.json(
      {
        error: 'Failed to pin content. Please try again later.',
        code: 'INTERNAL_SERVER_ERROR',
        retryable: true
      },
      { status: 500 }
    );
  }
}
