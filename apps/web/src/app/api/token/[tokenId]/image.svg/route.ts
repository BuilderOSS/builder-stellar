import { TOKEN_NAME, TOKEN_SYMBOL } from '@/lib/token-config';
import { buildTokenImageSvg } from '@/lib/token-metadata';

export const dynamic = 'force-dynamic';

function parseTokenId(value: string) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('Invalid token id');
  }

  return parsed;
}

export async function GET(_request: Request, { params }: { params: Promise<{ tokenId: string }> }) {
  try {
    const { tokenId } = await params;
    const resolvedTokenId = parseTokenId(tokenId);
    return new Response(buildTokenImageSvg(resolvedTokenId), {
      headers: {
        'Cache-Control': 'no-store',
        'X-Token-Name': TOKEN_NAME,
        'X-Token-Symbol': TOKEN_SYMBOL,
        'Content-Type': 'image/svg+xml; charset=utf-8'
      }
    });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : 'Invalid token request', {
      status: 400,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8'
      }
    });
  }
}
