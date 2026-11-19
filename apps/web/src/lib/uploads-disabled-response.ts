import { NextResponse } from 'next/server';

/** The response every upload route gives while uploads are off (lib/uploads-enabled.ts). */
export function uploadsDisabledResponse() {
  return NextResponse.json({ error: 'File uploads are not enabled', code: 'FEATURE_DISABLED' }, { status: 404 });
}
