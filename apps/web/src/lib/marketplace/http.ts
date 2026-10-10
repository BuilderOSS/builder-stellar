import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { AuthError, getAuthOrigin, requireAuthenticatedSession } from '@/lib/auth/server';
import { getDeploymentConfig } from '@/lib/deployment-config';

import { marketplaceErrorMessage } from './errors';
import { MarketplaceError } from './query';

export function marketplaceResponse(body: unknown) {
  return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } });
}
export function marketplaceFailure(error: unknown) {
  if (error instanceof AuthError || error instanceof MarketplaceError || error instanceof ZodError) {
    const status = error instanceof AuthError ? 401 : error instanceof ZodError ? 400 : error.status;
    return NextResponse.json(
      { message: error instanceof ZodError ? 'Invalid marketplace request.' : error.message },
      { status }
    );
  }
  console.error('[marketplace]', error);
  return NextResponse.json({ message: 'Marketplace data is unavailable. Please retry.' }, { status: 503 });
}
export function marketplaceTradeFailure(error: unknown) {
  if (error instanceof AuthError || error instanceof MarketplaceError || error instanceof ZodError)
    return marketplaceFailure(error);
  console.error('[marketplace preparation]', error);
  return NextResponse.json({ message: marketplaceErrorMessage(error) }, { status: 422 });
}
export async function marketplaceActor() {
  const actor = await requireAuthenticatedSession();
  if (actor.network !== getDeploymentConfig().name)
    throw new MarketplaceError('Authenticate on this deployment network.', 401);
  return actor;
}
export function marketplaceSameOrigin(request: Request) {
  if (request.headers.get('origin') !== getAuthOrigin(request))
    throw new MarketplaceError('Cross-origin marketplace requests are not allowed.', 403);
}
