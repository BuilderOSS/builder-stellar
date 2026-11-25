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

/** Enforced on pages while the full policy is report-only: no framing, plugins or base-URL changes. */
export const BASELINE_CONTENT_SECURITY_POLICY =
  "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'";

/**
 * `enforce` only when CSP_MODE says exactly that; anything else keeps the page policy report-only.
 *
 * @param {string | undefined} value
 * @returns {'enforce' | 'report-only'}
 */
export function cspMode(value) {
  return value?.trim().toLowerCase() === 'enforce' ? 'enforce' : 'report-only';
}

/**
 * The header rules for next.config.mjs.
 *
 * While the page policy is report-only, the baseline is enforced from here and not from the
 * middleware: Next copies a middleware's response headers onto the request it renders, and a
 * nonce-free `Content-Security-Policy` there would hide the nonce from Next's own scripts.
 *
 * @param {{ VERCEL?: string; NODE_ENV?: string; CSP_MODE?: string }} env
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
  const rules = [
    { source: '/:path*', headers },
    { source: '/api/:path*', headers: [{ key: 'Content-Security-Policy', value: API_CONTENT_SECURITY_POLICY }] }
  ];
  if (cspMode(env.CSP_MODE) === 'report-only') {
    rules.push({
      source: '/:path((?!api/).*)',
      headers: [{ key: 'Content-Security-Policy', value: BASELINE_CONTENT_SECURITY_POLICY }]
    });
  }
  return rules;
}
