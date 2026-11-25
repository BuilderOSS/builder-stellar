import { type NextRequest, NextResponse } from 'next/server';

import type { NetworkName } from '@/config/networks';
import { buildContentSecurityPolicy, createNonce, cspMode } from '@/lib/content-security-policy';

/**
 * Gives every page response a fresh script nonce and its Content-Security-Policy.
 *
 * Next reads the nonce from the request's `content-security-policy` header and puts it on its own
 * scripts; the root layout reads `x-nonce` for the theme boot script. With CSP_MODE=enforce the
 * policy is enforced; otherwise it is report-only, and next.config.mjs enforces the baseline (no
 * framing, no plugins). This response sets one CSP header only: Next copies a middleware's
 * response headers onto the request, so a second, nonce-free one would hide the nonce from Next.
 * API routes and static files get their headers from next.config.mjs instead.
 */
export function middleware(request: NextRequest) {
  const nonce = createNonce();
  const mode = cspMode(process.env.CSP_MODE);
  const network = (process.env.NEXT_PUBLIC_NETWORK || 'testnet') as NetworkName;
  const policy = buildContentSecurityPolicy({
    nonce,
    network,
    dev: process.env.NODE_ENV === 'development',
    walletConnect: Boolean(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim()) && network !== 'local',
    upgradeInsecureRequests: mode === 'enforce' && request.nextUrl.protocol === 'https:'
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(mode === 'enforce' ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only', policy);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: not API routes, build assets, public files or generated images.
      source:
        '/((?!api/|_next/static|_next/image|images/|assets/|samples/|pwa-icons/|favicon\\.ico|icon\\.svg|apple-icon|manifest\\.webmanifest|.*opengraph-image).*)',
      // Prefetches return no HTML of their own.
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' }
      ]
    }
  ]
};
