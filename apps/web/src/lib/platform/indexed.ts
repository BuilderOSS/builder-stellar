import { DEPLOYMENT_ID } from '@/config/deployments.generated';
import { prisma } from '@/lib/prisma';

/** One registered implementation as indexed; the page re-checks its revoked state on chain. */
export type IndexedImplementation = {
  name: string;
  version: string;
  hash: string;
  publishedLedger: number | null;
  revoked: boolean;
  /** Modules of this deployment's tribes that run this hash now. */
  usedBy: number;
};

/** What the per-tribe storage check needs, without the profile or settings. */
export type PlatformTribe = {
  daoId: string;
  name: string;
  slug: string | null;
  status: 'pending' | 'operational';
  contracts: {
    token: string;
    metadata: string;
    governor: string;
    treasury: string;
    auction: string;
    marketplace: string;
    claims: string;
  };
};

/**
 * The registry and what runs it. The chain cannot list registered implementations (the Manager
 * has no enumeration), so the list comes from `manager.implementations`, and usage from
 * `manager.module_versions`, both for this deployment only.
 */
export async function indexedRegistry(): Promise<{
  implementations: IndexedImplementation[];
  runningHashes: string[];
}> {
  const [rows, modules] = await Promise.all([
    prisma.managerImplementation.findMany({
      where: { deploymentId: DEPLOYMENT_ID },
      orderBy: [{ eventLedger: 'asc' }, { eventId: 'asc' }]
    }),
    prisma.managerModuleVersion.findMany({
      where: { deploymentId: DEPLOYMENT_ID },
      select: { currentHash: true }
    })
  ]);
  const usage = new Map<string, number>();
  for (const { currentHash } of modules) {
    if (currentHash) usage.set(currentHash, (usage.get(currentHash) ?? 0) + 1);
  }
  const implementations = rows.flatMap((row) =>
    row.name && row.version && row.wasmHash
      ? [
          {
            name: row.name,
            version: row.version,
            hash: row.wasmHash,
            publishedLedger: row.publishedLedger === null ? null : Number(row.publishedLedger),
            revoked: row.revoked,
            usedBy: usage.get(row.wasmHash) ?? 0
          }
        ]
      : []
  );
  return { implementations, runningHashes: [...usage.keys()] };
}

/** Every tribe of this deployment, newest first, with the contracts its storage check reads. */
export async function indexedTribes(): Promise<PlatformTribe[]> {
  const rows = await prisma.managerDao.findMany({
    where: { deploymentId: DEPLOYMENT_ID },
    orderBy: { createdLedger: 'desc' }
  });
  return rows.map((row) => ({
    daoId: row.daoId,
    name: row.tokenName || row.slug || row.daoId,
    slug: row.claimedSlug ?? null,
    status: row.status === 'operational' ? 'operational' : 'pending',
    contracts: {
      token: row.tokenAddress,
      metadata: row.metadataContract ?? '',
      governor: row.governorContract,
      treasury: row.treasuryContract ?? '',
      auction: row.auctionContract ?? '',
      marketplace: row.marketplaceContract ?? '',
      claims: row.claimsContract ?? ''
    }
  }));
}
