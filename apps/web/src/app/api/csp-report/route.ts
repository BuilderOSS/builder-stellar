import { limitApiRequest } from '@/lib/api-rate-limit';

export const dynamic = 'force-dynamic';

/** Reports larger than this are dropped unread. */
const MAX_REPORT_BYTES = 16 * 1024;

type Violation = {
  directive: string;
  blocked: string;
  page: string;
};

/** Origin and path only: a blocked URL's query string can carry tokens or addresses. */
function trimUrl(value: unknown): string {
  if (typeof value !== 'string' || !value) return '';
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`.slice(0, 200);
  } catch {
    // Keywords such as "inline" or "eval".
    return value.slice(0, 40);
  }
}

/** The body as text, or null once it passes MAX_REPORT_BYTES (read no further). */
async function readSmallBody(request: Request): Promise<string | null> {
  if (Number(request.headers.get('content-length')) > MAX_REPORT_BYTES || !request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_REPORT_BYTES) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/** Both report formats: `report-uri` (`csp-report`) and the Reporting API (`body`). */
function violations(payload: unknown): Violation[] {
  const items = Array.isArray(payload) ? payload : [payload];
  return items.slice(0, 10).flatMap((item) => {
    const report = (item as { 'csp-report'?: Record<string, unknown>; body?: Record<string, unknown> } | null)?.[
      'csp-report'
    ];
    const body = report ?? (item as { body?: Record<string, unknown> } | null)?.body;
    if (!body || typeof body !== 'object') return [];
    return [
      {
        directive: String(body['effective-directive'] ?? body.effectiveDirective ?? body['violated-directive'] ?? '')
          .split(' ')[0]
          .slice(0, 40),
        blocked: trimUrl(body['blocked-uri'] ?? body.blockedURL),
        page: trimUrl(body['document-uri'] ?? body.documentURL)
      }
    ];
  });
}

/**
 * Content-Security-Policy violation reports from browsers. They are logged on the server
 * (`[csp-report]`) so the report-only policy can be checked before it is enforced; nothing is
 * stored. Anyone can post here, so reports are size-capped, rate limited and trimmed.
 */
export async function POST(request: Request) {
  const limited = await limitApiRequest(request, 'csp-report');
  if (limited) return limited;
  const text = await readSmallBody(request);
  if (text !== null) {
    try {
      for (const violation of violations(JSON.parse(text))) console.warn('[csp-report]', violation);
    } catch {
      // Not JSON: nothing to log.
    }
  }
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
