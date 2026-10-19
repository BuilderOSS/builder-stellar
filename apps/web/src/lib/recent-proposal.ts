import { DEPLOYMENT_ID } from '@/config/deployments.generated';

const prefix = (daoId: string, proposalId: string) => `recent-proposal:${DEPLOYMENT_ID}:${daoId}:${proposalId}`;
const memory = new Map<string, number>();
const MAX_WAIT = 5 * 60_000;

/** Mark only a confirmed submission; indexing can follow confirmation. */
export function markRecentProposal(daoId: string, proposalId: string) {
  const key = prefix(daoId, proposalId);
  const now = Date.now();
  memory.set(key, now);
  try {
    sessionStorage.setItem(key, String(now));
  } catch {
    /* Memory still covers navigation. */
  }
}

export function isRecentProposal(daoId: string, proposalId: string) {
  const key = prefix(daoId, proposalId);
  let at = memory.get(key) ?? 0;
  try {
    at = at || Number(sessionStorage.getItem(key));
  } catch {
    /* Storage is optional. */
  }
  return at > 0 && Date.now() - at < MAX_WAIT;
}
