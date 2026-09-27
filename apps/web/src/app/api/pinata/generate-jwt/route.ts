import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAuthenticatedSession, authErrorResponse } from '@/lib/auth/server';
import { getPinataService, PinataError, AuthenticationError } from '@/lib/pinata-service';

/**
 * Simple in-memory rate limiter for JWT generation
 * Rate limit: 20 requests per 60 seconds per user (generous to avoid blocking legitimate use)
 */
const jwtLimiter = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(
  key: string,
  maxPerMinute: number = 20
): { allowed: boolean; reason?: string } {
  const now = Date.now();
  const limit = jwtLimiter.get(key);

  if (!limit || limit.resetAt < now) {
    // Reset window
    jwtLimiter.set(key, { count: 1, resetAt: now + 60 * 1000 });
    return { allowed: true };
  }

  if (limit.count >= maxPerMinute) {
    return {
      allowed: false,
      reason: `Rate limit exceeded. Maximum ${maxPerMinute} requests per minute.`,
    };
  }

  limit.count++;
  return { allowed: true };
}

/**
 * POST /api/pinata/generate-jwt
 *
 * Generates a single-use JWT for directory uploads to Pinata's legacy endpoint.
 * The JWT has restricted permissions (pinFileToIPFS only) and expires after one use.
 *
 * Response:
 * {
 *   jwt: string (JWT token for Pinata API)
 *   expiresAt: ISO8601 timestamp
 * }
 *
 * Error responses:
 * - 401: Unauthenticated
 * - 429: Rate limit exceeded
 * - 500: Service error
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Check authentication
    const session = await requireAuthenticatedSession();

    // Apply rate limiting
    const clientIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const rateLimitKey = `jwt:${session.address}:${clientIp}`;
    const rateLimit = checkRateLimit(rateLimitKey);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: rateLimit.reason,
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: 60,
        },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }

    // Generate JWT from Pinata service
    const pinataService = getPinataService();
    let jwt: string;
    try {
      jwt = await pinataService.generateUploadJwt();
    } catch (jwtError) {
      console.error('[/api/pinata/generate-jwt] Failed to generate JWT:', jwtError);
      if (jwtError instanceof AuthenticationError) {
        return NextResponse.json(
          {
            error: 'IPFS service authentication failed. The server may not be configured correctly.',
            code: 'SERVICE_AUTH_FAILED',
            details: process.env.NODE_ENV === 'development' ? jwtError.message : undefined,
          },
          { status: 500 }
        );
      }
      throw jwtError;
    }

    if (!jwt) {
      throw new Error('JWT generation returned empty token');
    }

    // JWT typically expires after one use or within a reasonable time window
    // Set expiry to 1 hour from now as a safety margin
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    return NextResponse.json(
      {
        jwt,
        expiresAt: expiresAt.toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return authErrorResponse(error);
    }

    if (error instanceof PinataError) {
      console.error('[/api/pinata/generate-jwt] Pinata service error:', {
        code: error.code,
        message: error.message,
        status: error.status,
      });
      return NextResponse.json(
        {
          error: error.message || 'Failed to generate upload token',
          code: error.code || 'SERVICE_ERROR',
          status: error.status,
        },
        { status: error.status || 500 }
      );
    }

    console.error('[/api/pinata/generate-jwt] Unexpected error:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      {
        error: 'Failed to generate upload token. Please try again later.',
        code: 'INTERNAL_SERVER_ERROR',
        retryable: true,
      },
      { status: 500 }
    );
  }
}
