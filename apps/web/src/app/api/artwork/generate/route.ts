import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  generateDaoImageCandidates,
  GenerateDaoImageInputSchema,
} from '@/lib/ai-image-generation';
import { AuthError, requireAuthenticatedSession, authErrorResponse } from '@/lib/auth/server';

/**
 * Simple in-memory rate limiter for MVP
 * TODO: Replace with Redis-backed distributed rate limiter
 */
const generationLimiter = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(
  key: string,
  maxPerHour: number = 3,
  maxConcurrent: number = 1
): { allowed: boolean; reason?: string } {
  const now = Date.now();
  const limit = generationLimiter.get(key);

  if (!limit || limit.resetAt < now) {
    // Reset window
    generationLimiter.set(key, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return { allowed: true };
  }

  if (limit.count >= maxPerHour) {
    return {
      allowed: false,
      reason: `Rate limit exceeded. Maximum ${maxPerHour} requests per hour.`,
    };
  }

  limit.count++;
  return { allowed: true };
}

/**
 * Simple CSRF token validation
 * In production, consider using a proper CSRF library
 */
function validateCsrfToken(request: NextRequest): boolean {
  // Get CSRF token from header
  const csrfToken = request.headers.get('x-csrf-token');

  // Verify it's a same-origin request
  const origin = request.headers.get('origin');
  const requestUrl = new URL(request.url);

  if (origin && new URL(origin).origin !== requestUrl.origin) {
    return false;
  }

  // For MVP, just require the token header to be present
  // TODO: Implement proper stateful CSRF token validation
  return !!csrfToken;
}

/**
 * POST /api/artwork/generate
 *
 * Generates DAO identity image candidates using AI.
 *
 * Request body:
 * {
 *   name: string (1-100 chars)
 *   description: string (1-500 chars)
 *   artDirection?: string (max 600 chars)
 *   stylePreset?: 'modern' | 'vintage' | 'abstract' | 'minimal' | 'vibrant'
 * }
 *
 * Response:
 * {
 *   candidates: [
 *     {
 *       id: string
 *       temporaryUrl: string
 *       expiresAt: ISO8601 timestamp
 *       model: string
 *       revisedPrompt?: string
 *     }
 *   ]
 * }
 *
 * Error responses:
 * - 401: Unauthenticated
 * - 403: CSRF validation failed
 * - 404: Feature disabled
 * - 422: Invalid input or rate limit exceeded
 * - 500: Generation service error
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Check if feature is enabled
    if (process.env.NEXT_PUBLIC_IMAGE_GENERATION_ENABLED !== 'true') {
      return NextResponse.json(
        { error: 'Image generation is not enabled', code: 'FEATURE_DISABLED' },
        { status: 404 }
      );
    }

    // Validate CSRF token
    if (!validateCsrfToken(request)) {
      return NextResponse.json(
        { error: 'CSRF validation failed', code: 'CSRF_INVALID' },
        { status: 403 }
      );
    }

    // Check authentication
    const session = await requireAuthenticatedSession();

    // Apply rate limiting
    // Limit by both wallet address and IP
    const clientIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const rateLimitKey = `gen:${session.address}:${clientIp}`;
    const rateLimit = checkRateLimit(rateLimitKey);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: rateLimit.reason, code: 'RATE_LIMIT_EXCEEDED' },
        { status: 429 }
      );
    }

    // Parse and validate request body
    const body = await request.json().catch(() => ({}));

    const validationResult = GenerateDaoImageInputSchema.safeParse(body);
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

    const input = validationResult.data;

    // Generate candidates
    const candidates = await generateDaoImageCandidates(input);

    return NextResponse.json(
      {
        candidates: candidates.map((c) => ({
          id: c.id,
          temporaryUrl: c.temporaryUrl,
          expiresAt: c.expiresAt.toISOString(),
          model: c.model,
          revisedPrompt: c.revisedPrompt,
        })),
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

    // Log error server-side only
    console.error('[/api/artwork/generate]', error);

    return NextResponse.json(
      {
        error: 'Image generation failed. Please try again later.',
        code: 'GENERATION_ERROR',
      },
      { status: 500 }
    );
  }
}
