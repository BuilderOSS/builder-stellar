import { NextResponse } from 'next/server';

import { indexedRegistry } from '@/lib/platform/indexed';

export const dynamic = 'force-dynamic';

/** The indexed implementation registry and the hashes tribes run (public chain data). */
export async function GET() {
  try {
    return NextResponse.json(await indexedRegistry(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Platform registry lookup failed:', error);
    return NextResponse.json(
      { message: 'The registry index is unavailable right now.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
