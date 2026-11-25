import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { limitApiRequest } from '@/lib/api-rate-limit';
import { AuthError, getAuthOrigin, requireAuthenticatedSession } from '@/lib/auth/server';
import { RestoreRequiredError, restoreResponseBody } from '@/lib/restore-required';
import { holderActionSchema, HolderError, prepareHolderAction } from '@/lib/token-holder/actions';

export async function POST(request: Request, { params }: { params: Promise<{ daoId: string }> }) {
  // Each preparation simulates a transaction on RPC.
  const limited = await limitApiRequest(request, 'prepare');
  if (limited) return limited;
  const headers = { 'Cache-Control': 'private, no-store' };
  try {
    if (request.headers.get('origin') !== getAuthOrigin(request))
      throw new HolderError('Cross-origin requests are not allowed.', 403);
    const actor = await requireAuthenticatedSession();
    const text = await request.text();
    if (text.length > 2048) throw new HolderError('Request is too large.', 413);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new HolderError('Invalid JSON request.', 400);
    }
    const action = holderActionSchema.parse(body);
    return NextResponse.json(await prepareHolderAction((await params).daoId, actor, action), { headers });
  } catch (error) {
    if (error instanceof RestoreRequiredError)
      return NextResponse.json(restoreResponseBody(error), {
        status: error.status,
        headers: { 'Cache-Control': 'private, no-store' }
      });
    const status =
      error instanceof AuthError
        ? 401
        : error instanceof HolderError
          ? error.status
          : error instanceof ZodError
            ? 400
            : 422;
    const message =
      error instanceof AuthError || error instanceof HolderError
        ? error.message
        : error instanceof ZodError
          ? 'Check the action, address, token ID and expiry ledger.'
          : 'Simulation could not complete. Check ownership, network and XLM for fees, then try again. Nothing was signed or submitted.';
    // Anything else is an unexpected simulation or RPC failure: its detail stays in the log.
    if (status === 422) console.error('[api:holder-prepare]', error);
    return NextResponse.json({ message }, { status, headers });
  }
}
