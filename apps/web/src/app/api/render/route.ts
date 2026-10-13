import { StrKey } from '@stellar/stellar-sdk';
import { NextResponse } from 'next/server';

import { GET as renderToken } from './[daoId]/[tokenId]/route';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * The image URL the on-chain token JSON points to:
 * `<renderer_base>?contract=<token address>&token=<id>` (docs/STORAGE_DIET.md § 5).
 * Only the contract and token come from the query; layers are derived from chain.
 */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const contract = query.get('contract') ?? '';
  const token = query.get('token') ?? '';
  if (!StrKey.isValidContract(contract) || !/^\d{1,10}$/.test(token))
    return NextResponse.json(
      { message: 'Use ?contract=<token contract>&token=<token id>.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  return renderToken(request, { params: Promise.resolve({ daoId: contract, tokenId: token }) });
}
