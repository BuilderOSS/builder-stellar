import { type NextRequest, NextResponse } from 'next/server';

import { updateDaoStatus } from '@/lib/dao-db';

export async function POST(request: NextRequest, { params }: { params: Promise<{ daoId: string }> }) {
  try {
    const { daoId } = await params;

    if (!daoId) {
      return NextResponse.json({ error: 'DAO ID is required' }, { status: 400 });
    }

    // Update DAO status from 'pending' to 'operational'
    await updateDaoStatus(daoId, 'operational');

    return NextResponse.json({ success: true, message: 'DAO launched successfully' });
  } catch (error) {
    console.error('Error launching DAO:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to launch DAO' },
      { status: 500 }
    );
  }
}
