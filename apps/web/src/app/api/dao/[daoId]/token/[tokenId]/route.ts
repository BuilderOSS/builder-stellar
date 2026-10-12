import { Client as TokenClient } from '@builder-stellar/token-bindings';
import { NextResponse } from 'next/server';

import { decodeTokenUri } from '@/lib/chain-reads/token-json';
import { getDaoNetworkConfigById, readSource } from '@/lib/dao-config';
import { cached } from '@/lib/server-cache';
import { parseTokenId } from '@/lib/token-id';

export const dynamic = 'force-dynamic';

/**
 * HTTPS JSON for clients that do not read `data:` URIs: exactly the document the
 * token's on-chain `token_uri()` returns (docs/STORAGE_DIET.md § 8).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ daoId: string; tokenId: string }> }) {
  try {
    const { daoId, tokenId } = await params;
    const id = parseTokenId(tokenId);
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
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Invalid token request' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
