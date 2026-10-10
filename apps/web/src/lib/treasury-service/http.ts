import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { AuthError, getAuthOrigin, requireAuthenticatedSession } from '@/lib/auth/server';
import { getDeploymentConfig } from '@/lib/deployment-config';
import { MarketplaceError } from '@/lib/marketplace/query';

import { TreasuryError } from './service';

export function treasuryResponse(body: unknown) {
  return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } });
}
export function treasuryFailure(error: unknown) {
  const status =
    error instanceof AuthError
      ? 401
      : error instanceof ZodError
        ? 400
        : error instanceof TreasuryError || error instanceof MarketplaceError
          ? error.status
          : 503;
  if (status === 503) console.error('[treasury]', error);
  return NextResponse.json(
    {
      message:
        status === 503
          ? 'Treasury data or simulation is unavailable. Retry before signing.'
          : error instanceof ZodError
            ? 'Invalid treasury request.'
            : error instanceof Error
              ? error.message
              : 'Treasury unavailable.'
    },
    { status, headers: { 'Cache-Control': 'private, no-store' } }
  );
}
export async function treasuryActor() {
  const actor = await requireAuthenticatedSession();
  if (actor.network !== getDeploymentConfig().name)
    throw new TreasuryError('Authenticate on this deployment network.', 401);
  return actor;
}
export function treasurySameOrigin(request: Request) {
  if (request.headers.get('origin') !== getAuthOrigin(request))
    throw new TreasuryError('Cross-origin requests are not allowed.', 403);
}
