import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthError, requireAuthenticatedSession, authErrorResponse } from '@/lib/auth/server';
import { getPinataService, PinataError } from '@/lib/pinata-service';

/**
 * Request validation schema
 */
const PinCidRequestSchema = z.object({
  cid: z.string().min(1),
  name: z.string().optional(),
});

type PinCidRequest = z.infer<typeof PinCidRequestSchema>;

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
 * - 422: Invalid input
 * - 500: Service error
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Check authentication
    const session = await requireAuthenticatedSession();

    // Parse and validate request body
    const body = await request.json().catch(() => ({}));

    const validationResult = PinCidRequestSchema.safeParse(body);
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

    const { cid, name } = validationResult.data;

    // Pin CID to IPFS for redundancy
    const pinataService = getPinataService();
    await pinataService.pinCidToIPFS(cid, name);

    return NextResponse.json(
      {
        success: true,
        cid,
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

    if (error instanceof PinataError) {
      console.error('[/api/pinata/pin-cid] Pinata service error:', {
        cid: (error as any).cid,
        code: error.code,
        message: error.message,
        status: error.status,
      });
      return NextResponse.json(
        {
          error: error.message || 'Failed to pin content to IPFS',
          code: error.code || 'SERVICE_ERROR',
          status: error.status,
        },
        { status: error.status || 500 }
      );
    }

    console.error('[/api/pinata/pin-cid] Unexpected error:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      cid: body.cid,
    });

    return NextResponse.json(
      {
        error: 'Failed to pin content. Please try again later.',
        code: 'INTERNAL_SERVER_ERROR',
        retryable: true,
      },
      { status: 500 }
    );
  }
}
