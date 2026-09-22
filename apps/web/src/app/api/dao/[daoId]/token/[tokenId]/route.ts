import { NextResponse } from 'next/server';

import { getDaoNetworkConfigById } from '@/lib/dao-config';
import { resolveOnchainTokenMetadata } from '@/lib/onchain-token-metadata';

export const dynamic = 'force-dynamic';

function parseTokenId(value: string) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('Invalid token id');
  }

  return parsed;
}

export async function GET(request: Request, { params }: { params: Promise<{ daoId: string; tokenId: string }> }) {
  try {
    const { daoId, tokenId } = await params;
    const resolvedTokenId = parseTokenId(tokenId);
    const config = await getDaoNetworkConfigById(daoId);
    const baseUrl = new URL(request.url).origin;
    const metadata = await resolveOnchainTokenMetadata(
      config,
      resolvedTokenId,
      `${baseUrl}/api/render/${daoId}/${resolvedTokenId}`
    );
    return NextResponse.json(metadata, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
      }
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Invalid token request' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
