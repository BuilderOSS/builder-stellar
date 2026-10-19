import { NextResponse } from 'next/server';

import { initialAllocations } from '@/lib/member-directory/initial-allocations';
import { memberPagination } from '@/lib/member-directory/validation';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ daoId: string }> }) {
  const headers = { 'Cache-Control': 'no-store' };
  let page;
  try {
    page = memberPagination(new URL(request.url).searchParams);
  } catch (error) {
    return NextResponse.json({ message: (error as Error).message }, { status: 400, headers });
  }
  try {
    return NextResponse.json(await initialAllocations((await params).daoId, page), { headers });
  } catch {
    return NextResponse.json({ message: 'Initial allocations could not be read.' }, { status: 503, headers });
  }
}
