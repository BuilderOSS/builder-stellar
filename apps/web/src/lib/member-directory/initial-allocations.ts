import { prisma } from '@/lib/prisma';

import { directoryScope } from './query';

/** Historical recipients, rather than current holders. Claims may also mint before launch. */
export async function initialAllocations(daoId: string, page: { limit: number; offset: number }) {
  const { deploymentId, daoId: token } = await directoryScope(daoId);
  const rows = await prisma.$queryRaw<Array<{ address: string; amount: bigint; total: bigint }>>`
    SELECT t.to_address AS address, count(*)::bigint AS amount, count(*) OVER()::bigint AS total
    FROM token.transfers t
    JOIN manager.dao_launches l ON l.deployment_id = t.deployment_id AND l.dao_id = t.dao_id
    WHERE t.deployment_id = ${deploymentId} AND t.dao_id = ${token} AND t.contract_id = ${token}
      AND t.transfer_type = 'mint' AND t.pos < l.launched_pos AND t.to_address IS NOT NULL
    GROUP BY t.to_address
    ORDER BY amount DESC, t.to_address ASC
    LIMIT ${page.limit} OFFSET ${page.offset}
  `;
  const count =
    rows[0]?.total ??
    (
      await prisma.$queryRaw<Array<{ total: bigint }>>`
    SELECT count(DISTINCT t.to_address)::bigint AS total
    FROM token.transfers t
    JOIN manager.dao_launches l ON l.deployment_id = t.deployment_id AND l.dao_id = t.dao_id
    WHERE t.deployment_id = ${deploymentId} AND t.dao_id = ${token} AND t.contract_id = ${token}
      AND t.transfer_type = 'mint' AND t.pos < l.launched_pos AND t.to_address IS NOT NULL
  `
    )[0]?.total ??
    0n;
  const total = Number(count);
  return {
    deploymentId,
    daoId: token,
    items: rows.map((row) => ({ address: row.address, amount: row.amount.toString() })),
    total,
    hasMore: page.offset + rows.length < total,
    ...page
  };
}
