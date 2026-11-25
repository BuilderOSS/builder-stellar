import { Client as TokenClient } from '@builder-stellar/token-bindings';
import { NextResponse } from 'next/server';

import { internalErrorResponse } from '@/lib/api-error';
import { decodeTokenUri } from '@/lib/chain-reads/token-json';
import { getDaoNetworkConfigById, readSource } from '@/lib/dao-config';
import { isDaoNotFound } from '@/lib/dao-db';
import { cached } from '@/lib/server-cache';
import { parseTokenId } from '@/lib/token-id';

export const dynamic = 'force-dynamic';

/**
 * HTTPS JSON for clients that do not read `data:` URIs: exactly the document the
 * token's on-chain `token_uri()` returns (docs/STORAGE_DIET.md § 8).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ daoId: string; tokenId: string }> }) {
  const { daoId, tokenId } = await params;
  let id: number;
  try {
    id = parseTokenId(tokenId);
  } catch {
    return NextResponse.json(
      { message: 'Invalid token ID.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  try {
    const config = await getDaoNetworkConfigById(daoId);
    const json = await cached(`token-json:${config.tokenContractId}:${id}`, 5 * 60_000, async () => {
      const token = new TokenClient({
        contractId: config.tokenContractId,
        rpcUrl: config.rpcUrl,
        networkPassphrase: config.passphrase,
        publicKey: readSource(config.launchAdmin),
        allowHttp: config.rpcUrl.startsWith('http://')
      });
      return decodeTokenUri((await token.token_uri({ token_id: id })).result);
    });
    return NextResponse.json(json, {
      headers: { 'Cache-Control': 'public, max-age=60, s-maxage=3600, stale-while-revalidate=86400' }
    });
  } catch (error) {
    if (isDaoNotFound(error))
      return NextResponse.json(
        { message: 'Tribe not found.' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      );
    return internalErrorResponse('token-json', error, { message: 'Token details are unavailable. Try again.' });
  }
}
