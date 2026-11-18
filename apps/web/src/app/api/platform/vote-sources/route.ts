import { NextResponse } from 'next/server';

import { indexedVoteSources } from '@/lib/platform/indexed';

export const dynamic = 'force-dynamic';

/** Vote sources the Manager approved for new tribes, as indexed (public chain data). */
export async function GET() {
  try {
    return NextResponse.json({ sources: await indexedVoteSources() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Vote source lookup failed:', error);
    return NextResponse.json(
      { message: 'The vote source index is unavailable right now.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
