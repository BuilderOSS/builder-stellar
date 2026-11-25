/**
 * The tribe's open claim lists from the read model (claims.lists, migration 0014): every list of its
 * ClaimMinter that has not closed or expired, and what is left on the free lists opened in Setup.
 *
 * The claims page reads the newest lists from chain; this covers every list, so a list opened in
 * Setup is found however many came after it. It is for display and for choosing a list to close:
 * the ClaimMinter itself refuses a list that has already ended.
 */
import { DEPLOYMENT_ID } from '@/config/deployments.generated';
import { prisma } from '@/lib/prisma';

import { claimScope } from './service';

/** At most this many open lists are listed; the founder supply total counts every Setup list. */
export const OPEN_CLAIM_LISTS_SHOWN = 50;

export type OpenClaimList = {
  listId: number;
  /** The launch drive (the assurance list). */
  isAssurance: boolean;
  /** Per token, in the asset's smallest unit; "0" for a free list. */
  price: string;
  asset: string;
  total: number;
  claimed: number;
  /** Unix seconds when claims stop. */
  expiresAt: number;
  /** Opened before the ClaimMinter launched. */
  openedInSetup: boolean;
};

export type OpenClaimLists = {
  deploymentId: string;
  daoId: string;
  claimsContractId: string | null;
  lists: OpenClaimList[];
  /**
   * Founder supply: tokens not yet claimed on the open lists the launch admin opened in Setup,
   * other than the launch drive (whose claims are paid at its price). They are not in the token's
   * supply yet, and the ClaimMinter can mint them until each list closes, within its allowance.
   */
  setupUnclaimed: number;
  /** How many open Setup lists hold that supply. */
  setupLists: number;
  generatedAt: string;
};

export async function openClaimLists(daoId: string, now = Math.floor(Date.now() / 1000)): Promise<OpenClaimLists> {
  const { config } = await claimScope(daoId);
  const base = {
    deploymentId: DEPLOYMENT_ID,
    daoId: config.tokenContractId,
    claimsContractId: config.claimsContractId || null,
    generatedAt: new Date().toISOString()
  };
  if (!config.claimsContractId) return { ...base, lists: [], setupUnclaimed: 0, setupLists: 0 };
  // Only the tribe's current ClaimMinter: removing a module clears its allowance, so an earlier
  // one's lists can no longer mint.
  const where = {
    deploymentId: DEPLOYMENT_ID,
    daoId: config.tokenContractId,
    contractId: config.claimsContractId,
    closed: false,
    effectiveExpiresAt: { gt: BigInt(now) }
  };
  const setupWhere = { ...where, openedInSetup: true, isAssurance: false };
  const [rows, setup] = await Promise.all([
    prisma.claimsList.findMany({ where, orderBy: { listId: 'asc' }, take: OPEN_CLAIM_LISTS_SHOWN }),
    prisma.claimsList.aggregate({ where: setupWhere, _sum: { total: true, claimed: true }, _count: true })
  ]);
  const left = (setup._sum.total ?? 0n) - (setup._sum.claimed ?? 0n);
  return {
    ...base,
    lists: rows.map((row) => ({
      listId: Number(row.listId),
      isAssurance: row.isAssurance,
      price: row.price.toFixed(0),
      asset: row.asset,
      total: Number(row.total),
      claimed: Number(row.claimed),
      expiresAt: Number(row.effectiveExpiresAt),
      openedInSetup: row.openedInSetup
    })),
    setupUnclaimed: Number(left > 0n ? left : 0n),
    setupLists: setup._count
  };
}
