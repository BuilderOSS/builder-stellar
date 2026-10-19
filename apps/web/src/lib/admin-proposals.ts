'use client';

import type { DaoNetworkConfig } from '@/lib/dao-config';

export function treasuryIsAdmin(config: DaoNetworkConfig, admin: string | null | undefined) {
  return Boolean(config.treasuryContractId && admin === config.treasuryContractId);
}
