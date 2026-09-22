import { NextResponse } from 'next/server';

import { getDaoConfigFromDatabase } from '@/lib/dao-db';

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
    const message = error instanceof Error ? error.message : 'DAO lookup unavailable';
    const status = message.startsWith('DAO not found:') ? 404 : 503;

    return NextResponse.json({ message }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
