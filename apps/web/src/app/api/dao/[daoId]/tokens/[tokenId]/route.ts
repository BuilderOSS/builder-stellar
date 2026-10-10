import { NextResponse } from 'next/server';

import { directoryScope } from '@/lib/member-directory/query';
import { holderTokenId } from '@/lib/member-directory/validation';
import { resolveOnchainTokenMetadata } from '@/lib/onchain-token-metadata';
import { prisma } from '@/lib/prisma';
import { holderClient } from '@/lib/token-holder/actions';
import { currentTokenHolder, validHolderAddress } from '@/lib/token-holder/read';
import type { HolderDetail } from '@/lib/token-holder/types';

export const dynamic = 'force-dynamic';
export async function GET(request: Request, { params }: { params: Promise<{ daoId: string; tokenId: string }> }) {
  const headers = { 'Cache-Control': 'no-store' };
  const { daoId, tokenId: input } = await params;
  let tokenId: number;
  try {
    tokenId = holderTokenId(input);
  } catch {
    return NextResponse.json({ message: 'Invalid token ID.' }, { status: 400, headers });
  }
  try {
    const { config, deploymentId, daoId: token } = await directoryScope(daoId);
    const [indexed, live, metadata] = await Promise.allSettled([
      prisma.tokenInventory.findFirst({
        where: { deploymentId, daoId: token, contractId: token, tokenId: BigInt(tokenId) }
      }),
      currentTokenHolder(holderClient(config, config.adminAddress || config.launchAdmin), tokenId),
      resolveOnchainTokenMetadata(
        config,
        tokenId,
        `${new URL(request.url).origin}/api/render/${encodeURIComponent(daoId)}/${tokenId}`
      )
    ]);
    const indexedOwner = indexed.status === 'fulfilled' ? validHolderAddress(indexed.value?.owner) : null;
    const liveOwner = live.status === 'fulfilled' ? live.value : null;
    const body: HolderDetail = {
      deploymentId,
      daoId: token,
      tokenId,
      owner: liveOwner ?? indexedOwner,
      ownerSource: liveOwner ? 'onchain' : indexedOwner ? 'indexed' : 'unavailable',
      indexedOwner,
      metadata: metadata.status === 'fulfilled' ? metadata.value : null,
      metadataIssue: metadata.status === 'rejected' ? 'Artwork metadata is unavailable. Try refreshing.' : null
    };
    return NextResponse.json(body, { headers });
  } catch {
    return NextResponse.json({ message: 'Token details are unavailable. Try again.' }, { status: 503, headers });
  }
}
