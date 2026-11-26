// Response headers every route sends (next.config.mjs `headers()`). Page requests also get a
// per-request Content-Security-Policy from src/middleware.ts; see docs/SECURITY_MODEL.md.

/** Two years, the value Vercel sends on every deployment. */
export const HSTS_VALUE = 'max-age=63072000';

/** Browser features the app never uses. Wallet hardware (WebUSB, WebHID) and the clipboard stay allowed. */
export const PERMISSIONS_POLICY = [
  'accelerometer=()',
  'browsing-topics=()',
  'camera=()',
  'display-capture=()',
  'geolocation=()',
  'gyroscope=()',
  'magnetometer=()',
  'microphone=()',
  'payment=()'
].join(', ');

/** API responses are data or images, never documents: they may load nothing and never be framed. */
export const API_CONTENT_SECURITY_POLICY = "default-src 'none'; frame-ancestors 'none'";

/**
 * The page policy is enforced unless CSP_MODE says exactly `report-only`, so a missing or mistyped
 * value never turns it off.
 *
 * @param {string | undefined} value
 * @returns {'enforce' | 'report-only'}
 */
export function cspMode(value) {
  return value?.trim().toLowerCase() === 'report-only' ? 'report-only' : 'enforce';
}

/**
 * The header rules for next.config.mjs.
 *
 * Pages get their Content-Security-Policy from the middleware only, in either CSP_MODE. Next reads
 * the script nonce from the request's `content-security-policy` header before the report-only one.
 * While this file also sent a nonce-free page policy (the report-only baseline), dev.tribes.build
 * served Next's scripts without the nonce, though a local `next start` did not. X-Frame-Options
 * still forbids framing.
 *
 * @param {{ VERCEL?: string; NODE_ENV?: string }} env
 * @returns {{ source: string; headers: { key: string; value: string }[] }[]}
 */
export function securityHeaderRules(env = process.env) {
  const headers = [
    // MIME sniffing could run an uploaded or proxied file as a script or a page.
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    // No page may be framed (clickjacking). The page CSP also says frame-ancestors 'none'.
    { key: 'X-Frame-Options', value: 'DENY' },
    // Other sites see only the origin, never a tribe or proposal path.
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: PERMISSIONS_POLICY }
  ];
  // Vercel already sends HSTS on every deployment; elsewhere a production build sends it itself.
  if (env.VERCEL !== '1' && env.NODE_ENV === 'production') {
    headers.push({ key: 'Strict-Transport-Security', value: HSTS_VALUE });
  }
  return [
    { source: '/:path*', headers },
    { source: '/api/:path*', headers: [{ key: 'Content-Security-Policy', value: API_CONTENT_SECURITY_POLICY }] }
  ];
}
