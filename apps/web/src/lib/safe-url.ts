const SAFE_URL = /^(https?:|mailto:|ipfs:)/i;

/**
 * Only absolute web, mail and IPFS addresses survive; anything else (javascript:, data:, relative)
 * is dropped. Member-written links (Markdown, proposal links) pass through this before they reach
 * an `href` or `src`, because their author may be anyone.
 */
export function safeMarkdownUrl(url: string) {
  const trimmed = url.trim();
  return SAFE_URL.test(trimmed) ? trimmed : null;
}
