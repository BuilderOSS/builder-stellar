import type { TokenMember } from '@prisma/client';

import { DEPLOYMENT_ID } from '@/config/deployments.generated';
import { getDaoNetworkConfigById } from '@/lib/dao-config';
import { prisma } from '@/lib/prisma';

import type { DirectoryMember, DirectoryPage, DirectoryProfile, OwnedToken } from './types';
import { holderTokenId, memberAddress } from './validation';

export async function directoryScope(daoId: string) {
  const config = await getDaoNetworkConfigById(daoId);
  if (!DEPLOYMENT_ID || !config.tokenContractId) throw new Error('DAO scope unavailable.');
  return { deploymentId: DEPLOYMENT_ID, daoId: config.tokenContractId, config };
}
function mapMember(row: TokenMember): DirectoryMember {
  return {
    address: row.address,
    owned_token_count: row.ownedTokenCount.toString(),
    voting_power: row.votingPower.toString(),
    delegated_to: row.delegatedTo,
    last_activity_ledger: row.lastActivityLedger === null ? null : Number(row.lastActivityLedger)
  };
}
export async function directoryMembers(
  daoId: string,
  page: { limit: number; offset: number }
): Promise<DirectoryPage<DirectoryMember>> {
  const { deploymentId, daoId: token } = await directoryScope(daoId);
  const where = { deploymentId, daoId: token, contractId: token };
  const [rows, total] = await Promise.all([
    prisma.tokenMember.findMany({
      where,
      orderBy: [{ votingPower: 'desc' }, { address: 'asc' }],
      take: page.limit,
      skip: page.offset
    }),
    prisma.tokenMember.count({ where })
  ]);
  return {
    deploymentId,
    daoId: token,
    items: rows.map(mapMember),
    total,
    ...page,
    hasMore: page.offset + rows.length < total,
    generatedAt: new Date().toISOString()
  };
}
export async function directoryMember(daoId: string, input: string): Promise<DirectoryProfile> {
  const address = memberAddress(input);
  const { deploymentId, daoId: token } = await directoryScope(daoId);
  const row = await prisma.tokenMember.findFirst({ where: { deploymentId, daoId: token, contractId: token, address } });
  return { deploymentId, daoId: token, item: row ? mapMember(row) : null };
}
export async function directoryTokens(
  daoId: string,
  page: { limit: number; offset: number },
  input?: string
): Promise<DirectoryPage<OwnedToken> & { totalSupply: string; votingSupply: string | null }> {
  const owner = input === undefined ? undefined : memberAddress(input);
  const { deploymentId, daoId: token } = await directoryScope(daoId);
  const where = { deploymentId, daoId: token, contractId: token, ...(owner ? { owner } : {}) };
  const [rows, total, supply, supplyRow] = await Promise.all([
    prisma.tokenInventory.findMany({ where, orderBy: { tokenId: 'desc' }, take: page.limit, skip: page.offset }),
    prisma.tokenInventory.count({ where }),
    prisma.tokenInventory.count({ where: { deploymentId, daoId: token, contractId: token } }),
    // Minted vs voting: tokens held by the Treasury, Auction and Marketplace carry no votes.
    prisma.tokenSupply.findFirst({ where: { deploymentId, daoId: token } })
  ]);
  return {
    deploymentId,
    daoId: token,
    items: rows.map((row) => ({
      tokenId: holderTokenId(row.tokenId.toString()),
      owner: row.owner,
      ledger: Number(row.eventLedger),
      timestamp: row.eventAt ? Math.floor(row.eventAt.getTime() / 1000) : 0,
      txHash: row.transactionHash,
      contractId: row.contractId
    })),
    total,
    totalSupply: String(supply),
    votingSupply: supplyRow ? supplyRow.votingSupply.toString() : null,
    ...page,
    hasMore: page.offset + rows.length < total,
    generatedAt: new Date().toISOString()
  };
}
