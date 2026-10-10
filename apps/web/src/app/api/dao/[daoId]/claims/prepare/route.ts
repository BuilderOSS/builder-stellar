import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { AuthError, getAuthOrigin, requireAuthenticatedSession } from '@/lib/auth/server';
import { ClaimError } from '@/lib/minter/identity';
import { claimActionSchema, prepareClaim } from '@/lib/minter/service';

export async function POST(request: Request, { params }: { params: Promise<{ daoId: string }> }) {
  const headers = { 'Cache-Control': 'private, no-store' };
  try {
    if (request.headers.get('origin') !== getAuthOrigin(request))
      throw new ClaimError('Cross-origin requests are not allowed.', 403);
    const actor = await requireAuthenticatedSession();
    const text = await request.text();
    if (text.length > 8192) throw new ClaimError('Claim request exceeds 8 KB.', 413);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new ClaimError('Invalid JSON.', 400);
    }
    const action = claimActionSchema.parse(body);
    return NextResponse.json(await prepareClaim((await params).daoId, actor, action), { headers });
  } catch (error) {
    const status =
      error instanceof AuthError
        ? 401
        : error instanceof ClaimError
          ? error.status
          : error instanceof ZodError
            ? 400
            : 422;
    const message =
      error instanceof AuthError || error instanceof ClaimError
        ? error.message
        : error instanceof ZodError
          ? 'Invalid claim method, round, amount or proof. Recipient and contracts must not be supplied.'
          : 'Claim simulation did not pass. Check eligibility, previous claims, network and XLM for fees. Nothing was signed or submitted.';
    return NextResponse.json({ message }, { status, headers });
  }
}
