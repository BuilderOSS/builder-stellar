import { NextResponse } from 'next/server';

import { directoryMember, directoryMembers } from '@/lib/member-directory/query';
import { memberAddress, memberPagination, memberSort } from '@/lib/member-directory/validation';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ daoId: string }> }) {
  const url = new URL(request.url);
  const { daoId } = await params;
  const headers = { 'Cache-Control': 'no-store' };
  let page;
  let order: 'asc' | 'desc';
  let address: string | undefined;
  try {
    page = memberPagination(url.searchParams);
    order = memberSort(url.searchParams);
    if (url.searchParams.has('address')) address = memberAddress(url.searchParams.get('address')!);
  } catch (error) {
    return NextResponse.json({ message: (error as Error).message }, { status: 400, headers });
  }
  try {
    return NextResponse.json(
      address ? await directoryMember(daoId, address) : await directoryMembers(daoId, page, order),
      {
        headers
      }
    );
  } catch {
    return NextResponse.json({ message: 'Member data is unavailable. Try again.' }, { status: 503, headers });
  }
}
