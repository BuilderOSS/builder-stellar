import { NextResponse } from 'next/server';

import { internalErrorResponse } from '@/lib/api-error';
import { directoryTokens } from '@/lib/member-directory/query';
import { memberAddress, memberPagination } from '@/lib/member-directory/validation';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ daoId: string }> }) {
  const url = new URL(request.url);
  const { daoId } = await params;
  const headers = { 'Cache-Control': 'no-store' };
  let page;
  let owner: string | undefined;
  try {
    page = memberPagination(url.searchParams);
    if (url.searchParams.has('owner')) owner = memberAddress(url.searchParams.get('owner')!);
  } catch (error) {
    return NextResponse.json({ message: (error as Error).message }, { status: 400, headers });
  }
  try {
    return NextResponse.json(await directoryTokens(daoId, page, owner), { headers });
  } catch (error) {
    return internalErrorResponse(
      'tokens',
      error,
      { message: 'Token inventory is unavailable. Try again.' },
      { headers }
    );
  }
}
