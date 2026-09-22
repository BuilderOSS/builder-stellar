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

export async function GET(request: Request, { params }: { params: Promise<{ tokenId: string }> }) {
  try {
    const { tokenId } = await params;
    const resolvedTokenId = parseTokenId(tokenId);
    const daoId = new URL(request.url).searchParams.get('daoId');
    if (!daoId) return NextResponse.json({ message: 'daoId is required' }, { status: 400 });
    const config = await getDaoNetworkConfigById(daoId);
    const baseUrl = new URL(request.url).origin;
    const metadata = await resolveOnchainTokenMetadata(
      config,
      resolvedTokenId,
      `${baseUrl}/api/render/${config.label}/${resolvedTokenId}`
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
