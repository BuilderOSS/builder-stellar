export const HSTS_VALUE: string;
export const PERMISSIONS_POLICY: string;
export const API_CONTENT_SECURITY_POLICY: string;
export const BASELINE_CONTENT_SECURITY_POLICY: string;
export function cspMode(value: string | undefined): 'enforce' | 'report-only';
export function securityHeaderRules(env?: {
  VERCEL?: string;
  NODE_ENV?: string;
  CSP_MODE?: string;
}): { source: string; headers: { key: string; value: string }[] }[];
