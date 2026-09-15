import { NextResponse } from 'next/server';

import { TOKEN_DESCRIPTION, TOKEN_NAME, TOKEN_SYMBOL } from '@/lib/token-config';
import { buildTokenMetadata } from '@/lib/token-metadata';

export const dynamic = 'force-dynamic';

function parseTokenId(value: string) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('Invalid token id');
  }

  return parsed;
}

export async function GET(_request: Request, { params }: { params: Promise<{ tokenId: string }> }) {
  try {
    const { tokenId } = await params;
    const resolvedTokenId = parseTokenId(tokenId);
    const baseUrl = new URL(_request.url).origin;
    return NextResponse.json(buildTokenMetadata(resolvedTokenId, baseUrl), {
      headers: {
        'Cache-Control': 'no-store',
        'X-Token-Name': TOKEN_NAME,
        'X-Token-Symbol': TOKEN_SYMBOL,
        'X-Token-Description': TOKEN_DESCRIPTION
      }
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Invalid token request' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
