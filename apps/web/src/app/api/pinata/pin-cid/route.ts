import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { AuthError, authErrorResponse } from '@/lib/auth/server';
import { getPinataService, PinataError } from '@/lib/pinata-service';
import { verifyPinToken } from '@/lib/pinata-upload-auth';
import { limitUploads, requireUploadAccount, UploadAccessError, uploadAccessErrorResponse } from '@/lib/upload-access';
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
 * Pins a CID to Pinata for redundancy. This is called asynchronously
 * after a successful directory upload to ensure content is replicated.
 *
 * Request body:
 * {
 *   cid: string (IPFS content identifier)
 *   name?: string (optional name for the pin)
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

    const session = await requireUploadAccount();
    const limited = limitUploads('pin-cid', session.address);
    if (limited) return limited;

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

    const { cid, name, pinToken } = validationResult.data;
    if (!verifyPinToken(pinToken, session.address)) {
      return NextResponse.json(
        { error: 'This pin was not authorized for this account. Upload the folder again.', code: 'PIN_NOT_AUTHORIZED' },
        { status: 403 }
      );
    }

    // Pin CID to IPFS for redundancy
    const pinataService = getPinataService();
    await pinataService.pinCidToIPFS(cid, name);

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
