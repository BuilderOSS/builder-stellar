/**
 * On-chain comments are event-only: the contracts emit them and never store them, so the indexer
 * is the only place they live. Caps are in UTF-8 bytes and match `contracts/common/src/lib.rs`.
 */
export const MAX_PROPOSAL_COMMENT_BYTES = 8192;
export const MAX_COMMENT_BYTES = 1024;

export type CommentItem = {
  id: string;
  author: string;
  body: string;
  timestamp: number | null;
  txHash: string;
};

const encoder = new TextEncoder();

export function commentBytes(text: string) {
  return encoder.encode(text).length;
}

/**
 * Bid and listing comments are one line of plain text: line breaks fold to spaces as people type,
 * and comments made before this rule still read as one line.
 */
export function toOneLine(text: string) {
  return text.replace(/\s*[\r\n]+\s*/g, ' ');
}
