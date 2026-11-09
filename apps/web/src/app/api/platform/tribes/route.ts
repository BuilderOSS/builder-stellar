import { NextResponse } from 'next/server';

import { indexedTribes } from '@/lib/platform/indexed';

export const dynamic = 'force-dynamic';

/** Every tribe of this deployment with the contracts its storage check reads (public chain data). */
export async function GET() {
  try {
    return NextResponse.json({ tribes: await indexedTribes() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Platform tribe lookup failed:', error);
    return NextResponse.json(
      { message: 'The tribe index is unavailable right now.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
