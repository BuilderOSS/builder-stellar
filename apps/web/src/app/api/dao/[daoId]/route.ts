import { NextResponse } from 'next/server';

import { internalErrorResponse } from '@/lib/api-error';
import { getDaoConfigFromDatabase, isDaoNotFound } from '@/lib/dao-db';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ daoId: string }> }) {
  const { daoId } = await params;

  try {
    const config = await getDaoConfigFromDatabase(daoId);

    return NextResponse.json(
      {
        daoId: config.dao_id,
        status: config.status,
        indexedAt: config.indexed_at
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    if (isDaoNotFound(error))
      return NextResponse.json(
        { message: 'Tribe not found.' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      );
    return internalErrorResponse('dao', error, { message: 'Tribe details are unavailable. Try again.' });
  }
}
